// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — موتور انتخاب سطح هوش بات‌ها (Adaptive Bot Tier)
//
//  قانون اصلی: سطح هوش بات‌ها «ثابت نیست». از ELO/لول/رنک *بازیکنان واقعیِ
//  حاضر در همان مچ* محاسبه می‌شود و در طول مچ پلکانی «ترفیع» می‌گیرد.
//  سطوح پایین = بدون LLM (فقط درخت رفتار، صفر هزینه).
//  سطوح بالاتر = مدل سبک‌تر → مدل پرو (llama-3.2-3b → 3.1-8b → 3.3-70b).
// ═══════════════════════════════════════════════════════════════════
import { clamp } from './rng.js';
import { skillIndex } from './elo.js';

/** آستانه‌های نگاشت شاخص مهارت → سطح */
export const TIER_THRESHOLDS = [
  { tier: 'T0', min: 0.0 },
  { tier: 'T1', min: 0.22 },
  { tier: 'T2', min: 0.42 },
  { tier: 'T3', min: 0.62 },
  { tier: 'T4', min: 0.8 },
];

/** سقف سطح در مودهایی که LLM در آن‌ها بی‌فایده است (هزینهٔ بیهوده نده) */
export const MODE_TIER_CAP = {
  tntrun: 'T2',
  parkour: 'T2',
  spleef: 'T3',
  buildbattle: 'T4',
  factions: 'T3',
};

export const TIER_ORDER = ['T0', 'T1', 'T2', 'T3', 'T4'];

export const tierIndex = (id) => Math.max(0, TIER_ORDER.indexOf(String(id)));
export function tierById(tiersSpec, id) {
  const list = tiersSpec?.tiers || tiersSpec || [];
  return list.find((t) => t.id === id) || list[0];
}
export function shiftTier(id, delta, capId = 'T4', floorId = 'T0') {
  const i = clamp(tierIndex(id) + Number(delta || 0), tierIndex(floorId), tierIndex(capId));
  return TIER_ORDER[i];
}
export function maxTier(a, b) {
  return tierIndex(a) >= tierIndex(b) ? a : b;
}

export function tierForSkill(skill) {
  let out = 'T0';
  for (const t of TIER_THRESHOLDS) if ((Number(skill) || 0) >= t.min) out = t.tier;
  return out;
}

/** صدک p (0..1) از آرایهٔ اعداد — بدون کتابخانه */
export function percentile(values, p) {
  const list = (values || []).map((v) => Number(v) || 0).sort((a, b) => a - b);
  if (!list.length) return 0;
  const idx = clamp(Math.round((Number(p) || 0.5) * (list.length - 1)), 0, list.length - 1);
  return list[idx];
}

/**
 * شاخص مهارت یک بازیکن (انسان) از روی پروفایلش
 */
export function playerSkill(p = {}, ranks = []) {
  const rank = ranks.find((r) => r.id === (p.rank_id || p.rank)) || { index: 0, bot_skill_bias: 0 };
  return skillIndex({
    rating: p.rating ?? p.elo ?? 1000,
    level: p.level ?? 1,
    rank_index: p.rank_index ?? rank.index ?? 0,
    games: p.games ?? p.games_played ?? 0,
    bias: p.rank_bias ?? rank.bot_skill_bias ?? 0,
  });
}

/**
 * انتخاب سطح پایهٔ بات‌ها برای یک مچ
 * @param {object} o {mode, players, tiersSpec, ranks, settings}
 *  players: [{id, is_bot, rating, level, rank_id, games}]
 *  settings: {bot_tier_offset, llm_enabled, force_tier, max_tier}
 * @returns {object} {tier, tier_def, model, skill_human, reasons[], caps}
 */
