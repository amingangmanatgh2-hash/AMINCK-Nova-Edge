// ═══════════════════════════════════════════════════════════════════
//  🛍 خرید داخل گروه (checkout کامل در گروه، تحویل در پیوی)
//
//  طبق تصمیم کاربر: قیمت، تخفیف، پرداخت و رسید «همه در همان گروه» انجام
//  می‌شود و فقط کانفیگ/لینک اشتراک در پیوی تحویل داده می‌شود؛ در گروه فقط
//  یک پیام «✅ تحویل در پیوی» ظاهر می‌شود (حریم خصوصی کاربر).
//
//  ورودی‌ها در گروه:
//   • /buy  /shop  /products  «فروشگاه»  «خرید»  «قیمت»  👇 دکمهٔ منوی گروه
//   • /buy 3            → مستقیم کارت محصول ۳
//   • /buy 3 CODE       → با کد تخفیف
//   • عکس ریپلای روی پیام پرداخت → فیش (بررسی AI + صف ادمین)
//  تنظیمات: group_buy_enabled, group_discount_percent, group_coupon_code,
//           group_pay_methods, group_show_rating, group_receipt_require_reply
// ═══════════════════════════════════════════════════════════════════
import { esc } from './util.js';
import { faDigits, fmtToman, getUser } from './db.js';
import { send, tg, ikb, btn, ubtn } from './tg.js';
import { getSettingValue, getText } from './texts.js';
import { productPriceToman, priceModeLine, applyDiscountCode, consumeDiscountCode, RATE_UNAVAILABLE_MESSAGE } from './pricing.js';
import { createOrder, approveReceipt, sendDelivery, assertDeliverable, payWithWallet, payWithCoins, coinPurchaseGate } from './pay.js';
import { analyzeReceipt } from './verify.js';
import { gatewayConfig, createPayment } from './gateway.js';
import { protocolHealth } from './subs.js';
import { tierLabel } from './user.js';
import { checkPurchaseLimits, topReviews, reviewLine, toggleFavorite, isFavorite, saveReview } from './perks.js';
import { t as i18nT } from './i18n.js';
import { CATS } from './user.js';

const TRIGGERS = new Set(['فروشگاه', 'خرید', 'قیمت', 'قیمت‌ها', 'محصولات', 'products', 'shop', 'buy']);
const now = () => Math.floor(Date.now() / 1000);
const numSet = async (db, k, d) => {
  const n = Number(await getSettingValue(db, k));
  return Number.isFinite(n) && n >= 0 ? n : d;
};

export function isGroupBuyTrigger(text) {
  const t = String(text || '').trim().toLowerCase().replace(/[ـ]/g, '');
  if (!t) return null;
  const m = t.match(/^\/(buy|shop|products|price|خرید)(?:@\w+)?(?:\s+(\d+))?(?:\s+([\w-]+))?$/);
  if (m) return { pid: m[2] ? Number(m[2]) : 0, coupon: m[3] ? m[3].toUpperCase() : '' };
  if (TRIGGERS.has(t)) return { pid: 0, coupon: '' };
  return null;
}

/* ─────────────────────────── پیام متنی در گروه ─────────────────────────── */
export async function handleGroupMessage(env, msg, token, botUsername) {
  const db = env.DB;
  const text = (msg.text || '').trim();
  if (!text) return false;
  if ((await getSettingValue(db, 'group_buy_enabled')) === '0') return false;
  const trig = isGroupBuyTrigger(text);
  if (!trig) return false;
  const user = msg.from;
  if (!user) return false;
  const { ensureUser } = await import('./db.js');
  await ensureUser(db, user);
  const fresh = await getUser(db, user.id);
  if (!fresh || fresh.banned) {
    return tg(token, 'sendMessage', { chat_id: msg.chat.id, text: '⛔ برای خرید، اول در پیوی ربات ثبت‌نام کنید.', reply_to_message_id: msg.message_id });
  }
  if (trig.pid) {
    await showProductCard(env, token, msg, fresh, trig.pid, trig.coupon);
    return true;
  }
  await showShop(env, token, msg, fresh);
  return true;
}

async function shopText(env, db) {
  const { priceLine } = await import('./pricing.js');
  const rate = await priceLine(env);
  const disc = await numSet(db, 'group_discount_percent', 0);
  const coupon = (await getSettingValue(db, 'group_coupon_code')) || '';
  return (
    `🛍 <b>فروشگاه AMINCK</b>\n\n` +
    `${rate}\n` +
    (disc > 0 ? `🎉 <b>تخفیف ویژهٔ اعضای این گروه: ${faDigits(disc)}٪</b>\n` : '') +
    (coupon ? `🏷 کد تخفیف گروه: <code>${esc(coupon)}</code>\n` : '') +
    `\n👇 دسته را انتخاب کنید — قیمت، پرداخت و تحویل پیوی 🔐`
  );
}

