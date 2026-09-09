// ═══════════════════════════════════════════════════════════════════
//  چندزبانگی ربات (بخش جدید: انتخاب زبان در اولین /start)
//
//  • ۵ زبان: فارسی، English، العربية، Русский，Türkçe
//  • متن‌های پرتردد (منو، فروشگاه، محصول، پرداخت، رفرال، پروفایل، راهنما،
//    خطاهای اصلی) از همین دیکشنری می‌آیند.
//  • هر کلید قابل بازنویسی دستی است: تنظیمات با کلید  i18n:<lang>:<key>
//    (پنل وب و /admin → ✍️ متن‌ها) — پس ترجمهٔ ناقص = باگ نیست، قابل تکمیل است.
//  • بقیهٔ متن‌ها از texts.js می‌آیند و با پسوند زبان قابل ترجمه‌اند:
//    text:<key>:<lang>
//  • برچسب‌های کیبورد در همهٔ زبان‌ها به یک «کلید یکپارچه» نگاشت می‌شوند تا
//    مسیرهای متنی ربات (switch روی برچسب) در هر زبانی کار کنند.
//  ⚠️ پنل مدیریت عمداً فارسی مانده است (کاربر آن فقط مالک/ادمین‌ها هستند).
// ═══════════════════════════════════════════════════════════════════

export const LANGS = {
  fa: { name: 'فارسی', flag: '🇮🇷', dir: 'rtl' },
  en: { name: 'English', flag: '🇬🇧', dir: 'ltr' },
  ar: { name: 'العربية', flag: '🇸🇦', dir: 'rtl' },
  ru: { name: 'Русский', flag: '🇷🇺', dir: 'ltr' },
  tr: { name: 'Türkçe', flag: '🇹🇷', dir: 'ltr' },
};

export const LANG_KEYS = Object.keys(LANGS);

/** برچسب یکپارچهٔ دکمه‌های کیبورد → کلید دیکشنری */
const MENU_LABELS = {
  dashboard: '🪟 داشبورد من',
  subs: '🧩 اشتراک‌های من',
  shop: '🛍 فروشگاه',
  trial: '🎁 پروکسی و تست رایگان',
  account: '💳 حساب من',
  referral: '👥 زیرمجموعه من',
  game: '🎮 مینی‌اپ سکه‌ای',
  ai: '🤖 چت هوش مصنوعی',
  support: '📞 پشتیبانی',
  help: '📖 راهنما',
  admin: '📊 پنل مدیریت',
  glass: '🧪 پست شیشه‌ای',
  perks: '🎁 باشگاه جوایز',
  groupshop: '🛍 خرید در گروه',
  lang: '🌐 زبان / Language',
};

