// ═══════════════════════════════════════════════════════════════════
//  🧪 پست شیشه‌ای — Glass Post Studio (کاربری + ادمین + وب)
//
//  خواستهٔ کاربر: «متن/پست شیشه‌ای با دکمه شیشه‌ای که در گروه
//  @BotName 31763 را بنویسم و پست منتشر شود».
//
//  ⚠️ واقعیت API تلگرام (مهم‌ترین محدودیت — صادقانه مستند شده):
//  نتیجه‌ای که کاربر از Inline Mode انتخاب می‌کند فقط «محتوای متنی» دارد
//  (InputTextMessageContent) و تلگرام اجازه نمی‌دهد روی آن reply_markup
//  (دکمه شیشه‌ای) گذاشت. پس سه مسیر واقعی داریم:
//    ۱) Inline → کارت متنی شیشه‌ای با دکمه‌های لینکی [عنوان](url)   ← همه‌جا کار می‌کند
//    ۲) فوروارد پیام پیش‌نمای ربات → دکمه‌های شیشه‌ای واقعی حفظ می‌شوند
//    ۳) ربات خودش پست می‌کند (عضو گروه / ادمین کانال):
//       • «📤 انتشار در این چت» روی پیش‌نما
//       • /glass post <code>  داخل گروه  یا  /glass post <code> @channel
//       • glass_auto_post=۱ + انتخاب نتیجه از منوی چسبان (chosen_inline_result)
//  هیچ‌کدام جعلی نیست و هر کدام با برچسب خودش توضیح داده می‌شود.
//
//  تنظیمات (پنل وب / ✍️ متن‌ها، بدون کد):
//    glass_enabled, glass_public, glass_max_buttons, glass_daily_limit,
//    glass_auto_post, glass_show_ref, glass_web_enabled
// ═══════════════════════════════════════════════════════════════════
import { esc, html, json, getBase, hmacSha256, toHex, verifyInitData } from './util.js';
import { faDigits } from './db.js';
import { send, tg } from './tg.js';
import { getSettingValue } from './texts.js';
import { t as i18nT, ti18n } from './i18n.js';

const MAX_BODY = 1400;
const MAX_BTN_DEFAULT = 6;
export const STYLES = ['aurora', 'neon', 'minimal', 'royal', 'dark', 'candy'];

export const GLASS_STYLES = {
  aurora: { name: '🌌 اورورا', line: '▰▱▰▱▰', accent: '#7ee8fa' },
  neon: { name: '💜 نئون', line: '▮▯▮▯▮', accent: '#c084fc' },
  minimal: { name: '⚪ مینیمال', line: '─────────', accent: '#94a3b8' },
  royal: { name: '👑 سلطنتی', line: '◆ ◇ ◆ ◇ ◆', accent: '#f5c451' },
  dark: { name: '🖤 دارک', line: '▓▒░ ░▒▓', accent: '#22d3ee' },
  candy: { name: '🍭 آبنباتی', line: '❃ ❀ ❃ ❀ ❃', accent: '#fb7185' },
};

const num5 = () => String(10000 + Math.floor(Math.random() * 90000));
const setting = async (db, key, def = '') => {
  const v = await getSettingValue(db, key);
  return v === '' || v === null || v === undefined ? def : v;
};
export const glassSetting = setting;

function parseButtons(raw, max = MAX_BTN_DEFAULT) {
  let arr = [];
  try {
    arr = JSON.parse(raw || '[]');
  } catch {
    arr = [];
  }
  if (!Array.isArray(arr)) arr = [];
  return arr
    .slice(0, Math.max(0, max))
    .map((b) => ({ t: String(b?.t || '').slice(0, 40), u: String(b?.u || '').slice(0, 300) }))
    .filter((b) => b.t && /^https?:\/\//i.test(b.u));
}

/* ─────────────────────────── CRUD ─────────────────────────── */
const row = (r) =>
  !r
    ? null
    : {
        id: Number(r.id),
        code: String(r.code),
        userId: Number(r.user_id),
        title: r.title || '',
        body: r.body || '',
        buttons: parseButtons(r.buttons, Number.MAX_SAFE_INTEGER),
        photo: r.photo || '',
        style: GLASS_STYLES[r.style] ? r.style : 'aurora',
        refCta: Number(r.ref_cta || 0),
        uses: Number(r.uses || 0),
        views: Number(r.views || 0),
        active: Number(r.active ?? 1),
        origin: r.origin || 'pv',
        createdAt: Number(r.created_at || 0),
      };

export async function createGlassPost(db, { userId, title = '', body = '', buttons = [], photo = '', style = 'aurora', refCta = 0, origin = 'pv' }) {
  const clean = String(body || '').replace(/\r/g, '').slice(0, MAX_BODY).trim();
  if (!clean) throw new Error('متن پست خالی است');
  const btns = parseButtons(JSON.stringify(buttons || []), await maxButtons(db));
  const st = GLASS_STYLES[style] ? style : 'aurora';
  const ts = Math.floor(Date.now() / 1000);
  for (let i = 0; i < 40; i++) {
    const code = num5();
    const res = await db
      .prepare('INSERT INTO glass_posts (code,user_id,title,body,buttons,photo,style,ref_cta,origin,uses,views,active,created_at) VALUES (?,?,?,?,?,?,?,?,?,0,0,1,?)')
      .bind(code, userId, String(title || '').slice(0, 60), clean, JSON.stringify(btns), String(photo || '').slice(0, 200), st, refCta ? 1 : 0, origin, ts)
      .run();
    const id = Number(res?.meta?.last_row_id || 0);
    const p = id ? await getGlassById(db, id) : await getGlassByCode(db, code);
    if (p) return p;
    return row({ id, code, user_id: userId, title: String(title || '').slice(0, 60), body: clean, buttons: JSON.stringify(btns), photo, style: st, ref_cta: refCta ? 1 : 0, origin, created_at: ts });
  }
  throw new Error('ساخت کد ممکن نشد');
}

/** ساخت/به‌روزرسانی پست — برای وب (اگر id داده شود آپدیت می‌شود و کد ثابت می‌ماند) */
export async function saveGlassPost(db, { id = 0, userId, title = '', body = '', buttons = [], photo = '', style = 'aurora', refCta = 0, origin = 'web' }) {
  if (id) {
    const p = await getGlassById(db, Number(id));
    if (!p || p.userId !== userId) return { ok: false, error: '⛔ پست پیدا نشد یا مال شما نیست.' };
    const clean = String(body || '').replace(/\r/g, '').slice(0, MAX_BODY).trim();
    if (!clean) return { ok: false, error: 'متن پست خالی است' };
    const btns = parseButtons(JSON.stringify(buttons || []), await maxButtons(db));
    await db
      .prepare('UPDATE glass_posts SET title=?, body=?, buttons=?, photo=?, style=?, ref_cta=? WHERE id=? AND user_id=?')
      .bind(String(title || '').slice(0, 60), clean, JSON.stringify(btns), String(photo || '').slice(0, 200), GLASS_STYLES[style] ? style : 'aurora', refCta ? 1 : 0, p.id, userId)
      .run();
    return { ok: true, post: await getGlassById(db, p.id) };
  }
  const p = await createGlassPost(db, { userId, title, body, buttons, photo, style, refCta, origin });
  return { ok: true, post: p };
}

export async function getGlassById(db, id) {
  const r = await db.prepare('SELECT * FROM glass_posts WHERE id=? LIMIT 1').bind(Number(id) || 0).first();
  return row(r);
}
export async function getGlassByCode(db, code) {
  const r = await db.prepare('SELECT * FROM glass_posts WHERE code=? LIMIT 1').bind(String(code || '').slice(0, 8)).first();
  return row(r);
}
export async function getGlassByPhoto(db, fileId) {
  const r = await db.prepare("SELECT * FROM glass_posts WHERE photo=? ORDER BY id DESC LIMIT 1").bind(String(fileId)).first();
  return row(r);
}
export async function listGlass(db, userId, limit = 25) {
  const r = await db.prepare('SELECT * FROM glass_posts WHERE user_id=? ORDER BY id DESC LIMIT ?').bind(userId, Math.max(1, Math.min(100, Number(limit) || 25))).all();
  return (r.results || []).map(row).filter(Boolean);
}
export async function countGlassSince(db, userId, dayIso) {
  const r = await db.prepare('SELECT COUNT(*) c FROM glass_posts WHERE user_id=? AND created_at>=?').bind(userId, dayIso).first();
  return Number(r?.c || 0);
}
export async function countGlassToday(db, userId) {
  const start = Math.floor(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()) / 1000);
  return countGlassSince(db, userId, start);
}
export async function maxButtons(db) {
  const n = Number(await setting(db, 'glass_max_buttons', MAX_BTN_DEFAULT));
  return Math.max(0, Math.min(10, Number.isFinite(n) ? n : MAX_BTN_DEFAULT));
}
export const deleteGlass = (db, id, userId, isAdmin = false) =>
  isAdmin ? db.prepare('DELETE FROM glass_posts WHERE id=?').bind(Number(id)).run() : db.prepare('DELETE FROM glass_posts WHERE id=? AND user_id=?').bind(Number(id), userId).run();
export const bumpGlass = (db, id, what = 'uses') =>
  db.prepare(`UPDATE glass_posts SET ${what === 'views' ? 'views' : 'uses'} = COALESCE(${what === 'views' ? 'views' : 'uses'},0) + 1 WHERE id=?`).bind(Number(id)).run();

/** پست دعوت شیشه‌ای هر کاربر (کد ثابت می‌ماند، محتوا تازه می‌شود) */
export async function ensureRefGlass(db, { userId, botUsername = 'bot', percent = 10, coins = 25, lang = 'fa' }) {
  const link = `https://t.me/${botUsername}?start=ref_${userId}`;
  const exist = row(await db.prepare("SELECT * FROM glass_posts WHERE user_id=? AND origin='ref' LIMIT 1").bind(userId).first());
  const meta = GLASS_STYLES[exist?.style] || GLASS_STYLES.aurora;
  const body =
    `${meta.line}\n⚡️ ${i18nT(lang, 'glass_ref_head')}\n\n` +
    `🔥 ${i18nT(lang, 'glass_ref_l1')}\n🛡 ${i18nT(lang, 'glass_ref_l2')}\n🎁 ${faDigits(percent)}٪ ${i18nT(lang, 'glass_ref_l3')}\n\n` +
    `👇 ${faDigits(coins)} 🪙\n${meta.line}`;
  const buttons = [{ t: `🚀 ${i18nT(lang, 'glass_ref_btn')}`, u: link }];
  if (exist) {
    await db.prepare('UPDATE glass_posts SET body=?, buttons=?, ref_cta=1, active=1 WHERE id=?').bind(body, JSON.stringify(buttons), exist.id).run();
    return { ...exist, body, buttons, refCta: 1 };
  }
  return createGlassPost(db, { userId, title: '👥 پست دعوت من', body, buttons, style: exist?.style || 'aurora', refCta: 1, origin: 'ref' });
}

