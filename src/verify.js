// ═══════════════════════════════════════════════════════════════════
//  بررسی هوشمند فیش پرداخت — استخراج مبلغ/تاریخ/ساعت + تشخیص دستکاری
//  موتور: بینایی ماشین رایگان (Groq) — در نبود کلید، ارجاع به پنل ادمین
// ═══════════════════════════════════════════════════════════════════

const VISION_PROMPT = (expectedToman) => `تو یک کارشناس دقیق بررسی فیش تراکنش بانکی هستی. اطلاعات فیش را فقط در قالب JSON زیر برگردان (بدون هیچ متن اضافه):
{
 "amount_toman": عدد (مبلغ به تومان؛ اگر به ریال بود تقسیم بر ۱۰ کن),
 "amount_raw": "مبلغ دقیق نوشته‌شده روی فیش",
 "gregorian_date": "تاریخ میلادی تراکنش به فرمت YYYY-MM-DD یا تهی",
 "time": "ساعت تراکنش مثل 14:30 یا تهی",
 "dest_card": "شماره کارت مقصد (۱۶ رقم، فقط رقم)",
 "dest_name": "نام صاحب کارت مقصد یا تهی",
 "bank": "نام بانک یا تهی",
 "tracking": "کد پیگیری یا تهی",
 "tampering": "اگر اثر واضح فتوشاپ/دستکاری/ناهماهنگی فونت/پیکسل می‌بینی توضیح بده، وگرنه تهی"
}
مبلغ مورد انتظار سفارش: ${expectedToman} تومان.`;

/** ارسال تصویر به مدل بینایی و گرفتن خروجی ساخت‌یافته */
async function visionAnalyze(env, imageB64, expectedToman) {
  const key = env.GROQ_API_KEY;
  if (!key) return { verdict: 'manual', reasons: ['کلید هوش مصنوعی تنظیم نشده؛ بررسی دستی لازم است.'] };
  const body = {
    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: VISION_PROMPT(expectedToman) },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageB64}` } },
        ],
      },
    ],
    temperature: 0,
    max_tokens: 600,
  };
  let res;
  try {
    res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25000),
    });
  } catch {
    return { verdict: 'manual', reasons: ['خطای شبکه در بررسی خودکار؛ بررسی دستی.'] };
  }
  if (!res.ok) return { verdict: 'manual', reasons: [`پاسخ نامعتبر سرویس بینایی (${res.status})`] };
  const data = await res.json();
  let text = data?.choices?.[0]?.message?.content || '';
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return { verdict: 'manual', reasons: ['خروجی مدل قابل پردازش نبود.'] };
  try {
    return JSON.parse(m[0]);
  } catch {
    return { verdict: 'manual', reasons: ['خطای پارس خروجی مدل.'] };
  }
}

/**
 * تحلیل فیش و صدور حکم
 * @returns {Promise<{verdict:'auto'|'manual'|'reject', reasons:string[], data:object}>}
 */
export async function analyzeReceipt(env, imageBytes, expectedToman) {
  // تبدیل بایت به بیس۶۴
  let b64 = '';
  const chunk = 0x8000;
  for (let i = 0; i < imageBytes.length; i += chunk) {
    b64 += String.fromCharCode(...imageBytes.subarray(i, i + chunk));
  }
  b64 = btoa(b64);

  const info = await visionAnalyze(env, b64, expectedToman);
  if (info.verdict === 'manual' && !info.amount_toman) {
    return { verdict: 'manual', reasons: info.reasons || ['بررسی دستی'], data: info };
  }

  const reasons = [];
  let verdict = 'auto';

  // ۱) تطبیق مبلغ (تحمل ۲٪ برای کارمزد/گردکردن)
  const amount = Number(info.amount_toman) || 0;
  const diff = Math.abs(amount - expectedToman);
  if (!amount) {
    verdict = 'manual';
    reasons.push('مبلغ فیش قابل استخراج نبود.');
  } else if (diff > expectedToman * 0.02) {
    verdict = 'reject';
    reasons.push(`مبلغ فیش (${amount}) با مبلغ سفارش (${expectedToman}) هم‌خوانی ندارد.`);
  }

  // ۲) تاریخ تراکنش — باید برای امروز/دیروز باشد
  if (info.gregorian_date) {
    const age = (Date.now() - Date.parse(info.gregorian_date)) / 86400000;
    if (age > 2) {
      if (verdict === 'auto') verdict = 'manual';
      reasons.push(`تاریخ تراکنش (${info.gregorian_date}) قدیمی به نظر می‌رسد.`);
    }
  }

  // ۳) تشخیص دستکاری
  if (info.tampering) {
    verdict = 'manual';
    reasons.push(`نشانه دستکاری: ${info.tampering}`);
  }

  // ۴) تطبیق شماره کارت مقصد
  const card = await env.DB.prepare("SELECT value FROM settings WHERE key='card_number'").first();
  const expectedCard = card?.value || '';
  if (expectedCard && info.dest_card && String(info.dest_card).replace(/\D/g, '') !== expectedCard.replace(/\D/g, '')) {
    if (verdict === 'auto') verdict = 'manual';
    reasons.push('شماره کارت مقصد با کارت فروشگاه متفاوت است.');
  }

  if (!reasons.length) reasons.push('✅ مبلغ و مشخصات فیش با سفارش تطبیق کامل دارد.');
  return { verdict, reasons, data: info };
}