export function chooseMatchTier(o = {}) {
  const mode = o.mode || {};
  const tiersSpec = o.tiersSpec || { tiers: [] };
  const ranks = o.ranks || [];
  const settings = o.settings || {};
  const players = o.players || [];
  const humans = players.filter((p) => !p.is_bot);
  const reasons = [];

  if (settings.force_tier && tierIndex(settings.force_tier) >= 0) {
    return {
      tier: settings.force_tier,
      tier_def: tierById(tiersSpec, settings.force_tier),
      model: null,
      skill_human: 0,
      human_count: humans.length,
      reasons: ['force_tier از تنظیمات ادمین'],
      escalated_from: null,
    };
  }

  // ۱) شاخص مهارت انسان‌ها — برای مودهای رقابتی صدک ۷۵ (تا سمورف‌ها سطح را بالا ببرند)
  const skills = humans.map((p) => playerSkill(p, ranks));
  const useMax = ['duels', 'thebridge'].includes(mode.id); // بدون نرم‌سازی
  const stat = !skills.length
    ? 0
    : useMax
      ? Math.max(...skills)
      : percentile(skills, mode.category === 'coop' ? 0.5 : 0.75);
  let tier = tierForSkill(stat);

  // ۲) کف اجباری از رنک بالاترین بازیکن حاضر (طبق ranks.json → bot_min_tier)
  let rankFloor = 'T0';
  for (const p of humans) {
    const r = ranks.find((x) => x.id === (p.rank_id || p.rank));
    if (r?.bot_min_tier) rankFloor = maxTier(rankFloor, r.bot_min_tier);
  }
  if (tierIndex(rankFloor) > tierIndex(tier)) {
    reasons.push(`رنک بازیکن حاضر کف سطح را به ${rankFloor} برد`);
    tier = rankFloor;
  }

  // ۳) سقف مود
  const cap = MODE_TIER_CAP[mode.id] || 'T4';
  if (tierIndex(tier) > tierIndex(cap)) {
    reasons.push(`سقف مود ${mode.id} سطح را به ${cap} محدود کرد`);
    tier = cap;
  }
  if (settings.max_tier && tierIndex(tier) > tierIndex(settings.max_tier)) tier = settings.max_tier;

  // ۴) اگر LLM خاموش است، سطوح LLM‌دار به رفتار محلی تنزل می‌کنند (اما پارامتر مهارت همان می‌ماند)
  const llmEnabled = settings.llm_enabled !== false && settings.llm_enabled !== '0';
  if (!llmEnabled) reasons.push('LLM غیرفعال: تصمیم‌ها فقط از درخت رفتار محلی می‌آیند');

  // ۵) شروع یک پله پایین‌تر (escalation.start_offset) تا مچ با فشار ملایم شروع شود
  const esc = tiersSpec.escalation || {};
  const startOffset = Number(esc.start_offset ?? (mode.match?.duration_sec ? -1 : 0));
  const startTier = mode.match?.duration_sec ? shiftTier(tier, startOffset, tier) : tier;
  if (startTier !== tier) reasons.push(`شروع از ${startTier} و ترفیع تدریجی تا ${tier} در طول مچ`);

  const tierDef = tierById(tiersSpec, tier);
  return {
    tier,
    start_tier: startTier,
    tier_def: tierDef,
    start_tier_def: tierById(tiersSpec, startTier),
    model: llmEnabled && tierDef ? tierDef.model : null,
    llm_enabled: llmEnabled && !!tierDef?.llm_enabled,
    skill_human: Math.round(stat * 1000) / 1000,
    human_count: humans.length,
    bot_count: players.length - humans.length,
    reasons,
    cap,
  };
}

/**
 * ترفیع تدریجی در طول مچ (پله‌ها از bot-tiers.json)
 * @returns {{tier:string, delta:number, reason:string}}
 */
export function tierAtTime(baseTier, startTier, o = {}) {
  const esc = o.escalation || {};
  const steps = esc.ramp_steps || [];
  const duration = Math.max(1, Number(o.duration_sec) || 0);
  const elapsed = clamp(Number(o.elapsed_sec) || 0, 0, duration);
  const pct = (elapsed / duration) * 100;

  // بند-لاستیکی: اگر انسان‌ها له شده‌اند، ترفیع نمی‌دهیم؛ اگر مسلط‌اند، زودتر ترفیع می‌دهیم
  const rb = esc.comeback_rubbery || {};
  let humanShare = Number(o.human_score_share);
  let extra = 0;
  if (rb.enabled && Number.isFinite(humanShare)) {
    if (humanShare <= (rb.crushed_threshold ?? 0.25)) {
      return { tier: startTier || baseTier, delta: 0, reason: 'انسان‌ها عقب‌اند → ترفیع متوقف (rubber-band)' };
    }
    if (humanShare >= (rb.dominating_threshold ?? 0.65)) extra = 1;
  }

  let delta = 0;
  for (const s of steps) {
    if (pct >= (Number(s.at_pct_of_duration) || 0) + (extra ? -8 : 0)) delta += Number(s.delta) || 0;
  }
  const tier = shiftTier(startTier || baseTier, delta, baseTier);
  return { tier, delta, reason: delta ? `${Math.round(pct)}% از مچ → +${delta} سطح` : 'بدون ترفیع' };
}

