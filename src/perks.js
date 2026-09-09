// ═══════════════════════════════════════════════════════════════════
//  🎁 قابلیت‌های افزوده — کاربری و مالکی
//
//  کاربر:
//   • کارت خراش روزانه (قرعه‌کشی وزن‌دار، یک‌بار در روز، ضدتکرار با UNIQUE)
//   •check-in ۷ روزه با پاداش پلکانی + بونوس روز هفتم
//   • کوپن شخصی هر کاربر (کد تخفیف فقط برای خودش — روی همان discount_codes)
//   • نظر و امتیاز محصول (۱..۵، یک نظر به ازای هر کاربر×محصول)
//   • علاقه‌مندی‌ها (❤️) و شمارش معکوس انقضا در «اشتراک‌های من»
//   • لینک چنددستگاهی برای اشتراک (QR + لینک برچسب‌دار برای هر دستگاه)
//
//  مالک/ادمین:
//   • گزارش فروش روزانه/هفتگی در پیوی (کرون) — قابل خاموش‌کردن
//   • صف ارسال همگانی زمان‌بندی‌شده (batch دوستانه با سقف subrequest)
//   • تولید انبوه کوپن
//   • سقف خرید هر کاربر (تعداد و مبلغ در روز)
//   • لاگ اقدامات ادمین (audit)
//   • ضدسوءاستفاده از رفرال (حداقل سن حساب، حداقل مبلغ اولین خرید، بلوک)
//  همه از تنظیمات قابل تغییرند؛ هیچ عددی hard-code نشده که مالک نتواند باز کند.
// ═══════════════════════════════════════════════════════════════════
import { esc } from './util.js';
import { send, tg, btn } from './tg.js';
import { getSettingValue } from './texts.js';
import { faDigits, fmtToman, fmtDate, getUser, addBalance } from './db.js';

const DAY = 86400;
const now = () => Math.floor(Date.now() / 1000);
const todayUtc = () => new Date().toISOString().slice(0, 10);
const dayOffsetIso = (n) => new Date(Date.now() - n * DAY * 1000).toISOString().slice(0, 10);

async function set(db, key, val) {
  await db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key, String(val)).run();
}
const numSet = async (db, key, def) => {
  const n = Number(await getSettingValue(db, key));
  return Number.isFinite(n) && n >= 0 ? n : def;
};