async function showShop(env, token, msg, user) {
  const db = env.DB;
  const rows = [];
  const cats = CATS.filter((c) => c.id !== 'custom');
  for (let i = 0; i < cats.length; i += 2) rows.push(cats.slice(i, i + 2).map((c) => btn(c.label, `gb:cat:${c.id}`)));
  const creator = (await getSettingValue(db, 'creator_enabled')) !== '0';
  if (creator) rows.push([btn('🧩 پنل کانفیگ‌ساز', 'gb:cat:creator')]);
  rows.push([btn('🔥 همه محصولات', 'gb:cat:all'), btn('⭐ محبوب‌ترین', 'gb:cat:top')]);
  const text = await shopText(env, db);
  return tg(token, 'sendMessage', {
    chat_id: msg.chat.id,
    from_user_id: undefined,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_to_message_id: msg.message_id,
    reply_markup: ikb(rows),
  });
}

async function listProducts(env, token, msg, user, cat, edit = false) {
  const db = env.DB;
  let rows = [];
  if (cat === 'top') {
    const r = await db.prepare("SELECT * FROM products WHERE enabled=1 AND (stock<0 OR stock>0) ORDER BY sold DESC, id ASC LIMIT 8").all();
    rows = r.results || [];
  } else if (cat === 'all') {
    const r = await db.prepare("SELECT * FROM products WHERE enabled=1 ORDER BY sort ASC, id ASC LIMIT 20").all();
    rows = r.results || [];
  } else if (cat === 'creator') {
    const r = await db.prepare("SELECT * FROM products WHERE enabled=1 AND category='creator' ORDER BY sort ASC, id ASC LIMIT 10").all();
    rows = r.results || [];
  } else {
    const r = await db.prepare("SELECT * FROM products WHERE enabled=1 AND category=? ORDER BY sort ASC, id ASC LIMIT 15").bind(cat).all();
    rows = r.results || [];
  }
  if (!rows.length) return tg(token, 'sendMessage', { chat_id: msg.chat.id, text: '📭 فعلاً محصول فعالی در این دسته نیست.', reply_to_message_id: msg.message_id });
  const disc = await numSet(db, 'group_discount_percent', 0);
  const kb = { inline_keyboard: [] };
  for (const p of rows) {
    const price = await productPriceToman(env, p);
    const final = price && disc > 0 ? Math.round((price * (100 - disc)) / 100) : price;
    const soldOut = Number(p.stock) === 0;
    kb.inline_keyboard.push([
      btn(`${soldOut ? '⛔' : price ? '💵' : '⏳'} ${p.title}`.slice(0, 56), `gb:p:${p.id}`),
      btn(soldOut ? 'تمام' : final ? fmtToman(final) : '—', `gb:p:${p.id}`),
    ]);
  }
  kb.inline_keyboard.push([btn('🔙 دسته‌ها', 'gb:cats'), btn('⭐ پرفروش‌ترین‌ها', 'gb:cat:top')]);
  const title = cat === 'all' ? 'همه محصولات' : cat === 'top' ? 'پرفروش‌ترین‌ها' : CATS.find((c) => c.id === cat)?.label || cat;
  const text =
    `🧾 <b>${esc(String(title).replace(/<[^>]+>/g, ''))}</b>\n` +
    (disc > 0 ? `🎉 قیمت‌ها با ${faDigits(disc)}٪ تخفیف گروهی محاسبه شده‌اند\n\n` : '\n') +
    `👇 روی یک محصول بزنید`;
  const payload = { chat_id: msg.chat.id, text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: kb };
  if (edit && msg.message_id) return tg(token, 'editMessageText', { chat_id: msg.chat.id, message_id: msg.message_id, ...payload });
  return tg(token, 'sendMessage', { ...payload, reply_to_message_id: msg.message_id });
}
async function productCardText(env, p, user, opts = {}) {
  const db = env.DB;
  const price = await productPriceToman(env, p);
  const disc = await numSet(db, 'group_discount_percent', 0);
  let final = price || 0;
  const cuts = [];
  if (price && disc > 0) {
    final = Math.round((final * (100 - disc)) / 100);
    cuts.push(`🎉 تخفیف گروهی ${faDigits(disc)}٪`);
  }
  const code = String(opts.coupon || (await getSettingValue(db, 'group_coupon_code')) || '').toUpperCase();
  let couponId = 0;
  if (code && final) {
    const d = await applyDiscountCode(env, code, user.id, final);
    if (d.ok) {
      couponId = Number(d.id || 0);
      if (d.percent) {
        final = Math.round((final * (100 - d.percent)) / 100);
        cuts.push(`🏷 کد ${code}: ${faDigits(d.percent)}٪`);
      } else if (d.amount) {
        final = Math.max(0, final - d.amount);
        cuts.push(`🏷 کد ${code}: ${fmtToman(d.amount)}`);
      }
    } else if (opts.coupon) cuts.push(`⚠️ ${d.error}`);
  }
  const floor = Number(await getSettingValue(db, 'price_floor_toman')) || 0;
  if (floor > 0 && final < floor) final = floor;
  const health = await protocolHealth(db, p.protocol || 'vless');
  const reviews = await topReviews(db, p.id, 2);
  const fav = await isFavorite(db, user.id, p.id);
  let text =
    `📦 <b>${esc(p.title)}</b>\n\n` +
    `⏱ ${faDigits(Number(p.days || 0))} روز · 📊 ${p.traffic_gb ? faDigits(p.traffic_gb) + ' گیگ' : 'نامحدود 🌊'}\n` +
    `🖥 ${faDigits(Number(p.server_count || 1))} سرور · 🧩 ${esc(p.category || p.protocol || '—')}${p.tier ? ' · ' + tierLabel(p.tier) : ''}\n` +
    (p.description ? `📝 ${esc(String(p.description)).slice(0, 200)}\n` : '') +
    (Number(p.max_devices) > 1 ? `📱 چنددستگاهی: تا ${faDigits(Number(p.max_devices))} دستگاه\n` : '') +
    (Number(p.stock) >= 0 ? `📦 موجودی: ${faDigits(Number(p.stock))}${Number(p.stock) === 0 ? ' ⛔' : ''}\n` : '') +
    (p.protocol === 'mtproto' || p.protocol === 'socks5' ? '' : `${health.ok ? `🟢 ${faDigits(health.healthyCount)} مسیر سالم` : '🔴 فعلاً مسیر سالمی نیست — تحویل متوقف است'}\n`) +
    `\n💰 قیمت: <b>${price ? fmtToman(price) : '—'}</b>` +
    (final !== price ? `\n💸 قیمت شما در این گروه: <b>${fmtToman(final)}</b>\n${cuts.map((c) => `• ${esc(c)}`).join('\n')}` : '') +
    `\n\n${await priceModeLine(env, p)}`;
  if ((await getSettingValue(db, 'group_show_rating')) !== '0') {
    text += `\n\n${reviewLine({ review_count: p.review_count, review_avg: p.review_avg }, reviews)}`;
  }
  return { text, price: final, basePrice: price, couponId, soldOut: Number(p.stock) === 0, healthOk: health.ok, healthCount: health.healthyCount, fav };
}