/** زبان → برچسب‌ها */
const MENU_I18N = {
  fa: {},
  en: {
    dashboard: '🪟 My dashboard',
    subs: '🧩 My subscriptions',
    shop: '🛍 Store',
    trial: '🎁 Free trial & proxy',
    account: '💳 My account',
    referral: '👥 My referrals',
    game: '🎮 Coins mini app',
    ai: '🤖 AI chat',
    support: '📞 Support',
    help: '📖 Help',
    admin: '📊 Admin panel',
    glass: '🧪 Glass post',
    perks: '🎁 Rewards club',
    groupshop: '🛍 Buy in group',
    lang: '🌐 Language',
    glass_ref_head: 'Fast & stable VPN',
    glass_ref_l1: 'Ready configs + free trial',
    glass_ref_l2: 'Anti-censorship routes, fair pricing',
    glass_ref_l3: 'backlink reward for friends',
    glass_ref_btn: 'Start with my link',
    glass_ref_cta: 'Invite me',
    glass_made_by: 'Made with Glass Post Studio',
    glass_open_page: 'Open post page',
    glass_hint: 'To publish in a group, type @bot and the code.',
  },
  ar: {
    dashboard: '🪟 لوحتي',
    subs: '🧩 اشتراكاتي',
    shop: '🛍 المتجر',
    trial: '🎁 تجربة مجانية',
    account: '💳 حسابي',
    referral: '👥 دعواتي',
    game: '🎮 لعبة العملات',
    ai: '🤖 محادثة الذكاء',
    support: '📞 الدعم',
    help: '📖 المساعدة',
    admin: '📊 لوحة الإدارة',
    glass: '🧪 منشور زجاجي',
    perks: '🎁 نادي الجوائز',
    groupshop: '🛍 الشراء في المجموعة',
    lang: '🌐 اللغة',
    glass_ref_head: 'VPN سريع ومستقر',
    glass_ref_l1: 'إعدادات جاهزة + تجربة مجانية',
    glass_ref_l2: 'مسارات مقاومة للرقابة بأسعار عادلة',
    glass_ref_l3: 'مكافأة صديقك عند الشراء',
    glass_ref_btn: 'ابدأ برابطي',
    glass_ref_cta: 'ادعوني',
    glass_made_by: 'أُنشئ بستوديو المنشور الزجاجي',
    glass_open_page: 'فتح صفحة المنشور',
    glass_hint: 'للنشر في المجموعة اكتب @بات والرمز.',
  },
  ru: {
    dashboard: '🪟 Моя панель',
    subs: '🧩 Мои подписки',
    shop: '🛍 Магазин',
    trial: '🎁 Пробный и прокси',
    account: '💳 Мой аккаунт',
    referral: '👥 Мои рефералы',
    game: '🎮 Мини-апп монет',
    ai: '🤖 ИИ-чат',
    support: '📞 Поддержка',
    help: '📖 Помощь',
    admin: '📊 Панель админа',
    glass: '🧪 Glass-пост',
    perks: '🎁 Клуб наград',
    groupshop: '🛍 Купить в группе',
    lang: '🌐 Язык',
    glass_ref_head: 'Быстрый и стабильный VPN',
    glass_ref_l1: 'Готовые конфиги + пробный период',
    glass_ref_l2: 'Антиблокировочные маршруты, честные цены',
    glass_ref_l3: 'бонус друзьям с твоей ссылки',
    glass_ref_btn: 'Начать по моей ссылке',
    glass_ref_cta: 'Пригласить',
    glass_made_by: 'Сделано в Glass-студии',
    glass_open_page: 'Открыть страницу поста',
    glass_hint: 'Для публикации в чате напишите @бот и код.',
  },
  tr: {
    dashboard: '🪟 Panelim',
    subs: '🧩 Aboneliklerim',
    shop: '🛍 Mağaza',
    trial: '🎁 Ücretsiz deneme',
    account: '💳 Hesabım',
    referral: '👥 Davetlerim',
    game: '🎮 Coin mini app',
    ai: '🤖 YZ sohbeti',
    support: '📞 Destek',
    help: '📖 Yardım',
    admin: '📊 Yönetim paneli',
    glass: '🧪 Cam gönderi',
    perks: '🎁 Ödül kulübü',
    groupshop: '🛍 Grupta satın al',
    lang: '🌐 Dil',
    glass_ref_head: 'Hızlı ve kararlı VPN',
    glass_ref_l1: 'Hazır konfigürasyon + ücretsiz deneme',
    glass_ref_l2: 'Sansür-d bypass hatları, adil fiyat',
    glass_ref_l3: 'arkadaşlarına geri ödeme',
    glass_ref_btn: 'Bağlantımla başla',
    glass_ref_cta: 'Beni davet et',
    glass_made_by: 'Cam Gönderi Stüdyosu ile yapıldı',
    glass_open_page: 'Gönderi sayfası',
    glass_hint: 'Grupta yayınlamak için @bot ve kodu yaz.',
  },
};

