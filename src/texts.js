// ═══════════════════════════════════════════════════════════════════
//  متن‌های پیش‌فرض بات — همه از پنل مدیریت قابل تغییرند
// ═══════════════════════════════════════════════════════════════════
import { getSetting } from './db.js';

export const DEFAULT_TEXTS = {
  bot_name: '⚡ AMINCK | کانفیگ پرسرعت',

  bot_description:
    '🚀 به فروشگاه رسمی AMINCK خوش آمدید!\n\n' +
    '⚡ تحویل آنی و خودکار کانفیگ، ۲۴ ساعته و بدون تعطیلی\n' +
    '🛡 ضمانت کیفیت و پاسخ‌گویی سریع پشتیبانی\n' +
    '🌐 اتصال پایدار با سرورهای اختصاصی و تست‌شده روی نت ملی\n' +
    '🎁 تست رایگان ۱ روزه برای همه کاربران جدید\n' +
    '👥 سیستم زیرمجموعه‌گیری با ۱۰٪ درآمد نقدی دائمی\n' +
    '🎮 مینی‌اپ سکه‌ای با جایزه هفتگی برای نفر برتر',

  bot_short: '⚡ AMINCK | مرجع تخصصی فروش کانفیگ و پروکسی با تحویل آنی، تست رایگان و پشتیبانی واقعی',

  start_welcome:
    '🌟 سلام {name} عزیز، خوش اومدی!\n\n' +
    '🤖 من دستیار هوشمند فروشگاه AMINCK هستم.\n' +
    'از منوی پایین هر بخش رو که خواستی انتخاب کن 👇\n\n' +
    '✨ چند پیشنهاد داغ:\n' +
    '🎁 یه تست رایگان ۱ روزه بگیر و کیفیت رو خودت ببین!\n' +
    '🛍 قیمت‌ها لحظه‌ای و رقابتی‌ترینِ بازاره.',

  support_text:
    '📞 <b>پشتیبانی ۲۴ ساعته</b>\n\n' +
    'برای هر سوال، مشکل یا پیشنهاد کافیه همینجا پیامت رو بنویسی؛\n' +
    'پیام مستقیم به تیم پشتیبانی می‌رسه و خیلی سریع جواب می‌گیری. 🤝\n\n' +
    '⏱ میانگین پاسخ‌گویی: کمتر از ۳۰ دقیقه',

  shop_welcome:
    '🛍 <b>فروشگاه</b>\n' +
    '📦 دسته‌بندی مورد نظرت رو انتخاب کن 👇\n' +
    '✅ همه کانفیگ‌ها تست‌شده روی نت ملی و با چند سرور جایگزین خودکار',

  product_info:
    '📦 <b>{title}</b>\n\n' +
    '⏱ مدت: {days} روز\n' +
    '📊 حجم: {traffic}\n' +
    '🖥 شامل {count} سرور با جایگزینی خودکار خرابی‌ها',

  wallet_intro:
    '💳 <b>حساب من</b>\n\n' +
    '👛 موجودی کیف پول: {balance}\n' +
    '🪙 سکه‌ها: {coins}\n\n' +
    'از دکمه‌های زیر استفاده کن 👇',

  referral_intro:
    '👥 <b>زیرمجموعه من</b>\n\n' +
    'با دعوت دوستات پول نقد بگیر! 💸\n' +
    'بعد از اولین خرید هر زیرمجموعه، <b>{percent}٪</b> از مبلغ خریدش مستقیم به کیف پولت اضافه می‌شه.\n' +
    '🎁 با ۵ دعوت موفق، یه کانفیگ رایگان جایزه می‌گیری!',

  trial_ok:
    '🎁 <b>تست رایگان شما فعال شد!</b>\n\n' +
    '⏱ اعتبار: ۱ روزه | 📊 حجم: ۵۰۰ مگابایت | 🚀 پرسرعت‌ترین سرور ما',

  pay_intro:
    '💳 <b>پرداخت کارت به کارت</b>\n\n' +
    '💰 مبلغ: {amount}\n' +
    '💳 شماره کارت:\n<code>{card}</code>\n' +
    '👤 به نام: {holder}\n\n' +
    '⚠️ بعد از واریز، اسکرین‌شات فیش را همینجا بفرستید.\n' +
    '🤖 فیش توسط هوش مصنوعی بررسی و در صورت تطبیق، سفارش آنی تحویل می‌شود.',

  receipt_pending:
    '🧾 فیش شما دریافت شد و در صف بررسی است.\n' +
    '🤖 هوش مصنوعی در حال تطبیق مبلغ، تاریخ و ساعت فیش است؛ نتیجه را همینجا اعلام می‌کنیم. ⏳',

  // ⚠️ این متن فقط «تایید پرداخت» است؛ پیام تحویل جداگانه و یک‌بار ارسال می‌شود.
  order_paid:
    '✅ <b>پرداخت شما تایید شد</b>\n\n' +
    '⏳ کانفیگ در حال آماده‌سازی است و در پیام بعدی ارسال می‌شود.\n' +
    '🙏 ممنون از اعتماد شما 🌹',

  group_welcome:
    '🌟 به {title} خوش اومدی {name}!\n\n' +
    '⚡ برای مشاهده محصولات و قیمت‌های ویژه، فروشگاه ما رو ببین 👇',

  ad_text:
    '⚡ <b>کانفیگ پرسرعت با قیمت لحظه‌ای</b>\n\n' +
    '💵 نرخ امروز دلار: {rate} تومان\n' +
    '🛡 ضمانت کیفیت + تست رایگان + تحویل آنی',

  reminder_text:
    '⏰ <b>یادآوری تمدید</b>\n\n' +
    'اشتراک «{title}» شما تا {left} دیگر منقضی می‌شود.\n' +
    'برای جلوگیری از قطع سرویس، همین حالا تمدید کنید 👇',
};

