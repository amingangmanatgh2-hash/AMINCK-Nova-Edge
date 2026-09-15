// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — پل ارتباطی پلاگین ↔ ورکر (Bridge API)
//  همهٔ مسیرها: /api/mc/v1/*
//  احراز هویت: کلید پل (از پنل ادمین) + امضای HMAC با مهر زمانی
//  (ضد ری‌پلی). مسیرهای عمومی: /spec /status (بدون کلید).
//
//  نکتهٔ نت ایران: اگر ورکر از دسترس سرور بازی خارج شد، پلاگین با
//  مغز محلی و کش آخرین اسپک به کارش ادامه می‌دهد (offline-safe).
// ═══════════════════════════════════════════════════════════════════
import { json, clamp } from '../util.js';
import { mcGet, mcSet, mcNum, mcBool, bridgeKey, sha256Hex, hashSecret, ipKey, pushAlert, ensurePlayer, effectiveRankId } from './db.js';
import { notifyAdmins } from '../notify.js';
import { SPECS, getMode, getRank, listRanks, listTiers, getTierDef, economySpec, SPEC_HASHES } from '../../shared/engine/spec.js';
import { settleMatch, rankForRp, levelForXp, xpForLevel, decayRating } from '../../shared/engine/elo.js';
import { computePlayerResult, pickMvp } from '../../shared/engine/scoring.js';
import { chooseMatchTier, tierAtTime, humanizeBot, llmBudget } from '../../shared/engine/bottier.js';
import { heuristicDecide, buildMessages, parseLlmDecision, humanizeAction, shouldConsultLlm, stateHash } from '../../shared/engine/brain.js';
import { Rng } from '../../shared/engine/rng.js';
import { ViolationTracker, DEFAULT_CONFIG as AC_DEFAULT } from '../../shared/engine/anticheat.js';
import { addXp, applyWeeklyCap, winStreakBonus, applyBooster } from '../../shared/engine/economy.js';

const now = () => Math.floor(Date.now() / 1000);

/** ردیاب آنتی‌چیت در حافظهٔ ورکر (هر ایزولات جدا؛ امتیاز اصلی در DB) */
let tracker = null;
export const acTracker = () => (tracker ||= new ViolationTracker());

// ───────────────────────── احراز هویت پل ─────────────────────────
export async function authBridge(db, request, bodyText) {
  const key = request.headers.get('X-Nova-Key') || new URL(request.url).searchParams.get('key') || '';
  const real = await bridgeKey(db);
  if (!key || key !== real) {
    // مقایسهٔ زمان‌ثابت ساده
    const a = await sha256Hex(key);
    const b = await sha256Hex(real);
    if (a !== b) return { ok: false, error: 'کلید پل نامعتبر است' };
  }
  const ts = Number(request.headers.get('X-Nova-Ts') || 0);
  const sig = String(request.headers.get('X-Nova-Sig') || '');
  if (ts && sig) {
    if (Math.abs(now() - ts) > 600) return { ok: false, error: 'مهر زمانی منقضی' };
    const bodyHash = await sha256Hex(bodyText || '');
    const expect = await hashSecret(real, `${ts}:${bodyHash}`);
    if (expect !== sig) return { ok: false, error: 'امضای درخواست نامعتبر' };
  }
  return { ok: true, key: real };
}

/** ساخت امضا برای پلاگین‌ها (در مستندات و تست استفاده می‌شود) */
export async function signRequest(key, bodyText, ts = Math.floor(Date.now() / 1000)) {
  const bodyHash = await sha256Hex(bodyText || '');
  return { ts, sig: await hashSecret(key, `${ts}:${bodyHash}`) };
}

