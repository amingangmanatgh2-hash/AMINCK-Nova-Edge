import { GAME_CATALOG, sanitizeGameIds } from './games';
import { MAX_BATCH_SUBSCRIPTIONS, MAX_PATHS, type ProfileMode, type SpeedPreset, type UsageMode } from './types';
import { clamp } from './utils';

export interface AiBuildPlan {
  name: string;
  paths: number;
  subscriptionCount: number;
  usageMode: UsageMode;
  gameIds: string[];
  ironMode: boolean;
  ironCount: number;
  domesticDirect: boolean;
  speedPreset: SpeedPreset;
  profileMode: ProfileMode;
  dynamicPool: boolean;
  rotationMinutes: number;
  useCleanCatalog: boolean;
  ready: boolean;
  explanation: string;
  warnings: string[];
}

const SPEEDS: SpeedPreset[] = ['stable', 'balanced', 'turbo', 'god', 'latency'];
const MODES: ProfileMode[] = ['auto', 'fallback', 'balance'];

function normalizeDigits(value: string): string {
  const fa = '۰۱۲۳۴۵۶۷۸۹';
  const ar = '٠١٢٣٤٥٦٧٨٩';
  return value.replace(/[۰-۹٠-٩]/g, (char) => {
    const faIndex = fa.indexOf(char);
    return String(faIndex >= 0 ? faIndex : ar.indexOf(char));
  });
}

