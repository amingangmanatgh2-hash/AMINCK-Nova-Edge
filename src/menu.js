// ═══════════════════════════════════════════════════════════════════
//  دکمه‌های منو (بخش ۱۵ «مدیریت دکمه‌ها» + بخش ۱۱ «دکمه داشبورد»)
//
//  • کیبورد پایین ربات از دیتابیس ساخته می‌شود: متن، نوع و هدف هر دکمه
//    بدون تغییر کد قابل تغییر است.
//  • دکمهٔ داشبورد: هم به‌صورت دکمهٔ «مربعی» منوی تلگرام (setChatMenuButton
//    → WebApp) و هم به‌صورت دکمهٔ صفحه‌کلید.
//  ⚠️ محدودیت تلگرام: دکمه‌های صفحه‌کلید نمی‌توانند مستقیم WebApp باز کنند؛
//    پس دکمهٔ «داشبورد» یک پیام با دکمهٔ شیشه‌ای WebApp می‌فرستد.
// ═══════════════════════════════════════════════════════════════════
import { getSettingValue } from './texts.js';
import { ikb } from './tg.js';

export const ACTIONS = {
  url: '🔗 لینک (URL)',
  miniapp: '🪟 مینی‌اپ / WebApp',
  callback: '🔁 دستور داخلی ربات',
  start: '🚀 دیپ‌لینک شروع (/start payload)',
};

export async function listButtons(db, { activeOnly = true, forAdmin = false } = {}) {
  const where = [activeOnly ? 'active=1' : '1=1', forAdmin ? '1=1' : 'admins_only=0'];
  const rows = await db.prepare(`SELECT * FROM menu_buttons WHERE ${where.join(' AND ')} ORDER BY row_no ASC, col_no ASC, sort ASC, id ASC`).all();
  return rows.results || [];
}

/** چیدمان دو-ستونهٔ ردیف‌های سفارشی */
export function arrangeRows(buttons, perRow = 2) {
  const byRow = new Map();
  for (const b of buttons || []) {
    const n = Number(b.row_no || 9);
    if (!byRow.has(n)) byRow.set(n, []);
    byRow.get(n).push(b);
  }
  const custom = [...byRow.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, list]) => list.sort((x, y) => Number(x.col_no || 0) - Number(y.col_no || 0)));
  // ردیف‌های بدون شماره (row_no>=9) یکی در میان دو-تایی چیده می‌شوند
  const flat = custom.flat();
  const auto = [];
  for (let i = 0; i < flat.length; i += perRow) auto.push(flat.slice(i, i + perRow));
  const numbered = custom.filter((list) => Number(list[0]?.row_no || 9) < 9);
  return { numbered, auto, all: [...numbered.flat(), ...flat.filter((b) => Number(b.row_no || 9) >= 9)] };
}