// ───────────────────────── وضعیت عمومی ─────────────────────────
export async function publicStatus(db) {
  const rows = await db.prepare('SELECT * FROM mc_servers ORDER BY last_seen DESC LIMIT 12').all();
  const globalAddr = await mcGet(db, 'server_address', '');
  const servers = (rows.results || []).map((s) => ({
    id: s.id,
    name: s.name,
    address: s.address || globalAddr || '',
    port_java: s.port_java,
    port_bedrock: s.port_bedrock,
    software: s.software,
    version: s.version,
    online: s.last_seen > now() - 120,
    players: s.players_now,
    max: s.max_slots,
    java_now: s.java_now,
    bedrock_now: s.bedrock_now,
    tps: Math.round((Number(s.tps) || 20) * 100) / 100,
    mspt: Math.round((Number(s.mspt) || 0) * 10) / 10,
    modes: safeJson(s.modes_json, []),
    bots_active: s.bots_active,
    bot_tier: s.bot_tier,
    last_seen: s.last_seen,
    stale_sec: Math.max(0, now() - s.last_seen),
  }));
  const online = servers.filter((s) => s.online);
  const counts = await db.prepare('SELECT COUNT(*) c FROM mc_players WHERE last_seen>?').bind(now() - 600).first();
  const totalPlayers = await db.prepare('SELECT COUNT(*) c FROM mc_players').first();
  const matches24 = await db.prepare('SELECT COUNT(*) c, SUM(humans) h, SUM(bots) b FROM mc_matches WHERE ended_at>?').bind(now() - 86400).first();
  return {
    ok: true,
    ts: now(),
    server_name: await mcGet(db, 'server_name', 'Nova Edge'),
    crossplay: (await mcGet(db, 'crossplay', '1')) === '1',
    maintenance: (await mcGet(db, 'maintenance', '0')) === '1',
    servers,
    online_now: online.reduce((s, x) => s + (x.players || 0), 0),
    active_players_10m: Number(counts?.c) || 0,
    registered_players: Number(totalPlayers?.c) || 0,
    matches_24h: Number(matches24?.c) || 0,
    humans_24h: Number(matches24?.h) || 0,
    bots_24h: Number(matches24?.b) || 0,
    modes_available: SPECS.gamemodes.modes.map((m) => ({ id: m.id, name_fa: m.name_fa, name_en: m.name_en, category: m.category })),
    spec_version: SPECS.gamemodes.version,
  };
}

const safeJson = (v, fb) => {
  try {
    const o = JSON.parse(v || '');
    return o ?? fb;
  } catch {
    return fb;
  }
};

// ───────────────────────── هارت‌بیت سرور ─────────────────────────
export async function handleHeartbeat(db, body) {
  const id = String(body.server_id || body.id || 'main').slice(0, 40);
  const modes = Array.isArray(body.modes) ? body.modes.slice(0, 40) : [];
  const row = await db.prepare('SELECT id FROM mc_servers WHERE id=?').bind(id).first();
  const fields = {
    name: String(body.name || '').slice(0, 60),
    address: String(body.address || '').slice(0, 120),
    port_java: Number(body.port_java) || 25565,
    port_bedrock: Number(body.port_bedrock) || 19132,
    version: String(body.version || '').slice(0, 30),
    software: String(body.software || 'paper').slice(0, 20),
    players_now: clamp(Number(body.players_now) || 0, 0, 100000),
    max_slots: clamp(Number(body.max_slots) || 100, 1, 100000),
    java_now: clamp(Number(body.java_now) || 0, 0, 100000),
    bedrock_now: clamp(Number(body.bedrock_now) || 0, 0, 100000),
    tps: clamp(Number(body.tps) || 20, 0, 20),
    mspt: clamp(Number(body.mspt) || 0, 0, 500),
    ram_used_mb: clamp(Number(body.ram_used_mb) || 0, 0, 1000000),
    bots_active: clamp(Number(body.bots_active) || 0, 0, 1000),
    bot_tier: String(body.bot_tier || '').slice(0, 4),
    geo: String(body.geo || '').slice(0, 40),
    modes_json: JSON.stringify(modes).slice(0, 3000),
  };
  if (row) {
    const sets = Object.keys(fields).map((k) => `${k}=?`).join(', ');
    await db.prepare(`UPDATE mc_servers SET ${sets}, online=1, last_seen=? WHERE id=?`).bind(...Object.values(fields), now(), id).run();
  } else {
    const cols = Object.keys(fields);
    const ph = ['?', ...cols.map(() => '?'), '?', '?', '?'].join(',');
    await db
      .prepare(`INSERT INTO mc_servers (id, ${cols.join(', ')}, online, last_seen, created_at) VALUES (${ph})`)
      .bind(id, ...Object.values(fields), 1, now(), now())
      .run();
  }
  // هشدار افت تی‌پی‌اس
  if (fields.tps < 15) await pushAlert(db, 'low_tps', `${id}: TPS=${fields.tps}`, 2);
  return { ok: true, ts: now(), config: await runtimeConfig(db) };
}

