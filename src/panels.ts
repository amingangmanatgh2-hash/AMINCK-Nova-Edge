import { COMMANDS } from './commands';
import { GAMES, LOCKS } from './config';
import type { GroupSettings } from './types';
import type { Keyboard } from './telegram';
import { fa, html } from './utils';

const button = (text: string, callback_data: string) => ({ text, callback_data });
export function groupPanel(s: GroupSettings, page = 'home'): {text:string;keyboard:Keyboard} {
  const back = [button('↩️ پنل مدیریت', 'panel:home')];
  const toggle = (title: string, key: keyof GroupSettings) => button(`${s[key] ? '🟢' : '⚪️'} ${title}`, `toggle:${key}`);
  const hint = (text: string, name: string) => button(text, `hint:${name}`);
  if (page === 'security') return {
    text: `<b>🛡 دیوار امنیت گروه</b>\n${fa(s.locks.length)} قفل روشن · ضداسپم: ${s.antiflood ? 'روشن' : 'خاموش'}\nمدیرهای تلگرام و مالک‌های سراسری از فیلترها معاف‌اند.\n\n💡 بدون دسترسی بن هم پنل کار می‌کند؛ فقط بن/سکوت/کپچا به آن نیاز دارند.`,
    keyboard: { inline_keyboard: [[button('🔒 قفل‌های محتوا', 'locks:0')], [toggle('ضداسپم', 'antiflood'), toggle('ضدهجوم', 'raid')], [toggle('کپچای ورود', 'captcha'), toggle('سکوت گروه', 'quiet')], [toggle('سکوت شبانه', 'nightEnabled'), hint('⚙️ حد اسپم', 'floodlimit')], [hint('🚫 دیمن پیام', 'blacklist'), hint('📝 عبارت ممنوع', 'addword')], back] },
  };
  if (page === 'games') return {
    text: `<b>🎮 باشگاه بازی</b>\n${GAMES.map(g => g.emoji).join(' ')}\nشرط با سکهٔ مجازی؛ الماس کمیاب و غیرنقدی.\nسقف گروه: ${fa(s.maxBet)} سکه\n\n🎲 تاس واقعی تلگرام است، قابل تقلب با APK نیست.`,
    keyboard: { inline_keyboard: [[toggle('دوئل‌ها', 'games'), toggle('سخنگو', 'chatbot')], [hint('🪙 سقف شرط', 'maxbet'), hint('🏆 لیدربرد', 'leaderboard')], [hint('⚔️ ساخت دوئل', 'duel'), hint('🎭 انتخاب لحن', 'style')], back] },
  };
  if (page === 'welcome') return {
    text: `<b>👋 ورود و قوانین</b>\nخوش‌آمد: ${s.welcome ? 'فعال' : 'خاموش'}\nخروج: ${s.goodbye ? 'فعال' : 'خاموش'}\nدر متن از <code>{name}</code> و <code>{group}</code> استفاده کنید.`,
    keyboard: { inline_keyboard: [[hint('✏️ متن خوش‌آمد', 'welcome'), hint('📝 قوانین', 'setrules')], [hint('🚪 متن خروج', 'goodbye'), hint('⏳ مهلت کپچا', 'captchatime')], [hint('🙋 درخواست عضویت', 'joinmode'), toggle('گزارش اعضا', 'reports')], back] },
  };
  if (page === 'moderation') return {
    text: `<b>⚖️ میز مدیریت</b>\nحد اخطار: ${fa(s.warnLimit)} · مجازات: ${s.warnAction === 'mute' ? 'سکوت' : 'بن'}\nبرای انتخاب عضو، روی پیامش ریپلای کنید. عملیات حذف گسترده تأیید دوم می‌خواهد.\n\n🔧 پاک‌سازی تکراری نمی‌شود؛ اگر یک کار در صف است، صبر کنید.`,
    keyboard: { inline_keyboard: [[hint('⚠️ اخطار', 'warn'), hint('🔇 سکوت', 'mute'), hint('⛔️ بن', 'ban')], [hint('🧹 پاک‌سازی', 'purge'), hint('📌 سنجاق', 'pin')], [hint('✅ معتمد', 'trust'), hint('⚙️ حد اخطار', 'warnlimit')], [hint('⏱ فاصلهٔ پیام', 'cooldown'), hint('↩️ رفع سکوت', 'unmute')], back] },
  };
  if (page === 'tools') return {
    text: '<b>🧰 ابزارهای گروه</b>\nپیام، یادداشت، پاسخ خودکار، فونت‌ساز و ابزار بدون نیاز به پنل وب.',
    keyboard: { inline_keyboard: [[hint('💬 پیام و پین', 'say'), hint('⏰ زمان‌بندی', 'schedule')], [hint('📒 ثبت یادداشت', 'addnote'), hint('🤖 پاسخ خودکار', 'addanswer')], [hint('🔤 فونت خفن', 'font'), hint('🎲 تاس تمرینی', 'play')], [hint('✏️ نام گروه', 'title'), hint('🔗 لینک دعوت', 'invite')], [hint('🗂 تنظیمات فعلی', 'settings'), hint('📖 راهنما', 'help')], back] },
  };
  return {
    text: '<b>✦ نُوا گارد | اتاق فرمان گروه</b>\n\nهمه‌چیز مرتب، گروه سرحال ✨\nیک بخش را انتخاب کنید. دسترسی هر دکمه دوباره بررسی می‌شود.\n\n💡 پنل بدون Ban Users هم کار می‌کند.',
    keyboard: { inline_keyboard: [[button('🛡 امنیت و قفل‌ها', 'panel:security'), button('⚖️ مدیریت اعضا', 'panel:moderation')], [button('🎮 بازی و سرگرمی', 'panel:games'), button('👋 خوش‌آمد و قوانین', 'panel:welcome')], [button('🧰 ابزارها و پیام', 'panel:tools')], [hint('📊 اطلاعات گروه', 'info'), hint('🔧 تنظیمات', 'settings')]] },
  };
}
export function locksPanel(s: GroupSettings, page: number) {
  page = Math.max(0, Math.min(2, page));
  const locks = LOCKS.slice(page * 8, page * 8 + 8);
  const rows = [];
  for (let i = 0; i < locks.length; i += 2) rows.push(locks.slice(i, i + 2).map(l => button(`${s.locks.includes(l[0]) ? '🔒' : '🔓'} ${l[1]}`, `lock:${l[0]}:${page}`)));
  rows.push([button('۱', 'locks:0'), button('۲', 'locks:1'), button('۳', 'locks:2')], [button('↩️ امنیت', 'panel:security')]);
  return { text: `<b>🔐 قفل‌های محتوا · صفحه ${fa(page + 1)} از ۳</b>\nهر دکمه قفل همان نوع پیام را تغییر می‌دهد.\nقفل تاس روی پرتاب معتبرِ دوئلِ فعال اعمال نمی‌شود.`, keyboard: { inline_keyboard: rows } };
}
export function helpText(role: string, category?: string): string {
  const all = COMMANDS.filter(c => (role === 'owner' || c.role !== 'owner') && (role !== 'member' || c.role === 'member'));
  if (!category) {
    const cats: Record<string, {emoji:string,title:string}> = {
      general: {emoji:'✦',title:'عمومی'},
      economy: {emoji:'💎',title:'اقتصاد و امتیاز'},
      games: {emoji:'🎮',title:'بازی و دوئل'},
      fun: {emoji:'🎭',title:'سرگرمی و فونت'},
      tools: {emoji:'🧰',title:'ابزار'},
      self: {emoji:'🖥',title:'سلف جدا و کنسول مالک — جدا'},
      admin: {emoji:'⚙️',title:'مدیریت گروه'},
      security: {emoji:'🛡',title:'امنیت و قفل'},
      moderation: {emoji:'⚖️',title:'مدیریت اعضا'},
      settings: {emoji:'🔧',title:'تنظیمات'},
      owner: {emoji:'👑',title:'مالک سراسری'},
    };
    const grouped: Record<string, typeof all> = {};
    for (const c of all) { (grouped[c.category] ||= []).push(c); }
    const lines = Object.entries(cats).filter(([k]) => grouped[k]?.length).map(([k,v]) => {
      const count = grouped[k].length;
      return `${v.emoji} <b>${v.title}</b> — ${count} دستور · <code>راهنما ${k}</code>`;
    }).join('\n');
    return `<b>✦ نُوا گارد — راهنمای خوشگل ${all.length} قابلیت</b>\nفارسی و English، با و بدون /\nبدون ادعای الکی ۱۰۰۰تایی؛ هر دستور واقعی حساب شده\n\n${lines}\n\n🔤 <b>فونت‌ساز:</b> <code>فونت سلام دنیا</code> — ۷ استایل خفن\n🎲 <b>دوئل:</b> <code>دوئل 🎲 ۵۰</code> — تاس واقعی تلگرام، بدون تقلب\n🛡 <b>پنل:</b> <code>پنل</code> — مدیریت دکمه‌ای گروه\n\nبرای دیدن هر دسته: <code>راهنما games</code> یا <code>help security</code>\n⚠️ تاس را سرور تلگرام می‌سازد؛ APK تقلب ممکن نیست.`;
  }
  const commands = all.filter(c => c.category === category || c.role === category);
  if (!commands.length) {
    return `<b>📖 دسته پیدا نشد</b>\nدسته‌های موجود: general, economy, games, fun, tools, admin, security, moderation, settings${role==='owner'?' , owner':''}\nمثال: <code>راهنما games</code> یا <code>راهنما فونت</code>`;
  }
  const list = commands.map(c => `• <code>/${c.name}</code> · ${html(c.fa)} — ${html(c.description)}${c.usage ? `\n  <i>${html(c.usage)}</i>` : ''}`).join('\n');
  return `<b>📖 ${html(category!)} — ${commands.length} دستور</b>\nفارسی و English، با و بدون /\n\n${list}\n\n💡 برای بازگشت: <code>راهنما</code>`;
}
