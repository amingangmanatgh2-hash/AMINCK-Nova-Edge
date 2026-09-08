// ═══════════════════════════════════════════════════════════════════
//  پنل مدیریت داخل تلگرام — همه‌چیز با دکمه‌های شیشه‌ای و ادیت پیام
// ═══════════════════════════════════════════════════════════════════
import {
  fmtToman, faDigits, fmtDate, hasPerm, ALL_PERMS, PERM_LABELS, getUser, addBalance, addCoins,
} from './db.js';
import { send, editText, answerCb, ikb, btn, ubtn, menuKb, forceReply, tg, sendDoc } from './tg.js';
import { getText, getSettingValue, getNum, DEFAULT_TEXTS } from './texts.js';
import { getUsdRate, productPriceToman } from './pricing.js';
import { approveReceipt, sendDelivery } from './pay.js';
import { createSubscription, defaultTemplate, defaultPort } from './subs.js';
import { serverIssues, isServerDeliverable, isValidMtprotoSecret, isValidHost, buildMtprotoLinks, buildSocks5Links, NoRealServerError } from './proxy.js';
import { realActiveServerCount } from './db.js';
import { aiDiagnostics, TEXT_MODELS } from './ai.js';
import { parseMoney, getBase, isValidPanelPassword } from './util.js';
import { CATS, userTag } from './user.js';

const now = () => Math.floor(Date.now() / 1000);

async function setState(ctx, state, data = null) {
  if (data !== null) await ctx.db.prepare('UPDATE users SET state=?, state_data=? WHERE id=?').bind(state, JSON.stringify(data), ctx.user.id).run();
  else await ctx.db.prepare('UPDATE users SET state=? WHERE id=?').bind(state, ctx.user.id).run();
  ctx.user.state = state;
}

function stateData(ctx) {
  try {
    return JSON.parse(ctx.user.state_data || '{}');
  } catch {
    return {};
  }
}

// ─────────────────────────── پنل اصلی ───────────────────────────
export async function openAdminPanel(ctx, editMsg) {
  const u = ctx.user;
  const items = [
    { perm: 'stats', label: '📊 آمار فروش', cb: 'adm:stats' },
    { perm: 'receipts', label: '🧾 صف فیش‌ها', cb: 'adm:rcpts' },
    { perm: 'products', label: '📦 محصولات', cb: 'adm:prods' },
    { perm: 'products', label: '🖥 سرورها', cb: 'adm:servers' },
    { perm: 'users', label: '👥 کاربران', cb: 'adm:users' },
    { perm: 'admins', label: '👮 ادمین‌ها', cb: 'adm:admins' },
    { perm: 'groups', label: '📢 گروه‌های تبلیغاتی', cb: 'adm:groups' },
    { perm: 'settings', label: '⚙️ تنظیمات', cb: 'adm:set' },
    { perm: 'export', label: '📤 خروجی دیتابیس', cb: 'adm:export' },
    { perm: null, label: '📣 ارسال همگانی', cb: 'adm:bc' },
  ];
  const visible = items.filter((i) => !i.perm || hasPerm(u, i.perm));
  const rows = [];
  for (let i = 0; i < visible.length; i += 2) {
    const row = [btn(visible[i].label, visible[i].cb)];
    if (visible[i + 1]) row.push(btn(visible[i + 1].label, visible[i + 1].cb));
    rows.push(row);
  }
  const rate = await getUsdRate(ctx.env);
  const realServers = await realActiveServerCount(ctx.db);
  const warn = realServers === 0
    ? '\n\n⚠️ <b>هیچ سرور واقعی فعالی ثبت نشده است!</b>\nتا زمانی که از «🖥 سرورها» یک سرور با host/IP، port و secret واقعی ثبت نکنید، خرید و تحویل کانفیگ متوقف است.'
    : '';
  const text = `📊 <b>پنل مدیریت</b>\n\n👤 ${u.role === 'super' ? '👑 سوپرادمین' : '🛡 ادمین'}: ${u.first_name || u.id}\n💵 نرخ دلار: ${faDigits(rate.toLocaleString('en-US'))} تومان\n🖥 سرور واقعی فعال: ${faDigits(realServers)}${warn}`;
  if (editMsg) await editText(ctx.token, ctx.user.id, editMsg.message_id, text, { reply_markup: menuKb(rows) });
  else await send(ctx.token, ctx.user.id, text, { reply_markup: menuKb(rows) });
}

// ─────────────────────────── آمار ───────────────────────────
async function showStats(ctx, editMsg) {
  const { DB } = ctx.env;
  const d = now();
  const q = async (sql, ...b) => (await DB.prepare(sql).bind(...b).first())?.v || 0;
  const daySales = await q("SELECT COALESCE(SUM(amount_toman),0) v FROM orders WHERE status='paid' AND paid_at>=?", d - 86400);
  const weekSales = await q("SELECT COALESCE(SUM(amount_toman),0) v FROM orders WHERE status='paid' AND paid_at>=?", d - 7 * 86400);
  const monthSales = await q("SELECT COALESCE(SUM(amount_toman),0) v FROM orders WHERE status='paid' AND paid_at>=?", d - 30 * 86400);
  const dayCount = await q("SELECT COUNT(*) v FROM orders WHERE status='paid' AND paid_at>=?", d - 86400);
  const usersTotal = await q('SELECT COUNT(*) v FROM users');
  const usersNew = await q('SELECT COUNT(*) v FROM users WHERE created_at>=?', d - 7 * 86400);
  const pendingR = await q("SELECT COUNT(*) v FROM receipts WHERE status='pending'");
  const rate = await getUsdRate(ctx.env);
  const refs = await q('SELECT COALESCE(SUM(invited_count),0) v FROM users');
  const text = [
    `📊 <b>آمار فروش</b>\n`,
    `📅 امروز: <b>${fmtToman(daySales)}</b> (${faDigits(dayCount)} سفارش)`,
    `🗓 هفته: <b>${fmtToman(weekSales)}</b>`,
    `📆 ماه: <b>${fmtToman(monthSales)}</b>`,
    `💵 معادل دلاری ماه: <b>$${faDigits((monthSales / rate).toFixed(1))}</b>\n`,
    `👥 کل کاربران: ${faDigits(usersTotal)} | جدید هفته: ${faDigits(usersNew)}`,
    `🎯 مجموع دعوت‌های رفرال: ${faDigits(refs)}`,
    `🧾 فیش‌های در انتظار: ${faDigits(pendingR)}`,
  ].join('\n');
  if (editMsg) await editText(ctx.token, ctx.user.id, editMsg.message_id, text, { reply_markup: menuKb([[btn('🔄 بروزرسانی', 'adm:stats')]], 'panel') });
  else await send(ctx.token, ctx.user.id, text, { reply_markup: menuKb([[btn('🔄 بروزرسانی', 'adm:stats')]], 'panel') });
}

// ─────────────────────────── فیش‌ها ───────────────────────────
async function receiptsList(ctx, editMsg) {
  const rs = (await ctx.db.prepare("SELECT r.*, o.title, o.amount_toman FROM receipts r LEFT JOIN orders o ON o.id=r.order_id WHERE r.status='pending' ORDER BY r.id DESC LIMIT 10").all()).results;
  if (!rs.length) {
    const t = '✅ صف فیش‌ها خالی است.';
    return editMsg ? editText(ctx.token, ctx.user.id, editMsg.message_id, t, { reply_markup: menuKb([[btn('🔄', 'adm:rcpts')]], 'panel') }) : send(ctx.token, ctx.user.id, t, { reply_markup: menuKb([[btn('🔄', 'adm:rcpts')]], 'panel') });
  }
  const rows = [];
  const lines = [`🧾 <b>صف فیش‌ها</b> (${faDigits(rs.length)})\n`];
  for (const r of rs) {
    const u = await getUser(ctx.db, r.user_id);
    lines.push(`▪️ #${faDigits(r.id)} — ${u?.first_name || r.user_id} — ${fmtToman(r.amount_toman || 0)}\n<code>${(r.ai_report || '').split('\n')[0]}</code>`);
    rows.push([btn(`👁 #${faDigits(r.id)}`, `rcpt:v:${r.id}`)]);
  }
  if (editMsg) await editText(ctx.token, ctx.user.id, editMsg.message_id, lines.join('\n'), { reply_markup: menuKb(rows, 'panel') });
  else await send(ctx.token, ctx.user.id, lines.join('\n'), { reply_markup: menuKb(rows, 'panel') });
}