/** پیام‌های کلیدی ربات در هر زبان (va: {x} جایگزین می‌شود) */
const T = {
  fa: {
    lang_ask: '🌐 <b>زبان خود را انتخاب کنید</b>\n\nانتخاب زبان فقط برای پیام‌های ربات است و هر وقت قابل تغییر است.',
    lang_set: '✅ زبان ربات روی «{lang}» تنظیم شد.',
    welcome: '⚡ <b>AMINCK Nova</b>\n\n🔥 کانفیگ آماده، تحویل آنی، پشتیبانی واقعی\n🛡 مسیرهای ضدسانسور با جایگزینی خودکار\n\n👇 از منوی پایین شروع کنید:',
    shop_title: '🛍 <b>فروشگاه</b>\n\nدسته را انتخاب کنید 👇',
    product_price: '💰 قیمت',
    product_buy_card: '💳 پرداخت کارت به کارت',
    product_buy_gateway: '🏦 پرداخت آنی با درگاه بانکی',
    product_buy_wallet: '👛 خرید از کیف پول',
    product_buy_coins: '🪙 پرداخت با {n} سکه',
    product_trial: '🎁 دریافت تست رایگان',
    product_back: '🛒 بازگشت به فروشگاه',
    product_stock: '📦 موجودی',
    product_sold_out: '⛔ تمام شده',
    product_status_ok: '🟢 وضعیت: آماده تحویل ({n} مسیر سالم)',
    product_status_dead: '🔴 وضعیت: فعلاً مسیر سالمی ندارد (تحویل متوقف شده است)',
    pay_wait: '🧾 سفارش #{id} ساخته شد و در انتظار فیش شماست.',
    pay_receipt_ok: '✅ فیش دریافت شد؛ بعد از بررسی، سرویس برایتان ارسال می‌شود. ⏳',
    pay_paid: '✅ پرداخت تایید شد — سرویس در «🧩 اشتراک‌های من» است.',
    trial_ok: '🎁 تست رایگان فعال شد!\n⏱ {hours} ساعت | 📊 {mb} مگابایت | 🖥 بهترین سرویس‌های سالم',
    trial_used: '⛔ تست رایگان را استفاده کرده‌اید.',
    referral_title: '👥 <b>دعوت دوستان</b>\n\n🔗 لینک شما:\n<code>{link}</code>\n\n🎁 پاداش: {percent}٪ از خرید هر زیرمجموعه + {coins} سکه برای هر دعوت فعال\n📊 تا امروز: {count} نفر',
    profile_title: '👤 <b>پروفایل</b>',
    help_title: '📖 <b>راهنما</b>',
    support_title: '📞 <b>پشتیبانی</b>\n\nمتن مشکل خود را بفرستید تا کارشناس پاسخ دهد 🙏',
    err_no_server: '⛔ فعلاً سرور آماده‌ای ثبت نشده؛ برای همین هیچ کانفیگ جعلی‌ای تحویل نمی‌دهیم.',
    err_rate: '⚠️ نرخ آنلاین در دسترس نیست؛ ادمین باید از پنل نرخ دستی بگذارد.',
    err_unavailable: '🚫 سرویس فعلاً در دسترس نیست. به‌محض برگشتن مسیرها خبر می‌دهیم.',
    err_sold_out: '📦 موجودی این محصول تمام شده است.',
    err_not_enough: '😕 موجودی/سکه کافی نیست.',
    glass_title: '🧪 <b>پست شیشه‌ای</b>\n\nمتن و دکمه‌های خودتان را بسازید، کد بگیرید و در هر گروه/کانالی با @{bot} <code>{code}</code> منتشر کنید.',
    glass_ask_text: '✍️ متن پست را بفرستید (بدون مارک‌داون؛ ایموجی آزاد است):',
    glass_done: '✅ پست شیشه‌ای ساخته شد.\n🔢 کد شما: <code>{code}</code>\n\n📌 برای انتشار در گروه/کانال:\n• در آن چت بنویسید: <code>@{bot} {code}</code> و نتیجه را انتخاب کنید\n• یا همین پیام را فوروارد کنید (دکمه‌ها حفظ می‌شوند)\n• یا اگر ربات ادمین کانال است: <code>/glass post {code} @channel</code>',
    group_pay_title: '💳 <b>پرداخت</b> — سفارش #{id}\n\n💰 مبلغ: {amount}\n\nپس از واریز، روی «🧾 ثبت فیش» بزنید و عکس فیش را <b>به همین پیام ریپلای</b> کنید.\n🔐 کانفیگ فقط در پیوی برایتان ارسال می‌شود.',
    group_receipt_btn: '🧾 ثبت فیش (ریپلای عکس به این پیام)',
    group_paid_pv: 'پرداخت سفارش #{id} تایید شد — ✅ تحویل در پیوی 📩',
    glass_ref_head: 'VPN سریع و پایدار',
    glass_ref_l1: 'کانفیگ آماده + تست رایگان',
    glass_ref_l2: 'مسیرهای ضدسانسور با قیمت منصفانه',
    glass_ref_l3: 'بک‌لینک برای دوستانت',
    glass_ref_btn: 'شروع با لینک من',
    glass_ref_cta: 'دعوت من',
    glass_made_by: 'ساخته‌شده با استودیوی پست شیشه‌ای',
    glass_open_page: 'مشاهدهٔ صفحهٔ پست',
    glass_hint: 'برای انتشار در گروه، @بات و کد را بنویس.',
  },
  en: {
    lang_ask: '🌐 <b>Choose your language</b>\n\nThis only changes bot messages and can be changed any time.',
    lang_set: '✅ Bot language set to “{lang}”.',
    welcome: '⚡ <b>AMINCK Nova</b>\n\n🔥 Ready configs, instant delivery, real support\n🛡 Anti-censorship routes with automatic failover\n\n👇 Start from the menu below:',
    shop_title: '🛍 <b>Store</b>\n\nPick a category 👇',
    product_price: '💰 Price',
    product_buy_card: '💳 Pay card-to-card',
    product_buy_gateway: '🏦 Instant bank gateway payment',
    product_buy_wallet: '👛 Pay from wallet',
    product_buy_coins: '🪙 Pay with {n} coins',
    product_trial: '🎁 Get free trial',
    product_back: '🛒 Back to store',
    product_stock: '📦 Stock',
    product_sold_out: '⛔ Sold out',
    product_status_ok: '🟢 Status: ready to deliver ({n} healthy routes)',
    product_status_dead: '🔴 Status: no healthy route right now (delivery paused)',
    pay_wait: '🧾 Order #{id} created, waiting for your receipt.',
    pay_receipt_ok: '✅ Receipt received. Your service will be sent after verification. ⏳',
    pay_paid: '✅ Payment confirmed — see “🧩 My subscriptions”.',
    trial_ok: '🎁 Free trial activated!\n⏱ {hours} hours | 📊 {mb} MB | 🖥 best healthy servers',
    trial_used: '⛔ You already used the free trial.',
    referral_title: '👥 <b>Invite friends</b>\n\n🔗 Your link:\n<code>{link}</code>\n\n🎁 Reward: {percent}% of each purchase + {coins} coins per active invite\n📊 So far: {count} people',
    profile_title: '👤 <b>Profile</b>',
    help_title: '📖 <b>Help</b>',
    support_title: '📞 <b>Support</b>\n\nSend your issue and an operator will reply 🙏',
    err_no_server: '⛔ No real server is configured yet, so we never deliver fake configs.',
    err_rate: '⚠️ Live rate unavailable; admin must set a manual rate in the panel.',
    err_unavailable: '🚫 Service is temporarily unavailable. We will notify when routes are back.',
    err_sold_out: '📦 This product is out of stock.',
    err_not_enough: '😕 Not enough balance/coins.',
    glass_title: '🧪 <b>Glass post builder</b>\n\nWrite your text + buttons, get a code, publish it in any group/channel with @{bot} <code>{code}</code>.',
    glass_ask_text: '✍️ Send the post text (plain text, emojis welcome):',
    glass_done: '✅ Glass post created.\n🔢 Your code: <code>{code}</code>\n\n📌 To publish in a group/channel:\n• type <code>@{bot} {code}</code> there and pick the result\n• or forward this message (buttons are kept)\n• or if the bot is channel admin: <code>/glass post {code} @channel</code>',
    group_pay_title: '💳 <b>Payment</b> — order #{id}\n\n💰 Amount: {amount}\n\nAfter paying, tap “🧾 Submit receipt” and <b>reply to this message</b> with the photo.\n🔐 The config is sent to you privately.',
    group_receipt_btn: '🧾 Submit receipt (reply photo to this message)',
    group_paid_pv: 'Order #{id} paid — ✅ delivered in private chat 📩',
  },
  ar: {
    lang_ask: '🌐 <b>اختر لغتك</b>\n\nيغيّر هذا رسائل البوت فقط ويمكن تغييره في أي وقت.',
    lang_set: '✅ تم ضبط لغة البوت على «{lang}».',
    welcome: '⚡ <b>AMINCK Nova</b>\n\n🔥 إعدادات جاهزة، تسليم فوري، دعم حقيقي\n🛡 مسارات مقاومة للرقابة مع تبديل تلقائي\n\n👇 ابدأ من القائمة أدناه:',
    shop_title: '🛍 <b>المتجر</b>\n\nاختر فئة 👇',
    product_price: '💰 السعر',
    product_buy_card: '💳 الدفع بالبطاقة',
    product_buy_gateway: '🏦 الدفع الفوري عبر البوابة',
    product_buy_wallet: '👛 الدفع من المحفظة',
    product_buy_coins: '🪙 الدفع بـ{n} عملة',
    product_trial: '🎁 جرّب مجاناً',
    product_back: '🛒 رجوع للمتجر',
    product_stock: '📦 المخزون',
    product_sold_out: '⛔ نفد',
    product_status_ok: '🟢 الحالة: جاهز للتسليم ({n} مسار سليم)',
    product_status_dead: '🔴 الحالة: لا يوجد مسار سليم الآن (التسليم متوقف)',
    pay_wait: '🧾 تم إنشاء الطلب #{id} وبانتظار إيصالك.',
    pay_receipt_ok: '✅ استلمنا الإيصال؛ سيُرسل الاشتراك بعد التحقق. ⏳',
    pay_paid: '✅ تم تأكيد الدفع — راجع «🧩 اشتراكاتي».',
    trial_ok: '🎁 تم تفعيل التجربة المجانية!\n⏱ {hours} ساعة | 📊 {mb} ميغا | 🖥 أفضل السيرفرات',
    trial_used: '⛔ استخدمت التجربة المجانية سابقاً.',
    referral_title: '👥 <b>ادعُ أصدقاءك</b>\n\n🔗 رابطك:\n<code>{link}</code>\n\n🎁 المكافأة: {percent}٪ من كل عملية شراء + {coins} عملة لكل دعوة نشطة\n📊 حتى الآن: {count} شخص',
    profile_title: '👤 <b>الملف الشخصي</b>',
    help_title: '📖 <b>المساعدة</b>',
    support_title: '📞 <b>الدعم</b>\n\nأرسل مشكلتك ليرد عليك المشرف 🙏',
    err_no_server: '⛔ لا يوجد سيرفر حقيقي مضبوط بعد، لذلك لا نسلم إعدادات وهمية.',
    err_rate: '⚠️ السعر غير متاح؛ على المدير ضبط سعر يدوي من اللوحة.',
    err_unavailable: '🚫 الخدمة غير متاحة مؤقتاً.',
    err_sold_out: '📦 نفد مخزون هذا المنتج.',
    err_not_enough: '😕 الرصيد/العملات غير كافية.',
    glass_title: '🧪 <b>منشور زجاجي</b>\n\nاكتب نصك وأزرارك، خذ رمزاً وانشره في أي مجموعة بقناة عبر @{bot} <code>{code}</code>.',
    glass_ask_text: '✍️ أرسل نص المنشور:',
    glass_done: '✅ تم إنشاء المنشور.\n🔢 رمزك: <code>{code}</code>\n\n📌 للنشر: اكتب <code>@{bot} {code}</code> في المحادثة أو أعد توجيه هذه الرسالة.',
    group_pay_title: '💳 <b>الدفع</b> — الطلب #{id}\n\n💰 المبلغ: {amount}\n\nبعد الدفع اضغط «🧾 إرسال الإيصال» وأرسل صورة الإيصال ردّاً على هذه الرسالة.\n🔐 يُرسل الإعداد في الخاص.',
    group_receipt_btn: '🧾 إرسال الإيصال (رد بصورة)',
    group_paid_pv: 'تم دفع الطلب #{id} — ✅ التسليم في الخاص 📩',
  },
  ru: {
    lang_ask: '🌐 <b>Выберите язык</b>\n\nЭто влияет только на сообщения бота и меняется в любой момент.',
    lang_set: '✅ Язык бота: «{lang}».',
    welcome: '⚡ <b>AMINCK Nova</b>\n\n🔥 Готовые конфиги, мгновенная выдача, живая поддержка\n🛡 Антицензурные маршруты с автозаменой\n\n👇 Начните с меню ниже:',
    shop_title: '🛍 <b>Магазин</b>\n\nВыберите категорию 👇',
    product_price: '💰 Цена',
    product_buy_card: '💳 Оплата с карты на карту',
    product_buy_gateway: '🏦 Быстрая оплата через шлюз',
    product_buy_wallet: '👛 Оплатить с кошелька',
    product_buy_coins: '🪙 Оплатить {n} монетами',
    product_trial: '🎁 Бесплатный пробник',
    product_back: '🛒 Назад в магазин',
    product_stock: '📦 Остаток',
    product_sold_out: '⛔ Нет в наличии',
    product_status_ok: '🟢 Статус: готов к выдаче ({n} рабочих маршрутов)',
    product_status_dead: '🔴 Статус: нет рабочих маршрутов (выдача приостановлена)',
    pay_wait: '🧾 Заказ #{id} создан, ждём чек.',
    pay_receipt_ok: '✅ Чек получен; сервис придёт после проверки. ⏳',
    pay_paid: '✅ Оплата подтверждена — смотрите «🧩 Мои подписки».',
    trial_ok: '🎁 Пробный период активирован!\n⏱ {hours} ч | 📊 {mb} МБ | 🖥 лучшие серверы',
    trial_used: '⛔ Пробный период уже использован.',
    referral_title: '👥 <b>Пригласить друзей</b>\n\n🔗 Ваша ссылка:\n<code>{link}</code>\n\n🎁 Награда: {percent}٪ с покупок + {coins} монет за активного реферала\n📊 Всего: {count}',
    profile_title: '👤 <b>Профиль</b>',
    help_title: '📖 <b>Помощь</b>',
    support_title: '📞 <b>Поддержка</b>\n\nОпишите проблему — оператор ответит 🙏',
    err_no_server: '⛔ Реальные серверы ещё не настроены, фейковые конфиги не выдаём.',
    err_rate: '⚠️ Курс недоступен; админ должен задать вручную в панели.',
    err_unavailable: '🚫 Сервис временно недоступен.',
    err_sold_out: '📦 Товара нет в наличии.',
    err_not_enough: '😕 Недостаточно средств/монет.',
    glass_title: '🧪 <b>Glass-пост</b>\n\nСоздайте текст и кнопки, получите код и публикуйте в любом чате: @{bot} <code>{code}</code>.',
    glass_ask_text: '✍️ Отправьте текст поста:',
    glass_done: '✅ Пост создан.\n🔢 Ваш код: <code>{code}</code>\n\n📌 Публикация: введите <code>@{bot} {code}</code> в чате или перешлите это сообщение.',
    group_pay_title: '💳 <b>Оплата</b> — заказ #{id}\n\n💰 Сумма: {amount}\n\nПосле оплаты нажмите «🧾 Отправить чек» и ответьте фото на это сообщение.\n🔐 Конфиг придёт в личку.',
    group_receipt_btn: '🧾 Отправить чек (фото-ответ)',
    group_paid_pv: 'Заказ #{id} оплачен — ✅ выдача в личке 📩',
  },
  tr: {
    lang_ask: '🌐 <b>Dilini seç</b>\n\nBu yalnızca bot mesajlarını değiştirir; istediğin an değiştirebilirsin.',
    lang_set: '✅ Bot dili “{lang}” olarak ayarlandı.',
    welcome: '⚡ <b>AMINCK Nova</b>\n\n🔥 Hazır konfigürasyon, anında teslim, gerçek destek\n🛡 Otomatik yedekli sansür-bypass hatları\n\n👇 Aşağıdaki menüden başla:',
    shop_title: '🛍 <b>Mağaza</b>\n\nKategori seç 👇',
    product_price: '💰 Fiyat',
    product_buy_card: '💳 Karttan karta ödeme',
    product_buy_gateway: '🏦 Banka ödeme kanalı ile anında öde',
    product_buy_wallet: '👛 Cüzdandan öde',
    product_buy_coins: '🪙 {n} coin ile öde',
    product_trial: '🎁 Ücretsiz dene',
    product_back: '🛒 Mağazaya dön',
    product_stock: '📦 Stok',
    product_sold_out: '⛔ Tükendi',
    product_status_ok: '🟢 Durum: teslim hazır ({n} sağlıklı hat)',
    product_status_dead: '🔴 Durum: sağlıklı hat yok (teslim durdu)',
    pay_wait: '🧾 Sipariş #{id} oluşturuldu, dekont bekleniyor.',
    pay_receipt_ok: '✅ Dekont alındı; doğrulama sonrası hizmet gönderilecek. ⏳',
    pay_paid: '✅ Ödeme onaylandı — “🧩 Aboneliklerim” bölümüne bak.',
    trial_ok: '🎁 Ücretsiz deneme etkin!\n⏱ {hours} saat | 📊 {mb} MB | 🖥 en iyi sunucular',
    trial_used: '⛔ Ücretsiz denemeyi kullandın.',
    referral_title: '👥 <b>Arkadaş davet et</b>\n\n🔗 Bağlantın:\n<code>{link}</code>\n\n🎁 Ödül: her alışverişin ٪{percent} + aktif davet başına {coins} coin\n📊 Şimdiye kadar: {count} kişi',
    profile_title: '👤 <b>Profil</b>',
    help_title: '📖 <b>Yardım</b>',
    support_title: '📞 <b>Destek</b>\n\nSorununu yaz, operatör yanıtlasın 🙏',
    err_no_server: '⛔ Henüz gerçek sunucu yok; sahte konfig teslim etmiyoruz.',
    err_rate: '⚠️ Kur erişilemiyor; yönetici panelden elle kur girmeli.',
    err_unavailable: '🚫 Hizmet şu anda erişilemiyor.',
    err_sold_out: '📦 Bu ürünün stoğu bitti.',
    err_not_enough: '😕 Bakiye/coin yetersiz.',
    glass_title: '🧪 <b>Cam gönderi</b>\n\nMetnini ve butonlarını oluştur, kod al ve her grupta/kanalda paylaş: @{bot} <code>{code}</code>.',
    glass_ask_text: '✍️ Gönderi metnini gönder:',
    glass_done: '✅ Gönderi oluşturuldu.\n🔢 Kodun: <code>{code}</code>\n\n📌 Yayınlemek için sohbette <code>@{bot} {code}</code> yaz veya bu mesajı ilet.',
    group_pay_title: '💳 <b>Ödeme</b> — sipariş #{id}\n\n💰 Tutar: {amount}\n\nÖdemeden sonra «🧾 Dekont gönder»e bas ve bu mesaja fotoğrafı yanıtla.\n🔐 Konfig özel sohbete gelir.',
    group_receipt_btn: '🧾 Dekont gönder (fotoğraf yanıtı)',
    group_paid_pv: 'Sipariş #{id} ödendi — ✅ teslimat özel sohbette 📩',
  },
};

