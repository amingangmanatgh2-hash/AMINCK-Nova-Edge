// ═══════════════════════════════════════════════════════════════════
//  کرون‌جاب‌ها — هر ۱۵ دقیقه: نرخ ارز، سلامت سرورها، یادآوری،
//  تبلیغ گروه‌ها، لیگ هفتگی و انقضای خودکار تست رایگان
// ═══════════════════════════════════════════════════════════════════
import { faDigits, fmtToman, weekKey, lowStockProducts } from './db.js';
import { getSettingValue, getNum } from './texts.js';
import { send, ikb, btn, ubtn } from './tg.js';
import { getUsdRate, getGoldRateInfo } from './pricing.js';
import { checkVariants } from './antiblock.js';
import { reconcilePendingPayments } from './gateway.js';
import { notifyAdmins } from './notify.js';
import { healSubscription } from './subs.js';
import { runAdScheduler } from './group.js';
import { tmpl } from './util.js';
import { cleanIpMaintenance } from './cleanip.js';
import { runBroadcastBatch, sendSalesReport } from './perks.js';

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
    await maintenance(env);
    if (now() - (await lastRun(env, 'health')) > 6 * 3600) {
      await healthCheck(env);
      await markRun(env, 'health');
    }
    if (now() - (await lastRun(env, 'remind')) > 3600) {
      await reminders(env);
      await markRun(env, 'remind');
    }
    // 📣 صف ارسال همگانی (زمان‌بندی‌شده) — هر اجرا یک دسته می‌فرستد
    await broadcastTick(env);
    // 📊 گزارش فروش روزانه/هفتگی در پیوی ادمین‌ها
    await reportTick(env);
    await leagueCheck(env);
  } catch (e) {
    console.error('scheduled error', e);
  }
  return Date.now() - t0;
}

/** گرم نگه‌داشتن کش نرخ ارز + نرخ طلا (هر ۴ ساعت فورس رفرش) */
async function refreshRate(env) {
  const force = now() - (await lastRun(env, 'rate')) > 4 * 3600;
  await getUsdRate(env, force);
  try {
    await getGoldRateInfo(env, force);
  } catch {}
  if (force) await markRun(env, 'rate');
}