async function viewReceipt(ctx, id, editMsg) {
  const r = await ctx.db.prepare('SELECT r.*, o.title, o.amount_toman, o.meta FROM receipts r LEFT JOIN orders o ON o.id=r.order_id WHERE r.id=?').bind(id).first();
  if (!r) return answerCb(ctx.token, ctx.cbId, 'یافت نشد');
  const u = await getUser(ctx.db, r.user_id);
  const text = [
    `🧾 <b>فیش #${faDigits(r.id)}</b>\n`,
    `👤 ${userTag(u || { id: r.user_id })}`,
    `💰 مبلغ سفارش: <b>${fmtToman(r.amount_toman || 0)}</b> — ${r.title || 'شارژ کیف پول'}`,
    `🤖 تحلیل هوش مصنوعی:\n${r.ai_report || '—'}`,
  ].join('\n');
  const rows = [
    [btn('✅ تایید و تحویل', `rcpt:a:${r.id}`), btn('❌ رد', `rcpt:r:${r.id}`)],
    [btn('📋 لیست', 'adm:rcpts')],
  ];
  if (r.file_id) {
    await tg(ctx.token, 'sendPhoto', { chat_id: ctx.user.id, photo: r.file_id, caption: `فیش سفارش — ${fmtToman(r.amount_toman || 0)}` });
  }
  if (editMsg) await editText(ctx.token, ctx.user.id, editMsg.message_id, text, { reply_markup: ikb(rows) });
  else await send(ctx.token, ctx.user.id, text, { reply_markup: ikb(rows) });
}

export async function handleReceiptAction(ctx, action, id) {
  const r = await ctx.db.prepare('SELECT * FROM receipts WHERE id=?').bind(id).first();
  if (!r || r.status !== 'pending') return answerCb(ctx.token, ctx.cbId, 'این فیش قبلاً رسیدگی شده است');
  if (action === 'a') {
    let res;
    try {
      res = await approveReceipt(ctx.env, r);
    } catch (e) {
      await send(ctx.token, ctx.user.id, `⛔ تایید فیش ناموفق بود: <code>${String(e?.message || e).slice(0, 200)}</code>`);
      return answerCb(ctx.token, ctx.cbId, '⛔ خطا');
    }
    if (!res) {
      await send(ctx.token, ctx.user.id, '⚠️ این سفارش قبلاً پرداخت‌شده علامت خورده است.');
      return answerCb(ctx.token, ctx.cbId, 'قبلاً رسیدگی شده');
    }
    if (res.error === 'no_real_server') {
      await send(ctx.token, ctx.user.id, `⛔ ${res.message}\n\n👈 از «🖥 سرورها» یک سرور واقعی با host/port/secret ثبت کنید، سپس دوباره تایید بزنید.\nفیش هنوز در صف باقی مانده است.`);
      return answerCb(ctx.token, ctx.cbId, '⛔ سرور واقعی نیست');
    }
    if (res.charge) {
      await send(ctx.token, r.user_id, `✅ <b>پرداخت تایید شد</b>\n\n👛 کیف پول شما با ${fmtToman(res.order.amount_toman)} شارژ شد.\n🛡 تایید توسط ادمین`);
      await send(ctx.token, ctx.user.id, '✅ فیش تایید و کیف پول شارژ شد.');
    } else {
      // ۱) یک پیام تایید پرداخت  ۲) یک پیام تحویل نهایی (ضدتکرار)
      await send(ctx.token, r.user_id, (await getText(ctx.db, 'order_paid')) + '\n🛡 تایید توسط ادمین');
      const d = await sendDelivery(ctx.env, res.user, res.order.title || 'اشتراک', res.sub, { protocol: res.product?.protocol });
      await send(ctx.token, ctx.user.id, d?.sent ? '✅ فیش تایید و سفارش تحویل شد.' : `⚠️ فیش تایید شد اما تحویل خودکار انجام نشد (${d?.reason || 'نامشخص'}).`);
    }
    return answerCb(ctx.token, ctx.cbId, '✅ تایید شد');
  }
  await ctx.db.prepare("UPDATE receipts SET status='rejected' WHERE id=?").bind(id).run();
  await ctx.db.prepare("UPDATE orders SET status='rejected' WHERE id=? AND status='pending'").bind(r.order_id).run();
  await send(ctx.token, r.user_id, '❌ متاسفانه فیش شما تایید نشد. در صورت واریز، با پشتیبانی در ارتباط باشید. 📞');
  return answerCb(ctx.token, ctx.cbId, '❌ رد شد');
}

// ─────────────────────────── محصولات ───────────────────────────
async function productsList(ctx, editMsg) {
  const ps = (await ctx.db.prepare('SELECT * FROM products ORDER BY category, sort, id').all()).results;
  const rows = ps.map((p) => [btn(`${p.enabled ? '🟢' : '🔴'} ${p.title} [$${p.price_usd}]`, `adm:prod:${p.id}`)]);
  rows.push([btn('➕ محصول جدید', 'adm:prod:new')]);
  const text = '📦 <b>مدیریت محصولات</b>\n\nبرای ویرایش، یک محصول را انتخاب کنید:';
  if (editMsg) await editText(ctx.token, ctx.user.id, editMsg.message_id, text, { reply_markup: menuKb(rows.slice(0, 30), 'panel') });
  else await send(ctx.token, ctx.user.id, text, { reply_markup: menuKb(rows.slice(0, 30), 'panel') });
}

async function productView(ctx, id, editMsg) {
  const p = await ctx.db.prepare('SELECT * FROM products WHERE id=?').bind(id).first();
  if (!p) return answerCb(ctx.token, ctx.cbId, 'یافت نشد');
  const price = await productPriceToman(ctx.env, p);
  const text = [
    `📦 <b>${p.title}</b>\n`,
    `🗂 دسته: ${p.category} | پروتکل: ${p.protocol}`,
    `⏱ ${faDigits(p.days)} روز | 📊 ${p.traffic_gb ? faDigits(p.traffic_gb) + ' گیگ' : 'نامحدود'}`,
    `💵 قیمت دلاری: $${faDigits(p.price_usd)} → ${fmtToman(price)}`,
    p.category === 'coin' ? `🪙 قیمت سکه‌ای: ${faDigits(p.coin_price)}` : '',
    `وضعیت: ${p.enabled ? '🟢 فعال' : '🔴 غیرفعال'}`,
  ].join('\n');
  const rows = [
    [btn('✏️ عنوان', `adm:pf:${id}:title`), btn('💵 قیمت دلار', `adm:pf:${id}:price`)],
    [btn('⏱ روز', `adm:pf:${id}:days`), btn('📊 گیگ', `adm:pf:${id}:traffic`)],
    [btn(p.enabled ? '🔴 غیرفعال کن' : '🟢 فعال کن', `adm:pt:${id}`), btn('🗑 حذف', `adm:pd:${id}`)],
    [btn('📋 لیست محصولات', 'adm:prods')],
  ];
  if (editMsg) await editText(ctx.token, ctx.user.id, editMsg.message_id, text, { reply_markup: ikb(rows) });
  else await send(ctx.token, ctx.user.id, text, { reply_markup: ikb(rows) });
}

// ویزارد محصول جدید: عنوان → دسته → روز → حجم → قیمت دلار
async function newProductWizard(ctx, editMsg) {
  const sd = stateData(ctx);
  const step = sd.step || 0;
  if (step === 0) {
    await setState(ctx, 'admin:newprod', { step: 1, f: {} });
    const t = '📦 <b>محصول جدید</b>\n\n۱) عنوان محصول را بفرستید:';
    return editMsg ? editText(ctx.token, ctx.user.id, editMsg.message_id, t, { reply_markup: menuKb([], 'panel') }) : send(ctx.token, ctx.user.id, t, { reply_markup: menuKb([], 'panel') });
  }
}

async function newServerWizard(ctx, editMsg) {
  await setState(ctx, 'admin:newsrv', { step: 1, f: {} });
  const t = '🖥 <b>سرور جدید</b>\n\n۱) نام سرور (مثلاً: آلمان ۱) را بفرستید:';
  return editMsg ? editText(ctx.token, ctx.user.id, editMsg.message_id, t) : send(ctx.token, ctx.user.id, t);
}

