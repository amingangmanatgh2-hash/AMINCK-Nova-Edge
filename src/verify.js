// ═══════════════════════════════════════════════════════════════════
//  بررسی هوشمند فیش پرداخت — استخراج مبلغ/تاریخ/ساعت + تشخیص دستکاری
//  موتور: Workers AI بومی کلادفلر — در نبود بایندینگ، ارجاع به پنل ادمین
// ═══════════════════════════════════════════════════════════════════

import { aiVision, aiAvailable } from './ai.js';

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

/** ارسال تصویر به مدل بینایی Workers AI و گرفتن خروجی ساخت‌یافته */
async function visionAnalyze(env, imageBytes, expectedToman) {
  if (!aiAvailable(env)) {
    return { verdict: 'manual', reasons: ['هوش مصنوعی کلادفلر در دسترس نیست؛ بررسی دستی لازم است.'] };
  }
  const res = await aiVision(env, imageBytes, VISION_PROMPT(expectedToman));
  if (!res.ok) return { verdict: 'manual', reasons: ['خطا در بررسی خودکار تصویر؛ بررسی دستی لازم است.'] };
  const m = res.text.match(/\{[\s\S]*\}/);
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
  const info = await visionAnalyze(env, imageBytes, expectedToman);
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
