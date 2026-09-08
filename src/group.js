// ═══════════════════════════════════════════════════════════════════
//  فعالیت بات در گروه‌ها — خوش‌آمد، تبلیغ زمان‌بندی‌شده، ثبت خودکار
// ═══════════════════════════════════════════════════════════════════
import { send, tg, ikb, ubtn } from './tg.js';
import { getText, getSettingValue, getNum, isEnabled } from './texts.js';
import { priceLine } from './pricing.js';
import { deepLink } from './util.js';
import { faDigits, fmtDate } from './db.js';
import { aiChatComplete, SHOP_SYSTEM_PROMPT } from './ai.js';

const now = () => Math.floor(Date.now() / 1000);

/** وقتی بات به گروهی اضافه می‌شود — ثبت خودکار و اطلاع به ادمین‌ها */
export async function onBotJoinedGroup(env, chat) {
  const { DB } = env;
  await DB.prepare('INSERT OR IGNORE INTO groups (chat_id, title, enabled, created_at) VALUES (?,?,1,?)')
    .bind(chat.id, chat.title || '', now())
    .run();
  await DB.prepare('UPDATE groups SET title=? WHERE chat_id=?').bind(chat.title || '', chat.id).run();
  const admins = (await DB.prepare("SELECT id FROM users WHERE role IN ('super','admin')").all()).results;
  for (const a of admins) {
    await send(env.TELEGRAM_BOT_TOKEN, a.id, `📢 بات به گروه «${chat.title || chat.id}» اضافه و به‌صورت خودکار ثبت شد.\n🆔 <code>${chat.id}</code>\nبرای مدیریت: پنل → گروه‌ها`);
  }
  await send(
    env.TELEGRAM_BOT_TOKEN,
    chat.id,
    '⚡ سلام! من ربات فروشگاه AMINCK هستم.\n🛍 برای مشاهده محصولات به پیام‌های شخصی من مراجعه کنید.'
  );
}

/** خوش‌آمد به عضو جدید گروه */
export async function welcomeNewMember(env, chat, newMember) {
  if (!(await isEnabled(env.DB, 'group_welcome_enabled'))) return;
  const botUsername = await getSettingValue(env.DB, 'bot_username');
  const text = (await getText(env.DB, 'group_welcome'))
    .replace('{title}', chat.title || '')
    .replace('{name}', newMember.first_name || '');
  const kb = ikb([[ubtn('🛍 مشاهده فروشگاه در پیوی', deepLink(botUsername, 'shop_home'))]]);
  await send(env.TELEGRAM_BOT_TOKEN, chat.id, text, { reply_markup: kb });
}

/** ساخت محتوای پست تبلیغاتی */
async function buildAdPayload(env) {
  const { DB } = env;
  const adText = await getText(DB, 'ad_text');
  const photoUrl = await getSettingValue(DB, 'ad_photo_url');
  const rate = await priceLine(env);
  const botUsername = await getSettingValue(DB, 'bot_username');
  const productId = await getSettingValue(DB, 'ad_product_id');
  let product = null;
  if (productId) {
    product = await DB.prepare('SELECT * FROM products WHERE id=?').bind(Number(productId)).first();
  }
  if (!product) {
    product = await DB.prepare("SELECT * FROM products WHERE enabled=1 AND category!='coin' ORDER BY sort ASC, price_usd ASC LIMIT 1").first();
  }
  const caption = `${adText}\n\n${rate}` + (product ? `\n\n🔥 پیشنهاد ویژه: <b>${product.title}</b>` : '');
  const link = product ? deepLink(botUsername, `shop_${product.id}`) : deepLink(botUsername, 'shop_home');
  const kb = ikb([[ubtn('🛒 خرید در پیوی', link)]]);
  return { caption, photoUrl, kb, product };
}

export { buildAdPayload };

/** پست فوری در یک گروه */
export async function postAdToGroup(env, chatId) {
  const { DB } = env;
  const { caption, photoUrl, kb } = await buildAdPayload(env);
  let res;
  if (photoUrl) {
    res = await tg(env.TELEGRAM_BOT_TOKEN, 'sendPhoto', { chat_id: chatId, photo: photoUrl, caption, parse_mode: 'HTML', reply_markup: kb });
  } else {
    res = await send(env.TELEGRAM_BOT_TOKEN, chatId, caption, { reply_markup: kb });
  }
  if (res?.ok !== false) {
    await DB.prepare('UPDATE groups SET last_post=? WHERE chat_id=?').bind(now(), chatId).run();
    return true;
  }
  return false;
}