async function serversList(ctx, editMsg) {
  const ss = (await ctx.db.prepare('SELECT * FROM servers ORDER BY id').all()).results;
  const rows = ss.map((s) => {
    const broken = serverIssues(s).length > 0;
    const icon = broken ? '⚠️' : s.active ? (s.healthy ? '🟢' : '🟡') : '🔴';
    return [btn(`${icon} ${s.name} (${s.protocol})`, `adm:srv:${s.id}`)];
  });
  rows.push([btn('➕ سرور جدید', 'adm:srv:new')]);
  const ready = ss.filter(isServerDeliverable).length;
  const text =
    '🖥 <b>مدیریت سرورها</b>\n🟢 سالم | 🟡 ناسالم (جایگزینی خودکار) | 🔴 غیرفعال | ⚠️ پیکربندی ناقص\n\n' +
    `✅ آمادهٔ تحویل: <b>${faDigits(ready)}</b> از ${faDigits(ss.length)}` +
    (ready === 0 ? '\n\n⛔ <b>هیچ سرور واقعی آماده نیست؛ تحویل کانفیگ متوقف است.</b>' : '');
  if (editMsg) await editText(ctx.token, ctx.user.id, editMsg.message_id, text, { reply_markup: menuKb(rows.slice(0, 30), 'panel') });
  else await send(ctx.token, ctx.user.id, text, { reply_markup: menuKb(rows.slice(0, 30), 'panel') });
}

async function serverView(ctx, id, editMsg) {
  const s = await ctx.db.prepare('SELECT * FROM servers WHERE id=?').bind(id).first();
  if (!s) return answerCb(ctx.token, ctx.cbId, 'یافت نشد');
  const issues = serverIssues(s);
  const proto = String(s.protocol || '').toLowerCase();
  let preview = '—';
  try {
    if (proto === 'mtproto') preview = buildMtprotoLinks({ host: s.ip, port: s.port, secret: s.secret }).tg;
    else if (proto === 'socks5') preview = buildSocks5Links({ host: s.ip, port: s.port, pass: s.secret }).tg;
    else preview = (s.template || defaultTemplate(proto, s.ip, s.port)).slice(0, 200);
  } catch {
    preview = '⛔ لینک ساخته نشد (اطلاعات ناقص)';
  }
  const secretState = s.secret ? (proto === 'mtproto' ? (isValidMtprotoSecret(s.secret) ? '✅ معتبر' : '⛔ نامعتبر') : '✅ ثبت شده') : '⛔ ثبت نشده';
  const text = [
    `🖥 <b>${s.name}</b>\n`,
    `🌍 ${s.country || '—'} | پروتکل: <code>${s.protocol}</code>`,
    `🌐 هاست/IP: <code>${s.ip || '—'}</code>`,
    `🔌 پورت: <code>${s.port || '—'}</code>`,
    `🔑 سکرت/پسورد: ${secretState}`,
    `📋 لینک/قالب:\n<code>${String(preview).replace(/</g, '&lt;')}</code>`,
    `🩺 آدرس سلامت: ${s.health_url || 'تنظیم نشده'}`,
    `🚀 رتبه سرعت: ${faDigits(s.speed_rank)} | وضعیت: ${s.active ? (s.healthy ? '🟢 فعال و سالم' : '🟡 فعال/ناسالم') : '🔴 غیرفعال'}`,
    issues.length ? `\n⚠️ <b>مشکلات پیکربندی:</b>\n${issues.map((i) => '• ' + i).join('\n')}\n\n⛔ تا رفع این موارد، این سرور به هیچ کاربری تحویل داده نمی‌شود.` : '\n✅ این سرور برای تحویل واقعی آماده است.',
  ].join('\n');
  const rows = [
    [btn('✏️ نام', `adm:sf:${id}:name`), btn('🌍 کشور', `adm:sf:${id}:country`)],
    [btn('🌐 هاست/IP', `adm:sf:${id}:ip`), btn('🔌 پورت', `adm:sf:${id}:port`)],
    [btn('🔑 سکرت/پسورد', `adm:sf:${id}:secret`), btn('📋 قالب', `adm:sf:${id}:template`)],
    [btn('🩺 آدرس سلامت', `adm:sf:${id}:health_url`), btn('🚀 رتبه سرعت', `adm:sf:${id}:speed_rank`)],
    [btn(s.healthy ? '🟡 علامت ناسالم' : '🟢 علامت سالم', `adm:sh:${id}`), btn(s.active ? '🔴 غیرفعال' : '🟢 فعال', `adm:sa:${id}`)],
    [btn('🗑 حذف سرور', `adm:sdc:${id}`), btn('📋 لیست', 'adm:servers')],
  ];
  if (editMsg) await editText(ctx.token, ctx.user.id, editMsg.message_id, text, { reply_markup: ikb(rows) });
  else await send(ctx.token, ctx.user.id, text, { reply_markup: ikb(rows) });
}

// ─────────────────────────── کاربران ───────────────────────────
async function usersMenu(ctx, editMsg) {
  const recent = (await ctx.db.prepare('SELECT * FROM users ORDER BY created_at DESC LIMIT 8').all()).results;
  const rows = recent.map((u) => [btn(`${u.banned ? '⛔' : '👤'} ${u.first_name || u.username || u.id}`, `adm:u:${u.id}`)]);
  rows.push([btn('🔍 جستجو با آیدی', 'adm:u:find')]);
  const total = (await ctx.db.prepare('SELECT COUNT(*) c FROM users').first())?.c || 0;
  const text = `👥 <b>مدیریت کاربران</b> — مجموع: ${faDigits(total)}\nآخرین کاربران:`;
  if (editMsg) await editText(ctx.token, ctx.user.id, editMsg.message_id, text, { reply_markup: menuKb(rows, 'panel') });
  else await send(ctx.token, ctx.user.id, text, { reply_markup: menuKb(rows, 'panel') });
}

export async function userView(ctx, id, editMsg) {
  const u = await getUser(ctx.db, id);
  if (!u) {
    const t = '❌ کاربر یافت نشد.';
    return editMsg ? editText(ctx.token, ctx.user.id, editMsg.message_id, t, { reply_markup: menuKb([], 'panel') }) : send(ctx.token, ctx.user.id, t);
  }
  const subs = (await ctx.db.prepare('SELECT COUNT(*) c FROM subscriptions WHERE user_id=? AND active=1 AND expire_at>?').bind(id, now()).first())?.c || 0;
  const text = [
    `👤 <b>${u.first_name || '—'}</b> ${u.username ? '@' + u.username : ''}\n`,
    `🆔 <code>${u.id}</code>`,
    `👑 نقش: ${u.role === 'super' ? 'سوپرادمین' : u.role === 'admin' ? 'ادمین' : 'کاربر'}${u.banned ? ' | ⛔ بن' : ''}`,
    `👛 کیف پول: ${fmtToman(u.balance)} | 🪙 سکه: ${faDigits(u.coins)}`,
    `💵 مجموع خرید: ${fmtToman(u.total_paid)} | 📦 اشتراک فعال: ${faDigits(subs)}`,
    `👥 دعوت‌ها: ${faDigits(u.invited_count)} | 🕐 ${fmtDate(u.created_at)}`,
  ].join('\n');
  const rows = [
    [btn(u.banned ? '🟢 رفع بن' : '⛔ بن کردن', `adm:ub:${u.id}`), btn('💳 شارژ کیف پول', `adm:uc:${u.id}`)],
    [btn('🪙 اعطای سکه', `adm:ug:${u.id}`), btn('🎁 اعطای کانفیگ', `adm:us:${u.id}`)],
  ];
  if (ctx.user.role === 'super' && u.role === 'user') rows.push([btn('🛡 ادمین کن', `adm:mk:${u.id}`)]);
  rows.push([btn('📋 لیست کاربران', 'adm:users')]);
  if (editMsg) await editText(ctx.token, ctx.user.id, editMsg.message_id, text, { reply_markup: ikb(rows) });
  else await send(ctx.token, ctx.user.id, text, { reply_markup: ikb(rows) });
}

async function giftSubPick(ctx, uid, editMsg) {
  const ps = (await ctx.db.prepare("SELECT * FROM products WHERE enabled=1 AND category!='coin' ORDER BY price_usd LIMIT 12").all()).results;
  const rows = [];
  for (let i = 0; i < ps.length; i += 2) {
    const row = [btn(ps[i].title.slice(0, 22), `adm:gift:${uid}:${ps[i].id}`)];
    if (ps[i + 1]) row.push(btn(ps[i + 1].title.slice(0, 22), `adm:gift:${uid}:${ps[i + 1].id}`));
    rows.push(row);
  }
  const text = `🎁 محصولی که به کاربر ${faDigits(uid)} هدیه داده شود:`;
  if (editMsg) await editText(ctx.token, ctx.user.id, editMsg.message_id, text, { reply_markup: menuKb(rows, 'panel') });
  else await send(ctx.token, ctx.user.id, text, { reply_markup: menuKb(rows, 'panel') });
}