/* ═══════════════════ لاگ اقدامات ادمین ═══════════════════ */
export async function audit(db, { actorId = 0, actor = '', action = '', target = '', detail = '' }) {
  try {
    if ((await getSettingValue(db, 'audit_log_enabled')) === '0') return { ok: false, skipped: true };
    await db.prepare('INSERT INTO audit_log (actor_id,actor,action,target,detail,created_at) VALUES (?,?,?,?,?,?)').bind(
      Number(actorId) || 0,
      String(actor || '').slice(0, 60),
      String(action || '').slice(0, 60),
      String(target || '').slice(0, 120),
      String(detail || '').slice(0, 400),
      now()
    ).run();
    // نگه‌داشتن ۱۰۰۰ رکورد آخر
    await db.prepare('DELETE FROM audit_log WHERE id <= (SELECT MAX(id)-1000 FROM audit_log)').run();
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function recentAudit(db, limit = 20) {
  const r = await db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?').bind(Math.max(1, Math.min(100, Number(limit) || 20))).all();
  return r.results || [];
}

/* ═══════════════════ کارت خراش روزانه ═══════════════════ */
const PRIZE_DEFAULT = '[{"kind":"coins","value":20,"weight":42},{"kind":"coins","value":60,"weight":22},{"kind":"amount","value":15000,"weight":12},{"kind":"days","value":1,"weight":8},{"kind":"coins","value":200,"weight":4},{"kind":"none","value":0,"weight":12}]';

function drawPrize(list) {
  const total = list.reduce((a, x) => a + Math.max(0, Number(x.weight) || 0), 0);
  if (total <= 0) return { kind: 'none', value: 0 };
  let r = Math.random() * total;
  for (const x of list) {
    r -= Math.max(0, Number(x.weight) || 0);
    if (r <= 0) return { kind: ['coins', 'amount', 'days', 'none'].includes(x.kind) ? x.kind : 'coins', value: Math.max(0, Math.round(Number(x.value) || 0)) };
  }
  return { kind: 'none', value: 0 };
}

export async function scratchState(db, userId) {
  const day = todayUtc();
  const r = await db.prepare('SELECT * FROM scratch_cards WHERE user_id=? AND day=?').bind(userId, day).first();
  return { day, row: r ? { id: Number(r.id), won: Number(r.won || 0), kind: r.prize_kind, value: Number(r.prize_value || 0) } : null };
}

export async function scratchNow(env, user) {
  const db = env.DB;
  if ((await getSettingValue(db, 'scratch_enabled')) === '0') return { ok: false, error: 'کارت خراش غیرفعال است.' };
  const day = todayUtc();
  const exist = await db.prepare('SELECT * FROM scratch_cards WHERE user_id=? AND day=?').bind(user.id, day).first();
  if (exist && Number(exist.won || 0)) return { ok: false, done: true, kind: exist.prize_kind, value: Number(exist.prize_value || 0) };
  let list = [];
  try {
    list = JSON.parse((await getSettingValue(db, 'scratch_prizes')) || PRIZE_DEFAULT);
  } catch {
    list = JSON.parse(PRIZE_DEFAULT);
  }
  if (!Array.isArray(list) || !list.length) list = JSON.parse(PRIZE_DEFAULT);
  const prize = drawPrize(list);
  let id = exist ? Number(exist.id) : 0;
  if (exist) {
    await db.prepare('UPDATE scratch_cards SET prize_kind=?, prize_value=?, won=1, created_at=? WHERE id=?').bind(prize.kind, prize.value, now(), exist.id).run();
  } else {
    const res = await db
      .prepare('INSERT INTO scratch_cards (user_id, day, prize_kind, prize_value, won, created_at) VALUES (?,?,?,?,1,?)')
      .bind(user.id, day, prize.kind, prize.value, now())
      .run();
    const last = await db.prepare('SELECT id FROM scratch_cards ORDER BY id DESC LIMIT 1').first();
    id = Number(last?.id || 0);
  }
  let claimNote = '';
  if (prize.kind === 'coins' && prize.value > 0) {
    await db.prepare('UPDATE users SET coins = coins + ? WHERE id=?').bind(prize.value, user.id).run();
    claimNote = `🪙 ${faDigits(prize.value)} سکه گرفتی!`;
  } else if (prize.kind === 'amount' && prize.value > 0) {
    await addBalance(db, user.id, prize.value);
    claimNote = `👛 ${fmtToman(prize.value)} به کیف پولت اضافه شد.`;
  } else if (prize.kind === 'days' && prize.value > 0) {
    const sub = await db.prepare('SELECT * FROM subscriptions WHERE user_id=? AND active=1 ORDER BY expire_at DESC LIMIT 1').bind(user.id).first();
    if (sub) {
      const floor = (await numSet(db, 'scratch_extend_floor_toman', 50000)) || 0;
      if (floor > 0 && Number(user.total_paid || 0) < floor) {
        claimNote = `🎟 جایزهٔ ${faDigits(prize.value)} روز اعتبار ثبت شد اما برای فعال‌شدنش حداقل ${fmtToman(floor)} خرید لازم است.`;
      } else {
        await db.prepare('UPDATE subscriptions SET expire_at = expire_at + ? WHERE id=?').bind(prize.value * DAY, sub.id).run();
        claimNote = `⏳ ${faDigits(prize.value)} روز به «${sub.title || 'اشتراک'}» اضافه شد.`;
      }
    } else {
      claimNote = `🎟 جایزهٔ ${faDigits(prize.value)} روز اعتبار گرفتی؛ با اولین اشتراک فعال می‌شود.`;
      await set(db, `scratch_pending:${user.id}`, String(prize.value));
    }
  } else {
    claimNote = '😕 این بار شانس یارت نبود؛ فردا دوباره تلاش کن.';
  }
  return { ok: true, id, kind: prize.kind, value: prize.value, note: claimNote };
}

/* ═══════════════════ چک‌این ۷ روزه ═══════════════════ */
export async function checkinState(db, userId) {
  const fresh = await getUser(db, userId);
  const mask = String(fresh?.checkin_mask || '');
  return {
    date: fresh?.checkin_date || '',
    streak: Number(fresh?.checkin_streak || 0),
    mask: mask.length === 7 ? mask : '0'.repeat(7),
    todayDone: (fresh?.checkin_date || '') === todayUtc(),
  };
}

export async function checkinNow(db, userId) {
  if ((await getSettingValue(db, 'checkin_enabled')) === '0') return { ok: false, error: 'چک‌این روزانه غیرفعال است.' };
  const day = todayUtc();
  const st = await checkinState(db, userId);
  if (st.todayDone) return { ok: false, done: true, streak: st.streak };
  const yesterday = dayOffsetIso(1);
  const streak = st.date === yesterday ? Math.min(7, st.streak + 1) : 1;
  const base = await numSet(db, 'checkin_coins', 15);
  const step = await numSet(db, 'checkin_step', 5);
  const bonus = await numSet(db, 'checkin_day7_bonus', 120);
  const reward = base + (streak - 1) * step + (streak >= 7 ? bonus : 0);
  // ماسک ۷ روزه: هر روز چک‌این یک ۱ (از چپ = قدیمی‌ترین)
  const mask = (st.mask + '1').slice(-7);
  await db.prepare('UPDATE users SET checkin_date=?, checkin_streak=?, checkin_mask=?, coins=coins+?, last_seen=? WHERE id=?').bind(day, streak, mask, reward, now(), userId).run();
  const extra = streak >= 7 ? `\n🎉 روز هفتم! بونوس ${faDigits(bonus)} سکه هم گرفتی.` : '';
  return { ok: true, streak, reward, mask, note: `📅 روز ${faDigits(streak)} از ۷ • +${faDigits(reward)} سکه${extra}` };
}

export function streakBars(mask) {
  return [...String(mask).padEnd(7, '0')].slice(0, 7).map((c, i) => (c === '1' ? '🟩' : '⬜')).join(' ');
}

/* ═══════════════════ کوپن شخصی ═══════════════════ */
export async function personalCoupon(db, userId, { create = true } = {}) {
  if ((await getSettingValue(db, 'personal_coupon_enabled')) === '0') return null;
  const exist = await db.prepare('SELECT * FROM discount_codes WHERE user_id=? ORDER BY id DESC LIMIT 1').bind(userId).first();
  if (exist) return exist;
  if (!create) return null;
  const percent = await numSet(db, 'personal_coupon_percent', 7);
  const days = await numSet(db, 'personal_coupon_days', 30);
  const code = `VIP${String(userId).slice(-5)}${Math.floor(100 + Math.random() * 900)}`;
  const exp = days > 0 ? now() + days * DAY : 0;
  await db
    .prepare('INSERT INTO discount_codes (code,kind,value,max_uses,used_count,expires_at,user_id,min_order,active,created_at) VALUES (?,?,?,?,0,?,?,0,1,?)')
    .bind(code, 'percent', percent, 1, exp, userId, now())
    .run();
  return db.prepare('SELECT * FROM discount_codes WHERE code=?').bind(code).first();
}

export async function myCoupons(db, userId) {
  const r = await db.prepare('SELECT * FROM discount_codes WHERE user_id=? ORDER BY id DESC LIMIT 10').bind(userId).all();
  return (r.results || []).map((c) => ({
    code: c.code,
    percent: c.kind === 'percent' ? Number(c.value) : 0,
    amount: c.kind === 'amount' ? Number(c.value) : 0,
    expires: Number(c.expires_at || 0),
    used: Number(c.used_count || 0),
    max: Number(c.max_uses || 0),
    active: Number(c.active || 0),
    min: Number(c.min_order || 0),
  }));
}

/** تولید انبوه کوپن (ادمین) */
export async function generateCoupons(db, { count = 10, percent = 10, days = 7, maxUses = 1, prefix = 'OFF', minOrder = 0 } = {}) {
  const n = Math.max(1, Math.min(200, Number(count) || 10));
  const p = Math.max(1, Math.min(95, Number(percent) || 10));
  const d = Math.max(0, Math.min(3650, Number(days) || 7));
  const mu = Math.max(1, Math.min(1000, Number(maxUses) || 1));
  const px = String(prefix || 'OFF').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8) || 'OFF';
  const exp = d > 0 ? now() + d * DAY : 0;
  const created = [];
  for (let i = 0; i < n; i++) {
    const code = `${px}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    try {
      await db
        .prepare('INSERT INTO discount_codes (code,kind,value,max_uses,used_count,expires_at,user_id,min_order,active,created_at) VALUES (?,\'percent\',?,?,0,?,?,?,1,?)')
        .bind(code, p, mu, exp, 0, minOrder || 0, now())
        .run();
      created.push(code);
    } catch {
      /* تکراری → رد شو */
    }
  }
  return { created, count: created.length, percent: p, days: d, maxUses: mu };
}

/* ═══════════════════ سقف خرید هر کاربر ═══════════════════ */
export async function checkPurchaseLimits(db, user, amountToman = 0) {
  if (!user || ['super', 'admin'].includes(user.role)) return { ok: true };
  const dayStart = Math.floor(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()) / 1000);
  const maxOrders = await numSet(db, 'user_daily_orders', 0);
  const maxToman = await numSet(db, 'user_daily_toman', 0);
  if (maxOrders > 0) {
    const c = await db.prepare("SELECT COUNT(*) c FROM orders WHERE user_id=? AND created_at>=? AND status IN ('pending','paid')").bind(user.id, dayStart).first();
    if (Number(c?.c || 0) >= maxOrders) return { ok: false, reason: `⛔ سقف ${faDigits(maxOrders)} سفارش در روز را استفاده کرده‌اید. فردا دوباره تلاش کنید یا با پشتیبانی صحبت کنید.` };
  }
  if (maxToman > 0) {
    const s = await db.prepare("SELECT COALESCE(SUM(amount_toman),0) s FROM orders WHERE user_id=? AND created_at>=? AND status IN ('pending','paid')").bind(user.id, dayStart).first();
    if (Number(s?.s || 0) + Number(amountToman || 0) > maxToman) {
      return { ok: false, reason: `⛔ سقف مبلغ خرید روزانه (${fmtToman(maxToman)}) پر شده است. برای خرید بیشتر به پشتیبانی پیام دهید.` };
    }
  }
  return { ok: true };
}

/* ═══════════════════ ضدسوءاستفاده رفرال ═══════════════════ */
export async function referralAbuseCheck(db, buyer, referrer, amount) {
  if (!referrer || Number(referrer.banned || 0) === 1) return { allow: false, why: 'referrer_banned' };
  if (Number(buyer?.ref_blocked || 0) === 1) return { allow: false, why: 'blocked' };
  if ((await getSettingValue(db, 'ref_anti_abuse')) === '0') return { allow: true };
  const minAge = await numSet(db, 'ref_min_account_days', 1);
  const minBuy = await numSet(db, 'ref_min_first_buy', 0);
  const ageDays = (now() - Number(buyer?.created_at || 0)) / DAY;
  if (minAge > 0 && ageDays < minAge) return { allow: false, why: `too_new(min ${minAge}d)` };
  if (minBuy > 0 && Number(amount || 0) < minBuy) return { allow: false, why: `small_first_buy(<${minBuy})` };
  const bName = String(buyer?.first_name || '').trim().toLowerCase();
  const rName = String(referrer?.first_name || '').trim().toLowerCase();
  const bUser = String(buyer?.username || '').trim().toLowerCase();
  const rUser = String(referrer?.username || '').trim().toLowerCase();
  if (bUser && bUser === rUser) return { allow: false, why: 'same_username' };
  // نام یکسان تنها کافی نیست (اسم‌های فارسی تکراری‌اند) — فقط «خوشه» رد می‌شود:
  // چند حساب تازه با نام یکسان از یک معرف → علامت سوءاستفاده
  const dupes = await db
    .prepare('SELECT COUNT(*) c FROM users WHERE referrer_id=? AND first_name=? AND created_at>?')
    .bind(referrer.id, buyer?.first_name || '', now() - 3 * DAY)
    .first();
  const dupLimit = await numSet(db, 'ref_max_same_name', 2);
  if (dupLimit > 0 && Number(dupes?.c || 0) >= dupLimit) return { allow: false, why: 'name_cluster' };
  return { allow: true };
}

/* ═══════════════════ نظر و امتیاز ═══════════════════ */
export async function saveReview(db, { productId, userId, rating, text = '' }) {
  const r = Math.max(1, Math.min(5, Number(rating) || 5));
  const t = String(text || '').replace(/\r/g, '').slice(0, 280).trim();
  await db.prepare('INSERT INTO product_reviews (product_id,user_id,rating,text,created_at) VALUES (?,?,?,?,?) ON CONFLICT(product_id,user_id) DO UPDATE SET rating=excluded.rating, text=excluded.text, created_at=excluded.created_at')
    .bind(productId, userId, r, t, now())
    .run();
  await refreshProductRating(db, productId);
  return { ok: true, rating: r };
}

export async function refreshProductRating(db, productId) {
  const agg = await db.prepare('SELECT COUNT(*) c, AVG(rating) a FROM product_reviews WHERE product_id=?').bind(productId).first();
  const count = Number(agg?.c || 0);
  const avg = count ? Math.round((Number(agg.a) || 0) * 10) / 10 : 0;
  await db.prepare('UPDATE products SET review_count=?, review_avg=? WHERE id=?').bind(count, avg, productId).run();
  return { count, avg };
}

export async function topReviews(db, productId, limit = 4) {
  const r = await db
    .prepare('SELECT r.*, u.first_name, u.username FROM product_reviews r LEFT JOIN users u ON u.id=r.user_id WHERE r.product_id=? ORDER BY r.id DESC LIMIT ?')
    .bind(productId, Math.max(1, Math.min(10, Number(limit) || 4)))
    .all();
  return (r.results || []).map((x) => ({
    stars: '★'.repeat(Math.max(1, Math.min(5, Number(x.rating) || 5))) + '☆'.repeat(5 - Math.max(1, Math.min(5, Number(x.rating) || 5))),
    name: x.username ? '@' + x.username : String(x.first_name || 'کاربر').slice(0, 1).repeat(0) + (x.first_name || 'کاربر'),
    text: String(x.text || '').slice(0, 200),
    at: Number(x.created_at || 0),
  }));
}

export function reviewLine(p, reviews = []) {
  const n = Number(p.review_count || 0);
  if (!n) return '⭐ هنوز نظری ثبت نشده — اولین نفر باش!';
  const avg = Number(p.review_avg || 0);
  const head = `⭐ ${faDigits(avg.toFixed(1))} از ۵ (${faDigits(n)} نظر)`;
  if (!reviews.length) return head;
  return head + '\n' + reviews.map((r) => `• ${r.stars} ${esc(r.name)}${r.text ? ': ' + esc(r.text).slice(0, 90) : ''}`).join('\n');
}

/* ═══════════════════ علاقه‌مندی‌ها ═══════════════════ */
export async function toggleFavorite(db, userId, productId) {
  const exist = await db.prepare('SELECT 1 x FROM favorites WHERE user_id=? AND product_id=?').bind(userId, productId).first();
  if (exist) {
    await db.prepare('DELETE FROM favorites WHERE user_id=? AND product_id=?').bind(userId, productId).run();
    return { added: false };
  }
  await db.prepare('INSERT INTO favorites (user_id,product_id,created_at) VALUES (?,?,?)').bind(userId, productId, now()).run();
  return { added: true };
}
export const isFavorite = async (db, userId, productId) => !!(await db.prepare('SELECT 1 x FROM favorites WHERE user_id=? AND product_id=?').bind(userId, productId).first());
export async function favoriteProducts(db, userId) {
  const r = await db
.prepare('SELECT p.* FROM favorites f JOIN products p ON p.id=f.product_id WHERE f.user_id=? ORDER BY f.created_at DESC, p.id DESC LIMIT 20')
    .bind(userId)
    .all();
  return r.results || [];
}

/* ═══════════════════ شمارش معکوس انقضا ═══════════════════ */
export function countdownLine(sub, lang = 'fa') {
  const left = Number(sub?.expire_at || 0) - now();
  if (left <= 0) return '⌛ منقضی شده';
  const d = Math.floor(left / DAY);
  const h = Math.floor((left % DAY) / 3600);
  const m = Math.floor((left % 3600) / 60);
  const words = { fa: ['روز', 'ساعت', 'دقیقه'], en: ['d', 'h', 'm'], ar: ['يومان', 'ساعة', 'دقيقة'], ru: ['д', 'ч', 'мин'], tr: ['gün', 'saat', 'dk'] }[lang] || ['روز', 'ساعت', 'دقیقه'];
  const label = d > 0 ? `${faDigits(d)} ${words[0]} و ${faDigits(h)} ${words[1]}` : `${faDigits(h)} ${words[1]} و ${faDigits(m)} ${words[2]}`;
  const bar = (() => {
    const total = Math.max(1, Number(sub?.created_days || 1) * DAY);
    const pct = Math.max(0, Math.min(10, Math.round((left / total) * 10)));
    return `\n${'🟩'.repeat(pct)}${'⬜'.repeat(10 - pct)}`;
  })();
  const warn = left < 2 * DAY ? '⚠️ ' : '';
  return `${warn}⏳ ${label} مانده${bar}`;
}

/** مدت کل اشتراک (برای نوار پیشرفت) — از ساخت تا انقضا */
function daysOf(sub) {
  const span = Number(sub?.expire_at || 0) - Number(sub?.created_at || 0);
  const d = Math.round(span / DAY);
  return d > 0 && d < 3650 ? d : 30;
}

/* ═══════════════════ لینک چنددستگاهی ═══════════════════ */
export function deviceLinks(origin, token, count = 1) {
  const n = Math.max(1, Math.min(10, Number(count) || 1));
  const base = origin ? `${String(origin).replace(/\/$/, '')}/sub/${token}` : `/sub/${token}`;
  return Array.from({ length: n }, (_, i) => ({
    label: `📱 دستگاه ${faDigits(i + 1)}`,
    url: n === 1 ? base : `${base}?d=${i + 1}`,
  }));
}

/* ═══════════════════ گزارش فروش ═══════════════════ */
export async function salesSummary(db, sinceTs) {
  const orders = await db.prepare("SELECT COUNT(*) c, COALESCE(SUM(amount_toman),0) s FROM orders WHERE status='paid' AND paid_at>=?").bind(sinceTs).first();
  const pend = await db.prepare("SELECT COUNT(*) c FROM orders WHERE status='pending'").first();
  const rcpt = await db.prepare("SELECT COUNT(*) c FROM receipts WHERE status='pending'").first();
  const news = await db.prepare('SELECT COUNT(*) c FROM users WHERE created_at>=?').bind(sinceTs).first();
  const top = await db
    .prepare("SELECT title, COUNT(*) c, COALESCE(SUM(amount_toman),0) s FROM orders WHERE status='paid' AND paid_at>=? GROUP BY title ORDER BY s DESC LIMIT 3")
    .bind(sinceTs)
    .all();
  const dead = await db.prepare('SELECT COUNT(*) c FROM config_variants WHERE healthy=0 AND active=1').first().catch(() => null);
  const users = await db.prepare('SELECT COUNT(*) c FROM users').first();
  return {
    revenue: Number(orders?.s || 0),
    orders: Number(orders?.c || 0),
    pending: Number(pend?.c || 0),
    receipts: Number(rcpt?.c || 0),
    newUsers: Number(news?.c || 0),
    totalUsers: Number(users?.c || 0),
    deadVariants: Number(dead?.c || 0),
    top: (top.results || []).map((x) => ({ title: x.title, count: Number(x.c), sum: Number(x.s) })),
  };
}

export function reportText(kind, s) {
  const head = kind === 'weekly' ? '📊 گزارش هفتگی فروش' : '📊 گزارش روزانه فروش';
  return (
    `${head}\n\n` +
    `💰 درآمد: <b>${fmtToman(s.revenue)}</b>\n` +
    `🧾 سفارش پرداختی: ${faDigits(s.orders)}\n` +
    `🆕 کاربر جدید: ${faDigits(s.newUsers)} · 👥 کل کاربران: ${faDigits(s.totalUsers)}\n` +
    `⏳ سفارش در انتظار: ${faDigits(s.pending)} · 🧾 فیش در صف: ${faDigits(s.receipts)}\n` +
    (s.deadVariants ? `🔴 مسیر ناسالم فعال: ${faDigits(s.deadVariants)}\n` : `🟢 همهٔ مسیرهای فعال سالم‌اند\n`) +
    (s.top.length ? `\n🔥 پرفروش‌ها:\n${s.top.map((x, i) => `${faDigits(i + 1)}. ${esc(x.title || '—')} — ${faDigits(x.count)} عدد / ${fmtToman(x.sum)}`).join('\n')}` : '')
  );
}

export async function sendSalesReport(env, kind = 'daily') {
  const dayStart = Math.floor(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()) / 1000);
  const since = kind === 'weekly' ? dayStart - 6 * DAY : dayStart;
  const s = await salesSummary(env.DB, since);
  if ((await getSettingValue(env.DB, 'report_notify_zero')) !== '1' && s.orders === 0 && s.newUsers === 0) return { ok: true, skipped: true };
  const { notifyAdmins } = await import('./notify.js');
  await notifyAdmins(env, 'dailyReport', reportText(kind, s), null, { dedupe: `rep:${kind}:${todayUtc()}`, force: true });
  return { ok: true, revenue: s.revenue, orders: s.orders };
}

/** کرون: هر ۵ دقیقه یک‌بار — پچ‌های ارسال همگانی را جلو می‌برد */
export async function runBroadcastBatch(env, token, { batch = 25 } = {}) {
  const db = env.DB;
  const due = await db
    .prepare("SELECT * FROM broadcasts WHERE status IN ('queued','running') AND (at=0 OR at<=?) ORDER BY at ASC, id ASC LIMIT 3")
    .bind(now())
    .all();
  const rows = due.results || [];
  if (!rows.length) return { ran: 0 };
  const per = Math.max(1, Math.min(60, Number(batch) || 25));
  let ran = 0;
  for (const b of rows) {
    const id = Number(b.id);
    if (Number(b.total || 0) === 0) {
      const c = await db.prepare('SELECT COUNT(*) c FROM users WHERE banned=0').first();
      await db.prepare('UPDATE broadcasts SET total=?, status=\'running\' WHERE id=?').bind(Number(c?.c || 0), id).run();
    }
    const lastId = Number(b.sent || 0); // sent = مکان‌نما (آخرین user_id پردازش‌شده)
    const targets = (await db.prepare('SELECT id FROM users WHERE banned=0 AND id>? ORDER BY id ASC LIMIT ?').bind(lastId, per).all()).results || [];
    let ok = 0;
    for (const u of targets) {
      const r = token ? await send(token, u.id, b.text) : { ok: false };
      if (r?.ok) ok++;
      await db.prepare('UPDATE broadcasts SET sent=? WHERE id=?').bind(Number(u.id), id).run();
    }
    if (ok) await db.prepare('UPDATE broadcasts SET done = done + ? WHERE id=?').bind(ok, id).run();
    const left = (await db.prepare('SELECT COUNT(*) c FROM users WHERE banned=0 AND id>?').bind(lastId).first())?.c || 0;
    const remaining = Math.max(0, Number(left) - targets.length);
    if (!targets.length || remaining === 0) {
      await db.prepare("UPDATE broadcasts SET status='done', done=done, sent=? WHERE id=?").bind(Number(lastId) || 0, id).run();
      const doneRow = await db.prepare('SELECT * FROM broadcasts WHERE id=?').bind(id).first();
      const delivered = Number(doneRow?.done || 0);
      if (token && doneRow?.created_by) {
        await send(
          token,
          doneRow.created_by,
          `✅ ارسال همگانی #${faDigits(id)} تمام شد.\n📤 تحویل‌شده: <b>${faDigits(delivered)}</b> از <b>${faDigits(Number(doneRow?.total || 0))}</b> کاربر`
        );
      }
    } else if (ok === 0 && targets.length) {
      await db.prepare("UPDATE broadcasts SET status='paused', error='ارسال به همه ناموفق بود' WHERE id=?").bind(id).run();
    }
    ran++;
    if (targets.length < per) continue;
  }
  return { ran };
}

