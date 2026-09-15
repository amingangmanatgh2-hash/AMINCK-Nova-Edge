// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — آنتی‌چیت پایه (مشترک بین Java و Bedrock)
//  رویکرد: «امتیاز تخطی با افول زمانی» نه بن فوری. هر بررسی یک وزن دارد؛
//  وقتی مجموع از آستانه رد شد → هشدار/کیک/بن موقت/بن دائم.
//  جبران پینگ: برای نت ایران حیاتی است (reach و speed با پینگ تصحیح می‌شوند).
//  ⚠️ صادقانه: این یک آنتی‌چیت «پایه ولی واقعی» است، نه ضدتقلب سطح
//     تجاری (مثل Grim/Matrix). هدف: گرفتن ۹۰٪ چیت‌های رایگان بدون false-positive.
// ═══════════════════════════════════════════════════════════════════
import { clamp } from './rng.js';

export const CHECKS = {
  reach: { weight: 6, limit_blocks: 3.4, ping_compensation: true, per_ms: 0.004 },
  killaura: { weight: 10, rotation_snap_deg: 40, min_hits: 3 },
  autoclicker: { weight: 5, cps_max: 18, cps_min_consistent: 19.5 },
  fly: { weight: 14, max_air_ticks: 40, vy_tolerance: 0.08 },
  speed: { weight: 12, max_speed: 0.42, sprint_max: 0.62 },
  nofall: { weight: 8, fall_damage_skips: 3 },
  timer: { weight: 15, tick_rate_max: 22.5 },
  scaffold: { weight: 4, place_rate_max: 22 },
  xray: { weight: 9, ore_per_min_max: 26, straight_line_digs: 6 },
  fastbow: { weight: 7, charge_ms_min: 550 },
  invmove: { weight: 6, sprint_while_gui: 2 },
  blink: { weight: 13, position_jitter_blocks: 12 },
  impossible: { weight: 20, note: 'actions that cannot happen in vanilla (e.g. hit while dead)' },
};

export const DEFAULT_CONFIG = {
  warn_at: 20,
  kick_at: 45,
  tempban_at: 80,
  ban_at: 150,
  decay_per_min: 3,
  tempban_hours: 24,
  ping_tolerance_ms: 250,
  verbose: false,
  exempt_ops: true,
};

/** جبران پینگ: هر میلی‌ثانیه پینگ مقدار کمی به حد مجاز reach اضافه می‌کند */
export function reachLimit(pingMs, base = CHECKS.reach.limit_blocks, perMs = CHECKS.reach.per_ms) {
  const ping = clamp(Number(pingMs) || 0, 0, DEFAULT_CONFIG.ping_tolerance_ms);
  return Math.round((base + ping * perMs * 0.25) * 100) / 100;
}

export function speedLimit(sprinting, pingMs) {
  const base = sprinting ? CHECKS.speed.sprint_max : CHECKS.speed.max_speed;
  const ping = clamp(Number(pingMs) || 0, 0, DEFAULT_CONFIG.ping_tolerance_ms);
  return Math.round((base + ping * 0.00012) * 1000) / 1000;
}

/**
 * تحلیل یک نمونهٔ تیک/رویداد
 * @param {object} s نمونه: {check, value, ping, sprinting, on_ground, air_ticks, ...}
 * @param {object} cfg تنظیمات مود (از gamemodes.json → anticheat)
 * @returns {null|{check:string, weight:number, value:number, limit:number, detail:string}}
 */
