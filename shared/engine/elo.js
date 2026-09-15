// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — موتور ELO / امتیاز رنک (RP) / سطح مهارت
//  ⚠️ این فایل «منبع حقیقت» ریاضیات رتبه‌بندی است.
//     پورت دقیق آن در:
//       java-plugin/.../core/EloEngine.java
//       bedrock-plugin/src/NovaEdge/core/EloEngine.php
//     وجود دارد و هر سه با shared/testvectors.json تست می‌شوند.
// ═══════════════════════════════════════════════════════════════════
import { clamp } from './rng.js';

export const ELO = {
  FLOOR: 100,
  CAP: 4000,
  START: 1000,
  PROVISIONAL_GAMES: 10,
  PROVISIONAL_K_MULT: 1.5,
  HIGH_RATING: 2200,
  HIGH_K_MULT: 0.75,
  VERY_HIGH_RATING: 2600,
  VERY_HIGH_K_MULT: 0.6,
  DECAY_AFTER_DAYS: 21,
  DECAY_PER_WEEK: 8,
  DECAY_MIN_RATING: 1400,
};

export function expectedScore(ratingA, ratingB) {
  const a = Number(ratingA) || ELO.START;
  const b = Number(ratingB) || ELO.START;
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

/** میانگین رتبهٔ تیم (برای مودهای تیمی) */
export function teamRating(ratings) {
  const list = (ratings || []).map((r) => Number(r) || ELO.START).filter((n) => Number.isFinite(n));
  if (!list.length) return ELO.START;
  return list.reduce((s, n) => s + n, 0) / list.length;
}

/**
 * ضریب K مؤثر: مود + وضعیت پروویژنال + رتبهٔ بالا
 * @returns {number}
 */
export function effectiveK(baseK, gamesPlayed, rating) {
  let k = Math.max(4, Number(baseK) || 24);
  if ((Number(gamesPlayed) || 0) < ELO.PROVISIONAL_GAMES) k *= ELO.PROVISIONAL_K_MULT;
  if ((Number(rating) || 0) >= ELO.VERY_HIGH_RATING) k *= ELO.VERY_HIGH_K_MULT;
  else if ((Number(rating) || 0) >= ELO.HIGH_RATING) k *= ELO.HIGH_K_MULT;
  return Math.round(k * 100) / 100;
}

/**
 * امتیاز واقعی S از روی جایگاه در مودهای FFA
 * نفر اول = ۱، نفر آخر = ۰
 */
export function placementScore(place, playerCount) {
  const p = clamp(Number(place) || 1, 1, Math.max(1, Number(playerCount) || 1));
  const n = Math.max(2, Number(playerCount) || 2);
  return (n - p) / (n - 1);
}

/**
 * محاسبهٔ تغییر ELO برای یک بازیکن/تیم
 * @param {object} o {rating, opponentRating, baseK, gamesPlayed, score}
 * @returns {{delta:number, expected:number, k:number, rating:number}}
 */
export function eloDelta(o = {}) {
  const rating = clamp(Number(o.rating) || ELO.START, ELO.FLOOR, ELO.CAP);
  const opp = clamp(Number(o.opponentRating) || ELO.START, ELO.FLOOR, ELO.CAP);
  const e = expectedScore(rating, opp);
  const s = clamp(Number(o.score) || 0, 0, 1);
  const k = effectiveK(o.baseK, o.gamesPlayed, rating);
  const delta = Math.round(k * (s - e));
  return { delta, expected: Math.round(e * 10000) / 10000, k, rating: clamp(rating + delta, ELO.FLOOR, ELO.CAP) };
}

/**
 * نتایج کامل یک مچ برای همهٔ بازیکنان (انسان و بات)
 * @param {object} o {mode, players, placements, teams}
 *  teams: [{index, players:[{id}]}] — اگر داده شود، رتبهٔ حریف از تیم مقابل
 *  گرفته می‌شود (دقیق‌تر از میانگین کل برای مودهای تیمی).
 */
export function settleMatch({ mode, players = [], placements = {}, teams = null }) {
  const baseK = Number(mode?.match?.elo_k) || 24;
  const category = String(mode?.category || 'ffa');
  const humans = players.filter((p) => !p.is_bot);
  const n = players.length;

  // نگاشت بازیکن → تیم
  const teamOf = new Map();
  const teamRatingOf = new Map();
  if (Array.isArray(teams) && teams.length > 1) {
    for (const t of teams) {
      const ids = (t.players || []).map((p) => String(p.id ?? p));
      const list = players.filter((p) => ids.includes(String(p.id)));
      for (const id of ids) teamOf.set(id, t.index);
      teamRatingOf.set(t.index, teamRating(list.map((p) => Number(p.rating) || ELO.START)));
    }
  }

  const total = players.reduce((s, p) => s + clamp(Number(p.rating) || ELO.START, ELO.FLOOR, ELO.CAP), 0);
  const out = [];
  for (const p of players) {
    const my = clamp(Number(p.rating) || ELO.START, ELO.FLOOR, ELO.CAP);
    let oppRating;
    const myTeam = teamOf.get(String(p.id));
    if (myTeam !== undefined && teamRatingOf.size > 1) {
      // میانگین رتبهٔ تیم‌های مقابل
      const others = [...teamRatingOf.entries()].filter(([idx]) => idx !== myTeam).map(([, r]) => r);
      oppRating = others.length ? others.reduce((s, r) => s + r, 0) / others.length : my;
    } else {
      oppRating = n > 1 ? (total - my) / (n - 1) : my;
    }
    let score;
    if (category === 'coop' || category === 'social') {
      score = Number(p.won) ? 1 : 0;
    } else if (category === 'ffa' || category === 'race' || category === 'creative') {
      const place = Number(placements[p.id] ?? p.place ?? (p.won ? 1 : n));
      score = placementScore(place, n);
    } else {
      score = Number(p.won) ? 1 : 0;
    }
    const r = eloDelta({ rating: my, opponentRating: oppRating, baseK, gamesPlayed: p.games_played ?? p.games ?? 0, score });
    out.push({
      id: p.id,
      is_bot: !!p.is_bot,
      before: my,
      after: r.rating,
      delta: r.delta,
      expected: r.expected,
      score,
      rp: p.is_bot ? 0 : rankPointsFrom({ score_points: Number(p.score_points) || 0, elo_delta: r.delta }),
    });
  }
  return { category, base_k: baseK, human_count: humans.length, results: out };
}

/** امتیاز رنک (RP) از روی امتیاز مچ + تغییر ELO */
export function rankPointsFrom({ score_points = 0, elo_delta = 0 } = {}) {
  const base = Math.floor(Math.max(0, Number(score_points) || 0) / 10);
  const bonus = Math.floor(Math.max(0, Number(elo_delta) || 0) / 4);
  return Math.max(0, base + bonus);
}

/** رنک بر اساس RP (فقط نردبان امتیازی، بدون خرید) */
export function rankForRp(ranks, rp) {
  const list = (ranks || []).slice().sort((a, b) => (a.rp_required || 0) - (b.rp_required || 0));
  let best = list[0] || { id: 'free', index: 0 };
  for (const r of list) if ((Number(r.rp_required) || 0) <= (Number(rp) || 0)) best = r;
  return best;
}

/** رنک نهایی = بیشینهٔ (کسب‌شده با بازی، خریداری‌شده) */
export function effectiveRank(ranks, rp, purchasedRankId) {
  const list = (ranks || []).slice().sort((a, b) => (a.index || 0) - (b.index || 0));
  const earned = rankForRp(list, rp);
  const bought = list.find((r) => r.id === purchasedRankId) || null;
  if (bought && (bought.index || 0) > (earned.index || 0)) return { rank: bought, source: 'purchased' };
  return { rank: earned, source: bought ? 'earned_over_purchased' : 'earned' };
}

/** پیشرفت تا رنک بعدی (برای نوار پیشرفت UI) */
export function rankProgress(ranks, rp) {
  const list = (ranks || []).slice().sort((a, b) => (a.rp_required || 0) - (b.rp_required || 0));
  const cur = rankForRp(list, rp);
  const next = list.find((r) => (r.rp_required || 0) > (cur.rp_required || 0));
  if (!next) return { current: cur.id, next: null, pct: 100, remaining_rp: 0 };
  const span = (next.rp_required || 0) - (cur.rp_required || 0);
  const done = (Number(rp) || 0) - (cur.rp_required || 0);
  return {
    current: cur.id,
    next: next.id,
    pct: Math.round(clamp((done / Math.max(1, span)) * 100, 0, 100)),
    remaining_rp: Math.max(0, Math.ceil((next.rp_required || 0) - (Number(rp) || 0))),
  };
}

/** سطح (Level) از XP — فرمول economy.json */
export function levelForXp(xp) {
  const x = Math.max(0, Number(xp) || 0);
  return Math.min(200, Math.floor(Math.sqrt(x / 100)));
}
export function xpForLevel(level) {
  const l = Math.max(0, Number(level) || 0);
  return l * l * 100;
}

/**
 * شاخص مهارت ۰..۱ — ورودی اصلی انتخاب سطح هوش بات‌ها.
 * ترکیب ELO (وزن اصلی)، لول، رنک و سابقهٔ بازی.
 */
export function skillIndex({ rating = ELO.START, level = 1, rank_index = 0, games = 0, bias = 0 } = {}) {
  const eloPart = clamp(((Number(rating) || ELO.START) - 700) / 2000, 0, 1); // 700→0 , 2700→1
  const levelPart = clamp((Number(level) || 1) / 120, 0, 1);
  const rankPart = clamp((Number(rank_index) || 0) / 5, 0, 1);
  const expPart = clamp((Number(games) || 0) / 400, 0, 1);
  const raw = 0.5 * eloPart + 0.2 * levelPart + 0.2 * rankPart + 0.1 * expPart;
  return Math.round(clamp(raw + (Number(bias) || 0), 0, 1) * 1000) / 1000;
}

/** افول رتبه برای بازیکنان غیرفعال (فقط بالای آستانه) */
export function decayRating(rating, daysInactive) {
  const r = Number(rating) || ELO.START;
  if (r <= ELO.DECAY_MIN_RATING) return r;
  const weeks = Math.max(0, Math.floor(((Number(daysInactive) || 0) - ELO.DECAY_AFTER_DAYS) / 7));
  if (weeks <= 0) return r;
  return Math.max(ELO.DECAY_MIN_RATING, r - weeks * ELO.DECAY_PER_WEEK);
}
