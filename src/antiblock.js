// ═══════════════════════════════════════════════════════════════════
//  لایهٔ ضدسانسور / ضد DPI (بخش ۳.۱)
//
//  ایده: هر سرور می‌تواند چند «واریانت» داشته باشد — هر واریانت یک
//  (ترنسپورت، پورت، SNI/Fake-Domain، امنیت، مسیر CDN) متفاوت است.
//  اگر یکی فیلتر شد، واریانت‌های دیگر همان سرور در ساب باقی می‌مانند و
//  کاربر فقط کافی است اشتراک را رفرش کند.
//
//  سلامت واریانت از دو منبع به‌روز می‌شود:
//   ۱) بازخورد کاربر روی صفحهٔ ساب (درون ایران — سیگنال واقعی)  ✅
//   ۲) check_url که Worker از دیتاسنتر خارج از ایران می‌زند
//      (فقط نشان می‌دهد پورت از بیرون جواب می‌دهد یا نه — ربطی به
//       فیلترینگ نت ملی ندارد؛ به همین دلیل هشدارها با همین لحن است)
//
//  ⚠️ هیچ واریانتی به‌صورت خودکار «سالم» ساخته نمی‌شود؛ همه باید توسط
//  ادمین روی سرور واقعی ست شده باشند. تغییر transport در کانفیگ بدون
//  تغییر سمت سرور، کانفیگ را می‌شکند — پس اینجا فقط همان چیزی تحویل
//  داده می‌شود که ادمین تعریف کرده است.
// ═══════════════════════════════════════════════════════════════════

const now = () => Math.floor(Date.now() / 1000);

export const TRANSPORTS = ['ws', 'grpc', 'xhttp', 'httpupgrade', 'tcp', 'reality', 'vision', 'kcp'];
export const SECURITIES = ['tls', 'none', 'reality'];

const enc = encodeURIComponent;

/** پارامترهای URL مشترک برای ترنسپورت‌ها */
function transportParams(v) {
  const t = String(v.transport || 'ws').toLowerCase();
  const p = [];
  const add = (k, val) => {
    if (val !== undefined && val !== '' && val !== null) p.push(`${k}=${enc(String(val))}`);
  };
  if (t === 'ws') p.push('type=ws');
  else if (t === 'grpc') p.push('type=grpc');
  else if (t === 'xhttp') p.push('type=xhttp');
  else if (t === 'httpupgrade') p.push('type=httpupgrade');
  else if (t === 'kcp') p.push('type=kcp');
  else p.push('type=tcp');
  add('host', t === 'ws' || t === 'httpupgrade' ? v.host || v.sni : '');
  add('path', ['ws', 'xhttp', 'httpupgrade', 'grpc'].includes(t) ? v.path : '');
  add('mode', t === 'xhttp' ? v.mode || 'auto' : '');
  add('mode', t === 'grpc' ? v.mode || 'gun' : '');
  add('serviceName', t === 'grpc' ? v.service_name : '');
  add('headerType', t === 'kcp' ? v.header_type || 'srtp' : '');
  add('seed', t === 'kcp' ? v.seed : '');
  return p;
}

function tlsParams(v) {
  const sec = String(v.security || 'tls').toLowerCase();
  const p = [];
  if (sec === 'none') {
    p.push('security=none');
    return p;
  }
  if (sec === 'reality') {
    p.push('security=reality');
    if (v.sni) p.push(`sni=${enc(v.sni)}`);
    if (v.public_key || v.pbk) p.push(`pbk=${encodeURIComponent(v.public_key || v.pbk)}`);
    if (v.sid) p.push(`sid=${enc(v.sid)}`);
    if (v.spx) p.push(`spx=${enc(v.spx)}`);
    p.push(`fp=${enc(v.fp || 'chrome')}`);
    return p;
  }
  p.push('security=tls');
  if (v.sni) p.push(`sni=${enc(v.sni)}`);
  if (v.alpn) p.push(`alpn=${enc(v.alpn)}`);
  if (v.fp) p.push(`fp=${enc(v.fp)}`);
  if (v.insecure === '1' || v.insecure === 1) p.push('allowInsecure=1');
  return p;
}

/**
 * ساخت لینک یک واریانت.
 * @returns {string} لینک، یا رشتهٔ خالی اگر اطلاعات کافی نباشد
 */