/** تنظیماتی که پلاگین در هر هارت‌بیت می‌گیرد (تا بدون دیپلوی مجدد تغییر کند) */
export async function runtimeConfig(db) {
  return {
    server_name: await mcGet(db, 'server_name', 'Nova Edge'),
    bot_llm_enabled: await mcBool(db, 'bot_llm_enabled', true),
    bot_tier_offset: await mcNum(db, 'bot_tier_offset', 0),
    bot_max_tier: await mcGet(db, 'bot_max_tier', 'T4'),
    bot_force_tier: await mcGet(db, 'bot_force_tier', ''),
    bot_names_visible: await mcBool(db, 'bot_names_visible', true),
    bridge_url: await mcGet(db, 'bridge_url', ''),
    anticheat: { warn_at: await mcNum(db, 'ac_warn_at', AC_DEFAULT.warn_at), kick_at: await mcNum(db, 'ac_kick_at', AC_DEFAULT.kick_at), tempban_at: await mcNum(db, 'ac_tempban_at', AC_DEFAULT.tempban_at), ban_at: await mcNum(db, 'ac_ban_at', AC_DEFAULT.ban_at), auto_ban: await mcBool(db, 'ac_auto_ban', true) },
    economy: economySpec(),
    spec_hashes: SPEC_HASHES,
    iran_mode: await mcBool(db, 'iran_mode', true),
    maintenance: await mcBool(db, 'maintenance', false),
  };
}

// ───────────────────────── پروفایل بازیکن ─────────────────────────
export async function handlePlayerSync(db, body) {
  const username = String(body.username || '').trim();
  if (!username || username.length > 32) return { ok: false, error: 'username نامعتبر' };
  const platform = body.platform === 'bedrock' ? 'bedrock' : 'java';
  const id = String(body.uuid || '') || `name:${username.toLowerCase()}`;
  const { player, isNew } = await ensurePlayer(db, { username, platform, id });
  if (!player) return { ok: false, error: 'ensure failed' };

  const updates = [];
  const args = [];
  const setNum = (col, val) => {
    if (val === undefined || val === null) return;
    updates.push(`${col}=?`);
    args.push(clamp(Number(val) || 0, -1e9, 1e9));
  };
  setNum('rating', body.rating);
  setNum('level', body.level);
  setNum('xp', body.xp);
  setNum('coins', body.coins);
  setNum('gems', body.gems);
  setNum('games', body.games);
  setNum('wins', body.wins);
  setNum('kills', body.kills);
  setNum('deaths', body.deaths);
  if (body.rank_id && listRanks().some((r) => r.id === body.rank_id)) {
    updates.push('rank_id=?');
    args.push(body.rank_id);
  }
  if (Array.isArray(body.cosmetics)) {
    updates.push('cosmetics=?');
    args.push(JSON.stringify(body.cosmetics.slice(0, 200)));
  }
  if (body.equipped && typeof body.equipped === 'object') {
    updates.push('equipped=?');
    args.push(JSON.stringify(body.equipped).slice(0, 900));
  }
  updates.push('last_seen=?');
  args.push(now());
  args.push(player.id);
  await db.prepare(`UPDATE mc_players SET ${updates.join(', ')} WHERE id=?`).bind(...args).run();

  const g = await db
    .prepare("SELECT * FROM mc_grants WHERE status='pending' AND (player_key=? OR lower(username)=?) ORDER BY id LIMIT 30")
    .bind(player.id, username.toLowerCase())
    .all();
  const pending = g.results || [];
  const fresh = await db.prepare('SELECT * FROM mc_players WHERE id=?').bind(player.id).first();
  return { ok: true, is_new: isNew, player: playerDto(fresh, listRanks()), pending_grants: pending.map(grantDto) };
}

export function grantDto(g) {
  return { id: g.id, type: g.type, item_id: g.item_id, payload: safeJson(g.payload, {}), order_ref: g.order_ref, created_at: g.created_at };
}

