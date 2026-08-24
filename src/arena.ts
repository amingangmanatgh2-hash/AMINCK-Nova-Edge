/**
 * AMINNOVA Arena — constrained AI services.
 *
 * Arena is the single, auditable home of every AI-assisted feature of the
 * panel. Each service has a deterministic local engine that always produces
 * the authoritative result; the optional Cloudflare Workers AI enrichment
 * may only rephrase the Persian summary after strict scrubbing, and every
 * call fails open to the deterministic engine (no URLs, secrets, tokens,
 * UUIDs or invented numbers are accepted from the model).
 *
 * Services:
 *   build-plan        Persian/English text → constrained build plan (SAFE parser)
 *   profile-coach     measured latencies    → conservative speed/profile advice
 *   endpoint-analyst  probe results         → fleet health report
 *   security-review   panel settings        → 0..100 score with findings
 */
import { deterministicAiBuildPlan, type AiBuildPlan } from './ai';
import {
  CLOUDFLARE_TLS_PORTS,
  SPEED_PRESETS,
  type ProfileMode,
  type SpeedPreset,
} from './types';
import { clamp } from './utils';

export type ArenaServiceId = 'build-plan' | 'profile-coach' | 'endpoint-analyst' | 'security-review';

export interface ArenaServiceSpec {
  id: ArenaServiceId;
  title: string;
  summary: string;
  /** The API rejects prompts shorter than 3 characters for this service. */
  needsPrompt: boolean;
}

export const ARENA_SERVICES: ArenaServiceSpec[] = [
  {
    id: 'build-plan',
    title: 'طراح طرح ساخت',
    summary: 'متن فارسی/انگلیسی را به طرح محدودشده ساخت ساب تبدیل می‌کند؛ همان موتور امن دستیار ساخت.',
    needsPrompt: true,
  },
  {
    id: 'profile-coach',
    title: 'مربی پروفایل',
    summary: 'از تأخیرهای اندازه‌گیری‌شده Probe، محافظه‌کارانه Speed Preset و Profile Mode پیشنهاد می‌دهد.',
    needsPrompt: false,
  },
  {
    id: 'endpoint-analyst',
    title: 'تحلیل‌گر Endpoint',
    summary: 'سلامت ناوگان Endpointها را از نتایج Probe گزارش می‌کند: سالم، خراب، کهنگی و پراکندگی.',
    needsPrompt: false,
  },
  {
    id: 'security-review',
    title: 'داور امنیت تنظیمات',
    summary: 'تنظیمات پنل را بازبینی و با امتیاز ۰ تا ۱۰۰ نکات ریسکی را بدون افشای مقادیر گزارش می‌کند.',
    needsPrompt: false,
  },
];

export function isArenaServiceId(value: unknown): value is ArenaServiceId {
  return ARENA_SERVICES.some((spec) => spec.id === value);
}

export function arenaServiceSpec(id: ArenaServiceId): ArenaServiceSpec {
  return ARENA_SERVICES.find((spec) => spec.id === id)!;
}

export interface ArenaAdvice {
  speedPreset: SpeedPreset;
  profileMode: ProfileMode;
}

export interface ArenaRunResult {
  service: ArenaServiceId;
  title: string;
  summary: string;
  findings: string[];
  metrics: Record<string, number>;
  warnings: string[];
  plan?: AiBuildPlan;
  advice?: ArenaAdvice;
  score?: number;
}

export interface ArenaRunInput {
  prompt?: string;
  context?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Scrubbing — nothing secret-looking ever leaves the Arena
// ---------------------------------------------------------------------------

/** Remove URLs, IPs, UUIDs and token-looking strings; clamp length. */
export function sanitizeArenaText(value: unknown, maxLength = 320): string {
  let text = String(value ?? '');
  text = text.replace(/https?:\/\/\S+/gi, '');
  text = text.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '');
  text = text.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '');
  text = text.replace(/[A-Za-z0-9_-]{24,}/g, '');
  text = text.replace(/[\u0000-\u001f\u007f]/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  if (text.length > maxLength) text = text.slice(0, maxLength).trim();
  return text;
}

