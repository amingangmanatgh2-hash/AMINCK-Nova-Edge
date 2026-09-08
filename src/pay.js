// ═══════════════════════════════════════════════════════════════════
//  موتور سفارش و پرداخت — کیف پول، کارت، سکه، تحویل و پاداش رفرال
// ═══════════════════════════════════════════════════════════════════
import { createSubscription } from './subs.js';
import { addBalance, getUser, fmtToman, faDigits } from './db.js';
import { getNum, getSettingValue } from './texts.js';
import { send, ikb, ubtn, btn } from './tg.js';
import { deepLink, getBase } from './util.js';

/** ایجاد سفارش */
export async function createOrder(env, userId, product, amountToman, method, status = 'pending') {
  const now = Math.floor(Date.now() / 1000);
  const res = await env.DB.prepare(
    `INSERT INTO orders (user_id, product_id, title, amount_toman, method, status, created_at)
     VALUES (?,?,?,?,?,?,?) RETURNING *`
  )
    .bind(userId, product.id || 0, product.title || '', amountToman, method, status, now)
    .first();
  return res;
}

/** ثبت ساب برای سفارش و بستن حلقه تحویل */
export async function deliverOrder(env, user, product, order) {
  const sub = await createSubscription(env, user, product, { orderId: order?.id });
  if (order) {
    await env.DB.prepare("UPDATE orders SET status='paid', sub_token=?, expire_at=?, paid_at=? WHERE id=?")
      .bind(sub.token, sub.expire, Math.floor(Date.now() / 1000), order.id)
      .run();
    await env.DB.prepare('UPDATE subscriptions SET order_id=? WHERE token=?').bind(order.id, sub.token).run();
    await env.DB.prepare('UPDATE users SET total_paid = total_paid + ? WHERE id=?').bind(order.amount_toman || 0, user.id).run();
  }
  await afterPurchase(env, user, order);
  return sub;
}

/** پاداش رفرال بعد از اولین خرید زیرمجموعه */
async function afterPurchase(env, buyer, order) {
  const { DB } = env;
  const amount = order?.amount_toman || 0;
  const fresh = await getUser(DB, buyer.id);
  if (!fresh?.referrer_id || fresh.ref_first_paid) return;
  const percent = await getNum(DB, 'referral_percent', 10);
  const reward = Math.round((amount * percent) / 100 / 1000) * 1000;
  if (reward <= 0) return;
  await DB.prepare('UPDATE users SET ref_first_paid=1 WHERE id=?').bind(fresh.id).run();
  await addBalance(DB, fresh.referrer_id, reward);
  await DB.prepare('UPDATE users SET invited_count = invited_count + 1 WHERE id=?').bind(fresh.referrer_id).run();
  const ref = await getUser(DB, fresh.referrer_id);
  const goal = await getNum(DB, 'referral_goal', 5);
  let extra = '';
  if (ref && ref.invited_count >= goal && !ref.reward_claimed) {
    // 🎁 جایزه ۵ دعوت: یک کانفیگ رایگان از ارزان‌ترین محصول فعال
    const cheap = await DB.prepare("SELECT * FROM products WHERE enabled=1 AND category!='coin' ORDER BY price_usd ASC LIMIT 1").first();
    if (cheap) {
      await createSubscription(env, ref, cheap, {});
      await DB.prepare('UPDATE users SET reward_claimed=1 WHERE id=?').bind(ref.id).run();
      extra = `\n\n🎉 تبریک! به پاس ${faDigits(goal)} دعوت موفق، یک کانفیگ رایگان به حساب شما اضافه شد. 🎁`;
    }
  }
  await send(
    env.TELEGRAM_BOT_TOKEN,
    fresh.referrer_id,
    `💸 <b>پاداش زیرمجموعه واریز شد!</b>\n\nزیرمجموعه شما اولین خریدش را انجام داد و ${fmtToman(reward)} (${faDigits(percent)}٪) به کیف پول شما اضافه شد. 👛${extra}`
  );
}

/** پرداخت با کیف پول */
export async function payWithWallet(env, user, product, priceToman) {
  const fresh = await getUser(env.DB, user.id);
  if (fresh.balance < priceToman) return { ok: false, reason: 'موجودی کافی نیست' };
  await addBalance(env.DB, user.id, -priceToman);
  const order = await createOrder(env, user.id, product, priceToman, 'wallet', 'paid');
  const sub = await deliverOrder(env, user, product, order);
  return { ok: true, order, sub };
}