export function playerDto(p, ranks) {
  if (!p) return null;
  const rankId = effectiveRankId(p, ranks);
  const rank = getRank(rankId) || ranks[0];
  return {
    id: p.id,
    username: p.username,
    platform: p.platform,
    rank: { id: rankId, name_fa: rank?.name_fa, color: rank?.color, tag: rank?.tag, index: rank?.index },
    rating: p.rating,
    rating_modes: safeJson(p.rating_modes, {}),
    level: p.level,
    xp: p.xp,
    rp: p.rp,
    coins: p.coins,
    gems: p.gems,
    dust: p.dust,
    wins: p.wins,
    losses: p.losses,
    kills: p.kills,
    deaths: p.deaths,
    games: p.games,
    score_total: p.score_total,
    kdr: p.deaths ? Math.round((p.kills / p.deaths) * 100) / 100 : Number(p.kills) || 0,
    cosmetics: safeJson(p.cosmetics, []),
    equipped: safeJson(p.equipped, {}),
    nick_color: p.nick_color,
    chat_tag: p.chat_tag,
    referral_code: p.referral_code,
    referrals: p.referrals,
    banned: !!p.banned,
    ban_reason: p.ban_reason,
    ban_until: p.ban_until,
    cheat_score: p.cheat_score,
    last_seen: p.last_seen,
    created_at: p.created_at,
    season_xp: p.season_xp,
    battlepass: !!p.battlepass,
  };
}

