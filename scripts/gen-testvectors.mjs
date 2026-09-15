#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
//  gen-testvectors — ساخت بردارهای طلایی (golden vectors) از موتور JS
//
//  این فایل «قرارداد رفتاری» موتور است: پیاده‌سازی‌های Java (Paper) و
//  PHP (PocketMine) باید برای همین ورودی‌ها، دقیقاً همین خروجی‌ها را
//  بدهند. scripts/verify-parity.mjs و JUnit تست جاوا همین را می‌سنجند.
//
//  اجرا: node scripts/gen-testvectors.mjs   → shared/testvectors.json
// ═══════════════════════════════════════════════════════════════════
import { writeFileSync } from 'node:fs';
import { mulberry32, hashSeed, clamp, round, Rng } from '../shared/engine/rng.js';
import * as elo from '../shared/engine/elo.js';
import * as scoring from '../shared/engine/scoring.js';
import * as bottier from '../shared/engine/bottier.js';
import * as ac from '../shared/engine/anticheat.js';
import * as mm from '../shared/engine/matchmaking.js';
import * as brain from '../shared/engine/brain.js';
import { getMode, listRanks, getTierDef, SPECS } from '../shared/engine/spec.js';

const R = (x, d = 8) => (typeof x === 'number' ? round(x, d) : x);
const deep = (v) => {
  if (typeof v === 'number') return R(v);
  if (Array.isArray(v)) return v.map(deep);
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = deep(x);
    return o;
  }
  return v;
};

const vectors = [];
const add = (group, fn, args, expect, note = '') => vectors.push({ group, fn, args: deep(args), expect: deep(expect), note });

// ── rng ──
{
  const r = mulberry32(12345);
  add('rng', 'mulberry32_seq', [12345, 6], Array.from({ length: 6 }, () => r()));
  const r2 = mulberry32(12345);
  add('rng', 'mulberry32_first', [999], r2 === undefined ? null : mulberry32(999)());
  add('rng', 'hashSeed', ['nova-edge-bedwars'], hashSeed('nova-edge-bedwars'));
  add('rng', 'hashSeed_empty', [''], hashSeed(''));
  add('rng', 'clamp', [5, 1, 3], clamp(5, 1, 3));
  add('rng', 'clamp_neg', [-4, 0, 10], clamp(-4, 0, 10));
  add('rng', 'round', [3.14159, 2], round(3.14159, 2));
}

// ── elo ──
{
  add('elo', 'expectedScore', [1500, 1600], elo.expectedScore(1500, 1600));
  add('elo', 'expectedScore_equal', [1200, 1200], elo.expectedScore(1200, 1200));
  add('elo', 'teamRating', [[1500, 1700, 1300]], elo.teamRating([1500, 1700, 1300]));
  add('elo', 'effectiveK_new', [32, 5, 1400], elo.effectiveK(32, 5, 1400));
  add('elo', 'effectiveK_vet', [32, 400, 2400], elo.effectiveK(32, 400, 2400));
  add('elo', 'placementScore_first', [1, 16], elo.placementScore(1, 16));
  add('elo', 'placementScore_last', [16, 16], elo.placementScore(16, 16));
  add('elo', 'eloDelta_win', [{ rating: 1500, opponentRating: 1600, score: 1, baseK: 32, gamesPlayed: 30 }], elo.eloDelta({ rating: 1500, opponentRating: 1600, score: 1, baseK: 32, gamesPlayed: 30 }));
  add('elo', 'eloDelta_loss', [{ rating: 1600, opponentRating: 1500, score: 0, baseK: 32, gamesPlayed: 300 }], elo.eloDelta({ rating: 1600, opponentRating: 1500, score: 0, baseK: 32, gamesPlayed: 300 }));
  add('elo', 'eloDelta_provisional', [{ rating: 1000, opponentRating: 1400, score: 1, baseK: 24, gamesPlayed: 2 }], elo.eloDelta({ rating: 1000, opponentRating: 1400, score: 1, baseK: 24, gamesPlayed: 2 }));

  const settlePlayers = [
    { id: 'a', rating: 1500, games: 30, won: true, score_points: 900 },
    { id: 'b', rating: 1600, games: 80, won: true, score_points: 700 },
    { id: 'c', rating: 1400, games: 10, won: false, score_points: 400 },
    { id: 'd', rating: 1550, games: 50, won: false, score_points: 350 },
    { id: 'bot1', is_bot: true, rating: 1500, games: 0, won: false },
  ];
  const settleTeams = [
    { index: 0, players: [{ id: 'a' }, { id: 'b' }] },
    { index: 1, players: [{ id: 'c' }, { id: 'd' }, { id: 'bot1' }] },
  ];
  const settle = elo.settleMatch({ mode: getMode('bedwars'), players: settlePlayers, teams: settleTeams });
  add('elo', 'settleMatch_teams', [{ mode: 'bedwars', players: settlePlayers, teams: settleTeams }], settle);

  add('elo', 'rankPointsFrom', [{ score_points: 2450, elo_delta: 18 }], elo.rankPointsFrom({ score_points: 2450, elo_delta: 18 }));
  const ranks = listRanks();
  add('elo', 'rankForRp_low', [600], elo.rankForRp(ranks, 600)?.id || null);
  add('elo', 'rankForRp_mid', [2600], elo.rankForRp(ranks, 2600)?.id || null);
  add('elo', 'rankForRp_top', [20000], elo.rankForRp(ranks, 20000)?.id || null);
  add('elo', 'effectiveRank_buy_lower', [2600, 'god'], elo.effectiveRank(ranks, 2600, 'god').rank.id);
  add('elo', 'effectiveRank_earn_higher', [20000, 'pro'], elo.effectiveRank(ranks, 20000, 'pro').rank.id);
  add('elo', 'rankProgress', [1400], elo.rankProgress(ranks, 1400));
  add('elo', 'levelForXp', [5400], elo.levelForXp(5400));
  add('elo', 'xpForLevel', [12], elo.xpForLevel(12));
  add('elo', 'skillIndex', [{ rating: 1850, level: 40, rank_index: 3, games: 220, bias: 0.5 }], elo.skillIndex({ rating: 1850, level: 40, rank_index: 3, games: 220, bias: 0.5 }));
  add('elo', 'decayRating', [1800, 45], elo.decayRating(1800, 45));
  add('elo', 'decayRating_none', [1800, 3], elo.decayRating(1800, 3));
}

