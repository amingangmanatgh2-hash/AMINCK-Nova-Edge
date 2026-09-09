// ═══════════════════════════════════════════════════════════════════
//  کلاینت Telegram Bot API + کیبوردسازها
// ═══════════════════════════════════════════════════════════════════

export function tgUrl(token, method) {
  return `https://api.telegram.org/bot${token}/${method}`;
}

export async function tg(token, method, payload = {}, form = null) {
  const init = form
    ? { method: 'POST', body: form }
    : {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      };
  let res;
  try {
    res = await fetch(tgUrl(token, method), init);
  } catch (e) {
    return { ok: false, network_error: String(e) };
  }
  let data = {};
  try {
    data = await res.json();
  } catch {}
  return data;
}

export const send = (token, chat_id, text, extra = {}) =>
  tg(token, 'sendMessage', {
    chat_id,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...extra,
  });

export const answerCb = (token, cbId, text = '') =>
  tg(token, 'answerCallbackQuery', { callback_query_id: cbId, text: text || undefined, show_alert: false });

export const editText = (token, chat_id, message_id, text, extra = {}) =>
  tg(token, 'editMessageText', {
    chat_id,
    message_id,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...extra,
  });

export const editKb = (token, chat_id, message_id, reply_markup) =>
  tg(token, 'editMessageReplyMarkup', { chat_id, message_id, reply_markup });

export const sendPhoto = (token, chat_id, photo, extra = {}) =>
  tg(token, 'sendPhoto', { chat_id, photo, ...extra });

export const sendDoc = (token, chat_id, document, extra = {}) =>
  tg(token, 'sendDocument', { chat_id, document, ...extra });

export const delMsg = (token, chat_id, message_id) => tg(token, 'deleteMessage', { chat_id, message_id });

// ─── کیبوردها ───
export const ikb = (rows) => ({ inline_keyboard: rows });
export const btn = (text, callback_data) => ({ text, callback_data });
export const ubtn = (text, url) => ({ text, url });

// کیبورد شیشه‌ای با دکمه بازگشت در انتها
export function menuKb(rows, back = null) {
  const r = rows.map((row) => [...row]);
  if (back) r.push([btn('🔙 بازگشت', `back:${back}`)]);
  return ikb(r);
}

export function userMainKb(isAdmin) {
  const kb = {
    keyboard: [
      [{ text: '🛍 فروشگاه' }, { text: '🎁 پروکسی و تست رایگان' }],
      [{ text: '💳 حساب من' }, { text: '👥 زیرمجموعه من' }],
      [{ text: '🎮 مینی‌اپ سکه‌ای' }, { text: '🤖 چت هوش مصنوعی' }],
      [{ text: '🧪 پست شیشه‌ای' }, { text: '🎁 باشگاه جوایز' }],
      [{ text: '📞 پشتیبانی' }, { text: '📖 راهنما' }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
  if (isAdmin) kb.keyboard.push([{ text: '📊 پنل مدیریت' }]);
  return { reply_markup: kb };
}

export const hideKb = () => ({ reply_markup: { remove_keyboard: true } });

export const forceReply = (placeholder = '') => ({
  reply_markup: { force_reply: true, selective: true, input_field_placeholder: placeholder.slice(0, 64) || undefined },
});

// ─── ست‌آپ پروفایل بات ───
export const COMMANDS = [
  { command: 'start', description: 'شروع و منوی اصلی' },
  { command: 'lang', description: '🌐 تغییر زبان / Change language' },
  { command: 'shop', description: '🛍 فروشگاه' },
  { command: 'buy', description: '🛍 خرید در گروه (همین چت)' },
  { command: 'glass', description: '🧪 پست/متن شیشه‌ای و دکمه شیشه‌ای' },
  { command: 'perks', description: '🎁 باشگاه جوایز (خراش، چک‌این، کوپن)' },
  { command: 'coupon', description: '🏷 استفاده از کد تخفیف' },
  { command: 'account', description: '💳 حساب من' },
  { command: 'subs', description: '🧩 اشتراک‌های من' },
  { command: 'ref', description: '👥 زیرمجموعه من' },
  { command: 'trial', description: '🎁 تست رایگان' },
  { command: 'ai', description: '🤖 چت هوش مصنوعی' },
  { command: 'support', description: '📞 پشتیبانی و اپراتور' },
  { command: 'help', description: '📖 راهنما' },
];

export async function setupBotProfile(token, texts, botUsername) {
  const res = {};
  res.name = await tg(token, 'setMyName', { name: texts.bot_name });
  res.desc = await tg(token, 'setMyDescription', { description: texts.bot_description });
  res.short = await tg(token, 'setMyShortDescription', { short_description: texts.bot_short });
  res.cmds = await tg(token, 'setMyCommands', { commands: COMMANDS });
  // دکمهٔ «داشبورد» در منوی پیوست تلگرام (WebApp) از menu.js تنظیم می‌شود؛
  // اینجا فقط menu_button را برای ربات برمی‌گردانیم تا لیست دستورات تمیز بماند.
  if (botUsername) res.menu = await tg(token, 'getChatMenuButton', {});
  return res;
}

export async function uploadProfilePhoto(token, photoBytes, filename = 'logo.png') {
  const form = new FormData();
  form.append('photo', new Blob([photoBytes], { type: 'image/png' }), filename);
  return tg(token, 'setUserProfilePhoto', {}, form);
}

export async function getMe(token) {
  const r = await tg(token, 'getMe');
  return r?.ok ? r.result : null;
}

export async function getChatMember(token, chatId, userId) {
  const r = await tg(token, 'getChatMember', { chat_id: chatId, user_id: userId });
  return r?.ok ? r.result : null;
}
