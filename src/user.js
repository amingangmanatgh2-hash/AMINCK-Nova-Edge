// ═══════════════════════════════════════════════════════════════════
//  جریان‌های کاربری — منو، فروشگاه، حساب، رفرال، تست رایگان، چت AI
// ═══════════════════════════════════════════════════════════════════
import { fmtToman, faDigits, fmtDate, getUser, addBalance, hasPerm } from './db.js';
import { send, editText, answerCb, ikb, btn, ubtn, menuKb, userMainKb, forceReply, tg } from './tg.js';
import { getText, getSettingValue, getNum, isEnabled } from './texts.js';
import { productPriceToman, priceLine, RATE_UNAVAILABLE_MESSAGE } from './pricing.js';
import { createOrder, payWithWallet, payWithCoins, approveReceipt, sendDelivery, assertDeliverable } from './pay.js';
import { analyzeReceipt } from './verify.js';
import { grantTrial, buildConfigs, buildDirectLinks } from './subs.js';
import { buildMtprotoLinks, buildSocks5Links, serverIssues, NO_REAL_SERVER_MESSAGE, SERVICE_UNAVAILABLE_MESSAGE, NoRealServerError } from './proxy.js';
import { makeBrandQR } from './qr.js';
import { tmpl, deepLink, getBase, parseMoney } from './util.js';
import { deliverOrder } from './pay.js';
import { openAdminPanel, handleAdminCallback, handleAdminText } from './admin.js';
import { mainKeyboard, handleCustomButton } from './menu.js';
import { needsOwnerClaim, startOwnerClaim, handleOwnerClaimText } from './owner.js';
import { coinPurchaseGate, issueFor } from './pay.js';
import { priceModeLine, getGoldRate } from './pricing.js';
import { gatewayConfig } from './gateway.js';
import { protocolHealth } from './subs.js';
import { aiChatComplete, SHOP_SYSTEM_PROMPT, aiErrorMessage, AI_ERRORS } from './ai.js';

export const CATS = [
  { id: 'vless', label: '⚡ VLESS' },
  { id: 'vmess', label: '🛰 V2ray (VMess)' },
  { id: 'trojan', label: '🐴 Trojan' },
  { id: 'ss', label: '🧩 Shadowsocks' },
  { id: 'openvpn', label: '🔐 OpenVPN' },
  { id: 'mtproto', label: '📡 MTProto تلگرام' },
  { id: 'socks5', label: '🧦 SOCKS5 اختصاصی' },
  { id: 'custom', label: '⭐ کانفیگ‌ساز اختصاصی (ویژه)' },
];

// ─────────────────────────── منوی اصلی ───────────────────────────
export async function showMainMenu(ctx, extraText) {
  const text = extraText || (await getText(ctx.db, 'start_welcome')).replace('{name}', ctx.user.first_name || 'دوست');
  await send(ctx.token, ctx.user.id, text, await mainKeyboard(ctx.db, ctx.user.role !== 'user', { env: ctx.env }));
}

/** دکمهٔ داشبورد (WebApp) — پیام شیشه‌ای با دکمه مربعی منو */
export async function openDashboard(ctx) {
  const base = await getBase(ctx.env);
  if (!base) return send(ctx.token, ctx.user.id, '⚠️ آدرس Worker هنوز ثبت نشده است؛ کمی بعد دوباره تلاش کنید.');
  const label = (await getText(ctx.db, 'dashboard_label')) || '🪟 داشبورد کاربری';
  const u = ctx.user;
  const kb = ikb([[{ text: label, web_app: { url: `${base}/app` } }]]);
  const text =
    `🪟 <b>داشبورد من</b>\n\n` +
    `👤 ${u.first_name || 'کاربر'}${u.username ? ' · @' + u.username : ''}\n` +
    `🆔 <code>${u.id}</code>\n` +
    `👛 موجودی: <b>${fmtToman(u.balance)}</b> · 🪙 سکه: <b>${faDigits(Number(u.coins || 0).toLocaleString('en-US'))}</b>\n\n` +
    `با دکمهٔ زیر، فروشگاه + سکه + ماموریت + رفرال + پروفایل را داخل همین تلگرام باز کنید 👇`;
  await send(ctx.token, ctx.user.id, text, { reply_markup: kb });
}

export async function handleStart(ctx, payload) {
  // 🔐 بخش ۱۷: تا مالک تایید نشود، به اولین کاربر «پنل» داده نمی‌شود
  if (await needsOwnerClaim(ctx.db, ctx.user.id)) {
    await startOwnerClaim(ctx);
    return;
  }
  // 🏦 بازگشت از درگاه بعد از پرداخت موفق
  if (payload?.startsWith('pay_')) {
    const orderId = Number(payload.slice(4));
    const order = await ctx.db.prepare('SELECT * FROM orders WHERE id=? AND user_id=?').bind(orderId, ctx.user.id).first();
    if (order && order.status === 'pending') {
      await showMainMenu(ctx, `🧾 سفارش #${faDigits(order.id)} هنوز در انتظار تایید پرداخت است.\n\nاگر پرداخت کردید، چند لحظه صبر کنید؛ به‌محض وریفای شدن از سوی درگاه، سرویس برایتان ارسال می‌شود. ⏳`);
      return;
    }
    if (order && order.status === 'paid') {
      await showMainMenu(ctx, '✅ پرداخت شما ثبت شده است. سرویس در «اشتراک‌های من» در دسترس است.');
      return;
    }
  }
  if (payload?.startsWith('ref_') && ctx.isNew && ctx.user.referrer_id) {
    await send(ctx.token, ctx.user.id, '🎉 خوش اومدی! شما با لینک دوستت وارد شدی؛ بعد از اولین خریدت، به او پاداش نقدی تعلق می‌گیرد. 🤝');
  }
  if (payload === 'shop_home') return openShop(ctx);
  if (payload?.startsWith('shop_') || payload?.startsWith('prod_')) {
    await showMainMenu(ctx);
    return openProduct(ctx, Number(payload.slice(5)));
  }
  if (payload === 'trial') {
    await showMainMenu(ctx);
    return giveTrial(ctx);
  }
  return showMainMenu(ctx);
}

// ─────────────────────────── فروشگاه ───────────────────────────
export async function openShop(ctx, editMsg) {
  if (!(await isEnabled(ctx.db, 'shop_enabled'))) {
    const m = await send(ctx.token, ctx.user.id, '🚫 فروشگاه موقتاً غیرفعال است.');
    return;
  }
  const rows = [];
  for (let i = 0; i < CATS.length; i += 2) {
    const row = [btn(CATS[i].label, `cat:${CATS[i].id}`)];
    if (CATS[i + 1]) row.push(btn(CATS[i + 1].label, `cat:${CATS[i + 1].id}`));
    rows.push(row);
  }
  const text = (await getText(ctx.db, 'shop_welcome')) + '\n\n' + (await priceLine(ctx.env));
  const kb = menuKb(rows);
  if (editMsg) await editText(ctx.token, ctx.user.id, editMsg.message_id, text, { reply_markup: kb });
  else await send(ctx.token, ctx.user.id, text, { reply_markup: kb });
}

