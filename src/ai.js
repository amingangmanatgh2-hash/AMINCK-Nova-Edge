// ═══════════════════════════════════════════════════════════════════
//  هوش مصنوعی بومی کلادفلر (Workers AI)
//  جایگزین کامل Groq — بدون نیاز به هیچ کلید خارجی
//  فقط بایندینگ [ai] در wrangler.toml لازم است (خودکار با دیپلوی).
// ═══════════════════════════════════════════════════════════════════

export const TEXT_MODEL = '@cf/meta/llama-3.1-8b-instruct';
export const VISION_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';

/** آیا Workers AI در دسترس است؟ */
export function aiAvailable(env) {
  return !!(env && env.AI && typeof env.AI.run === 'function');
}

function pickText(out) {
  if (!out) return '';
  if (typeof out === 'string') return out;
  if (typeof out.response === 'string') return out.response;
  if (Array.isArray(out.choices)) return out.choices[0]?.message?.content || '';
  if (typeof out.result === 'string') return out.result;
  return '';
}

/**
 * چت متنی با Workers AI
 * @returns {Promise<{ok:boolean, text:string, error?:string}>}
 */
export async function aiChatComplete(env, messages, opts = {}) {
  if (!aiAvailable(env)) {
    return { ok: false, text: '', error: 'binding_missing' };
  }
  try {
    const out = await env.AI.run(opts.model || TEXT_MODEL, {
      messages,
      max_tokens: opts.max_tokens || 600,
      temperature: opts.temperature ?? 0.7,
    });
    const text = pickText(out).trim();
    if (!text) return { ok: false, text: '', error: 'empty' };
    return { ok: true, text };
  } catch (e) {
    console.error('workers-ai error', e);
    return { ok: false, text: '', error: String(e) };
  }
}

/** تبدیل بایت‌ها به آرایه عددی مورد نیاز مدل بینایی Workers AI */
export function bytesToArray(bytes) {
  return Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
}

/**
 * تحلیل تصویر با مدل بینایی Workers AI
 * @returns {Promise<{ok:boolean, text:string, error?:string}>}
 */
export async function aiVision(env, imageBytes, prompt) {
  if (!aiAvailable(env)) return { ok: false, text: '', error: 'binding_missing' };
  try {
    const out = await env.AI.run(VISION_MODEL, {
      image: bytesToArray(imageBytes),
      prompt,
      max_tokens: 600,
    });
    const text = pickText(out).trim();
    if (!text) return { ok: false, text: '', error: 'empty' };
    return { ok: true, text };
  } catch (e) {
    console.error('workers-ai vision error', e);
    return { ok: false, text: '', error: String(e) };
  }
}

/** پرامپت سیستمی مشترک دستیار فروشگاه */
export const SHOP_SYSTEM_PROMPT =
  'تو دستیار هوشمند و دوستانه‌ی فروشگاه کانفیگ AMINCK هستی. ' +
  'همیشه فارسی، کوتاه، صمیمی و با ایموجی جواب بده. ' +
  'اگر سوال درباره خرید یا قیمت بود، کاربر را به منوی «🛍 فروشگاه» هدایت کن. ' +
  'اگر سوال فنی درباره اتصال بود، راهنمای گام‌به‌گام کوتاه بده. ' +
  'اگر پاسخ را نمی‌دانی یا موضوع مالی/اختلاف حساب است، بگو کاربر دکمه «🧑‍💼 اتصال به اپراتور» را بزند.';
