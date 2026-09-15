// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — احراز هویت با شمارهٔ موبایل + کد یکبارمصرف (OTP)
//
//  چرا قبل از نمایش فروشگاه؟
//   • خریدار واقعی از حساب جعلی/ربات جدا شود
//   • هر شماره = یک هویت؛ شمارهٔ تکراری یا خوشهٔ IP مشکوک → هشدار به ادمین
//
//  ارسال کد: سه مسیر قابل انتخاب از پنل ادمین
//   1) sms      — هر سرویس پیامکی با REST ساده (قالب URL/بدنه قابل تنظیم)
//   2) telegram — ربات تلگرام پروژه (کد به کاربر لینک‌شده یا به چت ادمین)
//   3) dev      — کد در پاسخ API برمی‌گردد (فقط برای تست؛ از پنل قابل بستن)
//  ⚠️ هیچ‌وقت کد به‌صورت متن ساده در دیتابیس ذخیره نمی‌شود (فقط HMAC).
// ═══════════════════════════════════════════════════════════════════
import { mcGet, mcSet, mcNum, mcBool, sha256Hex, hashSecret, ipKey, pushAlert, bridgeKey } from './db.js';
import { json, clamp } from '../util.js';
import { notifyAdmins } from '../notify.js';

const now = () => Math.floor(Date.now() / 1000);

/** نرمال‌سازی شمارهٔ ایران به 09xxxxxxxxx */
export function normalizePhone(raw) {
  const fa = '۰۱۲۳۴۵۶۷۸۹';
  const ar = '٠١٢٣٤٥٦٧٨٩';
  let s = String(raw || '').trim();
  s = s.replace(/[۰-۹]/g, (d) => fa.indexOf(d)).replace(/[٠-٩]/g, (d) => ar.indexOf(d));
  s = s.replace(/[\s\-()]/g, '');
  if (s.startsWith('+98')) s = '0' + s.slice(3);
  else if (s.startsWith('98') && s.length === 12) s = '0' + s.slice(2);
  else if (s.startsWith('9') && s.length === 10) s = '0' + s;
  return /^09\d{9}$/.test(s) ? s : '';
}

export const maskPhone = (p) => (String(p || '').length >= 10 ? `${String(p).slice(0, 4)}***${String(p).slice(-3)}` : '***');

/** پیشوندهای مجازی/تست — از پنل قابل تنظیم (regex) */
export async function suspiciousPhoneRegex(db) {
  const rx = await mcGet(db, 'fraud_phone_regex', '');
  if (!rx) return null;
  try {
    return new RegExp(rx);
  } catch {
    return null;
  }
}

async function otpKey(db, phone, code) {
  const secret = await bridgeKey(db);
  return hashSecret(secret, `otp|${phone}|${code}`);
}

export async function otpConfig(db) {
  return {
    provider: (await mcGet(db, 'otp_provider', 'dev')).toLowerCase(),
    ttl: Number(await mcNum(db, 'otp_ttl_sec', 300)),
    maxAttempts: Number(await mcNum(db, 'otp_max_attempts', 5)),
    rateLimitHour: Number(await mcNum(db, 'otp_rate_limit_hour', 4)),
    devShow: await mcBool(db, 'otp_dev_show', true),
    resendCooldown: Number(await mcNum(db, 'otp_resend_cooldown', 90)),
    sms: {
      url: await mcGet(db, 'otp_sms_api_url', ''),
      key: await mcGet(db, 'otp_sms_api_key', ''),
      sender: await mcGet(db, 'otp_sms_sender', ''),
      template: await mcGet(db, 'otp_sms_template', ''),
      method: (await mcGet(db, 'otp_sms_method', 'POST')).toUpperCase(),
      body: await mcGet(db, 'otp_sms_body', '{"receptor":"{phone}","template":"nova-otp","token":"{code}"}'),
      successPath: await mcGet(db, 'otp_sms_success_path', 'return.status'),
    },
    tg: {
      chatId: await mcGet(db, 'otp_tg_chat_id', ''),
      linkedOnly: await mcBool(db, 'otp_tg_linked_only', false),
    },
    fraud: {
      ipMaxAccounts: Number(await mcNum(db, 'fraud_ip_max_accounts', 3)),
      velocityHour: Number(await mcNum(db, 'fraud_velocity_hour', 8)),
      phoneRegex: await suspiciousPhoneRegex(db),
    },
  };
}

