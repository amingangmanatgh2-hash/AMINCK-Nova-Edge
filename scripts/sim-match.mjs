#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
//  sim-match.mjs — شبیه‌سازی کامل یک مچ با موتور واقعی (shared/engine)
//
//  همان مسیری که پلاگین‌های Bedrock/Java طی می‌کنند، اما روی Node:
//    صف → chooseMatchTier → balanceTeams (بات‌پرکن) → humanizeBot
//    → حلقهٔ تیک: heuristicDecide + humanizeAction + shouldConsultLlm
//      + mergeDecisions (شبیه‌سازی پاسخ ابری) + tierAtTime (ترفیع پلکانی)
//    → رویدادها → computePlayerResult → pickMvp → settleMatch (ELO)
//    + یک «متقلب» ساختگی که توسط آنتی‌چیت گرفته می‌شود.
//
//  اجرا: npm run sim:match -- --mode bedwars --seed 7 --humans 3
// ═══════════════════════════════════════════════════════════════════
import { Rng } from '../shared/engine/rng.js';
import * as elo from '../shared/engine/elo.js';
import * as scoring from '../shared/engine/scoring.js';
import * as bottier from '../shared/engine/bottier.js';
import * as ac from '../shared/engine/anticheat.js';
import * as mm from '../shared/engine/matchmaking.js';
import * as brain from '../shared/engine/brain.js';
import { getMode, listRanks, getTierDef, SPECS } from '../shared/engine/spec.js';

// ── آرگومان‌ها ──
const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const MODE_ID = arg('mode', 'bedwars');
const SEED = Number(arg('seed', 7));
const HUMANS = Number(arg('humans', 3));
const FILL_TO = Number(arg('fill', 8));

const mode = getMode(MODE_ID);
if (!mode) {
  console.error(`مود ناشناخته: ${MODE_ID} (یکی از: ${SPECS.gamemodes.modes.map((m) => m.id).join(', ')})`);
  process.exit(1);
}
const rng = new Rng(SEED);
console.log(`\n\x1b[1mشبیه‌سازی مچ «${mode.name_fa}» (${mode.id})\x1b[0m  seed=${SEED}  humans=${HUMANS}`);

// ── ۱) بازیکنان انسانی صف ──
const ranks = listRanks();
const humans = Array.from({ length: HUMANS }, (_, i) => {
  const rating = Math.round(900 + rng.float() * 1200);
  const games = 20 + rng.int(0, 400);
  const rp = elo.rankPointsFrom({ score_points: rating - 700, elo_delta: 0 });
  const rank = elo.rankForRp(ranks, rp);
  return { id: `h${i + 1}`, username: `Player_${i + 1}`, platform: i % 2 === 0 ? 'java' : 'bedrock', is_bot: false, rating, games, level: elo.levelForXp(games * 60), rank_id: rank.id, rank_index: rank.index };
});

// ── ۲) سطح هوش بات‌ها از روی انسان‌های حاضر (نه ثابت!) ──
const tierInfo = bottier.chooseMatchTier({ mode, players: humans, tiersSpec: SPECS.tiers, ranks });
console.log(`تیر پایه: ${tierInfo.tier} (شروع: ${tierInfo.start_tier || tierInfo.tier}) — مدل: ${tierInfo.model || '—'}`);

// ── ۳) تیم‌سازی: درفت مارپیچی + بات‌پرکن (crossplay) ──
const teamCount = mode.match?.teams ?? 2;
const teamSize = mode.match?.team_size ?? 4;
const teams = mm.balanceTeams(humans, Math.max(0, FILL_TO - humans.length), teamCount, teamSize, { mode, seed: SEED, tier: tierInfo.start_tier || tierInfo.tier, crossplay: true });
for (const t of teams) {
  console.log(`\n تیم ${t.index} (${t.color}) — میانگین ${t.avg_rating} — ${t.players.map((p) => `${p.name || p.username || p.id}${p.is_bot ? ` [بات ${p.tier || ''} ${p.platform}]` : ` [${p.platform}]`}`).join('، ')}`);
}