// ─────────────────────────── ادمین‌ها ───────────────────────────
async function adminsList(ctx, editMsg) {
  const as = (await ctx.db.prepare("SELECT * FROM users WHERE role IN ('super','admin') ORDER BY created_at").all()).results;
  const rows = as.map((a) => [btn(`${a.role === 'super' ? '👑' : '🛡'} ${a.first_name || a.id}`, a.role === 'super' ? 'noop' : `adm:adm:${a.id}`)]);
  rows.push([btn('➕ افزودن ادمین', 'adm:adm:new')]);
  const text = '👮 <b>مدیریت ادمین‌ها و سطوح دسترسی</b>\n\nبرای تغییر دسترسی یک ادمین را انتخاب کنید:';
  if (editMsg) await editText(ctx.token, ctx.user.id, editMsg.message_id, text, { reply_markup: menuKb(rows, 'panel') });
  else await send(ctx.token, ctx.user.id, text, { reply_markup: menuKb(rows, 'panel') });
}

async function adminView(ctx, id, editMsg) {
  const u = await getUser(ctx.db, id);
  if (!u || u.role === 'user') return answerCb(ctx.token, ctx.cbId, 'ادمین نیست');
  let perms = [];
  try {
    perms = JSON.parse(u.perms || '[]');
  } catch {}
  const rows = ALL_PERMS.map((p) => [btn(`${perms.includes(p) ? '✅' : '⬜'} ${PERM_LABELS[p]}`, `adm:perm:${id}:${p}`)]);
  rows.push([btn('🗑 حذف ادمین', `adm:adm:del:${id}`), btn('🔙', 'adm:admins')]);
  const text = `🛡 <b>${u.first_name || id}</b> (<code>${id}</code>)\nسطوح دسترسی را انتخاب/حذف کنید:`;
  if (editMsg) await editText(ctx.token, ctx.user.id, editMsg.message_id, text, { reply_markup: ikb(rows) });
  else await send(ctx.token, ctx.user.id, text, { reply_markup: ikb(rows) });
}

// ─────────────────────────── گروه‌ها ───────────────────────────
async function groupsMenu(ctx, editMsg) {
  const gs = (await ctx.db.prepare('SELECT * FROM groups ORDER BY created_at DESC').all()).results;
  const rows = gs.map((g) => [btn(`${g.enabled ? '🟢' : '🔴'} ${g.title || g.chat_id}`, `adm:grp:${g.chat_id}`)]);
  rows.push([btn('➕ ثبت گروه جدید', 'adm:grp:new')]);
  rows.push([btn('📣 پست فوری در همه گروه‌ها', 'adm:grp:postnow')]);
  const text = '📢 <b>مدیریت گروه‌های تبلیغاتی</b>\n\nبات را در گروه عضو کنید؛ گروه‌های دارای عضویت بات اینجا ثبت می‌شوند یا دستی اضافه کنید.';
  if (editMsg) await editText(ctx.token, ctx.user.id, editMsg.message_id, text, { reply_markup: menuKb(rows, 'panel') });
  else await send(ctx.token, ctx.user.id, text, { reply_markup: menuKb(rows, 'panel') });
}

async function groupView(ctx, chatId, editMsg) {
  const g = await ctx.db.prepare('SELECT * FROM groups WHERE chat_id=?').bind(chatId).first();
  if (!g) return answerCb(ctx.token, ctx.cbId, 'یافت نشد');
  const text = `📢 گروه: <b>${g.title || chatId}</b>\n🆔 <code>${chatId}</code>\nوضعیت تبلیغات: ${g.enabled ? '🟢 فعال' : '🔴 غیرفعال'}\nآخرین پست: ${g.last_post ? fmtDate(g.last_post) : '—'}`;
  const rows = [
    [btn(g.enabled ? '🔴 غیرفعال کردن تبلیغ' : '🟢 فعال کردن تبلیغ', `adm:grpt:${g.chat_id}`)],
    [btn('📣 همین حالا پست کن', `adm:grpp:${g.chat_id}`), btn('🗑 حذف گروه', `adm:grpd:${g.chat_id}`)],
    [btn('🔙', 'adm:groups')],
  ];
  if (editMsg) await editText(ctx.token, ctx.user.id, editMsg.message_id, text, { reply_markup: ikb(rows) });
  else await send(ctx.token, ctx.user.id, text, { reply_markup: ikb(rows) });
}

// ─────────────────────────── تنظیمات ───────────────────────────
async function settingsMenu(ctx, editMsg) {
  const margin = await getSettingValue(ctx.db, 'margin');
  const rate = await getSettingValue(ctx.db, 'usd_rate_manual');
  const refp = await getSettingValue(ctx.db, 'referral_percent');
  const toggles = [
    ['shop_enabled', '🛍 فروشگاه'],
    ['trial_enabled', '🎁 تست رایگان'],
    ['referral_enabled', '👥 رفرال'],
    ['ai_enabled', '🤖 چت هوش مصنوعی'],
    ['game_enabled', '🎮 مینی‌اپ'],
    ['card_pay_enabled', '💳 پرداخت کارتی'],
    ['wallet_enabled', '👛 کیف پول'],
    ['group_welcome_enabled', '👋 خوش‌آمد گروه'],
    ['group_ai_enabled', '🤖 هوش مصنوعی در گروه'],
    ['panel_enabled', '🖥 پنل تحت وب'],
    ['auto_verify', '🤖 تایید خودکار فیش'],
  ];
  const states = {};
  for (const [k] of toggles) states[k] = (await getSettingValue(ctx.db, k)) === '1';
  const rows = [
    [btn('💵 نرخ دلار دستی', 'adm:setv:usd_rate_manual'), btn('📈 مارجین سود', 'adm:setv:margin')],
    [btn('👥 درصد رفرال', 'adm:setv:referral_percent'), btn('🎯 هدف دعوت', 'adm:setv:referral_goal')],
    [btn('🪙 هزینه پیام AI', 'adm:setv:ai_price_coins'), btn('⏰ فاصله تبلیغ (ساعت)', 'adm:setv:ad_interval_hours')],
    [btn('💳 شماره کارت', 'adm:setv:card_number'), btn('👤 صاحب کارت', 'adm:setv:card_holder')],
    [btn('📢 متن تبلیغ', 'adm:setv:ad_text'), btn('🖼 آدرس بنر تبلیغ', 'adm:setv:ad_photo_url')],
    [btn('⏳ فاصله پاسخ AI در گروه (ثانیه)', 'adm:setv:group_ai_cooldown')],
    [btn('🔐 رمز پنل وب (۱۰ رقم)', 'adm:setv:panel_password')],
    [btn('✍️ متن‌های بات', 'adm:texts')],
  ];
  for (let i = 0; i < toggles.length; i += 2) {
    const row = [btn(`${states[toggles[i][0]] ? '🟢' : '🔴'} ${toggles[i][1]}`, `adm:tog:${toggles[i][0]}`)];
    if (toggles[i + 1]) row.push(btn(`${states[toggles[i + 1][0]] ? '🟢' : '🔴'} ${toggles[i + 1][1]}`, `adm:tog:${toggles[i + 1][0]}`));
    rows.push(row);
  }
  const text = `⚙️ <b>تنظیمات</b>\n\n💵 نرخ دستی دلار: ${rate === '0' ? 'خودکار (API)' : faDigits(rate)} | 📈 مارجین: ×${faDigits(margin)} | 👥 رفرال: ${faDigits(refp)}٪`;
  if (editMsg) await editText(ctx.token, ctx.user.id, editMsg.message_id, text, { reply_markup: menuKb(rows, 'panel') });
  else await send(ctx.token, ctx.user.id, text, { reply_markup: menuKb(rows, 'panel') });
}