export async function openCategory(ctx, cat, editMsg) {
  if (cat === 'custom') return openCustomWizard(ctx, null, editMsg);
  const products = (
    await ctx.db.prepare('SELECT * FROM products WHERE category=? AND enabled=1 ORDER BY sort ASC, price_usd ASC').bind(cat).all()
  ).results;
  if (!products.length) {
    const text = '😕 در این دسته‌بندی فعلاً محصولی ثبت نشده است.';
    return editMsg
      ? editText(ctx.token, ctx.user.id, editMsg.message_id, text, { reply_markup: menuKb([], 'shop') })
      : send(ctx.token, ctx.user.id, text, { reply_markup: menuKb([], 'shop') });
  }
  const lines = [`<b>${CATS.find((c) => c.id === cat)?.label || cat}</b>\n`, await priceLine(ctx.env), ''];
  const rows = [];
  for (const p of products) {
    const price = await productPriceToman(ctx.env, p);
    lines.push(`▪️ <b>${p.title}</b> — ${faDigits(p.days)} روز ${p.traffic_gb ? `| ${faDigits(p.traffic_gb)} گیگ` : '| نامحدود'} — ${fmtToman(price)}`);
    rows.push([btn(`${p.title} | ${fmtToman(price)}`, `prod:${p.id}`)]);
  }
  const kb = menuKb(rows, 'shop');
  if (editMsg) await editText(ctx.token, ctx.user.id, editMsg.message_id, lines.join('\n'), { reply_markup: kb });
  else await send(ctx.token, ctx.user.id, lines.join('\n'), { reply_markup: kb });
}

export async function openProduct(ctx, id, editMsg) {
  const p = await ctx.db.prepare('SELECT * FROM products WHERE id=?').bind(id).first();
  if (!p || !p.enabled) return send(ctx.token, ctx.user.id, '❌ محصول یافت نشد.');
  const price = await productPriceToman(ctx.env, p);
  const health = await protocolHealth(ctx.db, p.protocol || 'vless');
  const statusLine = health.ok
    ? `🟢 وضعیت: آماده تحویل (${faDigits(health.healthyCount)} مسیر سالم)`
    : '🔴 وضعیت: فعلاً مسیر سالمی ندارد (تحویل متوقف شده است)';
  const isCreator = String(p.category || '') === 'creator';
  let text = (await getText(ctx.db, 'product_info'))
    .replace('{title}', p.title)
    .replace('{days}', faDigits(p.days))
    .replace('{traffic}', p.traffic_gb ? faDigits(p.traffic_gb) + ' گیگابایت' : 'نامحدود 🌊')
    .replace('{count}', faDigits(p.server_count));
  if (p.description) text += `\n\n📝 ${p.description}`;
  if (!isCreator) text += `\n${statusLine}`;
  const soldOut = Number(p.stock) === 0;
  if (Number(p.stock) >= 0) text += `\n📦 موجودی: <b>${faDigits(p.stock)}</b>${soldOut ? ' — ⛔ تمام شده' : ''}`;
  text += `\n🧩 نوع سرویس: <b>${p.category || p.protocol}</b>${p.tier ? ' · ' + tierLabel(p.tier) : ''}`;
  text += `\n\n💰 قیمت: <b>${price ? fmtToman(price) : '—'}</b>\n` + (await priceModeLine(ctx.env, p));

  const rows = [];
  const gw = await gatewayConfig(ctx.env);
  if (soldOut) {
    rows.push([btn('📞 خبر بده وقتی شارژ شد', 'sup:open')]);
  } else {
    rows.push([btn('💳 پرداخت کارت به کارت', `buy:c:${p.id}`)]);
    if (gw.enabled) rows.push([btn('🏦 پرداخت آنی با درگاه بانکی', `buy:g:${p.id}`)]);
    rows.push([btn('👛 خرید از کیف پول', `buy:w:${p.id}`)]);
    const coinGate = await coinPurchaseGate(ctx.env, p);
    if (coinGate.ok && Number(p.coin_price) > 0) rows.push([btn(`🪙 پرداخت با ${faDigits(Number(p.coin_price).toLocaleString('en-US'))} سکه`, `buy:coin:${p.id}`)]);
  }
  rows.push([btn('🎁 دریافت تست رایگان', 'trial'), btn('🛒 بازگشت به فروشگاه', 'shop')]);
  if (editMsg) await editText(ctx.token, ctx.user.id, editMsg.message_id, text, { reply_markup: ikb(rows) });
  else await send(ctx.token, ctx.user.id, text, { reply_markup: ikb(rows) });
}

export function tierLabel(t) {
  return { economy: '🪙 اقتصادی', standard: '⚖️ متوسط', premium: '💎 پریمیوم' }[String(t || '').toLowerCase()] || String(t || '');
}

async function startBuy(ctx, productId, method) {
  const p = await ctx.db.prepare('SELECT * FROM products WHERE id=?').bind(productId).first();
  if (!p) return send(ctx.token, ctx.user.id, '❌ محصول یافت نشد.');
  const price = await productPriceToman(ctx.env, p);

  // ⛔ بدون نرخ معتبر، خرید با قیمت صفر انجام نمی‌شود (مگر قیمت ثابت)
  if (!price) return send(ctx.token, ctx.user.id, RATE_UNAVAILABLE_MESSAGE, { reply_markup: ikb([[btn('📞 پشتیبانی', 'sup:open')]]) });

  if (method === 'coin') {
    const gate = await coinPurchaseGate(ctx.env, p);
    if (!gate.ok) return send(ctx.token, ctx.user.id, gate.message, { reply_markup: ikb([[btn('↩️ بازگشت', `prod:${p.id}`)]]) });
    const res = await payWithCoins(ctx.env, ctx.user, p);
    if (!res.ok) return send(ctx.token, ctx.user.id, `😕 ${res.message || res.reason}`);
    await sendDelivery(ctx.env, ctx.user, p.title, res.sub, { protocol: p.protocol });
    return;
  }

  if (method === 'g') {
    if (!(await gatewayConfig(ctx.env)).enabled) return send(ctx.token, ctx.user.id, '🚫 درگاه بانکی فعال نیست.');
    const can = await assertDeliverable(ctx.env, p);
    if (!can.ok) return send(ctx.token, ctx.user.id, can.message || SERVICE_UNAVAILABLE_MESSAGE);
    const order = await createOrder(ctx.env, ctx.user.id, p, price, 'gateway');
    const { createPayment } = await import('./gateway.js');
    const res = await createPayment(ctx.env, order, ctx.user, { description: `سفارش ${order.id} - ${p.title}` });
    if (!res.ok) {
      await ctx.db.prepare("UPDATE orders SET status='rejected', note=? WHERE id=?").bind('gateway: ' + res.message, order.id).run();
      return send(
        ctx.token,
        ctx.user.id,
        `⛔ <b>ساخت فاکتور درگاه ناموفق بود</b>\n\n${res.message}\n\nمی‌توانید با کارت‌به‌کارت پرداخت کنید.`,
        { reply_markup: ikb([[btn('💳 کارت به کارت', `buy:c:${p.id}`), btn('↩️ بازگشت', `prod:${p.id}`)]]) }
      );
    }
    const lines = [
      '🏦 <b>فاکتور درگاه بانکی آماده است</b>\n',
      `🧾 سفارش #${faDigits(order.id)} — ${p.title}`,
      `💰 مبلغ: <b>${fmtToman(res.total)}</b>${res.fee ? ` (کارمزد ${fmtToman(res.fee)} بر عهدهٔ شما)` : ''}`,
      '',
      'با دکمهٔ زیر به درگاه_bankی بانک می‌روید؛ بعد از پرداخت، سرویس به‌صورت خودکار و آنی فعال می‌شود ✨',
      '',
      '⏱ اگر پرداخت انجام شد اما فعال نشد، چند دقیقه صبر کنید (کرون، تراکنش‌های معلق را واریز/تسویه می‌کند).',
    ];
    const rows = [[{ text: '💳 پرداخت ' + fmtToman(res.total), url: res.url }], [btn('❌ انصراف', `cancel:${order.id}`), btn('↩️ بازگشت', `prod:${p.id}`)]];
    return send(ctx.token, ctx.user.id, lines.join('\n'), { reply_markup: ikb(rows) });
  }

  if (method === 'w') {
    if (!(await isEnabled(ctx.db, 'wallet_enabled'))) return send(ctx.token, ctx.user.id, '🚫 پرداخت کیف پولی موقتاً غیرفعال است.');
    const res = await payWithWallet(ctx.env, ctx.user, p, price);
    if (!res.ok) {
      if (res.reason === 'no_real_server') {
        return send(ctx.token, ctx.user.id, NO_REAL_SERVER_MESSAGE, { reply_markup: ikb([[btn('📞 پشتیبانی', 'sup:open')]]) });
      }
      if (res.reason === 'no_healthy_route' || res.reason === 'manual_killswitch') {
        return send(ctx.token, ctx.user.id, res.message || SERVICE_UNAVAILABLE_MESSAGE, { reply_markup: ikb([[btn('📞 پشتیبانی', 'sup:open')]]) });
      }
      return send(
        ctx.token,
        ctx.user.id,
        `😕 موجودی کیف پول شما ${fmtToman(ctx.user.balance)} است و برای این خرید (${fmtToman(price)}) کافی نیست.\nمی‌توانید از دکمه زیر کیف پول را شارژ کنید.`,
        { reply_markup: ikb([[btn('💳 شارژ کیف پول', 'acc:charge')]]) }
      );
    }
    // ✅ فقط یک پیام تحویل — بدون پیام تکراری «پرداخت تایید شد»
    await sendDelivery(ctx.env, ctx.user, p.title, res.sub, { protocol: p.protocol });
    return;
  }

  if (!(await isEnabled(ctx.db, 'card_pay_enabled'))) return send(ctx.token, ctx.user.id, '🚫 پرداخت کارتی موقتاً غیرفعال است.');
  const canCard = await assertDeliverable(ctx.env, p);
  if (!canCard.ok) return send(ctx.token, ctx.user.id, canCard.message || NO_REAL_SERVER_MESSAGE, { reply_markup: ikb([[btn('📞 پشتیبانی', 'sup:open')]]) });
  const order = await createOrder(ctx.env, ctx.user.id, p, price, 'card');
  const card = await getSettingValue(ctx.db, 'card_number');
  const holder = await getSettingValue(ctx.db, 'card_holder');
  const text = (await getText(ctx.db, 'pay_intro'))
    .replace('{amount}', fmtToman(price))
    .replace('{card}', card.replace(/(\d{4})/g, '$1 ').trim())
    .replace('{holder}', holder);
  await setState(ctx, `receipt:${order.id}`);
  await send(ctx.token, ctx.user.id, text + `\n\n🧾 سفارش #${faDigits(order.id)}`, { reply_markup: ikb([[btn('❌ انصراف از خرید', `cancel:${order.id}`)]]) });
}

