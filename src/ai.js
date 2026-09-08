// ═══════════════════════════════════════════════════════════════════
//  هوش مصنوعی بومی کلادفلر (Workers AI)
//  فقط بایندینگ [ai] در wrangler.toml لازم است (خودکار با دیپلوی).
//
//  🐞 علت واقعی خرابی قبلی:
//     مدل متنی «@cf/meta/llama-3.1-8b-instruct» در تاریخ ۲۰۲۶/۰۵/۳۰ توسط
//     کلادفلر Deprecated شد (مستند رسمی:
//     https://developers.cloudflare.com/workers-ai/models/llama-3.1-8b-instruct/ ).
//     در نتیجه env.AI.run استثنا می‌داد و کاربر همیشه پیام
//     «دستیار هوشمند فعلاً در دسترس نیست» می‌گرفت.
//
//  ✅ راه‌حل: زنجیرهٔ مدل‌های معتبر + تشخیص جداگانهٔ نبود binding،
//     خطای مدل، خطای سهمیه و پاسخ نامعتبر.
// ═══════════════════════════════════════════════════════════════════

/** مدل‌های متنی معتبر و غیرمنسوخ (به ترتیب اولویت) */
export const TEXT_MODELS = [
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast', // چندزبانه و قوی در فارسی
  '@cf/meta/llama-3.1-8b-instruct-fp8',       // ارزان‌تر و سریع‌تر
  '@cf/meta/llama-3.2-3b-instruct',           // سبک‌ترین fallback
];
export const TEXT_MODEL = TEXT_MODELS[0];

/** مدل‌های بینایی معتبر (به ترتیب اولویت) */
export const VISION_MODELS = [
  '@cf/meta/llama-3.2-11b-vision-instruct',
  '@cf/llava-hf/llava-1.5-7b-hf',
];
export const VISION_MODEL = VISION_MODELS[0];

/** مدل‌هایی که کلادفلر منسوخ کرده و نباید استفاده شوند */
export const DEPRECATED_MODELS = new Set([
  '@cf/meta/llama-3.1-8b-instruct',
  '@cf/meta/llama-3.1-8b-instruct-awq',
  '@cf/meta/llama-3-8b-instruct',
  '@cf/meta/llama-3-8b-instruct-awq',
  '@cf/meta/meta-llama-3-8b-instruct',
  '@cf/mistral/mistral-7b-instruct-v0.2',
  '@cf/google/gemma-7b-it',
  '@cf/google/gemma-3-12b-it',
  '@hf/nousresearch/hermes-2-pro-mistral-7b',
]);

/** کدهای خطای استاندارد لایهٔ AI */
export const AI_ERRORS = {
  BINDING_MISSING: 'binding_missing',
  MODEL_ERROR: 'model_error',
  QUOTA: 'quota_exceeded',
  INVALID_RESPONSE: 'invalid_response',
  DISABLED: 'disabled',
};

/** آیا Workers AI در دسترس است؟ */
export function aiAvailable(env) {
  return !!(env && env.AI && typeof env.AI.run === 'function');
}

/**
 * تشخیص نوع خطای برگشتی از Workers AI.
 * ⚠️ هرگز متن کامل خطا لاگ نمی‌شود تا احتمال نشت داده حذف شود.
 */
export function classifyAiError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  if (/quota|limit|neuron|too many requests|429|capacity|rate.?limit/.test(msg)) return AI_ERRORS.QUOTA;
  if (/deprecat|no such model|not found|unsupported model|invalid model|model.*(unavailable|removed)|5\d\d/.test(msg))
    return AI_ERRORS.MODEL_ERROR;
  return AI_ERRORS.MODEL_ERROR;
}