/* ─────────────────────────── رندر برای تلگرام ─────────────────────────── */
/** کارت شیشه‌ای متنی + دکمه‌های لینکی (HTML) — همان چیزی که در اینلاين در گروه می‌افتد */
export function glassTelegramText(p, { bot = '', lang = 'fa', cta = null, footer = true } = {}) {
  const meta = GLASS_STYLES[p.style] || GLASS_STYLES.aurora;
  const out = [];
  out.push(`<b>${esc(`${meta.line}`)}</b>`);
  if (p.title) out.push(`\n<b>✨ ${esc(p.title)}</b>`);
  out.push(`\n\n${esc(p.body)}`);
  if (p.buttons.length) {
    out.push(`\n\n<b>${esc(meta.line)}</b>`);
    for (const b of p.buttons) out.push(`\n<a href="${esc(b.u)}">⚡️ ${esc(b.t)}</a>`);
  }
  if (cta?.link) out.push(`\n\n🎁 <a href="${esc(cta.link)}">${esc(cta.label || 'لینک من')}</a>`);
  if (p.refCta && bot) out.push(`\n👥 <a href="https://t.me/${esc(bot)}?start=ref_${p.userId}">${esc(i18nT(lang, 'glass_ref_cta'))}</a>`);
  if (footer) out.push(`\n\n<code>@${esc(bot || 'bot')} ${esc(p.code)}</code> · <i>${esc(i18nT(lang, 'glass_made_by'))}</i>`);
  return out.join('');
}

/** کیبورد شیشه‌ای واقعی (InlineKeyboard) — فقط وقتی ربات خودش پست می‌کند */
export function glassKeyboard(p, { bot = '', publicUrl = '', ownerActions = false } = {}) {
  const rows = [];
  const all = [...p.buttons];
  if (p.refCta && bot) all.push({ t: `👥 ${i18nT('fa', 'glass_ref_cta')}`, u: `https://t.me/${bot}?start=ref_${p.userId}` });
  for (let i = 0; i < all.length; i += 2) rows.push(all.slice(i, i + 2).map((b) => ({ text: b.t, url: b.u })));
  if (publicUrl) rows.push([{ text: `🌐 ${i18nT('fa', 'glass_open_page')}`, url: publicUrl }]);
  if (ownerActions) {
    rows.push([
      { text: '📤 انتشار در این چت', callback_data: `gl:pub:${p.id}` },
      { text: '✏️ ویرایش', callback_data: `gl:edit:${p.id}` },
    ]);
    rows.push([{ text: '🗑 حذف پست', callback_data: `gl:del:${p.id}` }]);
  }
  if (!rows.length) rows.push([{ text: '✨ AMINCK', url: publicUrl || `https://t.me/${bot || ''}` }]);
  return { inline_keyboard: rows };
}

export const glassUrl = (origin, p) => (origin ? `${String(origin).replace(/\/$/, '')}/g/${p.code}` : '');

/** انتشار واقعی با دکمه‌های شیشه‌ای (عکس‌دار → sendPhoto + caption) */
export async function publishGlass(db, token, chatId, p, { bot = '', origin = '', replyTo = 0, silent = false } = {}) {
  const url = glassUrl(origin, p);
  const text = glassTelegramText(p, { bot });
  const markup = glassKeyboard(p, { bot, publicUrl: url });
  let r;
  if (p.photo) {
    const caption = text.length > 1000 ? text.slice(0, 997) + '…' : text;
    r = await tg(token, 'sendPhoto', {
      chat_id: chatId,
      photo: p.photo,
      caption,
      parse_mode: 'HTML',
      reply_to_message_id: replyTo || undefined,
      disable_notification: silent || undefined,
      reply_markup: markup,
    });
  } else {
    r = await send(token, chatId, text, {
      reply_markup: markup,
      disable_notification: silent || undefined,
      ...(replyTo ? { reply_parameters: { chat_id: chatId, message_id: replyTo } } : {}),
    });
  }
  if (r?.ok) await bumpGlass(db, p.id, 'uses');
  return r;
}