export async function startCharge(ctx) {
  await setState(ctx, 'charge');
  await send(ctx.token, ctx.user.id, '💳 <b>شارژ کیف پول</b>\n\nمبلغ شارژ را به تومان وارد کنید 👇\n(مثال: <code>100000</code>)', forceReply('مبلغ به تومان'));
}

// ─────────────────────────── فیش و پرداخت ───────────────────────────
export async function handleReceiptPhoto(ctx, photo) {
  const st = ctx.user.state || '';
  if (!st.startsWith('receipt:')) {
    return send(ctx.token, ctx.user.id, '🤔 فیش برای سفارش فعالی در انتظار نیست. از فروشگاه سفارش دهید.');
  }
  const orderId = Number(st.split(':')[1]);
  const order = await ctx.db.prepare('SELECT * FROM orders WHERE id=?').bind(orderId).first();
  if (!order || order.status !== 'pending') {
    await setState(ctx, '');
    return send(ctx.token, ctx.user.id, '⚠️ این سفارش دیگر در انتظار پرداخت نیست.');
  }
  await send(ctx.token, ctx.user.id, '🤖 در حال بررسی هوشمند فیش... ⏳');
  const fileId = photo[photo.length - 1].file_id;
  const fr = await tg(ctx.token, 'getFile', { file_id: fileId });
  let bytes = new Uint8Array();
  if (fr?.ok) {
    try {
      const res = await fetch(`https://api.telegram.org/file/bot${ctx.token}/${fr.result.file_path}`);
      bytes = new Uint8Array(await res.arrayBuffer());
    } catch {}
  }
  const autoVerify = (await getSettingValue(ctx.db, 'auto_verify')) === '1';
  let verdict = { verdict: 'manual', reasons: ['دریافت تصویر ناموفق؛ بررسی دستی.'] };
  if (bytes.length) verdict = await analyzeReceipt(ctx.env, bytes, order.amount_toman);

  const report = verdict.reasons.join('\n');
  await ctx.db
    .prepare('INSERT INTO receipts (user_id, order_id, file_id, claimed_amount, status, ai_report, created_at) VALUES (?,?,?,?,?,?,?)')
    .bind(ctx.user.id, orderId, fileId, verdict.data?.amount_toman || 0, 'pending', `${verdict.verdict}\n${report}`, Math.floor(Date.now() / 1000))
    .run();

  if (verdict.verdict === 'auto' && autoVerify) {
    const receipt = await ctx.db.prepare('SELECT * FROM receipts WHERE order_id=? ORDER BY id DESC LIMIT 1').bind(orderId).first();
    const res = await approveReceipt(ctx.env, receipt);
    await setState(ctx, '');
    if (res?.error === 'no_real_server') {
      await send(ctx.token, ctx.user.id, `🧾 فیش شما تایید شد اما ${NO_REAL_SERVER_MESSAGE}\nپشتیبانی پیگیری می‌کند. 🙏`);
      await notifyAdmins(ctx, `⛔ فیش سفارش #${faDigits(orderId)} تایید شد ولی سرور واقعی برای تحویل وجود ندارد.`, null, 'serviceError');
      return;
    }
    if (res?.charge) {
      // پیام واحد: تایید پرداخت + نتیجه
      await send(ctx.token, ctx.user.id, `✅ <b>پرداخت تایید شد</b>\n\n👛 کیف پول شما با ${fmtToman(order.amount_toman)} شارژ شد.\n🤖 تایید خودکار هوش مصنوعی`);
    } else if (res?.sub) {
      // ۱) یک پیام تایید پرداخت  ۲) یک پیام تحویل نهایی
      await send(ctx.token, ctx.user.id, `✅ <b>پرداخت تایید شد</b>\n\n🧾 سفارش #${faDigits(orderId)} — ${fmtToman(order.amount_toman)}\n🤖 تایید خودکار هوش مصنوعی\n⏳ در حال آماده‌سازی تحویل…`);
      await sendDelivery(ctx.env, res.user, res.order.title || order.title, res.sub, { protocol: res.product?.protocol });
    }
    await notifyAdmins(ctx, `🤖✅ فیش سفارش #${faDigits(orderId)} از ${userTag(ctx.user)} به‌صورت خودکار تایید و تحویل شد.\n${report}`, null, 'receipt');
    return;
  }

  await setState(ctx, '');
  await send(ctx.token, ctx.user.id, await getText(ctx.db, 'receipt_pending'));
  const rec = await ctx.db.prepare('SELECT * FROM receipts WHERE order_id=? ORDER BY id DESC LIMIT 1').bind(orderId).first();
  await notifyAdmins(
    ctx,
    `🧾 <b>فیش جدید در صف بررسی</b>\n👤 ${userTag(ctx.user)}\n💰 سفارش: ${fmtToman(order.amount_toman)} — ${order.title}\n🤖 نظر هوش مصنوعی:\n${report}`,
    ikb([
      [btn('✅ تایید', `rcpt:a:${rec.id}`), btn('❌ رد', `rcpt:r:${rec.id}`)],
      [btn('👤 پروفایل کاربر', `adm:u:${ctx.user.id}`)],
    ]),
    verdict.verdict === 'reject' ? 'suspicious' : 'receipt'
  );
}

/** اعلان به ادمین‌ها — از طریق مرکز اعلان‌ها (قابل خاموش‌کردن و ضداسپم) */
async function notifyAdmins(ctx, text, kb, type = 'receipt') {
  const { notifyAdmins: shared } = await import('./notify.js');
  return shared(ctx.env, type, text, kb);
}

