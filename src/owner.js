// ═══════════════════════════════════════════════════════════════════
//  تایید مالک ربات (بخش ۱۷ امنیت)
//
//  بعد از /setup با رمز پنل، هیچ کاربری (حتی اولین نفر) خودکار ادمین
//  نمی‌شود. اولین کاربر باید در تلگرام «رمز پنل» را وارد کند:
//    ✅ رمز درست  → همان کاربر سوپرادمین ثبت و قفل بسته می‌شود
//    ⛔ رمز غلط    → کاربر عادی می‌ماند (۵ خطا → ۱۵ دقیقه قفل)
//
//  بعد از بسته‌شدن قفل، فقط ادمین‌هایی که سوپرادمین اضافه کرده باشد
//  می‌توانند وارد پنل شوند.
// ═══════════════════════════════════════════════════════════════════
import { getSetting, setSetting, requiresOwnerClaim, bindOwner } from './db.js';
import { forceReply, send } from './tg.js';
import { isValidPanelPassword } from './util.js';
import { notifyAdmins } from './notify.js';

const MAX_TRIES = 5;
const LOCK_SECONDS = 15 * 60;

export async function needsOwnerClaim(db, userId) {
  if (!Number(userId)) return false;
  const u = await db.prepare('SELECT role FROM users WHERE id=?').bind(Number(userId)).first();
  if (u && (u.role === 'super' || u.role === 'admin')) return false;
  return requiresOwnerClaim(db);
}

/** آیا هنوز قفل مالک باز است؟ (برای نمایش در /setup و پنل) */
export async function ownerLockState(db) {
  const open = (await getSetting(db, 'owner_claim', '')) === '1';
  const owner = Number((await getSetting(db, 'owner_id', '')) || 0);
  return { locked: !open, owner_id: owner };
}

export async function startOwnerClaim(ctx) {
  await ctx.db.prepare('UPDATE users SET state=? WHERE id=?').bind('owner:claim', ctx.user.id).run();
  await send(
    ctx.token,
    ctx.user.id,
    '🔐 <b>تایید مالک ربات لازم است</b>\n\n' +
      'این ربات تازه راه‌اندازی شده و هنوز سوپرادمین ندارد.\n' +
      'رمز ۱۰ رقمی پنل مدیریت را (که در صفحهٔ /setup تعیین کردید) وارد کنید تا حساب شما به‌عنوان <b>مالک</b> ثبت شود.\n\n' +
      '⚠️ اگر شما مدیر این ربات نیستید، همین‌جا ربات را عادی استفاده کنید؛ رمز را نمی‌خواهیم.' +
      '\n\nبرای انصراف: <code>/cancel</code>',
    forceReply('رمز ۱۰ رقمی')
  );
}

export async function ownerLockRemaining(env, userId) {
  try {
    const v = await env.KV.get(`owner:lock:${userId}`);
    return v ? Number(v) : 0;
  } catch {
    return 0;
  }
}

/**
 * @returns {Promise<'ignored'|'ok'|'bad'|'locked'|'format'>}
 */
export async function handleOwnerClaimText(ctx, raw) {
  if (String(raw || '').trim() === '/cancel') {
    await ctx.db.prepare("UPDATE users SET state='' WHERE id=?").bind(ctx.user.id).run();
    await send(ctx.token, ctx.user.id, '👌 باشه؛ هر وقت خواستید دوباره /start بزنید.');
    return 'ignored';
  }
  const left = await ownerLockRemaining(ctx.env, ctx.user.id);
  if (left && left > Date.now() / 1000) {
    await send(ctx.token, ctx.user.id, `⛔ بیش از ${MAX_TRIES} بار اشتباه وارد کردید.\n${Math.ceil((left - Date.now() / 1000) / 60)} دقیقهٔ دیگر دوباره تلاش کنید.`);
    return 'locked';
  }
  const pass = String(raw || '').trim();
  if (!isValidPanelPassword(pass)) {
    await send(ctx.token, ctx.user.id, '⚠️ رمز پنل باید <b>دقیقاً ۱۰ رقم</b> باشد.', forceReply('رمز ۱۰ رقمی'));
    return 'format';
  }
  const stored = String(await getSetting(ctx.db, 'panel_password', '') || '');
  if (!stored || stored !== pass) {
    const key = `owner:tries:${ctx.user.id}`;
    const tries = Number((await ctx.env.KV.get(key)) || 0) + 1;
    await ctx.env.KV.put(key, String(tries), { expirationTtl: LOCK_SECONDS });
    if (tries >= MAX_TRIES) {
      await ctx.env.KV.put(`owner:lock:${ctx.user.id}`, String(Math.floor(Date.now() / 1000) + LOCK_SECONDS), { expirationTtl: LOCK_SECONDS + 60 });
      await ctx.env.KV.put(key, '0', { expirationTtl: LOCK_SECONDS });
      await send(ctx.token, ctx.user.id, '⛔ ۵ خطای پیاپی → ۱۵ دقیقه قفل شد.\n\n🔒 برای امنیت ربات، حدس رمز پنل مسدود شده است. اگر مدیر ربات هستید، رمز را از همان صفحهٔ /setup بردارید.');
      return 'locked';
    }
    await send(
      ctx.token,
      ctx.user.id,
      `⛔ رمز درست نبود. (${MAX_TRIES - tries} تلاش باقی‌مانده)\n\nاگر مدیر ربات نیستید نیازی به ادامه نیست؛ با /start به منوی عادی برمی‌گردید.`,
      forceReply('رمز ۱۰ رقمی')
    );
    return 'bad';
  }
  // ✅ مالک تایید شد
  await bindOwner(ctx.db, ctx.user.id);
  await setSetting(ctx.db, 'owner_name', ctx.user.first_name || '');
  await ctx.db.prepare("UPDATE users SET state='', owner_verified=1 WHERE id=?").bind(ctx.user.id).run();
  await send(
    ctx.token,
    ctx.user.id,
    '👑 <b>تبریک! شما مالک و سوپرادمین ربات ثبت شدید.</b>\n\n' +
      '🔓 قفل ثبت‌نام ادمین بسته شد؛ از این پس فقط ادمین‌هایی که خودتان اضافه کنید دسترسی دارند.\n' +
      '📊 از منوی پایین «پنل مدیریت» را بزنید.\n' +
      '🧑‍💼 ادمین‌های فعلی برای ورود به پنل تحت وب به رمز ۱۰ رقمی نیاز دارند.'
  );
  await notifyAdmins(
    ctx.env,
    'aiFlag',
    `👑 مالک ربات تایید شد: ${ctx.user.first_name || ''} (<code>${ctx.user.id}</code>)\n🔒 قفل ادمین خودکار بسته شد.`,
    null,
    { dedupe: 'owner:' + ctx.user.id }
  );
  return 'ok';
}
