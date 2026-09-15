// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — اقتصاد سرور (سکه / جم / XP / لول / لاکی‌چست)
//  همهٔ عملیات‌ها خالص (بدون I/O) تا هم ورکر و هم پلاگین‌ها یک قانون داشته باشند.
// ═══════════════════════════════════════════════════════════════════
import { Rng, clamp } from './rng.js';
import { levelForXp, xpForLevel } from './elo.js';

export function startingWallet(spec) {
  return {
    coins: Number(spec?.coins?.starting_balance) || 500,
    gems: Number(spec?.gems?.starting_balance) || 0,
    xp: 0,
    level: 1,
  };
}

/** جایزهٔ ورود روزانه (۷ روز چرخشی) */
export function dailyLoginReward(spec, streakDays) {
  const table = spec?.coins?.daily_login_bonus || [50, 75, 100, 125, 150, 200, 300];
  const i = clamp(Math.floor(Number(streakDays) || 0), 0, table.length - 1);
  return { day: i + 1, coins: table[i], next: table[Math.min(table.length - 1, i + 1)] };
}

/** پاداش استریک برد (تا سقف مشخص) */
export function winStreakBonus(spec, streak, baseCoins) {
  const per = Number(spec?.coins?.win_streak_bonus_pct) || 10;
  const cap = Number(spec?.coins?.max_win_streak_bonus_pct) || 50;
  const pct = Math.min(cap, per * Math.max(0, Number(streak) || 0));
  return { pct, coins: Math.round((Number(baseCoins) || 0) * (pct / 100)) };
}

/** سقف هفتگی سکه — جلوی فارم بی‌پایان را می‌گیرد */
export function applyWeeklyCap(spec, earnedThisWeek, amount) {
  const cap = Number(spec?.coins?.weekly_cap) || 60000;
  const left = Math.max(0, cap - (Number(earnedThisWeek) || 0));
  const granted = Math.min(Math.max(0, Number(amount) || 0), left);
  return { granted, capped: granted < amount, remaining_cap: Math.max(0, left - granted) };
}

/** افزودن XP و محاسبهٔ لول‌آپ (ممکن است چند لول باشد) */
export function addXp(player, xpAmount, spec) {
  const before = levelForXp(Number(player.xp) || 0);
  const xp = Math.max(0, (Number(player.xp) || 0) + Math.max(0, Math.round(Number(xpAmount) || 0)));
  const after = levelForXp(xp);
  const maxLevel = Number(spec?.xp?.max_level) || 200;
  const levels = Math.max(0, Math.min(after, maxLevel) - before);
  const gemsPerLevel = Number(spec?.gems?.earned_per_level_up) || 25;
  return {
    xp,
    level: Math.min(after, maxLevel),
    levels_gained: levels,
    gems_earned: levels * gemsPerLevel,
    next_level_xp: xpForLevel(Math.min(after + 1, maxLevel)),
    progress_pct: Math.round(clamp(((xp - xpForLevel(after)) / Math.max(1, xpForLevel(after + 1) - xpForLevel(after))) * 100, 0, 100)),
  };
}

/**
 * لاکی‌چست: قرعه‌کشی وزن‌دار از pool اقتصاد
 * dust ها جمع می‌شوند و در آستانهٔ مشخص به کازمتیک تبدیل می‌شوند.
 */
export function rollLuckChest(spec, seed, dustBefore = 0) {
  const cfg = spec?.luck_chest || { pool: ['coins'], weights: [1], price_coins: 800, dust_to_cosmetic: 40 };
  const rng = new Rng(seed || Date.now() % 2147483647);
  const items = (cfg.pool || []).map((id, i) => ({ id, w: (cfg.weights || [])[i] ?? 1 }));
  const pick = rng.weighted(items);
  const out = { item: pick?.id || 'coins', dust: Number(dustBefore) || 0, converted: null };
  switch (out.item) {
    case 'coins': out.amount = rng.int(150, 1200); break;
    case 'xp': out.amount = rng.int(200, 1500); break;
    case 'gems_small': out.amount = rng.int(5, 40); break;
    case 'cosmetic_common': out.cosmetic = 'common'; break;
    case 'cosmetic_rare': out.cosmetic = 'rare'; break;
    case 'dust': out.dust += 1; break;
    default: out.amount = rng.int(50, 300);
  }
  if (out.dust >= (Number(cfg.dust_to_cosmetic) || 40)) {
    out.converted = 'rare';
    out.dust = 0;
  }
  return out;
}

/** خرید با سکه/جم — بررسی موجودی + حداقل رنک + اسلات کازمتیک */
export function canAfford(player, item, ranks = []) {
  const reasons = [];
  const priceCoins = Number(item.price_coins) || 0;
  const priceGems = Number(item.price_gems) || 0;
  const priceUsd = Number(item.price_usd) || 0;
  if (priceCoins && (Number(player.coins) || 0) < priceCoins) reasons.push('coins_low');
  if (priceGems && (Number(player.gems) || 0) < priceGems) reasons.push('gems_low');
  if (priceUsd && !item.purchased) reasons.push('needs_payment');
  const rankMin = item.rank_min || 'free';
  const minIdx = (ranks.find((r) => r.id === rankMin)?.index) ?? 0;
  const myIdx = (ranks.find((r) => r.id === (player.rank_id || 'free'))?.index) ?? 0;
  if (myIdx < minIdx) reasons.push(`rank_required:${rankMin}`);
  return { ok: reasons.length === 0, reasons };
}

/** انتقال سکه بین بازیکنان با مالیات و سقف روزانه */
export function transferCoins(spec, from, to, amount) {
  const tax = Number(spec?.anti_abuse?.transfer_tax_pct) || 5;
  const dailyMax = Number(spec?.anti_abuse?.max_coin_transfers_per_day) || 10;
  const amt = Math.max(1, Math.floor(Number(amount) || 0));
  if ((Number(from.transfers_today) || 0) >= dailyMax) return { ok: false, error: 'daily_limit' };
  if ((Number(from.coins) || 0) < amt) return { ok: false, error: 'insufficient' };
  const net = Math.floor(amt * (1 - tax / 100));
  return { ok: true, amount: amt, tax_pct: tax, received: net, from_balance: from.coins - amt, to_balance: (Number(to.coins) || 0) + net };
}

/** بوستر (۲× سکه / ۲× XP) — اثر روی شبکه یا خود بازیکن */
export function applyBooster(activeBoosters, kind, scope = 'self') {
  const now = Date.now();
  const live = (activeBoosters || []).filter((b) => Number(b.until) > now && b.kind === kind && b.scope === scope);
  if (!live.length) return 1;
  return live.reduce((m, b) => Math.max(m, Number(b.mult) || 2), 1);
}