/** ارسال با سرویس پیامکی دلخواه (قالب قابل تنظیم از پنل) */
async function sendSms(cfg, phone, code) {
  if (!cfg.sms.url) return { ok: false, error: 'sms_not_configured' };
  const fill = (s) =>
    String(s || '')
      .replace(/\{phone\}/g, phone)
      .replace(/\{code\}/g, code)
      .replace(/\{sender\}/g, cfg.sms.sender || '');
  const headers = { 'Content-Type': 'application/json' };
  if (cfg.sms.key) headers.Authorization = `Bearer ${cfg.sms.key}`;
  try {
    const res = await fetch(fill(cfg.sms.url), {
      method: cfg.sms.method === 'GET' ? 'GET' : 'POST',
      headers,
      body: cfg.sms.method === 'GET' ? undefined : fill(cfg.sms.body),
    });
    const textBody = await res.text();
    let okFlag = res.ok;
    if (cfg.sms.successPath) {
      try {
        const obj = JSON.parse(textBody);
        const v = cfg.sms.successPath.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
        okFlag = v === true || v === 200 || v === '200' || v === 1 || v === 'ok';
      } catch {
        /* پاسخ غیر JSON → فقط کد HTTP */
      }
    }
    return { ok: okFlag, status: res.status, body: textBody.slice(0, 200) };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 120) };
  }
}

/** ارسال با ربات تلگرام (به کاربر لینک‌شده یا به چت ادمین برای تست) */
async function sendTelegram(env, db, phone, code, tgId) {
  const token = env.TELEGRAM_BOT_TOKEN || (await mcGet(db, 'bot_token', ''));
  if (!token) return { ok: false, error: 'no_bot_token' };
  const chatId = tgId || (await cfgChatIdFallback(db));
  if (!chatId) return { ok: false, error: 'no_chat' };
  const text = `🔐 کد تأیید *${env.__serverName || 'Nova Edge'}*\n\n\`${code}\`\n\nاین کد ۵ دقیقه اعتبار دارد و فقط برای شمارهٔ ${maskPhone(phone)} است.`;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    });
    const j = await res.json();
    return { ok: !!j.ok, error: j.ok ? '' : String(j.description || '').slice(0, 120) };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 120) };
  }
}

async function cfgChatIdFallback(db) {
  return (await mcGet(db, 'otp_tg_chat_id', '')) || (await mcGet(db, 'owner_id', ''));
}

function genCode(len = 6) {
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  let out = '';
  for (let i = 0; i < len; i++) out += String(buf[i] % 10);
  return out;
}

/** ثبت تلاش مشکوک + هشدار به ادمین */
export async function flagFraud(env, db, kind, subject, detail, severity = 2) {
  await db
    .prepare('INSERT INTO mc_fraud (kind, severity, subject, detail, status, created_at) VALUES (?,?,?,?,?,?)')
    .bind(kind, severity, String(subject).slice(0, 80), JSON.stringify(detail || {}).slice(0, 2000), 'open', now())
    .run();
  await pushAlert(db, kind, `${subject} — ${JSON.stringify(detail).slice(0, 160)}`, severity);
  try {
    await notifyAdmins(env, 'suspicious', `🚨 *احراز هویت مشکوک*\nنوع: \`${kind}\`\nموضوع: \`${maskPhone(subject) || subject}\`\n${JSON.stringify(detail, null, 1).slice(0, 400)}`);
  } catch {
    /* اعلان هرگز جریان را نمی‌شکند */
  }
  return { flagged: true, kind };
}

/** شمارش حساب‌های تأییدشده از یک IP در ۲۴ ساعت گذشته */
async function accountsFromIp(db, ipk, sinceSec = 86400) {
  if (!ipk) return 0;
  const row = await db
    .prepare('SELECT COUNT(*) c FROM mc_auth WHERE ip_key=? AND verified=1 AND verified_at>?')
    .bind(ipk, now() - sinceSec)
    .first();
  return Number(row?.c) || 0;
}

async function sendsFromIp(db, ipk, sinceSec = 3600) {
  if (!ipk) return 0;
  const row = await db.prepare('SELECT COUNT(*) c FROM mc_auth WHERE ip_key=? AND created_at>?').bind(ipk, now() - sinceSec).first();
  return Number(row?.c) || 0;
}

/**
 * مرحلهٔ ۱: درخواست کد
 * @returns {{ok:boolean, error?:string, dev_code?:string, resend_in?:number, provider?:string}}
 */