/**
 * پارامترهای انسانی‌شدهٔ یک بات مشخص (تا دو بات هم‌سطح یکسان رفتار نکنند)
 */
export function humanizeBot(tierDef, botSeed, o = {}) {
  const hum = o.humanization || {};
  const jitter = Number(hum.per_bot_jitter ?? 0.18);
  const r = ((Number(botSeed) || 1) % 1000) / 1000; // 0..1 پایدار از seed
  const j = (v, inv = false) => {
    const n = Number(v) || 0;
    const f = 1 + (r - 0.5) * 2 * jitter * (inv ? -1 : 1);
    return Math.round(n * f * 1000) / 1000;
  };
  const elapsed = Number(o.elapsed_sec) || 0;
  let fatigue = 0;
  if (hum.fatigue?.enabled && elapsed > (hum.fatigue.skill_decay_after_sec || 420)) {
    fatigue = Math.min(Number(hum.fatigue.decay) || 0.06, ((elapsed - 420) / 600) * (Number(hum.fatigue.decay) || 0.06));
  }
  const skill = clamp((Number(tierDef?.skill) || 0.2) - fatigue + (Number(o.rank_bias) || 0), 0, 1);
  return {
    skill: Math.round(skill * 1000) / 1000,
    reaction_ms: {
      min: Math.round(j(tierDef?.reaction_ms?.min ?? 400, true)),
      max: Math.round(j(tierDef?.reaction_ms?.max ?? 700, true)),
    },
    aim_error_deg: {
      min: Math.round(j(tierDef?.aim_error_deg?.min ?? 5, true) * 10) / 10,
      max: Math.round(j(tierDef?.aim_error_deg?.max ?? 12, true) * 10) / 10,
    },
    mistake_rate: clamp(j(tierDef?.mistake_rate ?? 0.1, true), 0.01, 0.5),
    bridge_quality: clamp(j(tierDef?.bridge_quality ?? 0.5), 0, 1),
    combo_chance: clamp(j(tierDef?.combo_chance ?? 0.2), 0, 1),
    strafe_quality: clamp(j(tierDef?.strafe_quality ?? 0.4), 0, 1),
    teamwork: clamp(j(tierDef?.teamwork ?? 0.3), 0, 1),
    retreat_hp: clamp(j(tierDef?.retreat_hp ?? 0.25), 0, 0.6),
    build_skill: clamp(j(tierDef?.build_skill ?? 0.3), 0, 1),
    deception: clamp(j(tierDef?.deception ?? 0, true), 0, 1),
    resource_efficiency: clamp(j(tierDef?.resource_efficiency ?? 0.5), 0, 1),
    decision_hz: Math.max(1, Math.round(j(tierDef?.decision_hz ?? 5))),
    fatigue,
    chat_enabled: tierIndex(tierDef?.id) >= tierIndex(hum.chat?.enabled_from_tier || 'T2'),
    chat_per_min: Math.min(2, Number(hum.chat?.messages_per_min_max) || 2),
  };
}

/** بودجهٔ فراخوانی LLM برای یک مچ (محافظ هزینه) */
export function llmBudget(tierDef, modeSpec, botCount, guard = {}) {
  const perMatch = Number(guard.max_llm_calls_per_match) || 400;
  const perBot = Number(guard.max_llm_calls_per_bot_per_match) || 90;
  const interval = Number(modeSpec?.bot?.llm_interval_sec?.[tierDef?.id] || 0);
  const duration = Number(modeSpec?.match?.duration_sec) || 0;
  const theoretical = interval > 0 && duration > 0 ? Math.floor(duration / interval) * botCount : 0;
  const capped = Math.min(theoretical, perBot * botCount, perMatch);
  return { interval_sec: interval, per_bot: perBot, per_match: perMatch, theoretical, allowed: capped, llm_used: capped > 0 };
}