// ── scoring ──
{
  const ev = [
    { type: 'kill', count: 4 }, { type: 'final_kill', count: 2 }, { type: 'bed_break', count: 1 },
    { type: 'death', count: 3 }, { type: 'resource_collected', count: 120 }, { type: 'team_upgrade', count: 1 },
  ];
  add('scoring', 'tallyEvents', [ev], scoring.tallyEvents(ev));
  add('scoring', 'parkourSpeedBonus_fast', [42, 60, 200], scoring.parkourSpeedBonus(42, 60, 200));
  add('scoring', 'parkourSpeedBonus_slow', [95, 60, 200], scoring.parkourSpeedBonus(95, 60, 200));

  const m = getMode('bedwars');
  const res = scoring.computePlayerResult({
    mode: m,
    events: ev,
    won: true,
    placement: 1,
    player_count: 16,
    afk_pct: 3,
    rating: 1500,
    games: 30,
    duration_sec: 900,
  });
  add('scoring', 'computePlayerResult_bedwars', [{ mode: 'bedwars', events: ev, won: true, placement: 1, player_count: 16, afk_pct: 3, rating: 1500, games: 30, duration_sec: 900 }], res);

  const res2 = scoring.computePlayerResult({
    mode: getMode('skywars'),
    events: [{ type: 'kill', count: 2 }, { type: 'death', count: 1 }, { type: 'chest_looted', count: 5 }],
    won: false, placement: 7, player_count: 12, afk_pct: 0, rating: 1200, games: 8, duration_sec: 480,
  });
  add('scoring', 'computePlayerResult_skywars', [{ mode: 'skywars', events: [{ type: 'kill', count: 2 }, { type: 'death', count: 1 }, { type: 'chest_looted', count: 5 }], won: false, placement: 7, player_count: 12, afk_pct: 0, rating: 1200, games: 8, duration_sec: 480 }], res2);

  const rs = [
    { id: 'a', points: 900, kills: 5, won: true },
    { id: 'b', points: 1200, kills: 3, won: false },
    { id: 'c', points: 400, kills: 1, won: true },
  ];
  add('scoring', 'pickMvp', [rs], scoring.pickMvp(rs));
}