async function textsMenu(ctx, editMsg) {
  const keys = [
    ['start_welcome', '🌟 خوش‌آمد'],
    ['shop_welcome', '🛍 فروشگاه'],
    ['support_text', '📞 پشتیبانی'],
    ['referral_intro', '👥 رفرال'],
    ['pay_intro', '💳 پرداخت'],
    ['trial_ok', '🎁 تست رایگان'],
    ['group_welcome', '👋 خوش‌آمد گروه'],
    ['reminder_text', '⏰ یادآوری'],
    ['bot_name', '🤖 نام بات'],
    ['bot_description', '📄 توضیحات بات'],
    ['bot_short', '✒️ توضیح کوتاه بات'],
  ];
  const rows = [];
  for (let i = 0; i < keys.length; i += 2) {
    const row = [btn(keys[i][1], `adm:text:${keys[i][0]}`)];
    if (keys[i + 1]) row.push(btn(keys[i + 1][1], `adm:text:${keys[i + 1][0]}`));
    rows.push(row);
  }
  const text = '✍️ <b>تغییر متن‌های بات</b>\n\nمتن مورد نظر را انتخاب کنید؛ متن فعلی نمایش داده و متن جدید را ارسال می‌کنید:';
  if (editMsg) await editText(ctx.token, ctx.user.id, editMsg.message_id, text, { reply_markup: menuKb(rows, 'panel') });
  else await send(ctx.token, ctx.user.id, text, { reply_markup: menuKb(rows, 'panel') });
}

// ─────────────────────────── خروجی ───────────────────────────
async function exportMenu(ctx, editMsg) {
  const rows = [
    [btn('👥 خروجی کاربران (CSV)', 'adm:exp:users'), btn('🧾 خروجی فروش (CSV)', 'adm:exp:orders')],
    [btn('🗄 خروجی کامل (JSON)', 'adm:exp:full')],
  ];
  const text = '📤 <b>خروجی دیتابیس</b>';
  if (editMsg) await editText(ctx.token, ctx.user.id, editMsg.message_id, text, { reply_markup: menuKb(rows, 'panel') });
  else await send(ctx.token, ctx.user.id, text, { reply_markup: menuKb(rows, 'panel') });
}

async function doExport(ctx, kind) {
  let name, content, mime = 'text/csv; charset=utf-8';
  if (kind === 'users') {
    const us = (await ctx.db.prepare('SELECT id, username, first_name, role, balance, coins, total_paid, invited_count, banned, created_at FROM users').all()).results;
    content = 'id,username,first_name,role,balance,coins,total_paid,invited_count,banned,created_at\n' + us.map((u) => Object.values(u).join(',')).join('\n');
    name = 'users.csv';
  } else if (kind === 'orders') {
    const os = (await ctx.db.prepare("SELECT id, user_id, title, amount_toman, method, status, created_at, paid_at FROM orders WHERE status='paid'").all()).results;
    content = 'id,user_id,title,amount_toman,method,status,created_at,paid_at\n' + os.map((o) => Object.values(o).join(',')).join('\n');
    name = 'sales.csv';
  } else {
    const dump = {};
    for (const t of ['users', 'orders', 'subscriptions', 'receipts', 'servers', 'products', 'groups', 'settings']) {
      dump[t] = (await ctx.db.prepare(`SELECT * FROM ${t}`).all()).results;
    }
    content = JSON.stringify(dump, null, 1);
    name = 'full-dump.json';
    mime = 'application/json; charset=utf-8';
  }
  const form = new FormData();
  form.append('chat_id', String(ctx.user.id));
  form.append('caption', `📤 خروجی ${name} — ${fmtDate(now())}`);
  form.append('document', new Blob([content], { type: mime }), name);
  await tg(ctx.token, 'sendDocument', {}, form);
  await answerCb(ctx.token, ctx.cbId, '✅ ارسال شد');
}