/** کارهای خودکار جدید: تطبیق پرداخت درگاه، سلامت واریانت‌ها، موجودی */
async function maintenance(env) {
  const { DB } = env;
  // ۱) درگاه بانکی: تسویهٔ تراکنش‌هایی که callback‌شان گم شده (کاربر با دکمهٔ بازگشت برنگشته)
  if ((await getSettingValue(DB, 'gateway_auto_reconcile')) === '1') {
    try {
      const r = await reconcilePendingPayments(env);
      if (r && r.checked) await notifyAdmins(env, 'gateway', `♻️ تطبیق خودکار درگاه: ${faDigits(r.checked)} تراکنش بررسی، ${faDigits(r.settled)} تراکنش تسویه شد.`);
    } catch (e) {
      console.error('reconcile', e);
    }
  }
  // ۲) بررسی دورهٔ مسیرهای ضدسانسور (بخش ۳.۱) — هر ۳ ساعت
  if ((await getSettingValue(DB, 'variant_check_enabled')) === '1' && now() - (await lastRun(env, 'variants')) > 3 * 3600) {
    try {
      const r = await checkVariants(env);
      await markRun(env, 'variants');
      if (r && r.died) {
        await notifyAdmins(env, 'deadConfig', `💀 ${faDigits(r.died)} مسیر/واریانت از تحویل حذف شد (${faDigits(r.checked || 0)} مسیر بررسی شد).\nاز «🛡 ضدسانسور» ببینید کدام سرور خالی شده است.`);
      }
    } catch (e) {
      console.error('variants', e);
    }
  }
  // ۳) موجودی (بخش ۲۳)
  try {
    const th = Number(await getSettingValue(DB, 'low_stock_threshold')) || 3;
    const low = await lowStockProducts(DB, th);
    for (const p of low) {
      await notifyAdmins(
        env,
        'outOfStock',
        `${p.stock <= 0 ? '📦⛔ موجودی' : '📦 موجودی'} محصول «${p.title}» ${p.stock <= 0 ? 'تمام شد' : `به ${faDigits(p.stock)} رسید`}.${p.stock <= 0 && p.enabled ? '\nمحصول هنوز فعال است — اگر موجودی ندارید غیرفعالش کنید.' : ''}`,
        null,
        { dedupe: `stock:${p.id}:${p.stock}`, ttl: 6 * 3600 }
      );
    }
  } catch (e) {
    console.error('stock', e);
  }
  // ۴) سرورهایی که همهٔ مسیرهایشان مرده → به ادمین گزارش می‌شود (بخش ۳: غیرفعال‌سازی خودکار)
  try {
    const dead = (
      await DB.prepare('SELECT id, name FROM servers WHERE active=1 AND healthy=0 AND last_check>? LIMIT 10').bind(now() - 7 * 86400).all()
    ).results;
    for (const d of dead) {
      const left = await DB.prepare('SELECT COUNT(*) v FROM config_variants WHERE server_id=? AND active=1 AND healthy=1').bind(d.id).first();
      if (!Number(left?.v || 0)) {
        await notifyAdmins(env, 'deadConfig', `⛔ سرور «${d.name}» بدون مسیر سالم است.\n\nتا رفع مشکل، کانفیگ تازه‌ای از این سرور تحویل نمی‌شود؛ برای غیرفعال‌کردن: /admin → 🖥 سرورها`, null, { dedupe: `srvdead:${d.id}`, ttl: 12 * 3600 });
      }
    }
  } catch (e) {
    console.error('srvdead', e);
  }
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
    const before = Number(s.healthy);
    await DB.prepare('UPDATE servers SET healthy=?, last_check=? WHERE id=?').bind(ok ? 1 : 0, now(), s.id).run();
    if (!ok && before === 1) {
      await notifyAdmins(env, 'deadConfig', `💀 سرور «${s.name}» (${s.protocol}) از دسترس خارج شد.\n\nساب‌های فعال این سرور به‌صورت خودکار به مسیر سالم جایگزین می‌شود (heal).`, null, { dedupe: `srv:${s.id}:dead`, ttl: 3600 });
    }
    if (ok && before === 0) {
      await notifyAdmins(env, 'serviceError', `🟢 سرور «${s.name}» دوباره در دسترس شد.`, null, { dedupe: `srv:${s.id}:back`, ttl: 3600 });
    }
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

// ─── 📣 صف ارسال همگانی ───
async function broadcastTick(env) {
  const { DB } = env;
  const due = await DB.prepare("SELECT COUNT(*) c FROM broadcasts WHERE status IN ('queued','running') AND (at=0 OR at<=?)").bind(now()).first();
  if (!Number(due?.c || 0)) return;
  const batch = await getNum(DB, 'broadcast_batch', 25);
  const r = await runBroadcastBatch(env, env.TELEGRAM_BOT_TOKEN, { batch });
  await DB.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').bind('broadcast_last_run', String(now())).run();
  if (r?.ran) console.log('broadcast ran', r.ran);
}

// ─── 📊 گزارش‌ها ───
async function reportTick(env) {
  const { DB } = env;
  if ((await getSettingValue(DB, 'report_daily_enabled')) === '0' && (await getSettingValue(DB, 'report_weekly_enabled')) === '0') return;
  const hour = Number(await getSettingValue(DB, 'report_daily_hour')) || 0;
  const d = new Date();
  if (d.getUTCHours() !== hour) return;
  const dayIso = d.toISOString().slice(0, 10);
  if ((await getSettingValue(DB, 'report_daily_enabled')) !== '0') {
    const last = await DB.prepare("SELECT value FROM settings WHERE key='report_daily_last'").first();
    if (String(last?.value || '') !== dayIso) {
      await DB.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').bind('report_daily_last', dayIso).run();
      await sendSalesReport(env, 'daily');
    }
  }
  if (d.getUTCDay() === 1 && (await getSettingValue(DB, 'report_weekly_enabled')) !== '0') {
    const wk = await DB.prepare("SELECT value FROM settings WHERE key='report_weekly_last'").first();
    if (String(wk?.value || '') !== dayIso) {
      await DB.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').bind('report_weekly_last', dayIso).run();
      await sendSalesReport(env, 'weekly');
    }
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