// ── bottier ──
{
  const ranks = listRanks();
  add('bottier', 'tierForSkill', [0.2], bottier.tierForSkill(0.2)?.id || bottier.tierForSkill(0.2));
  add('bottier', 'tierForSkill_high', [0.92], bottier.tierForSkill(0.92)?.id || bottier.tierForSkill(0.92));
  add('bottier', 'shiftTier_up', ['T1', 2], bottier.shiftTier('T1', 2));
  add('bottier', 'shiftTier_cap', ['T3', 5], bottier.shiftTier('T3', 5));
  add('bottier', 'shiftTier_floor', ['T1', -4], bottier.shiftTier('T1', -4));
  add('bottier', 'maxTier', ['T2', 'T4'], bottier.maxTier('T2', 'T4'));
  add('bottier', 'percentile', [[10, 20, 30, 40, 50], 0.6], bottier.percentile([10, 20, 30, 40, 50], 0.6));
  add('bottier', 'playerSkill', [{ rating: 1900, level: 55, rank_index: 4, games: 300 }], bottier.playerSkill({ rating: 1900, level: 55, rank_index: 4, games: 300 }));

  const cmPlayers = [
    { id: 'h1', is_bot: false, rating: 2050, level: 70, rank_id: 'god', games: 500 },
    { id: 'h2', is_bot: false, rating: 1200, level: 9, rank_id: 'noob', games: 20 },
  ];
  const tier = bottier.chooseMatchTier({ mode: getMode('bedwars'), players: cmPlayers, fill_slots: 6, seed: 4242, ranks, tiersSpec: SPECS.tiers });
  add('bottier', 'chooseMatchTier_mixed', [{ mode: 'bedwars', players: cmPlayers, fill_slots: 6, seed: 4242, ranks, tiersSpec: SPECS.tiers }], tier);

  const cmLow = [{ id: 'n', is_bot: false, rating: 950, level: 2, rank_id: 'free', games: 3 }];
  const tierLow = bottier.chooseMatchTier({ mode: getMode('duels'), players: cmLow, fill_slots: 1, seed: 7, ranks, tiersSpec: SPECS.tiers });
  add('bottier', 'chooseMatchTier_newbie', [{ mode: 'duels', players: cmLow, fill_slots: 1, seed: 7, ranks, tiersSpec: SPECS.tiers }], tierLow);

  add('bottier', 'tierAtTime_early', ['T3', 'T1', { duration_sec: 1800, elapsed_sec: 60, human_share: 0.5, escalation: SPECS.tiers.escalation }], bottier.tierAtTime('T3', 'T1', { duration_sec: 1800, elapsed_sec: 60, human_share: 0.5, escalation: SPECS.tiers.escalation }));
  add('bottier', 'tierAtTime_mid', ['T3', 'T1', { duration_sec: 1800, elapsed_sec: 900, human_share: 0.5, escalation: SPECS.tiers.escalation }], bottier.tierAtTime('T3', 'T1', { duration_sec: 1800, elapsed_sec: 900, human_share: 0.5, escalation: SPECS.tiers.escalation }));
  add('bottier', 'tierAtTime_late_winning', ['T3', 'T1', { duration_sec: 1800, elapsed_sec: 1650, human_share: 0.8, escalation: SPECS.tiers.escalation }], bottier.tierAtTime('T3', 'T1', { duration_sec: 1800, elapsed_sec: 1650, human_share: 0.8, escalation: SPECS.tiers.escalation }));
  add('bottier', 'tierAtTime_late_losing', ['T3', 'T1', { duration_sec: 1800, elapsed_sec: 1650, human_share: 0.1, escalation: SPECS.tiers.escalation }], bottier.tierAtTime('T3', 'T1', { duration_sec: 1800, elapsed_sec: 1650, human_share: 0.1, escalation: SPECS.tiers.escalation }));

  const t2 = getTierDef('T2');
  add('bottier', 'humanizeBot', ['T2', 777, { humanization: SPECS.tiers.humanization }], bottier.humanizeBot(t2, 777, { humanization: SPECS.tiers.humanization }));
  add('bottier', 'llmBudget', ['T2', 'bedwars', 4, {}], bottier.llmBudget(t2, getMode('bedwars'), 4, {}));
}

// ── anticheat ──
{
  add('anticheat', 'reachLimit_low_ping', [40], ac.reachLimit(40));
  add('anticheat', 'reachLimit_high_ping', [350], ac.reachLimit(350));
  add('anticheat', 'speedLimit_sprint', [true, 120], ac.speedLimit(true, 120));
  add('anticheat', 'inspect_clean', [{ cps: 7, reach: 3.1, speed: 5.2, ping: 60, snap_streak: 0 }], ac.inspect({ cps: 7, reach: 3.1, speed: 5.2, ping: 60, snap_streak: 0 }));
  add('anticheat', 'inspect_cheat', [{ cps: 24, reach: 5.4, speed: 11.5, ping: 45, snap_streak: 6 }], ac.inspect({ cps: 24, reach: 5.4, speed: 11.5, ping: 45, snap_streak: 6 }));

  const tr = new ac.ViolationTracker();
  const seq = [
    { check: 'reach', value: 4.9, ping: 40 },
    { check: 'cps', value: 22, ping: 40 },
    { check: 'reach', value: 5.1, ping: 40 },
    { check: 'rotation_snap', value: 1, snap_streak: 7, ping: 40 },
  ];
  const outs = seq.map((s) => tr.record('cheater', s, getMode('duels').anticheat || {}, Date.UTC(2026, 0, 1)));
  add('anticheat', 'tracker_sequence', [seq, 'duels', 1767225600000], outs);
  add('anticheat', 'summarize', [seq, 'duels', 1767225600000], ac.summarize(tr));
}

