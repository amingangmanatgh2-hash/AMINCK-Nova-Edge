// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — صف مچ‌میکینگ، پارتی، پرکردن با بات، بالانس تیم
//  کراس‌پلی: هر بازیکن platform دارد (java | bedrock). تیم‌ها طوری
//  بالانس می‌شوند که تعداد بازیکنان هر پلتفرم در دو طرف نزدیک باشد
//  (چون Bedrock با تاچ/کنترلر و Java با موس می‌جنگند).
// ═══════════════════════════════════════════════════════════════════
import { Rng, hashSeed, clamp } from './rng.js';

/** صف مچ‌میکینگ برای یک مود */
export class MatchQueue {
  constructor(mode, opts = {}) {
    this.mode = mode;
    this.entries = []; // {partyId, players:[], joined_at, priority}
    this.opts = {
      fill_after_sec: opts.fill_after_sec ?? 25, // بعد از این مدت، بات اضافه کن
      bot_step_sec: opts.bot_step_sec ?? 10, // هر ۱۰ ثانیه یک بات بیشتر
      max_wait_sec: opts.max_wait_sec ?? 90,
      crossplay_balance: opts.crossplay_balance !== false,
      elo_range: opts.elo_range ?? 350, // حداکثر اختلاف رتبه در یک مچ
      ...opts,
    };
    this.matchSeq = 0;
  }

  enqueue(party) {
    const players = (party.players || []).map((p) => ({ ...p }));
    if (!players.length) return { ok: false, error: 'empty_party' };
    const minHumans = Number(this.mode.teams?.min_humans) || 1;
    const entry = {
      partyId: party.id || `p_${hashSeed(players.map((p) => p.id).join('|'))}`,
      players,
      joined_at: Number(party.joined_at) || Date.now(),
      priority: Math.max(...players.map((p) => Number(p.queue_priority) || 0)),
      rating: players.reduce((s, p) => s + (Number(p.rating) || 1000), 0) / players.length,
    };
    this.entries.push(entry);
    this.entries.sort((a, b) => b.priority - a.priority || a.joined_at - b.joined_at);
    return { ok: true, partyId: entry.partyId, position: this.entries.indexOf(entry) + 1, min_humans: minHumans };
  }

  dequeue(partyId) {
    const i = this.entries.findIndex((e) => e.partyId === partyId);
    if (i >= 0) this.entries.splice(i, 1);
    return i >= 0;
  }

  humanCount() {
    return this.entries.reduce((s, e) => s + e.players.length, 0);
  }

  waitingSince() {
    if (!this.entries.length) return 0;
    return Date.now() - Math.min(...this.entries.map((e) => e.joined_at));
  }

  /**
   * تلاش برای ساخت مچ
   * @returns {null|{matchId, humans:[], bots_needed, teams:[], wait_sec}}
   */
  tryForm(now = Date.now()) {
    const spec = this.mode;
    const teamCount = Number(spec.teams?.count) || 1;
    const teamSize = Number(spec.teams?.size) || 1;
    const minPlayers = Number(spec.teams?.min_players) || 2;
    const maxPlayers = Number(spec.teams?.max_players) || teamCount * teamSize;
    const minHumans = Number(spec.teams?.min_humans) || 1;
    const waitSec = this.waitingSince() / 1000;

    if (!this.entries.length) return null;
    const humans = this.entries.flatMap((e) => e.players);
    if (humans.length < minHumans) return null;

    // تا وقتی به حداقل نرسیده‌ایم و زمان پرکردن با بات نرسیده، صبر کن
    const shouldFill = humans.length >= minHumans && (humans.length >= minPlayers || waitSec >= this.opts.fill_after_sec);
    if (!shouldFill) return null;

    // چقدر بات لازم است؟ هرچه انتظار بیشتر، بات بیشتر (تا مچ پر شود)
    let botsNeeded = 0;
    const targetSize = clamp(Math.max(minPlayers, humans.length), minPlayers, maxPlayers);
    if (spec.teams?.bot_fill) {
      const extraWait = Math.max(0, waitSec - this.opts.fill_after_sec);
      const stepBots = Math.floor(extraWait / this.opts.bot_step_sec);
      botsNeeded = clamp(Math.max(0, targetSize - humans.length) + stepBots, 0, maxPlayers - humans.length);
      if (waitSec >= this.opts.max_wait_sec) botsNeeded = maxPlayers - humans.length; // پر کردن کامل
      // در مودهای تیمی، تعداد باید بر teamSize بخش‌پذیر باشد
      if (teamCount > 1 && teamSize > 0) {
        const total = humans.length + botsNeeded;
        const rounded = Math.ceil(total / teamSize) * teamSize;
        botsNeeded = clamp(rounded - humans.length, 0, maxPlayers - humans.length);
      }
    }

    // مچ‌هایی که بیش از حد صبر کردند و هنوز مینیمم انسانی را ندارند، رد می‌شوند
    if (humans.length < minHumans) return null;

    const taken = this.entries.splice(0, this.entries.length);
    this.matchSeq += 1;
    const matchId = `${spec.id}-${now.toString(36)}-${this.matchSeq}`;
    const teams = balanceTeams(humans, botsNeeded, teamCount, teamSize, {
      crossplay: this.opts.crossplay_balance,
      seed: hashSeed(matchId),
      mode: spec,
    });
    return {
      matchId,
      mode: spec.id,
      humans: teams.flatMap((t) => t.players).filter((p) => !p.is_bot),
      bots: teams.flatMap((t) => t.players).filter((p) => p.is_bot),
      teams,
      wait_sec: Math.round(waitSec),
      parties: taken.map((e) => e.partyId),
      created_at: now,
    };
  }
}