// ─────────────────────────── روتر کال‌بک ادمین ───────────────────────────
export async function handleAdminCallback(ctx, data) {
  const msg = ctx.update.callback_query.message;
  const edit = msg && !msg.via_bot ? msg : null;

  if (data === 'panel') return openAdminPanel(ctx, edit);
  if (data === 'noop') return answerCb(ctx.token, ctx.cbId);

  const need = (perm) => {
    if (!hasPerm(ctx.user, perm)) {
      answerCb(ctx.token, ctx.cbId, '⛔ دسترسی ندارید');
      return false;
    }
    return true;
  };

  if (data === 'adm:stats') return need('stats') && showStats(ctx, edit);
  if (data === 'adm:rcpts') return need('receipts') && receiptsList(ctx, edit);
  if (data.startsWith('rcpt:v:')) return need('receipts') && viewReceipt(ctx, Number(data.slice(7)), edit);
  if (data.startsWith('rcpt:a:') || data.startsWith('rcpt:r:')) return need('receipts') && handleReceiptAction(ctx, data[5], Number(data.slice(7)));
  if (data === 'adm:prods') return need('products') && productsList(ctx, edit);
  if (data === 'adm:prod:new') return need('products') && newProductWizard(ctx, edit);
  if (data.startsWith('adm:prod:')) return need('products') && productView(ctx, Number(data.slice(9)), edit);
  if (data.startsWith('adm:pt:')) {
    if (!need('products')) return;
    const id = Number(data.slice(7));
    await ctx.db.prepare('UPDATE products SET enabled = 1 - enabled WHERE id=?').bind(id).run();
    return productView(ctx, id, edit);
  }
  if (data.startsWith('adm:pd:')) {
    if (!need('products')) return;
    const id = Number(data.slice(7));
    await ctx.db.prepare('DELETE FROM products WHERE id=?').bind(id).run();
    return productsList(ctx, edit);
  }
  if (data.startsWith('adm:pf:')) {
    if (!need('products')) return;
    const [, , id, field] = data.split(':');
    await setState(ctx, `admin:pf:${id}:${field}`);
    return send(ctx.token, ctx.user.id, `✏️ مقدار جدید برای «${field}» را بفرستید:`);
  }
  if (data === 'adm:servers') return need('products') && serversList(ctx, edit);
  if (data === 'adm:srv:new') return need('products') && newServerWizard(ctx, edit);
  if (data.startsWith('adm:srv:')) return need('products') && serverView(ctx, Number(data.slice(8)), edit);
  if (data.startsWith('adm:sf:')) {
    if (!need('products')) return;
    const [, , id, field] = data.split(':');
    await setState(ctx, `admin:sf:${id}:${field}`);
    return send(ctx.token, ctx.user.id, `✏️ مقدار جدید «${field}» را بفرستید:\n(برای قالب کانفیگ از {uuid} و {name} استفاده کنید)`);
  }
  if (data.startsWith('adm:sh:')) {
    if (!need('products')) return;
    const id = Number(data.slice(7));
    await ctx.db.prepare('UPDATE servers SET healthy = 1 - healthy WHERE id=?').bind(id).run();
    return serverView(ctx, id, edit);
  }
  if (data.startsWith('adm:sa:')) {
    if (!need('products')) return;
    const id = Number(data.slice(7));
    const srv = await ctx.db.prepare('SELECT * FROM servers WHERE id=?').bind(id).first();
    if (srv && !srv.active) {
      // ⛔ قبل از فعال‌کردن، اعتبار تنظیمات بررسی می‌شود
      const issues = serverIssues(srv);
      if (issues.length) {
        await answerCb(ctx.token, ctx.cbId, '⛔ پیکربندی ناقص');
        await send(ctx.token, ctx.user.id, `⛔ این سرور قابل فعال‌سازی نیست:\n${issues.map((i) => '• ' + i).join('\n')}`);
        return serverView(ctx, id, edit);
      }
    }
    await ctx.db.prepare('UPDATE servers SET active = 1 - active WHERE id=?').bind(id).run();
    return serverView(ctx, id, edit);
  }
  if (data.startsWith('adm:sdc:')) {
    if (!need('products')) return;
    const id = Number(data.slice(8));
    const srv = await ctx.db.prepare('SELECT name FROM servers WHERE id=?').bind(id).first();
    return send(ctx.token, ctx.user.id, `⚠️ آیا از حذف سرور «${srv?.name || id}» مطمئن هستید؟ این کار برگشت‌پذیر نیست.`, {
      reply_markup: ikb([[btn('🗑 بله، حذف کن', `adm:sd:${id}`), btn('↩️ انصراف', `adm:srv:${id}`)]]),
    });
  }
  if (data.startsWith('adm:sd:')) {
    if (!need('products')) return;
    const id = Number(data.slice(7));
    await ctx.db.prepare('DELETE FROM servers WHERE id=?').bind(id).run();
    return serversList(ctx, edit);
  }
  if (data === 'adm:users') return need('users') && usersMenu(ctx, edit);
  if (data === 'adm:u:find') {
    if (!need('users')) return;
    await setState(ctx, 'admin:u_find');
    return send(ctx.token, ctx.user.id, '🔍 آیدی عددی کاربر را بفرستید:');
  }
  if (data.startsWith('adm:u:')) return need('users') && userView(ctx, Number(data.slice(6)), edit);
  if (data.startsWith('adm:ub:')) {
    if (!need('users')) return;
    const id = Number(data.slice(7));
    await ctx.db.prepare('UPDATE users SET banned = 1 - banned WHERE id=? AND role="user"').bind(id).run();
    return userView(ctx, id, edit);
  }
  if (data.startsWith('adm:uc:')) {
    if (!need('users')) return;
    await setState(ctx, `admin:charge:${data.slice(7)}`);
    return send(ctx.token, ctx.user.id, '💳 مبلغ شارژ کیف پول را به تومان بفرستید (عدد منفی = کسر):');
  }
  if (data.startsWith('adm:ug:')) {
    if (!need('users')) return;
    await setState(ctx, `admin:coins:${data.slice(7)}`);
    return send(ctx.token, ctx.user.id, '🪙 تعداد سکه برای اهدا را بفرستید:');
  }
  if (data.startsWith('adm:us:')) return need('users') && giftSubPick(ctx, Number(data.slice(7)), edit);
  if (data.startsWith('adm:gift:')) {
    if (!need('users')) return;
    const [, , uid, pid] = data.split(':');
    const u = await getUser(ctx.db, Number(uid));
    const p = await ctx.db.prepare('SELECT * FROM products WHERE id=?').bind(Number(pid)).first();
    if (u && p) {
      try {
        const gift = await createSubscription(ctx.env, u, p, {});
        await send(ctx.token, u.id, `🎁 یک اشتراک «${p.title}» به عنوان هدیه به حساب شما اضافه شد!`);
        await sendDelivery(ctx.env, u, p.title, gift, { protocol: p.protocol });
      } catch (e) {
        if (e instanceof NoRealServerError) {
          await send(ctx.token, ctx.user.id, `⛔ ${e.message}`);
          return answerCb(ctx.token, ctx.cbId, '⛔ سرور واقعی نیست');
        }
        throw e;
      }
    }
    return answerCb(ctx.token, ctx.cbId, '🎁 اهدا شد');
  }
  if (data.startsWith('adm:mk:')) {
    if (ctx.user.role !== 'super') return answerCb(ctx.token, ctx.cbId, 'فقط سوپرادمین');
    const id = Number(data.slice(7));
    await ctx.db.prepare(`UPDATE users SET role='admin', perms=? WHERE id=?`).bind(JSON.stringify(['receipts', 'stats']), id).run();
    return userView(ctx, id, edit);
  }
  if (data === 'adm:admins') return need('admins') && adminsList(ctx, edit);
  if (data === 'adm:adm:new') {
    if (!need('admins')) return;
    await setState(ctx, 'admin:addadmin');
    return send(ctx.token, ctx.user.id, '👮 آیدی عددی کاربر را برای ادمین شدن بفرستید:\n(کاربر باید قبلاً بات را استارت کرده باشد)');
  }
  if (data.startsWith('adm:adm:del:')) {
    if (!need('admins')) return;
    const id = Number(data.slice(12));
    await ctx.db.prepare(`UPDATE users SET role='user', perms='[]' WHERE id=? AND role='admin'`).bind(id).run();
    return adminsList(ctx, edit);
  }
  if (data.startsWith('adm:adm:')) return need('admins') && adminView(ctx, Number(data.slice(8)), edit);
  if (data.startsWith('adm:perm:')) {
    if (!need('admins')) return;
    const [, , id, perm] = data.split(':');
    const u = await getUser(ctx.db, Number(id));
    let perms = [];
    try {
      perms = JSON.parse(u.perms || '[]');
    } catch {}
    perms = perms.includes(perm) ? perms.filter((p) => p !== perm) : [...perms, perm];
    await ctx.db.prepare('UPDATE users SET perms=? WHERE id=?').bind(JSON.stringify(perms), Number(id)).run();
    return adminView(ctx, Number(id), edit);
  }
  if (data === 'adm:groups') return need('groups') && groupsMenu(ctx, edit);
  if (data === 'adm:grp:new') {
    if (!need('groups')) return;
    await setState(ctx, 'admin:addgroup');
    return send(ctx.token, ctx.user.id, '📢 آیدی عددی گروه (مثل -1001234567890) را بفرستید.\nبات باید عضو آن گروه باشد.');
  }
  if (data === 'adm:grp:postnow') {
    if (!need('groups')) return;
    const { postAdsNow } = await import('./group.js');
    const n = await postAdsNow(ctx.env);
    return answerCb(ctx.token, ctx.cbId, `📣 در ${n} گروه پست شد`);
  }
  if (data.startsWith('adm:grp:')) return need('groups') && groupView(ctx, Number(data.slice(8)), edit);
  if (data.startsWith('adm:grpt:')) {
    if (!need('groups')) return;
    const id = Number(data.slice(9));
    await ctx.db.prepare('UPDATE groups SET enabled = 1 - enabled WHERE chat_id=?').bind(id).run();
    return groupView(ctx, id, edit);
  }
  if (data.startsWith('adm:grpp:')) {
    if (!need('groups')) return;
    const { postAdToGroup } = await import('./group.js');
    await postAdToGroup(ctx.env, Number(data.slice(9)));
    return answerCb(ctx.token, ctx.cbId, '📣 پست شد');
  }
  if (data.startsWith('adm:grpd:')) {
    if (!need('groups')) return;
    const id = Number(data.slice(9));
    await ctx.db.prepare('DELETE FROM groups WHERE chat_id=?').bind(id).run();
    return groupsMenu(ctx, edit);
  }
  if (data === 'adm:set') return need('settings') && settingsMenu(ctx, edit);
  if (data.startsWith('adm:tog:')) {
    if (!need('settings')) return;
    const k = data.slice(8);
    const cur = (await getSettingValue(ctx.db, k)) === '1';
    await ctx.db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(k, cur ? '0' : '1').run();
    return settingsMenu(ctx, edit);
  }
  if (data.startsWith('adm:setv:')) {
    if (!need('settings')) return;
    const k = data.slice(9);
    await setState(ctx, `admin:setv:${k}`);
    return send(ctx.token, ctx.user.id, `⚙️ مقدار جدید «${k}» را بفرستید:`);
  }
  if (data === 'adm:texts') return need('settings') && textsMenu(ctx, edit);
  if (data.startsWith('adm:text:')) {
    if (!need('settings')) return;
    const k = data.slice(9);
    const cur = await getText(ctx.db, k);
    await setState(ctx, `admin:text:${k}`);
    return send(ctx.token, ctx.user.id, `✍️ متن فعلی «${k}»:\n\n${cur.slice(0, 800)}\n\n—\nمتن جدید را بفرستید (از {name} {amount} و... پشتیبانی می‌شود):`);
  }
  if (data === 'adm:export') return need('export') && exportMenu(ctx, edit);
  if (data.startsWith('adm:exp:')) return need('export') && doExport(ctx, data.slice(8));
  if (data === 'adm:bc') {
    if (ctx.user.role !== 'super') return answerCb(ctx.token, ctx.cbId, 'فقط سوپرادمین');
    await setState(ctx, 'admin:bc');
    return send(ctx.token, ctx.user.id, '📣 متن پیام همگانی را بفرستید. (برای همه کاربران ارسال می‌شود — با احتیاط!)');
  }
  if (data.startsWith('adm:reply:')) {
    const uid = data.slice(10);
    await setState(ctx, `admin:reply:${uid}`);
    return send(ctx.token, ctx.user.id, `✍️ پاسخ خود به کاربر <code>${uid}</code> را بفرستید:`);
  }
  return answerCb(ctx.token, ctx.cbId);
}