export function inspect(s = {}, cfg = {}) {
  const check = String(s.check || '');
  const mode = cfg || {};
  const v = Number(s.value) || 0;
  const hit = (limit, detail, weight) => ({ check, weight, value: v, limit, detail });

  switch (check) {
    case 'reach': {
      const limit = reachLimit(s.ping, Number(mode.reach_max_blocks) || CHECKS.reach.limit_blocks);
      if (v > limit) return hit(limit, `reach=${v.toFixed(2)} > ${limit}`, CHECKS.reach.weight * (Number(mode.flag_weight_kill) || 2) / 2);
      return null;
    }
    case 'cps': {
      const max = Number(mode.cps_max) || CHECKS.autoclicker.cps_max;
      if (v > max) return hit(max, `cps=${v}`, CHECKS.autoclicker.weight);
      return null;
    }
    case 'rotation_snap': {
      // اگر در N ضربهٔ پیاپی چرخش سر دقیقاً به هدف قفل شد → کیل‌اورا
      if (Number(s.snap_streak) >= (CHECKS.killaura.min_hits || 3) && v < CHECKS.killaura.rotation_snap_deg) {
        return hit(CHECKS.killaura.rotation_snap_deg, `snap_streak=${s.snap_streak} err=${v}°`, CHECKS.killaura.weight);
      }
      return null;
    }
    case 'air_ticks': {
      if (!s.on_ground && v > CHECKS.fly.max_air_ticks && !Number(s.elytra) && !Number(s.levitation)) {
        return hit(CHECKS.fly.max_air_ticks, `air_ticks=${v}`, CHECKS.fly.weight);
      }
      return null;
    }
    case 'speed': {
      const limit = speedLimit(!!s.sprinting, s.ping);
      const cap = Number(mode.max_speed) || limit;
      if (v > Math.max(limit, cap) && s.on_ground !== false) return hit(Math.max(limit, cap), `speed=${v.toFixed(3)}`, CHECKS.speed.weight);
      return null;
    }
    case 'tick_rate': {
      if (v > CHECKS.timer.tick_rate_max) return hit(CHECKS.timer.tick_rate_max, `tps=${v}`, CHECKS.timer.weight);
      return null;
    }
    case 'place_rate': {
      const max = Number(mode.max_blocks_per_sec) || CHECKS.scaffold.place_rate_max;
      if (v > max) return hit(max, `place/s=${v}`, CHECKS.scaffold.weight);
      return null;
    }
    case 'ore_rate': {
      if (v > CHECKS.xray.ore_per_min_max || Number(s.straight_digs) >= CHECKS.xray.straight_line_digs) {
        return hit(CHECKS.xray.ore_per_min_max, `ore/min=${v}`, CHECKS.xray.weight);
      }
      return null;
    }
    case 'bow_charge': {
      if (v > 0 && v < CHECKS.fastbow.charge_ms_min) return hit(CHECKS.fastbow.charge_ms_min, `charge=${v}ms`, CHECKS.fastbow.weight);
      return null;
    }
    case 'nofall': {
      if (Number(s.skips) >= CHECKS.nofall.fall_damage_skips) return hit(CHECKS.nofall.fall_damage_skips, `skips=${s.skips}`, CHECKS.nofall.weight);
      return null;
    }
    case 'blink': {
      if (v > CHECKS.blink.position_jitter_blocks) return hit(CHECKS.blink.position_jitter_blocks, `jump=${v} blocks`, CHECKS.blink.weight);
      return null;
    }
    case 'impossible': {
      return hit(0, String(s.detail || 'impossible action'), CHECKS.impossible.weight);
    }
    default:
      return null;
  }
}

/**
 * ردیاب تخطی با افول زمانی — یک نمونه برای هر بازیکن
 */
export class ViolationTracker {
  constructor(cfg = {}) {
    this.cfg = { ...DEFAULT_CONFIG, ...cfg };
    this.players = new Map();
  }

  _get(id) {
    if (!this.players.has(id)) {
      this.players.set(id, { id, score: 0, history: [], last_action: '', last_ts: 0, exempt: false });
    }
    return this.players.get(id);
  }

  /** افول امتیاز بر اساس زمان گذشته */
  decay(p, nowTs) {
    const mins = Math.max(0, (nowTs - (p.last_ts || nowTs)) / 60000);
    if (mins > 0) p.score = Math.max(0, p.score - mins * this.cfg.decay_per_min);
    p.last_ts = nowTs;
  }

  /**
   * ثبت یک تخطی و صدور حکم
   * @returns {{id:string, score:number, violation:object|null, action:'none'|'warn'|'kick'|'tempban'|'ban', reasons:string[]}}
   */
  record(id, sample, modeCfg = {}, nowTs = Date.now()) {
    const p = this._get(id);
    this.decay(p, nowTs);
    const v = inspect(sample, modeCfg);
    if (!v) return { id, score: Math.round(p.score), violation: null, action: 'none', reasons: [] };
    if (p.exempt && this.cfg.exempt_ops) {
      p.history.push({ ...v, ts: nowTs, exempted: true });
      return { id, score: Math.round(p.score), violation: v, action: 'none', reasons: ['exempt'] };
    }
    p.score += Number(v.weight) || 1;
    p.history.push({ ...v, ts: nowTs });
    if (p.history.length > 60) p.history.splice(0, p.history.length - 60);

    let action = 'none';
    if (p.score >= this.cfg.ban_at) action = 'ban';
    else if (p.score >= this.cfg.tempban_at) action = 'tempban';
    else if (p.score >= this.cfg.kick_at) action = 'kick';
    else if (p.score >= this.cfg.warn_at) action = 'warn';

    if (action !== 'none' && action !== p.last_action) p.last_action = action;
    return {
      id,
      score: Math.round(p.score),
      violation: v,
      action,
      reasons: p.history.slice(-6).map((h) => `${h.check}: ${h.detail}`),
      tempban_hours: action === 'tempban' ? this.cfg.tempban_hours : 0,
    };
  }

  reset(id) {
    this.players.delete(id);
  }

  snapshot() {
    return [...this.players.values()].map((p) => ({
      id: p.id,
      score: Math.round(p.score),
      last_action: p.last_action,
      violations: p.history.length,
      top: p.history.slice(-3).map((h) => h.check),
    }));
  }
}

/** خلاصهٔ آماری برای پنل ادمین (چه چیتی شایع است) */
export function summarize(tracker) {
  const byCheck = {};
  let flagged = 0;
  for (const p of tracker.players.values()) {
    if (p.score >= tracker.cfg.warn_at) flagged++;
    for (const h of p.history) byCheck[h.check] = (byCheck[h.check] || 0) + 1;
  }
  return { players_tracked: tracker.players.size, flagged, by_check: byCheck };
}