/** پرداخت با سکه (فروشگاه مینی‌اپ) */
export async function payWithCoins(env, user, product) {
  const fresh = await getUser(env.DB, user.id);
  if (fresh.coins < product.coin_price) return { ok: false, reason: 'سکه کافی نیست' };
  await env.DB.prepare('UPDATE users SET coins = coins - ? WHERE id=?').bind(product.coin_price, user.id).run();
  const order = await createOrder(env, user.id, product, 0, 'coins', 'paid');
  const sub = await deliverOrder(env, user, product, order);
  return { ok: true, order, sub };
}

/** تایید فیش و تحویل */
export async function approveReceipt(env, receipt) {
  const { DB } = env;
  const order = await DB.prepare('SELECT * FROM orders WHERE id=?').bind(receipt.order_id).first();
  if (!order || order.status === 'paid') return null;
  await DB.prepare("UPDATE receipts SET status='approved' WHERE id=?").bind(receipt.id).run();
  await DB.prepare("UPDATE orders SET status='paid', paid_at=? WHERE id=?").bind(Math.floor(Date.now() / 1000), order.id).run();
  const user = await getUser(DB, order.user_id);

  // شارژ کیف پول — بدون ساخت ساب
  if (order.product_id === 0 && !order.meta) {
    await addBalance(DB, order.user_id, order.amount_toman);
    await DB.prepare('UPDATE users SET total_paid = total_paid + ? WHERE id=?').bind(order.amount_toman, user.id).run();
    return { user, order, charge: true };
  }

  let product = null;
  try {
    product = order.meta && JSON.parse(order.meta).title ? JSON.parse(order.meta) : null;
  } catch {}
  if (!product) {
    product = (await DB.prepare('SELECT * FROM products WHERE id=?').bind(order.product_id).first()) || {
      title: order.title,
      protocol: 'vless',
      days: 30,
      server_count: 10,
    };
  }
  const sub = await createSubscription(env, user, product, { orderId: order.id });
  await DB.prepare('UPDATE orders SET sub_token=?, expire_at=? WHERE id=?').bind(sub.token, sub.expire, order.id).run();
  await DB.prepare('UPDATE users SET total_paid = total_paid + ? WHERE id=?').bind(order.amount_toman, user.id).run();
  await afterPurchase(env, user, order);
  return { user, order, sub };
}

/** پیام تحویل با QR و لینک ساب */
export async function sendDelivery(env, user, productTitle, sub) {
  const base = await getBase(env);
  const subUrl = base ? `${base}/sub/${sub.token}` : `https://t.me/${(await env.DB.prepare("SELECT value FROM settings WHERE key='bot_username'").first())?.value || ''}`;
  const lines = [
    `✅ <b>تحویل شد!</b>\n`,
    `📦 <b>${productTitle}</b>`,
    `🗓 اعتبار تا: ${new Date(sub.expire * 1000).toLocaleDateString('fa-IR')}`,
    `🔗 لینک ساب اختصاصی شما:\n<code>${subUrl}</code>\n`,
    `🖥 این اشتراک شامل چند سرور است؛ اگر یکی قطع شد، بعدی را از لیست انتخاب کنید. سیستم سلامت سرورها به‌صورت خودکار سرورهای مرده را جایگزین می‌کند. 🔄`,
  ];
  const kb = ikb([
    [btn('🔳 QR Code اشتراک', `qr:${sub.token}`)],
    [btn('📄 باز کردن صفحه ساب', `noop`)],
    [ubtn('🌐 مشاهده آنلاین', subUrl)],
  ]);
  // جایگزینی دکمه noop با url واقعی در ردیف دوم
  kb.inline_keyboard[1] = [ubtn('🌐 صفحه اشتراک', subUrl)];
  await send(env.TELEGRAM_BOT_TOKEN, user.id, lines.join('\n'), { reply_markup: kb });
}

/** ساخت لینک دیپ‌لینک محصول برای گروه‌ها */
export function productDeepLink(botUsername, productId) {
  return deepLink(botUsername, `shop_${productId}`);
}