const DEFAULT_LANG = 'fa';

export const langName = (l) => LANGS[l]?.name || LANGS[DEFAULT_LANG].name;
export const dirOf = (l) => (LANGS[l]?.dir) || 'rtl';
export const isRtl = (l) => dirOf(l) === 'rtl';
export const normalizeLang = (l) => {
  const s = String(l || '').trim().toLowerCase();
  if (LANGS[s]) return s;
  const m = LANG_KEYS.find((k) => s.startsWith(k));
  return m || DEFAULT_LANG;
};

/** متن یک کلید با جایگزینی {var} — بازنویسی دستی: i18n:<lang>:<key> */
export function t(lang, key, vars = {}, override = '') {
  const base = (override && String(override)) || T[normalizeLang(lang)]?.[key] || T[DEFAULT_LANG][key] || key;
  let out = String(base);
  for (const [k, v] of Object.entries(vars || {})) out = out.split(`{${k}}`).join(String(v));
  return out;
}

/** برچسب دکمه‌ها در زبان خواسته‌شده */
export function menuLabel(lang, key) {
  const canonical = MENU_LABELS[key];
  if (!canonical) return key;
  const l = normalizeLang(lang);
  return MENU_I18N[l]?.[key] || canonical;
}

/** همهٔ برچسب‌های ممکن یک کلید (برای نگاشت ورودی کاربر) */
export function labelVariants(key) {
  const out = [];
  for (const l of LANG_KEYS) out.push(MENU_I18N[l]?.[key] || MENU_LABELS[key]);
  return [...new Set(out.filter(Boolean))];
}

