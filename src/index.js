// ═══════════════════════════════════════════════════════════════════
//  AMINCK Nova Bot — نقطه ورود ورکر
//  مسیرها: /setup (راه‌اندازی) | /webhook (تلگرام) | /app (مینی‌اپ) | /sub/:token | /logo.png
// ═══════════════════════════════════════════════════════════════════
import { NovaStore, withStore } from './store.js';
import { initDb, ensureUser, getUser, isAdmin, getSetting, setSetting } from './db.js';
import { withBotToken } from './config.js';
import { handleSetup } from './setup.js';
import { tg, send, getMe, setupBotProfile, uploadProfilePhoto, userMainKb } from './tg.js';
import { getText, DEFAULT_TEXTS } from './texts.js';
import { html, text, json } from './util.js';
import { subLandingHtml } from './subs.js';
import { makeBrandQR } from './qr.js';
import { scheduled } from './jobs.js';
import { gameHtml, handleGameApi } from './game.js';
import { panelHtml, handlePanelApi, ensurePanelPassword } from './panel.js';
import { onBotJoinedGroup, welcomeNewMember, groupAiReply } from './group.js';
import { probeTargets, probeReport } from './cleanip.js';
import {
  handleStart, handleUserText, handleUserCallback, setState, showMainMenu, openProduct, openShop, handleReceiptPhoto,
} from './user.js';
import { openAdminPanel, handleAdminCallback, handleAdminText, handleWizardCallback, continueProductWizard } from './admin.js';
import { LOGO_JPG_B64 } from './logo.js';

const now = () => Math.floor(Date.now() / 1000);

async function rememberOrigin(env, origin) {
  try {
    if (!(await env.KV.get('worker_origin'))) await env.KV.put('worker_origin', origin);
  } catch (e) {
    console.error('origin cache failed', e);
  }
}

export { NovaStore };

export default {
  async fetch(request, envRaw, executionCtx) {
    let env = withStore(envRaw);
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      await initDb(env.DB);
      // تمام ماژول‌ها توکن را از DB می‌خوانند و فقط در نبود آن به env fallback می‌کنند.
      env = await withBotToken(env);
      // اولین درخواست، origin عمومی Worker را برای لینک‌ها و وب‌هوک ثبت می‌کند.
      await rememberOrigin(env, url.origin);
      if (path === '/setup' || path === '/setup/') return await handleSetup(env, request, url);
      if (path === `/webhook` || path === '/webhook/') return await webhook(request, env, url);
      if (path === '/api/probe/targets') {
        const targets = await probeTargets(env, Number(url.searchParams.get('n')) || 6);
        return json({ ok: true, targets });
      }
      if (path === '/api/probe/report') return await probeReport(env, request);
      if (path.startsWith('/api/game/')) return await handleGameApi(env, request, path);
      if (path.startsWith('/api/panel/')) return await handlePanelApi(env, request, path);
      if (path === '/panel' || path === '/panel/') return await panelHtml(env);
      if (path === '/app' || path === '/app/') return gameHtml(env);
      if (path.startsWith('/sub/')) return await subPage(env, path.slice(5));
      if (path === '/logo.png' || path === '/logo.jpg') {
        return new Response(Uint8Array.from(atob(LOGO_JPG_B64), (c) => c.charCodeAt(0)), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' } });
      }
      if (path === '/health') return json({ ok: true, ts: now() });
      if (path === '/' ) return html(landingHtml(!!env.TELEGRAM_BOT_TOKEN));
      return text('Not found', 404);
    } catch (e) {
      console.error('worker error', e);
      return json({ ok: false, error: String(e) }, 500);
    }
  },

  async scheduled(event, envRaw, ctx) {
    let env = withStore(envRaw);
    await initDb(env.DB);
    env = await withBotToken(env);
    ctx.waitUntil(scheduled(env));
  },
};

// ─────────────────────────── وب‌هوک تلگرام ───────────────────────────
async function webhook(request, env, url) {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) return json({ ok: false, error: 'TELEGRAM_BOT_TOKEN is not set' }, 500);

  // برای نصب‌های قدیمی که Secret دارند، ثبت وب‌هوک همچنان خودکار است.
  const origin = url.origin;
  if ((await getSetting(env.DB, 'setup_done')) !== '1') {
    const hook = await tg(token, 'setWebhook', { url: `${origin}/webhook`, drop_pending_updates: false });
    if (hook?.ok) await setSetting(env.DB, 'setup_done', '1');
  }

  let update;
  try {
    update = await request.json();
  } catch {
    return json({ ok: false });
  }

  try {
    await dispatch(update, env, token);
  } catch (e) {
    console.error('dispatch error', e);
  }
  return json({ ok: true });
}