export async function requestOtp(env, db, { phone, ip, telegramId = 0 }) {
  const cfg = await otpConfig(db);
  const normalized = normalizePhone(phone);
  if (!normalized) return { ok: false, error: 'شمارهٔ موبایل معتبر نیست (مثال: 09123456789)' };

  const phoneKey = await sha256Hex(normalized);
  const ipk = await ipKey(ip);

  // نرخ‌محدودی
  const existing = await db.prepare('SELECT * FROM mc_auth WHERE phone_key=?').bind(phoneKey).first();
  if (existing) {
    if (existing.expires_at > now() && existing.created_at > now() - cfg.resendCooldown) {
      return { ok: false, error: 'کد قبلاً ارسال شده', resend_in: Math.max(0, cfg.resendCooldown - (now() - existing.created_at)) };
    }
    if (existing.sends >= cfg.rateLimitHour && existing.created_at > now() - 3600) {
      await flagFraud(env, db, 'velocity', normalized, { sends: existing.sends, ip: ipk }, 2);
      return { ok: false, error: 'تعداد درخواست کد بیش از حد مجاز است. یک ساعت دیگر تلاش کنید.' };
    }
  }
  const ipSends = await sendsFromIp(db, ipk);
  if (ipSends >= cfg.fraud.velocityHour) {
    await flagFraud(env, db, 'ip_cluster', ipk, { sends: ipSends, phone: maskPhone(normalized) }, 3);
    return { ok: false, error: 'از این اتصال درخواست‌های زیادی ثبت شده. لطفاً بعداً تلاش کنید.' };
  }
  if (cfg.fraud.phoneRegex && cfg.fraud.phoneRegex.test(normalized)) {
    await flagFraud(env, db, 'dup_phone', normalized, { reason: 'virtual_or_test_prefix' }, 2);
    return { ok: false, error: 'این پیشوند شماره پذیرفته نمی‌شود.' };
  }

  const code = genCode(6);
  const codeHash = await otpKey(db, normalized, code);
  const ttl = clamp(cfg.ttl, 60, 1800);
  const provider = cfg.provider === 'sms' && cfg.sms.url ? 'sms' : cfg.provider === 'telegram' ? 'telegram' : 'dev';

  let sent = { ok: false, error: 'provider_missing' };
  if (provider === 'sms') sent = await sendSms(cfg, normalized, code);
  else if (provider === 'telegram') sent = await sendTelegram(env, db, normalized, code, telegramId);
  else sent = { ok: true };

  if (existing) {
    await db
      .prepare('UPDATE mc_auth SET code_hash=?, expires_at=?, attempts=0, sends=sends+1, ip_key=?, provider=?, created_at=? WHERE phone_key=?')
      .bind(codeHash, now() + ttl, ipk, provider, now(), phoneKey)
      .run();
  } else {
    await db
      .prepare('INSERT INTO mc_auth (phone_key, phone_masked, code_hash, expires_at, attempts, sends, ip_key, ip_count, provider, created_at) VALUES (?,?,?,?,0,1,?,?,?,?)')
      .bind(phoneKey, maskPhone(normalized), codeHash, now() + ttl, ipk, 1, provider, now())
      .run();
  }

  const devCode = provider === 'dev' && cfg.devShow ? code : undefined;
  return {
    ok: sent.ok,
    provider,
    error: sent.ok ? undefined : sent.error || 'ارسال کد ناموفق بود',
    masked: maskPhone(normalized),
    ttl,
    dev_code: devCode,
    notice: provider === 'dev' ? 'حالت تست: هیچ پیامکی ارسال نمی‌شود. از پنل ادمین سرویس پیامک یا تلگرام را وصل کنید.' : undefined,
  };
}

/**
 * مرحلهٔ ۲: تأیید کد + ساخت نشست
 */
