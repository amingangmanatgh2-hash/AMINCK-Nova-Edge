// ═══════════════════════════════════════════════════════════════════
//  بخش ۱ — مخزن IP تمیز با سنجش واقعی از داخل ایران
//
//  ⚠️ نکتهٔ کلیدی (صادقانه):
//   Worker داخل دیتاسنتر خارج از ایران اجرا می‌شود، پس هر تستی که «خود
//   Worker» انجام دهد هیچ ربطی به کیفیت اتصال از نت ملی ندارد و ICMP/ping
//   هم روی Workers وجود ندارد. تنها جایی که کد ما داخل ایران اجرا می‌شود،
//   مینی‌اپ تلگرام روی گوشی کاربر است. بنابراین:
//     • GET /api/probe/targets → چند IP کاندید (چرخشی، وزن‌دار)
//     • کاربر در مینی‌اپ با fetch/Image/WebSocket درخواست کوچک با timeout
//       کوتاه می‌زند و زمان را اندازه می‌گیرد
//     • POST /api/probe/report با initData معتبر → ذخیرهٔ نتیجه + امتیاز
//
//   پروب مرورگر/وب‌اپ محدودیت دارد (CORS روی دامنه‌های دلخواه معمولاً رد
//   می‌شود؛ اتصال واقعی TLS و مسیر اپراتور را کامل نمی‌سنجد) و فقط
//   «تاخیر رسیدن به آن IP از شبکهٔ اپراتور کاربر» را تقریب می‌زند — نه
//   توان عملیاتی واقعی کانفیگ را.
// ═══════════════════════════════════════════════════════════════════
import { todayStr, faDigits, getUser } from './db.js';
import { getNum, isEnabled } from './texts.js';
import { clamp, verifyInitData, json } from './util.js';
import { isValidHost, isValidPort } from './proxy.js';

const now = () => Math.floor(Date.now() / 1000);

/** خانوادهٔ آدرس (v4/v6) */
export function familyOf(ip) {
  return String(ip || '').includes(':') ? 'v6' : 'v4';
}

/** تجزیهٔ متن چندخطی «ip:port» (جداکننده: خط جدید، فاصله، ویرگول، نقطه‌ویرگول) */
export function parseIpEntries(text) {
  const out = [];
  for (const token of String(text || '').split(/[\s,;]+/)) {
    const t = token.trim();
    if (!t) continue;
    const m = t.match(/^([^:]+):(\d+)$/);
    if (m) out.push({ ip: m[1], port: Number(m[2]) });
    else out.push({ ip: t, port: 443 });
  }
  return out;
}

/** نمونه‌برداری تصادفی از داخل یک رنج CIDR (IPv4) */
export function sampleCidr(cidr, n = 1) {
  const m = String(cidr || '').trim().match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/);
  if (!m) return [];
  const base = m[1].split('.').map(Number);
  if (base.some((o) => o > 255)) return [];
  const prefix = Number(m[2]);
  if (prefix < 8 || prefix > 30) return [];
  const ipInt = (((base[0] << 24) | (base[1] << 16) | (base[2] << 8) | base[3]) >>> 0);
  const hostBits = 32 - prefix;
  const total = Math.pow(2, hostBits);
  // پنجرهٔ نمونه محدود به ۶۵۵۳۴ آدرس اول تا حلقهٔ سنگین نشود
  const start = ipInt + 1;
  const end = ipInt + Math.min(total - 2, 65534);
  const out = [];
  for (let i = 0; i < n; i++) {
    const r = start + Math.floor(Math.random() * (end - start + 1));
    out.push(`${(r >>> 24) & 255}.${(r >>> 16) & 255}.${(r >>> 8) & 255}.${r & 255}`);
  }
  return out;
}

/**
 * امتیازدهی — تابع خالص و قابل تست:
 *   نرخ موفقیت × ۱۰۰ + وزن تعداد نمونه − جریمهٔ تاخیر − جریمهٔ شکست پیاپی
 */
export function scoreOf(s) {
  const samples = Number(s.samples || 0);
  const success = Number(s.success_rate || 0);
  const avg = Number(s.avg_ms || 0);
  const consec = Number(s.consecutive_fail || 0);
  const latencyPenalty = avg > 0 ? Math.round(avg / 20) : 0;
  const confidence = Math.min(samples, 50) * 0.2;
  return Math.round((success * 100 + confidence - latencyPenalty - consec * 5) * 10) / 10;
}