/* ─────────────────────────── Inline Mode ─────────────────────────── */
export async function inlineGlassResults(db, { query = '', bot = '', origin = '', userId = 0, lang = 'fa' } = {}) {
  const q = String(query || '').trim();
  const rawLimit = Number(await setting(db, 'inline_limit', 12)) || 12;
  const limit = Math.max(1, Math.min(25, rawLimit));
  const enabled = (await setting(db, 'glass_enabled', '1')) === '1';
  if (!enabled) return [];
  const mk = (p, title, desc) => ({
    type: 'article',
    id: `gl_${p.code}`,
    title: title.slice(0, 60),
    description: desc.slice(0, 120),
    input_message_content: { message_text: glassTelegramText(p, { bot, lang }), parse_mode: 'HTML', disable_web_page_preview: true },
  });
  const out = [];
  const codeM = q.match(/^#?(\d{4,8})$/);
  if (codeM) {
    const p = await getGlassByCode(db, codeM[1]);
    if (p && p.active) {
      out.push(mk(p, `🧪 انتشار پست ${p.code}`, 'کارت شیشه‌ای + دکمه‌های لینکی'));
      out.push({
        type: 'article',
        id: `glc_${p.code}`,
        title: `📋 کپی متن پست ${p.code}`,
        description: 'فقط متن، بدون دکمه',
        input_message_content: { message_text: p.body, parse_mode: 'HTML', disable_web_page_preview: true },
      });
    } else if (p && !p.active) {
      out.push({ type: 'article', id: `glo_${p.code}`, title: '⛔ این پست غیرفعال شده', description: 'سازنده آن را خاموش کرده', input_message_content: { message_text: '⛔ این پست شیشه‌ای غیرفعال شده است.' } });
    } else {
      out.push({ type: 'article', id: 'gnf_' + codeM[1], title: `⛔ کد ${codeM[1]} پیدا نشد`, description: 'کد ۵ رقمی را از سازنده پست بگیر', input_message_content: { message_text: `⛔ پست شیشه‌ای با کد <code>${esc(codeM[1])}</code> وجود ندارد.` } });
    }
  } else if (q) {
    const all = await listGlass(db, userId, 40);
    const lc = q.toLowerCase();
    const hits = all.filter((x) => `${x.title} ${x.body} ${x.code}`.toLowerCase().includes(lc)).slice(0, limit);
    for (const gp of hits) {
      out.push(mk(gp, `🧪 ${gp.title || 'پست ' + gp.code}`, gp.body.replace(/\s+/g, ' ').slice(0, 60)));
    }
  }
  if (!out.length) {
    out.push({
      type: 'article',
      id: 'ghelp',
      title: '🧪 پست شیشه‌ای — کد ۵ رقمی را بنویس',
      description: 'مثلاً: 31763 · ساخت پست در پیوی با /glass',
      input_message_content: {
        message_text: `🧪 برای ساخت پست شیشه‌ای در پیوی ${bot ? '@' + bot : 'ربات'} دستور <code>/glass</code> را بفرست؛ بعد کد ۵ رقمی را در هر گروهی بنویس: <code>@${esc(bot || 'bot')} 31763</code>`,
        parse_mode: 'HTML',
      },
    });
  }
  return out.slice(0, limit);
}

/** کاربر نتیجهٔ inline را انتخاب کرد: آمار + (اختیاری) انتشار نسخهٔ دکمه‌دار */
export async function handleChosenInline(env, token, result, botUsername) {
  const id = String(result?.result_id || '');
  if (!/^(gl|glc|glo)_/.test(id)) return false;
  const code = id.split('_')[1];
  if (!code) return false;
  const p = await getGlassByCode(env.DB, code);
  if (!p) return false;
  await bumpGlass(env.DB, p.id, 'uses');
  const auto = (await setting(env.DB, 'glass_auto_post', '0')) === '1';
  const loc = result?.location;
  if (auto && loc?.chat_id && id.startsWith('gl_')) {
    const origin = await getSettingValue(env.DB, 'worker_origin');
    const r = await publishGlass(env.DB, token, loc.chat_id, p, { bot: botUsername, origin });
    if (!r?.ok) {
      // نتوانستیم جایگزین کنیم؛ همان متن inline در چت می‌ماند و فقط آمار ثبت می‌شود
      await tg(token, 'sendMessage', { chat_id: p.userId, text: `ℹ️ پست <code>${p.code}</code> انتخاب شد ولی ربات نتوانست نسخهٔ دکمه‌دار را بفرستد (${esc(String(r?.description || 'خطای شبکه')).slice(0, 90)}).` });
    }
  }
  return true;
}

/* ─────────────────────────── استودیو در پیوی ─────────────────────────── */
const getStateData = (ctx) => {
  try {
    return JSON.parse(ctx.user.state_data || '{}') || {};
  } catch {
    return {};
  }
};
const setSt = async (ctx, state, data = null) => {
  await ctx.db.prepare('UPDATE users SET state=?, state_data=? WHERE id=?').bind(state, data === null ? '{}' : JSON.stringify(data), ctx.user.id).run();
  ctx.user.state = state;
};

export async function glassMenu(ctx) {
  const { db, token, user } = ctx;
  const lang = user.lang || 'fa';
  if ((await setting(db, 'glass_enabled', '1')) !== '1') return send(token, user.id, '🧪 پست شیشه‌ای فعلاً توسط ادمین غیرفعال است.');
  const origin = await getBase(ctx.env);
  const maxBtn = await maxButtons(db);
  const daily = Number(await setting(db, 'glass_daily_limit', 0)) || 0;
  const made = await countGlassToday(db, user.id);
  const mine = await listGlass(db, user.id, 100);
  const totalUses = mine.reduce((a, p) => a + p.uses, 0);
  const totalViews = mine.reduce((a, p) => a + p.views, 0);
  const text =
    `${(await ti18n(db, lang, 'glass_title')).replaceAll('{bot}', ctx.botUsername || 'bot')}\n\n` +
    `🧱 <b>استودیوی شیشه‌ای</b>\n` +
    `🎨 ${STYLES.length} سبک: ${STYLES.map((s) => GLASS_STYLES[s].name).join(' · ')}\n` +
    `🔘 تا ${faDigits(maxBtn)} دکمه + تصویر + صفحهٔ وب اختصاصی\n` +
    `📊 پست‌های شما: ${faDigits(mine.length)} · انتشار: ${faDigits(totalUses)} · بازدید: ${faDigits(totalViews)}\n` +
    (daily > 0 ? `⏳ ساخت امروز: ${faDigits(made)} از ${faDigits(daily)}\n` : '') +
    `\n📌 انتشار در گروه/کانال: بنویسید <code>@${esc(ctx.botUsername || 'bot')} 31763</code> و نتیجه را انتخاب کنید.`;
  const rows = [
    [{ text: '➕ ساخت پست جدید', callback_data: 'gl:new' }, { text: '👥 پست دعوت من', callback_data: 'gl:ref' }],
    [{ text: '📋 پست‌های من', callback_data: 'gl:list' }, { text: '📊 آمار', callback_data: 'gl:stats' }],
  ];
  if ((await setting(db, 'glass_web_enabled', '1')) === '1') {
    const studio = await glassStudioUrl(ctx.env, null, user.id);
    if (studio) rows.push([{ text: '🖥 استودیوی گرافیکی پست شیشه‌ای', url: studio }]);
  }
  rows.push([{ text: 'ℹ️ راهنمای انتشار', callback_data: 'gl:how' }]);
  return send(token, user.id, text, { reply_markup: { inline_keyboard: rows } });
}

async function previewGlass(ctx, p, { note = '' } = {}) {
  const origin = await getBase(ctx.env);
  const url = glassUrl(origin, p);
  const text =
    glassTelegramText(p, { bot: ctx.botUsername, lang: ctx.user.lang || 'fa' }) +
    `\n\n📊 انتشار: ${faDigits(p.uses)} · بازدید صفحه: ${faDigits(p.views)}` +
    (p.photo ? '\n🖼 این پست تصویر دارد' : '') +
    (note ? `\n${note}` : '');
  const kb = glassKeyboard(p, { bot: ctx.botUsername, publicUrl: url, ownerActions: true });
  await send(ctx.token, ctx.user.id, text, { reply_markup: kb });
  if (url) await send(ctx.token, ctx.user.id, `🔗 لینک صفحهٔ شیشه‌ای (برای بیو، کانال، استوری):\n<code>${esc(url)}</code>`);
}

export async function handleGlassCallback(ctx, data) {
  const { db, token, user } = ctx;
  const lang = user.lang || 'fa';
  const [, ...rest] = data.split(':');
  const act = rest.join(':');
  if (act.startsWith('cfg:')) return createConfigGlassPost(ctx, act.slice(4));
  const answer = (text = '') => tg(token, 'answerCallbackQuery', { callback_query_id: ctx.cbId, text: text || undefined });

  if (act === 'how') {
    const bot = ctx.botUsername || 'bot';
    return send(
      token,
      user.id,
      `📤 <b>سه روش انتشار (هر سه واقعی‌اند)</b>\n\n` +
        `<b>۱) Inline — سریع و همه‌جا</b>\n` +
        `در گروه یا کانال بنویس: <code>@${esc(bot)} 31763</code> سپس نتیجه را انتخاب کن.\n` +
        `پیام با ظاهر شیشه‌ای و <b>دکمه‌های لینکی</b> منتشر می‌شود.\n` +
        `<i>محدودیت تلگرام: نتیجهٔ inline نمی‌تواند inline keyboard داشته باشد — برای همین دکمه‌ها به‌صورت لینک نمایش داده می‌شوند.</i>\n\n` +
        `<b>۲) فوروارد پیش‌نما — دکمه شیشه‌ای واقعی</b>\n` +
        `پیام پیش‌نمای ربات را فوروارد کن؛ فوروارد کردن، دکمه‌های زیر پیام ربات را نگه می‌دارد.\n\n` +
        `<b>۳) انتشار توسط ربات</b>\n` +
        `• داخل گروه (ربات عضو باشد): <code>/glass post 31763</code>\n` +
        `• کانال (ربات ادمین باشد): <code>/glass post 31763 @channel</code>\n` +
        `• دکمهٔ «📤 انتشار در این چت» روی پیش‌نما\n\n` +
        `🌐 هر پست یک صفحهٔ وب شیشه‌ای هم دارد: <code>/g/&lt;code&gt;</code>`,
      { disable_web_page_preview: true }
    );
  }
  if (act === 'new') {
    const daily = Number(await setting(db, 'glass_daily_limit', 0)) || 0;
    if (daily > 0 && (await countGlassToday(db, user.id)) >= daily) {
      await answer(`⛔ سقف روزانه (${faDigits(daily)}) پر شد`);
      return;
    }
    if ((await setting(db, 'glass_public', '1')) !== '1' && user.role === 'user' && Number(user.total_paid || 0) <= 0) {
      return send(token, user.id, '⛔ فعلاً فقط خریداران و ادمین‌ها می‌توانند پست بسازند (تنظیم <code>glass_public</code>).');
    }
    await setSt(ctx, 'glass:body', {});
    return send(token, user.id, `${i18nT(lang, 'glass_ask_text')}\n\n⚠️ حداکثر ${faDigits(MAX_BODY)} کاراکتر · برای انصراف <code>/cancel</code>`);
  }
  if (act === 'stats') {
    const all = await listGlass(db, user.id, 200);
    const top = [...all].sort((a, b) => b.uses - a.uses).slice(0, 5);
    return send(
      token,
      user.id,
      `📊 <b>آمار پست‌های شیشه‌ای شما</b>\n\n` +
        `🧱 پست‌ها: ${faDigits(all.length)}\n` +
        `📤 انتشار: ${faDigits(all.reduce((a, p) => a + p.uses, 0))}\n` +
        `👁 بازدید صفحه: ${faDigits(all.reduce((a, p) => a + p.views, 0))}\n\n` +
        (top.length ? `🔥 پربازدیدترین‌ها:\n${top.map((p, i) => `${faDigits(i + 1)}. <code>${p.code}</code> — ${faDigits(p.uses)} انتشار / ${faDigits(p.views)} بازدید`).join('\n')}` : `<i>هنوز پستی نداری.</i>`),
      { disable_web_page_preview: true }
    );
  }
  if (act === 'list') {
    const mine = await listGlass(db, user.id, 20);
    if (!mine.length) return send(token, user.id, '📭 هنوز پستی نساخته‌اید. «➕ ساخت پست جدید»');
    const kb = {
      inline_keyboard: mine.map((p) => [
        { text: `${GLASS_STYLES[p.style].name.split(' ')[0]} ${p.code} · ${faDigits(p.uses)}📤`, callback_data: `gl:show:${p.id}` },
        { text: '🗑', callback_data: `gl:del:${p.id}` },
      ]),
    };
    kb.inline_keyboard.push([{ text: '➕ پست جدید', callback_data: 'gl:new' }]);
    return send(token, user.id, `📋 <b>پست‌های شیشه‌ای من</b> (${faDigits(mine.length)})\n\nبا زدن روی هر کد، پیش‌نما + دکمه‌های انتشار می‌آید.`, { reply_markup: kb });
  }
  if (act === 'ref') {
    const percent = Number(await setting(db, 'referral_percent', 10)) || 10;
    const coins = Number(await setting(db, 'referral_coins', 25)) || 25;
    const p = await ensureRefGlass(db, { userId: user.id, botUsername: ctx.botUsername || 'bot', percent, coins, lang });
    await previewGlass(ctx, p, { note: `👥 <i>هر بار پست دعوت شما در گروهی منتشر شود، این آمار بالا می‌رود و دعوت‌ها با لینک شما ثبت می‌شوند.</i>` });
    return;
  }
  if (act.startsWith('show:')) {
    const p = await getGlassById(db, Number(act.split(':')[1]));
    if (!p || (p.userId !== user.id && !['super', 'admin'].includes(user.role))) return send(token, user.id, '⛔ پست پیدا نشد.');
    return previewGlass(ctx, p);
  }
  if (act.startsWith('edit:')) {
    const p = await getGlassById(db, Number(act.split(':')[1]));
    if (!p || (p.userId !== user.id && !['super', 'admin'].includes(user.role))) return send(token, user.id, '⛔ دسترسی نداری.');
    await setSt(ctx, 'glass:body', { editId: p.id, body: p.body, title: p.title, buttons: p.buttons, style: p.style, photo: p.photo });
    return send(token, user.id, `✏️ متن جدید پست <code>${p.code}</code> را بفرست (کد و آمار حفظ می‌شود):`);
  }
  if (act.startsWith('del:')) {
    const p = await getGlassById(db, Number(act.split(':')[1]));
    if (!p || (p.userId !== user.id && !['super', 'admin'].includes(user.role))) return send(token, user.id, '⛔ دسترسی نداری.');
    await deleteGlass(db, p.id, p.userId, ['super', 'admin'].includes(user.role));
    return send(token, user.id, `🗑 پست <code>${esc(p.code)}</code> حذف شد.`);
  }
  if (act.startsWith('pub:')) {
    const p = await getGlassById(db, Number(act.split(':')[1]));
    if (!p || (p.userId !== user.id && !['super', 'admin'].includes(user.role))) return answer('⛔ دسترسی نداری');
    const origin = await getBase(ctx.env);
    const r = await publishGlass(db, token, user.id, p, { bot: ctx.botUsername, origin });
    await answer(r?.ok ? '✅ در پیوی منتشر شد — حالا فورواردش کن' : '⚠️ ارسال ناموفق');
    if (r?.ok) await send(token, user.id, '✅ پست با <b>دکمه‌های شیشه‌ای واقعی</b> در پیوی شما قرار گرفت.\n👉 حالا آن پیام را در گروه/کانال دلخواه <b>فوروارد</b> کنید؛ دکمه‌ها حفظ می‌شوند.');
    return;
  }
  if (act.startsWith('style:')) {
    const style = act.split(':')[1];
    const d = getStateData(ctx);
    await setSt(ctx, 'glass:btn', { ...d, style });
    const maxBtn = await maxButtons(db);
    return send(
      token,
      user.id,
      `🎨 سبک: <b>${esc(GLASS_STYLES[style]?.name || style)}</b>\n\n` +
        `🖼 اختیاری: یک <b>عکس</b> بفرست (یا <code>/skip</code>)\n` +
        `🔘 دکمه‌ها را بفرست — هر دکمه دو خط:\n<code>عنوان دکمه</code>\n<code>https://...</code>\n\n` +
        `حداکثر ${faDigits(maxBtn)} دکمه · برای پایان: <code>تمام</code>`,
      { disable_web_page_preview: true }
    );
  }
  if (act === 'cancel') {
    await setSt(ctx, '', null);
    return send(token, user.id, '❌ استودیو بسته شد.', { reply_markup: { remove_keyboard: true } });
  }
  return answer('');
}

/** ورودی متنی کاربر داخل استودیو (متن/عنوان/دکمه‌ها) */
export async function handleGlassText(ctx, text) {
  const { db, token, user } = ctx;
  const st = ctx.user.state || '';
  if (!st.startsWith('glass:')) return null;
  const t0 = String(text || '').trim();
  if (t0 === '/cancel') return handleGlassCallback(ctx, 'gl:cancel');
  const d = getStateData(ctx);

  if (st === 'glass:body') {
    const body = String(text || '').replace(/\r/g, '').slice(0, MAX_BODY);
    if (body.trim().length < 3) return send(token, user.id, '⚠️ متن خیلی کوتاه است (حداقل ۳ کاراکتر).');
    await setSt(ctx, 'glass:title', { ...d, body });
    return send(token, user.id, '🎯 یک <b>عنوان کوتاه</b> بفرست (یا <code>/skip</code> برای بدون عنوان):');
  }
  if (st === 'glass:title') {
    const title = ['/skip', '-', 'بی‌عنوان'].includes(t0) ? '' : String(text || '').slice(0, 60);
    const rows = [STYLES.slice(0, 3), STYLES.slice(3)].map((r) => r.map((s) => ({ text: GLASS_STYLES[s].name, callback_data: `gl:style:${s}` })));
    await setSt(ctx, 'glass:title:done', { ...d, title });
    return send(token, user.id, '🎨 سبک شیشه‌ای را انتخاب کنید:', { reply_markup: { inline_keyboard: rows } });
  }
  if (st === 'glass:btn') {
    const btns = d.buttons || [];
    if (['/skip', '/done', 'تمام', 'تمام شد', 'done'].includes(t0)) return finishGlass(ctx, { ...d, buttons: btns });
    let lines = String(text).split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 1 && lines[0].includes('|')) lines = lines[0].split('|').map((s) => s.trim());
    if (lines.length === 1 && /^https?:\/\//i.test(lines[0])) return send(token, user.id, '⚠️ خط اول باید <b>عنوان دکمه</b> باشد، خط دوم آدرس.');
    if (lines.length >= 2) {
      const url = lines[1];
      if (!/^https?:\/\//i.test(url)) return send(token, user.id, '⚠️ آدرس باید با <code>http://</code> یا <code>https://</code> شروع شود.');
      const maxBtn = await maxButtons(db);
      if (btns.length >= maxBtn) return send(token, user.id, `⚠️ سقف ${faDigits(maxBtn)} دکمه پر شده. «تمام» را بفرست تا پست ساخته شود.`);
      await setSt(ctx, 'glass:btn', { ...d, buttons: [...btns, { t: lines[0].slice(0, 40), u: url.slice(0, 300) }] });
      return send(token, user.id, `✅ دکمهٔ ${faDigits(btns.length + 1)} ثبت شد.\nدکمهٔ بعدی یا «تمام» 👌`);
    }
    return send(token, user.id, '⚠️ هر دکمه دو خط: عنوان، بعد آدرس. یا «تمام» برای پایان.');
  }
  return null;
}

async function finishGlass(ctx, draft) {
  const { db, token, user } = ctx;
  let p;
  if (draft.editId) {
    const r = await saveGlassPost(db, {
      id: draft.editId,
      userId: user.id,
      title: draft.title || '',
      body: draft.body || '',
      buttons: draft.buttons || [],
      photo: draft.photo || '',
      style: draft.style || 'aurora',
      refCta: (await setting(db, 'glass_show_ref', '0')) === '1' ? 1 : 0,
    });
    if (!r.ok) {
      await setSt(ctx, '', null);
      return send(token, user.id, `⛔ ${esc(r.error)}`);
    }
    p = r.post;
  } else {
    p = await createGlassPost(db, {
      userId: user.id,
      title: draft.title || '',
      body: draft.body || '',
      buttons: draft.buttons || [],
      photo: draft.photo || '',
      style: draft.style || 'aurora',
      refCta: (await setting(db, 'glass_show_ref', '0')) === '1' ? 1 : 0,
      origin: 'pv',
    });
  }
  await setSt(ctx, '', null);
  const msg = i18nT(user.lang || 'fa', 'glass_done')
    .replaceAll('{bot}', ctx.botUsername || 'bot')
    .replaceAll('{code}', p.code);
  await send(token, user.id, `<b>${esc(msg)}</b>`, { disable_web_page_preview: true });
  await previewGlass(ctx, p, { note: `🔢 کد: <code>${esc(p.code)}</code>` });
}

/** عکس داخل استودیو → file_id (برای پست‌های تصویری) */
export async function handleGlassPhoto(ctx, photo) {
  const st = ctx.user.state || '';
  if (st !== 'glass:btn') return null;
  const arr = Array.isArray(photo) ? photo : [];
  const pick = [...arr].sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0))[0];
  if (!pick?.file_id) return null;
  const d = getStateData(ctx);
  await setSt(ctx, 'glass:btn', { ...d, photo: pick.file_id });
  return send(ctx.token, ctx.user.id, '🖼 تصویر به پست اضافه شد.\nحالا دکمه‌ها را بفرست یا «تمام».');
}