export function renderVariantLink(server, variant, uuid, label, userName = '') {
  const s = server || {};
  const v = variant || {};
  const host = String(v.host_override || s.clean_ip || s.ip || '').trim();
  if (!host) return '';
  const port = Number(v.port || s.port || 443);
  const name = enc(String(label || `${s.name || 'server'} | ${v.label || v.transport || 'ws'}`));
  const proto = String(s.protocol || 'vless').toLowerCase();
  const flow = String(v.security || '').toLowerCase() === 'reality' && (v.flow === undefined || v.flow === 'xtls-rprx-vision') ? 'xtls-rprx-vision' : v.flow || '';

  if (proto === 'vless') {
    const parts = ['encryption=none', ...transportParams(v), ...tlsParams(v)];
    if (flow) parts.push(`flow=${flow}`);
    return `vless://${uuid || s.secret || ''}@${host}:${port}?${parts.join('&')}#${name}`;
  }
  if (proto === 'trojan') {
    const parts = [...transportParams(v), ...tlsParams(v)];
    return `trojan://${s.secret || uuid}@${host}:${port}?${parts.join('&')}#${name}`;
  }
  if (proto === 'vmess') {
    const obj = {
      v: '2',
      ps: decodeURIComponent(name),
      add: host,
      port: String(port),
      id: uuid || s.secret || '',
      aid: '0',
      scy: 'auto',
      net: ['grpc', 'xhttp', 'kcp'].includes(String(v.transport).toLowerCase()) ? String(v.transport).toLowerCase() : String(v.transport || 'ws').toLowerCase() === 'tcp' ? 'tcp' : 'ws',
      type: '',
      host: v.host || '',
      path: v.path || '',
      tls: String(v.security || 'tls') === 'none' ? '' : 'tls',
      sni: v.sni || '',
      alpn: v.alpn || 'h2',
      fp: v.fp || 'chrome',
    };
    return `vmess://${btoa(unescape(encodeURIComponent(JSON.stringify(obj))))}`;
  }
  if (proto === 'ss') {
    const method = v.method || 'chacha20-ietf-poly1305';
    const pass = s.secret || uuid || '';
    return `ss://${btoa(unescape(encodeURIComponent(`${method}:${pass}`)))}@${host}:${port}#${name}`;
  }
  return '';
}

/** واریانت‌های فعالِ سالم یک سرور */
export async function listVariants(db, serverId, { includeDisabled = false } = {}) {
  const sql = includeDisabled
    ? 'SELECT * FROM config_variants WHERE server_id=? ORDER BY sort ASC, id ASC'
    : 'SELECT * FROM config_variants WHERE server_id=? AND active=1 AND healthy=1 ORDER BY sort ASC, id ASC';
  const rows = await db.prepare(sql).bind(Number(serverId)).all();
  return rows.results || [];
}

export async function allVariants(db, serverIds = []) {
  if (!serverIds.length) return [];
  const rows = await db
    .prepare(`SELECT * FROM config_variants WHERE server_id IN (${serverIds.map(() => '?').join(',')}) ORDER BY server_id, sort, id`)
    .bind(...serverIds.map(Number))
    .all();
  return rows.results || [];
}

/** ساخت چند کانفیگ (حداکثر count) برای مجموعه‌ای از سرورها با واریانت‌ها */
export async function buildVariantConfigs(db, servers, uuid, product, opts = {}) {
  const wanted = Math.max(1, Number(opts.count) || 10);
  const ids = (servers || []).map((s) => Number(s.id)).filter(Boolean);
  const variants = await allVariants(db, ids);
  if (!variants.length) return { lines: [], entries: [], count: 0, usedVariants: 0 };
  const byServer = new Map();
  for (const v of variants) {
    if (!byServer.has(v.server_id)) byServer.set(v.server_id, []);
    byServer.get(v.server_id).push(v);
  }
  const lines = [];
  const entries = [];
  const seen = new Set();
  let used = 0;
  // چرخش منصفانه بین سرورها تا ساب پراکنده باشد (لوکیشن‌های مختلف)
  let round = 0;
  while (lines.length < wanted) {
    let progressed = false;
    for (const s of servers) {
      const list = (byServer.get(s.id) || []).filter((v) => v.active && v.healthy);
      if (!list.length) continue;
      const v = list[round % list.length];
      used++;
      progressed = true;
      const label = `${product?.title || 'AMINCK'} | ${s.name || 'سرور'} | ${v.label || v.transport} ${v.port || ''}`;
      const line = renderVariantLink(s, v, uuid, label);
      if (line && !seen.has(line)) {
        seen.add(line);
        lines.push(line);
        entries.push({ line, variantId: Number(v.id), serverId: Number(s.id), label });
      }
      if (lines.length >= wanted) break;
    }
    if (!progressed) break;
    round++;
    if (round > 40) break; // محافظ
  }
  return { lines, entries, count: lines.length, usedVariants: used };
}