// ── ۴) پارامترهای انسانی‌شدهٔ هر بات ──
const startTier = tierInfo.start_tier || tierInfo.tier;
let tierDef = getTierDef(startTier);
const bots = new Map();
let bi = 0;
for (const t of teams) {
  for (const p of t.players) {
    if (!p.is_bot) continue;
    bi++;
    const seed = p.seed ?? bi * 17 + SEED;
    const params = bottier.humanizeBot(tierDef, seed, { humanization: SPECS.tiers.humanization || {} });
    bots.set(p.id, { p, team: t.index, params, rng: new Rng(seed), llmCalls: 0, plan: null, planTs: -1e9, hp: 20, x: 0, z: 0, currency: 0, events: {} });
  }
}
for (const h of humans) bots.set(h.id, { p: h, team: teams.find((t) => t.players.some((q) => q.id === h.id)).index, human: true, params: { skill: 0.55, mistake_rate: 0.08, decision_hz: 5 }, rng: new Rng(SEED * 31 + h.id.length), hp: 20, x: 0, z: 0, events: {} });

// ── بودجهٔ LLM ──
const budgetSpec = bottier.llmBudget(tierDef, mode, [...bots.values()].filter((b) => !b.human).length, SPECS.tiers.cost_guard || {});
console.log(`\nبودجهٔ LLM: ${budgetSpec.allowed} فراخوانی برای این مچ (per-bot ${budgetSpec.per_bot}) — مدل ${budgetSpec.model || tierDef.model}`);

// ── آنتی‌چیت: یک متقلب ساختگی ──
const tracker = new ac.ViolationTracker();
const cheaterId = humans.length ? 'cheater_x' : null;

// ── ۵) حلقهٔ مچ ──
const duration = Math.min(900, mode.match?.duration_sec ?? 900);
const STEP = 15; // ثانیهٔ شبیه‌سازی‌شده در هر گام (فشرده)
const teamScores = teams.map(() => 0);
const timeline = [];
let llmUsed = 0;
const cache = {};
let currentTier = startTier;
const baseTier = tierInfo.tier;

