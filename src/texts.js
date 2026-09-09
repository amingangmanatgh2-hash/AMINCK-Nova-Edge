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
  // ─── بخش ۳۲: داشبورد/مینی‌اپ و دکمه‌ها ───
  dashboard_enabled: '1',
  dashboard_label: '🪟 داشبورد',
  dashboard_url: '',
  custom_menu_enabled: '1',
  // ─── بخش ۱۲: حالت Inline ───
  inline_enabled: '1',
  inline_limit: '8',
  inline_show_rate: '1',
  // ─── بخش ۳.۱: ساب و ضدسانسور ───
  sub_min_configs: '10',
  sub_ips_per_server: '3',
  variant_fail_limit: '3',
  variant_check_enabled: '0',   // پروب از بیرون ایران (اختیاری)
  // ─── بخش ۷: طلا و کف قیمت ───
  gold_rate_manual: '0',
  gold_margin: '1.08',           // ضریب اضافی قیمت محصولات لنگرطلا (پیش‌فرض ۸٪)
  gold_rate_url: '',
  gold_rate_path: 'price',
  price_floor_toman: '0',
  // ─── بخش ۸: محدودیت خرید با سکه ───
  coin_max_usd: '3',            // فقط محصولات تا این قیمت دلار با سکه فروخته می‌شوند
  coin_allow_premium: '0',      // ۱ = پریمیوم هم با سکه فروش برود
  // ─── بخش ۵: درگاه بانکی ───
  gateway_enabled: '0',
  gateway_provider: 'none',
  gateway_api_base: '',
  gateway_merchant_id: '',
  gateway_api_key: '',
  gateway_currency: 'IRT',
  gateway_fee_mode: 'none',
  gateway_fee_percent: '0',
  gateway_callback_path: '/pay',
  gateway_ttl_minutes: '30',
  gateway_timeout_ms: '12000',
  gateway_auto_reconcile: '1',
  gateway_custom_request: '',
  gateway_custom_verify: '',
  // ─── بخش ۲۰: پنل کانفیگ‌ساز ───
  creator_enabled: '1',
  creator_default_plan: 'pro',
  // ─── بخش ۲۳: موجودی ───
  low_stock_threshold: '3',      // از این تعداد به پایین، به ادمین هشدار داده می‌شود
  // ─── بخش ۲۴: اعلان‌ها ───
  notify_throttle_seconds: '120',
  notify_purchase: '1',
  notify_payment: '1',
  notify_receipt: '1',
  notify_suspicious: '1',
  notify_newUser: '1',
  notify_referral: '1',
  notify_serviceError: '1',
  notify_outOfStock: '1',
  notify_deadConfig: '1',
  notify_gateway: '1',
  notify_aiFlag: '1',
  // ─── بخش ۱۷: قفل مالک ───
  owner_claim: '0',
  // ─── 🌐 زبان کاربر ───
  lang_default: 'fa',            // زبان پیش‌فرض (کاربر در اولین /start می‌تواند عوض کند)
  lang_ask: '1',                 // ۰ = از کاربر زبان نپرس و lang_default را اجبار کن
  // ─── 🧪 پست/متن شیشه‌ای ───
  glass_enabled: '1',
  glass_menu_enabled: '1',
  glass_public: '1',             // ۰ = فقط خریداران/ادمین پست بسازند
  glass_max_buttons: '6',        // سقف دکمه شیشه‌ای هر پست (۱..۱۰)
  glass_daily_limit: '0',        // سقف ساخت پست در روز برای هر کاربر (۰ = نامحدود)
  glass_auto_post: '0',          // ۱ = بعد از انتخاب نتیجهٔ inline، نسخهٔ دکمه‌دار هم منتشر شود
  glass_show_ref: '0',           // ۱ = دکمهٔ دعوت سازنده به همه پست‌ها اضافه شود
  glass_web_enabled: '1',        // صفحه/استودیوی وب پست شیشه‌ای
  glass_public_publish: '0',     // ۱ = هر کسی بتواند پست دیگران را با ربات در گروهش منتشر کند
  // ─── 🛍 خرید داخل گروه ───
  group_buy_enabled: '1',
  group_discount_percent: '0',
  group_coupon_code: '',
  group_pay_methods: 'card,gateway,wallet,coin',
  group_show_rating: '1',
  group_review_need_buy: '0',
  group_receipt_require_reply: '1',
  // ─── 🎁 باشگاه جوایز کاربر ───
  perks_enabled: '1',
  perks_menu_enabled: '1',
  scratch_enabled: '1',
  scratch_prizes: '[{"kind":"coins","value":20,"weight":42},{"kind":"coins","value":60,"weight":22},{"kind":"amount","value":15000,"weight":12},{"kind":"days","value":1,"weight":8},{"kind":"coins","value":200,"weight":4},{"kind":"none","value":0,"weight":12}]',
  scratch_extend_floor_toman: '0',   // حداقل کل خرید برای اینکه جایزهٔ «روز» اعمال شود
  checkin_enabled: '1',
  checkin_coins: '15',
  checkin_step: '5',
  checkin_day7_bonus: '120',
  personal_coupon_enabled: '1',
  personal_coupon_percent: '7',
  personal_coupon_days: '30',
  // ─── 🛡 محدودیت و ضدسوءاستفاده ───
  user_daily_orders: '0',        // سقف سفارش روزانه هر کاربر (۰ = نامحدود)
  user_daily_toman: '0',         // سقف مبلغ خرید روزانه هر کاربر
  ref_anti_abuse: '1',
  ref_min_account_days: '0',     // ۰ = سن حساب بررسی نشود (پیش‌فرض محافظه‌کارانه برای اینکه دعوت فوری کاربر را نکشد)
  ref_min_first_buy: '0',
  ref_max_same_name: '3',
  referral_coins: '25',
  // ─── 📊 گزارش و صف ارسال ───
  report_daily_enabled: '1',
  report_daily_hour: '2',        // ساعت UTC ارسال گزارش روزانه
  report_weekly_enabled: '1',
  report_notify_zero: '0',
  broadcast_batch: '25',         // تعداد پیام در هر اجرا (کرون هر ۵ دقیقه)
  audit_log_enabled: '1',
};

export async function getText(db, key, lang = '') {
  if (lang && lang !== 'fa') {
    const tl = await getSetting(db, `text:${key}:${lang}`, '');
    if (tl) return tl;
  }
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