export function userTag(u) {
  return `${u.first_name || ''} ${u.username ? '@' + u.username : ''} (<code>${u.id}</code>)`;
}

// ─────────────────────────── حساب من ───────────────────────────
export async function openAccount(ctx, editMsg) {
  const subs = (await ctx.db.prepare('SELECT COUNT(*) c FROM subscriptions WHERE user_id=? AND active=1 AND expire_at>?').bind(ctx.user.id, now()).first())?.c || 0;
  const text = (await getText(ctx.db, 'wallet_intro'))
    .replace('{balance}', fmtToman(ctx.user.balance))
    .replace('{coins}', faDigits(ctx.user.coins.toLocaleString('en-US')));
  const rows = [
    [btn('💳 شارژ کیف پول', 'acc:charge'), btn('📦 اشتراک‌های من', 'acc:subs')],
    [btn('🧾 سفارش‌های من', 'acc:orders'), btn('🔄 تمدید سریع', 'acc:subs')],
  ];
  const kb = menuKb(rows);
  const extra = `\n📦 اشتراک‌های فعال: <b>${faDigits(subs)}</b>\n💵 مجموع خریدها: <b>${fmtToman(ctx.user.total_paid)}</b>`;
  if (editMsg) await editText(ctx.token, ctx.user.id, editMsg.message_id, text + extra, { reply_markup: kb });
  else await send(ctx.token, ctx.user.id, text + extra, { reply_markup: kb });
}

export async function mySubs(ctx, page = 0, editMsg) {
  const per = 5;
  const total = (await ctx.db.prepare('SELECT COUNT(*) c FROM subscriptions WHERE user_id=?').bind(ctx.user.id).first())?.c || 0;
  const subs = (
    await ctx.db.prepare('SELECT * FROM subscriptions WHERE user_id=? ORDER BY id DESC LIMIT ? OFFSET ?').bind(ctx.user.id, per, page * per).all()
  ).results;
  if (!subs.length) {
    const t = '📭 هنوز اشتراکی ندارید.\nاز فروشگاه یک کانفیگ تهیه کنید یا تست رایگان بگیرید! 🎁';
    return send(ctx.token, ctx.user.id, t, { reply_markup: menuKb([[btn('🛍 فروشگاه', 'shop')]], 'account') });
  }
  const rows = [];
  const lines = ['📦 <b>اشتراک‌های شما</b>\n'];
  for (const s of subs) {
    const expired = s.expire_at < now();
    lines.push(`${expired ? '⛔' : '🟢'} <b>${s.title}</b> — تا ${fmtDate(s.expire_at)}`);
    rows.push([btn(`${expired ? '🔄 تمدید' : '🔳'} ${s.title}`, expired ? `renew:${s.product_id}` : `qr:${s.token}`)]);
  }
  const nav = [];
  if (page > 0) nav.push(btn('⬅️ قبلی', `acc:subs:pg:${page - 1}`));
  if ((page + 1) * per < total) nav.push(btn('➡️ بعدی', `acc:subs:pg:${page + 1}`));
  if (nav.length) rows.push(nav);
  const kb = menuKb(rows, 'account');
  if (editMsg) await editText(ctx.token, ctx.user.id, editMsg.message_id, lines.join('\n'), { reply_markup: kb });
  else await send(ctx.token, ctx.user.id, lines.join('\n'), { reply_markup: kb });
}

export async function myOrders(ctx) {
  const orders = (await ctx.db.prepare('SELECT * FROM orders WHERE user_id=? ORDER BY id DESC LIMIT 10').bind(ctx.user.id).all()).results;
  if (!orders.length) return send(ctx.token, ctx.user.id, '📭 سفارشی ثبت نشده است.', { reply_markup: menuKb([], 'account') });
  const st = { paid: '✅ پرداخت شده', pending: '⏳ در انتظار تایید', rejected: '❌ رد شده' };
  const lines = ['🧾 <b>آخرین سفارش‌ها</b>\n', ...orders.map((o) => `${st[o.status] || o.status} | ${o.title || 'شارژ کیف پول'} | ${fmtToman(o.amount_toman)} | ${fmtDate(o.created_at)}`)];
  await send(ctx.token, ctx.user.id, lines.join('\n'), { reply_markup: menuKb([], 'account') });
}

export async function showQR(ctx, token) {
  if (token.startsWith('lic:')) {
    const lic = await ctx.db.prepare('SELECT * FROM creator_licenses WHERE token=?').bind(token.slice(4)).first();
    if (!lic || lic.user_id !== ctx.user.id) return answerCb(ctx.token, ctx.cbId, 'یافت نشد');
    const base = await getBase(ctx.env);
    const png = await makeBrandQR(`${base}/creator/${lic.token}`, 'AMINCK Creator');
    const form = new FormData();
    form.append('chat_id', String(ctx.user.id));
    form.append('caption', `🔳 QR پنل کانفیگ‌ساز\n🛠 با اسکن، پنل شما در هر دستگاهی باز می‌شود.`);
    form.append('photo', new Blob([png], { type: 'image/png' }), 'qr.png');
    await tg(ctx.token, 'sendPhoto', {}, form);
    return answerCb(ctx.token, ctx.cbId);
  }
  const sub = await ctx.db.prepare('SELECT * FROM subscriptions WHERE token=?').bind(token).first();
  if (!sub || sub.user_id !== ctx.user.id) return answerCb(ctx.token, ctx.cbId, 'یافت نشد');
  const base = await getBase(ctx.env);
  const url = base ? `${base}/sub/${sub.token}` : `token:${sub.token}`;
  const png = await makeBrandQR(url, sub.title);
  const form = new FormData();
  form.append('chat_id', String(ctx.user.id));
  form.append('caption', `🔳 QR اختصاصی اشتراک «${sub.title}»\n⏰ اعتبار تا: ${fmtDate(sub.expire_at)}`);
  form.append('photo', new Blob([png], { type: 'image/png' }), 'qr.png');
  await tg(ctx.token, 'sendPhoto', {}, form);
  await answerCb(ctx.token, ctx.cbId);
}

// ─────────────────────────── زیرمجموعه ───────────────────────────
export async function openReferral(ctx, editMsg) {
  if (!(await isEnabled(ctx.db, 'referral_enabled'))) return send(ctx.token, ctx.user.id, '🚫 سیستم زیرمجموعه‌گیری موقتاً غیرفعال است.');
  const percent = await getNum(ctx.db, 'referral_percent', 10);
  const goal = await getNum(ctx.db, 'referral_goal', 5);
  const link = deepLink(ctx.botUsername, `ref_${ctx.user.id}`);
  const invited = ctx.user.invited_count || 0;
  const remain = Math.max(0, goal - invited);
  const progress = '█'.repeat(Math.min(goal, invited)) + '░'.repeat(Math.max(0, goal - invited));
  let text = ((await getText(ctx.db, 'referral_intro')).replace('{percent}', faDigits(percent)) +
    `\n\n🔗 لینک اختصاصی شما:\n<code>${link}</code>\n` +
    `\n👥 دعوت‌های موفق: <b>${faDigits(invited)}</b>\n` +
    `📊 پیشرفت جایزه: <code>${progress}</code>\n` +
    (remain ? `🎁 تا کانفیگ رایگان: ${faDigits(remain)} دعوت دیگر` : '🎉 به هدف رسیدید! کانفیگ رایگان شما با اولین خریدهای بعدی فعال می‌ماند.'));
  const rows = [
    [ubtn('📤 اشتراک لینک', `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('⚡ بهترین سرویس کانفیگ رو از اینجا بگیر!')}`)],
    [btn('👥 زیرمجموعه‌های من', 'ref:list')],
  ];
  const kb = menuKb(rows);
  if (editMsg) await editText(ctx.token, ctx.user.id, editMsg.message_id, text, { reply_markup: kb });
  else await send(ctx.token, ctx.user.id, text, { reply_markup: kb });
}