/** نام‌های بات — طبیعی، بدون پیشوند Bot، با سبک گیمری */
export const BOT_NAMES = [
  'Arash_77', 'NimaX', 'SinaPvP', 'KianCraft', 'ParsaGod', 'MiladYT', 'AmirTNT', 'RezaBridge',
  'Saman_98', 'Tohid', 'BardiaPro', 'ErfanZ', 'MahdiSword', 'AlirezaMC', 'HosseinBed', 'JavadRun',
  'NaderSky', 'YasinPvP', 'Mobin_1', 'Soroush', 'FarhadGG', 'KamyarX', 'PeymanUHC', 'Bahram',
  'AriaParkour', 'ShayanKit', 'OmidDuel', 'VahidSpleef', 'MortezaAim', 'SaeedTNT', 'DanialMurder',
  'ImanBuilder', 'AshkanFrost', 'MehdiVamp', 'NavidRush', 'ZahraMC', 'SaraPvP', 'NargesBuild',
  'LeilaSky', 'MaryamGG', 'ElnazRun', 'FatemehKit', 'HaniehDuel', 'RoxanaX', 'TaraMC', 'YasnaPro',
  'Alex_Steve', 'Notch_Fan', 'EnderPro', 'CreeperHug', 'RedstoneRat', 'PistonPete', 'SlimeKing',
  'BlazeBorn', 'IronGolemX', 'WitherWatch', 'GhastGoal', 'ShulkerSam', 'PiglinPal', 'WardenWake',
];

export function botName(i, rng) {
  const list = BOT_NAMES;
  const base = list[(Number(i) || 0) % list.length];
  const suffix = rng ? rng.chance(0.35) ? `_${rng.int(10, 99)}` : '' : '';
  return base + suffix;
}

/** ساخت پروفایل بات متناسب با سطح و رتبهٔ مچ */
export function makeBot({ index, tier, matchRating, mode, rng, platform }) {
  const name = botName(index, rng);
  const jitter = rng ? rng.int(-90, 90) : 0;
  const rating = clamp(Math.round(matchRating + jitter), 100, 4000);
  return {
    id: `bot_${name.toLowerCase().replace(/[^a-z0-9]/g, '')}_${index}`,
    name,
    is_bot: true,
    tier,
    rating,
    level: rng ? rng.int(5, 90) : 20,
    rank_id: 'free',
    platform: platform || (rng && rng.chance(0.35) ? 'bedrock' : 'java'),
    games: rng ? rng.int(20, 900) : 100,
    seed: rng ? rng.int(1, 2 ** 31 - 1) : index + 1,
    mode: mode?.id || mode,
  };
}