async function dispatch(update, env, token) {
  const { DB } = env;

  // عضویت بات در گروه → ثبت خودکار
  const mcm = update.my_chat_member;
  if (mcm) {
    const st = mcm.new_chat_member?.status;
    const chat = mcm.chat;
    if ((chat.type === 'group' || chat.type === 'supergroup') && ['member', 'administrator'].includes(st)) {
      await onBotJoinedGroup(env, chat);
    }
    return;
  }

  const msg = update.message;
  const cb = update.callback_query;

  // ── پیام گروه ──
  if (msg && (msg.chat.type === 'group' || msg.chat.type === 'supergroup')) {
    const newMembers = msg.new_chat_members?.filter((m) => !m.is_bot);
    if (newMembers?.length) {
      for (const nm of newMembers) await welcomeNewMember(env, msg.chat, nm);
      return;
    }
    // /start و /help در گروه → هدایت به پیوی به‌جای سکوت
    const gtext = (msg.text || '').trim();
    if (/^\/(start|help)(@\w+)?$/i.test(gtext)) {
      const bu = await getBotUsername(env, token);
      await tg(token, 'sendMessage', {
        chat_id: msg.chat.id,
        text: '⚡ سلام! برای خرید کانفیگ، تست رایگان و پنل کاربری به پیوی من بیایید 👇',
        reply_markup: { inline_keyboard: [[{ text: '🛍 شروع در پیوی', url: `https://t.me/${bu}?start=shop_home` }]] },
      });
      return;
    }
    // چت هوش مصنوعی داخل گروه (ریپلای/منشن/«ربات ...»)
    await groupAiReply(env, msg, await getBotUsername(env, token));
    return; // خرید همچنان فقط در پیوی انجام می‌شود
  }

  // ── کال‌بک ──
  if (cb) {
    const uid = cb.from.id;
    const { user } = await ensureUser(DB, cb.from);
    if (!user || user.banned) return tg(token, 'answerCallbackQuery', { callback_query_id: cb.id, text: '⛔' });
    const ctx = { env, db: DB, token, user: await getUser(DB, uid), update, cbId: cb.id, botUsername: await getBotUsername(env, token) };
    const data = cb.data || '';
    if (data.startsWith('adm:') || data === 'panel' || data.startsWith('rcpt:') || data.startsWith('npw:') || data.startsWith('nsw:')) {
      if (!isAdmin(ctx.user)) return tg(token, 'answerCallbackQuery', { callback_query_id: cb.id, text: '⛔ دسترسی ندارید' });
      if (data.startsWith('npw:') || data.startsWith('nsw:')) return handleWizardCallback(ctx, data);
      return handleAdminCallback(ctx, data);
    }
    return handleUserCallback(ctx, data);
  }

  // ── پیام پیوی ──
  if (msg && msg.chat.type === 'private') {
    const tgUser = msg.from;
    if (!tgUser) return;
    let deepPayload = '';
    if (msg.text?.startsWith('/start')) {
      deepPayload = msg.text.slice(6).trim();
      if (deepPayload.startsWith('@')) deepPayload = deepPayload.replace(/^@\S+\s*/, '');
    }
    const { user, isNew } = await ensureUser(DB, tgUser, deepPayload);

    if (isNew) {
      await postFirstRunSetup(env, token);
      if (user.role === 'super') {
        await send(token, tgUser.id, '👑 <b>شما به عنوان سوپرادمین ثبت شدید!</b>\nدکمه «📊 پنل مدیریت» همیشه در منوی شماست.\nحالا پروفایل بات به‌صورت خودکار تنظیم می‌شود... ⏳');
      }
    }

    if (user.banned && !(msg.text || '').startsWith('/start')) return;
    const ctx = { env, db: DB, token, user: await getUser(DB, tgUser.id), update, isNew, botUsername: await getBotUsername(env, token) };

    if ((msg.text || '').startsWith('/start')) {
      await setState(ctx, '');
      return handleStart(ctx, deepPayload);
    }

    // ادمین در حالت وارد کردن داده؟
    if ((ctx.user.state || '').startsWith('admin:')) {
      if ((msg.text || '').trim() === '/cancel') {
        const handledCancel = await handleAdminText(ctx, '/cancel');
        if (handledCancel !== null) return;
      }
      if (ctx.user.state === 'admin:newprod') {
        let step = 1;
        try {
          step = JSON.parse(ctx.user.state_data || '{}').step || 1;
        } catch {}
        if (step >= 3) {
          await continueProductWizard(ctx, msg.text || '');
          return;
        }
        // مرحله ۲ (انتخاب دسته) با دکمه انجام می‌شود
        return send(token, tgUser.id, '👇 دسته‌بندی را از دکمه‌ها انتخاب کنید.');
      }
      const handled = await handleAdminText(ctx, msg.text || '');
      if (handled !== null) return;
    }

    if (msg.text) return handleUserText(ctx, msg.text);
    if (msg.photo) return handleReceiptPhoto(ctx, msg.photo);
    if (msg.document) return send(token, tgUser.id, '🧾 لطفاً فیش را به صورت تصویر (عکس) ارسال کنید.');
    return;
  }
}