/** مرزهای IQR برای حذف مقادیر پرت */
export function iqrBounds(values) {
  const a = (values || []).map(Number).filter(Number.isFinite).sort((x, y) => x - y);
  if (a.length < 4) return null;
  const q1 = a[Math.floor(a.length * 0.25)];
  const q3 = a[Math.floor(a.length * 0.75)];
  const iqr = q3 - q1;
  return { lo: q1 - 1.5 * iqr, hi: q3 + 1.5 * iqr };
}

async function computeP95(db, ipId) {
  const rows = (await db.prepare('SELECT ms FROM probe_reports WHERE ip_id=? AND ok=1 ORDER BY id DESC LIMIT 100').bind(ipId).all()).results;
  const vals = rows.map((r) => Number(r.ms)).filter((v) => v > 0).sort((a, b) => a - b);
  if (!vals.length) return 0;
  const idx = Math.min(vals.length - 1, Math.floor(vals.length * 0.95));
  return vals[idx];
}

/** افزودن دسته‌ای IP به مخزن (بدون تکراری؛ فقط آدرس معتبر) */
export async function addCleanIps(env, entries, source = 'manual') {
  const { DB } = env;
  let n = 0;
  for (const e of entries || []) {
    const ip = String(e.ip || '').trim();
    if (!isValidHost(ip)) continue; // هاست نمونه/جعلی هم رد می‌شود
    const dup = await DB.prepare('SELECT 1 x FROM clean_ips WHERE ip=?').bind(ip).first();
    if (dup) continue;
    const port = isValidPort(Number(e.port)) ? Number(e.port) : 443;
    await DB.prepare(
      'INSERT INTO clean_ips (ip, port, family, source, sni, note, colo, added_at, active) VALUES (?,?,?,?,?,?,?,?,1)'
    ).bind(ip, port, familyOf(ip), source, String(e.sni || ''), String(e.note || ''), String(e.colo || ''), now()).run();
    n++;
  }
  return n;
}

/** ایمپورت رنج رسمی Cloudflare + نمونه‌برداری تصادفی از داخل رنج‌ها */
export async function importCloudflareRanges(env, sampleCount = 200) {
  const [v4, v6] = await Promise.all([
    fetch('https://www.cloudflare.com/ips-v4', { signal: AbortSignal.timeout(8000) }).then((r) => r.text()),
    fetch('https://www.cloudflare.com/ips-v6', { signal: AbortSignal.timeout(8000) }).then((r) => r.text()),
  ]);
  const cidrs = [...v4.split(/\s+/), ...v6.split(/\s+/)].filter(Boolean);
  const picks = [];
  const perRange = Math.max(1, Math.ceil(sampleCount / Math.max(1, cidrs.length)));
  for (const cidr of cidrs) picks.push(...sampleCidr(cidr, perRange));
  const entries = picks.slice(0, sampleCount).map((ip) => ({ ip, port: 443 }));
  return addCleanIps(env, entries, 'cloudflare_range');
}

/** ایمپورت از URL دلخواه (لیست ip:port) */
export async function importFromUrl(env, url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const body = await res.text();
  return addCleanIps(env, parseIpEntries(body), 'url_import');
}

/** چند IP کاندید برای پروب — چرخشی و وزن‌دار بر اساس امتیاز */
export async function probeTargets(env, n = 6) {
  const { DB } = env;
  if (!(await isEnabled(DB, 'probe_enabled'))) return [];
  const pool = (await DB.prepare('SELECT * FROM clean_ips WHERE active=1 ORDER BY score DESC').all()).results
    .filter((r) => !r.blocked_until || r.blocked_until <= now());
  if (!pool.length) return [];
  const out = [];
  const used = new Set();
  for (let k = 0; k < n && used.size < pool.length; k++) {
    const weights = pool.map((r) => (used.has(r.id) ? 0 : Math.max(0.5, Number(r.score || 0) + 0.5)));
    const total = weights.reduce((s, w) => s + w, 0);
    let r = Math.random() * total;
    let pick = pool[pool.length - 1];
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r <= 0) {
        pick = pool[i];
        break;
      }
    }
    used.add(pick.id);
    out.push({ id: pick.id, ip: pick.ip, port: pick.port, family: pick.family, sni: pick.sni, score: pick.score, samples: pick.samples });
  }
  return out;
}