export async function refList(ctx) {
  const refs = (
    await ctx.db.prepare('SELECT id, first_name, username, ref_first_paid, created_at FROM users WHERE referrer_id=? ORDER BY created_at DESC LIMIT 30').bind(ctx.user.id).all()
  ).results;
  if (!refs.length) return send(ctx.token, ctx.user.id, 'هنوز کسی را دعوت نکرده‌اید. لینکتان را با دوستانتان به اشتراک بگذارید! 🚀', { reply_markup: menuKb([], 'ref') });
  const lines = ['👥 <b>زیرمجموعه‌های شما</b>\n', ...refs.map((r, i) => `${faDigits(i + 1)}. ${r.first_name || r.username || r.id} — ${r.ref_first_paid ? '✅ خرید اول انجام شده' : '⏳ در انتظار اولین خرید'}`)];
  await send(ctx.token, ctx.user.id, lines.join('\n'), { reply_markup: menuKb([], 'ref') });
}

// ─────────────────────────── تست رایگان ───────────────────────────
export async function openTrial(ctx, editMsg) {
  const rows = [
    [btn('🎁 دریافت تست رایگان', 'trial:get')],
    [btn('📡 پروکسی‌های رایگان', 'free:proxies')],
  ];
  const text =
    '🎁 <b>پروکسی و تست رایگان</b>\n\n' +
    'هر کاربر می‌تواند یک‌بار از سرویس ما به‌صورت رایگان تست بگیرد:\n' +
    '⏱ اعتبار: ۱ روز کامل | 📊 حجم: ۵۰۰ مگابایت | 🚀 پرسرعت‌ترین سرور';
  if (editMsg) await editText(ctx.token, ctx.user.id, editMsg.message_id, text, { reply_markup: menuKb(rows) });
  else await send(ctx.token, ctx.user.id, text, { reply_markup: menuKb(rows) });
}

export async function giveTrial(ctx) {
  if (!(await isEnabled(ctx.db, 'trial_enabled'))) return send(ctx.token, ctx.user.id, '🚫 تست رایگان موقتاً غیرفعال است.');
  if (ctx.user.trial_used) return send(ctx.token, ctx.user.id, '⚠️ شما قبلاً از تست رایگان استفاده کرده‌اید.\nبرای خرید اشتراک به فروشگاه مراجعه کنید. 🛍');
  let sub;
  try {
    sub = await grantTrial(ctx.env, ctx.user);
  } catch (e) {
    if (e instanceof NoRealServerError) {
      return send(ctx.token, ctx.user.id, e.message || NO_REAL_SERVER_MESSAGE, { reply_markup: ikb([[btn('📞 پشتیبانی', 'sup:open')]]) });
    }
    throw e;
  }
  // تست رایگان فقط بعد از ساخت موفق مصرف می‌شود
  await ctx.db.prepare('UPDATE users SET trial_used=1 WHERE id=?').bind(ctx.user.id).run();
  await send(ctx.token, ctx.user.id, await getText(ctx.db, 'trial_ok'));
  await sendDelivery(ctx.env, ctx.user, '🎁 تست رایگان', sub, { protocol: 'vless' });
}

export async function freeProxies(ctx) {
  const rows = (await ctx.db.prepare("SELECT * FROM servers WHERE active=1 AND healthy=1 AND protocol IN ('mtproto','socks5') ORDER BY speed_rank ASC LIMIT 10").all()).results;
  // ⛔ فقط سرورهایی که واقعاً host/port/secret دارند
  const links = buildDirectLinks(rows, ctx.user.username || '');
  if (!links.length) {
    return send(ctx.token, ctx.user.id, '😕 فعلاً پروکسی رایگانی ثبت نشده است.', { reply_markup: menuKb([], 'trial') });
  }
  const lines = [
    '📡 <b>پروکسی‌های رایگان تلگرام</b>',
    'روی دکمهٔ هر پروکسی بزنید تا مستقیم در تلگرام اضافه شود 👇',
    '',
    ...links.map((l) => `▪️ <b>${l.server.name}</b>${l.server.country ? ' — ' + l.server.country : ''}\n<code>${l.tg}</code>`),
  ];
  const rows2 = links.slice(0, 8).map((l) => [ubtn(`🔗 ${l.kind === 'mtproto' ? 'اتصال مستقیم' : 'SOCKS5'} — ${l.server.name}`, l.https)]);
  await send(ctx.token, ctx.user.id, lines.join('\n'), { reply_markup: menuKb(rows2, 'trial') });
}

// ─────────────────────────── پشتیبانی ───────────────────────────
export async function openSupport(ctx, editMsg) {
  await setState(ctx, '');
  const text =
    (await getText(ctx.db, 'support_text')) +
    '\n\n🤝 پشتیبانی دو حالت دارد:\n' +
    '🤖 <b>دستیار هوشمند</b> — پاسخ آنی و شبانه‌روزی به سوالات رایج\n' +
    '🧑‍💼 <b>اپراتور انسانی</b> — برای موارد مالی و پیگیری سفارش\n\n' +
    'کدام را می‌خواهید؟ 👇';
  const rows = [
    [btn('🤖 دستیار هوشمند', 'sup:ai')],
    [btn('🧑‍💼 اتصال به اپراتور', 'op:connect')],
  ];
  if (editMsg) await editText(ctx.token, ctx.user.id, editMsg.message_id, text, { reply_markup: ikb(rows) });
  else await send(ctx.token, ctx.user.id, text, { reply_markup: ikb(rows) });
}

/** ورود به حالت گفتگو با اپراتور انسانی */
export async function connectOperator(ctx) {
  await setState(ctx, 'support');
  await send(
    ctx.token,
    ctx.user.id,
    '🧑‍💼 <b>اتصال به اپراتور انسانی</b>\n\n' +
      '✍️ پیام خود را بنویسید؛ مستقیم به تیم پشتیبانی می‌رسد.\n' +
      '⏱ میانگین پاسخ‌گویی: کمتر از ۳۰ دقیقه\n' +
      'تا وقتی از این حالت خارج نشوید، پیام‌هایتان به اپراتور ارسال می‌شود (نه به هوش مصنوعی).',
    { reply_markup: ikb([[btn('🚪 خروج از حالت پشتیبانی', 'sup:exit')]]) }
  );
}

/** ورود به حالت گفتگو با دستیار هوشمند */
export async function startAiChat(ctx) {
  await setState(ctx, '');
  const price = await getNum(ctx.db, 'ai_price_coins', 5);
  await send(
    ctx.token,
    ctx.user.id,
    `🤖 <b>دستیار هوشمند AMINCK</b>\n\nسوالت رو همینجا بنویس! 💬\n🪙 هزینه هر پیام: ${faDigits(price)} سکه (در صورت خطا کسر نمی‌شود)`,
    { reply_markup: ikb([[btn('🎮 دریافت سکه رایگان', 'game')], [btn('🧑‍💼 اتصال به اپراتور', 'op:connect')]]) }
  );
}