// ───────────────────────── گزارش مچ (قلب تپندهٔ سیستم) ─────────────────────────
export async function handleMatchReport(env, db, body) {
  const mode = getMode(body.mode);
  if (!mode) return { ok: false, error: `مود ناشناخته: ${body.mode}` };
  const teamsIn = Array.isArray(body.teams) ? body.teams : [{ index: 0, players: Array.isArray(body.players) ? body.players : [] }];
  const flat = [];
  for (const t of teamsIn) {
    for (const p of t.players || []) flat.push({ ...p, team: t.index });
  }
  if (!flat.length) return { ok: false, error: 'بازیکنی گزارش نشد' };

  // پروفایل واقعی انسان‌ها از DB (تا رتبهٔ ارسالی پلاگین منبع حقیقت نباشد)
  const ranks = listRanks();
  const resolved = [];
  for (const p of flat) {
    if (p.is_bot) {
      resolved.push({ id: String(p.id || p.name), is_bot: true, rating: Number(p.rating) || 1000, team: p.team, won: !!p.won, place: p.placement, bot_tier: p.bot_tier || p.tier || 'T0' });
      continue;
    }
    const username = String(p.username || p.name || '').trim();
    let row = null;
    if (username) row = await db.prepare('SELECT * FROM mc_players WHERE username_lc=?').bind(username.toLowerCase()).first();
    if (!row && p.uuid) row = await db.prepare('SELECT * FROM mc_players WHERE id=?').bind(String(p.uuid)).first();
    if (!row && username) row = (await ensurePlayer(db, { username, platform: p.platform || 'java', id: p.uuid ? String(p.uuid) : '' })).player;
    if (!row) continue;
    const daysInactive = (now() - (row.last_seen || now())) / 86400;
    resolved.push({
      id: row.id,
      username: row.username,
      is_bot: false,
      db: row,
      rating: decayRating(row.rating, daysInactive),
      level: row.level,
      rank_id: effectiveRankId(row, ranks),
      games: row.games,
      team: p.team,
      won: !!p.won,
      place: p.placement,
      events: p.events || [],
      afk_pct: p.afk_pct || 0,
      finish_sec: p.finish_sec || 0,
    });
  }

  const settle = settleMatch({ mode, players: resolved, teams: teamsIn.map((t) => ({ index: t.index, players: resolved.filter((r) => r.team === t.team) })) });
  const byId = new Map(settle.results.map((r) => [r.id, r]));

  // MVP
  const prelim = resolved.filter((r) => !r.is_bot).map((r) => ({ id: r.id, points: 0, kills: (r.events || []).find((e) => e.type === 'kill')?.count || 0 }));
  const results = [];
  for (const r of resolved) {
    const s = byId.get(r.id) || { delta: 0, after: r.rating };
    if (r.is_bot) {
      results.push({ id: r.id, is_bot: true, points: 0, coins: 0, xp: 0, elo_delta: 0, bot_tier: r.bot_tier });
      continue;
    }
    const rank = ranks.find((x) => x.id === r.rank_id) || ranks[0];
    const res = computePlayerResult({
      mode,
      events: r.events || [],
      won: r.won,
      placement: r.place || (r.won ? 1 : flat.length),
      players: flat.length,
      duration_sec: Number(body.duration_sec) || 0,
      afk_pct: Number(r.afk_pct) || 0,
      rank,
      elo_delta: s.delta,
      finish_sec: r.finish_sec,
      par_sec: Number(body.par_sec) || 180,
      db: r.db,
    });
    results.push({ ...res, id: r.id, username: r.username, is_bot: false, elo_before: r.rating, elo_after: s.after, elo_delta: s.delta, won: r.won, placement: r.place, kills: (r.events || []).find((e) => e.type === 'kill')?.count || 0, deaths: (r.events || []).find((e) => e.type === 'death')?.count || 0 });
  }
  const mvpId = pickMvp(results.map((r) => ({ ...r, points: r.points })));
  for (const r of results) if (r.id === mvpId) r.mvp = true;

  // ذخیرهٔ مچ
  const matchId = String(body.match_id || `${mode.id}-${now()}-${Math.floor(Math.random() * 1e6)}`).slice(0, 60);
  await db
    .prepare('INSERT OR REPLACE INTO mc_matches (id, mode, map, server_id, started_at, ended_at, duration_sec, humans, bots, tier_start, tier_end, model, ai_calls, ai_latency_ms, winner_team, result_json, reported_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(
      matchId, mode.id, String(body.map || '').slice(0, 40), String(body.server_id || '').slice(0, 40),
      Number(body.started_at) || now() - (Number(body.duration_sec) || 0), now(), Number(body.duration_sec) || 0,
      results.filter((r) => !r.is_bot).length, results.filter((r) => r.is_bot).length,
      String(body.tier_start || '').slice(0, 4), String(body.tier_end || body.tier || '').slice(0, 4), String(body.model || '').slice(0, 60),
      Number(body.ai_calls) || 0, Number(body.ai_latency_ms) || 0, Number(body.winner_team ?? -1),
      JSON.stringify({ summary: results.slice(0, 30).map((r) => ({ id: r.id, p: r.points, e: r.elo_delta })) }).slice(0, 4000),
      String(body.reported_by || '').slice(0, 40), now()
    )
    .run();

  // به‌روزرسانی بازیکنان
  const updated = [];
  for (const r of results) {
    if (r.is_bot) continue;
    await db
      .prepare('INSERT OR REPLACE INTO mc_match_players (match_id, player_id, is_bot, bot_tier, team, placement, points, coins, xp, rp, kills, deaths, elo_before, elo_after, elo_delta, mvp, won, flags) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(matchId, r.id, 0, '', r.team ?? 0, r.placement || 0, r.points || 0, r.coins || 0, r.xp || 0, r.rp || 0, r.kills || 0, r.deaths || 0, r.elo_before || 0, r.elo_after || 0, r.elo_delta || 0, r.mvp ? 1 : 0, r.won ? 1 : 0, (r.flags || []).join(','))
      .run();

    const row = resolved.find((x) => x.id === r.id)?.db;
    if (!row) continue;
    const weekKey = new Date().toISOString().slice(0, 7);
    const weeklyBase = row.week_key === weekKey ? row.coins_week : 0;
    const cap = applyWeeklyCap(economySpec(), weeklyBase, r.coins || 0);
    const booster = applyBooster(safeJson(await mcGet(db, 'boosters_json', '[]'), []), 'coin_x2');
    const streak = Number(row.win_streak) || 0;
    const streakBonus = r.won ? winStreakBonus(economySpec(), streak + 1, cap.granted).coins : 0;
    const coins = Math.round((cap.granted + streakBonus) * booster);
    const xpRes = addXp({ xp: row.xp }, r.xp || 0, economySpec());
    const ratingModes = safeJson(row.rating_modes, {});
    ratingModes[mode.id] = r.elo_after;
    const rp = (Number(row.rp) || 0) + (r.rp || 0);
    const newRank = rankForRp(ranks, rp);
    const promoted = (newRank.index || 0) > (ranks.find((x) => x.id === row.rank_id)?.index || 0);

    await db
      .prepare(`UPDATE mc_players SET rating=?, rating_modes=?, coins=coins+?, coins_week=?, week_key=?, xp=?, level=?, rp=?, rank_id=?, games=games+1, wins=wins+?, losses=losses+?, kills=kills+?, deaths=deaths+?, score_total=score_total+?, season_xp=season_xp+?, last_seen=? WHERE id=?`)
      .bind(
        clamp(r.elo_after, 100, 4000), JSON.stringify(ratingModes), coins, weeklyBase + cap.granted, weekKey,
        xpRes.xp, xpRes.level, rp, promoted ? newRank.id : row.rank_id,
        r.won ? 1 : 0, r.won ? 0 : 1, r.kills || 0, r.deaths || 0, Math.max(0, r.points || 0), Math.max(0, r.xp || 0), now(), r.id
      )
      .run();
    if (xpRes.gems_earned) await db.prepare('UPDATE mc_players SET gems=gems+? WHERE id=?').bind(xpRes.gems_earned, r.id).run();
    await db.prepare('UPDATE mc_players SET win_streak=? WHERE id=?').bind(r.won ? streak + 1 : 0, r.id).run();
    updated.push({
      id: r.id, username: r.username, points: r.points, coins, xp: r.xp, level: xpRes.level, levels_gained: xpRes.levels_gained,
      gems_earned: xpRes.gems_earned, elo_delta: r.elo_delta, elo_after: r.elo_after, rp_total: rp,
      rank: promoted ? newRank.id : row.rank_id, promoted, mvp: !!r.mvp, won: !!r.won, placement: r.placement,
      capped: cap.capped, flags: r.flags || [], breakdown: r.breakdown,
    });
    if (promoted) {
      await pushAlert(db, 'rank_promotion', `${r.username} → ${newRank.name_fa}`, 1);
      try { await notifyAdmins(env, 'newUser', `🎖 ارتقای رنک خودکار: ${r.username} → ${newRank.name_fa}`); } catch {}
    }
  }

  return {
    ok: true,
    match_id: matchId,
    mode: mode.id,
    tier_start: body.tier_start || '',
    tier_end: body.tier_end || '',
    ai_calls: Number(body.ai_calls) || 0,
    results: updated,
    mvp: updated.find((u) => u.mvp)?.username || null,
  };
}

// ───────────────────────── سطح هوش بات‌ها ─────────────────────────
export async function handleBotTier(db, body) {
  const mode = getMode(body.mode);
  if (!mode) return { ok: false, error: 'مود ناشناخته' };
  const players = (body.players || []).map((p) => ({ ...p }));
  const settings = {
    llm_enabled: await mcBool(db, 'bot_llm_enabled', true),
    force_tier: await mcGet(db, 'bot_force_tier', '') || undefined,
    max_tier: await mcGet(db, 'bot_max_tier', 'T4'),
  };
  const chosen = chooseMatchTier({ mode, players, tiersSpec: SPECS.tiers, ranks: listRanks(), settings });
  const offset = await mcNum(db, 'bot_tier_offset', 0);
  if (offset) {
    const idx = clamp(['T0', 'T1', 'T2', 'T3', 'T4'].indexOf(chosen.tier) + offset, 0, 4);
    chosen.tier = ['T0', 'T1', 'T2', 'T3', 'T4'][idx];
    chosen.reasons.push(`آفست ادمین: ${offset > 0 ? '+' : ''}${offset}`);
  }
  const bots = players.filter((p) => p.is_bot).length || Math.max(0, Number(body.fill_slots) || 0);
  const budget = llmBudget(chosen.tier_def, mode, Math.max(1, bots), SPECS.tiers.cost_guard);
  const seed = Number(body.seed) || 1;
  const rng = new Rng(seed);
  const botParams = [];
  for (let i = 0; i < Math.max(0, bots); i++) {
    botParams.push(humanizeBot(chosen.start_tier_def || chosen.tier_def, seed + i * 37, { humanization: SPECS.tiers.humanization, elapsed_sec: 0, rank_bias: 0 }));
  }
  return {
    ok: true,
    match_tier: chosen.tier,
    start_tier: chosen.start_tier,
    model: chosen.model,
    llm_enabled: chosen.llm_enabled,
    skill_human: chosen.skill_human,
    reasons: chosen.reasons,
    escalation: SPECS.tiers.escalation,
    budget,
    bots: botParams,
    spec_hash: SPEC_HASHES['bot-tiers'],
  };
}

/** ترفیع سطح در طول مچ */
export async function handleBotEscalate(db, body) {
  const mode = getMode(body.mode);
  if (!mode) return { ok: false, error: 'مود ناشناخته' };
  const res = tierAtTime(body.base_tier || 'T0', body.start_tier || body.base_tier || 'T0', {
    escalation: SPECS.tiers.escalation,
    duration_sec: Number(body.duration_sec) || mode.match?.duration_sec || 600,
    elapsed_sec: Number(body.elapsed_sec) || 0,
    human_score_share: Number(body.human_score_share),
  });
  const def = getTierDef(res.tier) || {};
  return { ok: true, tier: res.tier, delta: res.delta, reason: res.reason, model: def.model || null, llm_enabled: !!def.llm_enabled };
}

// ───────────────────────── مغز ابری بات ─────────────────────────
const decisionCache = new Map();

export async function handleBotDecide(env, db, body) {
  const mode = getMode(body.mode);
  if (!mode) return { ok: false, error: 'مود ناشناخته' };
  const tierId = String(body.tier || 'T0');
  const tierDef = getTierDef(tierId) || getTierDef('T0');
  const params = { ...(body.params || {}), skill: Number(tierDef.skill) };
  const rng = new Rng(Number(body.seed) || 1);
  const ctx = { mode, tier: tierId, tier_def: tierDef, params, bot: body.bot || {}, world: body.world || {}, rng };
  const local = heuristicDecide(ctx);
  const llmEnabled = (await mcBool(db, 'bot_llm_enabled', true)) && !!tierDef.llm_enabled && !!env.AI && typeof env.AI.run === 'function';

  const matchKey = String(body.match_id || 'local');
  const budgetKey = `bot_budget:${matchKey}`;
  const used = Number((await db.prepare('SELECT value FROM kv WHERE key=?').bind(budgetKey).first())?.value || 0);
  const budget = llmBudget(tierDef, mode, Number(body.bot_count) || 1, SPECS.tiers.cost_guard);
  const cacheKey = stateHash(ctx);

  if (!llmEnabled || used >= budget.allowed) {
    return { ok: true, decision: humanizeAction(local, params, rng), source: 'local', reason: !llmEnabled ? 'llm_disabled' : 'budget_exhausted', local };
  }
  if (decisionCache.has(cacheKey)) {
    const cached = decisionCache.get(cacheKey);
    return { ok: true, decision: humanizeAction(cached, params, rng), source: 'cache', cached: true };
  }
  const interval = Number(mode.bot?.llm_interval_sec?.[tierId] || 0);
  const lastKey = `bot_last:${matchKey}:${body.bot?.id || 'x'}`;
  const last = Number((await db.prepare('SELECT value FROM kv WHERE key=?').bind(lastKey).first())?.value || 0);
  if (interval && now() - last < interval) {
    return { ok: true, decision: humanizeAction(local, params, rng), source: 'local', reason: 'interval', local };
  }

  const t0 = Date.now();
  try {
    const messages = buildMessages(ctx);
    const model = (await mcGet(db, 'bot_model_override', '')) || SPECS.tiers.models[tierDef.model] || SPECS.tiers.models.large;
    const res = await env.AI.run(model, { messages, max_tokens: tierDef.max_tokens || 240, temperature: tierDef.temperature ?? 0.6 });
    const text = String(res?.response || res?.result?.response || '');
    const parsed = parseLlmDecision(text, ctx);
    await db.prepare('INSERT INTO kv (key,value,exp) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(budgetKey, String(used + 1), now() + 7200).run();
    await db.prepare('INSERT INTO kv (key,value,exp) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(lastKey, String(now()), now() + 7200).run();
    decisionCache.set(cacheKey, parsed.ok ? parsed.decision : local);
    if (decisionCache.size > 400) decisionCache.delete(decisionCache.keys().next().value);
    const decision = parsed.ok ? parsed.decision : local;
    return {
      ok: true,
      decision: humanizeAction(decision, params, rng),
      source: parsed.ok ? 'llm' : 'local_fallback',
      model,
      latency_ms: Date.now() - t0,
      parse_error: parsed.ok ? undefined : parsed.reason,
      calls_used: used + 1,
      calls_allowed: budget.allowed,
    };
  } catch (e) {
    await pushAlert(db, 'bot_llm_error', String(e).slice(0, 160), 2);
    return { ok: true, decision: humanizeAction(local, params, rng), source: 'local_fallback', reason: `ai_error:${String(e).slice(0, 80)}` };
  }
}

// ───────────────────────── آنتی‌چیت ─────────────────────────
export async function handleAnticheat(env, db, body) {
  const username = String(body.username || '').trim();
  const mode = getMode(body.mode);
  const samples = Array.isArray(body.samples) ? body.samples : [body.sample].filter(Boolean);
  const out = [];
  for (const s of samples) {
    const r = acTracker().record(username || String(body.uuid || 'unknown'), { ...s, ping: Number(body.ping) || Number(s.ping) || 0 }, mode?.anticheat || {}, Date.now());
    out.push(r);
  }
  const worst = out.sort((a, b) => b.score - a.score)[0];
  if (!worst) return { ok: true, results: [] };
  const row = await db.prepare('SELECT * FROM mc_players WHERE username_lc=?').bind(username.toLowerCase()).first();
  if (row) {
    await db.prepare('UPDATE mc_players SET cheat_score=? WHERE id=?').bind(Math.max(row.cheat_score || 0, worst.score), row.id).run();
    const autoBan = await mcBool(db, 'ac_auto_ban', true);
    if (autoBan && (worst.action === 'ban' || worst.action === 'tempban')) {
      const until = worst.action === 'tempban' ? now() + (worst.tempban_hours || 24) * 3600 : 0;
      await db.prepare('UPDATE mc_players SET banned=1, ban_reason=?, ban_until=? WHERE id=?').bind(`anticheat:${worst.violation?.check || 'unknown'}`, until, row.id).run();
      try { await notifyAdmins(env, 'aiFlag', `🛡 بن خودکار آنتی‌چیت: ${username}\nامتیاز ${worst.score}\n${worst.reasons.slice(0, 4).join('\n')}`); } catch {}
    }
  }
  return { ok: true, results: out, action: worst.action, score: worst.score };
}

// ───────────────────────── گزارش تخلف بازیکن ─────────────────────────
export async function handleReport(env, db, body) {
  const target = String(body.target || '').trim();
  const reason = String(body.reason || '').trim();
  if (!target || !reason) return { ok: false, error: 'target و reason لازم است' };
  if (!(await mcBool(db, 'reports_enabled', true))) return { ok: false, error: 'گزارش تخلف غیرفعال است' };
  await db
    .prepare('INSERT INTO mc_reports (reporter, target, reason, mode, evidence, status, created_at) VALUES (?,?,?,?,?,?,?)')
    .bind(String(body.reporter || '').slice(0, 32), target.slice(0, 32), reason.slice(0, 60), String(body.mode || '').slice(0, 30), JSON.stringify(body.evidence || {}).slice(0, 1500), 'open', now())
    .run();
  await db.prepare('UPDATE mc_players SET reported=reported+1 WHERE username_lc=?').bind(target.toLowerCase()).run();
  const row = await db.prepare('SELECT reported FROM mc_players WHERE username_lc=?').bind(target.toLowerCase()).first();
  if (row && Number(row.reported) >= 5) {
    await pushAlert(db, 'reported_player', `${target}: ${row.reported} گزارش`, 2);
    try { await notifyAdmins(env, 'aiFlag', `🚩 بازیکن ${target} به ${row.reported} گزارش رسید — بررسی کنید`); } catch {}
  }
  const reward = Number(economySpec().coins.report_valid_reward) || 100;
  return { ok: true, message: 'گزارش ثبت شد. اگر معتبر باشد سکهٔ پاداش می‌گیرید.', reward_on_valid: reward };
}