/**
 * Validate a model-produced summary. Returns the scrubbed text or null when
 * the output is unusable (empty, too short, or nothing but scrubbed junk).
 */
export function arenaSummaryFromModel(value: unknown): string | null {
  const raw = value && typeof value === 'object'
    ? String((value as { response?: unknown; output_text?: unknown }).response
      ?? (value as { output_text?: unknown }).output_text ?? '')
    : String(value ?? '');
  const cleaned = sanitizeArenaText(raw, 340);
  return cleaned.length >= 10 ? cleaned : null;
}

// ---------------------------------------------------------------------------
// Context whitelisting — the API never forwards arbitrary client objects
// ---------------------------------------------------------------------------

const SETTINGS_STRING_KEYS = new Set(['doh', 'healthUrl', 'supportUrl', 'brand', 'title', 'fingerprint', 'speedPreset', 'profileMode']);
const SETTINGS_ARRAY_KEYS = new Set(['dohAlt', 'tlsPorts', 'hostAliases']);
const SETTINGS_ANTIDETECT_FLAGS = new Set(['pathPadding', 'pathJitter', 'fragment', 'hostCamouflage', 'multiPort']);

function scrubSettingString(value: unknown, maxLength = 200): string {
  return String(value ?? '').slice(0, maxLength);
}