/* ─────────────────────────── /glass ─────────────────────────── */
export async function handleGlassCommand(ctx, args = '', { inGroup = false, chatId = 0 } = {}) {
  const { db, token, user } = ctx;
  const raw = String(args || '').trim();
  const low = raw.toLowerCase();
  if (!raw || ['help', 'راهنما', 'h'].includes(low)) return handleGlassCallback(ctx, 'gl:how');
  if (/^(post|publish|send)\s/.test(low)) {
    const rest = raw.replace(/^(post|publish|send)\s+/i, '').trim();
    const m = rest.match(/^(\d{4,8})(?:\s+(@[\w]+|-\d{5,}|\d{5,}))?$/);
    if (!m) return send(token, inGroup ? chatId : user.id, '⚠️ فرمت: <code>/glass post 31763</code> یا <code>/glass post 31763 @channel</code>');
    const p = await getGlassByCode(db, m[1]);
    if (!p || !p.active) return send(token, inGroup ? chatId : user.id, '⛔ کدی با این شماره پیدا نشد (یا غیرفعال است).');
    const isOwner = p.userId === user.id || ['super', 'admin'].includes(user.role);
    if (!isOwner && (await setting(db, 'glass_public_publish', '0')) !== '1') {
      return send(token, inGroup ? chatId : user.id, '🔒 فقط سازندهٔ پست (یا ادمین) می‌تواند آن را با ربات منتشر کند.\n💡 می‌توانید <code>@' + esc(ctx.botUsername || 'bot') + ' ' + esc(p.code) + '</code> را در این چت بنویسید و نتیجه را انتخاب کنید.');
    }
    let target = inGroup ? chatId : null;
    if (m[2]) target = m[2].startsWith('@') ? m[2] : /^-\d+$/.test(m[2]) ? Number(m[2]) : Number(m[2]);
    if (!target) return send(token, user.id, '⚠️ داخل گروه/کانال بنویس یا آدرس کانال را اضافه کن: <code>/glass post ' + esc(p.code) + ' @channel</code>');
    const origin = await getBase(ctx.env);
    const r = await publishGlass(db, token, target, p, { bot: ctx.botUsername, origin });
    if (!r?.ok) {
      const why = String(r?.description || 'خطای شبکه');
      const hint = /kicked|not a member|chat not found/i.test(why)
        ? 'ربات عضو گروه نیست.'
        : /administrator|rights|not enough/i.test(why)
          ? 'ربات ادمین کانال نیست (یا اجازهٔ پست گذاشتن ندارد).'
          : why.slice(0, 140);
      return send(token, user.id, `⛔ انتشار نشد: <i>${esc(hint)}</i>`);
    }
    if (!inGroup) await send(token, user.id, '✅ منتشر شد ✔');
    return null;
  }
  if (/^(del|delete|حذف)\s/.test(low)) {
    const p = await getGlassByCode(db, raw.replace(/^(del|delete|حذف)\s+/i, '').trim());
    if (!p) return send(token, user.id, '⛔ کد پیدا نشد.');
    if (p.userId !== user.id && !['super', 'admin'].includes(user.role)) return send(token, user.id, '⛔ دسترسی نداری.');
    await deleteGlass(db, p.id, p.userId, ['super', 'admin'].includes(user.role));
    return send(token, user.id, '🗑 حذف شد.');
  }
  if (/^list/.test(low)) return handleGlassCallback(ctx, 'gl:list');
  if (/^style(\s|$)/.test(low)) {
    const want = raw.replace(/^style\s*/i, '').trim();
    if (STYLES.includes(want)) return handleGlassCallback(ctx, `gl:style:${want}`);
    const rows = [STYLES.slice(0, 3), STYLES.slice(3)].map((r) => r.map((s) => ({ text: GLASS_STYLES[s].name, callback_data: `gl:style:${s}` })));
    return send(token, user.id, '🎨 یک سبک انتخاب کنید (برای پست بعدی):', { reply_markup: { inline_keyboard: rows } });
  }
  return glassMenu(ctx);
}