/** پیام فارسی قابل نمایش برای هر کد خطا */
export function aiErrorMessage(code) {
  switch (code) {
    case AI_ERRORS.BINDING_MISSING:
      return '🤖 سرویس هوش مصنوعی روی این ورکر فعال نیست (بایندینگ AI پیدا نشد). ادمین باید [ai] را در wrangler.toml نگه دارد و دوباره دیپلوی کند.';
    case AI_ERRORS.QUOTA:
      return '🤖 سهمیهٔ روزانهٔ هوش مصنوعی کلادفلر تمام شده است. کمی بعد دوباره تلاش کنید.';
    case AI_ERRORS.INVALID_RESPONSE:
      return '🤖 پاسخ نامعتبری از مدل دریافت شد. لطفاً سوال را دوباره و کمی واضح‌تر بپرسید.';
    case AI_ERRORS.DISABLED:
      return '🚫 چت هوش مصنوعی توسط ادمین غیرفعال شده است.';
    default:
      return '🤖 مدل هوش مصنوعی موقتاً پاسخ نداد. لطفاً چند لحظه بعد دوباره تلاش کنید.';
  }
}

/**
 * استخراج متن از فرمت‌های مختلف خروجی Workers AI.
 * فرمت‌های پشتیبانی‌شده: {response}, {result:{response}}, OpenAI-style choices,
 * رشتهٔ خام و آرایه‌ای از قطعات متنی.
 */
export function pickText(out) {
  if (out === null || out === undefined) return '';
  if (typeof out === 'string') return out;
  if (Array.isArray(out)) return out.map(pickText).filter(Boolean).join('');
  if (typeof out !== 'object') return String(out);
  if (typeof out.response === 'string') return out.response;
  if (out.response && typeof out.response === 'object') return pickText(out.response);
  if (Array.isArray(out.choices) && out.choices.length) {
    const c = out.choices[0];
    if (typeof c?.message?.content === 'string') return c.message.content;
    if (Array.isArray(c?.message?.content)) return pickText(c.message.content);
    if (typeof c?.text === 'string') return c.text;
    if (typeof c?.delta?.content === 'string') return c.delta.content;
  }
  if (typeof out.result === 'string') return out.result;
  if (out.result && typeof out.result === 'object') return pickText(out.result);
  if (typeof out.output_text === 'string') return out.output_text;
  if (Array.isArray(out.output)) return pickText(out.output);
  if (typeof out.text === 'string') return out.text;
  if (typeof out.content === 'string') return out.content;
  if (Array.isArray(out.content)) return pickText(out.content);
  if (typeof out.generated_text === 'string') return out.generated_text;
  return '';
}

/** مدل انتخابی ادمین (اگر تنظیم شده باشد) در ابتدای زنجیره قرار می‌گیرد */
export async function resolveTextModels(env) {
  let chosen = '';
  try {
    const row = await env.DB?.prepare("SELECT value FROM settings WHERE key='ai_model'").first();
    chosen = String(row?.value || '').trim();
  } catch {
    /* دیتابیس در دسترس نیست → پیش‌فرض */
  }
  if (chosen && !DEPRECATED_MODELS.has(chosen)) {
    return [chosen, ...TEXT_MODELS.filter((m) => m !== chosen)];
  }
  return [...TEXT_MODELS];
}

/**
 * چت متنی با Workers AI — با fallback خودکار روی مدل بعدی.
 * @returns {Promise<{ok:boolean, text:string, error?:string, model?:string, tried?:string[]}>}
 */