// ─────────────────────────── روتر متن ادمین ───────────────────────────
export async function handleAdminText(ctx, text) {
  const st = ctx.user.state || '';
  const sd = stateData(ctx);

  // ⛔ لغو سراسری هر ورودی ادمین — باید قبل از همه بررسی شود تا مقدار «/cancel» ذخیره نشود
  if (typeof text === 'string' && text.trim() === '/cancel') {
    await setState(ctx, '');
    await send(ctx.token, ctx.user.id, '❌ عملیات لغو شد.', { reply_markup: menuKb([[btn('📊 پنل مدیریت', 'panel')]]) });
    return true;
  }

  if (st.startsWith('admin:reply:')) {
    const uid = Number(st.split(':')[2]);
    await send(ctx.token, uid, `📬 پاسخ پشتیبانی:\n\n${text}`);
    await setState(ctx, '');
    return send(ctx.token, ctx.user.id, '✅ پاسخ ارسال شد.');
  }
  if (st === 'admin:addadmin') {
    const id = Number(text.replace(/[^\d]/g, ''));
    const u = await getUser(ctx.db, id);
    if (!u) return send(ctx.token, ctx.user.id, '❌ کاربر یافت نشد؛ باید ابتدا بات را استارت کرده باشد.');
    await ctx.db.prepare(`UPDATE users SET role='admin', perms=? WHERE id=? AND role='user'`).bind(JSON.stringify(['receipts', 'stats']), id).run();
    await setState(ctx, '');
    await send(ctx.token, id, '🛡 شما به عنوان ادمین انتخاب شدید. دکمه «📊 پنل مدیریت» به منوی شما اضافه شد.');
    return send(ctx.token, ctx.user.id, '✅ ادمین اضافه شد (دسترسی پیش‌فرض: فیش‌ها و آمار).');
  }
  if (st === 'admin:u_find') {
    await setState(ctx, '');
    return userView(ctx, Number(text.replace(/[^\d]/g, '')));
  }
  if (st.startsWith('admin:charge:')) {
    const uid = Number(st.split(':')[2]);
    const amount = parseMoney(text);
    if (!amount) return send(ctx.token, ctx.user.id, '⚠️ عدد معتبر نیست.');
    await addBalance(ctx.db, uid, amount);
    await setState(ctx, '');
    const u = await getUser(ctx.db, uid);
    if (amount > 0) await send(ctx.token, uid, `💳 ${fmtToman(amount)} به کیف پول شما اضافه شد.\nموجودی جدید: ${fmtToman(u.balance + 0)}`);
    return userView(ctx, uid);
  }
  if (st.startsWith('admin:coins:')) {
    const uid = Number(st.split(':')[2]);
    const n = parseMoney(text);
    if (!n) return send(ctx.token, ctx.user.id, '⚠️ عدد معتبر نیست.');
    await addCoins(ctx.db, uid, n);
    await setState(ctx, '');
    await send(ctx.token, uid, `🪙 ${faDigits(n)} سکه به حساب شما اضافه شد!`);
    return userView(ctx, uid);
  }
  if (st === 'admin:addgroup') {
    const id = Number(text);
    if (!id) return send(ctx.token, ctx.user.id, '⚠️ آیدی گروه معتبر نیست.');
    await ctx.db.prepare('INSERT OR REPLACE INTO groups (chat_id, title, enabled, created_at) VALUES (?,?,1,?)').bind(id, `گروه ${id}`, now()).run();
    await setState(ctx, '');
    return send(ctx.token, ctx.user.id, '✅ گروه ثبت شد. پست‌های تبلیغاتی زمان‌بندی‌شده برای آن فعال است.');
  }
  if (st === 'admin:bc') {
    await setState(ctx, '');
    const users = (await ctx.db.prepare('SELECT id FROM users WHERE banned=0').all()).results;
    let ok = 0;
    for (const u of users) {
      const r = await send(ctx.token, u.id, `📣 ${text}`);
      if (r?.ok) ok++;
    }
    return send(ctx.token, ctx.user.id, `✅ برای ${faDigits(ok)} کاربر ارسال شد.`);
  }
  if (st.startsWith('admin:setv:')) {
    const k = st.split(':')[2];
    const val = text.trim();
    // ⛔ اجبار رمز دقیقاً ۱۰ رقمی برای پنل تحت وب
    if (k === 'panel_password' && !isValidPanelPassword(val)) {
      return send(
        ctx.token,
        ctx.user.id,
        '⛔ رمز پنل وب باید <b>دقیقاً ۱۰ رقم عددی</b> باشد (بدون حرف، فاصله یا علامت).\nمثال: <code>1234567890</code>\n\nدوباره بفرستید یا /cancel کنید.'
      );
    }
    await ctx.db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(k, val).run();
    await setState(ctx, '');
    if (k === 'panel_password') {
      const base = await getBase(ctx.env);
      return send(ctx.token, ctx.user.id, `✅ رمز پنل وب ذخیره شد.\n🖥 آدرس پنل: ${base ? `${base}/panel` : '/panel'}\n🔐 رمز: <code>${val}</code>`, {
        reply_markup: menuKb([[btn('⚙️ بازگشت به تنظیمات', 'adm:set')]]),
      });
    }
    return send(ctx.token, ctx.user.id, '✅ ذخیره شد.', { reply_markup: menuKb([[btn('⚙️ بازگشت به تنظیمات', 'adm:set')]]) });
  }
  if (st.startsWith('admin:text:')) {
    const k = st.split(':')[2];
    await ctx.db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(`text:${k}`, text).run();
    await setState(ctx, '');
    return send(ctx.token, ctx.user.id, '✅ متن ذخیره شد.', { reply_markup: menuKb([[btn('✍️ متن‌ها', 'adm:texts')]]) });
  }
  if (st.startsWith('admin:pf:')) {
    const [, , id, field] = st.split(':');
    await setState(ctx, '');
    if (field === 'title') await ctx.db.prepare('UPDATE products SET title=? WHERE id=?').bind(text, Number(id)).run();
    if (field === 'price') await ctx.db.prepare('UPDATE products SET price_usd=? WHERE id=?').bind(Number(text) || 0, Number(id)).run();
    if (field === 'days') await ctx.db.prepare('UPDATE products SET days=? WHERE id=?').bind(Number(text) || 30, Number(id)).run();
    if (field === 'traffic') await ctx.db.prepare('UPDATE products SET traffic_gb=? WHERE id=?').bind(Number(text) || 0, Number(id)).run();
    return productView(ctx, Number(id));
  }
  if (st.startsWith('admin:sf:')) {
    const [, , id, field] = st.split(':');
    const map = { name: 'name', country: 'country', ip: 'ip', port: 'port', secret: 'secret', template: 'template', health_url: 'health_url', speed_rank: 'speed_rank' };
    if (!map[field]) {
      await setState(ctx, '');
      return serverView(ctx, Number(id));
    }
    const raw = text.trim();
    let value = raw;
    if (field === 'port') {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1 || n > 65535) {
        return send(ctx.token, ctx.user.id, '⛔ پورت باید عددی بین ۱ تا ۶۵۵۳۵ باشد. دوباره بفرستید یا /cancel کنید.');
      }
      value = n;
    }
    if (field === 'speed_rank') value = Math.min(5, Math.max(1, Number(raw) || 3));
    if (field === 'secret') {
      const srv = await ctx.db.prepare('SELECT protocol FROM servers WHERE id=?').bind(Number(id)).first();
      if (String(srv?.protocol).toLowerCase() === 'mtproto' && raw !== '-' && !isValidMtprotoSecret(raw)) {
        return send(
          ctx.token,
          ctx.user.id,
          '⛔ سکرت MTProto معتبر نیست.\nفرمت‌های مجاز:\n• ۳۲ کاراکتر هگز\n• <code>dd</code> + ۳۲ هگز\n• <code>ee</code> + ۳۲ هگز + هگزِ دامنه (FakeTLS)\n\nدوباره بفرستید یا /cancel کنید.'
        );
      }
      if (raw === '-') value = '';
    }
    await setState(ctx, '');
    await ctx.db.prepare(`UPDATE servers SET ${map[field]}=? WHERE id=?`).bind(value, Number(id)).run();
    return serverView(ctx, Number(id));
  }
  if (st === 'admin:newprod') {
    const f = { ...sd.f };
    const step = sd.step || 1;
    if (step === 1) {
      f.title = text.trim();
      await setState(ctx, 'admin:newprod', { step: 2, f });
      const rows = [];
      for (let i = 0; i < CATS.length - 1; i += 2) {
        const row = [btn(CATS[i].label, `npw:cat:${CATS[i].id}`)];
        if (CATS[i + 1] && CATS[i + 1].id !== 'custom') row.push(btn(CATS[i + 1].label, `npw:cat:${CATS[i + 1].id}`));
        if (row.length) rows.push(row);
      }
      rows.push([btn('🪙 محصول فروشگاه سکه‌ای', 'npw:cat:coin')]);
      return send(ctx.token, ctx.user.id, '۲) دسته‌بندی را انتخاب کنید:', { reply_markup: menuKb(rows) });
    }
  }
  if (st === 'admin:newsrv') {
    const f = { ...sd.f };
    const step = sd.step || 1;
    const val = text.trim();
    if (step === 1) {
      f.name = val;
      await setState(ctx, 'admin:newsrv', { step: 2, f });
      const rows = [['vless', 'vmess', 'trojan', 'ss'].map((p) => btn(p.toUpperCase(), `nsw:proto:${p}`))];
      rows.push([btn('MTProto', 'nsw:proto:mtproto'), btn('SOCKS5', 'nsw:proto:socks5'), btn('OpenVPN', 'nsw:proto:openvpn')]);
      return send(ctx.token, ctx.user.id, '۲) پروتکل سرور:', { reply_markup: menuKb(rows) });
    }
    if (step === 3) {
      if (!isValidHost(val)) {
        return send(ctx.token, ctx.user.id, '⛔ هاست معتبر نیست (دامنهٔ نمونهٔ example.com پذیرفته نمی‌شود).\\nیک hostname یا IP واقعی بفرستید یا /cancel کنید.');
      }
      f.ip = val;
      await setState(ctx, 'admin:newsrv', { step: 35, f });
      return send(ctx.token, ctx.user.id, `۴) پورت سرور را بفرستید (عدد ۱ تا ۶۵۵۳۵)\\nپیش‌فرض ${defaultPort(f.protocol)} → «-» بفرستید:`);
    }
    if (step === 35) {
      let port = val === '-' || val === '' ? defaultPort(f.protocol) : Number(val);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        return send(ctx.token, ctx.user.id, '⛔ پورت باید عددی بین ۱ تا ۶۵۵۳۵ باشد. دوباره بفرستید یا /cancel کنید.');
      }
      f.port = port;
      const needsSecret = f.protocol === 'mtproto';
      await setState(ctx, 'admin:newsrv', { step: 36, f });
      return send(
        ctx.token,
        ctx.user.id,
        needsSecret
          ? '۵) سکرت واقعی MTProto را بفرستید:\\n• ۳۲ کاراکتر هگز\\n• یا <code>dd</code>+۳۲ هگز\\n• یا <code>ee</code>+۳۲ هگز+هگزِ دامنه (FakeTLS)'
          : '۵) پسورد/سکرت سرور (اختیاری) — برای رد کردن «-» بفرستید:'
      );
    }
    if (step === 36) {
      const secret = val === '-' ? '' : val;
      if (f.protocol === 'mtproto' && !isValidMtprotoSecret(secret)) {
        return send(ctx.token, ctx.user.id, '⛔ سکرت MTProto معتبر نیست. بدون سکرت واقعی، لینک پروکسی ساخته نمی‌شود.\\nدوباره بفرستید یا /cancel کنید.');
      }
      f.secret = secret;
      await setState(ctx, 'admin:newsrv', { step: 4, f });
      if (f.protocol === 'mtproto' || f.protocol === 'socks5') {
        // برای پروتکل‌های مستقیم قالب لازم نیست
        await setState(ctx, 'admin:newsrv', { step: 5, f: { ...f, template: '' } });
        return send(ctx.token, ctx.user.id, '۶) آدرس تست سلامت (اختیاری — برای رد کردن «-» بفرستید):');
      }
      return send(ctx.token, ctx.user.id, '۶) قالب کانفیگ را بفرستید:\\n(از <code>{uuid}</code> برای شناسه یکتا و <code>{name}</code> برای نام استفاده می‌شود)\\nیا «پیش‌فرض» بفرستید:');
    }
    if (step === 4) {
      f.template = !val || val === 'پیش‌فرض' || val === '-' ? defaultTemplate(f.protocol, f.ip, f.port) : val;
      await setState(ctx, 'admin:newsrv', { step: 5, f });
      return send(ctx.token, ctx.user.id, '۷) آدرس تست سلامت (اختیاری — برای رد کردن «-» بفرستید):');
    }
    if (step === 5) {
      f.health_url = val === '-' ? '' : val;
      await setState(ctx, 'admin:newsrv', { step: 6, f });
      return send(ctx.token, ctx.user.id, '۸) رتبه سرعت (۱=پرسرعت‌ترین تا ۵):');
    }
    if (step === 6 || step === 7) {
      f.speed_rank = Math.min(5, Math.max(1, Number(val) || 3));
      const candidate = { name: f.name, protocol: f.protocol, ip: f.ip, port: f.port, secret: f.secret, template: f.template };
      const issues = serverIssues(candidate);
      // ⛔ سرور ناقص هرگز فعال ذخیره نمی‌شود
      const active = issues.length ? 0 : 1;
      await ctx.db
        .prepare('INSERT INTO servers (name, country, protocol, ip, port, secret, template, health_url, speed_rank, active, healthy) VALUES (?,?,?,?,?,?,?,?,?,?,1)')
        .bind(f.name, f.country || '', f.protocol, f.ip, f.port || 0, f.secret || '', f.template || '', f.health_url || '', f.speed_rank, active)
        .run();
      await setState(ctx, '');
      const msg = issues.length
        ? `⚠️ سرور «${f.name}» ذخیره شد اما <b>غیرفعال</b> است:\n${issues.map((i) => '• ' + i).join('\n')}`
        : `✅ سرور «${f.name}» اضافه و فعال شد.`;
      return send(ctx.token, ctx.user.id, msg, { reply_markup: menuKb([[btn('🖥 سرورها', 'adm:servers')]]) });
    }
  }
  return null; // ادامه رسیدگی در لایه کاربر
}