let firstRunLock = false;
async function postFirstRunSetup(env, token) {
  if (firstRunLock) return;
  firstRunLock = true;
  try {
    if ((await getSetting(env.DB, 'profile_done')) === '1') return;
    const bot = await getMe(token);
    if (bot?.username) await setSetting(env.DB, 'bot_username', bot.username);
    await setupBotProfile(token, {
      bot_name: await getText(env.DB, 'bot_name'),
      bot_description: await getText(env.DB, 'bot_description'),
      bot_short: await getText(env.DB, 'bot_short'),
    });
    try {
      const bytes = Uint8Array.from(atob(LOGO_JPG_B64), (c) => c.charCodeAt(0));
      await uploadProfilePhoto(token, bytes, 'logo.jpg');
    } catch (e) {
      console.error('photo upload failed', e);
    }
    await ensurePanelPassword(env.DB);
    await setSetting(env.DB, 'profile_done', '1');
  } catch (e) {
    console.error('setup failed', e);
  } finally {
    firstRunLock = false;
  }
}

async function getBotUsername(env, token) {
  let u = await getSetting(env.DB, 'bot_username');
  if (!u) {
    const me = await getMe(token);
    if (me?.username) {
      u = me.username;
      await setSetting(env.DB, 'bot_username', u);
    }
  }
  return u || '';
}

// ─────────────────────────── صفحه ساب ───────────────────────────
async function subPage(env, token) {
  const sub = await env.DB.prepare('SELECT * FROM subscriptions WHERE token=?').bind(token).first();
  if (!sub) return html('<h3>⛔ لینک معتبر نیست</h3>', 404);
  return html(await subLandingHtml(env, sub));
}

// ─────────────────────────── لندینگ ───────────────────────────
function landingHtml(hasToken = true) {
  const setupBox = hasToken
    ? ''
    : `<div class="warn"><b>⚠️ ربات هنوز پیکربندی نشده است</b>
<p style="margin:8px 0 0">برای راه‌اندازی اولیه، توکن BotFather را در صفحه ستاپ وارد کنید.</p>
<a href="/setup" style="margin-top:10px;padding:10px 16px;font-size:13px">🔐 رفتن به صفحه راه‌اندازی</a></div>`;
  return landingShell(setupBox);
}

function landingShell(setupBox) {
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AMINCK Nova Bot</title>
<style>body{font-family:Vazirmatn,Segoe UI,sans-serif;background:#0d1526;color:#eaf1ff;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
.c{text-align:center;max-width:520px;padding:24px}h1{font-size:26px}.g{color:#f5b31e;font-size:44px;margin-bottom:8px}
a{display:inline-block;background:linear-gradient(135deg,#f5b31e,#ff8a00);color:#171305;font-weight:800;border-radius:14px;padding:14px 28px;text-decoration:none;margin-top:18px}
p{color:#8fa3c8;font-size:14px;line-height:2}
.warn{background:#3a2a10;border:1px solid #7a5a1a;color:#ffd9a8;border-radius:14px;padding:16px;margin-top:18px;text-align:right;font-size:13px}
.warn code{background:#0d1526;padding:2px 6px;border-radius:6px;color:#f5b31e;direction:ltr;display:inline-block}</style></head><body><div class="c">
<div class="g">⚡</div><h1>ربات فروش کانفیگ AMINCK</h1>
<p>فروشگاه خودکار کانفیگ روی Cloudflare Workers — تحویل آنی، تست رایگان، رفرال، مینی‌اپ سکه‌ای و هوش مصنوعی بومی کلادفلر</p>
<a href="/panel">🖥 ورود به پنل مدیریت</a>
${setupBox}
</div></body></html>`;
}