/** پست فوری در همه گروه‌ها */
export async function postAdsNow(env) {
  const groups = (await env.DB.prepare('SELECT chat_id FROM groups WHERE enabled=1').all()).results;
  let n = 0;
  for (const g of groups) {
    if (await postAdToGroup(env, g.chat_id)) n++;
  }
  return n;
}

/** اجرای زمان‌بندی تبلیغات — توسط کرون هر ۱۵ دقیقه صدا زده می‌شود */
export async function runAdScheduler(env) {
  const { DB } = env;
  const intervalH = await getNum(DB, 'ad_interval_hours', 12);
  const groups = (await DB.prepare('SELECT * FROM groups WHERE enabled=1').all()).results;
  for (const g of groups) {
    if (now() - (g.last_post || 0) >= intervalH * 3600) {
      await postAdToGroup(env, g.chat_id);
      await new Promise((r) => setTimeout(r, 1200));
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
//  چت هوش مصنوعی داخل گروه‌ها
//  فعال‌سازی: ریپلای روی پیام بات، منشن @bot، یا شروع پیام با «ربات»
//  محدودیت ضدهرزنامه: حداکثر یک پاسخ در هر N ثانیه برای هر گروه
// ═══════════════════════════════════════════════════════════════════

/** آیا پیام گروه خطاب به بات است؟ متن خالص سوال برمی‌گردد یا null */
export function extractGroupQuestion(msg, botUsername) {
  const raw = (msg.text || msg.caption || '').trim();
  if (!raw || raw.length < 2) return null;
  if (raw.startsWith('/')) {
    const m = raw.match(/^\/(ai|ask|bot)(?:@\w+)?\s+([\s\S]+)/i);
    return m ? m[2].trim() : null;
  }
  // پیام‌های خیلی کوتاه (استیکر/ایموجی تنها) را نادیده بگیر
  if (raw.replace(/\s/g, '').length < 2) return null;
  const uname = (botUsername || '').replace(/^@/, '');
  if (uname && new RegExp(`@${uname}\\b`, 'i').test(raw)) {
    return raw.replace(new RegExp(`@${uname}`, 'ig'), '').trim() || null;
  }
  if (msg.reply_to_message?.from?.is_bot && uname && msg.reply_to_message.from.username === uname) {
    return raw;
  }
  if (/^(ربات|بات|هوش مصنوعی)[\s،:,]+/.test(raw)) {
    return raw.replace(/^(ربات|بات|هوش مصنوعی)[\s،:,]+/, '').trim() || null;
  }
  return null;
}

/** پاسخ هوش مصنوعی در گروه */
export async function groupAiReply(env, msg, botUsername) {
  const { DB } = env;
  if (!(await isEnabled(DB, 'group_ai_enabled'))) return false;
  const question = extractGroupQuestion(msg, botUsername);
  if (!question) return false;

  // گروه باید ثبت و فعال باشد
  const g = await DB.prepare('SELECT * FROM groups WHERE chat_id=?').bind(msg.chat.id).first();
  if (g && !g.enabled) return false;
  if (!g) {
    await DB.prepare('INSERT OR IGNORE INTO groups (chat_id, title, enabled, created_at) VALUES (?,?,1,?)')
      .bind(msg.chat.id, msg.chat.title || '', now())
      .run();
  }

  // ضدهرزنامه
  const cooldown = await getNum(DB, 'group_ai_cooldown', 15);
  const key = `grpai:${msg.chat.id}`;
  const last = Number((await env.KV.get(key)) || 0);
  if (now() - last < cooldown) return false;
  await env.KV.put(key, String(now()), { expirationTtl: 3600 });

  const res = await aiChatComplete(
    env,
    [
      { role: 'system', content: SHOP_SYSTEM_PROMPT + ' تو الان داخل یک گروه تلگرامی هستی؛ پاسخ‌ها را حداکثر در ۳ خط بنویس.' },
      { role: 'user', content: question.slice(0, 800) },
    ],
    { max_tokens: 320 }
  );
  if (!res.ok) return false;

  const kb = ikb([[ubtn('🛍 فروشگاه در پیوی', deepLink(botUsername, 'shop_home'))]]);
  await send(env.TELEGRAM_BOT_TOKEN, msg.chat.id, `🤖 ${res.text}`, {
    reply_to_message_id: msg.message_id,
    allow_sending_without_reply: true,
    reply_markup: kb,
  });
  return true;
}