export async function showProductCard(env, token, msg, user, pid, coupon) {
  const db = env.DB;
  const p = await db.prepare('SELECT * FROM products WHERE id=?').bind(Number(pid) || 0).first();
  if (!p || !p.enabled) return tg(token, 'sendMessage', { chat_id: msg.chat.id, text: '⛔ این محصول دیگر موجود نیست.', reply_to_message_id: msg.message_id });
  const c = await productCardText(env, p, user, { coupon });
  const gw = await gatewayConfig(env);
  const methods = String(await getSettingValue(db, 'group_pay_methods') || 'card,gateway,wallet,coin').split(',').map((x) => x.trim());
  const rows = [];
  if (!c.soldOut) {
    if (methods.includes('card')) rows.push([btn(`💳 کارت به کارت — ${fmtToman(c.price)}`, `gb:pay:card:${p.id}:${coupon || ''}`)]);
    if (methods.includes('gateway') && gw.enabled) rows.push([btn('🏦 پرداخت آنی (درگاه بانکی)', `gb:pay:gw:${p.id}:${coupon || ''}`)]);
    if (methods.includes('wallet')) rows.push([btn('👛 پرداخت از کیف پول', `gb:pay:wal:${p.id}:${coupon || ''}`)]);
    const gate = await coinPurchaseGate(env, p);
    if (methods.includes('coin') && gate.ok && Number(p.coin_price) > 0) {
      rows.push([btn(`🪙 ${faDigits(Number(p.coin_price))} سکه`, `gb:pay:coin:${p.id}:${''}`), btn('⚖️ مقایسه', `gb:p:${p.id}`)]);
    }
  } else {
    rows.push([btn('📦 تمام شده — خبرم کن', 'gb:notify')]);
  }
  rows.push([btn(c.fav ? '❤️ در علاقه‌مندی‌ها' : '🤍 علاقه‌مندی', `gb:fav:${p.id}`), btn('⭐ ثبت امتیاز', `gb:revask:${p.id}`), btn('🎁 تست رایگان', 'gb:trial')]);
  rows.push([btn('🔙 فروشگاه', 'gb:cats')]);
  const r = await tg(token, 'sendMessage', {
    chat_id: msg.chat.id,
    text: c.text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_to_message_id: msg.message_id,
    reply_markup: ikb(rows),
  });
  return r;
}