let _index = null;
function buildIndex() {
  _index = new Map();
  for (const [key, canonical] of Object.entries(MENU_LABELS)) {
    for (const lbl of labelVariants(key)) _index.set(String(lbl).trim(), canonical);
  }
}

/** برچسب هر زبانی → برچسب یکپارچهٔ فارسی (تا مسیرهای متنی ربات نشکنند) */
export function canonicalLabel(text) {
  if (!_index) buildIndex();
  const s = String(text || '').trim();
  return _index.get(s) || s;
}

export function langKeyboard() {
  return {
    resize_keyboard: false,
    inline_keyboard: [
      [
        { text: `${LANGS.fa.flag} ${LANGS.fa.name}`, callback_data: 'lang:fa' },
        { text: `${LANGS.en.flag} ${LANGS.en.name}`, callback_data: 'lang:en' },
      ],
      [
        { text: `${LANGS.ar.flag} ${LANGS.ar.name}`, callback_data: 'lang:ar' },
        { text: `${LANGS.ru.flag} ${LANGS.ru.name}`, callback_data: 'lang:ru' },
      ],
      [{ text: `${LANGS.tr.flag} ${LANGS.tr.name}`, callback_data: 'lang:tr' }],
    ],
  };
}

/** کیبورد اصلی کاربر — ردیف‌های استاندارد در زبان کاربر */
export function userKeyboardRows(lang, { isAdmin = false } = {}) {
  const L = (k) => menuLabel(lang, k);
  const rows = [
    [L('dashboard'), L('subs')],
    [L('shop'), L('trial')],
    [L('account'), L('referral')],
    [L('game'), L('ai')],
    [L('glass'), L('perks')],
    [L('support'), L('help')],
    [L('lang')],
  ];
  if (isAdmin) rows.push([L('admin')]);
  return rows;
}

/**
 * ترجمه با امکان بازنویسی از پنل:
 *   تنظیمات با کلید  i18n:<lang>:<key>  (و برای متن‌های بات: text:<key>:<lang>)
 * اگر بازنویسی نباشد، دیکشنری داخل کد استفاده می‌شود.
 */
export async function ti18n(db, lang, key, vars = {}) {
  let override = '';
  try {
    const { getSetting } = await import('./db.js');
    override = await getSetting(db, `i18n:${normalizeLang(lang)}:${key}`, '');
  } catch {
    override = '';
  }
  return t(lang, key, vars, override);
}

/** فهرست کلیدهای دیکشنری (برای ویرایش در پنل) */
export const I18N_KEYS = Object.keys(T[DEFAULT_LANG]);

export const MENU_KEY_BY_LABEL = MENU_LABELS;