/* ─────────────────────────── وب: صفحهٔ هر پست ─────────────────────────── */
export async function glassLandingHtml(db, p, { bot = '', origin = '' } = {}) {
  const meta = GLASS_STYLES[p.style] || GLASS_STYLES.aurora;
  const btns = [...p.buttons];
  if (p.refCta && bot) btns.push({ t: `👥 ${i18nT('fa', 'glass_ref_cta')}`, u: `https://t.me/${bot}?start=ref_${p.userId}` });
  const cards = btns
    .map((b, i) => `<a class="gbtn" href="${esc(b.u)}" target="_blank" rel="noopener nofollow" data-i="${i}"><span>${esc(b.t)}</span><em>↗</em></a>`)
    .join('');
  const shareUrl = glassUrl(origin, p);
  return html(`<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
<title>${esc(p.title || 'پست شیشه‌ای')}</title>
<meta name="theme-color" content="#05070f" />
<meta property="og:title" content="${esc(p.title || 'پست شیشه‌ای')}" />
<meta property="og:description" content="${esc(p.body.replace(/\n+/g, ' ').slice(0, 160))}" />
${p.photo ? `<meta property="og:image" content="${esc(p.photo)}" />` : ''}
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--acc:${meta.accent}}
body{font-family:system-ui,-apple-system,'Segoe UI',Tahoma,sans-serif;min-height:100vh;color:#f1f5f9;padding:24px 14px 44px;
background:radial-gradient(1100px 600px at 10% -10%, color-mix(in srgb,var(--acc) 32%,transparent),transparent 60%),
radial-gradient(900px 520px at 110% 105%, rgba(99,102,241,.34),transparent 58%),#05070f}
.card{max-width:560px;margin:0 auto;padding:26px 20px;border-radius:30px;background:rgba(255,255,255,.06);
border:1px solid rgba(255,255,255,.16);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);
box-shadow:0 30px 90px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.16);animation:pop .5s cubic-bezier(.2,.9,.2,1) both}
@keyframes pop{from{opacity:0;transform:translateY(16px) scale(.98)}}
.line{text-align:center;color:var(--acc);letter-spacing:5px;font-size:12px;opacity:.85;user-select:none}
h1{font-size:21px;text-align:center;margin:12px 0 16px;letter-spacing:-.3px}
.body{font-size:15.5px;line-height:2.1;white-space:pre-wrap;text-align:right}
.shot{margin-top:16px;border-radius:20px;overflow:hidden;border:1px solid rgba(255,255,255,.14)}
.shot img{display:block;width:100%}
.gbtns{margin-top:22px;display:grid;gap:11px}
.gbtn{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px;border-radius:18px;
text-decoration:none;color:#fff;font-weight:600;font-size:15px;
background:linear-gradient(135deg,rgba(255,255,255,.16),rgba(255,255,255,.05));
border:1px solid rgba(255,255,255,.18);backdrop-filter:blur(12px);transition:transform .15s,box-shadow .2s;animation:pop .45s var(--d) both}
.gbtn:hover{transform:translateY(-2px) scale(1.01);box-shadow:0 14px 34px color-mix(in srgb,var(--acc) 30%,transparent)}
.gbtn em{opacity:.55;font-style:normal}
.tools{margin-top:20px;display:flex;gap:10px;flex-wrap:wrap;justify-content:center}
.tool{font-size:13px;padding:9px 14px;border-radius:14px;cursor:pointer;color:#e2e8f0;font-family:inherit;
background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14)}
.tool:hover{background:rgba(255,255,255,.15)}
.foot{margin-top:18px;text-align:center;font-size:12px;opacity:.6;line-height:1.9}
code{background:rgba(255,255,255,.1);padding:2px 7px;border-radius:7px;font-size:12px;direction:ltr;display:inline-block}
.toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%) translateY(10px);background:rgba(15,23,42,.94);
border:1px solid rgba(255,255,255,.2);padding:10px 16px;border-radius:14px;font-size:13px;opacity:0;transition:.25s;pointer-events:none}
.toast.on{opacity:1;transform:translateX(-50%)}
</style>
</head>
<body>
<main class="card">
  <div class="line">${esc(meta.line)}</div>
  <h1>${esc(p.title || '✨ پست شیشه‌ای')}</h1>
  ${p.photo ? `<div class="shot"><img src="${esc(p.photo)}" alt="" loading="lazy" /></div>` : ''}
  <div class="body" id="txt">${esc(p.body)}</div>
  ${cards ? `<div class="gbtns">${cards}</div>` : ''}
  <div class="tools">
    <button class="tool" id="cp">📋 کپی متن</button>
    ${shareUrl ? `<button class="tool" id="sh">📤 اشتراک</button><button class="tool" id="cpc">🔗 کپی لینک پست</button>` : ''}
    ${bot ? `<button class="tool" id="rb">🤍 ربات</button>` : ''}
  </div>
  <div class="foot">
    کد انتشار: <code>@${esc(bot || 'bot')} ${esc(p.code)}</code><br />
    🧪 AMINCK Nova · انتشار: ${faDigits(p.uses)} · بازدید: ${faDigits(p.views + 1)}
  </div>
</main>
<div class="toast" id="t"></div>
<script>
var CODE=${JSON.stringify(p.code)};
function toast(m){var e=document.getElementById('t');e.textContent=m;e.classList.add('on');setTimeout(function(){e.classList.remove('on')},1500);}
function copy(s,ok){if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(s).then(function(){toast(ok||'📋 کپی شد')},function(){toast('⚠️ کپی نشد')});}else{toast('⚠️ مرورگر اجازه نداد');}}
document.getElementById('cp').onclick=function(){copy(document.getElementById('txt').innerText,'📋 متن پست کپی شد');};
var c=document.getElementById('cpc');if(c)c.onclick=function(){copy(location.href,'🔗 لینک کپی شد');};
var s=document.getElementById('sh');if(s)s.onclick=function(){if(navigator.share){navigator.share({title:document.title,text:document.getElementById('txt').innerText,url:location.href}).catch(function(){});}else{copy(location.href);}};
var r=document.getElementById('rb');if(r)r.onclick=function(){location.href='https://t.me/${esc(bot || '')}';};
fetch('/api/glass/click',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:CODE})}).catch(function(){});
document.querySelectorAll('.gbtn').forEach(function(a){a.addEventListener('click',function(){fetch('/api/glass/click',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:CODE,btn:a.dataset.i})}).catch(function(){});});});
</script>
</body>
</html>`);
}

/** آمار صفحهٔ وب: view (بازدید) یا کلیک دکمه (btn=<idx>) → bump uses */
export async function handleGlassClickApi(request, db) {
  let body = {};
  try {
    body = await request.json();
  } catch {}
  const code = String(body?.code || '').slice(0, 8);
  const p = await getGlassByCode(db, code);
  if (!p) return json({ ok: false, error: 'not_found' }, 404);
  if (body?.btn !== undefined && body?.btn !== null) await bumpGlass(db, p.id, 'uses');
  else await bumpGlass(db, p.id, 'views');
  return json({ ok: true });
}

/** ثبت بازدید/کلیک برای آمار (استفادهٔ داخلی صفحهٔ وب و تست) */
export async function trackGlassClick(db, code, what = 'views') {
  const p = await getGlassByCode(db, String(code || '').slice(0, 8));
  if (!p) return null;
  await bumpGlass(db, p.id, what);
  return getGlassByCode(db, p.code);
}

// ═══════════════════════ 🧪 نسخهٔ شیشه‌ایِ کانفیگ‌ساز ═══════════════════════
/** قاب شیشه‌ایِ استایل‌دار (برای پیام‌های ربات) — خط جدا + اسم استایل */
export function glassFrame(style) {
  const st = GLASS_STYLES[style] ? style : 'aurora';
  return { style: st, name: GLASS_STYLES[st].name, line: GLASS_STYLES[st].line, accent: GLASS_STYLES[st].accent };
}

/** لینک نمونهٔ صفحهٔ شیشه‌ای کانفیگ (اگر Worker روی دامنه باشد) */
export async function configCardDemo(env) {
  const origin = await getBase(env);
  return origin ? `${origin}/sc/demo` : '';
}
/** پست شیشه‌ای از روی یک اشتراک — برای اشتراک‌گذاری در گروه‌ها */
export async function glassPostForSubscription(db, sub, { bot = 'bot', origin = '' } = {}) {
  const daysLeft = sub.expire_at ? Math.max(0, Math.ceil((Number(sub.expire_at) - Math.floor(Date.now() / 1000)) / 86400)) : 0;
  const gb = Number(sub.traffic_gb || 0);
  let devices = Number(sub.max_devices || 0) || 0;
  if (!devices && Number(sub.product_id)) {
    const prd = await db.prepare('SELECT max_devices FROM products WHERE id=?').bind(Number(sub.product_id)).first();
    devices = Number(prd?.max_devices || 0);
  }
  devices = Math.max(1, devices || 1);
  const style = await setting(db, 'glass_style', 'aurora');
  const body =
    `🧩 <b>${esc(sub.title || 'اشتراک')}</b>\n` +
    `⏰ ${daysLeft ? `${faDigits(daysLeft)} روز اعتبار` : '🔓 بدون محدودیت زمانی'}\n` +
    `📊 ترافیک: <b>${gb ? `${faDigits(gb)} گیگ` : 'نامحدود'}</b>\n` +
    `📱 دستگاه هم‌زمان: <b>${faDigits(devices)}</b>\n\n` +
    `🔗 لینک اشتراک (کپی کن و در هر کلاینتی بچسبان):\n<code>${esc(origin ? `${origin}/sub/${sub.token}` : `token:${sub.token}`)}</code>\n\n` +
    `💎 ساخته‌شده با کانفیگ‌ساز ${esc(bot)} — با QR یا لینک، در چند ثانیه فعال می‌شود.`;
  const buttons = [{ t: '🔗 دریافت لینک اشتراک', u: `${origin}/sub/${sub.token}` }];
  if (origin) {
    buttons.push({ t: '🧪 صفحهٔ شیشه‌ای کانفیگ', u: `${origin}/sc/${sub.token}` });
    buttons.push({ t: '🤖 ربات', u: `https://t.me/${bot}` });
  }
  return { body, buttons, style };
}

