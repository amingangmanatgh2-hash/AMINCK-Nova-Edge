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
import { parseMoney, getBase, isValidPanelPassword, esc } from './util.js';
import { perksAdminPage } from './perks.js';
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
    { perm: 'payments', label: '🏦 درگاه بانکی', cb: 'adm:gw' },
    { perm: 'products', label: '🛡 ضدسانسور', cb: 'adm:anti' },
    { perm: 'creator', label: '🔑 لایسنس کانفیگ‌ساز', cb: 'adm:lic' },
    { perm: 'settings', label: '🔘 دکمه‌های منو', cb: 'adm:btns' },
    { perm: 'settings', label: '🔔 اعلان‌ها', cb: 'adm:ntf' },
    { perm: 'settings', label: '⚙️ تنظیمات', cb: 'adm:set' },
    { perm: 'export', label: '📤 خروجی دیتابیس', cb: 'adm:export' },
    { perm: null, label: '📣 ارسال همگانی', cb: 'adm:bc' },
    { perm: 'settings', label: '🎁 جوایز، گروه، گزارش', cb: 'adm:perks' },
    { perm: 'export', label: '🗒 لاگ ادمین', cb: 'adm:audit' },
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
  const rateLine = rate ? `${faDigits(rate.toLocaleString('en-US'))} تومان` : '⛔ در دسترس نیست (نرخ دستی تنظیم کنید)';
  const text = `📊 <b>پنل مدیریت</b>\n\n👤 ${u.role === 'super' ? '👑 سوپرادمین' : '🛡 ادمین'}: ${u.first_name || u.id}\n💵 نرخ دلار: ${rateLine}\n🖥 سرور واقعی فعال: ${faDigits(realServers)}${warn}`;
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
  const usdLine = rate ? `$${faDigits((monthSales / rate).toFixed(1))}` : '—';
  const text = [
    `📊 <b>آمار فروش</b>\n`,
    `📅 امروز: <b>${fmtToman(daySales)}</b> (${faDigits(dayCount)} سفارش)`,
    `🗓 هفته: <b>${fmtToman(weekSales)}</b>`,
    `📆 ماه: <b>${fmtToman(monthSales)}</b>`,
    `💵 معادل دلاری ماه: <b>${usdLine}</b>\n`,
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
    p.price_mode === 'fixed' ? `📌 حالت قیمت: ثابت (${fmtToman(p.price_toman || 0)})` : '📌 حالت قیمت: خودکار با نرخ دلار',
    p.peg ? `⚖️ پگ: قیمت از ${fmtToman(p.price_toman || 0)} پایین‌تر نمی‌آید` : '',
    `🪙 سطح سکه‌ای: ${tierLabel(p.tier)}${p.min_toman ? ` | کف تومان: ${fmtToman(p.min_toman)}` : ''}`,
    p.description ? `📝 ${String(p.description).slice(0, 200)}` : '',
    p.stock === null || p.stock === undefined ? '📦 موجودی: نامحدود' : `📦 موجودی: ${faDigits(p.stock)} عدد`,
    `⛔ کف قیمت سکه‌ای: حداکثر $${faDigits((await getSettingValue(ctx.db, 'coin_max_usd')) || 1)}${Number(p.coin_lock_premium) ? ' | 🔒 قفل پریمیوم با سکه روشن' : ''}`,
    p.category === 'coin' ? `🪙 قیمت سکه‌ای: ${faDigits(p.coin_price)}` : '',
    `وضعیت: ${p.enabled ? '🟢 فعال' : '🔴 غیرفعال'}`,
  ].join('\n');
  const rows = [
    [btn('✏️ عنوان', `adm:pf:${id}:title`), btn('💵 قیمت دلار', `adm:pf:${id}:price`)],
    [btn('⏱ روز', `adm:pf:${id}:days`), btn('📊 گیگ', `adm:pf:${id}:traffic`)],
    [btn(p.price_mode === 'fixed' ? `💵 ثابت: ${fmtToman(p.price_toman || 0)}` : '💱 نرخ خودکار (دلار)', `adm:pm:${id}`), btn(`🪙 سطح: ${tierLabel(p.tier)}`, `adm:tr:${id}`)],
    [btn('📦 موجودی', `adm:pf:${id}:stock`), btn('🎷 بج', `adm:pf:${id}:badge`)],
    [btn('📝 توضیح', `adm:pf:${id}:desc`), btn('🪙 قیمت سکه‌ای', `adm:pf:${id}:coin`)],
    [btn('🖥 تعداد سرور', `adm:pf:${id}:servers`), btn(Number(p.coin_lock_premium) ? '🔒 قفل سکه‌ای: روشن' : '🔓 قفل سکه‌ای: خاموش', `adm:cl:${id}`)],
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
    ['gateway_enabled', '🏦 درگاه بانکی آنلاین'],
    ['gateway_auto_reconcile', '♻️ تطبیق خودکار پرداخت'],
    ['dashboard_enabled', '🪟 داشبورد در مینی‌اپ'],
    ['inline_enabled', '🔎 حالت Inline'],
    ['variant_check_enabled', '🩺 بررسی خودکار واریانت'],
    ['coin_allow_premium', '🪙 خرید پرمیوم با سکه'],
    ['creator_enabled', '🛠 فروش پنل کانفیگ‌ساز'],
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
    [btn('💰 نرخ طلای دستی', 'adm:setv:gold_rate_manual'), btn('🔗 API نرخ طلا', 'adm:setv:gold_rate_url')],
    [btn('🪙 سقف دلار سکه', 'adm:setv:coin_max_usd'), btn('📦 آستانهٔ هشدار موجودی', 'adm:setv:low_stock_threshold')],
    [btn('🧮 مارجین طلا', 'adm:setv:gold_margin'), btn('🧱 کف قیمت تومان', 'adm:setv:price_floor_toman')],
    [btn('⏱ تایم‌اوت درگاه (ms)', 'adm:setv:gateway_timeout_ms'), btn('🧾 اعتبار لینک پرداخت (دقیقه)', 'adm:setv:gateway_ttl_minutes')],
    [btn('🔢 حداقل کانفیگ هر ساب', 'adm:setv:sub_min_configs'), btn('🚨 آستانهٔ مرگ واریانت', 'adm:setv:variant_fail_limit')],
    [btn('🪟 آدرس داشبورد (اختیاری)', 'adm:setv:dashboard_url'), btn('🏷 متن دکّهٔ داشبورد', 'adm:setv:dashboard_label')],
    [btn('🤖 مدل AI', 'adm:setv:ai_model'), btn('🧾 مسیر callback درگاه', 'adm:setv:gateway_callback_path')],
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

// ─────────────────── 🏦 درگاه بانکی (بخش ۵) ───────────────────
const GW_KEYS = [
  'gateway_provider', 'gateway_merchant_id', 'gateway_api_key', 'gateway_api_base', 'gateway_currency', 'gateway_fee_mode', 'gateway_fee_percent',
  'gateway_timeout_ms', 'gateway_ttl_minutes', 'gateway_callback_path', 'gateway_custom_request', 'gateway_custom_verify',
];
const GW_LABELS = {
  gateway_provider: ['🧪 ارائه‌دهنده درگاه', 'یکی از این‌ها را بفرستید: <code>none</code> (فقط کارت‌به‌کارت) | <code>zarinpal</code> | <code>idpay</code> | <code>custom</code> (قالب آزاد JSON).'],
  gateway_merchant_id: ['🧾 مرچنت‌آیدی / ID فروشندگان', 'از پنل کارگزاری پرداخت بگیرید و همین‌جا بفرستید. (در zarinpal همان merchant_id است؛ در idpay: token درگاه.)'],
  gateway_api_key: ['🔑 کلید API درگاه', 'این مقدار فقط در settings ذخیره می‌شود، در پنل وب ماسک نمایش داده می‌شود و از /api/panel/state خارج است.'],
  gateway_api_base: ['🌐 آدرس پایهٔ API', 'برای zarinpal خالی بگذارید (خودکار: <code>https://api.zarinpal.com</code>). برای custom آدرس کامل سرور درگاه خودتان را بفرستید.'],
  gateway_currency: ['💱 واحد مبلغ به درگاه', '<code>IRT</code> = ریال | <code>ITP</code> = تومان | <code>IRR</code> = دینام ریال قدیمی. zarinpal ریال می‌خواهد.'],
  gateway_fee_mode: ['🧮 کارمزد درگاه', '<code>none</code> | <code>payer</code> (بر عهدهٔ کاربر) | <code>merchant</code> (از سهم شما کم می‌شود و روی قیمت کشیده می‌شود).'],
  gateway_fee_percent: ['📊 درصد کارمزد', 'عدد اعشاری؛ مثلاً <code>0.005</code> یعنی نیم‌درصد (فقط وقتی «مدل کارمزد» روی merchant باشد اثر دارد).'],
  gateway_timeout_ms: ['⏱ تایم‌اوت (میلی‌ثانیه)', 'عدد، مثلاً <code>12000</code>.'],
  gateway_ttl_minutes: ['⏳ اعتبار لینک پرداخت (دقیقه)', 'بعد از این زمان، لینک درگاه در سمت ما منقضی محسوب می‌شود.'],
  gateway_callback_path: ['↩️ مسیر بازگشت', 'مسیر روی همین ورکر که کاربر بعد از پرداخت به آن برمی‌گردد. پیش‌فرض <code>/pay</code> — اگر تغییرش دادید، آدرس callback را در پنل درگاه هم به‌روز کنید.'],
  gateway_custom_request: ['🧬 قالب ساخت پرداخت (custom)', 'JSON کامل، با placeholderها: <code>{amount} {toman} {orderId} {callback} {desc} {merchant} {apiKey} {base}</code>.\nمثال:\n<code>{"url":"{base}/pay","method":"POST","headers":{"X-Key":"{apiKey}"},"body":{"amount":"{amount}","redirect":"{callback}","order_id":"{orderId}"},"authority_path":"data.token","pay_path":"data.url"}</code>'],
  gateway_custom_verify: ['🔎 قالب استعلام (custom)', 'JSON: <code>{"url":"{base}/verify","method":"POST","headers":{"X-Key":"{apiKey}"},"body":{"token":"{authority}"},"paid_path":"data.paid"}</code> — با این، تایید پرداخت سرور‌به‌سرور انجام می‌شود.'],
};

async function gatewayAdmin(ctx, editMsg, note = '') {
  const g = await gatewayConfig(ctx.env);
  const pend = await ctx.db.prepare("SELECT COUNT(*) v FROM gateway_tx WHERE status='redirected' AND created_at>?").bind(now() - 86400).first().then((r) => r?.v || 0).catch(() => 0);
  const txs = await gatewayTxList(ctx.env, 5).catch(() => []);
  const lines = [
    '🏦 <b>درگاه پرداخت بانکی</b>\n',
    `وضعیت: ${g.enabled ? '🟢 فعال' : '🔴 غیرفعال'} | ارائه‌دهنده: <code>${g.provider}</code>`,
    `🌐 پایه: <code>${String(g.base || '(خودکار)').slice(0, 50)}</code> | مسیر بازگشت: <code>${g.invoiceUri}</code>`,
    `🧾 merchant: ${g.merchantId ? '✅ تنظیم شده' : '⛔ تنظیم نشده'} | 🔑 api key: ${g.apiKey ? '✅ تنظیم شده' : '⛔ تنظیم نشده'}`,
    `💱 واحد: ${g.currency} | کارمزد: ${g.feeMode} ${g.feePercent ? `${faDigits(Math.round(Number(g.feePercent) * 10000) / 100)}٪` : ''} | تایم‌اوت: ${faDigits(g.timeoutMs)}ms`,
    `♻️ تسویهٔ خودکار تراکنش‌های معلق: ${(await getSettingValue(ctx.db, 'gateway_auto_reconcile')) === '1' ? '🟢 روشن' : '🔴 خاموش'} | معلق ۲۴ ساعت اخیر: ${faDigits(pend)}`,
    '',
    '🧾 آخرین تراکنش‌ها:',
    ...(txs.length ? txs.map((t) => `• ${t.status === 'settled' ? '✅' : t.status === 'redirected' ? '⏳' : '⛔'} سفارش ${faDigits(t.order || 0)} — ${fmtToman(t.amount || 0)} (<code>${t.status}</code>)`) : ['—']),
    note ? `\n${note}` : '',
    '',
    '⚠️ <b>صادقانه:</b> ربات فقط درایور درگاه است؛ برای پرداخت آنلاین باید اکانت/مرچنت‌آیدی خودتان را از یک کارگزاری داشته باشید. تا وقتی درگاه فعال نیست، خرید با کارت‌به‌کارت و تایید فیش (با هوش مصنوعی) کار می‌کند.',
    '✅ هیچ پرداختی بدون استعلام سرور‌به‌سرور تایید نمی‌شود؛ دکمهٔ «تست اتصال» را بعد از هر تغییر بزنید.',
  ];
  const rows = [
    [btn('🔌 تست اتصال', 'adm:gw:test'), btn(g.enabled ? '🔴 غیرفعال کن' : '🟢 فعال کن', 'adm:gw:tg')],
    ...(() => {
      const out = [];
      for (let i = 0; i < GW_KEYS.length; i += 2) {
        const row = [btn(GW_LABELS[GW_KEYS[i]][0], `adm:gwv:${GW_KEYS[i]}`)];
        if (GW_KEYS[i + 1]) row.push(btn(GW_LABELS[GW_KEYS[i + 1]][0], `adm:gwv:${GW_KEYS[i + 1]}`));
        out.push(row);
      }
      return out;
    })(),
    [btn('♻️ تطبیق دستی تراکنش‌ها', 'adm:gw:rec'), btn('🧾 صف فیش‌ها', 'adm:rcpts')],
    [btn(`♻️ تسویهٔ خودکار: ${(await getSettingValue(ctx.db, 'gateway_auto_reconcile')) === '1' ? '🟢 روشن' : '🔴 خاموش'}`, 'adm:tog:gateway_auto_reconcile')],
  ];
  const text = lines.join('\n');
  if (editMsg) await editText(ctx.token, ctx.user.id, editMsg.message_id, text, { reply_markup: menuKb(rows, 'panel') });
  else await send(ctx.token, ctx.user.id, text, { reply_markup: menuKb(rows, 'panel') });
}

// ─────────────────── 🔘 دکمه‌های منو (بخش ۱۵) ───────────────────
async function buttonsAdmin(ctx, editMsg) {
  const bs = await listButtons(ctx.db, { activeOnly: false, forAdmin: true });
  const rows = [];
  for (const b of bs.slice(0, 24)) rows.push([btn(`${b.active ? '🟢' : '🔴'} ${b.label}`, `adm:btn:${b.id}`)]);
  rows.push([btn('➕ دکمهٔ جدید', 'adm:btn:new')]);
  const kb = await listButtons(ctx.db, { forAdmin: ctx.user.role !== 'user' });
  const text = `🔘 <b>دکمه‌های منوی اصلی</b>\n\nدکمه‌های فعال در کیبورد: ${faDigits(kb.length)} از ${faDigits(bs.length)}\n\nنکته: متن دکمه‌ها همان چیزی است که کاربر پایین صفحهٔ چت می‌بیند. برای «داشبورد»، دکمهٔ مربعی تلگرام از پنل وب (تب مینی‌اپ) هم قابل تنظیم است.`;
  if (editMsg) await editText(ctx.token, ctx.user.id, editMsg.message_id, text, { reply_markup: menuKb(rows, 'panel') });
  else await send(ctx.token, ctx.user.id, text, { reply_markup: menuKb(rows, 'panel') });
}

async function buttonView(ctx, id, editMsg) {
  const b = await ctx.db.prepare('SELECT * FROM menu_buttons WHERE id=?').bind(Number(id)).first();
  if (!b) return answerCb(ctx.token, ctx.cbId, 'پیدا نشد');
  const text = [
    `🔘 <b>${b.label}</b>\n`,
    `نوع: ${ACTIONS[b.action] || b.action}`,
    `هدف: <code>${String(b.value || '—').replace(/</g, '&lt;')}</code>`,
    `ردیف: ${faDigits(b.row_no || 0)} | ستون: ${faDigits(b.col_no || 0)} | ترتیب: ${faDigits(b.sort || 0)}`,
    `وضعیت: ${b.active ? '🟢 نمایش داده می‌شود' : '🔴 مخفی'} | ${b.admins_only ? '👮 فقط ادمین‌ها' : '👥 همه کاربران'}`,
  ].join('\n');
  const rows = [
    [btn('✏️ متن', `adm:btn:${id}:label`), btn(`🎯 نوع`, `adm:btn:${id}:action`)],
    [btn('🔗 هدف', `adm:btn:${id}:value`), btn('📐 ردیف', `adm:btn:${id}:row`)],
    [btn('📏 ستون', `adm:btn:${id}:col`), btn(b.active ? '🔴 مخفی کن' : '🟢 نمایش بده', `adm:btn:t${id}`)],
    [btn('🗑 حذف دکمه', `adm:btn:d${id}`), btn('⬅️ لیست دکمه‌ها', 'adm:btns')],
  ];
  if (editMsg) await editText(ctx.token, ctx.user.id, editMsg.message_id, text, { reply_markup: menuKb(rows) });
  else await send(ctx.token, ctx.user.id, text, { reply_markup: menuKb(rows) });
}

// ─────────────────── 🔑 لایسنس کانفیگ‌ساز (بخش ۲۰) ───────────────────
async function licensesAdmin(ctx, editMsg) {
  const rows = (await ctx.db.prepare('SELECT * FROM creator_licenses ORDER BY id DESC LIMIT 20').all()).results || [];
  const kb = rows.map((l) => {
    const live = l.active && (!l.expire_at || l.expire_at > now());
    return [btn(`${live ? '🟢' : '🔴'} کاربر ${faDigits(l.user_id)} — ${faDigits(l.used || 0)}/${faDigits(l.quota || 0)}`, `adm:lic:${l.id}:v`)];
  });
  kb.push([btn('➕ اعطای دستی لایسنس', 'adm:lic:new')]);
  const tot = await ctx.db.prepare('SELECT COUNT(*) v FROM creator_licenses WHERE active=1').first().then((r) => r?.v || 0).catch(() => 0);
  const text = `🔑 <b>لایسنس‌های پنل کانفیگ‌ساز</b>\n\nفعال: ${faDigits(tot)} | نمایش ۲۰ مورد آخر\n\nلایسنس = دسترسی کاربر به پنل ساخت کانفیگ (بخش ۱۸/۲۰). با خرید محصول «کانفیگ‌ساز» خودکار صادر می‌شود؛ اینجا فقط مدیریت دستی است.`;
  if (editMsg) await editText(ctx.token, ctx.user.id, editMsg.message_id, text, { reply_markup: menuKb(kb, 'panel') });
  else await send(ctx.token, ctx.user.id, text, { reply_markup: menuKb(kb, 'panel') });
}

async function licenseView(ctx, id, editMsg) {
  const l = await ctx.db.prepare('SELECT * FROM creator_licenses WHERE id=?').bind(Number(id)).first();
  if (!l) return answerCb(ctx.token, ctx.cbId, 'پیدا نشد');
  const u = await ctx.db.prepare('SELECT id, username, first_name FROM users WHERE id=?').bind(l.user_id).first();
  const base = (await getBase(ctx.env)) || '';
  const cfgs = (await ctx.db.prepare('SELECT name, protocol, created_at FROM creator_configs WHERE license_id=? ORDER BY id DESC LIMIT 12').bind(l.id).all()).results || [];
  const text = [
    `🔑 <b>لایسنس #${faDigits(l.id)}</b>\n`,
    `👤 ${u ? userTag(u) : 'کاربر حذف‌شده'} (${faDigits(l.user_id)})`,
    `🧾 نام: ${l.name || '—'} | یادداشت: ${l.note || '—'}`,
    `📊 استفاده: ${faDigits(l.used || 0)} از ${l.quota ? faDigits(l.quota) : 'نامحدود'} | سقف سرور: ${faDigits(l.servers || 0)}`,
    `⏳ انقضا: ${l.expire_at ? fmtDate(l.expire_at) : 'ندارد'} | وضعیت: ${l.active ? '🟢 فعال' : '🔴 غیرفعال'}`,
    `🔗 پنل کاربر:\n<code>${base}/creator/${l.token}</code>`,
    `🔑 API key:\n<code>${l.api_key}</code>`,
    cfgs.length ? `\n🧩 آخرین کانفیگ‌های کاربر:\n${cfgs.map((c) => `• ${c.name || c.protocol} (${fmtDate(c.created_at || now())})`).join('\n')}` : '',
  ].join('\n');
  const rows = [
    [btn(l.active ? '🔴 غیرفعال کن' : '🟢 فعال کن', `adm:lic:${l.id}:${l.active ? 'off' : 'on'}`), btn('🧩 تغییر پلن', `adm:lic:${l.id}:plan`)],
    [btn('🔢 سهمیهٔ کانفیگ', `adm:lic:${l.id}:q`), btn('⬅️ لیست', 'adm:lic')],
  ];
  if (editMsg) await editText(ctx.token, ctx.user.id, editMsg.message_id, text, { reply_markup: menuKb(rows) });
  else await send(ctx.token, ctx.user.id, text, { reply_markup: menuKb(rows) });
}

// ─────────────────── 🛡 ضدسانسور (بخش ۳.۱) ───────────────────
async function antiAdmin(ctx, editMsg, note = '') {
  const cov = await coverageStats(ctx.db);
  const lines = ['🛡 <b>مهندسی ضدسانسور — واریانت‌های هر سرور</b>\n'];
  for (const d of cov.detail.slice(0, 20)) {
    lines.push(`${d.healthy >= 3 ? '🟢' : d.healthy > 0 ? '🟡' : '🔴'} <b>${d.name}</b> (${d.protocol}) — ${faDigits(d.healthy)} سالم از ${faDigits(d.total)} | ترنسپورت: ${d.transports.length ? d.transports.map((x) => `<code>${x}</code>`).join('، ') : '⛔ ندارد'} | پورت: ${d.ports.length ? d.ports.map((x) => faDigits(x)).join('، ') : '—'}`);
  }
  if (!cov.servers) lines.push('⚠️ هنوز سرور فعالی ثبت نشده است.');
  if (cov.servers > cov.withVariants) lines.push(`\n⛔ ${faDigits(cov.servers - cov.withVariants)} سرور هیچ واریانتی ندارد؛ کاربر فقط یک مسیر دریافت می‌کند و با فیلتر شدن آن مسیر، سرویس «مرده» به نظر می‌رسد.`);
  if (cov.disabledVariants) lines.push(`🔴 ${faDigits(cov.disabledVariants)} واریانت به‌دلیل خرابی از تحویل حذف شده است.`);
  if (note) lines.push('\n' + note);
  const srvs = (await ctx.db.prepare('SELECT id, name FROM servers WHERE active=1 ORDER BY id').all()).results || [];
  const rows = srvs.slice(0, 20).map((s) => [btn(`🧩 واریانت‌های ${s.name}`, `adm:anti:s${s.id}`)]);
  rows.push([btn('🩺 بررسی سلامت همین حالا', 'adm:anti:chk'), btn('🖥 سرورها', 'adm:servers')]);
  if (editMsg) await editText(ctx.token, ctx.user.id, editMsg.message_id, lines.join('\n'), { reply_markup: menuKb(rows, 'panel') });
  else await send(ctx.token, ctx.user.id, lines.join('\n'), { reply_markup: menuKb(rows, 'panel') });
}

async function variantsAdmin(ctx, serverId, editMsg) {
  const vs = await listVariants(ctx.db, serverId, { includeDisabled: true });
  const srv = await ctx.db.prepare('SELECT name FROM servers WHERE id=?').bind(Number(serverId)).first();
  const rows = vs.slice(0, 24).map((v) => [btn(`${v.active ? (v.healthy ? '🟢' : '🟡') : '🔴'} ${v.label || v.transport}:${v.port}`, `adm:var:v:${v.id}`)]);
  rows.push([btn('➕ واریانت جدید', `adm:var:add:${serverId}`), btn('🩺 بررسی همه', 'adm:anti:chk')]);
  rows.push([btn('⬅️ پوشش ضدسانسور', 'adm:anti')]);
  const text = `🧩 <b>واریانت‌های ${srv?.name || '—'}</b>\n\n${faDigits(vs.filter((v) => v.active && v.healthy).length)} مسیر سالم از ${faDigits(vs.length)}\n\nهر واریانت = یک ترکیب ترنسپورت/پورت/SNI. اشتراک‌ها تا ${faDigits(Number(await getSettingValue(ctx.db, 'sub_min_configs')) || 10)} مسیر سالم دارند و اگر کاربر مسیری را خراب گزارش دهد، خودش با مسیر بعدی جایگزین می‌شود.`;
  if (editMsg) await editText(ctx.token, ctx.user.id, editMsg.message_id, text, { reply_markup: menuKb(rows) });
  else await send(ctx.token, ctx.user.id, text, { reply_markup: menuKb(rows) });
}

async function variantView(ctx, id, editMsg) {
  const v = await ctx.db.prepare('SELECT * FROM config_variants WHERE id=?').bind(Number(id)).first();
  if (!v) return answerCb(ctx.token, ctx.cbId, 'پیدا نشد');
  const srv = await ctx.db.prepare('SELECT name FROM servers WHERE id=?').bind(v.server_id).first();
  const text = [
    `🧩 <b>${v.label || v.transport}</b> — ${srv?.name || ''}\n`,
    `ترنسپورت: <code>${v.transport}</code> | پورت: <code>${v.port}</code> | امنیت: <code>${v.security}</code>`,
    `SNI: <code>${v.sni || '—'}</code>`,
    `Host: <code>${v.host || '—'}</code> | path: <code>${v.path || '—'}</code>`,
    v.security === 'reality' ? `pbk: <code>${v.pbk || '⛔ تنظیم نشده'}</code> | sid: <code>${v.sid || '—'}</code>` : '',
    `🩺 پروب: ${v.check_url ? `<code>${v.check_url}</code>` : 'تنظیم نشده (خودکار بررسی نمی‌شود)'}`,
    `وضعیت: ${v.active ? '🟢 در تحویل' : '🔴 از تحویل حذف شده'} | سالم: ${v.healthy ? '✅' : '⛔'} | شکست متوالی: ${faDigits(v.fail_count || 0)} | موفق: ${faDigits(v.ok_count || 0)}`,
    v.last_check ? `آخرین بررسی: ${fmtDate(v.last_check)}` : '',
  ].filter(Boolean).join('\n');
  const rows = [
    [btn('🏷 برچسب', `adm:var:f:${id}:label`), btn('🔌 پورت', `adm:var:f:${id}:port`)],
    [btn('🌙 SNI', `adm:var:f:${id}:sni`), btn('🌐 Host', `adm:var:f:${id}:host`)],
    [btn('🛤 path', `adm:var:f:${id}:path`), btn('🔑 pbk', `adm:var:f:${id}:pbk`)],
    [btn('🎯 sid', `adm:var:f:${id}:sid`), btn('🩺 آدرس پروب', `adm:var:f:${id}:check_url`)],
    [btn(v.active ? '🔴 حذف از تحویل' : '🟢 برگردان به تحویل', `adm:var:tgl:${id}`), btn('🩺 بررسی سلامت', `adm:var:chk:${id}`)],
    [btn('🗑 حذف واریانت', `adm:var:del:${id}`), btn('⬅️ لیست واریانت‌ها', `adm:anti:s${v.server_id}`)],
  ];
  if (editMsg) await editText(ctx.token, ctx.user.id, editMsg.message_id, text, { reply_markup: menuKb(rows) });
  else await send(ctx.token, ctx.user.id, text, { reply_markup: menuKb(rows) });
}

// ─────────────────── 🔔 اعلان‌ها (بخش ۲۴) ───────────────────
async function notifyAdmin(ctx, editMsg) {
  const st = await notifyStates(ctx.db).catch(() => ({}));
  const rows = Object.entries(NOTIFY_TYPES).map(([k, label]) => [btn(`${st[k] === false ? '🔴' : '🟢'} ${label}`, `adm:ntf:${k}`)]);
  const alerts = await recentAlerts(ctx.env).catch(() => []);
  const text = [
    '🔔 <b>اعلان‌های ادمین</b>\n\nبا روشن/خاموش‌کردن هر مورد، دقیقاً همان دستهٔ رویداد برای همهٔ ادمین‌ها فعال/غیرفعال می‌شود.',
    '',
    '🧾 آخرین رویدادها:',
    ...(alerts.length ? alerts.slice(0, 8).map((a) => `• ${fmtDate(a.t || now())} — ${String(a.text || '').slice(0, 120)}`) : ['—']),
  ].join('\n');
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
  if (data.startsWith('adm:pm:')) {
    if (!need('products')) return;
    const id = Number(data.slice(6));
    const pr = await ctx.db.prepare('SELECT * FROM products WHERE id=?').bind(id).first();
    if (pr) {
      if (pr.price_mode === 'fixed') {
        await ctx.db.prepare("UPDATE products SET price_mode='fx' WHERE id=?").bind(id).run();
        await answerCb(ctx.token, ctx.cbId, '💱 قیمت خودکار با نرخ دلار شد');
      } else {
        await setState(ctx, `admin:pf:${id}:price_toman`);
        return send(ctx.token, ctx.user.id, `💵 قیمت ثابت این محصول در تومان را بفرستید (عدد خالی = حذف قفل):\n\nنکته: قیمت‌گذاری پگ = قیمت ثابت + فیلد «کف تومان» در بخش قیمت‌گذاری پنل وب.`);
      }
    }
    return productView(ctx, id, edit);
  }
  if (data.startsWith('adm:cl:')) {
    if (!need('products')) return;
    const id = Number(data.slice(7));
    const cur = await ctx.db.prepare('SELECT coin_lock_premium FROM products WHERE id=?').bind(id).first();
    await ctx.db.prepare('UPDATE products SET coin_lock_premium=? WHERE id=?').bind(Number(cur?.coin_lock_premium) ? 0 : 1, id).run();
    return productView(ctx, id, edit);
  }
  if (data.startsWith('adm:tr:')) {
    if (!need('products')) return;
    const id = Number(data.slice(6));
    const pr = await ctx.db.prepare('SELECT tier FROM products WHERE id=?').bind(id).first();
    const order = ['economy', 'standard', 'premium'];
    const next = order[(order.indexOf(String(pr?.tier || 'standard')) + 1) % 3];
    await ctx.db.prepare('UPDATE products SET tier=? WHERE id=?').bind(next, id).run();
    await answerCb(ctx.token, ctx.cbId, `سطح سکه‌ای: ${tierLabel(next)}`);
    return productView(ctx, id, edit);
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
    return send(
      ctx.token,
      ctx.user.id,
      '📣 متن پیام همگانی را بفرستید.\n\nپس از ارسال، می‌پرسیم «فوری» یا «زمان‌بندی». پیام در صف قرار می‌گیرد و با کرون (هر ۱۵ دقیقه) دسته‌دسته ارسال می‌شود تا محدودیت سرور رد شود.'
    );
  }
  if (data === 'adm:perks') return need('settings') && perksAdminPage(ctx);
  if (data === 'adm:bc:now' || data.startsWith('adm:bc:+')) {
    if (ctx.user.role !== 'super') return answerCb(ctx.token, ctx.cbId, 'فقط سوپرادمین');
    const draft = (await ctx.db.prepare("SELECT value FROM settings WHERE key='bc_draft'").first())?.value || '';
    if (!draft.trim()) {
      await setState(ctx, 'admin:bc');
      return send(ctx.token, ctx.user.id, '⚠️ متن پیام از قبل ذخیره نشده؛ متن را دوباره بفرستید.');
    }
    const mins = data === 'adm:bc:now' ? 0 : Number(data.slice(8)) || 0;
    const { queueBroadcast, audit } = await import('./perks.js');
    const r = await queueBroadcast(ctx.db, { text: `📣 ${draft}`, at: mins ? Math.floor(Date.now() / 1000) + mins * 60 : 0, by: ctx.user.id });
    await audit(ctx.db, { actorId: ctx.user.id, actor: ctx.user.username || String(ctx.user.id), action: 'broadcast:queue', target: `#${r.id}`, detail: draft.slice(0, 80) });
    await ctx.db.prepare("DELETE FROM settings WHERE key='bc_draft'").run();
    await setState(ctx, '');
    await answerCb(ctx.token, ctx.cbId, r.ok ? '✅ در صف قرار گرفت' : '⛔');
    return send(
      ctx.token,
      ctx.user.id,
      r.ok
        ? `✅ ارسال همگانی #${faDigits(r.id)} در صف است.\n⏱ ${mins ? 'شروع: ' + fmtDate(Math.floor(Date.now() / 1000) + mins * 60) : 'شروع: فوری (از اجرای بعدی کرون، هر ۱۵ دقیقه)'}\n🛡 دسته‌دسته ارسال می‌شود تا محدودیت ارسال تلگرام رد شود.`
        : `⛔ ${r.error}`
    );
  }
  if (data === 'adm:audit') {
    if (!need('export')) return;
    const { recentAudit } = await import('./perks.js');
    const rows = await recentAudit(ctx.db, 20);
    const text = rows.length
      ? '🗒 <b>آخرین اقدامات ادمین</b>\n\n' + rows.map((a) => `• ${fmtDate(a.created_at)} — <b>${a.actor || a.actor_id}</b> · ${a.action}${a.target ? ' → ' + a.target : ''}${a.detail ? '\n  <i>' + a.detail.slice(0, 90) + '</i>' : ''}`).join('\n')
      : '🗒 لاگی ثبت نشده است. (اقدامات مهم ادمین از این به بعد ثبت می‌شود)';
    return send(ctx.token, ctx.user.id, text, { reply_markup: menuKb([[btn('🎁 جوایز/گزارش', 'adm:perks')], [btn('📤 خروجی JSON', 'adm:exp:full')]], 'panel') });
  }
  if (data.startsWith('adm:report:')) {
    const days = Number(data.slice(11)) || 0;
    const { salesSummary, reportText } = await import('./perks.js');
    const since = Math.floor(Date.now() / 1000) - days * 86400;
    const s2 = await salesSummary(ctx.db, since);
    await send(ctx.token, ctx.user.id, reportText(days >= 7 ? 'weekly' : 'daily', s2));
    return answerCb(ctx.token, ctx.cbId, '✅ آماده شد');
  }
  if (data === 'adm:couponbulk') {
    await setState(ctx, 'admin:couponbulk');
    return send(
      ctx.token,
      ctx.user.id,
      '🎟 مشخصات کوپن‌های انبوه را در یک خط بفرستید:\n<code>تعداد درصد اعتبارروز سقف‌استفاده پیشوند</code>\n\nمثال: <code>25 15 7 1 NEW</code> → ۲۵ کوپن ۱۵٪، ۷ روزه، هر کدام یک استفاده، با پیشوند NEW-'
    );
  }
  if (data === 'adm:bclist') {
    const { listBroadcasts } = await import('./perks.js');
    const list = await listBroadcasts(ctx.db, 10);
    if (!list.length) return send(ctx.token, ctx.user.id, '📣 صف ارسال همگانی خالی است.', { reply_markup: menuKb([[btn('📣 پیام جدید', 'adm:bc')]]) });
    const st = { queued: '⏳ در صف', running: '📤 در حال ارسال', done: '✅ تمام شد', paused: '⏸ متوقف', failed: '⛔ خطا' };
    return send(
      ctx.token,
      ctx.user.id,
      '📣 <b>صف ارسال همگانی</b>\n\n' +
        list.map((b) => `${st[b.status] || b.status} · #${faDigits(b.id)} · 📤 ${faDigits(b.delivered)} از ${faDigits(b.total || '?')}\n   <i>${b.text.replace(/\n/g, ' ').slice(0, 60)}</i>${b.at ? `\n   ⏰ ${fmtDate(b.at)}` : ''}`).join('\n'),
      { reply_markup: menuKb([[btn('📣 پیام جدید', 'adm:bc'), btn('🎁 جوایز/گزارش', 'adm:perks')]])
      }
    );
  }
  if (data.startsWith('atog:')) {
    const k = data.slice(5);
    const ALLOW = ['scratch_enabled', 'checkin_enabled', 'personal_coupon_enabled', 'ref_anti_abuse', 'report_daily_enabled', 'report_weekly_enabled', 'group_buy_enabled', 'group_ai_enabled', 'glass_enabled', 'glass_auto_post', 'glass_public', 'glass_show_ref', 'glass_web_enabled', 'perks_menu_enabled', 'glass_menu_enabled', 'auto_verify', 'group_show_rating'];
    if (!ALLOW.includes(k)) return answerCb(ctx.token, ctx.cbId, 'کلید مجاز نیست');
    if (ctx.user.role !== 'super' && k.includes('glass_auto')) return answerCb(ctx.token, ctx.cbId, 'فقط سوپرادمین');
    const cur = (await getSettingValue(ctx.db, k)) === '1';
    await ctx.db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(k, cur ? '0' : '1').run();
    const { audit } = await import('./perks.js');
    await audit(ctx.db, { actorId: ctx.user.id, actor: ctx.user.username || String(ctx.user.id), action: 'toggle', target: k, detail: cur ? 'خاموش' : 'روشن' });
    await answerCb(ctx.token, ctx.cbId, cur ? 'خاموش شد' : 'روشن شد');
    const { perksAdminPage } = await import('./perks.js');
    return perksAdminPage(ctx);
  }
  if (data.startsWith('adm:reply:')) {
    const uid = data.slice(10);
    await setState(ctx, `admin:reply:${uid}`);
    return send(ctx.token, ctx.user.id, `✍️ پاسخ خود به کاربر <code>${uid}</code> را بفرستید:`);
  }

  // ─── 🏦 درگاه بانکی (بخش ۵) ───
  if (data === 'adm:gw') return need('payments') && gatewayAdmin(ctx, edit);
  if (data === 'adm:gw:test') {
    if (!need('payments')) return;
    await answerCb(ctx.token, ctx.cbId, 'در حال اتصال آزمایشی…');
    const r = await testGateway(ctx.env);
    return send(ctx.token, ctx.user.id, r.ok ? `✅ ${r.message || 'اتصال برقرار شد'}` : `⛔ ${r.error || 'اتصال ناموفق'}`, { reply_markup: menuKb([[btn('⬅️ درگاه', 'adm:gw')]]) });
  }
  if (data === 'adm:gw:rec') {
    if (!need('payments')) return;
    const r = await reconcilePendingPayments(ctx.env);
    return gatewayAdmin(ctx, edit, `♻️ از ${faDigits(r.checked || 0)} تراکنش معلق، ${faDigits(r.settled || 0)} مورد تسویه شد.`);
  }
  if (data === 'adm:gw:tg') {
    if (ctx.user.role !== 'super') return answerCb(ctx.token, ctx.cbId, 'فقط سوپرادمین');
    const cur = (await getSettingValue(ctx.db, 'gateway_enabled')) === '1';
    await ctx.db.prepare("INSERT INTO settings (key,value) VALUES ('gateway_enabled',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(cur ? '0' : '1').run();
    return gatewayAdmin(ctx, edit);
  }
  if (data.startsWith('adm:gwv:')) {
    if (ctx.user.role !== 'super' && ['gateway_api_key', 'gateway_merchant_id'].includes(data.slice(8))) return answerCb(ctx.token, ctx.cbId, 'فقط سوپرادمین می‌تواند کلید درگاه را تغییر دهد');
    if (!need('payments')) return;
    const k = data.slice(8);
    await setState(ctx, `admin:gwv:${k}`);
    const hints = {
      gateway_provider: 'ارائه‌دهنده را بفرستید: none | zarinpal | idpay | custom',
      gateway_merchant_id: 'ID فروشندگان / merchant id را بفرستید (در zarinpal همان "uuid" درگاه است).',
      gateway_api_key: 'کلید API (secret) درگاه را بفرستید. این مقدار فقط در settings می‌ماند و در پنل وب ماسک می‌شود.',
      gateway_base_url: 'آدرس پایهٔ درگاه (برای custom) — مثال: https://gw.example.com/api',
      gateway_auth_style: 'نوع احراز: none | bearer | x-api-key | basic',
      gateway_fee_percent: 'کارمزد درگاه (عدد اعشاری، مثلاً 0.005 برای نیم‌درصد).',
      gateway_callback_path: 'مسیر callback روی ورکر (مثلاً /pay) — تغییرش فقط اگر درگاه مسیر دیگری می‌خواهد لازم است.',
      gateway_success_url: 'مسیر بازگشت موفق (نسبی به آدرس ورکر).',
      gateway_fail_url: 'مسیر بازگشت ناموفق.',
      gateway_label: 'نامی که کاربر در بانک می‌بیند (عنوان تراکنش).',
      gateway_desc: 'توضیحی که کاربر در بانک می‌بیند.',
      gateway_currency: 'واحد: toman | toman_x10 (idpay) | irr',
      gateway_sandbox: '1 = حالت تست/شنبد (0 = واقعی)',
      gateway_verify_path: 'مسیر استعلام/verify در درگاه custom',
      gateway_create_body: 'قالب JSON بدنهٔ درخواست در درگاه custom (با placeholderهای {amount} {callback} {desc} {label})',
    };
    return send(ctx.token, ctx.user.id, `⚙️ ${hints[k] || `مقدار جدید «${k}» را بفرستید:`}\n\nبرای خالی‌کردن: <code>-</code>`, { reply_markup: menuKb([[btn('انصراف', 'adm:gw')]]) });
  }

  // ─── 🔘 دکمه‌های منو (بخش ۱۵) ───
  if (data === 'adm:btns') return need('settings') && buttonsAdmin(ctx, edit);
  if (data === 'adm:btn:new') {
    if (!need('settings')) return;
    await setState(ctx, 'admin:btn:new');
    return send(ctx.token, ctx.user.id, '🔘 متن دکمهٔ جدید را بفرستید (با ایموجی، حداکثر ۳۲ کاراکتر):', { reply_markup: menuKb([[btn('انصراف', 'adm:btns')]]) });
  }
  if (data.startsWith('adm:btn:')) {
    if (!need('settings')) return;
    const rest = data.slice(8);
    if (rest.startsWith('d')) {
      const id = Number(rest.slice(1));
      const r = await deleteButton(ctx.db, id);
      await answerCb(ctx.token, ctx.cbId, r.ok ? '🗑 حذف شد' : 'حذف نشد');
      return buttonsAdmin(ctx, edit);
    }
    if (rest.startsWith('t')) {
      await toggleButton(ctx.db, Number(rest.slice(1)));
      return buttonsAdmin(ctx, edit);
    }
    if (rest.includes(':')) {
      const [idStr, field] = rest.split(':');
      const id = Number(idStr);
      if (field === 'action') {
        const rows = Object.entries(ACTIONS).map(([k, v]) => [btn(v, `adm:btna:${id}:${k}`)]);
        return editText(ctx.token, ctx.user.id, edit.message_id, 'نوع دکمه را انتخاب کنید:', { reply_markup: menuKb(rows) });
      }
      if (field === 'a') return buttonsAdmin(ctx, edit);
      await setState(ctx, `admin:btnf:${id}:${field}`);
      const hints = { label: 'متن جدید دکمه:', value: 'مقدار هدف (لینک کامل با https:// یا payload بدون فاصله):', row: 'شمارهٔ ردیف (عدد، ۹ = انتهای کیبورد):', col: 'شمارهٔ ستون (۰ تا ۲):' };
      return send(ctx.token, ctx.user.id, `${hints[field] || 'مقدار جدید:'} (برای خالی: -)`, { reply_markup: menuKb([[btn('انصراف', `adm:btn:${id}`)]]) });
    }
    return need('settings') && buttonView(ctx, Number(rest), edit);
  }
  if (data.startsWith('adm:btna:')) {
    const [, , id, action] = data.split(':');
    const cur = await ctx.db.prepare('SELECT * FROM menu_buttons WHERE id=?').bind(Number(id)).first();
    if (cur) await saveButton(ctx.db, { ...cur, action }, Number(id));
    return buttonView(ctx, Number(id), edit);
  }

  // ─── 🔑 لایسنس کانفیگ‌ساز (بخش ۲۰) ───
  if (data === 'adm:lic') return need('creator') && licensesAdmin(ctx, edit);
  if (data === 'adm:lic:new') {
    if (!need('creator')) return;
    await setState(ctx, 'admin:lic:new');
    return send(ctx.token, ctx.user.id, '🔑 آیدی عددی کاربری که می‌خواهید لایسنس کانفیگ‌ساز بگیرد را بفرستید:\n\nنکته: برای فروش معمولی، کاربر خودش از فروشگاه (محصول «پنل کانفیگ‌ساز») خریad می‌کند و لایسنس خودکار صادر می‌شود.', { reply_markup: menuKb([[btn('انصراف', 'adm:lic')]]) });
  }
  if (data.startsWith('adm:lic:')) {
    if (!need('creator')) return;
    const [, , idStr, act] = data.split(':');
    const id = Number(idStr);
    const l = await ctx.db.prepare('SELECT * FROM creator_licenses WHERE id=?').bind(id).first();
    if (!l) return answerCb(ctx.token, ctx.cbId, 'پیدا نشد');
    if (act === 'on' || act === 'off') {
      await ctx.db.prepare('UPDATE creator_licenses SET active=? WHERE id=?').bind(act === 'on' ? 1 : 0, id).run();
      return licensesAdmin(ctx, edit);
    }
    if (act === 'plan') {
      const l0 = await ctx.db.prepare('SELECT * FROM creator_licenses WHERE id=?').bind(id).first();
      if (!l0) return answerCb(ctx.token, ctx.cbId, 'پیدا نشد');
      const rows = Object.entries(CREATOR_PLANS).map(([k, v]) => [btn(`${k} (${faDigits(v.configs)} کانفیگ / ${faDigits(v.days)} روز)`, `adm:licp:${id}:${k}`)]);
      rows.push([btn('⬅️ بازگشت به لایسنس', `adm:lic:${id}:v`)]);
      return editText(ctx.token, ctx.user.id, edit.message_id, 'پلن جدید:', { reply_markup: menuKb(rows) });
    }
    if (act === 'v') return licenseView(ctx, id, edit);
    if (act === 'q') {
      await setState(ctx, `admin:licq:${id}`);
      return send(ctx.token, ctx.user.id, '🔢 سهمیهٔ جدید (تعداد کانفیگ مجاز) را بفرستید:', { reply_markup: menuKb([[btn('انصراف', `adm:lic`)]]) });
    }
    return licenseView(ctx, id, edit);
  }
  if (data.startsWith('adm:licp:')) {
    const [, , id, plan] = data.split(':');
    const pl = planOf(plan) || CREATOR_PLANS.pro;
    await ctx.db.prepare('UPDATE creator_licenses SET servers=?, quota=?, note=? WHERE id=?').bind(pl.servers, pl.configs, `پلن: ${plan}`, Number(id)).run();
    return licenseView(ctx, Number(id), edit);
  }

  // ─── 🛡 ضدسانسور / واریانت‌ها (بخش ۳.۱) ───
  if (data === 'adm:anti') return need('products') && antiAdmin(ctx, edit);
  if (data === 'adm:anti:chk') {
    if (!need('products')) return;
    await answerCb(ctx.token, ctx.cbId, 'بررسی سلامت…');
    const r = await checkVariants(ctx.env);
    return antiAdmin(ctx, edit, `🩺 ${faDigits(r.checked || 0)} واریانت با آدرس پروب بررسی شد — ${faDigits(r.died || 0)} مسیر از تحویل حذف شد.`);
  }
  if (data.startsWith('adm:anti:s')) {
    return need('products') && variantsAdmin(ctx, Number(data.slice(10)), edit);
  }
  if (data.startsWith('adm:var:add:')) {
    if (!need('products')) return;
    const sid = Number(data.slice(12));
    await setState(ctx, `admin:vari:${sid}`);
    const fmt = `➕ برای سرور <code>#${faDigits(sid)}</code> یک واریانت بسازید.\n\nمقادیر را در <b>یک خط</b> و با <code>|</code> بفرستید:\n<code>نام | ترنسپورت | پورت | sni | security | host | path | pbk | sid</code>\n\nترنسپورت: ${TRANSPORTS.join(' | ')}\nsecurity: ${SECURITIES.join(' | ')}\n\nمثال (ws روی CDN):\n<code>CDN-1 | ws | 443 | www.speedtest.net | tls | cdn.example.com | /vless | - | -</code>\n\nهر مقدار اضافه را <code>-</code> بگذارید.`;
    return send(ctx.token, ctx.user.id, fmt, { reply_markup: menuKb([[btn('انصراف', `adm:anti:s${sid}`)]]) });
  }
  if (data.startsWith('adm:var:f:')) {
    if (!need('products')) return;
    const [, , , idStr, field] = data.split(':');
    const v = await ctx.db.prepare('SELECT * FROM config_variants WHERE id=?').bind(Number(idStr)).first();
    if (!v) return answerCb(ctx.token, ctx.cbId, 'پیدا نشد');
    await setState(ctx, `admin:varf:${v.id}:${field}`);
    const labels = { label: 'برچسب', sni: 'SNI / دامنهٔ فیک', host: 'هدر Host', path: 'مسیر (path)', pbk: 'کلید عمومی (reality)', sid: 'short id (reality)', alpn: 'ALPN', fp: 'fingerprint', check_url: 'آدرس پروب اختیاری' };
    return send(ctx.token, ctx.user.id, `مقدار جدید «${labels[field] || field}» را بفرستید (برای خالی: -):\n\nمقدار فعلی: <code>${String(v[field] || '—').replace(/</g, '&lt;')}</code>`, { reply_markup: menuKb([[btn('انصراف', `adm:var:v:${v.id}`)]]) });
  }
  if (data.startsWith('adm:var:v:')) {
    if (!need('products')) return;
    return variantView(ctx, Number(data.slice(10)), edit);
  }
  if (data.startsWith('adm:var:')) {
    if (!need('products')) return;
    const [, , act, idStr] = data.split(':');
    const id = Number(idStr);
    const v = await ctx.db.prepare('SELECT * FROM config_variants WHERE id=?').bind(id).first();
    if (!v) return answerCb(ctx.token, ctx.cbId, 'پیدا نشد');
    if (act === 'chk') {
      const r = await checkVariants(ctx.env);
      return answerCb(ctx.token, ctx.cbId, `🩺 ${faDigits(r.checked || 0)} واریانت با آدرس پروب بررسی شد / ${faDigits(r.died || 0)} مورد از تحویل حذف شد`);
    }
    if (act === 'tgl') {
      await saveVariant(ctx.db, v.server_id, { ...v, active: !v.active }, id);
      return variantsAdmin(ctx, Number(v.server_id), edit);
    }
    if (act === 'del') {
      await deleteVariant(ctx.db, id);
      await answerCb(ctx.token, ctx.cbId, '🗑 حذف شد');
      return variantsAdmin(ctx, Number(v.server_id), edit);
    }
    return variantView(ctx, id, edit);
  }

  // ─── 🔔 اعلان‌ها (بخش ۲۴) ───
  if (data === 'adm:ntf') return notifyAdmin(ctx, edit);
  if (data.startsWith('adm:ntf:')) {
    const k = data.slice(8);
    const cur = (await getSettingValue(ctx.db, `notify_${k}`)) !== '0';
    await ctx.db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(`notify_${k}`, cur ? '0' : '1').run();
    return notifyAdmin(ctx, edit);
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
    await setState(ctx, 'admin:bc:confirm');
    await ctx.db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('bc_draft', text).run();
    return send(
      ctx.token,
      ctx.user.id,
      `👀 <b>پیش‌نمایش پیام همگانی</b>\n\n📣 ${esc(text.slice(0, 900))}\n\n⏱ انتخاب کنید: فوری یا زمان‌بندی؟ (برای زمان‌بندی عدد دقیقه بفرستید)`,
      { reply_markup: ikb([[btn('🚀 الان ارسال شود (صف)', 'adm:bc:now')], [btn('⏳ ۶۰ دقیقه دیگر', 'adm:bc:+60'), btn('⏳ فردا', 'adm:bc:+1440')]]) }
    );
  }
  if (st === 'admin:bc:confirm') {
    const mins = Number(String(text).match(/\d+/)?.[0] || 0);
    if (!mins) return send(ctx.token, ctx.user.id, '⚠️ فقط عدد دقیقه بفرستید (مثلاً ۶۰) یا /cancel.');
    await setState(ctx, '');
    const draft = (await ctx.db.prepare("SELECT value FROM settings WHERE key='bc_draft'").first())?.value || '';
    const { queueBroadcast } = await import('./perks.js');
    const r = await queueBroadcast(ctx.db, { text: `📣 ${draft}`, at: Math.floor(Date.now() / 1000) + mins * 60, by: ctx.user.id });
    return send(ctx.token, ctx.user.id, r.ok ? `✅ در صف قرار گرفت (هر ۱۵ دقیقه یک دسته ارسال می‌شود).\n⏰ ارسال از: ${fmtDate(Math.floor(Date.now() / 1000) + mins * 60)}` : `⛔ ${r.error}`);
  }
  if (st === 'admin:couponbulk') {
    await setState(ctx, '');
    const parts = String(text).split(/[\s،]+/).filter(Boolean).map((x) => Number(String(x).match(/\d+/)?.[0] || NaN));
    const o = {
      count: Number.isFinite(parts[0]) ? parts[0] : 10,
      percent: Number.isFinite(parts[1]) ? parts[1] : 10,
      days: Number.isFinite(parts[2]) ? parts[2] : 7,
      maxUses: Number.isFinite(parts[3]) ? parts[3] : 1,
      prefix: String(text).trim().split(/\s+/).pop() || 'OFF',
    };
    const { generateCoupons } = await import('./perks.js');
    const r = await generateCoupons(ctx.db, o);
    const { audit } = await import('./perks.js');
    await audit(ctx.db, { actorId: ctx.user.id, actor: ctx.user.username || String(ctx.user.id), action: 'coupons:bulk', target: `${r.count}`, detail: `${o.percent}% / ${o.days}d` });
    if (!r.count) return send(ctx.token, ctx.user.id, '⛔ هیچ کوپنی ساخته نشد.');
    return send(
      ctx.token,
      ctx.user.id,
      `🎟 <b>${faDigits(r.count)} کوپن ساخته شد</b> · ${faDigits(r.percent)}٪ · ${faDigits(r.days)} روز\n\n` +
        r.created.map((c) => `<code>${c}</code>`).join(' · ') +
        `\n\n📤 برای کپی: از پنل وب بخش «کدهای تخفیف» خروجی بگیرید.`
    );
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
    if (field === 'desc') await ctx.db.prepare('UPDATE products SET description=? WHERE id=?').bind(String(text).slice(0, 900), Number(id)).run();
    if (field === 'badge') await ctx.db.prepare('UPDATE products SET badge=? WHERE id=?').bind(String(text).slice(0, 40), Number(id)).run();
    if (field === 'servers') await ctx.db.prepare('UPDATE products SET server_count=? WHERE id=?').bind(Math.min(50, Math.max(1, Number(text) || 10)), Number(id)).run();
    if (field === 'coin') await ctx.db.prepare('UPDATE products SET coin_price=? WHERE id=?').bind(Math.max(0, Number(text) || 0), Number(id)).run();
    if (field === 'stock') {
      const v = String(text).trim();
      await ctx.db.prepare('UPDATE products SET stock=? WHERE id=?').bind(v === '-' || v === '∞' ? null : Math.max(0, Number(v) || 0), Number(id)).run();
    }
    if (field === 'price_toman') {
      const v = Number(String(text).replace(/[^\d.]/g, '')) || 0;
      await ctx.db.prepare("UPDATE products SET price_toman=?, price_mode='fixed' WHERE id=?").bind(v, Number(id)).run();
    }
    return productView(ctx, Number(id));
  }
  if (st === 'admin:btn:new') {
    await setState(ctx, '');
    const r = await saveButton(ctx.db, { label: text.trim() });
    if (!r.ok) return send(ctx.token, ctx.user.id, `⛔ ${r.error}`);
    return buttonView(ctx, r.id);
  }
  if (st.startsWith('admin:btnf:')) {
    const [, , id, field] = st.split(':');
    await setState(ctx, '');
    const cur = await ctx.db.prepare('SELECT * FROM menu_buttons WHERE id=?').bind(Number(id)).first();
    if (cur) {
      const patch = { ...cur };
      const raw = text.trim();
      if (field === 'label') patch.label = raw;
      else if (field === 'row') patch.row_no = Math.max(0, Math.min(20, Number(raw) || 9));
      else if (field === 'col') patch.col_no = Math.max(0, Math.min(3, Number(raw) || 0));
      else patch.value = raw === '-' ? '' : raw;
      const r = await saveButton(ctx.db, patch, Number(id));
      if (!r.ok) return send(ctx.token, ctx.user.id, `⛔ ${r.error}`, { reply_markup: menuKb([[btn('⬅️ دکمه', `adm:btn:${id}`)]]) });
    }
    return buttonView(ctx, Number(id));
  }
  if (st.startsWith('admin:gwv:')) {
    const k = st.split(':')[2];
    await setState(ctx, '');
    const val = text.trim() === '-' ? '' : text.trim();
    await ctx.db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(k, val).run();
    return gatewayAdmin(ctx, null, '✅ ذخیره شد. (یادتان نرود: «تست اتصال» را بزنید.)');
  }
  if (st === 'admin:lic:new') {
    await setState(ctx, '');
    const uid = Number(text.replace(/[^\d]/g, ''));
    const target = uid ? await ctx.db.prepare('SELECT * FROM users WHERE id=?').bind(uid).first() : null;
    if (!target) return send(ctx.token, ctx.user.id, '⛔ چنین کاربری پیدا نشد. آیدی عددی صحیح را بفرستید.');
    const plan = CREATOR_PLANS.pro || Object.values(CREATOR_PLANS)[0];
    const planName = Object.keys(CREATOR_PLANS)[0];
    const r = await grantCreatorLicense(ctx.env, target, { title: 'لایسنس دستی (اعطای ادمین)', days: 30 }, { plan: planName });
    if (!r) return send(ctx.token, ctx.user.id, '⛔ صادر نشد (خطای دیتابیس).');
    const base = (await getBase(ctx.env)) || '';
    return send(ctx.token, ctx.user.id, `✅ لایسنس برای ${userTag(target)} صادر شد.\n🪪 پلن: ${planName} | سقف کانفیگ: ${faDigits(r.quota || 0)} | سرور هم‌زمان: ${faDigits(r.servers || 0)}\n🔗 آدرس پنل کاربر:\n<code>${base}/creator/${r.token}</code>\n🔑 API key:\n<code>${r.api_key}</code>\n\n⚠️ این لینک را فقط برای همان کاربر بفرستید.`, { reply_markup: menuKb([[btn('⬅️ لایسنس‌ها', 'adm:lic')]]) });
  }
  if (st.startsWith('admin:licq:')) {
    const id = Number(st.split(':')[2]);
    await setState(ctx, '');
    const q = Math.max(1, Number(text.replace(/[^\d]/g, '')) || 0);
    await ctx.db.prepare('UPDATE creator_licenses SET quota=? WHERE id=?').bind(q, id).run();
    const l = await ctx.db.prepare('SELECT * FROM creator_licenses WHERE id=?').bind(id).first();
    return licenseView(ctx, id);
  }
  if (st.startsWith('admin:vari:')) {
    const sid = Number(st.split(':')[2]);
    await setState(ctx, '');
    const parts = String(text).split('|').map((x) => x.trim());
    const val = (i, d = '') => (parts[i] === undefined || !parts[i] || parts[i] === '-' ? d : parts[i]);
    const v = {
      label: val(0, `واریانت ${Date.now() % 1000}`),
      transport: String(val(1, 'ws')).toLowerCase(),
      port: Number(String(val(2, '443')).replace(/[^\d]/g, '')) || 443,
      sni: val(3),
      security: String(val(4, 'tls')).toLowerCase(),
      host: val(5),
      path: val(6),
      pbk: val(7),
      sid: val(8),
      alpn: val(9, 'h2,http/1.1'),
      fp: val(10, 'chrome'),
    };
    const r = await saveVariant(ctx.db, sid, v);
    if (!r || !r.ok) {
      const err = Array.isArray(r?.errors) ? r.errors.join(' / ') : 'ذخیره نشد';
      return send(ctx.token, ctx.user.id, `⛔ ${err}\n\n${v.security === 'reality' ? 'برای reality باید pbk (کلید عمومی) و sid در همان خط بفرستید.' : ''}`, { reply_markup: menuKb([[btn('⬅️ واریانت‌ها', `adm:anti:s${sid}`)]]) });
    }
    return variantsAdmin(ctx, sid);
  }
  if (st.startsWith('admin:varf:')) {
    const [, , id, field] = st.split(':');
    await setState(ctx, '');
    const v = await ctx.db.prepare('SELECT * FROM config_variants WHERE id=?').bind(Number(id)).first();
    if (v) {
      const patch = { ...v };
      const raw = text.trim();
      if (field === 'port') patch[field] = Number(raw.replace(/[^\d]/g, '')) || v[field];
      else patch[field] = raw === '-' ? '' : raw;
      await saveVariant(ctx.db, v.server_id, patch, Number(id));
    }
    return variantsAdmin(ctx, Number(v?.server_id || 0));
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