export const DEFAULT_SETTINGS = {
  usd_rate_manual: '0', // 0 = خودکار از API
  margin: '1.30', // ضریب سود
  referral_percent: '10',
  referral_goal: '5',
  trial_hours: '24',
  trial_mb: '500',
  ai_price_coins: '5',
  ai_model: '', // خالی = زنجیرهٔ پیش‌فرض مدل‌های معتبر Workers AI
  card_number: '6219861958426461',
  card_holder: 'امین کریم‌پور اصفهانی',
  channel_id: '', // برای ماموریت عضویت کانال
  channel_url: '',
  shop_enabled: '1',
  trial_enabled: '1',
  referral_enabled: '1',
  ai_enabled: '1',
  game_enabled: '1',
  group_welcome_enabled: '1',
  group_ai_enabled: '1',
  group_ai_cooldown: '15',
  panel_password: '',
  panel_enabled: '1',
  card_pay_enabled: '1',
  wallet_enabled: '1',
  ad_interval_hours: '12',
  ad_product_id: '',
  league_prize_coins: '10000',
  inactive_days: '7',
  inactive_discount: '10',
  reminder_hours: '48',
  auto_verify: '1',
  bot_username: '',
  // ─── بخش ۱: مخزن IP تمیز + پروب از داخل ایران ───
  probe_enabled: '0',          // پیش‌فرض خاموش — فعال‌سازی آگاهانه توسط ادمین
  probe_reward_coins: '5',     // سکهٔ هر گزارش معتبر
  probe_daily_cap: '30',       // سقف گزارش روزانهٔ هر کاربر
  probe_min_samples: '5',      // حداقل نمونه قبل از معتبر شمردن امتیاز
  probe_timeout_ms: '3000',    // تایم‌اوت پروب در مینی‌اپ
  clean_ip_auto_manage: '0',   // غیرفعال‌سازی خودکار IP بد در کرون (پیش‌فرض خاموش)
  clean_ip_min_healthy: '3',   // آستانهٔ هشدار کمبود IP سالم
  // ─── بخش ۵: قیمت‌گذاری پویا ───
  price_base: '0.2',
  price_per_gb: '0.02',
  price_per_day: '0.03',
  price_per_device: '0.1',
  price_protocol_mult: '{"vless":1,"vmess":1,"trojan":1.1,"ss":0.9}',
  price_location_mult: '{}',
  price_tier_mult: '{"economy":0.8,"standard":1,"premium":1.4}',
  discount_tiers: '[{"days":90,"percent":5},{"days":180,"percent":10},{"days":365,"percent":15},{"gb":100,"percent":5}]',
  loyalty_discount_percent: '0',
  loyalty_min_paid: '500000',
  // ─── بخش ۶: AI Agent مدیر ───
  ai_agent_enabled: '0',          // پیش‌فرض خاموش — فعال‌سازی آگاهانه توسط ادمین
  ai_agent_model: '',             // خالی = از زنجیرهٔ پیش‌فرض
  ai_agent_max_ops: '6',          // سقف تعداد عملیات در هر درخواست
  // ─── بخش ۲: تانل VLESS-over-WS داخل ورکر ───
  tunnel_enabled: '0',            // پیش‌فرض خاموش — فعال‌سازی آگاهانه توسط ادمین
  tunnel_ws_path: '',             // رندوم ساخته می‌شود؛ برای دیباگ خالی نگذارید
  tunnel_max_bytes: '0',          // سقف مصرف هر اشتراک (بایت)؛ ۰ = نامحدود (پر از ربات)
};

export async function getText(db, key) {
  const v = await getSetting(db, `text:${key}`, '');
  return v || DEFAULT_TEXTS[key] || '';
}

export async function getSettingValue(db, key) {
  const v = await getSetting(db, key, '');
  return v !== '' ? v : DEFAULT_SETTINGS[key] ?? '';
}

export async function getNum(db, key, fallback = 0) {
  const v = await getSettingValue(db, key);
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function isEnabled(db, key) {
  return (await getSettingValue(db, key)) === '1';
}