function normalizeText(value: string): string {
  return normalizeDigits(value)
    .toLowerCase()
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\u064b-\u065f\u0670]/g, '')
    .replace(/[_–—]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const GAME_ALIASES: Record<string, string[]> = {
  'cod-mobile': ['کالاف', 'کال اف', 'کالاف دیوتی', 'call of duty mobile', 'cod mobile'],
  warzone: ['وارزون', 'warzone'],
  'minecraft-java': ['ماینکرفت', 'ماین کرافت', 'minecraft'],
  valorant: ['ولورانت', 'والورانت', 'valorant'],
  'pubg-mobile': ['پابجی', 'pubg mobile'],
  'free-fire': ['فری فایر', 'free fire'],
  fortnite: ['فورتنایت', 'fortnite'],
  'counter-strike-2': ['کانتر', 'counter strike', 'cs2'],
  'dota-2': ['دوتا', 'dota'],
  'league-of-legends': ['لیگ اف لجندز', 'league of legends', 'lol'],
  'ea-sports-fc-26': ['فیفا', 'ea sports fc', 'fc 26'],
  'clash-of-clans': ['کلش اف کلنز', 'کلش', 'clash of clans'],
  'brawl-stars': ['براول استارز', 'brawl stars'],
  'apex-legends': ['اپکس', 'apex legends'],
  'rainbow-six-siege': ['رینبو', 'rainbow six'],
};

export function gameIdsMentioned(prompt: string): string[] {
  const text = normalizeText(prompt);
  if (/\b(all games|every game)\b/.test(text) || /همه\s*(بازی|گیم)/.test(text)) {
    return GAME_CATALOG.map((game) => game.id);
  }
  const found: string[] = [];
  for (const [id, aliases] of Object.entries(GAME_ALIASES)) {
    if (aliases.some((alias) => text.includes(normalizeText(alias)))) found.push(id);
  }
  for (const game of GAME_CATALOG) {
    const candidates = [game.id.replace(/-/g, ' '), game.title.toLowerCase()];
    if (candidates.some((candidate) => candidate.length >= 4 && text.includes(normalizeText(candidate)))) {
      found.push(game.id);
    }
  }
  return sanitizeGameIds(found);
}

function numberNear(text: string, words: string[], fallback: number): number {
  const group = words.join('|');
  const after = text.match(new RegExp(`(\\d{1,4})\\s*(?:${group})`, 'i'));
  if (after) return Number(after[1]);
  const before = text.match(new RegExp(`(?:${group})\\s*(\\d{1,4})`, 'i'));
  return before ? Number(before[1]) : fallback;
}

export function deterministicAiBuildPlan(prompt: string): AiBuildPlan {
  const text = normalizeText(String(prompt).slice(0, 1000));
  const gameIds = gameIdsMentioned(text);
  const gamingWords = /(گیم|بازی|پینگ|latency|gaming|game|کالاف|ماینکرفت|پابجی|ولورانت|وارزون)/;
  const usageMode: UsageMode = gamingWords.test(text) || gameIds.length > 0 ? 'gaming' : 'normal';
  const asksStability = /(پایدار|قطعی|قطع نشه|نپره|stable|fallback|دوام)/.test(text);
  const asksPower = /(قدرت|پرقدرت|حداکثر|ماکس|maximum|power|god|سرعت بالا|سریع)/.test(text);
  const explicitlyAsksLowPing = /(پینگ|کمترین|low ping|latency|تاخیر|تأخیر)/.test(text);
  // Gaming defaults to LOW PING, but an explicit stability/fallback request
  // takes priority over that implicit default.
  const asksLowPing = explicitlyAsksLowPing || (usageMode === 'gaming' && !asksStability);
  const pathsFallback = usageMode === 'gaming' ? 24 : asksPower ? 50 : 10;
  const paths = clamp(numberNear(text, ['کانفیگ', 'config', 'route', 'مسیر', 'لینک'], pathsFallback), 1, MAX_PATHS);
  const subscriptionCount = clamp(numberNear(text, ['ساب', 'subscription', 'اشتراک'], 1), 1, MAX_BATCH_SUBSCRIPTIONS);
  const ironMode = /(آهن|اهن|iron)/.test(text);
  const ironCount = ironMode ? clamp(numberNear(text, ['بسته آهن', 'بسته اهن', 'iron pack', 'پک آهن', 'پک اهن'], 1), 0, 5) : 0;
  const domesticDirect = !/(بدون\s*(نت ملی|داخلی)|domestic off)/.test(text);
  const dynamicPool = /(چرخش|rotation|pool|تعویض.*آی.?پی|تعویض.*ip)/.test(text);
  const useCleanCatalog = /(انی.?کست|anycast|آی.?پی تمیز|ip تمیز|clean ip)/.test(text);
  const speedPreset: SpeedPreset = asksLowPing ? 'latency' : asksPower ? 'god' : asksStability ? 'stable' : 'balanced';
  const profileMode: ProfileMode = asksLowPing ? 'auto' : asksStability ? 'fallback' : asksPower ? 'balance' : 'auto';
  const ready = usageMode === 'normal' || gameIds.length > 0;
  const warnings = [
    'Ping فیزیکی، عبور همگانی از محدودیت شبکه و کارکرد همه سرویس‌ها قابل تضمین نیست.',
    'Domestic Direct فقط ترافیک قابل‌شناسایی .ir و در خروجی‌های پشتیبانی‌شده GeoIP ایران را مستقیم می‌کند.',
  ];
  if (!ready) warnings.unshift('برای طرح Gaming نام حداقل یک بازی را بنویس؛ مثال: کالاف، ماینکرفت یا همه بازی‌ها.');
  if (paths > 200) warnings.push('بیش از ۲۰۰ Route ممکن است Import و Health Check موبایل را سنگین کند.');
  return {
    name: usageMode === 'gaming' ? 'AMINCK-AI-GAMING' : 'AMINCK-AI',
    paths,
    subscriptionCount,
    usageMode,
    gameIds,
    ironMode,
    ironCount,
    domesticDirect,
    speedPreset,
    profileMode,
    dynamicPool,
    rotationMinutes: 5,
    useCleanCatalog,
    ready,
    explanation: asksLowPing
      ? 'LOW PING مسیر موجود با کمترین اندازه‌گیری را سریع‌تر انتخاب می‌کند؛ فاصله فیزیکی شبکه را تغییر نمی‌دهد.'
      : asksStability
        ? 'Fallback برای دوام و جابه‌جایی از مسیر خراب انتخاب شد.'
        : 'طرح متعادل و سازگار بر اساس متن شما آماده شد.',
    warnings,
  };
}

function responseText(value: unknown): string {
  if (value && typeof value === 'object') {
    const obj = value as { response?: unknown; output_text?: unknown };
    return String(obj.response ?? obj.output_text ?? '');
  }
  return String(value ?? '');
}

export function parseAiBuildPlan(value: unknown, fallback: AiBuildPlan): AiBuildPlan | null {
  const match = responseText(value).match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const raw = JSON.parse(match[0]) as Record<string, unknown>;
    const usageMode: UsageMode = raw.usageMode === 'gaming' ? 'gaming' : raw.usageMode === 'normal' ? 'normal' : fallback.usageMode;
    const fromModel = sanitizeGameIds(raw.gameIds);
    const gameIds = usageMode === 'gaming' ? (fromModel.length > 0 ? fromModel : fallback.gameIds) : [];
    const speedPreset = SPEEDS.includes(raw.speedPreset as SpeedPreset)
      ? raw.speedPreset as SpeedPreset
      : fallback.speedPreset;
    const profileMode = MODES.includes(raw.profileMode as ProfileMode)
      ? raw.profileMode as ProfileMode
      : fallback.profileMode;
    const paths = clamp(Math.floor(Number(raw.paths)) || fallback.paths, 1, MAX_PATHS);
    const subscriptionCount = clamp(Math.floor(Number(raw.subscriptionCount)) || fallback.subscriptionCount, 1, MAX_BATCH_SUBSCRIPTIONS);
    const ironMode = typeof raw.ironMode === 'boolean' ? raw.ironMode : fallback.ironMode;
    const ready = usageMode === 'normal' || gameIds.length > 0;
    return {
      ...fallback,
      paths,
      subscriptionCount,
      usageMode,
      gameIds,
      ironMode,
      ironCount: ironMode ? clamp(Math.floor(Number(raw.ironCount)) || fallback.ironCount || 1, 0, 5) : 0,
      domesticDirect: typeof raw.domesticDirect === 'boolean' ? raw.domesticDirect : fallback.domesticDirect,
      speedPreset,
      profileMode,
      dynamicPool: typeof raw.dynamicPool === 'boolean' ? raw.dynamicPool : fallback.dynamicPool,
      rotationMinutes: clamp(Math.floor(Number(raw.rotationMinutes)) || fallback.rotationMinutes, 1, 60),
      useCleanCatalog: typeof raw.useCleanCatalog === 'boolean' ? raw.useCleanCatalog : fallback.useCleanCatalog,
      ready,
      warnings: ready ? fallback.warnings.filter((warning) => !warning.startsWith('برای طرح Gaming')) : fallback.warnings,
    };
  } catch {
    return null;
  }
}

export function aiGameIdReference(): string {
  return GAME_CATALOG.map((game) => `${game.id}=${game.title}`).join('; ');
}