export async function verifyOtp(env, db, { phone, code, ip, agent = '', telegramId = 0 }) {
  const cfg = await otpConfig(db);
  const normalized = normalizePhone(phone);
  if (!normalized) return { ok: false, error: 'شماره معتبر نیست' };
  const phoneKey = await sha256Hex(normalized);
  const row = await db.prepare('SELECT * FROM mc_auth WHERE phone_key=?').bind(phoneKey).first();
  if (!row) return { ok: false, error: 'ابتدا درخواست کد بدهید' };
  if (row.verified && row.verified_at > now() - 86400 * 30) {
    // شمارهٔ تأییدشدهٔ معتبر: نشست تازه بدون کد (تجربهٔ کاربری بهتر)
    return await issueSession(env, db, { phoneKey, phone: normalized, ip, agent, telegramId, reuse: true });
  }
  if (row.expires_at < now()) return { ok: false, error: 'کد منقضی شده. دوباره درخواست دهید.' };
  if (row.attempts >= cfg.maxAttempts) {
    await db.prepare('UPDATE mc_auth SET expires_at=0 WHERE phone_key=?').bind(phoneKey).run();
    await flagFraud(env, db, 'velocity', normalized, { reason: 'max_attempts_exceeded', attempts: row.attempts }, 2);
    return { ok: false, error: 'تعداد تلاش بیش از حد مجاز. کد باطل شد.' };
  }
  const given = String(code || '').trim();
  if (!/^\d{4,8}$/.test(given)) {
    await db.prepare('UPDATE mc_auth SET attempts=attempts+1 WHERE phone_key=?').bind(phoneKey).run();
    return { ok: false, error: 'کد باید فقط عدد باشد' };
  }
  const hash = await otpKey(db, normalized, given);
  if (hash !== row.code_hash) {
    await db.prepare('UPDATE mc_auth SET attempts=attempts+1 WHERE phone_key=?').bind(phoneKey).run();
    return { ok: false, error: 'کد واردشده درست نیست', attempts_left: Math.max(0, cfg.maxAttempts - row.attempts - 1) };
  }

  await db.prepare('UPDATE mc_auth SET verified=1, verified_at=?, attempts=0 WHERE phone_key=?').bind(now(), phoneKey).run();

  // ── بررسی تقلب بعد از تأیید ──
  const ipk = await ipKey(ip);
  const accounts = await accountsFromIp(db, ipk);
  if (ipk && accounts > cfg.fraud.ipMaxAccounts) {
    await flagFraud(env, db, 'ip_cluster', ipk, { verified_accounts_24h: accounts, phone: maskPhone(normalized) }, 3);
  }
  const distinctIps = await db.prepare('SELECT COUNT(DISTINCT ip_key) c FROM mc_auth WHERE phone_key=? AND verified=1').bind(phoneKey).first();
  if (Number(distinctIps?.c) > 4) {
    await flagFraud(env, db, 'dup_phone', normalized, { distinct_ips: distinctIps.c }, 2);
  }

  return await issueSession(env, db, { phoneKey, phone: normalized, ip, agent, telegramId });
}

/** ساخت توکن نشست (هش‌شده ذخیره می‌شود) */
async function issueSession(env, db, { phoneKey, phone, ip, agent, telegramId }) {
  const buf = new Uint8Array(24);
  crypto.getRandomValues(buf);
  const token = Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
  const tokenKey = await sha256Hex(token);
  const ipk = await ipKey(ip);
  const expires = now() + 30 * 86400;
  await db
    .prepare('INSERT INTO mc_sessions (token_key, phone_key, created_at, expires_at, ip_key, agent) VALUES (?,?,?,?,?,?)')
    .bind(tokenKey, phoneKey, now(), expires, ipk, String(agent || '').slice(0, 120))
    .run();
  try {
    await notifyAdmins(env, 'newUser', `✅ شمارهٔ ${maskPhone(phone)} تأیید شد (IP hash: ${ipk.slice(0, 8)}…)`);
  } catch {}
  return { ok: true, token, expires_at: expires, phone_masked: maskPhone(phone), phone_key: phoneKey, telegram_id: telegramId };
}

/** اعتبارسنجی نشست از کوکی یا هدر */
export async function sessionFromRequest(db, request) {
  const auth = request.headers.get('Authorization') || '';
  let token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) {
    const cookie = request.headers.get('Cookie') || '';
    const m = cookie.match(/(?:^|;\s*)nova_session=([a-f0-9]{16,128})/);
    if (m) token = m[1];
  }
  if (!token) return null;
  const tokenKey = await sha256Hex(token);
  const s = await db.prepare('SELECT * FROM mc_sessions WHERE token_key=?').bind(tokenKey).first();
  if (!s || s.revoked || s.expires_at < now()) return null;
  const a = await db.prepare('SELECT * FROM mc_auth WHERE phone_key=?').bind(s.phone_key).first();
  return { session: s, auth: a, phone_key: s.phone_key, verified: !!(a && a.verified) };
}

export function sessionCookie(token, maxAge = 30 * 86400) {
  return `nova_session=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax; Secure`;
}

export async function logout(db, token) {
  const tokenKey = await sha256Hex(String(token || ''));
  await db.prepare('UPDATE mc_sessions SET revoked=1 WHERE token_key=?').bind(tokenKey).run();
  return { ok: true };
}

/** آیا کاربر مجاز به دیدن محصولات است؟ */
export const isVerified = (ctx) => !!ctx?.verified;