/* ─────────────────────────── کال‌بک‌های گروه ─────────────────────────── */
export async function handleGroupCallback(ctx, data) {
  const { env, db, token, user } = ctx;
  const cb = ctx.update.callback_query;
  const chatId = cb?.message?.chat?.id || cb?.message?.chat_id;
  const msgId = cb?.message?.message_id || 0;
  const parts = data.split(':');
  const act = parts[1];
  const answer = (text = '', showAlert = false) => tg(token, 'answerCallbackQuery', { callback_query_id: ctx.cbId, text: text || undefined, show_alert: showAlert });
  const mention = `${user.first_name || 'کاربر'}${user.username ? ' @' + user.username : ''}`;

  if (act === 'cats') {
    await answer();
    const text = await shopText(env, db);
    const rows = [];
    const cats = CATS.filter((c) => c.id !== 'custom');
    for (let i = 0; i < cats.length; i += 2) rows.push(cats.slice(i, i + 2).map((c) => btn(c.label, `gb:cat:${c.id}`)));
    rows.push([btn('🔥 همه محصولات', 'gb:cat:all'), btn('⭐ پرفروش‌ترین', 'gb:cat:top')]);
    return tg(token, 'editMessageText', { chat_id: chatId, message_id: msgId, text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: ikb(rows) });
  }
  if (act === 'cat') {
    await answer();
    return listProducts(env, token, { chat: { id: chatId }, message_id: msgId }, user, parts[2], false);
  }
  if (act === 'p') {
    await answer();
    const msg = { chat: { id: chatId }, message_id: 0, from: cb.from };
    return showProductCard(env, token, msg, user, Number(parts[2]), '');
  }
  if (act === 'fav') {
    const r = await toggleFavorite(db, user.id, Number(parts[2]) || 0);
    return answer(r.added ? '❤️ به علاقه‌مندی‌ها اضافه شد' : '🤍 از علاقه‌مندی‌ها حذف شد');
  }
  if (act === 'notify') {
    await answer('✅ به‌محض شارژ شدن موجودی به شما خبر می‌دهیم', true);
    const { notifyAdmins } = await import('./notify.js');
    return notifyAdmins(env, 'outOfStock', `📦 درخواست شارژ موجودی از گروه\n👤 ${mention}\n🆔 <code>${user.id}</code>`, null, { dedupe: 'reqstock:' + user.id });
  }
  if (act === 'trial') {
    await answer();
    return send(token, user.id, `🎁 برای دریافت <b>تست رایگان</b> همین الان در پیوی دکمهٔ «🎁 پروکسی و تست رایگان» را بزنید.\n\n${deep(ctx)}${''}`);
  }
  if (act === 'revask') {
    const pid = Number(parts[2]);
    const rows = [[1, 2, 3], [4, 5]].map((r) => r.map((n) => ({ text: '★'.repeat(n), callback_data: `gb:rev:${pid}:${n}` })));
    return tg(token, 'sendMessage', { chat_id: chatId, text: `⭐ ${mention} می‌خواهد امتیاز بدهد 👇`, parse_mode: 'HTML', reply_to_message_id: msgId || undefined, reply_markup: ikb(rows) });
  }
  if (act === 'rev') {
    const [, , pid, n] = parts;
    const bought = await db.prepare("SELECT 1 x FROM orders WHERE user_id=? AND product_id=? AND status='paid'").bind(user.id, Number(pid)).first();
    if (!bought && (await getSettingValue(db, 'group_review_need_buy')) === '1') return answer('⛔ فقط خریداران این محصول می‌توانند امتیاز دهند', true);
    await saveReview(db, { productId: Number(pid), userId: user.id, rating: Number(n), text: '' });
    await answer(`⭐ امتیاز ${faDigits(n)} ثبت شد`);
    return tg(token, 'sendMessage', { chat_id: chatId, text: `${mention} ${faDigits(Number(n))} از ۵ ستاره داد 🌟`, parse_mode: 'HTML', reply_to_message_id: msgId || undefined });
  }
  if (act === 'pay') {
    const method = parts[2];
    const pid = Number(parts[3]);
    const coupon = parts[4] || '';
    return beginGroupPayment(ctx, { method, pid, coupon, chatId, msgId, mention, answer });
  }
  if (act === 'cancel') {
    const goid = Number(parts[2]);
    const g = await db.prepare('SELECT * FROM group_orders WHERE id=? AND user_id=?').bind(goid, user.id).first();
    if (!g) return answer('⛔');
    await db.prepare("UPDATE group_orders SET status='rejected', updated_at=? WHERE id=?").bind(now(), goid).run();
    await db.prepare("UPDATE orders SET status='rejected' WHERE id=? AND status='pending'").bind(Number(g.order_id)).run();
    await answer('❌ سفارش لغو شد');
    return tg(token, 'sendMessage', { chat_id: chatId, text: `❌ ${mention} سفارش #${faDigits(Number(g.order_id))} را لغو کرد.`, parse_mode: 'HTML', reply_to_message_id: Number(g.message_id) || undefined });
  }
  return answer('');
}