// ─────────────────────────── راهنما ───────────────────────────
export async function showHelp(ctx) {
  const price = await getNum(ctx.db, 'ai_price_coins', 5);
  const text = [
    '📖 <b>راهنمای کامل ربات AMINCK</b>\n',
    '🛍 <b>فروشگاه</b> — انتخاب دسته (VLESS، VMess، Trojan، Shadowsocks، OpenVPN، MTProto، SOCKS5) و خرید با کیف پول یا کارت‌به‌کارت. بعد از پرداخت، کانفیگ و لینک ساب آنی تحویل می‌شود.',
    '🎁 <b>تست رایگان</b> — یک‌بار برای هر کاربر؛ همراه با لیست پروکسی‌های رایگان تلگرام.',
    '💳 <b>حساب من</b> — شارژ کیف پول، اشتراک‌های فعال، QR اختصاصی و تاریخچه سفارش‌ها.',
    '👥 <b>زیرمجموعه من</b> — لینک دعوت اختصاصی؛ بعد از اولین خرید هر دوست، درصدی نقدی به کیف پولتان اضافه می‌شود.',
    '🎮 <b>مینی‌اپ سکه‌ای</b> — تپ کن و سکه بگیر؛ سکه‌ها برای چت هوش مصنوعی و محصولات سکه‌ای استفاده می‌شوند.',
    `🤖 <b>چت هوش مصنوعی</b> — دستیار فارسی روی Workers AI؛ هر پیام ${faDigits(price)} سکه.`,
    '🧑‍💼 <b>اپراتور انسانی</b> — از «📞 پشتیبانی» یا دکمه «اتصال به اپراتور».\n',
    '⌨️ <b>دستورها:</b>',
    '<code>/start</code> — منوی اصلی',
    '<code>/shop</code> — فروشگاه',
    '<code>/account</code> — حساب من',
    '<code>/ref</code> — زیرمجموعه',
    '<code>/trial</code> — تست رایگان',
    '<code>/ai</code> — چت با هوش مصنوعی',
    '<code>/support</code> — پشتیبانی و اپراتور',
    '<code>/help</code> — همین راهنما',
    '<code>/cancel</code> — لغو عملیات جاری\n',
    '💡 در گروه‌ها هم می‌توانید با ریپلای روی پیام ربات یا منشن کردن آن، از هوش مصنوعی سوال بپرسید.',
  ].join('\n');
  await send(ctx.token, ctx.user.id, text, { reply_markup: ikb([[btn('🛍 فروشگاه', 'shop'), btn('📞 پشتیبانی', 'sup:open')]]) });
}

export async function handleSupportMsg(ctx, msg) {
  const admins = (await ctx.db.prepare("SELECT id FROM users WHERE role IN ('super','admin')").all()).results;
  const preview = msg.text ? msg.text.slice(0, 900) : msg.caption || '(فایل/عکس)';
  const kb = ikb([[btn('✍️ پاسخ به کاربر', `adm:reply:${ctx.user.id}`)]]);
  for (const a of admins) {
    if (msg.photo?.length && msg.photo[msg.photo.length - 1].file_id) {
      await tg(ctx.token, 'sendPhoto', { chat_id: a.id, photo: msg.photo[msg.photo.length - 1].file_id, caption: `🧑‍💼 پیام اپراتوری از ${userTag(ctx.user)}:\n${preview}` , reply_markup: kb});
    } else {
      await send(ctx.token, a.id, `🧑‍💼 پیام اپراتوری از ${userTag(ctx.user)}:\n\n${preview}`, { reply_markup: kb });
    }
  }
  await send(ctx.token, ctx.user.id, '✅ پیام شما برای تیم پشتیبانی ارسال شد. منتظر پاسخ باشید. 🙏');
}

// ─────────────────────────── چت هوش مصنوعی ───────────────────────────

/** هشدار خطای پیکربندی AI به ادمین‌ها — حداکثر یک‌بار در ساعت، بدون داده حساس */
async function warnAdminsAi(ctx, code, detail) {
  try {
    const key = `aiwarn:${code}`;
    if (await ctx.env.KV.get(key)) return;
    await ctx.env.KV.put(key, '1', { expirationTtl: 3600 });
    const admins = (await ctx.db.prepare("SELECT id FROM users WHERE role IN ('super','admin')").all()).results || [];
    for (const a of admins) {
      await send(ctx.token, a.id, `🛠 <b>هشدار هوش مصنوعی</b>\n\nکد خطا: <code>${code}</code>\n${detail}`);
    }
  } catch {
    /* هشدار نباید جریان کاربر را خراب کند */
  }
}

export async function aiChat(ctx, text) {
  if (!(await isEnabled(ctx.db, 'ai_enabled'))) return send(ctx.token, ctx.user.id, '🚫 چت هوش مصنوعی موقتاً غیرفعال است.');
  const price = await getNum(ctx.db, 'ai_price_coins', 5);
  if ((ctx.user.coins || 0) < price) {
    return send(ctx.token, ctx.user.id, `🪙 برای هر پیام ${faDigits(price)} سکه کسر می‌شود و موجودی سکه شما کافی نیست!\nاز مینی‌اپ سکه‌ای، سکه جمع کنید. 🎮`, {
      reply_markup: ikb([[btn('🎮 رفتن به مینی‌اپ', 'game')], [btn('🧑‍💼 اتصال به اپراتور', 'op:connect')]]),
    });
  }
  await ctx.db.prepare('INSERT INTO ai_history (user_id, role, content, created_at) VALUES (?,?,?,?)').bind(ctx.user.id, 'user', text.slice(0, 1500), now()).run();

  const hist = (await ctx.db.prepare('SELECT role, content FROM ai_history WHERE user_id=? ORDER BY id DESC LIMIT 6').bind(ctx.user.id).all()).results.reverse();
  const messages = [
    { role: 'system', content: SHOP_SYSTEM_PROMPT },
    ...hist.map((h) => ({ role: h.role, content: h.content })),
  ];

  const res = await aiChatComplete(ctx.env, messages);
  if (!res.ok) {
    // ⚠️ در هیچ خطایی سکه کسر نمی‌شود
    try {
      await ctx.db.prepare('DELETE FROM ai_history WHERE id = (SELECT MAX(id) FROM ai_history WHERE user_id=? AND role=?)').bind(ctx.user.id, 'user').run();
    } catch {}
    // هر نوع خطا پیام مخصوص خودش را دارد (binding / سهمیه / مدل / پاسخ نامعتبر)
    const detail = aiErrorMessage(res.error);
    const rows = [[btn('🧑‍💼 اتصال به اپراتور', 'op:connect')]];
    if (res.error !== AI_ERRORS.BINDING_MISSING) rows.unshift([btn('🔁 تلاش دوباره', 'sup:ai')]);
    // اطلاع به ادمین‌ها فقط برای خطاهای پیکربندی (یک‌بار در ساعت)
    if (res.error === AI_ERRORS.BINDING_MISSING || res.error === AI_ERRORS.QUOTA) {
      await warnAdminsAi(ctx, res.error, detail);
    }
    return send(ctx.token, ctx.user.id, `${detail}\n\n🪙 سکه‌ای از شما کسر نشد.`, { reply_markup: ikb(rows) });
  }

  const reply = res.text;
  await ctx.db.prepare('UPDATE users SET coins = coins - ? WHERE id=?').bind(price, ctx.user.id).run();
  await ctx.db.prepare('INSERT INTO ai_history (user_id, role, content, created_at) VALUES (?,?,?,?)').bind(ctx.user.id, 'assistant', reply.slice(0, 1500), now()).run();
  await ctx.db.prepare('DELETE FROM ai_history WHERE created_at < ?').bind(now() - 86400).run();
  await send(ctx.token, ctx.user.id, `🤖 ${reply}\n\n🪙 هزینه: ${faDigits(price)} سکه | باقی‌مانده: ${faDigits(Math.max(0, (ctx.user.coins || 0) - price))}`, {
    reply_markup: ikb([[btn('🧹 پاک کردن تاریخچه', 'ai:clear'), btn('🧑‍💼 اتصال به اپراتور', 'op:connect')]]),
  });
}

