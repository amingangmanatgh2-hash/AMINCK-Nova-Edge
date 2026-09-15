// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — بخش «کانفیگ رایگان و نامحدود» (مخصوص نت ایران)
//
//  ⚠️ صادقانه و مهم:
//   این ماژول *زیرساخت* توزیع کانفیگ است (افزودن/ویرایش/سلامت/بازخورد/ساب/QR).
//   هیچ سرور پروکسی واقعی از طرف این پروژه ارائه نمی‌شود — چون ساختن
//   «کانفیگ رایگان و نامحدود» نیازمند سرور و پهنای باند واقعی است و از داخل
//   یک ورکر سرورلس ممکن نیست. ادمین باید سرور/کانفیگ واقعی خودش را وارد کند؛
//   تا وقتی کانفیگ واقعی فعال نباشد، صفحه به‌جای نمایش کانفیگ جعلی، وضعیت
//   «به‌زودی» و راهنمای اتصال را نشان می‌دهد (kill-switch، مثل بقیهٔ پروژه).
//
//   سلامت مسیرها هم از ورکر (خارج ایران) فقط یک سیگنال نسبی است؛ سیگنال اصلی
//   بازخورد ✔/✖ خود کاربران از داخل ایران است.
// ═══════════════════════════════════════════════════════════════════
import { mcGet, mcBool, mcNum, pushAlert } from './db.js';
import { json } from '../util.js';

const now = () => Math.floor(Date.now() / 1000);

export const PROTOCOLS = ['vless', 'vmess', 'trojan', 'ss', 'shadowsocks', 'wireguard', 'hy2', 'tuic', 'socks', 'http'];

/** پارس و اعتبارسنجی URI کانفیگ */
export function parseConfigUri(uri) {
  const u = String(uri || '').trim();
  if (!u.includes('://')) return { ok: false, error: 'قالب URI نامعتبر' };
  const [proto, rest] = u.split('://');
  const p = String(proto).toLowerCase();
  if (!PROTOCOLS.includes(p)) return { ok: false, error: `پروتکل پشتیبانی‌نشده: ${p}` };
  let host = '';
  let port = 0;
  let remark = '';
  let security = '';
  try {
    if (p === 'vmess') {
      // vmess base64 JSON
      const b64 = rest.split('#')[0];
      const jsonStr = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
      const o = JSON.parse(jsonStr);
      host = o.add || o.host || '';
      port = Number(o.port) || 0;
      remark = o.ps || '';
      security = o.tls === 'tls' ? 'tls' : o.net || '';
    } else {
      const hashIdx = rest.indexOf('#');
      if (hashIdx >= 0) remark = decodeURIComponent(rest.slice(hashIdx + 1));
      const body = hashIdx >= 0 ? rest.slice(0, hashIdx) : rest;
      const qIdx = body.indexOf('?');
      const params = new URLSearchParams(qIdx >= 0 ? body.slice(qIdx + 1) : '');
      const withoutQuery = qIdx >= 0 ? body.slice(0, qIdx) : body;
      const atIdx = withoutQuery.lastIndexOf('@');
      const hostPort = atIdx >= 0 ? withoutQuery.slice(atIdx + 1) : withoutQuery;
      const [h, pt] = hostPort.includes(']:') ? [hostPort.slice(0, hostPort.lastIndexOf(':')), hostPort.slice(hostPort.lastIndexOf(':') + 1)] : hostPort.split(':');
      host = String(h || '').replace(/[[\]]/g, '');
      port = Number(pt) || 0;
      security = params.get('security') || params.get('tls') || (params.get('pbk') ? 'reality' : '');
      if (params.get('pbk')) security = 'reality';
    }
  } catch {
    return { ok: false, error: 'پارس URI ناموفق بود' };
  }
  if (!host) return { ok: false, error: 'هاست پیدا نشد' };
  if (!port || port < 1 || port > 65535) return { ok: false, error: 'پورت نامعتبر' };
  return { ok: true, protocol: p, host, port, remark, security, uri: u };
}