// ─── CRUD برای پنل ادمین ───
export function validateVariant(v = {}) {
  const errors = [];
  const port = Number(v.port || 0);
  if (!port || port < 1 || port > 65535) errors.push('پورت باید بین ۱ تا ۶۵۵۳۵ باشد.');
  const t = String(v.transport || 'ws').toLowerCase();
  if (!TRANSPORTS.includes(t)) errors.push(`ترنسپورت «${t}» شناخته‌شده نیست (${TRANSPORTS.join('/')}).`);
  const sec = String(v.security || 'tls').toLowerCase();
  if (!SECURITIES.includes(sec)) errors.push(`امنیت «${sec}» نامعتبر است.`);
  if (sec === 'reality' && !String(v.pbk || v.public_key || '').trim()) errors.push('برای Reality کلید عمومی (pbk) لازم است.');
  if (sec === 'reality' && !String(v.sid || '').trim()) errors.push('برای Reality شناسه کوتاه (sid) لازم است.');
  const sni = String(v.sni || '').trim();
  if (sni && !/^[a-z0-9.-]+$/i.test(sni)) errors.push('SNI فقط می‌تواند نام دامنه باشد.');
  if (t === 'ws' && !String(v.path || '').trim() && !String(v.host || '').trim()) errors.push('برای WebSocket مسیر (path) یا Host پیشنهاد می‌شود.');
  return errors;
}

export async function saveVariant(db, serverId, v = {}, id = 0) {
  const errors = validateVariant(v);
  if (errors.length) return { ok: false, errors };
  const clean = {
    label: String(v.label || '').slice(0, 60),
    transport: String(v.transport || 'ws').toLowerCase(),
    port: Number(v.port || 443),
    security: String(v.security || 'tls').toLowerCase(),
    sni: String(v.sni || '').trim(),
    host: String(v.host || '').trim(),
    path: String(v.path || '').trim(),
    service_name: String(v.service_name || '').trim(),
    alpn: String(v.alpn || 'h2,http/1.1').trim(),
    fp: String(v.fp || 'chrome').trim(),
    pbk: String(v.pbk || v.public_key || '').trim(),
    sid: String(v.sid || '').trim(),
    spx: String(v.spx || '').trim(),
    check_url: String(v.check_url || '').trim(),
    active: v.active === undefined || v.active === null || v.active === true || v.active === '1' || v.active === 1 ? 1 : 0,
    sort: Number(v.sort || 0),
  };
  if (id) {
    await db
      .prepare(
        `UPDATE config_variants SET label=?,transport=?,port=?,security=?,sni=?,host=?,path=?,service_name=?,alpn=?,fp=?,pbk=?,sid=?,spx=?,check_url=?,active=?,sort=? WHERE id=?`
      )
      .bind(clean.label, clean.transport, clean.port, clean.security, clean.sni, clean.host, clean.path, clean.service_name, clean.alpn, clean.fp, clean.pbk, clean.sid, clean.spx, clean.check_url, clean.active, clean.sort, Number(id))
      .run();
    return { ok: true, id: Number(id) };
  }
  const res = await db
    .prepare(
      `INSERT INTO config_variants (server_id,label,transport,port,security,sni,host,path,service_name,alpn,fp,pbk,sid,spx,check_url,active,healthy,sort,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?) RETURNING id`
    )
    .bind(
      Number(serverId),
      clean.label,
      clean.transport,
      clean.port,
      clean.security,
      clean.sni,
      clean.host,
      clean.path,
      clean.service_name,
      clean.alpn,
      clean.fp,
      clean.pbk,
      clean.sid,
      clean.spx,
      clean.check_url,
      clean.active,
      clean.sort,
      now()
    )
    .first();
  return { ok: true, id: Number(res?.id || 0) };
}

export async function deleteVariant(db, id) {
  await db.prepare('DELETE FROM config_variants WHERE id=?').bind(Number(id)).run();
  return { ok: true };
}

/** ثبت پروفایل ضدسانسور پیش‌فرض سرور (SNI/پورت‌ها/ترنسپورت‌های مجاز) */
export async function saveAntiBlockProfile(db, serverId, profile = {}) {
  const p = {
    sni: String(profile.sni || '').trim(),
    fake_domains: String(profile.fake_domains || '')
      .split(/[,\n]/)
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 10),
    ports: String(profile.ports || '')
      .split(/[,\s]+/)
      .map((x) => Number(x))
      .filter((x) => x >= 1 && x <= 65535)
      .slice(0, 10),
    transports: Array.isArray(profile.transports) ? profile.transports.slice(0, 8).map((x) => String(x).toLowerCase()) : [],
    cdn: String(profile.cdn || '').trim(),
    notes: String(profile.notes || '').slice(0, 200),
    updated_at: now(),
  };
  await db.prepare('UPDATE servers SET anti_block=? WHERE id=?').bind(JSON.stringify(p), Number(serverId)).run();
  return { ok: true, profile: p };
}