for (let elapsed = STEP; elapsed <= duration; elapsed += STEP) {
  // ترفیع پلکانی تیر (مثل GameSession.tick هر ۱۰۰ تیک)
  const humanShare = 0.5;
  const esc = bottier.tierAtTime(baseTier, startTier, { duration_sec: duration, elapsed_sec: elapsed, human_score_share: humanShare, escalation: tierInfo.escalation || SPECS.tiers.escalation || {} });
  if (esc.tier !== currentTier) {
    currentTier = esc.tier;
    tierDef = getTierDef(currentTier);
    timeline.push(`⏱ ${elapsed}s — ترفیع تیر بات‌ها: ${esc.tier} (${esc.reason || ''})`);
    for (const b of bots.values()) {
      if (b.human) continue;
      b.params = bottier.humanizeBot(tierDef, b.p.seed ?? 1, { humanization: SPECS.tiers.humanization || {} });
    }
  }

  for (const b of bots.values()) {
    // جهان فشردهٔ بات
    const enemies = [...bots.values()].filter((o) => o.team !== b.team && o.hp > 0).map((o) => ({ id: o.p.id, dist: Math.round(4 + b.rng.float() * 40), hp: o.hp }));
    const allies = [...bots.values()].filter((o) => o.team === b.team && o !== b && o.hp > 0).map((o) => ({ id: o.p.id, dist: Math.round(2 + b.rng.float() * 20), hp: o.hp }));
    const world = {
      elapsed_sec: elapsed, duration_sec: duration,
      alive_enemies: enemies, alive_allies: allies,
      objectives: { my_bed: { obsidian: b.rng.chance(0.2) }, bed_threat_dist: Math.round(6 + b.rng.float() * 40), enemy_beds: [{ team: (b.team + 1) % teams.length, dist: Math.round(20 + b.rng.float() * 40), obsidian: b.rng.chance(0.3) }] },
      scores: { my_team: teamScores[b.team], enemy_team: teamScores[(b.team + 1) % teams.length] },
      resources: [{ id: 'gen', dist: Math.round(2 + b.rng.float() * 8) }],
      shop_affordable: b.currency > 40 ? [{ id: 'sword2', cost: 40 }, { id: 'armor1', cost: 60 }] : [],
      gear_gap: b.rng.float(),
    };
    const ctx = { mode, tier: currentTier, bot: { id: b.p.id, team: b.team, hp: b.hp, max_hp: 20, inventory: {}, resources: { iron: Math.round(b.currency / 4) } }, world, params: b.params, rng: b.rng };

    let decision;
    if (!b.human) {
      const local = brain.heuristicDecide(ctx);
      decision = brain.humanizeAction(local, b.params, b.rng);
      // رایزنی ابری با بودجه و کش هش وضعیت
      const budget = { llm_enabled: !!tierDef.llm_enabled, used: llmUsed, allowed: budgetSpec.allowed ?? 400, last_call_sec: b.planTs, cache };
      if (brain.shouldConsultLlm(ctx, budget)) {
        llmUsed++;
        b.llmCalls++;
        b.planTs = elapsed;
        cache[brain.stateHash(ctx)] = true;
        // شبیه‌سازی پاسخ ورکر: همان تصمیم محلی با هدف تهاجمی‌تر
        const cloudPlan = { ok: true, decision: { action: 'attack_enemy_base', target: String((b.team + 1) % teams.length), score: 5, why: 'cloud', source: 'llm', confidence: 0.9 } };
        const merged = brain.mergeDecisions(local, cloudPlan);
        if (merged.cloud_used && merged.action !== 'idle') decision = brain.humanizeAction(merged, b.params, b.rng);
      } else if (b.plan !== null && elapsed - b.planTs < 15) {
        const merged = brain.mergeDecisions(brain.heuristicDecide(ctx), { ok: true, decision: b.plan });
        if (merged.cloud_used) decision = brain.humanizeAction(merged, b.params, b.rng);
      }
      if (decision.cloud_used) b.plan = { action: decision.action, target: decision.target };
    } else {
      decision = { action: b.rng.chance(0.6) ? 'engage_nearest' : 'collect_resource', reaction_ms: 350 };
    }

    // اثر تصمیم روی جهان (ساده اما مبتنی بر skill)
    const skill = b.params.skill ?? 0.5;
    const atk = ['hunt_nearest', 'engage_nearest', 'engage_opponent', 'combo_attack', 'focus_fire', 'attack_enemy_base', 'push_bridge', 'w_combo', 'strafe_combat', 'bow_pressure'].includes(decision.action);
    if (atk && enemies.length && b.rng.chance(0.10 + skill * 0.14)) {
      const victim = enemies[Math.floor(b.rng.float() * Math.min(3, enemies.length))];
      const vb = bots.get(victim.id);
      if (vb) {
        vb.hp -= 6 + Math.round(b.rng.float() * 8);
        b.events.kill = (b.events.kill || 0) + 1;
        b.currency += 12;
        teamScores[b.team] += 1;
        if (vb.hp <= 0) {
          vb.hp = 20; // ریسپاون
          b.events.final_kill = (b.events.final_kill || 0) + (vb.human ? 1 : 0);
          timeline.push(`⚔ ${elapsed}s — ${b.p.name || b.p.username || b.p.id} (${decision.action}, واکنش ${decision.reaction_ms}ms) → ${vb.p.username || vb.p.id}`);
        }
      }
    } else if (decision.action === 'collect_resource' || decision.action === 'mine_ores' || decision.action === 'farm_resources') {
      b.currency += 4 + Math.round(b.rng.float() * 8);
      b.events.resource_collected = (b.events.resource_collected || 0) + 1;
    } else if (decision.action === 'attack_enemy_base' && b.rng.chance(0.03 + skill * 0.05)) {
      b.events.bed_break = (b.events.bed_break || 0) + 1;
      teamScores[b.team] += 5;
      timeline.push(`🛏 ${elapsed}s — ${b.p.name || b.p.id} تخت تیم ${(b.team + 1) % teams.length} را شکست!`);
    }

    // آنتی‌چیت: متقلب ساختگی با سرعت غیرممکن
    if (cheaterId && b.p.id === 'h1' && elapsed % 60 === 0) {
      const sample = { check: 'speed', value: 0.95, sprinting: true, ping: 40 };
      const v = ac.inspect(sample, mode.anticheat || {});
      if (v) tracker.record(cheaterId, sample, mode.anticheat || {}, Date.UTC(2026, 0, 1) + elapsed * 1000);
    }
  }
}