/** نام کاربری ربات (از تنظیمات، وگرنه getMe) — بدون وابستگی به index.js */
async function glassBotUsername(env) {
  let u = await getSettingValue(env.DB, 'bot_username');
  if (!u && env.TELEGRAM_BOT_TOKEN) {
    const me = await tg(env.TELEGRAM_BOT_TOKEN, 'getMe').catch(() => null);
    u = me?.result?.username || me?.username || '';
    if (u) {
      await env.DB.prepare('INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('bot_username', u).run();
    }
  }
  return String(u || '').replace(/^@/, '') || 'bot';
}

/** صفحهٔ وب شیشه‌ای یک کانفیگ — /sc/<token> */
export async function configCardHtml(env, token) {
  const want = String(token || '').slice(0, 80);
  const sub =
    want === 'demo'
      ? { token: 'demo', title: 'کانفیگ نمونه (دمو)', expire_at: Math.floor(Date.now() / 1000) + 26 * 86400, traffic_gb: 100, max_devices: 3, days: 30, user_id: 0 }
      : await env.DB.prepare('SELECT * FROM subscriptions WHERE token=?').bind(want).first();
  if (!sub) {
    return html('<!doctype html><meta charset="utf-8"><title>404</title>' +
      '<body style="font:16px Vazirmatn,Tahoma,sans-serif;background:#0b1020;color:#eef2ff;display:grid;place-items:center;min-height:100vh">' +
      '<div style="text-align:center"><h2>🧩 کانفیگ پیدا نشد</h2><p>لینک ممکن است منقضی شده باشد — از ربات نسخهٔ تازه بگیر.</p></div></body>', 404);
  }
  const origin = await getBase(env);
  const bot = await glassBotUsername(env);
  const style = GLASS_STYLES[(await setting(env.DB, 'glass_style', 'aurora'))] ? await setting(env.DB, 'glass_style', 'aurora') : 'aurora';
  const accent = GLASS_STYLES[style].accent;
  const { qrDataUrl } = await import('./qr.js');
  const demo = sub.token === 'demo';
  const subUrl = demo
    ? 'vless://00000000-0000-0000-0000-000000000000@demo.example:443?security=reality&sni=www.example.com#%F0%9F%A7%8A%20%D9%86%D9%85%D9%88%D9%86%D9%87'
    : origin
      ? `${origin}/sub/${sub.token}`
      : `token:${sub.token}`;
  const daysLeft = sub.expire_at ? Math.max(0, Math.ceil((Number(sub.expire_at) - Math.floor(Date.now() / 1000)) / 86400)) : 0;
  const gb = Number(sub.traffic_gb || 0);
  let devices = Number(sub.max_devices || 1) || 1;
  if (!sub.max_devices && Number(sub.product_id)) {
    const prd = await env.DB.prepare('SELECT max_devices FROM products WHERE id=?').bind(Number(sub.product_id)).first();
    devices = Math.max(1, Number(prd?.max_devices || 1) || 1);
  }
  const qr = await qrDataUrl(subUrl);
  const meter = daysLeft ? Math.max(0.04, Math.min(1, daysLeft / Math.max(1, Number(sub.days || 30)))) : 1;
  const page = `<!doctype html>
<html lang="fa" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>🧪 کانفیگ شیشه‌ای</title>
<style>
*{box-sizing:border-box}
body{margin:0;min-height:100vh;font:15px/1.9 Vazirmatn,Tahoma,sans-serif;color:#eef2ff;
background:radial-gradient(900px 500px at 10% -10%,${accent}33,transparent),radial-gradient(800px 500px at 110% 10%,#1e293b88,transparent),#0b1020;
display:grid;place-items:center;padding:20px}
.card{width:min(470px,100%);padding:26px 22px;border-radius:30px;background:rgba(255,255,255,.075);
border:1px solid rgba(255,255,255,.18);box-shadow:0 30px 70px rgba(0,0,0,.45);
backdrop-filter:blur(22px) saturate(150%);-webkit-backdrop-filter:blur(22px) saturate(150%);position:relative;overflow:hidden}
.card:before{content:'';position:absolute;inset:-45% -12% auto;height:65%;
background:radial-gradient(closest-side,${accent}44,transparent 70%);filter:blur(22px);pointer-events:none}
h1{margin:0 0 4px;font-size:21px}.sub{opacity:.7;font-size:13px;margin-bottom:14px}
.chip{display:inline-block;padding:4px 11px;border-radius:999px;background:${accent}22;border:1px solid ${accent}55;color:${accent};font-size:12px;font-weight:800}
.bar{height:7px;border-radius:99px;background:rgba(255,255,255,.12);overflow:hidden;margin:12px 0 2px}
.bar i{display:block;height:100%;width:${Math.round(meter * 100)}%;background:linear-gradient(90deg,${accent},#818cf8)}
.mono{display:block;font-family:ui-monospace,Menlo,monospace;font-size:12px;direction:ltr;word-break:break-all;
background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.14);padding:10px 12px;border-radius:14px;margin:12px 0}
.mrow{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:14px 0}
.m{padding:10px 6px;border-radius:16px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);text-align:center}
.m span{display:block;font-size:11px;opacity:.6}.m b{font-size:14px}
img.qr{display:block;margin:14px auto;border-radius:18px;background:#fff;padding:8px;width:190px;height:190px}
.btns{display:grid;gap:8px;margin-top:16px}
button,a.btn{display:block;text-align:center;padding:13px 14px;border-radius:16px;font:inherit;font-weight:700;
text-decoration:none;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.1);color:#eef2ff;cursor:pointer;
transition:transform .14s ease,background .2s}
button:hover,a.btn:hover{transform:translateY(-1px);background:rgba(255,255,255,.18)}
a.pri{background:linear-gradient(90deg,${accent},#818cf8);color:#04101f;border:0}
.foot{margin-top:14px;text-align:center;font-size:12px;opacity:.6}
.toast{position:fixed;left:50%;transform:translateX(-50%);bottom:24px;background:rgba(16,185,129,.92);color:#04231a;
padding:9px 16px;border-radius:999px;font-weight:800;opacity:0;transition:opacity .25s;pointer-events:none}
.toast.on{opacity:1}
</style></head>
<body><main class="card">
<span class="chip">${esc(GLASS_STYLES[style].name)} · نسخهٔ شیشه‌ای</span>
<h1 style="margin-top:10px">🧩 ${esc(sub.title || 'اشتراک من')}</h1>
<div class="sub">${demo ? '🧪 <b>نمونهٔ نمایشی</b> — این کانفیگ واقعی نیست؛ بعد از خرید، همین صفحه با لینک واقعی شما پر می‌شود.' : '🔐 این صفحه فقط با لینکِ شما باز می‌شود؛ توکن، همان رمز دسترسی است.'}</div>
<div class="mrow">
<div class="m"><span>⏰ اعتبار</span><b>${daysLeft ? `${faDigits(daysLeft)} روز` : '🔓'}</b></div>
<div class="m"><span>📊 ترافیک</span><b>${gb ? `${faDigits(gb)} گیگ` : '∞'}</b></div>
<div class="m"><span>📱 دستگاه</span><b>${faDigits(devices)}</b></div>
</div>
<div class="bar"><i></i></div>
<code class="mono">${esc(subUrl)}</code>
${qr ? `<img class="qr" alt="QR" src="${qr}">` : ''}
<div class="btns">
<button onclick="cp()">📋 کپی لینک اشتراک</button>
${demo
    ? ''
    : `<a class="btn pri" href="${esc(subUrl)}">📥 دریافت مستقیم لینک اشتراک</a>`}
<a class="btn" href="https://t.me/share/url?url=${encodeURIComponent(origin ? `${origin}/sc/${sub.token}` : subUrl)}&text=${encodeURIComponent('🧪 کانفیگ شیشه‌ای — آمادهٔ استفاده')}">🧪 اشتراک در گروه</a>
<a class="btn" href="https://t.me/${esc(bot)}">🤖 ربات</a>
</div>
<div class="foot">AMINCK Nova Edge · ${esc(GLASS_STYLES[style].line)}</div>
</main>
<div class="toast" id="t">کپی شد ✓</div>
<script>
function cp(){var t=${json(subUrl)};if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(ok,function(){fb(t)});}else fb(t);}
function fb(t){var a=document.createElement('textarea');a.value=t;document.body.appendChild(a);a.select();try{document.execCommand('copy')}catch(e){}a.remove();ok();}
function ok(){var e=document.getElementById('t');e.classList.add('on');setTimeout(function(){e.classList.remove('on')},1400);}
</script>
</body></html>`;
  return new Response(page, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

/** کال‌بک gl:cfg:<token> — پست شیشه‌ایِ کانفیگ می‌سازد و کد انتشار را می‌دهد */
export async function createConfigGlassPost(ctx, subToken) {
  const sub = await ctx.db.prepare('SELECT * FROM subscriptions WHERE token=?').bind(String(subToken).slice(0, 80)).first();
  if (!sub || Number(sub.user_id) !== Number(ctx.user.id)) {
    await tg(ctx.token, 'answerCallbackQuery', { callback_query_id: ctx.cbId, text: 'یافت نشد' });
    return true;
  }
  const origin = await getBase(ctx.env);
  const { body, buttons, style } = await glassPostForSubscription(ctx.db, sub, { bot: ctx.botUsername || 'bot', origin });
  const p = await createGlassPost(ctx.db, { userId: ctx.user.id, body, buttons, style, photo: '' });
  const kb = {
    inline_keyboard: [
      [{ text: '✏️ ویرایش متن', callback_data: `gl:edit:${p.id}` }, { text: '🖼 افزودن عکس', callback_data: `gl:photo:${p.id}` }],
      ...(origin ? [[{ text: '🧪 صفحهٔ شیشه‌ای کانفیگ', url: `${origin}/sc/${sub.token}` }]] : []),
      [{ text: '🗑 حذف پست', callback_data: `gl:del:${p.id}` }],
    ],
  };
  await send(
    ctx.token,
    ctx.user.id,
    `🧪 <b>پست شیشه‌ای کانفیگ آماده شد</b>\n\n${body}\n\n` +
      `🔢 کد انتشار: <b>${faDigits(p.code)}</b>\n` +
      `1️⃣ در هر گروهی تایپ کن: <code>@${esc(ctx.botUsername || 'bot')} ${p.code}</code>\n` +
      `2️⃣ یا همین پیام را فوروارد کن (دکمه‌ها می‌مانند)\n` +
      `3️⃣ یا <b>پست کن</b> دکمهٔ زنده می‌گیرد`,
    { reply_markup: kb }
  );
  await tg(ctx.token, 'answerCallbackQuery', { callback_query_id: ctx.cbId, text: 'پست شیشه‌ای ساخته شد 🧪' });
  await bumpGlass(ctx.db, p.id, 'uses').catch(() => {});
  return true;
}

/* ─────────────────────────── استودیوی وب (مینی‌اپ / لینک امن) ─────────────────────────── */

/** کلید کوتاه‌مدت برای باز کردن استودیو در مرورگر (بدون initData) */
export async function glassStudioKey(env, userId) {
  const sig = await studioSig(env, userId);
  return `${userId}.${sig}`;
}
async function studioSig(env, userId) {
  const key = new TextEncoder().encode(String(env.TELEGRAM_BOT_TOKEN || 'dev') + ':glass-studio');
  const h = toHex(await hmacSha256(key, `glass-studio:${userId}`));
  return h.slice(0, 32);
}
export async function glassStudioUrl(env, request, userId) {
  const base = await getBase(env, request);
  const sig = await studioSig(env, userId);
  return `${base}/g/studio/${userId}/${sig}`;
}

async function authGlassUser(env, request) {
  let body = {};
  try {
    body = await request.json();
  } catch {}
  const db = env.DB;
  if (body?.initData) {
    const ok = await verifyInitData(String(body.initData), env.TELEGRAM_BOT_TOKEN);
    if (ok?.id) {
      const { ensureUser } = await import('./db.js');
      await ensureUser(db, ok);
      return { user: await getUserById(db, ok.id), body };
    }
  }
  const key = String(request.headers.get('x-glass-key') || body.key || '');
  const m = key.match(/^(\d+)\.([0-9a-f]{32})$/);
  if (m) {
    const uid = Number(m[1]);
    const want = await studioSig(env, uid);
    if (timingSafeEq(want, m[2])) {
      const u = await getUserById(db, uid);
      if (u && !u.banned) return { user: u, body };
    }
  }
  return { user: null, body };
}
const timingSafeEq = (a, b) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};
async function getUserById(db, id) {
  const { getUser } = await import('./db.js');
  return getUser(db, id);
}

export async function handleGlassApi(env, request) {
  const path = new URL(request.url).pathname;
  const db = env.DB;
  if (path === '/api/glass/click' && request.method === 'POST') return handleGlassClickApi(request, db);
  if (request.method !== 'POST') return json({ ok: false, error: 'method' }, 405);
  const { user, body } = await authGlassUser(env, request);
  if (!user) return json({ ok: false, error: 'unauthorized' }, 403);

  if (path === '/api/glass/meta') {
    const maxBtn = await maxButtons(db);
    const daily = Number(await setting(db, 'glass_daily_limit', 0)) || 0;
    return json({
      ok: true,
      enabled: (await setting(db, 'glass_enabled', '1')) === '1',
      maxButtons: maxBtn,
      maxBody: MAX_BODY,
      daily,
      today: await countGlassToday(db, user.id),
      bot: await getSettingValue(db, 'bot_username'),
      origin: await getBase(env),
      lang: user.lang || 'fa',
      styles: STYLES.map((st) => ({ id: st, name: GLASS_STYLES[st].name, accent: GLASS_STYLES[st].accent, line: GLASS_STYLES[st].line })),
    });
  }
  if (path === '/api/glass/list') return json({ ok: true, posts: await listGlass(db, user.id, 40) });
  if (path === '/api/glass/save') {
    const r = await saveGlassPost(db, {
      id: Number(body.id || 0),
      userId: user.id,
      title: String(body.title || ''),
      body: String(body.text ?? body.body ?? ''),
      buttons: Array.isArray(body.buttons) ? body.buttons : [],
      photo: String(body.photo || ''),
      style: String(body.style || 'aurora'),
      refCta: body.refCta ? 1 : 0,
      origin: 'web',
    });
    return r.ok ? json({ ok: true, post: r.post }) : json({ ok: false, error: r.error }, 400);
  }
  if (path === '/api/glass/delete') {
    const p = await getGlassById(db, Number(body.id || 0));
    if (!p || p.userId !== user.id) return json({ ok: false, error: 'forbidden' }, 403);
    await deleteGlass(db, p.id, user.id);
    return json({ ok: true });
  }
  if (path === '/api/glass/ref') {
    const percent = Number(await setting(db, 'referral_percent', 10)) || 10;
    const coins = Number(await setting(db, 'referral_coins', 25)) || 25;
    const p = await ensureRefGlass(db, { userId: user.id, botUsername: (await getSettingValue(db, 'bot_username')) || 'bot', percent, coins, lang: user.lang || 'fa' });
    return json({ ok: true, post: p });
  }
  if (path === '/api/glass/publish') {
    const p = await getGlassById(db, Number(body.id || 0));
    if (!p || (p.userId !== user.id && !['super', 'admin'].includes(user.role))) return json({ ok: false, error: 'forbidden' }, 403);
    const origin = await getBase(env);
    const r = await publishGlass(db, env.TELEGRAM_BOT_TOKEN, user.id, p, { bot: await getSettingValue(db, 'bot_username'), origin });
    return json({ ok: !!r?.ok, sent_to: 'pv', description: r?.description || '' });
  }
  return json({ ok: false, error: 'unknown_path' }, 404);
}

/** صفحهٔ استودیو — رابط شیشه‌ایِ ساخت پست (ساختار همان «طراحی شیشه‌ای» بخش کانفیگ‌ساز) */
export async function glassStudioHtml(env, request, userId, sig) {
  const db = env.DB;
  const want = await studioSig(env, Number(userId));
  if (!timingSafeEq(want, String(sig || ''))) return html('<meta charset="utf-8"><body style="font-family:sans-serif;background:#05070f;color:#fff;display:grid;place-items:center;height:100vh">⛔ لینک استودیو نامعتبر یا منقضی است. از ربات دوباره «🖥 استودیوی گرافیکی» را بزنید.</body>', 403);
  const user = await getUserById(db, Number(userId));
  if (!user) return html('<meta charset="utf-8"><body style="background:#05070f;color:#fff;font-family:sans-serif">⛔ کاربر یافت نشد</body>', 404);
  const origin = await getBase(env, request);
  const key = `${user.id}.${want}`;
  const base = (await getSettingValue(db, 'bot_username')) || 'bot';
  const st = (await setting(db, 'glass_daily_limit', 0)) || 0;
  const made = await countGlassToday(db, user.id);
  return html(STUDIO_HTML({ key, origin, base, daily: st, made, maxBtn: await maxButtons(db) }));
}

function STUDIO_HTML({ key, origin, base, daily, made, maxBtn }) {
  const styleOpts = STYLES.map((s) => `<button type="button" class="sty" data-s="${s}" data-a="${GLASS_STYLES[s].accent}">${esc(GLASS_STYLES[s].name)}</button>`).join('');
  return `<!doctype html>
<html lang="fa" dir="rtl"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
<title>🧪 استودیوی پست شیشه‌ای</title><meta name="theme-color" content="#05070f"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,'Segoe UI',Tahoma,sans-serif;background:#05070f;color:#eef2ff;min-height:100vh;padding:16px 14px 60px;
background-image:radial-gradient(900px 500px at 8% -8%, rgba(126,232,250,.18),transparent 60%),radial-gradient(800px 500px at 100% 100%, rgba(192,132,252,.18),transparent 60%)}
.wrap{max-width:720px;margin:0 auto;display:grid;gap:14px}
.tabs{display:flex;gap:8px;overflow:auto;padding-bottom:2px}
.tab{white-space:nowrap;padding:9px 14px;border-radius:14px;font-size:13px;cursor:pointer;color:#cbd5e1;
background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12)}
.tab.on{background:linear-gradient(135deg,rgba(126,232,250,.28),rgba(192,132,252,.24));color:#fff;border-color:rgba(255,255,255,.3)}
.glass{border-radius:24px;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.14);
backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);padding:16px;box-shadow:0 20px 60px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.12)}
h1{font-size:17px;margin-bottom:4px}.mut{font-size:12px;opacity:.65;line-height:1.8}
label{display:block;font-size:12px;opacity:.75;margin:12px 0 6px}
input,textarea,select{width:100%;font:inherit;font-size:14px;color:#fff;background:rgba(0,0,0,.35);
border:1px solid rgba(255,255,255,.16);border-radius:14px;padding:11px 12px;outline:none}
textarea{min-height:140px;line-height:1.9;resize:vertical}
input:focus,textarea:focus{border-color:var(--acc,#7ee8fa)}
.stys{display:flex;flex-wrap:wrap;gap:7px;margin-top:8px}
.sty{font-size:12px;padding:8px 11px;border-radius:12px;cursor:pointer;color:#cbd5e1;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12)}
.sty.on{color:#fff;background:color-mix(in srgb,var(--acc) 34%,transparent);border-color:var(--acc)}
.row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.brow{display:grid;grid-template-columns:1fr 1.6fr auto;gap:6px;margin-top:6px}
button.mini{font:inherit;font-size:12px;padding:8px 10px;border-radius:12px;cursor:pointer;color:#e2e8f0;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14)}
.acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
.pri{font:inherit;font-size:14px;font-weight:700;padding:12px 18px;border-radius:16px;cursor:pointer;color:#04121a;border:0;
background:linear-gradient(135deg,#7ee8fa,#c084fc)}
.sec{font:inherit;font-size:13px;padding:11px 15px;border-radius:16px;cursor:pointer;color:#e2e8f0;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.16)}
.prev{margin-top:12px;border-radius:20px;padding:16px;border:1px solid rgba(255,255,255,.16);background:rgba(2,6,23,.55)}
.prev .ln{text-align:center;color:var(--acc,#7ee8fa);letter-spacing:5px;font-size:11px;opacity:.9}
.prev h3{text-align:center;font-size:15px;margin:8px 0}
.prev p{font-size:14px;line-height:2;white-space:pre-wrap}
.prev a{display:block;text-decoration:none;color:#fff;font-size:13px;font-weight:600;text-align:center;padding:11px;border-radius:14px;margin-top:8px;
background:linear-gradient(135deg,rgba(255,255,255,.16),rgba(255,255,255,.05));border:1px solid rgba(255,255,255,.18)}
.item{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:11px 12px;border-radius:16px;margin-top:8px;
background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);font-size:13px}
.item b{font-size:12px;font-weight:700;letter-spacing:.5px}
.badge{font-size:11px;padding:3px 8px;border-radius:9px;background:rgba(126,232,250,.18);border:1px solid rgba(126,232,250,.35)}
.toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);background:rgba(2,6,23,.95);border:1px solid rgba(255,255,255,.22);
padding:10px 16px;border-radius:14px;font-size:13px;opacity:0;transition:.2s;pointer-events:none}
.toast.on{opacity:1}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media (max-width:560px){.grid2,.row{grid-template-columns:1fr}}
</style></head><body>
<div class="wrap">
  <div class="tabs">
    <div class="tab on" data-p="edit">✍️ ساخت پست</div>
    <div class="tab" data-p="list">📋 پست‌های من</div>
    <div class="tab" data-p="ref">👥 پست دعوت</div>
    <div class="tab" data-p="how">📖 روش انتشار</div>
    <a class="tab" href="${esc(origin)}/panel">🛠 پنل + کانفیگ‌ساز</a>
    <a class="tab" href="https://t.me/${esc(base)}">🤍 ربات</a>
  </div>

  <section class="glass" id="pg-edit">
    <h1>🧪 استودیوی پست شیشه‌ای</h1>
    <div class="mut">متن، عنوان، دکمه‌ها و سبک را انتخاب کنید؛ پیش‌نمایش زنده کار می‌کند. سقف روزانه: ${daily > 0 ? esc(String(made)) + ' از ' + esc(String(daily)) : 'نامحدود'} · حداکثر ${esc(String(maxBtn))} دکمه</div>
    <label>عنوان (اختیاری)</label><input id="f-title" maxlength="60" placeholder="مثلاً: فروش ویژهٔ نوروزی"/>
    <label>متن پست</label><textarea id="f-body" maxlength="${MAX_BODY}" placeholder="⚡️ متن اصلی پست…"></textarea>
    <label>سبک شیشه‌ای</label><div class="stys" id="f-styles">${styleOpts}</div>
    <label>دکمه‌های شیشه‌ای (عنوان + لینک)</label><div id="f-btns"></div>
    <div class="acts"><button class="sec" id="addbtn">➕ افزودن دکمه</button><button class="sec" id="savebtn">💾 ذخیره کد</button></div>
    <div class="prev" id="prev"></div>
  </section>

  <section class="glass" id="pg-list" hidden><h1>📋 پست‌های شما</h1><div class="mut">برای ویرایش یا گرفتن پیش‌نما روی هر پست بزنید.</div><div id="list"></div></section>

  <section class="glass" id="pg-ref" hidden><h1>👥 پست دعوت شیشه‌ای</h1>
    <div class="mut">یک کارت آماده با لینک دعوت شما؛ هر بار که در گروهی منتشر شود آمارش بالا می‌رود.</div>
    <div class="acts"><button class="pri" id="refbtn">🛠 ساخت/به‌روزرسانی پست دعوت</button></div>
    <div id="refbox"></div></section>

  <section class="glass" id="pg-how" hidden><h1>📮 سه روش انتشار</h1>
    <div class="mut">
      ۱) در گروه/کانال بنویسید <b>@${esc(base)} 31763</b> و نتیجه را انتخاب کنید → کارت شیشه‌ای با دکمه‌های لینکی (کار می‌کند حتی اگر ربات عضو نباشد).<br/>
      ۲) پیش‌نمای ربات را <b>فوروارد</b> کنید → دکمهٔ شیشه‌ای واقعی حفظ می‌شود.<br/>
      ۳) ربات خودش پست کند: <b>/glass post 31763</b> در گروه (ربات عضو باشد) یا <b>/glass post 31763 @channel</b> (ربات ادمین باشد).<br/><br/>
      ⚠️ تلگرام اجازه نمی‌دهد نتیجهٔ inline دکمهٔ شیشه‌ای داشته باشد؛ این محدودیت پلتفرم است.
    </div></section>
</div>
<div class="toast" id="t"></div>
<script>
var KEY=${JSON.stringify(key)};
var MAXB=${Number(maxBtn) || 6};
var state={style:'aurora',accent:'#7ee8fa',line:'▰▱▰▱▰',buttons:[],edit:0};
function toast(m){var e=document.getElementById('t');e.textContent=m;e.classList.add('on');setTimeout(function(){e.classList.remove('on')},1800);}
function api(p,b){return fetch('/api/glass/'+p,{method:'POST',headers:{'Content-Type':'application/json','x-glass-key':KEY},body:JSON.stringify(b||{})}).then(function(r){return r.json()})}
document.querySelectorAll('.tab[data-p]').forEach(function(t){t.onclick=function(){
  document.querySelectorAll('.tab').forEach(function(x){x.classList.remove('on')});t.classList.add('on');
  ['edit','list','ref','how'].forEach(function(n){var s=document.getElementById('pg-'+n);if(s)s.hidden=(n!==t.dataset.p)});
  if(t.dataset.p==='list')loadList();
}});
document.querySelectorAll('.sty').forEach(function(b){b.onclick=function(){
  document.querySelectorAll('.sty').forEach(function(x){x.classList.remove('on')});b.classList.add('on');
  state.style=b.dataset.s;state.accent=b.dataset.a;document.documentElement.style.setProperty('--acc',b.dataset.a);paint();
}});
function addBtnRow(t,u){
  if(state.buttons.length>=MAXB){toast('⛔ حداکثر '+MAXB+' دکمه');return}
  var i=state.buttons.length;state.buttons.push({t:t||'',u:u||''});renderBtns();paint();
}
function renderBtns(){
  var w=document.getElementById('f-btns');w.innerHTML='';
  state.buttons.forEach(function(b,i){
    var d=document.createElement('div');d.className='brow';
    d.innerHTML='<input placeholder="عنوان دکمه" value="'+esc(b.t)+'" data-k="t" data-i="'+i+'"><input placeholder="https://..." value="'+esc(b.u)+'" data-k="u" data-i="'+i+'"><button class="mini" data-x="'+i+'">✖</button>';
    w.appendChild(d);
  });
  w.querySelectorAll('input').forEach(function(inp){inp.oninput=function(){state.buttons[+inp.dataset.i][inp.dataset.k]=inp.value;paint()}});
  w.querySelectorAll('button').forEach(function(x){x.onclick=function(){state.buttons.splice(+x.dataset.x,1);renderBtns();paint()}});
}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
document.getElementById('addbtn').onclick=function(){addBtnRow('','')};
document.getElementById('f-title').oninput=paint;document.getElementById('f-body').oninput=paint;
function paint(){
  var v=document.getElementById('f-body').value.replace(/\n/g,'<br/>');
  var t=document.getElementById('f-title').value;
  var html='<div class="ln">'+esc(state.line)+'</div>'+(t?'<h3>'+esc(t)+'</h3>':'')+'<p>'+(v||'متن پست را اینجا بنویسید…')+'</p>';
  state.buttons.forEach(function(b){if(b.t)html+='<a href="'+esc(b.u||'#')+'">⚡️ '+esc(b.t)+'</a>'});
  html+='<div class="ln" style="margin-top:10px;opacity:.6">'+esc(state.line)+'</div>';
  document.getElementById('prev').innerHTML=html;
}
document.getElementById('savebtn').onclick=function(){
  var body=document.getElementById('f-body').value;
  if(body.trim().length<3){toast('⚠️ متن کوتاه است');return}
  api('save',{id:state.edit,title:document.getElementById('f-title').value,text:body,buttons:state.buttons.filter(function(b){return b.t&&/^https?:\/\//i.test(b.u)}),style:state.style}).then(function(r){
    if(!r.ok){toast('⛔ '+(r.error||'خطا'));return}
    state.edit=r.post.id;toast('✅ کد پست: '+r.post.code);loadList();
  });
};
function loadList(){
  api('list',{}).then(function(r){
    var w=document.getElementById('list');if(!r.posts||!r.posts.length){w.innerHTML='<div class="mut">هنوز پستی نساخته‌اید.</div>';return}
    w.innerHTML='';
    r.posts.forEach(function(p){
      var d=document.createElement('div');d.className='item';
      d.innerHTML='<div><b>'+esc(p.style.toUpperCase())+'</b> · کد '+esc(p.code)+'<div class="mut">'+esc((p.title||p.body).slice(0,44))+' · '+p.uses+' انتشار / '+p.views+' بازدید</div></div>';
      var a=document.createElement('div');a.style.display='flex';a.style.gap='6px';
      a.innerHTML='<button class="mini" data-e="'+p.id+'">✏️</button><button class="mini" data-d="'+p.id+'">🗑</button>';
      d.appendChild(a);w.appendChild(d);
      a.querySelector('[data-e]').onclick=function(){loadEdit(p)};
      a.querySelector('[data-d]').onclick=function(){api('delete',{id:p.id}).then(function(){toast('🗑 حذف شد');loadList()})};
    });
  });
}
function loadEdit(p){
  document.querySelector('.tab[data-p="edit"]').click();
  state.edit=p.id;state.buttons=(p.buttons||[]).slice(0,MAXB);
  document.getElementById('f-title').value=p.title||'';document.getElementById('f-body').value=p.body||'';
  renderBtns();paint();toast('✏️ در حال ویرایش کد '+p.code);
}
document.getElementById('refbtn').onclick=function(){api('ref',{}).then(function(r){
  if(!r.ok){toast('⛔');return}
  document.getElementById('refbox').innerHTML='<div class="item"><div><b>کد '+esc(r.post.code)+'</b><div class="mut">'+esc(r.post.body.slice(0,60))+'…</div></div><span class="badge">'+r.post.uses+' انتشار</span></div>';
  toast('✅ پست دعوت آماده شد');
})};
paint();
</script></body></html>`;
}

export { glassTelegramText as glassText };