// ── matchmaking ──
{
  const r = mulberry32(31337);
  add('matchmaking', 'botName', [3, 31337], mm.botName(3, new Rng(31337)));
  const teams = mm.balanceTeams(
    [
      { id: 'a', rating: 1800, level: 40, rank_index: 3 },
      { id: 'b', rating: 1100, level: 6, rank_index: 1 },
    ],
    6, 2, 4, { mode: getMode('bedwars'), seed: 909 }
  );
  add('matchmaking', 'balanceTeams', [{ humans: 2, bots: 6, team_count: 2, team_size: 4, mode: 'bedwars', seed: 909 }], {
    teams: teams.map((t) => t.players.map((p) => ({ id: p.id, is_bot: !!p.is_bot, rating: p.rating, platform: p.platform }))),
    avg_ratings: teams.map((t) => t.avg_rating),
    colors: teams.map((t) => t.color),
  });
}

// ── brain (درخت رفتار محلی — باید عیناً در Java/PHP تکرار شود) ──
{
  const ctx = {
    mode: getMode('bedwars'),
    tier: 'T2',
    seed: 555,
    bot: { id: 'b1', team: 0, hp: 8, max_hp: 20, inventory: { obsidian: 1, ender_pearl: 2 }, resources: { iron: 40, gold: 8 } },
    world: {
      elapsed_sec: 420,
      duration_sec: 1800,
      alive_enemies: [{ id: 'e1', dist: 9, hp: 16 }],
      alive_allies: [{ id: 'a1', dist: 4, hp: 18 }],
      objectives: { my_bed: { obsidian: false }, bed_threat_dist: 8, enemy_beds: [{ team: 2, dist: 44, obsidian: false }] },
      scores: { my_team: 1, enemy_team: 2 },
      resources: [{ id: 'gen', dist: 2 }],
      shop_affordable: ['iron_sword', 'obsidian'],
      gear_gap: 0.4,
    },
    params: { reaction_ms: { min: 120, max: 260 }, aim_error_deg: { min: 1, max: 4 }, mistake_chance: 0.06 },
  };
  const ctxJson = { ...ctx, mode: 'bedwars' };
  add('brain', 'heuristicDecide', [ctxJson], brain.heuristicDecide(ctx));
  add('brain', 'stateHash', [ctxJson], brain.stateHash(ctx));
  const local = brain.heuristicDecide(ctx);
  add('brain', 'humanizeAction', [local, ctx.params, 555], brain.humanizeAction(local, ctx.params, new Rng(555)));
  add('brain', 'mergeDecisions_prefers_cloud', [local, { action: 'defend_bed', target: 'my_bed', reason: 'llm' }], brain.mergeDecisions(local, { action: 'defend_bed', target: 'my_bed', reason: 'llm' }));
  add('brain', 'mergeDecisions_bad_cloud', [local, { action: 'not_an_action' }], brain.mergeDecisions(local, { action: 'not_an_action' }));
  const budgetObj = { ...bottier.llmBudget(getTierDef('T2'), getMode('bedwars'), 4, {}), llm_enabled: true, used: 0, last_call_sec: -1e9 };
  add('brain', 'shouldConsultLlm', [{ mode: 'bedwars', tier: 'T2', world: { elapsed_sec: 40 }, bot: { hp: 8 }, params: {} }, budgetObj], brain.shouldConsultLlm({ mode: getMode('bedwars'), tier: 'T2', world: { elapsed_sec: 40 }, bot: { hp: 8 } }, budgetObj));
}

const payload = {
  name: 'Nova Edge engine golden vectors',
  version: 1,
  generated_at: new Date().toISOString(),
  note: 'خروجی‌ها از موتور مرجع JS تولید شده‌اند. پیاده‌سازی Java/PHP باید دقیقاً همین مقادیر را برگرداند (تلورانس 1e-6).',
  tolerance: 1e-6,
  vectors,
};
writeFileSync(new URL('../shared/testvectors.json', import.meta.url), JSON.stringify(payload, null, 1));
console.log(`✅ ${vectors.length} بردار طلایی نوشته شد → shared/testvectors.json (${(JSON.stringify(payload).length / 1024).toFixed(1)} KB)`);
const groups = {};
for (const v of vectors) groups[v.group] = (groups[v.group] || 0) + 1;
console.log('   ', Object.entries(groups).map(([g, n]) => `${g}=${n}`).join('  '));
