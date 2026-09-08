// ═══════════════════════════════════════════════════════════════════
//  کرون‌جاب‌ها — هر ۱۵ دقیقه: نرخ ارز، سلامت سرورها، یادآوری،
//  تبلیغ گروه‌ها، لیگ هفتگی و انقضای خودکار تست رایگان
// ═══════════════════════════════════════════════════════════════════
import { faDigits, fmtToman, weekKey } from './db.js';
import { getSettingValue, getNum } from './texts.js';
import { send, ikb, btn, ubtn } from './tg.js';
import { getUsdRate } from './pricing.js';
import { healSubscription } from './subs.js';
import { runAdScheduler } from './group.js';
import { tmpl } from './util.js';
import { cleanIpMaintenance } from './cleanip.js';

const now = () => Math.floor(Date.now() / 1000);

async function lastRun(env, key) {
  return Number((await env.KV.get(`lastrun:${key}`)) || 0);
}
async function markRun(env, key) {
  await env.KV.put(`lastrun:${key}`, String(now()), { expirationTtl: 30 * 86400 });
}

export async function scheduled(env) {
  const t0 = Date.now();
  try {
    await refreshRate(env);
    await expireSubs(env);
    await runAdScheduler(env);
    await cleanIpMaintenance(env);
    if (now() - (await lastRun(env, 'health')) > 6 * 3600) {
      await healthCheck(env);
      await markRun(env, 'health');
    }
    if (now() - (await lastRun(env, 'remind')) > 3600) {
      await reminders(env);
      await markRun(env, 'remind');
    }
    await leagueCheck(env);
  } catch (e) {
    console.error('scheduled error', e);
  }
  return Date.now() - t0;
}

/** گرم نگه‌داشتن کش نرخ ارز (هر ۴ ساعت فورس رفرش) */
async function refreshRate(env) {
  const force = now() - (await lastRun(env, 'rate')) > 4 * 3600;
  await getUsdRate(env, force);
  if (force) await markRun(env, 'rate');
}

/** تست سلامت سرورها + جایگزینی خودکار سرور مرده در ساب‌ها */
async function healthCheck(env) {
  const { DB } = env;
  const servers = (await DB.prepare('SELECT * FROM servers WHERE active=1').all()).results;
  for (const s of servers) {
    if (!s.health_url) {
      await DB.prepare('UPDATE servers SET last_check=? WHERE id=?').bind(now(), s.id).run();
      continue;
    }
    let ok = false;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      const res = await fetch(s.health_url, { signal: ctrl.signal, method: 'HEAD' }).catch(() => null);
      clearTimeout(timer);
      ok = !!res && res.status < 500;
    } catch {
      ok = false;
    }
    if (!ok) {
      // یک تلاش دوباره قبل از اعلام مرگ
      try {
        const res = await fetch(s.health_url, { signal: AbortSignal.timeout(6000) });
        ok = !!res && res.status < 500;
      } catch {}
    }
    await DB.prepare('UPDATE servers SET healthy=?, last_check=? WHERE id=?').bind(ok ? 1 : 0, now(), s.id).run();
  }
  // ترمیم ساب‌ها: جایگزینی سرورهای مرده
  const subs = (await DB.prepare('SELECT * FROM subscriptions WHERE active=1 AND expire_at>?').bind(now()).all()).results;
  for (const sub of subs) await healSubscription(DB, sub);
}

/** غیرفعال‌سازی خودکار ساب‌های منقضی (شامل تست رایگان) */
async function expireSubs(env) {
  await env.DB.prepare('UPDATE subscriptions SET active=0 WHERE active=1 AND expire_at<?').bind(now()).run();
}

/** یادآوری انقضا + تخفیف کاربر غیرفعال */
async function reminders(env) {
  const { DB } = env;
  const hours = await getNum(DB, 'reminder_hours', 48);
  const subs = (
    await DB.prepare('SELECT * FROM subscriptions WHERE active=1 AND reminder_sent=0 AND expire_at>? AND expire_at<?').bind(now(), now() + hours * 3600).all()
  ).results;
  for (const s of subs) {
    const user = await DB.prepare('SELECT * FROM users WHERE id=?').bind(s.user_id).first();
    if (!user || user.banned) continue;
    if (now() - (user.last_reminded || 0) < 12 * 3600) continue;
    const leftH = Math.max(1, Math.round((s.expire_at - now()) / 3600));
    let text = (await getSettingValue(DB, 'text:reminder_text')) || (await import('./texts.js')).DEFAULT_TEXTS.reminder_text;
    text = tmpl(text, { title: s.title, left: faDigits(leftH) + ' ساعت' });
    const inactiveDays = await getNum(DB, 'inactive_days', 7);
    const discount = await getNum(DB, 'inactive_discount', 10);
    const inactive = now() - (user.last_seen || 0) > inactiveDays * 86400;
    if (inactive && discount > 0) text += `\n\n🎉 چون مدتی نبودید، ${faDigits(discount)}٪ تخفیف وفاداری روی تمدید شما فعال است!`;
    const botUsername = await getSettingValue(DB, 'bot_username');
    const kb = ikb([
      [btn('🔄 تمدید سریع', `renew:${s.product_id}`)],
      [ubtn('🛍 مشاهده فروشگاه', `https://t.me/${botUsername}`)],
    ]);
    await send(env.TELEGRAM_BOT_TOKEN, user.id, text, { reply_markup: kb });
    await DB.prepare('UPDATE subscriptions SET reminder_sent=1 WHERE id=?').bind(s.id).run();
    await DB.prepare('UPDATE users SET last_reminded=? WHERE id=?').bind(now(), user.id).run();
  }
}

/** لیگ هفتگی مینی‌اپ — پرداخت جایزه نفر اول هفته قبل */
async function leagueCheck(env) {
  const { DB } = env;
  const current = weekKey();
  const stored = await getSettingValue(DB, 'league_week');
  if (!stored) {
    await DB.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').bind('league_week', current).run();
    return;
  }
  if (stored === current) return;
  // هفته عوض شد → برنده هفته قبل
  const winner = await DB.prepare('SELECT id, first_name, weekly_taps FROM users WHERE weekly_taps>0 ORDER BY weekly_taps DESC LIMIT 1').first();
  const prize = await getNum(DB, 'league_prize_coins', 10000);
  if (winner) {
    await DB.prepare('UPDATE users SET coins = coins + ? WHERE id=?').bind(prize, winner.id).run();
    await send(
      env.TELEGRAM_BOT_TOKEN,
      winner.id,
      `🏆 <b>تبریک قهرمان هفته!</b>\n\nشما با ${faDigits(Number(winner.weekly_taps).toLocaleString('en-US'))} تپ، نفر اول لیگ هفتگی شدید!\n🎁 جایزه: ${faDigits(prize.toLocaleString('en-US'))} سکه به حساب شما اضافه شد.`
    );
    await DB.prepare('INSERT OR REPLACE INTO league (week, winner_id, paid) VALUES (?,?,1)').bind(stored, winner.id).run();
  }
  await DB.prepare('UPDATE users SET weekly_taps=0').run();
  await DB.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').bind('league_week', current).run();
}
