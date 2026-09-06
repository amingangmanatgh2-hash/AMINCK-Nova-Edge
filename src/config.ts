import type { GlobalSettings, GroupSettings, Message } from './types';

export const OWNERS = [8882866473, 7856615968] as const;
export const isOwner = (id: number) => (OWNERS as readonly number[]).includes(id);
export const SELF_HOURLY_DIAMONDS = 5;
export const DAY = 86_400_000;
export const HOUR = 3_600_000;
export const VERSION = '2.1.0';
export const DEFAULT_GLOBAL: GlobalSettings = { maintenance: false, maxBet: 10000, diamondOdds: 50, duelSeconds: 300, dailyCoins: 100, brand: 'نُوا گارد' };
export const DEFAULT_GROUP: GroupSettings = {
  locks: ['links', 'invites'], welcome: 'سلام {name} ✨ به {group} خوش اومدی! قوانین رو با «قوانین» ببین.',
  goodbye: '', rules: 'احترام به همدیگه، بدون اسپم و تبلیغ. اینجا جای رفاقته 🌱',
  antiflood: true, floodLimit: 8, floodWindow: 12, warnLimit: 4, warnAction: 'mute', muteMinutes: 30,
  captcha: false, captchaSeconds: 120, raid: false, quiet: false, games: true,
  chatbot: true, style: 'playful', trusted: [], cooldown: 0,
  maxBet: 10000, reports: true, joinMode: 'manual', nightStart: 0, nightEnd: 7,
  nightEnabled: false, timezone: 210, commandsOnlySlash: false,
};
export const LOCKS = [
  ['links', 'لینک', 'پیوندهای وب و لینک مخفی'], ['invites', 'دعوت', 'لینک دعوت تلگرام'],
  ['forward', 'فوروارد', 'پیام‌های هدایت‌شده'], ['stickers', 'استیکر', 'همهٔ استیکرها'],
  ['animated', 'استیکرمتحرک', 'استیکر متحرک و ویدیویی'], ['photos', 'عکس', 'تصاویر'],
  ['videos', 'ویدیو', 'ویدیو'], ['gifs', 'گیف', 'انیمیشن و GIF'],
  ['voice', 'ویس', 'پیام صوتی'], ['audio', 'آهنگ', 'فایل صوتی'],
  ['documents', 'فایل', 'فایل‌ها'], ['executables', 'اجرایی', 'فایل اجرایی و اسکریپت'],
  ['contacts', 'مخاطب', 'اشتراک مخاطب'], ['locations', 'مکان', 'موقعیت مکانی'],
  ['polls', 'نظرسنجی', 'نظرسنجی'], ['dice', 'تاس', 'تاس و ایموجی بازی خارج از دوئل'],
  ['games', 'بازی', 'بازی HTML تلگرام'], ['inline', 'اینلاین', 'پیام‌های ربات اینلاین'],
  ['mentions', 'منشن', 'منشن و تگ'], ['hashtags', 'هشتگ', 'هشتگ'],
  ['long', 'طولانی', 'متن بیشتر از ۱۵۰۰ نویسه'], ['rtlspoof', 'جهت‌جعلی', 'کنترل‌های مخفی تغییر جهت متن'],
  ['videoNotes', 'ویدیومسیج', 'پیام ویدیویی گرد'], ['bots', 'ربات', 'ورود حساب‌های ربات'],
] as const;
export const PRESETS: Record<string, string[]> = {
  balanced: ['links', 'invites', 'executables', 'rtlspoof'],
  strict: ['links', 'invites', 'forward', 'inline', 'contacts', 'locations', 'executables', 'long', 'bots', 'rtlspoof'],
  friendly: ['invites', 'executables', 'rtlspoof'],
};
export const GAMES = [
  { emoji: '🎲', name: 'تاس', max: 6 }, { emoji: '🎯', name: 'دارت', max: 6 },
  { emoji: '🏀', name: 'بسکتبال', max: 5 }, { emoji: '⚽', name: 'فوتبال', max: 5 },
  { emoji: '🎳', name: 'بولینگ', max: 6 }, { emoji: '🎰', name: 'اسلات', max: 64 },
];
export function diceScore(emoji: string, value: number): number {
  const game = GAMES.find(g => g.emoji === emoji);
  if (!game || !Number.isInteger(value) || value < 1 || value > game.max) throw new Error('تاس نامعتبر است.');
  if (emoji !== '🎰') return value;
  if (value === 64) return 100;
  const v = value - 1, a = v % 4, b = Math.floor(v / 4) % 4, c = Math.floor(v / 16);
  return a === b && b === c ? 30 : a === b || b === c || a === c ? 10 : 0;
}
export function filterReason(m: Message, s: GroupSettings, inDuel = false): string | undefined {
  const text = m.text || m.caption || '';
  const entities = [...(m.entities || []), ...(m.caption_entities || [])];
  const links = [text, ...entities.map(e => e.url || '')].join(' ');
  const checks: Record<string, boolean> = {
    links: /(?:https?:\/\/|www\.|(?:[a-z0-9-]+\.)+(?:com|org|net|ir|io|me|app|co|dev|xyz|uk)\b)/i.test(links) || entities.some(e => ['url', 'text_link'].includes(e.type)),
    invites: /(?:t\.me|telegram\.(?:me|dog))\/(?:joinchat\/|\+|[a-z0-9_]+)/i.test(links),
    forward: !!m.forward_origin, stickers: !!m.sticker, animated: !!(m.sticker?.is_animated || m.sticker?.is_video),
    photos: !!m.photo, videos: !!m.video, gifs: !!m.animation, voice: !!m.voice, audio: !!m.audio,
    documents: !!m.document, executables: /\.(exe|apk|msi|bat|cmd|com|scr|ps1|sh|js|vbs|jar)$/i.test(m.document?.file_name || ''),
    contacts: !!m.contact, locations: !!(m.location || m.venue), polls: !!m.poll,
    dice: !!m.dice && !inDuel, games: !!m.game, inline: !!m.via_bot,
    mentions: entities.some(e => ['mention', 'text_mention'].includes(e.type)),
    hashtags: entities.some(e => e.type === 'hashtag'), long: text.length > 1500,
    rtlspoof: /[\u202a-\u202e\u2066-\u2069]/u.test(text), videoNotes: !!m.video_note,
  };
  return s.locks.find(k => checks[k]);
}
export function validSettings(input: unknown, current: GroupSettings = structuredClone(DEFAULT_GROUP)): GroupSettings {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('تنظیمات نامعتبر');
  const result = structuredClone(current);
  for (const [key, value] of Object.entries(input)) {
    if (!Object.hasOwn(DEFAULT_GROUP, key)) throw new Error(`تنظیم ناشناخته: ${key}`);
    const k = key as keyof GroupSettings;
    if (['locks', 'trusted'].includes(k)) {
      if (!Array.isArray(value) || value.length > 100) throw new Error('فهرست نامعتبر');
      if (k === 'locks') {
        if (!value.every(x => LOCKS.some(l => l[0] === x))) throw new Error('قفل ناشناخته');
        result.locks = [...new Set(value)] as string[];
      } else {
        if (!value.every(x => Number.isSafeInteger(x) && x > 0)) throw new Error('شناسه نامعتبر');
        result.trusted = [...new Set(value)] as number[];
      }
    } else if (typeof DEFAULT_GROUP[k] === 'boolean') {
      if (typeof value !== 'boolean') throw new Error('مقدار باید روشن یا خاموش باشد');
      (result as unknown as Record<string, unknown>)[k] = value;
    } else if (typeof DEFAULT_GROUP[k] === 'number') {
      const bounds: Record<string, [number, number]> = {
        floodLimit: [3, 30], floodWindow: [3, 60], warnLimit: [1, 10], muteMinutes: [1, 43200],
        captchaSeconds: [30, 600], cooldown: [0, 300], maxBet: [1, 1000000],
        nightStart: [0, 23], nightEnd: [0, 23], timezone: [-720, 840],
      };
      const [min, max] = bounds[k];
      if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new Error(`محدودهٔ ${k}: ${min} تا ${max}`);
      (result as unknown as Record<string, unknown>)[k] = value;
    } else {
      if (typeof value !== 'string' || value.length > 3000) throw new Error('متن نامعتبر یا طولانی');
      const enums: Record<string, string[]> = { warnAction: ['mute', 'ban'], style: ['friendly', 'formal', 'playful'], joinMode: ['manual', 'approve', 'decline'] };
      if (enums[k] && !enums[k].includes(value)) throw new Error('گزینه نامعتبر');
      (result as unknown as Record<string, unknown>)[k] = value;
    }
  }
  return result;
}