const deep = (ctx) => `<a href="https://t.me/${esc(ctx.botUsername || 'bot')}?start=trial">🎁 باز کردن ربات</a>`;

async function beginGroupPayment(ctx, { method, pid, coupon, chatId, msgId, mention, answer }) {
  const { env, db, token, user } = ctx;
  const p = await db.prepare('SELECT * FROM products WHERE id=?').bind(pid).first();
  if (!p || !p.enabled) return answer('⛔ محصول پیدا نشد', true);
  const c = await productCardText(env, p, user, { coupon });
  const price = c.price;
  if (!price) return answer('⚠️ نرخ در دسترس نیست — به ادمین بگویید', true);
  if (c.soldOut) return answer('⛔ موجودی تمام شده', true);

  // ⛔ ابتدا قابلیت تحویل، بعد سقف خرید، بعد پول — تا هیچ وجهی بی‌دلیل کم نشود
  const can = await assertDeliverable(env, p);
  if (!can.ok) {
    await answer('🚫 سرویس فعلاً در دسترس نیست', true);
    return send(token, user.id, `⚠️ <b>${esc(p.title)}</b>\n\n${esc(can.message || 'تحویل فعلاً متوقف است.')}\n\nما کانفیگ جعلی تحویل نمی‌دهیم؛ به‌محض بازگشت مسیرها خبر می‌دهیم.`);
  }
  const lim = await checkPurchaseLimits(db, user, price);
  if (!lim.ok) return answer(lim.reason, true);

  if (method === 'wal') {
    const res = await payWithWallet(env, user, p, price);
    if (res.ok) {
      await db
        .prepare('INSERT INTO group_orders (chat_id,message_id,order_id,user_id,product_id,amount,discount,status,notified,created_at,updated_at) VALUES (?,?,?,?,?,?,?,\'paid\',1,?,?)')
        .bind(chatId, msgId || 0, res.order?.id || 0, user.id, p.id, price, 0, now(), now())
        .run();
      await markGroupNotified(db, res.order?.id || 0);
    }
    if (!res.ok) {
      await answer('👛 موجودی کیف پول کافی نیست', true);
      return tg(token, 'sendMessage', {
        chat_id: chatId,
        text: `${mention} موجودی کیف‌پولش کافی نیست 🙈\n🔐 برای شارژ و ادامهٔ خرید به پیوی ربات برو.`,
        parse_mode: 'HTML',
        reply_to_message_id: msgId || undefined,
        reply_markup: ikb([[ubtn('👛 شارژ کیف پول', `https://t.me/${ctx.botUsername || 'bot'}?start=account`), btn('🔙 محصولات', `gb:cat:all`)]]),
      });
    }
    await sendDelivery(env, user, p.title, res.sub, { protocol: p.protocol });
    await answer('✅ پرداخت شد');
    await tg(token, 'sendMessage', { chat_id: chatId, text: `✅ ${mention} با کیف پول خرید — <b>تحویل در پیوی</b> 📩`, parse_mode: 'HTML', reply_to_message_id: msgId || undefined });
    if (c.couponId) await consumeDiscountCode(env, c.couponId);
    return;
  }
  if (method === 'coin') {
    const gate = await coinPurchaseGate(env, p);
    if (!gate.ok) return answer(gate.message || '⛔ با سکه قابل خرید نیست', true);
    const res = await payWithCoins(env, user, p);
    if (!res.ok) return answer(res.message || '⛔ سکه کافی نیست', true);
    await sendDelivery(env, user, p.title, res.sub, { protocol: p.protocol });
    await markGroupNotified(db, res.order?.id || 0);
    await answer('✅ با سکه پرداخت شد');
    return tg(token, 'sendMessage', { chat_id: chatId, text: `🪙 ${mention} با سکه خرید — تحویل در پیوی 📩`, parse_mode: 'HTML', reply_to_message_id: msgId || undefined });
  }

  const order = await createOrder(env, user.id, p, price, method === 'gw' ? 'gateway' : 'card');
  const gRes = await db
    .prepare('INSERT INTO group_orders (chat_id,message_id,order_id,user_id,product_id,amount,discount,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(chatId, 0, order.id, user.id, p.id, price, 0, 'await_receipt', now(), now())
    .run();
  const gRow = await db.prepare('SELECT id FROM group_orders ORDER BY id DESC LIMIT 1').first();
  const goid = Number(gRes?.meta?.last_row_id || gRow?.id || order.id);
  if (c.couponId) await db.prepare("UPDATE orders SET note=? WHERE id=?").bind(`coupon:${c.couponId}`, order.id).run();
  await db.prepare("UPDATE orders SET note=COALESCE(NULLIF(note,''),'') || ? WHERE id=?").bind(` | group:${chatId}`, order.id).run();

  if (method === 'gw') {
    const res = await createPayment(env, order, user, { description: `سفارش ${order.id} - ${p.title}` });
    if (!res.ok) {
      await db.prepare("UPDATE orders SET status='rejected', note=? WHERE id=?").bind('gateway: ' + res.message, order.id).run();
      return answer(`⛔ ${String(res.message || 'خطای درگاه').slice(0, 60)}`, true);
    }
    await answer('لینک پرداخت باز می‌شود…');
    const m = await tg(token, 'sendMessage', {
      chat_id: chatId,
      text: `${i18nT(user.lang || 'fa', 'group_pay_title').replace('{id}', `<code>${faDigits(order.id)}</code>`).replace('{amount}', `<b>${fmtToman(price)}</b>`)}\n\n🏦 روی دکمه بزنید و پرداخت کنید؛ به‌محض تایید درگاه، کانفیگ در پیوی می‌آید. ⏳`,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_to_message_id: msgId || undefined,
      reply_markup: ikb([[ubtn('🏦 پرداخت امن', res.url || res.payment_url || ''), btn('❌ لغو', `gb:cancel:${goid}`)]]),
    });
    await db.prepare('UPDATE group_orders SET message_id=? WHERE id=?').bind(Number(m?.result?.message_id || 0), goid).run();
    return;
  }

  const cardNum = (await getSettingValue(db, 'card_number')) || '';
  const holder = (await getSettingValue(db, 'card_holder')) || '';
  const intro = await getText(db, 'pay_intro');
  const pretty = String(cardNum).replace(/(\d{4})(?=\d)/g, '$1 ');
  const body =
    `🔐 <b>پرداخت در گروه، تحویل در پیوی</b>\n\n` +
    `${i18nT(user.lang || 'fa', 'group_pay_title').replace('{id}', `<code>${faDigits(order.id)}</code>`).replace('{amount}', `<b>${fmtToman(price)}</b>`)}\n\n` +
    `💳 شماره کارت:\n<code>${esc(pretty)}</code>\n👤 به نام: <b>${esc(holder)}</b>\n\n` +
    `🧾 بعد از واریز: <b>عکس فیش را روی همین پیام ریپلای کنید</b>.\n🤖 فیش با هوش مصنوعی بررسی می‌شود (مبلغ + تاریخ + کارت مقصد).`;
  const m = await tg(token, 'sendMessage', {
    chat_id: chatId,
    text: body,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_to_message_id: msgId || undefined,
    reply_markup: ikb([
      [btn(i18nT(user.lang || 'fa', 'group_receipt_btn'), `gb:rcpt:${goid}`), btn('❌ لغو سفارش', `gb:cancel:${goid}`)],
      [btn('📋 کپی شماره کارت', `gb:rcpt:${goid}`)],
    ]),
  });
  const realMsgId = Number(m?.result?.message_id || 0);
  if (realMsgId) await db.prepare('UPDATE group_orders SET message_id=? WHERE id=?').bind(realMsgId, goid).run();
  await answer('🧾 راهنمای پرداخت در گروه ارسال شد');
  await send(token, user.id, `🧾 سفارش #${faDigits(order.id)} در گروه ساخته شد.\n💰 ${fmtToman(price)} — ${esc(p.title)}\n🔐 کانفیگ فقط در این چت ارسال می‌شود؛ در گروه فقط «✅ تحویل در پیوی» نمایش داده می‌شود.`);
  const { notifyAdmins } = await import('./notify.js');
  await notifyAdmins(env, 'purchase', `🛍 <b>سفارش گروهی جدید</b>\n👤 ${mention}\n💰 ${fmtToman(price)} — ${esc(p.title)}\n🧾 #${faDigits(order.id)} · در انتظار فیش (چت <code>${chatId}</code>)`, null, { dedupe: 'gorder:' + order.id });
}

export async function handleGroupReceiptPhoto(env, msg, token) {
  const db = env.DB;
  if ((await getSettingValue(db, 'group_buy_enabled')) === '0') return false;
  const rep = msg.reply_to_message;
  if (!rep || !rep.from?.is_bot) return false;
  if (!(await getSettingValue(db, 'group_receipt_require_reply')) || (await getSettingValue(db, 'group_receipt_require_reply')) === '1') {
    // فقط اگر پیام ریپلای‌شده واقعاً پیام پرداخت ربات باشد
  }
  const g = await db
    .prepare("SELECT * FROM group_orders WHERE chat_id=? AND message_id=? AND status='await_receipt' ORDER BY id DESC LIMIT 1")
    .bind(msg.chat.id, rep.message_id)
    .first();
  if (!g) return false;
  const user = await getUser(db, g.user_id);
  const order = await db.prepare('SELECT * FROM orders WHERE id=?').bind(Number(g.order_id)).first();
  if (!user || !order || order.status !== 'pending') {
    await tg(token, 'sendMessage', { chat_id: msg.chat.id, text: '⚠️ این سفارش دیگر در انتظار پرداخت نیست.', reply_to_message_id: msg.message_id });
    return true;
  }
  await tg(token, 'sendChatAction', { chat_id: msg.chat.id, action: 'typing' });
  const photo = Array.isArray(msg.photo) ? msg.photo : [];
  const fileId = (photo[photo.length - 1] || {}).file_id || '';
  let bytes = new Uint8Array();
  if (fileId) {
    const fr = await tg(token, 'getFile', { file_id: fileId });
    if (fr?.ok) {
      try {
        const res = await fetch(`https://api.telegram.org/file/bot${token}/${fr.result.file_path}`);
        bytes = new Uint8Array(await res.arrayBuffer());
      } catch {}
    }
  }
  const autoVerify = (await getSettingValue(db, 'auto_verify')) === '1';
  let verdict = { verdict: 'manual', reasons: ['دریافت تصویر ناموفق؛ بررسی دستی توسط ادمین.'] };
  if (bytes.length) verdict = await analyzeReceipt(env, bytes, order.amount_toman);
  const report = (verdict.reasons || []).join('\n');
  const recRes = await db
    .prepare('INSERT INTO receipts (user_id, order_id, file_id, claimed_amount, status, ai_report, created_at) VALUES (?,?,?,?,?,?,?)')
    .bind(user.id, order.id, fileId, verdict.data?.amount_toman || 0, 'pending', `${verdict.verdict}\n${report}`, now())
    .run();
  const recId = Number(recRes?.meta?.last_row_id || 0);
  const rec = recId
    ? { id: recId, order_id: order.id, user_id: user.id, file_id: fileId, claimed_amount: verdict.data?.amount_toman || 0, status: 'pending', ai_report: `${verdict.verdict}\n${report}` }
    : await db.prepare('SELECT * FROM receipts WHERE order_id=? ORDER BY id DESC LIMIT 1').bind(order.id).first();

  if (verdict.verdict === 'auto' && autoVerify) {
    const res = await approveReceipt(env, rec);
    if (res?.error === 'no_real_server') {
      await tg(token, 'sendMessage', { chat_id: msg.chat.id, text: `⚠️ پرداخت تایید شد اما تحویل فعلاً ممکن نیست — پشتیبانی پیگیری می‌کند. 🙏`, reply_to_message_id: msg.message_id });
      await send(token, user.id, `🧾 فیش شما تایید شد اما فعلاً سرور آماده‌ای برای تحویل وجود ندارد.\nپشتیبانی را در جریان گذاشتیم و به‌محض آماده شدن، پیام می‌دهیم. 🙏`);
      return true;
    }
    if (res?.charge) {
      await send(token, user.id, `✅ <b>شارژ کیف پول تایید شد</b>\n\n👛 ${fmtToman(order.amount_toman)} از طریق پرداخت گروهی.`);
    } else if (res?.sub) {
      await send(token, user.id, `✅ <b>پرداخت تایید شد</b>\n\n🧾 #${faDigits(order.id)} — ${fmtToman(order.amount_toman)}\n🤖 تایید خودکار هوش مصنوعی\n⏳ آماده‌سازی تحویل…`);
      await sendDelivery(env, res.user, res.order?.title || order.title, res.sub, { protocol: res.product?.protocol });
    }
    // ✅ اطلاع در گروه توسط notifyGroupPaid (از afterPurchase) ارسال می‌شود — بدون تکرار
    return true;
  }

  await db.prepare("UPDATE group_orders SET status='receipt_ok', updated_at=? WHERE id=?").bind(now(), g.id).run();
  await tg(token, 'sendMessage', {
    chat_id: msg.chat.id,
    text: `🧾 فیش دریافت شد و در صف بررسی است…\n🔐 نتیجه و کانفیگ در <b>پیوی</b> به ${verdict.verdict === 'reject' ? 'کاربر و ادمین' : 'کاربر'} اعلام می‌شود.`,
    parse_mode: 'HTML',
    reply_to_message_id: msg.message_id,
  });
  await send(token, user.id, await getText(db, 'receipt_pending'));
  const { notifyAdmins } = await import('./notify.js');
  await notifyAdmins(
    env,
    verdict.verdict === 'reject' ? 'suspicious' : 'receipt',
    `🧾 <b>فیش گروهی در صف بررسی</b>\n👤 ${esc(user.first_name || '')} (<code>${user.id}</code>)\n💰 ${fmtToman(order.amount_toman)} — ${esc(order.title)}\n💬 چت: <code>${msg.chat.id}</code>\n🤖 ${esc(report).slice(0, 500)}`,
    ikb([[btn('✅ تایید', `rcpt:a:${rec?.id || 0}`), btn('❌ رد', `rcpt:r:${rec?.id || 0}`)]]),
    { dedupe: 'grec:' + (rec?.id || 0) }
  );
  return true;
}

/**
 * پس از پرداخت موفق (از هر مسیر) — اطلاع در گروه + بستن رکورد گروهی.
 * ضدتکرار: ستون notified؛ اگر جریانی خودش پیام گروهی سفارشی فرستاده،
 * با markGroupNotified() از ارسال دوم جلوگیری می‌کنیم.
 */
export async function notifyGroupPaid(env, token, orderId, user, kind = 'paid') {
  const db = env.DB;
  const g = await db.prepare("SELECT * FROM group_orders WHERE order_id=? AND COALESCE(notified,0)=0 ORDER BY id DESC LIMIT 1").bind(Number(orderId)).first();
  if (!g) return false;
  await db.prepare("UPDATE group_orders SET status=?, notified=1, updated_at=? WHERE id=?").bind(kind === 'rejected' ? 'rejected' : 'paid', now(), g.id).run();
  const text =
    kind === 'rejected'
      ? `❌ فیش سفارش #${faDigits(Number(orderId))} رد شد. برای پیگیری در پیوی ربات پیام دهید.`
      : `✅ ${i18nT(user?.lang || 'fa', 'group_paid_pv').replaceAll('{id}', faDigits(Number(orderId)))}`;
  await tg(token, 'sendMessage', { chat_id: g.chat_id, text, parse_mode: 'HTML', reply_to_message_id: Number(g.message_id) || undefined });
  return true;
}

/** علامت‌زدن اینکه اطلاعِ گروه برای این سفارش ارسال شده است */
export async function markGroupNotified(db, orderId) {
  await db.prepare("UPDATE group_orders SET notified=1, status='paid', updated_at=? WHERE order_id=?").bind(now(), Number(orderId)).run();
}

/* ─────────────────────────── دکمهٔ شناور گروه ─────────────────────────── */
/** پس از عضویت ربات در گروه: معرفی کوتاه + فروشگاه (برای اینکه خرید در گروه ممکن باشد) */
export async function groupIntro(env, chatId, token, botUsername) {
  const db = env.DB;
  if ((await getSettingValue(db, 'group_buy_enabled')) === '0') return;
  await send(
    token,
    chatId,
    `🛍 <b>خرید کانفیگ مستقیم در این گروه فعال شد</b>\n\n` +
      `• بنویسید <code>/buy</code> (یا «فروشگاه»)\n` +
      `• قیمت و تخفیف همین‌جا، پرداخت همین‌جا\n` +
      `🔐 کانفیگ فقط در پیوی ارسال می‌شود — کسی آن را در گروه نمی‌بیند.\n` +
      `🧪 برای پست شیشه‌ای هم می‌توانید بنویسید <code>@${esc(botUsername || 'bot')} کد۵رقمی</code>`,
    { reply_markup: ikb([[btn('🛍 باز کردن فروشگاه', 'gb:cat:all')]]) }
  );
}

export { productCardText };