export function sanitizeArenaContext(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const input = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  if (Array.isArray(input.latencies)) {
    out.latencies = input.latencies
      .slice(0, 50)
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item) && item >= 0)
      .map((item) => clamp(Math.round(item), 0, 60_000));
  }

  if (input.goal === 'gaming' || input.goal === 'normal' || input.goal === 'stable') {
    out.goal = input.goal;
  }

  if (input.results && typeof input.results === 'object' && !Array.isArray(input.results)) {
    const results: Record<string, { ok: boolean; latencyMs: number | null; error: string; checkedAt: number }> = {};
    for (const [key, value] of Object.entries(input.results as Record<string, unknown>).slice(0, 100)) {
      const id = sanitizeArenaText(key, 80);
      if (!id) continue;
      const record = (value ?? {}) as Record<string, unknown>;
      const latency = Number(record.latencyMs);
      results[id] = {
        ok: record.ok === true,
        latencyMs: Number.isFinite(latency) && latency >= 0 ? clamp(Math.round(latency), 0, 60_000) : null,
        error: sanitizeArenaText(record.error, 80),
        checkedAt: Number.isFinite(Number(record.checkedAt)) ? Number(record.checkedAt) : 0,
      };
    }
    out.results = results;
  }

  if (input.settings && typeof input.settings === 'object' && !Array.isArray(input.settings)) {
    const source = input.settings as Record<string, unknown>;
    const settings: Record<string, unknown> = {};
    for (const key of SETTINGS_STRING_KEYS) {
      if (key in source) settings[key] = scrubSettingString(source[key]);
    }
    for (const key of SETTINGS_ARRAY_KEYS) {
      const list = Array.isArray(source[key]) ? (source[key] as unknown[]) : [];
      settings[key] = list.slice(0, 12).map((item) =>
        key === 'tlsPorts' ? clamp(Math.floor(Number(item)) || 0, 0, 65_535) : scrubSettingString(item, 120));
    }
    const anti = (source.antiDetect ?? {}) as Record<string, unknown>;
    const antiDetect: Record<string, boolean> = {};
    for (const flag of SETTINGS_ANTIDETECT_FLAGS) antiDetect[flag] = anti[flag] === true;
    settings.antiDetect = antiDetect;
    out.settings = settings;
  }

  if (typeof input.workerHost === 'string') {
    out.workerHost = sanitizeArenaText(input.workerHost.replace(/^https?:\/\//i, '').replace(/\/.*$/, ''), 120).toLowerCase();
  }

  if (Number.isFinite(Number(input.now))) out.now = Number(input.now);

  return out;
}

// ---------------------------------------------------------------------------
// Service 1 — build-plan (reuses the proven safe plan engine)
// ---------------------------------------------------------------------------

function buildPlanRun(promptRaw: string): ArenaRunResult {
  const prompt = String(promptRaw ?? '').slice(0, 1000);
  const plan = deterministicAiBuildPlan(prompt);
  const warnings = [...plan.warnings];
  if (prompt.trim().length < 3) {
    warnings.unshift('متن درخواست کوتاه است؛ برای طرح Gaming نام حداقل یک بازی و برای اعداد دقیق، تعداد Route یا ساب را بنویس.');
  }
  return {
    service: 'build-plan',
    title: arenaServiceSpec('build-plan').title,
    summary: plan.explanation,
    findings: [
      `حالت مصرف: ${plan.usageMode === 'gaming' ? 'Gaming' : 'Normal'}`,
      `تعداد Route: ${plan.paths} · تعداد ساب: ${plan.subscriptionCount}`,
      `Presets: ${SPEED_PRESETS[plan.speedPreset].label} / ${plan.profileMode}`,
      plan.ready ? 'طرح برای ساخت آماده است.' : 'طرح هنوز برای ساخت کامل نیست.',
    ],
    metrics: {
      paths: plan.paths,
      subscriptionCount: plan.subscriptionCount,
      games: plan.gameIds.length,
      ironCount: plan.ironCount,
    },
    warnings,
    plan,
  };
}

// ---------------------------------------------------------------------------
// Service 2 — profile-coach
// ---------------------------------------------------------------------------

interface CoachContext {
  goal?: 'normal' | 'gaming' | 'stable';
  latencies?: number[];
}

function profileCoachRun(context: CoachContext): ArenaRunResult {
  const goal: 'normal' | 'gaming' | 'stable' =
    context.goal === 'gaming' || context.goal === 'stable' ? context.goal : 'normal';
  const latencies = (Array.isArray(context.latencies) ? context.latencies : [])
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item >= 0)
    .map((item) => clamp(Math.round(item), 0, 60_000))
    .slice(0, 50);
  const healthy = latencies.length;
  const bestMs = healthy > 0 ? Math.min(...latencies) : 0;
  const avgMs = healthy > 0 ? Math.round(latencies.reduce((sum, item) => sum + item, 0) / healthy) : 0;

  let advice: ArenaAdvice;
  const findings: string[] = [];
  const warnings: string[] = [];
  if (goal === 'stable') {
    advice = { speedPreset: 'stable', profileMode: 'fallback' };
    findings.push('هدف دوام انتخاب شد؛ Fallback روی مسیرهای سالم، قطع‌وشدن لحظه‌ای را تحمل می‌کند.');
  } else if (healthy === 0) {
    advice = { speedPreset: 'stable', profileMode: 'fallback' };
    warnings.push('داده Probe سالمی در دسترس نیست؛ تا اندازه‌گیری واقعی، پیش‌فرض محافظه‌کار انتخاب شد.');
    findings.push('اول Probe را اجرا کن؛ مربی فقط از عددهای واقعی حداکثر ۵۰ Endpoint سالم استفاده می‌کند.');
  } else if (goal === 'gaming') {
    if (bestMs <= 150) {
      advice = { speedPreset: 'latency', profileMode: 'auto' };
      findings.push('برای Gaming، LOW PING کم‌تأخیرترین Route سالم را سریع‌تر انتخاب می‌کند؛ Ping فیزیکی تضمین نمی‌شود.');
    } else {
      advice = { speedPreset: 'stable', profileMode: 'fallback' };
      findings.push('بهترین Route هم تأخیر بالایی دارد؛ دوام Fallback از پرش بین مسیرهای کند جلوگیری می‌کند.');
    }
  } else if (bestMs <= 80) {
    advice = { speedPreset: 'turbo', profileMode: 'balance' };
    findings.push('Endpointهای نزدیک و سالم داری؛ Turbo با توزیع بار بیشترین Throughput پایدار را می‌دهد.');
  } else if (bestMs <= 180) {
    advice = { speedPreset: 'balanced', profileMode: 'auto' };
    findings.push('تعادل سرعت و تشخیص خرابی برای اکثر ISPها در Balanced قرار دارد.');
  } else {
    advice = { speedPreset: 'stable', profileMode: 'fallback' };
    findings.push('تأخیرها بالاست؛ دوام مهم‌تر از تعویض سریع مسیر است.');
  }

  const summary = healthy === 0
    ? 'بدون اندازه‌گیری واقعی نمی‌توان پروفایل پرسرعت توصیه کرد؛ Stable/Fallback امن‌ترین شروع است.'
    : `از ${healthy} Endpoint سالم با بهترین تأخیر ${bestMs}ms و میانگین ${avgMs}ms، ترکیب ${SPEED_PRESETS[advice.speedPreset].label}/${advice.profileMode} پیشنهاد می‌شود.`;

  return {
    service: 'profile-coach',
    title: arenaServiceSpec('profile-coach').title,
    summary,
    findings,
    metrics: { endpoints: healthy, bestMs, avgMs },
    warnings,
    advice,
  };
}