export async function queueBroadcast(db, { text, at = 0, by = 0, photo = '' }) {
  const body = String(text || '').slice(0, 3800);
  if (!body.trim()) return { ok: false, error: 'متن خالی است' };
  await db
    .prepare("INSERT INTO broadcasts (text,photo,at,sent,total,done,status,created_by,created_at) VALUES (?,?,?,0,0,0,?,?,?)")
    .bind(body, String(photo || '').slice(0, 200), Math.max(0, Number(at) || 0), 'queued', Number(by) || 0, now())
    .run();
  const last = await db.prepare('SELECT id FROM broadcasts ORDER BY id DESC LIMIT 1').first();
  return { ok: true, id: Number(last?.id || 0) };
}

export async function listBroadcasts(db, limit = 10) {
  const r = await db.prepare('SELECT * FROM broadcasts ORDER BY id DESC LIMIT ?').bind(Math.max(1, Math.min(30, Number(limit) || 10))).all();
  return (r.results || []).map((b) => ({
    id: Number(b.id),
    text: String(b.text || '').slice(0, 60),
    at: Number(b.at || 0),
    sent: Number(b.sent || 0),
    delivered: Number(b.done || 0),
    total: Number(b.total || 0),
    status: b.status,
  }));
}

/* ═══════════════════ صفحهٔ جوایز کاربر ═══════════════════ */
export async function openPerks(ctx) {
  const { db, token, user } = ctx;
  const scratch = await scratchState(db, user.id);
  const ck = await checkinState(db, user.id);
  const coupon = await personalCoupon(db, user.id);
  const favs = (await db.prepare('SELECT COUNT(*) c FROM favorites WHERE user_id=?').bind(user.id).first())?.c || 0;
  const sub = await db.prepare('SELECT * FROM subscriptions WHERE user_id=? AND active=1 ORDER BY expire_at DESC LIMIT 1').bind(user.id).first();
  const fresh = await getUser(db, user.id);
  const lines = [
    `🎁 <b>باشگاه جوایز شما</b>\n`,
    `🪙 سکه: <b>${faDigits(Number(fresh?.coins || 0))}</b> · 👛 کیف پول: ${fmtToman(Number(fresh?.balance || 0))}`,
    `📅 چک‌این امروز: ${ck.todayDone ? '✅ انجام شد' : '⬜ هنوز نه'} · رکورد: ${faDigits(ck.streak)} روز`,
    `${streakBars(ck.mask)}`,
    scratch.row?.won
      ? `🎟 کارت خراش امروز: باز شده (${prizeLabel(scratch.row.kind, scratch.row.value)})`
      : `🎟 کارت خراش امروز: <b>هنوز باز نکرده‌ای</b> 👇`,
    coupon ? `🏷 کوپن شخصی: <code>${coupon.code}</code> — ${coupon.kind === 'percent' ? faDigits(Number(coupon.value)) + '٪' : fmtToman(Number(coupon.value))}${Number(coupon.expires_at) ? ` تا ${fmtDate(Number(coupon.expires_at))}` : ''}` : '🏷 کوپن شخصی: غیرفعال',
    `❤️ علاقه‌مندی‌ها: ${faDigits(Number(favs))} محصول`,
    sub ? '\n' + countdownLine({ ...sub, created_days: daysOf(sub) }, user.lang || 'fa') : '\n⚠️ اشتراک فعالی نداری — «🎁 پروکسی و تست رایگان» را امتحان کن.',
  ];
  const rows = [
    [btn(scratch.row?.won ? '🎟 امروز باز شد' : '🎟 کارت خراش را بخراش', scratch.row?.won ? 'noop' : 'perk:scratch')],
    [btn(ck.todayDone ? '✅ چک‌این امروز ثبت شد' : '📅 چک‌این روزانه', ck.todayDone ? 'noop' : 'perk:checkin')],
  ];
  if (Number(favs)) rows.push([btn('❤️ لیست علاقه‌مندی‌ها', 'perk:favs')]);
  rows.push([btn('⭐ ثبت نظر برای آخرین محصول', 'perk:rev'), btn('🏷 کوپن‌های من', 'perk:coupon')]);
  return send(token, user.id, lines.join('\n'), { reply_markup: { inline_keyboard: rows }, disable_web_page_preview: true });
}