// ─────────────────────────── کانفیگ‌ساز اختصاصی ───────────────────────────
async function openCustomWizard(ctx, step, editMsg) {
  if (!step) {
    const rows = [
      [btn('⚡ VLESS اختصاصی', 'custom:p:vless'), btn('🐴 Trojan اختصاصی', 'custom:p:trojan')],
      [btn('🧩 Shadowsocks اختصاصی', 'custom:p:ss')],
    ];
    const text = '⭐ <b>کانفیگ‌ساز اختصاصی (ویژه)</b>\n\nپروتکل مورد نظر را انتخاب کنید تا کانفیگ دلخواهتان را بسازیم:';
    return editMsg
      ? editText(ctx.token, ctx.user.id, editMsg.message_id, text, { reply_markup: menuKb(rows, 'shop') })
      : send(ctx.token, ctx.user.id, text, { reply_markup: menuKb(rows, 'shop') });
  }
  if (step.startsWith('p:')) {
    const proto = step.slice(2);
    const rows = [[btn('۳۰ روز', `custom:d:${proto}:30`), btn('۶۰ روز', `custom:d:${proto}:60`), btn('۹۰ روز', `custom:d:${proto}:90`)]];
    const text = '⏱ مدت اشتراک را انتخاب کنید:';
    return editMsg ? editText(ctx.token, ctx.user.id, editMsg.message_id, text, { reply_markup: menuKb(rows, 'custom') }) : send(ctx.token, ctx.user.id, text, { reply_markup: menuKb(rows, 'custom') });
  }
  if (step.startsWith('d:')) {
    const [, proto, days] = step.split(':');
    const rows = [
      [btn('🌊 نامحدود', `custom:t:${proto}:${days}:0`)],
      [btn('۵۰ گیگابایت', `custom:t:${proto}:${days}:50`), btn('۱۰۰ گیگابایت', `custom:t:${proto}:${days}:100`)],
    ];
    return editMsg
      ? editText(ctx.token, ctx.user.id, editMsg.message_id, '📊 حجم ترافیک:', { reply_markup: menuKb(rows, 'custom') })
      : send(ctx.token, ctx.user.id, '📊 حجم ترافیک:', { reply_markup: menuKb(rows, 'custom') });
  }
  if (step.startsWith('t:')) {
    const [, proto, days, gb] = step.split(':');
    const usd = Math.max(1, Math.round(((Number(days) / 30) * (1 + Number(gb) / 100)) * 100) / 100);
    const price = Math.round((await productPriceToman(ctx.env, { price_usd: usd })) / 1000) * 1000;
    const title = `⭐ کانفیگ اختصاصی ${proto} | ${days} روز ${Number(gb) ? '| ' + gb + ' گیگ' : '| نامحدود'}`;
    const text = `<b>پیش‌نویس کانفیگ اختصاصی شما</b>\n\n${title}\n💰 قیمت: <b>${fmtToman(price)}</b>\n\n${await priceLine(ctx.env)}`;
    const rows = [
      [btn('💳 پرداخت کارت به کارت', `buyc:${proto}:${days}:${gb}`), btn('👛 کیف پول', `buywc:${proto}:${days}:${gb}`)],
    ];
    return editMsg
      ? editText(ctx.token, ctx.user.id, editMsg.message_id, text, { reply_markup: menuKb(rows, 'custom') })
      : send(ctx.token, ctx.user.id, text, { reply_markup: menuKb(rows, 'custom') });
  }
}

export function customProductOf(step) {
  const [proto, days, gb] = step.split(':');
  const usd = Math.max(1, Math.round(((Number(days) / 30) * (1 + Number(gb) / 100)) * 100) / 100);
  return {
    id: 0,
    title: `⭐ کانفیگ اختصاصی ${proto} | ${days} روز ${Number(gb) ? '| ' + gb + ' گیگ' : '| نامحدود'}`,
    protocol: proto,
    days: Number(days),
    traffic_gb: Number(gb),
    price_usd: usd,
    server_count: 10,
  };
}

async function buyCustom(ctx, spec, method) {
  const p = customProductOf(spec);
  const price = Math.round((await productPriceToman(ctx.env, p)) / 1000) * 1000;
  if (!price) return send(ctx.token, ctx.user.id, RATE_UNAVAILABLE_MESSAGE, { reply_markup: ikb([[btn('📞 پشتیبانی', 'sup:open')]]) });
  const canBuy = await assertDeliverable(ctx.env, p);
  if (!canBuy.ok) return send(ctx.token, ctx.user.id, canBuy.message || NO_REAL_SERVER_MESSAGE, { reply_markup: ikb([[btn('📞 پشتیبانی', 'sup:open')]]) });
  if (method === 'buywc') {
    const fresh = await getUser(ctx.db, ctx.user.id);
    if (fresh.balance < price) return send(ctx.token, ctx.user.id, '😕 موجودی کیف پول کافی نیست.');
    await addBalance(ctx.db, ctx.user.id, -price);
    const order = await createOrder(ctx.env, ctx.user.id, p, price, 'wallet', 'paid');
    const sub = await deliverOrder(ctx.env, ctx.user, p, order);
    // ✅ یک پیام تحویل، بدون تکرار
    await sendDelivery(ctx.env, ctx.user, p.title, sub, { protocol: p.protocol });
    return;
  }
  const order = await createOrder(ctx.env, ctx.user.id, p, price, 'card');
  await ctx.db.prepare('UPDATE orders SET meta=? WHERE id=?').bind(JSON.stringify(p), order.id).run();
  const card = await getSettingValue(ctx.db, 'card_number');
  const holder = await getSettingValue(ctx.db, 'card_holder');
  const text = (await getText(ctx.db, 'pay_intro'))
    .replace('{amount}', fmtToman(price))
    .replace('{card}', card.replace(/(\d{4})/g, '$1 ').trim())
    .replace('{holder}', holder);
  await setState(ctx, `receipt:${order.id}`);
  await send(ctx.token, ctx.user.id, text + `\n\n🧾 سفارش #${faDigits(order.id)} — ${p.title}`);
}

// ─────────────────────────── state ───────────────────────────
export async function setState(ctx, state, data = null) {
  if (data !== null) await ctx.db.prepare('UPDATE users SET state=?, state_data=? WHERE id=?').bind(state, JSON.stringify(data), ctx.user.id).run();
  else await ctx.db.prepare('UPDATE users SET state=? WHERE id=?').bind(state, ctx.user.id).run();
  ctx.user.state = state;
}

const now = () => Math.floor(Date.now() / 1000);