/** افزودن کانفیگ (تکی یا گروهی) */
export async function addConfigs(db, { text = '', protocol = '', country = '', tier = 'free', unlimited = 1, note = '' }) {
  const lines = String(text)
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter((l) => l.includes('://'));
  if (!lines.length) return { ok: false, error: 'هیچ URI معتبری پیدا نشد' };
  const added = [];
  const rejected = [];
  for (const line of lines) {
    const parsed = parseConfigUri(line);
    if (!parsed.ok) {
      rejected.push({ uri: line.slice(0, 60), error: parsed.error });
      continue;
    }
    const dup = await db.prepare('SELECT id FROM mc_configs WHERE uri=?').bind(line).first();
    if (dup) {
      rejected.push({ uri: line.slice(0, 60), error: 'تکراری' });
      continue;
    }
    await db
      .prepare('INSERT INTO mc_configs (name, protocol, uri, country, tier, unlimited, active, healthy, sort, note, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .bind(parsed.remark || parsed.host, protocol || parsed.protocol, line, country, tier, unlimited ? 1 : 0, 1, 1, 0, String(note).slice(0, 200), now())
      .run();
    added.push({ host: parsed.host, protocol: parsed.protocol, remark: parsed.remark, security: parsed.security });
  }
  if (added.length) await pushAlert(db, 'config_added', `${added.length} کانفیگ ${tier} اضافه شد`, 1);
  return { ok: true, added, rejected, added_count: added.length };
}

/** ایمپورت از یک آدرس ساب (اگر ادمین بخواهد از منبع خودش بگیرد) */
export async function importFromUrl(db, url, opts = {}) {
  try {
    const res = await fetch(String(url), { headers: { 'User-Agent': 'NovaEdge/1.0' } });
    let bodyText = await res.text();
    if (!bodyText.includes('://')) {
      try {
        bodyText = atob(bodyText.trim());
      } catch {}
    }
    return await addConfigs(db, { ...opts, text: bodyText });
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 160) };
  }
}

export async function listConfigs(db, { tier = 'free', activeOnly = true } = {}) {
  const sql = `SELECT * FROM mc_configs WHERE tier=?${activeOnly ? ' AND active=1' : ''} ORDER BY healthy DESC, (fb_up - fb_down) DESC, sort ASC, id DESC`;
  const rows = await db.prepare(sql).bind(tier).all();
  return (rows.results || []).map(configDto);
}

export function configDto(c) {
  const fbUp = Number(c.fb_up) || 0;
  const fbDown = Number(c.fb_down) || 0;
  const total = fbUp + fbDown;
  const score = total >= 3 ? Math.round((fbUp / total) * 100) : null;
  return {
    id: c.id,
    name: c.name,
    protocol: c.protocol,
    country: c.country,
    tier: c.tier,
    unlimited: !!c.unlimited,
    active: !!c.active,
    healthy: !!c.healthy,
    latency_ms: c.latency_ms || null,
    last_check: c.last_check,
    uses: c.uses,
    feedback: { up: fbUp, down: fbDown, score },
    note: c.note,
    uri: c.uri,
  };
}

export const hideUri = (uri) => {
  const p = parseConfigUri(uri);
  return p.ok ? `${p.protocol}://${p.host}:${p.port}#${encodeURIComponent(p.remark || '')}` : String(uri).slice(0, 24) + '…';
};

/** بازخورد کاربر (تنها سیگنال واقعی از داخل ایران) */
export async function configFeedback(db, { id, ok, ipk = '' }) {
  const row = await db.prepare('SELECT * FROM mc_configs WHERE id=?').bind(Number(id)).first();
  if (!row) return { ok: false, error: 'کانفیگ پیدا نشد' };
  const col = ok ? 'fb_up' : 'fb_down';
  await db.prepare(`UPDATE mc_configs SET ${col}=${col}+1 WHERE id=?`).bind(row.id).run();
  const up = Number(row.fb_up) + (ok ? 1 : 0);
  const down = Number(row.fb_down) + (ok ? 0 : 1);
  if (up + down >= 5 && up / (up + down) < 0.3 && row.healthy) {
    await db.prepare('UPDATE mc_configs SET healthy=0 WHERE id=?').bind(row.id).run();
    await pushAlert(db, 'config_dead', `کانفیگ ${row.name} با بازخورد کاربران غیرسالم شد (${up}/${up + down})`, 2);
  }
  return { ok: true, up, down };
}