export async function saveButton(db, b = {}, id = 0) {
  const label = String(b.label || '').trim().slice(0, 32);
  if (!label) return { ok: false, error: 'متن دکمه لازم است.' };
  const action = ACTIONS[b.action] ? b.action : 'url';
  let value = String(b.value || '').trim().slice(0, 300);
  if (action === 'url' && value && !/^https?:\/\//i.test(value) && !value.startsWith('tg://')) return { ok: false, error: 'لینک باید با https:// یا tg:// شروع شود.' };
  if ((action === 'callback' || action === 'start') && /[\s\t]/.test(value)) return { ok: false, error: 'payload نباید فاصله داشته باشد.' };
  const active = b.active === undefined || b.active === null ? 1 : b.active === true || b.active === '1' || b.active === 1 ? 1 : 0;
  const adminsOnly = b.admins_only === true || b.admins_only === '1' || b.admins_only === 1 ? 1 : 0;
  const rowNo = Math.max(0, Math.min(20, Number(b.row_no) || 9));
  const colNo = Math.max(0, Math.min(3, Number(b.col_no) || 0));
  const sort = Number(b.sort) || 0;
  if (id) {
    await db.prepare('UPDATE menu_buttons SET label=?,action=?,value=?,active=?,admins_only=?,row_no=?,col_no=?,sort=? WHERE id=?')
      .bind(label, action, value, active, adminsOnly, rowNo, colNo, sort, Number(id)).run();
    return { ok: true, id: Number(id) };
  }
  const res = await db
    .prepare('INSERT INTO menu_buttons (label,action,value,active,admins_only,row_no,col_no,sort,created_at) VALUES (?,?,?,?,?,?,?,?,?) RETURNING id')
    .bind(label, action, value, active, adminsOnly, rowNo, colNo, sort, Math.floor(Date.now() / 1000))
    .first();
  return { ok: true, id: Number(res?.id || 0) };
}

export async function deleteButton(db, id) {
  await db.prepare('DELETE FROM menu_buttons WHERE id=?').bind(Number(id)).run();
  return { ok: true };
}

export async function toggleButton(db, id) {
  await db.prepare('UPDATE menu_buttons SET active = CASE active WHEN 1 THEN 0 ELSE 1 END WHERE id=?').bind(Number(id)).run();
  return { ok: true };
}

/**
 * کیبورد اصلی کاربر: ردیف‌های ثابت + دکمهٔ داشبورد + دکمه‌های سفارشی پنل.
 * @returns {Promise<{reply_markup:object, dashboardEnabled:boolean}>}
 */
export async function mainKeyboard(db, isAdmin, opts = {}) {
  const dashboard = (await getSettingValue(db, 'dashboard_enabled')) !== '0';
  const rows = [
    [{ text: '🛍 فروشگاه' }, { text: '🎁 پروکسی و تست رایگان' }],
    [{ text: '💳 حساب من' }, { text: '👥 زیرمجموعه من' }],
    [{ text: '🎮 مینی‌اپ سکه‌ای' }, { text: '🤖 چت هوش مصنوعی' }],
    [{ text: '📞 پشتیبانی' }, { text: '📖 راهنما' }],
  ];
  if (dashboard) rows.unshift([{ text: '🪟 داشبورد من' }, { text: '🧩 اشتراک‌های من' }]);
  if (isAdmin) rows.push([{ text: '📊 پنل مدیریت' }]);
  const custom = await listButtons(db, { forAdmin: !!isAdmin });
  if (custom.length) {
    const { numbered, auto } = arrangeRows(custom, 2);
    const groups = [...numbered, ...auto];
    for (const g of groups) {
      const row = g.map((b) => ({ text: b.label }));
      if (row.length) rows.push(row);
    }
  }
  return { reply_markup: { keyboard: rows, resize_keyboard: true, is_persistent: true }, dashboardEnabled: dashboard };
}

/** دکمهٔ مربعی منوی تلگرام (میانبر داشبورد) */
export async function setDashboardMenuButton(env, token, { chatId = null, url = '', label = '' } = {}) {
  const base = url || (await getSettingValue(env.DB, 'dashboard_url')) || (await env.KV.get('worker_origin')) || '';
  if (!base) return { ok: false, reason: 'no_url' };
  const text = String(label || (await getSettingValue(env.DB, 'dashboard_label')) || '🪟 داشبورد').slice(0, 30);
  const button = { type: 'web_app', text, web_app: { url: `${base.replace(/\/+$/, '')}/app` } };
  const payload = chatId ? { chat_id: Number(chatId), button } : { button };
  const { tg } = await import('./tg.js');
  return tg(token, 'setChatMenuButton', payload);
}

/**
 * هندل کلیک روی دکمه‌های سفارشی صفحه‌کلید (متن دکمه = کلید ورودی).
 * @returns {Promise<boolean>} true یعنی مصرف شد
 */
export async function handleCustomButton(ctx, label) {
  const btns = await listButtons(ctx.db, { forAdmin: ctx.user.role !== 'user' });
  const b = btns.find((x) => String(x.label) === String(label));
  if (!b) return false;
  const { send, ikb, btn, ubtn } = await import('./tg.js');
  if (b.action === 'url' && b.value) {
    await send(ctx.token, ctx.user.id, `🔗 <b>${b.label}</b>\n\nلینک آماده است 👇`, {
      reply_markup: ikb([[ubtn(b.label, b.value)]]),
    });
    return true;
  }
  if (b.action === 'miniapp') {
    const base = (await ctx.env.KV.get('worker_origin')) || '';
    const url = /^https?:/i.test(b.value) ? b.value : `${base}${b.value ? (b.value.startsWith('/') ? b.value : '/' + b.value) : '/app'}`;
    await send(ctx.token, ctx.user.id, `🪟 <b>${b.label}</b>\n\nبا دکمهٔ زیر باز کنید 👇`, {
      reply_markup: { inline_keyboard: [[{ text: b.label, web_app: { url } }]] },
    });
    return true;
  }
  if (b.action === 'callback') {
    const { handleUserCallback } = await import('./user.js');
    await handleUserCallback(ctx, b.value);
    return true;
  }
  if (b.action === 'start') {
    const { handleStart } = await import('./user.js');
    await handleStart(ctx, b.value);
    return true;
  }
  await send(ctx.token, ctx.user.id, '⚠️ این دکمه هنوز هدفی ندارد؛ از پنل مدیریت تنظیمش کنید.');
  return true;
}