export async function aiChatComplete(env, messages, opts = {}) {
  if (!aiAvailable(env)) {
    console.warn('[ai] binding missing — [ai] binding not bound to this Worker');
    return { ok: false, text: '', error: AI_ERRORS.BINDING_MISSING, tried: [] };
  }
  const models = opts.model ? [opts.model] : await resolveTextModels(env);
  const tried = [];
  let lastError = AI_ERRORS.MODEL_ERROR;

  for (const model of models) {
    if (DEPRECATED_MODELS.has(model)) continue;
    tried.push(model);
    try {
      const out = await env.AI.run(model, {
        messages,
        max_tokens: opts.max_tokens || 600,
        temperature: opts.temperature ?? 0.7,
      });
      const text = pickText(out).trim();
      if (!text) {
        // پاسخ خالی → شاید مدل خروجی غیرمنتظره داده؛ مدل بعدی را امتحان کن
        console.warn(`[ai] empty/unparsable response from ${model}`);
        lastError = AI_ERRORS.INVALID_RESPONSE;
        continue;
      }
      return { ok: true, text, model, tried };
    } catch (e) {
      lastError = classifyAiError(e);
      // لاگ تشخیصی: فقط نام مدل و کد خطا — هیچ توکن یا داده حساسی لاگ نمی‌شود
      console.warn(`[ai] model=${model} failed code=${lastError}`);
      if (lastError === AI_ERRORS.QUOTA) break; // سهمیه تمام است؛ مدل بعدی هم جواب نمی‌دهد
    }
  }
  return { ok: false, text: '', error: lastError, tried };
}

/** تبدیل بایت‌ها به آرایه عددی مورد نیاز مدل بینایی Workers AI */
export function bytesToArray(bytes) {
  return Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
}

/**
 * تحلیل تصویر با مدل بینایی Workers AI (با fallback).
 * @returns {Promise<{ok:boolean, text:string, error?:string, model?:string}>}
 */
export async function aiVision(env, imageBytes, prompt) {
  if (!aiAvailable(env)) return { ok: false, text: '', error: AI_ERRORS.BINDING_MISSING };
  const image = bytesToArray(imageBytes);
  let lastError = AI_ERRORS.MODEL_ERROR;
  for (const model of VISION_MODELS) {
    try {
      const out = await env.AI.run(model, { image, prompt, max_tokens: 600 });
      const text = pickText(out).trim();
      if (!text) {
        lastError = AI_ERRORS.INVALID_RESPONSE;
        continue;
      }
      return { ok: true, text, model };
    } catch (e) {
      lastError = classifyAiError(e);
      console.warn(`[ai:vision] model=${model} failed code=${lastError}`);
      if (lastError === AI_ERRORS.QUOTA) break;
    }
  }
  return { ok: false, text: '', error: lastError };
}

/**
 * تست تشخیصی سلامت هوش مصنوعی — برای پنل ادمین.
 * هیچ اطلاعات حساسی برنمی‌گرداند.
 */
export async function aiDiagnostics(env) {
  const bound = aiAvailable(env);
  if (!bound) {
    return { bound: false, ok: false, error: AI_ERRORS.BINDING_MISSING, message: aiErrorMessage(AI_ERRORS.BINDING_MISSING), models: TEXT_MODELS };
  }
  const started = Date.now();
  const res = await aiChatComplete(env, [
    { role: 'system', content: 'You are a health check. Reply with the single word: OK' },
    { role: 'user', content: 'ping' },
  ], { max_tokens: 16, temperature: 0 });
  return {
    bound: true,
    ok: res.ok,
    model: res.model || null,
    tried: res.tried || [],
    ms: Date.now() - started,
    error: res.error || null,
    message: res.ok ? '✅ هوش مصنوعی پاسخ داد.' : aiErrorMessage(res.error),
    sample: res.ok ? res.text.slice(0, 120) : '',
  };
}

/** پرامپت سیستمی مشترک دستیار فروشگاه */
export const SHOP_SYSTEM_PROMPT =
  'تو دستیار هوشمند و دوستانه‌ی فروشگاه کانفیگ AMINCK هستی. ' +
  'همیشه فارسی، کوتاه، صمیمی و با ایموجی جواب بده. ' +
  'اگر سوال درباره خرید یا قیمت بود، کاربر را به منوی «🛍 فروشگاه» هدایت کن. ' +
  'اگر سوال فنی درباره اتصال بود، راهنمای گام‌به‌گام کوتاه بده. ' +
  'اگر پاسخ را نمی‌دانی یا موضوع مالی/اختلاف حساب است، بگو کاربر دکمه «🧑‍💼 اتصال به اپراتور» را بزند.';