// کال‌بک‌های ویزارد محصول/سرور
export async function handleWizardCallback(ctx, data) {
  const sd = stateData(ctx);
  const f = { ...sd.f };
  if (data.startsWith('npw:cat:')) {
    f.category = data.slice(8);
    f.protocol = f.category;
    await setState(ctx, 'admin:newprod', { step: 3, f });
    return send(ctx.token, ctx.user.id, '۳) مدت اشتراک (روز، عدد):');
  }
  if (data.startsWith('npw:days')) return;
  if (data.startsWith('nsw:proto:')) {
    f.protocol = data.slice(10);
    await setState(ctx, 'admin:newsrv', { step: 3, f });
    return send(ctx.token, ctx.user.id, '۳) IP یا دامنه سرور را بفرستید:');
  }
  return answerCb(ctx.token, ctx.cbId);
}

// ادامه ویزارد محصول از متن (بعد از انتخاب دسته)
export async function continueProductWizard(ctx, text) {
  const sd = stateData(ctx);
  const f = { ...sd.f };
  const step = sd.step;
  if (step === 3) {
    f.days = Number(text) || 30;
    await setState(ctx, 'admin:newprod', { step: 4, f });
    return send(ctx.token, ctx.user.id, '۴) حجم گیگابایت (۰ = نامحدود):');
  }
  if (step === 4) {
    f.traffic_gb = Number(text) || 0;
    await setState(ctx, 'admin:newprod', { step: 5, f });
    return send(ctx.token, ctx.user.id, '۵) قیمت دلاری (مثلاً 1.5):');
  }
  if (step === 5) {
    f.price_usd = Number(text) || 1;
    if (f.category === 'coin') {
      await setState(ctx, 'admin:newprod', { step: 6, f });
      return send(ctx.token, ctx.user.id, '۶) قیمت سکه‌ای (تعداد سکه):');
    }
    return finishProduct(ctx, f);
  }
  if (step === 6) {
    f.coin_price = Number(text) || 0;
    return finishProduct(ctx, f);
  }
}

async function finishProduct(ctx, f) {
  await ctx.db
    .prepare('INSERT INTO products (title, category, protocol, days, traffic_gb, price_usd, coin_price) VALUES (?,?,?,?,?,?,?)')
    .bind(f.title, f.category, f.protocol || f.category, f.days || 30, f.traffic_gb || 0, f.price_usd || 1, f.coin_price || 0)
    .run();
  await setState(ctx, '');
  return send(ctx.token, ctx.user.id, `✅ محصول «${f.title}» ساخته شد.`, { reply_markup: menuKb([[btn('📦 محصولات', 'adm:prods')]]) });
}