// ---------------------------------------------------------------------------
// Service 3 — endpoint-analyst
// ---------------------------------------------------------------------------

interface ProbeLike {
  ok: boolean;
  latencyMs: number | null;
  error: string;
  checkedAt: number;
}

function endpointAnalystRun(context: { results?: Record<string, ProbeLike>; now?: number }): ArenaRunResult {
  const entries = Object.entries(context.results ?? {}).slice(0, 100);
  const now = Number.isFinite(Number(context.now)) ? Number(context.now) : Date.now();
  let healthy = 0;
  let failed = 0;
  let stale = 0;
  let bestMs = 0;
  let worstMs = 0;
  for (const [, record] of entries) {
    if (record.checkedAt > 0 && now - record.checkedAt > 30 * 60_000) stale += 1;
    if (record.ok && typeof record.latencyMs === 'number') {
      healthy += 1;
      if (bestMs === 0 || record.latencyMs < bestMs) bestMs = record.latencyMs;
      if (record.latencyMs > worstMs) worstMs = record.latencyMs;
    } else {
      failed += 1;
    }
  }
  const total = entries.length;
  const spreadMs = healthy > 1 ? worstMs - bestMs : 0;

  const findings: string[] = [];
  const warnings: string[] = [];
  if (total === 0) {
    warnings.push('هیچ نتیجه Probe‌ای ثبت نشده؛ اول صفحه شبکه را Probe کن.');
    findings.push('بدون Endpoint سالم، Auto Build به دامنه فعلی خود Worker تکیه می‌کند.');
  }
  if (total > 0 && healthy === 0) {
    warnings.push('هیچ Endpoint سالمی بین نتایج نیست؛ ساخت با Endpoint خراب فقط Timeout می‌سازد.');
  }
  if (total === 1) findings.push('فقط یک Endpoint داری؛ برای Failover واقعی Deploy یا Custom Domain دوم اضافه کن.');
  if (healthy >= 2 && spreadMs > 300) {
    findings.push(`پراکندگی ${spreadMs}ms بین سالم‌ها زیاد است؛ گروه Auto خودش سریع‌ترین را انتخاب می‌کند اما ثبات هر ISP متفاوت است.`);
  }
  if (stale > 0) findings.push(`${stale} نتیجه قدیمی‌تر از ۳۰ دقیقه است؛ پیش از قضاوت Probe تازه بگیر.`);
  if (healthy > 0) findings.push(`بهترین Endpoint سالم با تأخیر ${bestMs}ms اندازه‌گیری شده است.`);

  const summary = total === 0
    ? 'ناوگان Endpoint هنوز اندازه‌گیری نشده است.'
    : healthy === total
      ? `هر ${total} Endpoint سالم است؛ بهترین تأخیر ${bestMs}ms.`
      : `${healthy} Endpoint از ${total} سالم است؛ ${failed} خراب و بهترین تأخیر ${bestMs}ms.`;

  return {
    service: 'endpoint-analyst',
    title: arenaServiceSpec('endpoint-analyst').title,
    summary,
    findings,
    metrics: { total, healthy, failed, stale, bestMs, worstMs, spreadMs },
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Service 4 — security-review
// ---------------------------------------------------------------------------

interface ReviewSettings {
  doh?: string;
  dohAlt?: Array<string | number>;
  healthUrl?: string;
  tlsPorts?: Array<string | number>;
  hostAliases?: Array<string | number>;
  supportUrl?: string;
  brand?: string;
  title?: string;
  fingerprint?: string;
  antiDetect?: Record<string, boolean>;
}

function securityReviewRun(context: { settings?: ReviewSettings; workerHost?: string }): ArenaRunResult {
  const settings = context.settings ?? {};
  const anti = settings.antiDetect ?? {};
  const host = String(context.workerHost ?? '').toLowerCase();
  let score = 100;
  const findings: string[] = [];
  const warnings: string[] = [];
  const deduct = (points: number, line: string) => {
    score = clamp(score - points, 0, 100);
    findings.push(line);
  };

  if (!/^https:\/\//i.test(String(settings.doh ?? ''))) {
    deduct(15, 'Resolver اصلی DoH باید HTTPS باشد؛ DNS متن‌باز Query کاربران را لو می‌دهد.');
  } else {
    findings.push('✓ Resolver اصلی DoH روی HTTPS است.');
  }
  const badAlt = (settings.dohAlt ?? []).filter((alt) => !/^https:\/\//i.test(String(alt))).length;
  if (badAlt > 0) deduct(Math.min(10, badAlt * 5), 'بعضی Resolverهای جایگزین HTTPS نیستند؛ آن‌ها را حذف یا اصلاح کن.');

  const health = String(settings.healthUrl ?? '');
  if (health) {
    if (!/^https:\/\//i.test(health)) {
      deduct(10, 'Health Check باید HTTPS باشد تا پاسخ سالم/خراب قابل‌جعل نباشد.');
    } else if (host && health.toLowerCase().includes(host)) {
      deduct(20, 'Health Check به دامنه خود Worker اشاره دارد؛ چنین Loopی Timeout کاذب همه مسیرها می‌سازد. مقصد مستقل انتخاب کن.');
    } else {
      findings.push('✓ Health Check مستقل و HTTPS است.');
    }
  } else {
    findings.push('✓ Health Check خارجی پیش‌فرض (بدون Loop) استفاده می‌شود.');
  }

  const ports = (settings.tlsPorts ?? []).map((port) => Number(port)).filter((port) => Number.isFinite(port));
  const invalidPorts = ports.filter((port) => !CLOUDFLARE_TLS_PORTS.includes(port)).length;
  if (ports.length === 0) deduct(10, 'هیچ پورت TLSی انتخاب نشده؛ حداقل 443 لازم است.');
  else if (invalidPorts > 0) deduct(15, 'پورت‌هایی خارج از فهرست رسمی Cloudflare انتخاب شده‌اند؛ کلاینت‌ها TLS را کامل نمی‌کنند.');
  else findings.push('✓ پورت‌های TLS در فهرست رسمی Cloudflareاند.');
  if (anti.multiPort && ports.length <= 1) findings.push('ℹ Multi-port روشن است اما فقط یک پورت فعال است؛ اثر عملی ندارد.');
  if (anti.multiPort && host.endsWith('.workers.dev')) warnings.push('روی workers.dev فقط پورت 443 واقعاً پایدار است؛ Multi-port برای Custom Domain سازگار است.');

  const aliases = (settings.hostAliases ?? []).map(String).filter(Boolean);
  if (aliases.length > 0) {
    deduct(Math.min(20, aliases.length * 10), 'Host Alias ثبت شده؛ فقط دامنه‌هایی مجازند که مالکش هستی و در Endpointها Route شده‌اند، وگرنه TLS می‌شکند.');
  }
  if (anti.hostCamouflage && aliases.length === 0) findings.push('ℹ Host Camouflage بدون Alias فعال نیست و نادیده گرفته می‌شود.');

  const support = String(settings.supportUrl ?? '');
  if (support && !/^https:\/\//i.test(support)) deduct(5, 'لینک پشتیبانی HTTPS نیست؛ کاربران را فقط به مقصد امن بفرست.');
  if (String(settings.brand ?? '').length > 60 || String(settings.title ?? '').length > 60) {
    deduct(5, 'عنوان/برند خیلی بلند است؛ در نام کانفیگ و هدر کلاینت‌ها خراب نمایش داده می‌شود.');
  }
  if (anti.fragment) findings.push('ℹ Fragment hint فعال است؛ فقط با کلاینت‌های Meta/sing-box سازگار کار می‌کند و پیش‌فرض خاموش پیشنهاد می‌شود.');
  if (String(settings.fingerprint ?? '') === 'random') findings.push('ℹ Fingerprint تصادفی می‌تواند نسخه‌های قدیمی بعضی کلاینت‌ها را ناسازگار کند؛ Chrome امن‌ترین پیش‌فرض است.');

  const summary = score >= 90
    ? 'تنظیمات در وضعیت خوبی است؛ فقط نکات اطلاعاتی باقی مانده.'
    : score >= 70
      ? 'وضعیت قابل‌قبول است اما چند مورد ریسکی دارد که بهتر است اصلاح شوند.'
      : 'تنظیمات نیازمند اصلاح جدی است؛ موارد بالا را قبل از فروش ساب برطرف کن.';

  return {
    service: 'security-review',
    title: arenaServiceSpec('security-review').title,
    summary,
    findings,
    metrics: { score, deductions: 100 - score, aliases: aliases.length, tlsPorts: ports.length },
    warnings,
    score,
  };
}

// ---------------------------------------------------------------------------
// Entry — dispatch one Arena run
// ---------------------------------------------------------------------------

export function deterministicArenaRun(service: ArenaServiceId, input: ArenaRunInput = {}): ArenaRunResult {
  const context = input.context ?? {};
  switch (service) {
    case 'build-plan':
      return buildPlanRun(input.prompt ?? '');
    case 'profile-coach':
      return profileCoachRun(context as CoachContext);
    case 'endpoint-analyst':
      return endpointAnalystRun(context as { results?: Record<string, ProbeLike>; now?: number });
    case 'security-review':
      return securityReviewRun(context as { settings?: ReviewSettings; workerHost?: string });
  }
}

/** System instruction for the optional Workers AI summary of a finished run. */
export function arenaModelInstruction(spec: ArenaServiceSpec, result: ArenaRunResult): string {
  return [
    `You are writing the one-paragraph Persian summary of the AMINNOVA Arena service "${spec.title}".`,
    'Rules: reply with Persian plain text only. Never invent numbers. Never output URLs, IP addresses, UUIDs, base64, hex tokens, code or markdown.',
    'Never promise ping, speed, censorship bypass or uptime. Keep it under 60 words.',
    `Deterministic verdict: ${result.summary}`,
    `Findings: ${result.findings.slice(0, 8).join(' | ')}`,
    result.warnings.length > 0 ? `Warnings: ${result.warnings.slice(0, 4).join(' | ')}` : '',
  ].filter(Boolean).join('\n');
}