/**
 * بررسی سلامت از ورکر — فقط HTTP(S)/CDN-based مسیرها قابل سنجش‌اند.
 * برای TCP خام (پورت‌های VLESS) ورکر دسترسی ندارد؛ این محدودیت را صادقانه
 * در خروجی گزارش می‌کنیم تا ادمین گمراه نشود.
 */
export async function probeConfig(c, { timeoutMs = 6000 } = {}) {
  const p = parseConfigUri(c.uri);
  if (!p.ok) return { ok: false, reason: 'invalid_uri', checked: false };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const started = Date.now();
  try {
    // تلاش برای رسیدن به هاست روی 443 (اگر CDN/TLS باشد پاسخ می‌دهد)
    const res = await fetch(`https://${p.host}:443/`, { method: 'HEAD', signal: ctrl.signal, redirect: 'manual' }).catch(() => null);
    const ms = Date.now() - started;
    if (res) return { ok: true, reason: 'https_reachable', latency_ms: ms, checked: true };
    return { ok: null, reason: 'tcp_not_testable_from_worker', checked: false, latency_ms: ms };
  } catch (e) {
    return { ok: null, reason: String(e).slice(0, 60), checked: false };
  } finally {
    clearTimeout(t);
  }
}

export async function checkAllConfigs(db, limit = 12) {
  const rows = await db.prepare('SELECT * FROM mc_configs WHERE active=1 ORDER BY id DESC LIMIT ?').bind(limit).all();
  const out = [];
  for (const c of rows.results || []) {
    const r = await probeConfig(c);
    if (r.checked) {
      await db.prepare('UPDATE mc_configs SET last_check=?, latency_ms=?, healthy=? WHERE id=?').bind(now(), r.latency_ms || 0, r.ok ? 1 : 0, c.id).run();
    } else {
      await db.prepare('UPDATE mc_configs SET last_check=? WHERE id=?').bind(now(), c.id).run();
    }
    out.push({ id: c.id, name: c.name, ...r });
  }
  return out;
}

/** خروجی اشتراک (ساب) سازگار با v2rayNG / v2rayN / Streisand */
export async function subscriptionText(db, { tier = 'free', limit = 40 } = {}) {
  const list = await listConfigs(db, { tier });
  const uris = list.filter((c) => c.active && c.healthy !== false).slice(0, limit).map((c) => c.uri);
  return uris.join('\n') + (uris.length ? '\n' : '');
}

/** وضعیت بخش کانفیگ‌ها برای سایت (بدون لو رفتن URI در حالت قفل) */
export async function configsPublic(db) {
  const enabled = await mcBool(db, 'configs_enabled', true);
  const list = await listConfigs(db, { tier: 'free' });
  const healthy = list.filter((c) => c.healthy);
  return {
    enabled,
    count: list.length,
    healthy_count: healthy.length,
    unlimited_count: list.filter((c) => c.unlimited).length,
    protocols: [...new Set(list.map((c) => c.protocol))],
    countries: [...new Set(list.map((c) => c.country).filter(Boolean))],
    items: list.slice(0, 30).map((c) => ({
      id: c.id,
      name: c.name,
      protocol: c.protocol,
      country: c.country,
      unlimited: c.unlimited,
      healthy: c.healthy,
      feedback: c.feedback,
      latency_ms: c.latency_ms,
      note: c.note,
    })),
    notice: list.length
      ? ''
      : 'هنوز کانفیگ واقعی فعالی ثبت نشده است. به‌محض اینکه ادمین سرور/کانفیگ واقعی را در پنل وارد کند، همین‌جا نمایش داده می‌شود — ما کانفیگ جعلی نشان نمی‌دهیم.',
    sub_url: '/mc/configs/sub.txt',
    sub_base64_url: '/mc/configs/sub.b64',
  };
}

/** آیا کاربر دسترسی کانفیگ ویژه دارد؟ (بعد از خرید) */
export async function hasSpecialAccess(db, phoneKey) {
  if (!phoneKey) return false;
  const row = await db
    .prepare("SELECT COUNT(*) c FROM mc_grants WHERE phone_key=? AND type='config' AND status!='failed'")
    .bind(phoneKey)
    .first();
  return Number(row?.c) > 0;
}