/**
 * ثبت گزارش پروب کاربر (با initData معتبر در لایهٔ بالاتر احراز شده).
 * ضد تقلب: سقف روزانه، تشخیص گزارش تکراری، حذف مقادیر پرت با IQR،
 * حداقل نمونه قبل از معتبر شمردن امتیاز. کاربر بابت گزارش معتبر سکه می‌گیرد.
 */
export async function applyProbeReport(env, user, body) {
  const { DB } = env;
  const day = todayStr();
  const ipId = Number(body.ip_id ?? body.ipId ?? 0);
  const ms = clamp(Math.round(Number(body.ms) || 0), 0, 60000);
  const ok = !(body.ok === false || body.ok === 0);
  const operator = String(body.operator || 'unknown').slice(0, 30);

  if (!(await isEnabled(DB, 'probe_enabled'))) return { ok: false, reason: 'disabled' };
  const ipRow = await DB.prepare('SELECT * FROM clean_ips WHERE id=?').bind(ipId).first();
  if (!ipRow) return { ok: false, reason: 'notfound' };
  if (Number(ipRow.blocked_until || 0) > now()) return { ok: false, reason: 'blocked' };

  const cap = await getNum(DB, 'probe_daily_cap', 30);
  const todayCount = (await DB.prepare('SELECT COUNT(*) c FROM probe_reports WHERE user_id=? AND day_key=?').bind(user.id, day).first())?.c || 0;
  if (todayCount >= cap) return { ok: false, reason: 'daily_cap' };

  const fp = `${user.id}:${ipId}:${ms}:${ok ? 1 : 0}`;
  const dup = await DB.prepare('SELECT 1 x FROM probe_reports WHERE user_id=? AND ip_id=? AND fp=? AND created_at>?').bind(user.id, ipId, fp, now() - 60).first();
  if (dup) return { ok: false, reason: 'duplicate' };

  let outlier = false;
  if (ok) {
    const recent = (await DB.prepare('SELECT ms FROM probe_reports WHERE ip_id=? AND ok=1 ORDER BY id DESC LIMIT 30').bind(ipId).all()).results.map((r) => Number(r.ms));
    const b = iqrBounds(recent);
    if (b && recent.length >= 4 && (ms < b.lo || ms > b.hi)) outlier = true;
  }

  await DB.prepare('INSERT INTO probe_reports (user_id, ip_id, operator, ms, ok, day_key, fp, created_at) VALUES (?,?,?,?,?,?,?,?)')
    .bind(user.id, ipId, operator, ms, ok ? 1 : 0, day, fp, now()).run();

  if (outlier) return { ok: false, reason: 'outlier', ms };

  const s = ipRow;
  const samples = Number(s.samples || 0);
  const alpha = samples === 0 ? 1 : 0.2;
  const avg = samples === 0 ? ms : Math.round((Number(s.avg_ms || 0) * (1 - alpha) + ms * alpha) * 10) / 10;
  const successRate = samples === 0 ? (ok ? 1 : 0) : Math.round((Number(s.success_rate || 0) * (1 - alpha) + (ok ? 1 : 0) * alpha) * 1000) / 1000;
  const consec = ok ? 0 : Number(s.consecutive_fail || 0) + 1;
  const failCount = Number(s.fail_count || 0) + (ok ? 0 : 1);
  const p95 = await computeP95(DB, ipId);
  const newScore = scoreOf({ samples: samples + 1, avg_ms: avg, success_rate: successRate, consecutive_fail: consec });

  // مدارشکن: شکست پیاپی → خروج موقت از چرخه (نه مرگ دائمی)
  let active = Number(s.active || 0);
  let blockedUntil = Number(s.blocked_until || 0);
  if (consec >= 5) {
    active = 0;
    blockedUntil = now() + 3600;
  }

  await DB.prepare(
    'UPDATE clean_ips SET samples=?, avg_ms=?, p95_ms=?, success_rate=?, fail_count=?, consecutive_fail=?, score=?, last_ok_at=?, active=?, blocked_until=? WHERE id=?'
  ).bind(samples + 1, avg, p95, successRate, failCount, consec, newScore, ok ? now() : Number(s.last_ok_at || 0), active, blockedUntil, ipId).run();

  const reward = await getNum(DB, 'probe_reward_coins', 5);
  if (reward > 0) await DB.prepare('UPDATE users SET coins = coins + ? WHERE id=?').bind(reward, user.id).run();

  return { ok: true, reward, score: newScore };
}