const prizeLabel = (kind, value) => (kind === 'coins' ? `🪙 ${faDigits(value)} سکه` : kind === 'amount' ? `👛 ${fmtToman(value)}` : kind === 'days' ? `⏳ ${faDigits(value)} روز` : '😶 بدون جایزه');

export async function handlePerkCallback(ctx, data) {
  const { db, token, user } = ctx;
  const act = data.slice(5);
  if (act === 'scratch') {
    const r = await scratchNow(ctx.env, user);
    await tg(token, 'answerCallbackQuery', { callback_query_id: ctx.cbId, text: r.ok ? '🎟 کارت باز شد!' : r.done ? 'امروز باز شده' : r.error || '' });
    if (r.ok) await send(token, user.id, `🎟 <b>کارت خراش شما</b>\n\n${prizeLabel(r.kind, r.value)}\n${esc(r.note || '')}`, { reply_markup: { inline_keyboard: [[btn('🎁 ادامهٔ جوایز', 'perk:menu')]] } });
    return;
  }
  if (act === 'checkin') {
    const r = await checkinNow(db, user.id);
    await tg(token, 'answerCallbackQuery', { callback_query_id: ctx.cbId, text: r.ok ? r.note : r.done ? 'امروز ثبت شده' : r.error || '' });
    return openPerks(ctx);
  }
  if (act === 'favs') {
    const list = await favoriteProducts(db, user.id);
    if (!list.length) return send(token, user.id, '❤️ هنوز محصولی را نشان نکرده‌اید.');
    const kb = { inline_keyboard: list.slice(0, 10).map((p) => [{ text: `🛍 ${p.title}`.slice(0, 60), callback_data: `prod:${p.id}` }]) };
    return send(token, user.id, `❤️ <b>علاقه‌مندی‌های شما</b> (${faDigits(list.length)})`, { reply_markup: kb });
  }
  if (act === 'coupon') {
    const list = await myCoupons(db, user.id);
    if (!list.length) return send(token, user.id, '🏷 کوپنی ندارید. از «🎁 باشگاه جوایز» کوپن شخصی‌تان را ببینید.');
    return send(
      token,
      user.id,
      `🏷 <b>کوپن‌های شما</b>\n\n` +
        list.map((c) => `• <code>${esc(c.code)}</code> — ${c.percent ? faDigits(c.percent) + '٪' : fmtToman(c.amount)}${c.expires ? ` · تا ${fmtDate(c.expires)}` : ''}${c.active ? '' : ' · غیرفعال'}`).join('\n') +
        `\n\n👈 هنگام خرید، کد را با دستور <code>/coupon کد</code> یا از دکمهٔ «🏷 کد تخفیف» استفاده کنید.`,
      { disable_web_page_preview: true }
    );
  }
  if (act === 'rev') {
    const last = await db.prepare("SELECT product_id FROM orders WHERE user_id=? AND status='paid' AND product_id>0 ORDER BY id DESC LIMIT 1").bind(user.id).first();
    if (!last) return send(token, user.id, '⭐ فقط بعد از یک خرید موفق می‌توانید نظر بدهید.');
    const p = await db.prepare('SELECT title FROM products WHERE id=?').bind(last.product_id).first();
    const rows = [[1, 2, 3], [4, 5]].map((r) => r.map((n) => ({ text: '★'.repeat(n) + '☆'.repeat(5 - n), callback_data: `rev:${last.product_id}:${n}` })));
    return send(token, user.id, `⭐ برای «<b>${esc(p?.title || 'محصول')}</b>» امتیاز بدهید:`, { reply_markup: { inline_keyboard: rows } });
  }
  if (act === 'menu') return openPerks(ctx);
  return tg(token, 'answerCallbackQuery', { callback_query_id: ctx.cbId });
}

