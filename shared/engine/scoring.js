// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — موتور امتیازدهی مچ (Score / Coins / XP / MVP)
//  ورودی: لیست رویدادهای مچ + مشخصات مود (shared/spec/gamemodes.json)
//  خروجی: کارنامهٔ قطعی و قابل حساب برای هر بازیکن
//  پورت: Java ScoreEngine.java | PHP ScoreEngine.php
// ═══════════════════════════════════════════════════════════════════
import { clamp } from './rng.js';
import { rankPointsFrom } from './elo.js';

/** جمع رویدادها به تفکیک نوع */
export function tallyEvents(events = []) {
  const t = {};
  for (const e of events || []) {
    if (!e || !e.type) continue;
    const n = Number(e.count ?? e.value ?? 1) || 0;
    t[e.type] = (t[e.type] || 0) + n;
  }
  return t;
}

/** پارک‌کور: جایزهٔ سرعت بر اساس زمان پایان نسبت به زمان مرجع نقشه */
export function parkourSpeedBonus(finishSec, parSec, maxBonus) {
  const f = Number(finishSec) || 0;
  const p = Number(parSec) || 0;
  const cap = Number(maxBonus) || 0;
  if (!f || !p || !cap) return 0;
  if (f >= p) return 0;
  const ratio = clamp((p - f) / p, 0, 1);
  return Math.round(cap * ratio);
}

/**
 * محاسبهٔ کارنامهٔ یک بازیکن
 * @param {object} o
 *  mode      — آبجکت مود از gamemodes.json
 *  events    — [{type, count}] رویدادهای واقعی مچ
 *  won       — آیا برنده شده
 *  placement — جایگاه (برای FFA)
 *  players   — تعداد بازیکنان مچ
 *  duration_sec — طول واقعی مچ
 *  afk_pct   — درصد بی‌تحرکی
 *  rank      — رنک بازیکن (برای ضریب سکه/XP)
 *  par_sec   — زمان مرجع (پارکور)
 *  mvp       — آیا MVP شده
 * @returns {object}
 */