export function parseAntiBlockProfile(server) {
  try {
    return JSON.parse(server?.anti_block || 'null') || null;
  } catch {
    return null;
  }
}

// ─── سلامت واریانت‌ها ───

/** علامت‌گذاری واریانت خراب/سالم + غیرفعال‌سازی خودکار بعد از N شکست */
export async function markVariant(db, id, ok, { failLimit = 3, reason = '' } = {}) {
  const v = await db.prepare('SELECT * FROM config_variants WHERE id=?').bind(Number(id)).first();
  if (!v) return { ok: false, reason: 'not_found' };
  const fail = ok ? 0 : Number(v.fail_count || 0) + 1;
  const good = ok ? Number(v.ok_count || 0) + 1 : Number(v.ok_count || 0);
  const disable = !ok && fail >= Math.max(1, Number(failLimit) || 3);
  await db
    .prepare('UPDATE config_variants SET healthy=?, fail_count=?, ok_count=?, last_check=?, active=?, note=? WHERE id=?')
    .bind(ok ? 1 : 0, fail, good, now(), disable ? 0 : 1, ok ? '' : `⛔ ${reason || 'پاسخ نداد'} (${fail})`, v.id)
    .run();
  return { ok: true, healthy: ok ? 1 : 0, fail, disabled: disable };
}

/** پروب از بیرون ایران (اختیاری — سیگنال نسبی، نه تایید فیلترینگ) */
export async function checkVariants(env) {
  const db = env.DB;
  const limit = Number(await getSettingLocal(db, 'variant_fail_limit')) || 3;
  const rows = (await db.prepare("SELECT * FROM config_variants WHERE active=1 AND check_url<>'' ORDER BY last_check ASC LIMIT 40").all()).results;
  let checked = 0;
  let died = 0;
  for (const v of rows) {
    let ok = false;
    try {
      const r = await fetch(v.check_url, { method: 'HEAD', signal: AbortSignal.timeout(6000) }).catch(() => null);
      ok = !!r && r.status < 600;
    } catch {
      ok = false;
    }
    checked++;
    const res = await markVariant(db, v.id, ok, { failLimit: limit, reason: 'چک‌یورل پاسخ نداد' });
    if (res.disabled) died++;
  }
  return { checked, died };
}

/** بازخورد کاربر روی صفحهٔ ساب — تنها سیگنال واقعیِ «داخل ایران» */
export async function reportVariantResult(db, { variantId, ok, limit = 3 }) {
  const res = await markVariant(db, variantId, !!ok, { failLimit: Number(limit) || 3, reason: ok ? '' : 'بازخورد کاربر: وصل نشد' });
  return res;
}

async function getSettingLocal(db, key) {
  const row = await db.prepare('SELECT value FROM settings WHERE key=?').bind(key).first();
  return row ? row.value : '';
}

/** خلاصهٔ پوشش ضدسانسور — برای پنل و تشخیص «ساب کم‌تعداد» */
export async function coverageStats(db) {
  const servers = (await db.prepare('SELECT id, name, protocol, anti_block FROM servers WHERE active=1').all()).results;
  const variants = (await db.prepare('SELECT * FROM config_variants').all()).results;
  const byServer = {};
  for (const v of variants) {
    const k = Number(v.server_id);
    byServer[k] = byServer[k] || { total: 0, healthy: 0, transports: new Set(), ports: new Set() };
    byServer[k].total++;
    if (v.active && v.healthy) byServer[k].healthy++;
    byServer[k].transports.add(v.transport);
    byServer[k].ports.add(Number(v.port));
  }
  return {
    servers: servers.length,
    withVariants: Object.keys(byServer).length,
    disabledVariants: variants.filter((v) => !v.active).length,
    detail: servers.map((s) => ({
      id: s.id,
      name: s.name,
      protocol: s.protocol,
      total: byServer[s.id]?.total || 0,
      healthy: byServer[s.id]?.healthy || 0,
      transports: [...(byServer[s.id]?.transports || [])],
      ports: [...(byServer[s.id]?.ports || [])],
      profile: parseAntiBlockProfile(s),
    })),
  };
}