// ─────────────────────────── روتر متن ───────────────────────────
export async function handleUserText(ctx, text) {
  const st = ctx.user.state || '';
  if (st === 'owner:claim') return handleOwnerClaimText(ctx, text);
  if (text === '/cancel' && st) {
    if (st.startsWith('receipt:')) {
      await ctx.db.prepare("UPDATE orders SET status='rejected' WHERE id=? AND status='pending'").bind(Number(st.split(':')[1])).run();
    }
    await setState(ctx, '');
    return send(ctx.token, ctx.user.id, '❌ عملیات لغو شد.', await mainKeyboard(ctx.db, ctx.user.role !== 'user'));
  }
  if (st.startsWith('receipt:')) {
    return send(ctx.token, ctx.user.id, '🧾 لطفاً تصویر فیش را به‌صورت عکس ارسال کنید. برای انصراف: /cancel');
  }
  if (st === 'charge') {
    const amount = parseMoney(text);
    if (amount < 10000 || amount > 500000000) return send(ctx.token, ctx.user.id, '⚠️ مبلغ معتبر نیست. حداقل ۱۰,۰۰۰ تومان، حداکثر ۵۰۰ میلیون تومان.');
    const p = { id: 0, title: '💳 شارژ کیف پول', protocol: 'none', days: 0 };
    const order = await createOrder(ctx.env, ctx.user.id, p, amount, 'card');
    // علامت‌گذاری صریح سفارش شارژ تا هنگام تایید فیش، کیف پول شارژ شود (نه ساخت کانفیگ)
    await ctx.db.prepare('UPDATE orders SET meta=? WHERE id=?').bind(JSON.stringify({ charge: true }), order.id).run();
    const card = await getSettingValue(ctx.db, 'card_number');
    const holder = await getSettingValue(ctx.db, 'card_holder');
    await setState(ctx, `receipt:${order.id}`);
    const intro = (await getText(ctx.db, 'pay_intro'))
      .replace('{amount}', fmtToman(amount))
      .replace('{card}', card.replace(/(\d{4})/g, '$1 ').trim())
      .replace('{holder}', holder);
    return send(ctx.token, ctx.user.id, intro + `\n\n🧾 سفارش #${faDigits(order.id)}`);
  }
  if (st === 'support') return handleSupportMsg(ctx, ctx.update.message);

  switch (text) {
    case '🪟 داشبورد من':
      return openDashboard(ctx);
    case '🧩 اشتراک‌های من':
      return mySubs(ctx, 0);
    case '🛍 فروشگاه':
      return openShop(ctx);
    case '🎁 پروکسی و تست رایگان':
      return openTrial(ctx);
    case '💳 حساب من':
      return openAccount(ctx);
    case '👥 زیرمجموعه من':
      return openReferral(ctx);
    case '🎮 مینی‌اپ سکه‌ای':
      return openGame(ctx);
    case '🤖 چت هوش مصنوعی':
      return startAiChat(ctx);
    case '📞 پشتیبانی':
      return openSupport(ctx);
    case '📖 راهنما':
      return showHelp(ctx);
    case '📊 پنل مدیریت':
      if (ctx.user.role !== 'user') return openAdminPanel(ctx);
      return;
  }
  // 🔘 دکمه‌های سفارشی که ادمین از پنل تعریف کرده
  if (await handleCustomButton(ctx, text)) return;
  const cmd = (text.match(/^\/([a-zA-Z_]+)/) || [])[1];
  if (cmd) {
    switch (cmd) {
      case 'help':
      case 'rahnama':
        return showHelp(ctx);
      case 'shop':
        return openShop(ctx);
      case 'account':
      case 'wallet':
        return openAccount(ctx);
      case 'ref':
      case 'referral':
        return openReferral(ctx);
      case 'trial':
        return openTrial(ctx);
      case 'game':
        return openGame(ctx);
      case 'ai':
        return startAiChat(ctx);
      case 'support':
      case 'operator':
        return openSupport(ctx);
      case 'start':
        if (text.includes('ref_') || text.includes('shop_')) return;
        return showMainMenu(ctx);
      default:
        return send(ctx.token, ctx.user.id, '🤔 این دستور را نمی‌شناسم. برای دیدن همه امکانات <code>/help</code> را بفرستید.');
    }
  }
  return aiChat(ctx, text);
}

export async function openGame(ctx) {
  if (!(await isEnabled(ctx.db, 'game_enabled'))) return send(ctx.token, ctx.user.id, '🚫 مینی‌اپ موقتاً غیرفعال است.');
  const base = await getBase(ctx.env);
  const kb = ikb([[{ text: '🎮 باز کردن مینی‌اپ سکه‌ای', web_app: { url: `${base}/app` } }]]);
  await send(
    ctx.token,
    ctx.user.id,
    '🎮 <b>مینی‌اپ سکه‌ای</b>\n\n💰 تپ کن، سکه جمع کن!\n📈 سطح‌ها: برنز → نقره → طلا → الماس\n🎡 چرخ شانس روزانه رایگان\n🏆 لیگ هفتگی با جایزه ویژه نفر اول',
    { reply_markup: kb }
  );
}

// ─────────────────────────── روتر کال‌بک ───────────────────────────
export async function handleUserCallback(ctx, data) {
  const msg = ctx.update.callback_query.message;
  const edit = msg && !msg.via_bot ? msg : null;

  if (data === 'shop') return openShop(ctx, edit);
  if (data === 'dashboard') return openDashboard(ctx);
  if (data === 'subs') return mySubs(ctx, 0, edit);
  if (data.startsWith('buy:coin:')) return answerAndRun(ctx, () => startBuy(ctx, Number(data.slice(9)), 'coin'));
  if (data.startsWith('buy:g:')) return answerAndRun(ctx, () => startBuy(ctx, Number(data.slice(6)), 'g'));
  if (data === 'account') return openAccount(ctx, edit);
  if (data === 'ref') return openReferral(ctx, edit);
  if (data === 'trial') return openTrial(ctx, edit);
  if (data === 'custom') return openCustomWizard(ctx, null, edit);
  if (data.startsWith('cat:')) return openCategory(ctx, data.slice(4), edit);
  if (data.startsWith('custom:')) return openCustomWizard(ctx, data.slice(7), edit);
  if (data.startsWith('prod:')) return openProduct(ctx, Number(data.slice(5)), edit);
  if (data.startsWith('buy:w:')) return answerAndRun(ctx, () => startBuy(ctx, Number(data.slice(6)), 'w'));
  if (data.startsWith('buy:c:')) return answerAndRun(ctx, () => startBuy(ctx, Number(data.slice(6)), 'c'));
  if (data.startsWith('buywc:') || data.startsWith('buyc:')) return answerAndRun(ctx, () => buyCustom(ctx, data.slice(data.indexOf(':') + 1), data.startsWith('buywc') ? 'buywc' : 'buyc'));
  if (data === 'acc:charge') return startCharge(ctx);
  if (data === 'acc:subs') return mySubs(ctx, 0, edit);
  if (data.startsWith('acc:subs:pg:')) return mySubs(ctx, Number(data.split(':')[3]), edit);
  if (data === 'acc:orders') return myOrders(ctx);
  if (data.startsWith('qr:')) return showQR(ctx, data.slice(3));
  if (data.startsWith('renew:')) {
    const pid = Number(data.slice(6));
    return pid ? openProduct(ctx, pid, edit) : openShop(ctx, edit);
  }
  if (data === 'trial:get') return answerAndRun(ctx, () => giveTrial(ctx));
  if (data === 'free:proxies') return freeProxies(ctx);
  if (data === 'ref:list') return refList(ctx);
  if (data === 'game') return openGame(ctx);
  if (data === 'sup:open') return openSupport(ctx, edit);
  if (data === 'sup:ai') return answerAndRun(ctx, () => startAiChat(ctx));
  if (data === 'op:connect') return answerAndRun(ctx, () => connectOperator(ctx));
  if (data === 'help') return answerAndRun(ctx, () => showHelp(ctx));
  if (data === 'sup:exit') {
    await setState(ctx, '');
    return send(ctx.token, ctx.user.id, '👌 از حالت پشتیبانی خارج شدید.', await mainKeyboard(ctx.db, ctx.user.role !== 'user'));
  }
  if (data.startsWith('cancel:')) {
    await ctx.db.prepare("UPDATE orders SET status='rejected' WHERE id=? AND status='pending'").bind(Number(data.slice(7))).run();
    await setState(ctx, '');
    return send(ctx.token, ctx.user.id, '❌ سفارش لغو شد.', await mainKeyboard(ctx.db, ctx.user.role !== 'user'));
  }
  if (data === 'ai:clear') {
    await ctx.db.prepare('DELETE FROM ai_history WHERE user_id=?').bind(ctx.user.id).run();
    return answerCb(ctx.token, ctx.cbId, '✅ تاریخچه پاک شد');
  }
  if (data === 'noop') return answerCb(ctx.token, ctx.cbId);

  // بازگشت عمومی
  if (data.startsWith('back:')) {
    const t = data.slice(5);
    if (t === 'shop') return openShop(ctx, edit);
    if (t === 'account') return openAccount(ctx, edit);
    if (t === 'ref') return openReferral(ctx, edit);
    if (t === 'trial') return openTrial(ctx, edit);
    if (t === 'custom') return openCustomWizard(ctx, null, edit);
  }
  return answerCb(ctx.token, ctx.cbId);
}

async function answerAndRun(ctx, fn) {
  await answerCb(ctx.token, ctx.cbId);
  await fn();
}

// برای استفاده گروه‌ها
export { userTag as tagUser };
export { hasPerm };