/**
 * بالانس تیم‌ها: درفت مارپیچی بر اساس رتبه + توزیع پلتفرم
 * @returns {Array<{index, color, players:[], avg_rating, platforms:{java,bedrock}}>}
 */
export function balanceTeams(humans, botsNeeded, teamCount, teamSize, opts = {}) {
  const rng = new Rng(opts.seed || 1);
  const mode = opts.mode || {};
  const colors = ['red', 'blue', 'green', 'yellow', 'aqua', 'pink', 'gray', 'orange', 'white', 'purple', 'brown', 'lime'];
  const pool = humans.slice().sort((a, b) => (Number(b.rating) || 1000) - (Number(a.rating) || 1000));
  const avgRating = pool.length
    ? pool.reduce((s, p) => s + (Number(p.rating) || 1000), 0) / pool.length
    : 1000;

  const teams = [];
  const nTeams = mode.category === 'ffa' || mode.category === 'race' || mode.category === 'creative'
    ? Math.max(1, pool.length + botsNeeded)
    : Math.max(1, Math.min(teamCount || 2, Math.max(2, Math.ceil((pool.length + botsNeeded) / Math.max(1, teamSize || 1)))));

  for (let i = 0; i < nTeams; i++) {
    teams.push({ index: i, color: colors[i % colors.length], players: [], avg_rating: 0, platforms: { java: 0, bedrock: 0 } });
  }

  // درفت مارپیچی (snake) تا تیم‌ها برابر شوند
  let dir = 1;
  let cur = 0;
  for (const p of pool) {
    teams[cur].players.push(p);
    cur += dir;
    if (cur >= teams.length) { cur = teams.length - 1; dir = -1; }
    else if (cur < 0) { cur = 0; dir = 1; }
  }

  // بات‌ها: به تیمی با کمترین مجموع رتبه اضافه می‌شوند
  const matchRating = avgRating;
  for (let i = 0; i < botsNeeded; i++) {
    const weakest = teams.slice().sort((a, b) => sumRating(a.players) - sumRating(b.players))[0];
    const platform = pickPlatform(weakest, teams, opts.crossplay, rng);
    const bot = makeBot({ index: i, tier: opts.tier || 'T0', matchRating, mode, rng, platform });
    weakest.players.push(bot);
  }

  for (const t of teams) {
    t.avg_rating = Math.round(sumRating(t.players) / Math.max(1, t.players.length));
    for (const p of t.players) t.platforms[p.platform === 'bedrock' ? 'bedrock' : 'java']++;
  }
  return teams;
}

function sumRating(players) {
  return (players || []).reduce((s, p) => s + (Number(p.rating) || 1000), 0);
}

/** پلتفرم بات طوری انتخاب می‌شود که نسبت java/bedrock تیم‌ها نزدیک بماند */
function pickPlatform(weakest, teams, crossplay, rng) {
  if (!crossplay) return rng.chance(0.5) ? 'java' : 'bedrock';
  const totals = teams.reduce((a, t) => ({ java: a.java + t.players.filter((p) => p.platform !== 'bedrock').length, bedrock: a.bedrock + t.players.filter((p) => p.platform === 'bedrock').length }), { java: 0, bedrock: 0 });
  return totals.java <= totals.bedrock ? 'java' : 'bedrock';
}

/** پارتی: ساخت/دعوت/پیوستن */
export class Party {
  constructor(id, leader) {
    this.id = id;
    this.leader = leader;
    this.members = [leader];
    this.invites = new Map(); // userId → expires_at
    this.created_at = Date.now();
  }
  invite(userId, ttlSec = 60) {
    this.invites.set(String(userId), Date.now() + ttlSec * 1000);
    return true;
  }
  accept(userId) {
    const exp = this.invites.get(String(userId));
    if (!exp) return { ok: false, error: 'no_invite' };
    if (exp < Date.now()) {
      this.invites.delete(String(userId));
      return { ok: false, error: 'expired' };
    }
    this.invites.delete(String(userId));
    this.members.push({ id: String(userId) });
    return { ok: true, size: this.members.length };
  }
  leave(userId) {
    this.members = this.members.filter((m) => String(m.id) !== String(userId));
    if (String(this.leader?.id) === String(userId)) this.leader = this.members[0] || null;
    return this.members.length;
  }
  size() {
    return this.members.length;
  }
}