/** «اعمال بهترین‌ها روی سرورها» — ستون servers.clean_ip فقط؛ ساختار سرور دست نمی‌خورد */
export async function applyBestCleanIps(env, protocol, limit = 10) {
  const { DB } = env;
  const rows = (await DB.prepare('SELECT * FROM clean_ips WHERE active=1 ORDER BY score DESC LIMIT ?').bind(Math.min(100, Math.max(1, limit))).all()).results;
  const servers = (await DB.prepare('SELECT * FROM servers WHERE protocol=? AND active=1 ORDER BY speed_rank ASC').bind(protocol).all()).results;
  let n = 0;
  for (let i = 0; i < servers.length && i < rows.length; i++) {
    await DB.prepare('UPDATE servers SET clean_ip=? WHERE id=?').bind(rows[i].ip, servers[i].id).run();
    n++;
  }
  return n;
}

/** بازگرداندن IPهایی که مدارشکن‌شان تمام شده (خود-ترمیمی در کرون) */
export async function recoverBlockedIps(env) {
  await env.DB.prepare('UPDATE clean_ips SET active=1, consecutive_fail=0, blocked_until=0 WHERE active=0 AND blocked_until>0 AND blocked_until<=?').bind(now()).run();
}

/**
 * نگهداری مخزن IP در کرون:
 *   • بازگرداندن مدارشکن‌های تمام‌شده
 *   • غیرفعال‌سازی خودکار IP با نرخ موفقیت پایین (فقط اگر ادمین فعال کرده باشد)
 *   • هشدار کمبود IP سالم به ادمین (از طریق تنظیم clean_ip_alert)
 */
export async function cleanIpMaintenance(env) {
  const { DB } = env;
  await recoverBlockedIps(env);
  if ((await isEnabled(DB, 'clean_ip_auto_manage'))) {
    await DB.prepare('UPDATE clean_ips SET active=0 WHERE active=1 AND samples>=10 AND success_rate<0.5').run();
  }
  const healthy = (await DB.prepare('SELECT COUNT(*) c FROM clean_ips WHERE active=1').first())?.c || 0;
  const minHealthy = await getNum(DB, 'clean_ip_min_healthy', 3);
  const prevAlert = await DB.prepare("SELECT value FROM settings WHERE key='clean_ip_alert'").first();
  if (healthy < minHealthy && (prevAlert?.value || '') !== `low:${healthy}`) {
    await DB.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
      .bind('clean_ip_alert', `low:${healthy}`).run();
  } else if (healthy >= minHealthy) {
    await DB.prepare("DELETE FROM settings WHERE key='clean_ip_alert'").run();
  }
  return { healthy, minHealthy };
}

/**
 * هندلر POST /api/probe/report — احراز initData تلگرام و ثبت گزارش.
 * ⛔ گزارش ناشناس/جعلی ثبت نمی‌شود.
 */
export async function probeReport(env, request) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'بدنهٔ نامعتبر.' }, 400);
  }
  const tgUser = await verifyInitData(body?.initData || '', env.TELEGRAM_BOT_TOKEN);
  if (!tgUser) return json({ ok: false, error: 'unauthorized' }, 403);
  const user = await getUser(env.DB, tgUser.id);
  if (!user || user.banned) return json({ ok: false, error: 'unauthorized' }, 403);
  const res = await applyProbeReport(env, user, body);
  return json(res);
}

/** قالب نمایشی برای پنل */
export function cleanIpDto(r) {
  return {
    id: r.id,
    ip: r.ip,
    port: r.port,
    family: r.family,
    source: r.source,
    sni: r.sni || '',
    note: r.note || '',
    colo: r.colo || '',
    score: r.score,
    samples: r.samples,
    avg_ms: r.avg_ms,
    p95_ms: r.p95_ms,
    success_rate: r.success_rate,
    fail_count: r.fail_count,
    consecutive_fail: r.consecutive_fail,
    active: !!r.active,
    blocked_until: r.blocked_until,
    added_at: r.added_at,
  };
}