export async function handleReviewStars(ctx, data) {
  const [, pid, rating] = String(data).split(':');
  const p = await ctx.db.prepare('SELECT id,title FROM products WHERE id=?').bind(Number(pid)).first();
  if (!p) return send(ctx.token, ctx.user.id, '⛔ محصول پیدا نشد.');
  await saveReview(ctx.db, { productId: p.id, userId: ctx.user.id, rating: Number(rating), text: '' });
  await send(ctx.token, ctx.user.id, `⭐ امتیاز ${faDigits(rating)} از ۵ برای «${esc(p.title)}» ثبت شد. ممنون! 🙏\nاگر بخواهید می‌توانید متن نظر را هم همینجا بفرستید (حالت نظر فعال شد).`);
  await set(ctx.db, `review_mode:${ctx.user.id}`, String(p.id));
}

/** اگر کاربر در حالت «⌨️ حالت نظر» پیام بفرستد، روی آخرین خرید ثبت می‌شود */
export async function maybeHandleReviewText(ctx, text) {
  const key = `review_mode:${ctx.user.id}`;
  const pid = Number(await getSettingValue(ctx.db, key));
  if (!pid) return false;
  const last = await ctx.db.prepare("SELECT product_id FROM orders WHERE user_id=? AND status='paid' AND product_id>0 ORDER BY id DESC LIMIT 1").bind(ctx.user.id).first();
  if (!last) return false;
  await saveReview(ctx.db, { productId: last.product_id, userId: ctx.user.id, rating: 5, text });
  await ctx.db.prepare('DELETE FROM settings WHERE key=?').bind(key).run();
  await send(ctx.token, ctx.user.id, '✅ نظر شما ثبت شد و روی صفحهٔ محصول نمایش داده می‌شود. مرسی! 🙏');
  return true;
}

