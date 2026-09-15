// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — بارگذار اسپک (shared/spec/*.json)
//  ورکر/تست‌ها از این ماژول استفاده می‌کنند؛ پلاگین Java و PHP مستقیماً
//  همان فایل‌های JSON را می‌خوانند تا «یک منبع حقیقت» داشته باشیم.
// ═══════════════════════════════════════════════════════════════════
// bundle.mjs از روی shared/spec/*.json تولید می‌شود (npm run gen:spec)
import { Gamemodes as GAMEMODES, Ranks as RANKS, BotTiers as TIERS, Cosmetics as COSMETICS, Economy as ECONOMY, SPEC_HASHES } from '../spec/bundle.mjs';

export { SPEC_HASHES };

export const SPECS = { gamemodes: GAMEMODES, ranks: RANKS, tiers: TIERS, cosmetics: COSMETICS, economy: ECONOMY };

export const listModes = () => GAMEMODES.modes.slice();
export const getMode = (id) => GAMEMODES.modes.find((m) => m.id === String(id)) || null;
export const listRanks = () => RANKS.ranks.slice().sort((a, b) => a.index - b.index);
export const getRank = (id) => RANKS.ranks.find((r) => r.id === String(id)) || null;
export const listTiers = () => TIERS.tiers.slice();
export const getTierDef = (id) => TIERS.tiers.find((t) => t.id === String(id)) || null;
export const listCosmetics = () => COSMETICS.items.slice();
export const getCosmetic = (id) => COSMETICS.items.find((c) => c.id === String(id)) || null;
export const listBundles = () => COSMETICS.bundles.slice();
export const listGemPacks = () => COSMETICS.gem_packs.slice();
export const economySpec = () => ECONOMY;
export const tierSpec = () => TIERS;
export const rankSpec = () => RANKS;

/** خلاصهٔ عمومی برای UI (بدون دادهٔ حساس) */
export function modeSummary(m) {
  return {
    id: m.id,
    name_en: m.name_en,
    name_fa: m.name_fa,
    tagline_fa: m.tagline_fa,
    category: m.category,
    min_players: m.teams?.min_players,
    max_players: m.teams?.max_players,
    teams: m.teams?.count,
    team_size: m.teams?.size,
    duration_min: m.match?.duration_sec ? Math.round(m.match.duration_sec / 60) : 0,
    art: m.art,
    bot_fill: !!m.teams?.bot_fill,
    maps: (m.maps || []).map((x) => ({ id: x.id, name_fa: x.name_fa })),
    kits: (m.kits || []).map((k) => ({ id: k.id, price_coins: k.price_coins })),
  };
}