export function computePlayerResult(o = {}) {
  const mode = o.mode || {};
  const sc = mode.scoring || {};
  const eco = mode.economy || {};
  const events = tallyEvents(o.events);
  const won = !!o.won;
  const players = Math.max(1, Number(o.players) || 1);
  const placement = clamp(Number(o.placement) || (won ? 1 : players), 1, players);
  const duration = Math.max(0, Number(o.duration_sec) || 0);
  const afk = clamp(Number(o.afk_pct) || 0, 0, 100);
  const rank = o.rank || { coin_multiplier: 1, xp_multiplier: 1 };

  const breakdown = [];
  let points = 0;
  const add = (label, key, mult = 1) => {
    const per = Number(sc[key]) || 0;
    const cnt = events[key];
    if (!per || cnt === undefined) return;
    const v = Math.round(per * cnt * mult);
    if (v) {
      points += v;
      breakdown.push({ label, key, count: cnt, each: per, value: v });
    }
  };

  // رویدادهای شمارشی
  const eventKeys = [
    'kill', 'death', 'final_kill', 'final_death', 'bed_break', 'bed_defend', 'assist',
    'resource_collected', 'purchase', 'team_upgrade', 'chest_looted', 'blocks_broken',
    'blocks_placed', 'player_eliminated', 'checkpoint', 'fall', 'goal', 'vote_received',
    'gold_collected', 'wave_cleared', 'revive', 'door_built', 'diamond_mined', 'gold_mined',
    'apple_eaten', 'chunk_claimed', 'raid_success', 'raid_defend', 'power_gained', 'innocent_survive',
    'murderer_win', 'detective_kill_murderer', 'finish',
  ];
  for (const k of eventKeys) add(k, k);

  // برد/باخت
  if (won && sc.win) {
    points += sc.win;
    breakdown.push({ label: 'win', key: 'win', count: 1, each: sc.win, value: sc.win });
  } else if (!won && sc.lose) {
    points += sc.lose;
    breakdown.push({ label: 'lose', key: 'lose', count: 1, each: sc.lose, value: sc.lose });
  }

  // بقا بر حسب دقیقه
  if (sc.survive_min) {
    const mins = Math.floor(duration / 60);
    if (mins > 0) {
      const v = sc.survive_min * mins;
      points += v;
      breakdown.push({ label: 'survive_min', key: 'survive_min', count: mins, each: sc.survive_min, value: v });
    }
  }

  // استریک‌ها (کیت‌پی‌وی‌پی)
  for (const k of ['killstreak_5', 'killstreak_10']) {
    if (sc[k] && events[k]) {
      points += sc[k] * events[k];
      breakdown.push({ label: k, key: k, count: events[k], each: sc[k], value: sc[k] * events[k] });
    }
  }
  if (sc.streak_bonus && events.best_streak) {
    const v = sc.streak_bonus * Math.max(0, Number(events.best_streak) - 1);
    if (v > 0) {
      points += v;
      breakdown.push({ label: 'streak_bonus', key: 'streak_bonus', count: events.best_streak, each: sc.streak_bonus, value: v });
    }
  }

  // جایزهٔ سرعت پارکور
  if (mode.id === 'parkour' && o.finish_sec) {
    const bonus = parkourSpeedBonus(o.finish_sec, o.par_sec || 180, sc.speed_bonus_max || 0);
    if (bonus > 0) {
      points += bonus;
      breakdown.push({ label: 'speed_bonus', key: 'speed_bonus', count: 1, each: bonus, value: bonus });
    }
  }

  // برد بی‌نقص (دوئل بدون خوردن ضربه)
  if (sc.perfect_win_bonus && won && !events.death && !events.fall) {
    points += sc.perfect_win_bonus;
    breakdown.push({ label: 'perfect_win', key: 'perfect_win_bonus', count: 1, each: sc.perfect_win_bonus, value: sc.perfect_win_bonus });
  }

  // هماهنگی با تم در بیلد بتل
  if (sc.theme_match_bonus && events.theme_match) {
    points += sc.theme_match_bonus;
    breakdown.push({ label: 'theme_match', key: 'theme_match_bonus', count: 1, each: sc.theme_match_bonus, value: sc.theme_match_bonus });
  }

  // MVP
  if (o.mvp && sc.mvp_bonus) {
    points += sc.mvp_bonus;
    breakdown.push({ label: 'mvp', key: 'mvp_bonus', count: 1, each: sc.mvp_bonus, value: sc.mvp_bonus });
  }

  // ── سکه و XP ──
  let coins = 0;
  for (const k of Object.keys(eco)) {
    if (k.startsWith('xp_')) continue;
    const per = Number(eco[k]) || 0;
    if (!per) continue;
    if (k === 'win') {
      if (won) coins += per;
      continue;
    }
    if (k === 'lose') {
      if (!won) coins += per;
      continue;
    }
    if (k === 'survive_min') {
      coins += per * Math.floor(duration / 60);
      continue;
    }
    if (events[k] !== undefined) coins += per * events[k];
  }
  if (o.mvp && eco.mvp_bonus) coins += eco.mvp_bonus;

  let xp = 0;
  if (won && eco.xp_win) xp += eco.xp_win;
  if (eco.xp_kill && events.kill) xp += eco.xp_kill * events.kill;
  xp += Math.floor(Math.max(0, points) / 20); // XP پایه از روی امتیاز

  // ضریب رنک
  const coinMult = Number(rank.coin_multiplier) || 1;
  const xpMult = Number(rank.xp_multiplier) || 1;
  coins = Math.round(coins * coinMult);
  xp = Math.round(xp * xpMult);

  // ── ضدسوءاستفاده ──
  const flags = [];
  const minMinutes = 2;
  const eligible = duration >= minMinutes * 60 || ['kitpvp', 'factions'].includes(mode.id);
  if (!eligible) flags.push('too_short');
  if (afk > 60) flags.push('afk');
  if (events.death > 0 && events.kill === 0 && afk > 40) flags.push('farm_suspect');
  const rewarded = eligible && afk <= 60;
  if (!rewarded) {
    coins = Math.min(coins, 10); // فقط مقدار نمادین
    xp = Math.min(xp, 10);
  }

  points = Math.round(points);
  return {
    mode: mode.id,
    won,
    placement,
    points: rewarded ? points : Math.max(0, Math.min(points, 20)),
    points_raw: points,
    coins,
    xp,
    rp: rankPointsFrom({ score_points: rewarded ? points : 0, elo_delta: Number(o.elo_delta) || 0 }),
    breakdown,
    flags,
    rewarded,
  };
}

/** تعیین MVP بر اساس امتیاز (بدون قرعه‌کشی؛ مساوی → کشتن بیشتر) */
export function pickMvp(results = []) {
  let best = null;
  for (const r of results) {
    if (r.is_bot) continue;
    if (!best) {
      best = r;
      continue;
    }
    const a = Number(r.points) || 0;
    const b = Number(best.points) || 0;
    if (a > b) best = r;
    else if (a === b && (Number(r.kills) || 0) > (Number(best.kills) || 0)) best = r;
  }
  return best ? best.id : null;
}