// ── ۶) پایان مچ: کارنامه + ELO ──
const winnerTeam = teamScores.indexOf(Math.max(...teamScores));
const totalPlayers = bots.size;
const results = [];
const settlePlayers = [];
let placement = 1;
for (const b of [...bots.values()].sort((x, y) => (y.events.kill || 0) - (x.events.kill || 0))) {
  const won = b.team === winnerTeam;
  const evList = Object.entries(b.events).map(([type, count]) => ({ type, count }));
  const res = scoring.computePlayerResult({
    mode, events: evList, won, placement: won ? 1 : placement++, players: totalPlayers, duration_sec: duration, afk_pct: 0,
    rank: { coin_multiplier: 1, xp_multiplier: 1 },
  });
  results.push({ id: b.p.id, is_bot: !!b.p.is_bot, points: res.points, kills: b.events.kill || 0, won });
  settlePlayers.push({ id: b.p.id, is_bot: !!b.p.is_bot, rating: b.p.rating ?? 1000, games: b.p.games ?? 30, won, score_points: res.points });
}
const mvp = scoring.pickMvp(results);
const settle = elo.settleMatch({ mode, players: settlePlayers, placements: {}, teams: teams.map((t) => ({ index: t.index, players: t.players.map((p) => ({ id: p.id })) })) });

console.log(`\n\x1b[1m─ timeline (گزیده) ─\x1b[0m`);
for (const line of timeline.slice(0, 12)) console.log('  ' + line);
if (timeline.length > 12) console.log(`  … ${timeline.length - 12} رویداد دیگر`);

console.log(`\n\x1b[1m─ کارنامهٔ نهایی — تیم برنده: ${winnerTeam} (${teams[winnerTeam].color}) — امتیاز تیمی: ${teamScores.join(' vs ')} ─\x1b[0m`);
const deltaOf = Object.fromEntries((settle.results || []).map((x) => [x.id, x.delta]));
for (const r of results.slice(0, 10)) {
  const d = deltaOf[r.id] ?? '—';
  const b = bots.get(r.id);
  console.log(`  ${r.id === mvp ? '⭐ MVP ' : '        '}${String(r.id).padEnd(10)} ${r.is_bot ? 'بات' : 'انسان'}  امتیاز=${String(r.points).padStart(4)}  کیل=${r.kills}  ELOΔ=${typeof d === 'number' ? (d > 0 ? '+' : '') + Math.round(d * 10) / 10 : d}  ${b?.llmCalls ? `(LLM×${b.llmCalls})` : ''}`);
}
const aiCalls = [...bots.values()].reduce((s, b) => s + (b.llmCalls || 0), 0);
console.log(`\nمصرف LLM: ${aiCalls}/${budgetSpec.allowed ?? 400} فراخوانی (کش هش وضعیت فعال)`);
const summary = ac.summarize(tracker);
console.log(`آنتی‌چیت: ${JSON.stringify(summary).slice(0, 160)}`);
console.log(`\nشبیه‌سازی با موفقیت پایان یافت — مسیر کامل موتور (صف→تیر→تیم→مغز→کارنامه→ELO) اجرا شد.\n`);