/* ═══════════════════ تنظیمات مالک در تلگرام ═══════════════════ */
export async function perksAdminPage(ctx) {
  const db = ctx.db;
  const g = async (k, d) => String((await getSettingValue(db, k)) ?? '') || String(d);
  const rows = [
    [btn((await g('scratch_enabled', '1')) === '1' ? '🎟 کارت خراش: روشن' : '🎟 کارت خراش: خاموش', 'atog:scratch_enabled')],
    [btn((await g('checkin_enabled', '1')) === '1' ? '📅 چک‌این: روشن' : '📅 چک‌این: خاموش', 'atog:checkin_enabled'), btn((await g('personal_coupon_enabled', '1')) === '1' ? '🏷 کوپن شخصی' : '🏷 کوپن شخصی: خاموش', 'atog:personal_coupon_enabled')],
    [btn((await g('ref_anti_abuse', '1')) === '1' ? '🛡 ضدسوءاستفاده رفرال: روشن' : '🛡 ضدسوءاستفاده رفرال: خاموش', 'atog:ref_anti_abuse')],
    [btn((await g('report_daily_enabled', '1')) === '1' ? '📊 گزارش روزانه: ارسال می‌شود' : '📊 گزارش روزانه: خاموش', 'atog:report_daily_enabled'), btn((await g('report_weekly_enabled', '1')) === '1' ? '📈 هفتگی: روشن' : '📈 هفتگی: خاموش', 'atog:report_weekly_enabled')],
    [btn((await g('group_buy_enabled', '1')) === '1' ? '🛍 خرید در گروه: روشن' : '🛍 خرید در گروه: خاموش', 'atog:group_buy_enabled'), btn((await g('group_ai_enabled', '1')) === '1' ? '🤖 AI گروه' : '🤖 AI گروه: خاموش', 'atog:group_ai_enabled')],
    [btn((await g('glass_enabled', '1')) === '1' ? '🧪 پست شیشه‌ای: روشن' : '🧪 پست شیشه‌ای: خاموش', 'atog:glass_enabled'), btn((await g('glass_auto_post', '0')) === '1' ? '🧲 انتشار خودکار inline' : '🧲 انتشار خودکار: خاموش', 'atog:glass_auto_post')],
    [btn('🧪 پست‌های شیشه‌ای (مدیریت)', 'gladm:list'), btn('🗒 لاگ ادمین', 'adm:audit')],
    [btn('🎟 تولید انبوه کوپن', 'adm:couponbulk'), btn('📣 صف ارسال همگانی', 'adm:bclist')],
    [btn('🧾 گزارش امروز (الان بفرست)', 'adm:report:0'), btn('📈 گزارش ۷ روز (الان بفرست)', 'adm:report:7')],
  ];
  const s = await salesSummary(db, Math.floor(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()) / 1000));
  const text =
    `🎛 <b>پنل جوایز، گروه و گزارش‌ها</b>\n\n` +
    `💰 فروش امروز: ${fmtToman(s.revenue)} از ${faDigits(s.orders)} سفارش\n` +
    `🆕 کاربر امروز: ${faDigits(s.newUsers)} · ⏳ سفارش معلق: ${faDigits(s.pending)} · 🧾 فیش در صف: ${faDigits(s.receipts)}\n\n` +
    `سقف خرید روزانه هر کاربر (سفارش): <code>${faDigits(await numSet(db, 'user_daily_orders', 0))}</code> — ۰ یعنی نامحدود\n` +
    `سقف مبلغ روزانه هر کاربر: ${fmtToman(await numSet(db, 'user_daily_toman', 0))}\n` +
    `کد تخفیف گروهی: <code>${esc(await g('group_coupon_code', '')) || '—'}</code> · تخفیف گروهی: ${faDigits(await numSet(db, 'group_discount_percent', 0))}٪\n` +
    `سقف روزانهٔ پست شیشه‌ای: ${faDigits(await numSet(db, 'glass_daily_limit', 0))} · حداکثر دکمه: ${faDigits(await numSet(db, 'glass_max_buttons', 6))}\n\n` +
    `⌨️ با دکمه‌ها روشن/خاموش کنید؛ برای مقدار عددی از «⚙️ تنظیمات» پنل وب استفاده کنید.`;
  return send(ctx.token, ctx.user.id, text, { reply_markup: { inline_keyboard: rows }, disable_web_page_preview: true });
}

export { set as perksSetSetting, numSet };
