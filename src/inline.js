// ═══════════════════════════════════════════════════════════════════
//  Inline Mode (بخش ۱۲) — ویترین محصولات در هر چت
//
//  تمرکز اصلی ربات داخل داشبورد/پیوی است؛ اینجا فقط «کارت محصول» نمایش
//  داده می‌شود و خرید در پیوی انجام می‌شود (لینک اختصاصی همان محصول).
//  با کلید `inline_enabled` از پنل خاموش/روشن می‌شود.
// ═══════════════════════════════════════════════════════════════════
import { fmtToman, faDigits } from './db.js';
import { getSettingValue, getNum } from './texts.js';
import { tg } from './tg.js';
import { productPriceToman } from './pricing.js';
import { RATE_UNAVAILABLE_MESSAGE } from './pricing.js';

const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export async function inlineEnabled(db) {
  return (await getSettingValue(db, 'inline_enabled')) !== '0';
}

function productCard(p, price, rateLine, bot) {
  const priceText = price ? fmtToman(price) : RATE_UNAVAILABLE_MESSAGE;
  return {
    message:
      `⚡ <b>${esc(p.title)}</b>\n\n` +
      `⏱ مدت: <b>${faDigits(p.days)} روز</b>\n` +
      `📊 حجم: <b>${p.traffic_gb ? faDigits(p.traffic_gb) + ' گیگابایت' : 'نامحدود 🌊'}</b>\n` +
      `🖥 سرور: <b>${faDigits(p.server_count || 10)} عدد با جایگزینی خودکار</b>\n` +
      `🧾 سرویس: <b>${esc(p.category || p.protocol)}</b>\n` +
      `💰 قیمت: <b>${priceText}</b>\n\n` +
      (rateLine ? `${rateLine}\n` : '') +
      `🛒 برای خرید و تحویل آنی، روی دکمه بزنید 👇`,
    keyboard: {
      inline_keyboard: [
        [{ text: '🛒 خرید در ربات', url: `https://t.me/${bot}?start=prod_${p.id}` }],
        [{ text: '🎁 دریافت تست رایگان', url: `https://t.me/${bot}?start=trial` }],
      ],
    },
  };
}

/**
 * پاسخ به inline query.
 * @returns {Promise<{ok:boolean, count:number}>}
 */
export async function handleInlineQuery(env, token, query, botUsername) {
  const db = env.DB;
  const q = String(query?.query || '').trim().toLowerCase();
  const uid = Number(query?.from?.id || 0);
  if (!(await inlineEnabled(db))) {
    await tg(token, 'answerInlineQuery', {
      inline_query_id: query.id,
      results: [],
      cache_time: 300,
      switch_pm_text: '🔒 اینبخش غیرفعال است',
      switch_pm_parameter: 'start',
    });
    return { ok: true, count: 0 };
  }
  const base = await getSettingValue(db, 'bot_username');
  const bot = base || botUsername || '';
  const rateLine = await getSettingValue(db, 'inline_show_rate') === '0' ? '' : await (await import('./pricing.js')).priceLine(env);
  const results = [];

  const pushProduct = async (p) => {
    const price = await productPriceToman(env, p);
    const card = productCard(p, price, rateLine, bot);
    results.push({
      type: 'article',
      id: `p${p.id}`,
      title: `${p.title} — ${price ? fmtToman(price) : 'قیمت لحظه‌ای'}`,
      description: `${faDigits(p.days)} روز · ${p.traffic_gb ? faDigits(p.traffic_gb) + ' گیگ' : 'نامحدود'} · ${p.category}`,
      thumbnail_url: 'https://telegram.org/img/t_logo.png',
      input_message_content: { message_text: card.message, parse_mode: 'HTML', disable_web_page_preview: true },
      reply_markup: card.keyboard,
    });
  };

  if (q.startsWith('price') || q.startsWith('قیمت') || q === '' || q === 'shop' || q === 'فروشگاه') {
    const limit = Math.min(10, await getNum(db, 'inline_limit', 8));
    const rows = (
      await db
        .prepare("SELECT * FROM products WHERE enabled=1 AND category<>'coin' AND category<>'creator' ORDER BY sort ASC, price_usd ASC LIMIT ?")
        .bind(limit)
        .all()
    ).results;
    for (const p of rows) await pushProduct(p);
    if (!rows.length) {
      results.push({
        type: 'article',
        id: 'empty',
        title: '🛍 فروشگاه هنوز محصولی ندارد',
        description: 'مدیر ربات باید از پنل محصول اضافه کند',
        input_message_content: { message_text: '⚡ این ربات هنوز محصولی ثبت نکرده است — به زودی!', parse_mode: 'HTML' },
        reply_markup: { inline_keyboard: [[{ text: '🤖 باز کردن ربات', url: `https://t.me/${bot}` }]] },
      });
    }
  } else if (q.startsWith('sub') || q.startsWith('ساب')) {
    const subs = (await db.prepare('SELECT title, token, expire_at FROM subscriptions WHERE user_id=? AND active=1 ORDER BY id DESC LIMIT 8').bind(uid).all()).results;
    for (const s of subs) {
      results.push({
        type: 'article',
        id: `s${s.token}`,
        title: `🔗 ${s.title}`,
        description: 'اشتراک شما — فقط برای چت‌های شخصی',
        input_message_content: { message_text: `🔗 لینک اشتراک (خصوصی): /sub/${esc(s.token)}`, disable_web_page_preview: true },
      });
    }
    if (!results.length) {
      results.push({
        type: 'article',
        id: 'nosub',
        title: '⚠️ هنوز اشتراک فعالی ندارید',
        description: 'از فروشگاه خرید کنید',
        input_message_content: { message_text: `⚡ برای خرید به پیوی ربات بروید: https://t.me/${bot}`, disable_web_page_preview: true },
      });
    }
  } else if (q.startsWith('help') || q.startsWith('راهنما')) {
    results.push({
      type: 'article',
      id: 'help',
      title: '📖 راهنمای ربات',
      description: 'تست رایگان، خرید، سکه، رفرال',
      input_message_content: {
        message_text:
          `📖 <b>راهنمای سریع</b>\n\n🎁 تست رایگان: ۱ روز / ۵۰۰ مگابایت\n🛍 خرید: فروشگاه → انتخاب محصول → پرداخت\n🪙 سکه: مینی‌اپ → تپ، ماموریت و چرخ شانس\n👥 رفرال: لینک اختصاصی + پاداش نقدی\n🤖 چت هوش مصنوعی: هر پیام ۵ سکه\n\n🔻 برای شروع /start را در پیوی بزنید.`,
        parse_mode: 'HTML',
      },
      reply_markup: { inline_keyboard: [[{ text: '🚀 شروع در پیوی', url: `https://t.me/${bot}?start=shop_home` }]] },
    });
  } else {
    // جستجوی متنی در نام محصولات
    const rows = (await db.prepare('SELECT * FROM products WHERE enabled=1 AND title LIKE ? ORDER BY sort ASC LIMIT 10').bind(`%${q.slice(0, 40)}%`).all()).results;
    for (const p of rows) await pushProduct(p);
  }

  const payload = {
    inline_query_id: query.id,
    results: results.slice(0, 25),
    cache_time: 60,
    is_personal: true,
  };
  if (!bot) return { ok: false, count: 0 };
  if (!q) {
    payload.switch_pm_text = '🛍 باز کردن ربات';
    payload.switch_pm_parameter = 'shop_home';
  }
  const r = await tg(token, 'answerInlineQuery', payload);
  return { ok: !!r?.ok, count: payload.results.length };
}
