// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — مغز بات‌ها (Brain)
//
//  معماری هیبریدی (و چرا):
//   ۱) «مغز محلی» — درخت رفتار/امتیازدهی سودمند (utility) که روی سرور بازی
//      در ۲۰ تیک بر ثانیه اجرا می‌شود. قطعی، بدون شبکه، بدون هزینه.
//      اگر Workers AI در دسترس نباشد یا سهمیه تمام شود، بازی با همین ادامه
//      می‌یابد (برای نت ایران حیاتی است).
//   ۲) «مغز ابری» — فقط برای تصمیم‌های *استراتژیک* و فقط با فاصلهٔ زمانی
//      تعریف‌شده در bot-tiers.json (هر ۲ تا ۱۵ ثانیه بسته به سطح).
//      مدل از روی سطح انتخاب می‌شود: 3b → 8b → 70b.
//   نتیجهٔ ابری به‌صورت «هدف/نقشه» ذخیره و توسط مغز محلی اجرا می‌شود.
// ═══════════════════════════════════════════════════════════════════
import { clamp } from './rng.js';
import { tierIndex } from './bottier.js';

/** عمل‌های مجاز هر مود (از spec) */
export function allowedActions(modeSpec) {
  return modeSpec?.bot?.decisions || [];
}

// ─────────────────────────────────────────────────────────────────
//  ۱) مغز محلی: امتیازدهی سودمند برای هر عمل
// ─────────────────────────────────────────────────────────────────

const dist = (a) => Number(a?.dist ?? a?.distance ?? 999);

function nearestEnemy(w) {
  const list = (w.alive_enemies || []).slice().sort((a, b) => dist(a) - dist(b));
  return list[0] || null;
}
function nearestAlly(w) {
  const list = (w.alive_allies || []).slice().sort((a, b) => dist(a) - dist(b));
  return list[0] || null;
}
function hpRatio(bot) {
  const max = Number(bot.max_hp) || 20;
  return clamp((Number(bot.hp) || max) / max, 0, 1);
}

/**
 * تولید کاندیدهای عمل با امتیاز سودمندی.
 * خروجی: [{action, target, score, why}]
 */
export function scoreActions(ctx) {
  const { mode, bot, world: w, params } = ctx;
  const out = [];
  const push = (action, score, target = null, why = '', extra = {}) =>
    out.push({ action, score: Math.round(score * 1000) / 1000, target, why, ...extra });
  const allowed = new Set(allowedActions(mode));
  const can = (a) => allowed.has(a);

  const enemy = nearestEnemy(w);
  const ally = nearestAlly(w);
  const hp = hpRatio(bot);
  const aggro = Number(params.aggro ?? mode.bot?.weights?.aggro ?? 0.5);
  const tw = Number(params.teamwork ?? 0.5);
  const eco = Number(params.resource_efficiency ?? 0.5);
  const build = Number(params.build_skill ?? 0.3);
  const skill = Number(params.skill ?? 0.3);
  const timeLeft = Math.max(0, (Number(w.duration_sec) || 0) - (Number(w.elapsed_sec) || 0));
  const myScore = Number(w.scores?.my_team ?? 0);
  const enScore = Number(w.scores?.enemy_team ?? 0);
  const losing = enScore > myScore;

  // ── عمل مشترک: فرار وقتی جان کم است ──
  if (can('retreat_low_hp') && hp <= Number(params.retreat_hp ?? 0.25)) {
    push('retreat_low_hp', 3 + (1 - hp) * 4, enemy?.id || null, `جان ${Math.round(hp * 100)}%`);
  }
  // ── حمله به نزدیک‌ترین دشمن ──
  if (enemy && can('hunt_nearest')) {
    const s = 1.4 + aggro * 2 - dist(enemy) / 40 - (Number(enemy.hp) || 20) / 40;
    push('hunt_nearest', s, enemy.id, `دشمن در ${Math.round(dist(enemy))} بلوکی`);
  }
  if (enemy && can('engage_nearest')) push('engage_nearest', 1.5 + aggro * 2 - dist(enemy) / 35, enemy.id, 'درگیری نزدیک');
  if (enemy && can('engage_opponent')) push('engage_opponent', 1.6 + aggro * 2 - dist(enemy) / 30, enemy.id, 'حریف دوئل');
  if (enemy && can('combo_attack') && dist(enemy) < 4) push('combo_attack', 2 + skill * 2.5, enemy.id, 'کمبو در برد');
  if (enemy && can('focus_fire') && ally && dist(enemy) < 12) push('focus_fire', 1.8 + tw * 2, enemy.id, 'تمرکز آتش تیمی');

  // ── منابع / اقتصاد ──
  const res = (w.resources || []).slice().sort((a, b) => dist(a) - dist(b))[0];
  if (can('collect_resource')) {
    const need = bot.resources && Number(bot.resources.iron ?? 0) < 20 ? 1.2 : 0.6;
    push('collect_resource', 0.9 + eco * need * 1.5 - dist(res) / 60, res?.id || null, 'جمع‌آوری منبع');
  }
  if (can('mine_ores')) push('mine_ores', 0.8 + eco * 1.6 - dist(res) / 80, res?.id || null, 'استخراج');
  if (can('loot_chest')) {
    const chest = (w.chests || []).filter((c) => !c.looted).sort((a, b) => dist(a) - dist(b))[0];
    if (chest) push('loot_chest', 1.2 + eco * 1.2 - dist(chest) / 50, chest.id, 'صندوق غارت‌نشده');
  }
  if (can('farm_resources')) push('farm_resources', 0.5 + eco, null, 'فارم');
  if (can('eat_food') && hp < 0.75 && Number(bot.inventory?.food) > 0) push('eat_food', 2.2 - hp, null, 'گرسنگی/جان');
  if (can('heal_golden_apple') && hp < 0.6 && Number(bot.inventory?.golden_apple) > 0) push('heal_golden_apple', 3 - hp, null, 'جان کم + سیب طلایی');
  if (can('use_potion') && hp < 0.55 && Number(bot.inventory?.potion) > 0) push('use_potion', 2.6 - hp, null, 'معجون');

  // ── خرید (بدوارز/کیت) ──
  if (can('buy_item')) {
    const affordable = (w.shop_affordable || []).length;
    const betterGear = Number(w.gear_gap ?? 0); // 0..1 چقدر تجهیزات حریف بهتر است
    push('buy_item', 0.7 + eco * 1.4 + betterGear * 2 + Math.min(1.2, affordable * 0.2), null, `${affordable} خرید ممکن`);
  }
  if (can('buy_upgrade')) {
    push('buy_upgrade', 0.6 + eco * 1.8 + (losing ? 0.8 : 0), null, 'ارتقای تیمی');
  }
  if (can('craft_gear')) push('craft_gear', 0.8 + eco * 1.5 + Number(w.gear_gap ?? 0), null, 'ساخت ابزار');
  if (can('smelt_food')) push('smelt_food', 0.4 + eco, null, 'پخت غذا');
  if (can('pick_kit')) push('pick_kit', 2.5 + (Number(w.elapsed_sec) < 20 ? 2 : 0), null, 'انتخاب کیت');

  // ── ساخت‌وساز / پل ──
  if (can('bridge_to_island')) {
    const target = (w.islands || []).filter((i) => !i.owned_by_me).sort((a, b) => dist(a) - dist(b))[0];
    push('bridge_to_island', 0.9 + build * 2 - dist(target) / 90, target?.id || null, 'پل به جزیره');
  }
  if (can('build_side_bridge')) push('build_side_bridge', 0.7 + build * 1.6, null, 'مسیر فرعی');
  if (can('build_fort')) push('build_fort', 0.5 + build * 1.4 + (losing ? 0.4 : 0), null, 'سنگر');
  if (can('build_base')) push('build_base', 0.6 + build * 1.5, null, 'ساخت بیس');
  if (can('place_blocks')) push('place_blocks', 0.5 + build * 2, null, 'ساخت‌وساز');
  if (can('add_detail')) push('add_detail', 0.3 + build * 1.2, null, 'جزئیات');
  if (can('decorate')) push('decorate', 0.25 + build, null, 'تزئین');
  if (can('choose_blueprint')) push('choose_blueprint', 3 + build, null, 'انتخاب طرح');
  if (can('barricade_door')) push('barricade_door', 1.6 + tw * 1.8 - Number(w.doors_broken ?? 0) * 0.3, null, 'سنگربندی');
  if (can('repair_wall')) push('repair_wall', 1.2 + build, null, 'تعمیر');

  // ── هدف‌های مود ──
  if (can('defend_bed')) {
    const bed = w.objectives?.my_bed;
    const threatNearBed = Number(w.objectives?.bed_threat_dist ?? 999) < 18 ? 1 : 0;
    push('defend_bed', 1.1 + tw * 1.2 + threatNearBed * 3 - (bed?.obsidian ? 0.6 : 0), null, threatNearBed ? 'تهدید نزدیک تخت' : 'محافظت تخت');
  }
  if (can('place_obsidian') && !w.objectives?.my_bed?.obsidian && Number(bot.inventory?.obsidian) > 0) {
    push('place_obsidian', 2.4, null, 'ابسیدین روی تخت');
  }
  if (can('set_trap') && !w.objectives?.my_trap) push('set_trap', 0.8 + skill, null, 'تله');
  if (can('attack_enemy_base')) {
    const weak = (w.objectives?.enemy_beds || []).filter((b) => !b.obsidian).sort((a, b) => dist(a) - dist(b))[0];
    push('attack_enemy_base', 1.2 + aggro * 1.6 - dist(weak) / 100 + (timeLeft < 180 ? 1.5 : 0), weak?.team || null, weak ? 'تخت بدون اابسیدین' : 'حمله به بیس');
  }
  if (can('push_bridge')) push('push_bridge', 1.5 + aggro * 1.4 - dist(enemy) / 60, enemy?.id || null, 'فشار روی پل');
  if (can('defend_goal')) push('defend_goal', 1 + tw * 1.6 + (losing ? 1 : 0), null, 'دفاع از دروازه');
  if (can('block_enemy_path')) push('block_enemy_path', 0.9 + build + aggro * 0.5, enemy?.id || null, 'بستن مسیر');
  if (can('goal')) push('goal', 3, null, 'گل');

  // ── پارکور / ران ──
  if (can('path_next_checkpoint')) {
    const d = Number(w.next_checkpoint_dist ?? 10);
    push('path_next_checkpoint', 2.5 - d / 60, w.next_checkpoint_id || null, 'چک‌پوینت بعدی');
  }
  if (can('path_to_safe_block')) push('path_to_safe_block', 2.2 - Number(w.unsafe_blocks_ahead ?? 0) * 0.2, null, 'بلوک امن');
  if (can('keep_moving')) push('keep_moving', 1.4, null, 'توقف = مرگ');
  if (can('avoid_falling_block')) push('avoid_falling_block', 1.8 - Number(w.blocks_left_ratio ?? 1) * 0.5, null, 'بلوک در حال ریزش');
  if (can('center_control')) push('center_control', 0.6 + (timeLeft < 120 ? 1.2 : 0), null, 'مرکز نقشه');
  if (can('knock_nearest') && enemy && dist(enemy) < 5) push('knock_nearest', 1 + aggro, enemy.id, 'پرت کردن حریف');
  if (can('jump_timing')) push('jump_timing', 0.8 + skill, null, 'زمان‌بندی پرش');
  if (can('sprint_control')) push('sprint_control', 0.7 + skill, null, 'کنترل دویدن');
  if (can('recover_after_fall')) push('recover_after_fall', Number(w.just_fell) ? 3 : 0.1, null, 'بازگشت بعد سقوط');

  // ── ماردِر میستری (فریب) ──
  if (can('blend_with_crowd')) push('blend_with_crowd', 1 + (Number(params.deception) || 0) * 1.6, null, 'قاطی جمعیت');
  if (can('isolate_target')) {
    const target = (w.alive_enemies || []).slice().sort((a, b) => (Number(a.nearby_allies ?? 0) - Number(b.nearby_allies ?? 0)) || (dist(a) - dist(b)))[0];
    push('isolate_target', bot.role === 'murderer' ? 2.2 + (Number(params.deception) || 0) * 2 - dist(target) / 40 : 0, target?.id || null, 'هدف تنها');
  }
  if (can('collect_gold')) {
    const g = (w.gold || []).sort((a, b) => dist(a) - dist(b))[0];
    push('collect_gold', 1 + eco - dist(g) / 50, g?.id || null, 'طلای روی زمین');
  }
  if (can('accuse')) push('accuse', 0.4 + (Number(params.deception) || 0) * 1.5 + Number(w.suspicion ?? 0), w.suspect_id || null, 'اتهام');
  if (can('follow_suspect')) push('follow_suspect', 0.9 + skill + Number(w.suspicion ?? 0) * 0.5, w.suspect_id || null, 'تعقیب مشکوک');
  if (can('escape_chase')) push('escape_chase', Number(w.being_chased) ? 3.2 : 0.2, null, 'فرار از تعقیب');
  if (can('throw_bow')) push('throw_bow', Number(w.has_bow) ? 2.4 : 0, enemy?.id || null, 'کمان');
  if (can('fake_activity')) push('fake_activity', 0.5 + (Number(params.deception) || 0) * 1.4, null, 'فعالیت جعلی');

  // ── اسپلیف ──
  if (can('dig_under_target') && enemy) push('dig_under_target', 1.4 + aggro * 1.4 - dist(enemy) / 25, enemy.id, 'کندن زیر حریف');
  if (can('dig_escape_path')) push('dig_escape_path', 0.8 + Number(w.holes_near ?? 0) * 0.3, null, 'مسیر فرار');
  if (can('avoid_holes')) push('avoid_holes', 1 + Number(w.holes_near ?? 0) * 0.4, null, 'دوری از سوراخ‌ها');
  if (can('throw_snowball') && enemy && Number(bot.inventory?.snowball) > 0) push('throw_snowball', 1 + aggro, enemy.id, 'گلوله برفی');
  if (can('corner_opponent') && enemy) push('corner_opponent', 0.9 + skill, enemy.id, 'گوشه انداختن');

  // ── زامبی سروایول (همکاری) ──
  if (can('hold_chokepoint')) push('hold_chokepoint', 1.3 + tw * 1.5 - Number(w.zombie_pressure ?? 0) * 0.2, null, 'نقطهٔ گلوگاه');
  if (can('kite_zombies')) push('kite_zombies', 1 + (Number(w.zombie_pressure ?? 0) > 6 ? 1.5 : 0), null, 'کایت کردن');
  if (can('revive_teammate')) {
    const down = (w.downed_allies || []).sort((a, b) => dist(a) - dist(b))[0];
    push('revive_teammate', down ? 2.4 + tw * 2 - dist(down) / 30 : 0, down?.id || null, down ? 'یار افتاده' : '');
  }

  // ── اسکای‌وارز / بقا ──
  if (can('throw_ender_pearl') && Number(bot.inventory?.ender_pearl) > 0 && enemy && dist(enemy) > 12 && dist(enemy) < 30) {
    push('throw_ender_pearl', 1.2 + aggro, enemy.id, 'اندرفرل');
  }
  if (can('camp_high_ground')) push('camp_high_ground', 0.6 + (1 - aggro) * 1.4 + (timeLeft < 120 ? -1 : 0), null, 'ارتفاع');
  if (can('third_party_fight')) push('third_party_fight', Number(w.fighting_nearby) ? 1.6 + aggro : 0.2, null, 'حمله به درگیری');
  if (can('avoid_strong')) push('avoid_strong', enemy && Number(enemy.gear_score ?? 0) > Number(bot.gear_score ?? 0) * 1.4 ? 1.8 : 0.2, enemy?.id || null, 'حریف قوی‌تر');
  if (can('rotate_border')) push('rotate_border', Number(w.border_close) ? 2.2 : 0.3, null, 'چرخش به مرکز');
  if (can('avoid_border')) push('avoid_border', Number(w.border_close) ? 2.2 : 0.3, null, 'دوری از بوردر');
  if (can('ambush')) push('ambush', 0.7 + aggro * 0.8 + (1 - skill) * -0.3, null, 'کمین');

  // ── فکشنز ──
  if (can('claim_chunk')) push('claim_chunk', 1 + tw - Number(w.claimed_chunks ?? 0) * 0.05, null, 'ادعا');
  if (can('raid_enemy_base')) push('raid_enemy_base', 0.9 + aggro * 1.6 - Number(w.enemy_power_gap ?? 0) * 0.4, null, 'غارت');
  if (can('defend_claim')) push('defend_claim', 1 + tw + Number(w.under_raid ?? 0) * 2, null, 'دفاع از ادعا');
  if (can('recruit')) push('recruit', 0.3, null, 'یارگیری');

  // ── رای‌گیری بیلد بتل ──
  if (can('vote_for_build')) push('vote_for_build', Number(w.voting_phase) ? 3 : 0, w.best_build_id || null, 'رای');

  // ── دوئل: فشار کمان ──
  if (can('bow_pressure') && Number(bot.inventory?.arrow) > 0 && enemy && dist(enemy) > 6) push('bow_pressure', 1.3 + skill, enemy.id, 'فشار با کمان');
  if (can('w_combo') && enemy && dist(enemy) < 5) push('w_combo', 1.6 + skill * 2, enemy.id, 'W-combo');
  if (can('block_corner') && enemy) push('block_corner', 0.8 + skill, enemy.id, 'گوشه');
  if (can('strafe_combat') && enemy && dist(enemy) < 8) push('strafe_combat', 1.2 + Number(params.strafe_quality ?? 0.4), enemy.id, 'استریف');
  if (can('respawn_attack')) push('respawn_attack', Number(w.just_respawned) ? 2 : 0.4, null, 'حمله بعد ریسپاون');
  if (can('team_up_push')) push('team_up_push', 1 + tw * 1.6 + (losing ? 1.2 : 0), null, 'حملهٔ هماهنگ');

  return out.sort((a, b) => b.score - a.score);
}

/**
 * تصمیم نهایی مغز محلی — با نویز متناسب با (۱ - مهارت) تا سطوح پایین
 * واقعاً اشتباه کنند و رباتیک به نظر نرسند.
 */
export function heuristicDecide(ctx) {
  const scored = scoreActions(ctx);
  if (!scored.length) return { action: 'idle', target: null, score: 0, why: 'هیچ عمل مجازی نیست', source: 'heuristic', confidence: 0 };
  const skill = clamp(Number(ctx.params?.skill ?? 0.3), 0, 1);
  const rng = ctx.rng;
  const mistakeRate = clamp(Number(ctx.params?.mistake_rate ?? 0.1), 0, 0.5);

  let chosen = scored[0];
  // اشتباه عمدی: با احتمال mistake_rate یکی از ۳ گزینهٔ بعدی را انتخاب کن
  if (rng && rng.chance(mistakeRate) && scored.length > 1) {
    chosen = scored[Math.min(scored.length - 1, rng.int(1, 3))];
  } else if (rng && scored.length > 1) {
    // نویز مهارتی: هرچه مهارت کمتر، پراکندگی بیشتر
    const spread = (1 - skill) * 0.9;
    const noisy = scored.map((c, i) => ({ ...c, n: c.score + (rng.gauss() * spread * (1 + i * 0.15)) }));
    noisy.sort((a, b) => b.n - a.n);
    chosen = scored.find((c) => c.action === noisy[0].action && c.target === noisy[0].target) || scored[0];
  }
  return {
    action: chosen.action,
    target: chosen.target,
    score: chosen.score,
    why: chosen.why,
    source: 'heuristic',
    confidence: Math.round(clamp(chosen.score / 4, 0, 1) * 100) / 100,
    alternatives: scored.slice(0, 4).map((s) => ({ action: s.action, score: s.score })),
  };
}

// ─────────────────────────────────────────────────────────────────
//  ۲) لایهٔ انسانی‌سازی (تاخیر واکنش، خطای نشانه، اشتباه)
// ─────────────────────────────────────────────────────────────────
export function humanizeAction(decision, params, rng) {
  const p = params || {};
  const reaction = rng ? rng.int(p.reaction_ms?.min ?? 300, p.reaction_ms?.max ?? 600) : 400;
  const aimError = rng ? Math.abs(rng.normal(0, (p.aim_error_deg?.max ?? 8) / 2)) : 4;
  const fumble = rng ? rng.chance(p.mistake_rate ?? 0.1) : false;
  return {
    ...decision,
    reaction_ms: reaction,
    aim_error_deg: Math.round(aimError * 10) / 10,
    fumble,
    fumble_kind: fumble ? (rng ? rng.pick(['miss_click', 'wrong_direction', 'late_jump', 'drop_item']) : 'miss_click') : null,
    should_chat: !!p.chat_enabled && rng ? rng.chance((p.chat_per_min || 2) / 60 / Math.max(1, p.decision_hz || 5)) : false,
  };
}

// ─────────────────────────────────────────────────────────────────
//  ۳) مغز ابری (Workers AI)
// ─────────────────────────────────────────────────────────────────

/** خلاصهٔ فشردهٔ وضعیت برای پرامپت (تا توکن هدر نرود) */
export function worldDigest(ctx) {
  const { mode, bot, world: w, tier } = ctx;
  const d = {
    mode: mode.id,
    t: Math.round(Number(w.elapsed_sec) || 0),
    left: Math.max(0, Math.round((Number(w.duration_sec) || 0) - (Number(w.elapsed_sec) || 0))),
    tier,
    me: {
      hp: Math.round(Number(bot.hp) || 0),
      team: bot.team ?? null,
      role: bot.role ?? null,
      inv: Object.fromEntries(Object.entries(bot.inventory || {}).filter(([, v]) => Number(v) > 0).slice(0, 12)),
      res: bot.resources || null,
    },
    score: w.scores || null,
    enemies: (w.alive_enemies || []).slice(0, 6).map((e) => ({
      id: e.id, d: Math.round(dist(e)), hp: Math.round(Number(e.hp) || 0), gear: e.gear_score ?? null,
    })),
    allies: (w.alive_allies || []).slice(0, 4).map((a) => ({ id: a.id, d: Math.round(dist(a)), hp: Math.round(Number(a.hp) || 0), down: !!a.downed })),
    objectives: w.objectives || null,
    events: (w.recent_events || []).slice(-8),
  };
  return d;
}

const ROLE_HINT = {
  bedwars: 'تو یک بات در BedWars هستی. اولویت: زنده ماندن، شکستن تخت دشمن، محافظت تخت خودی، خرید هوشمند از منابع.',
  skywars: 'تو یک بات در SkyWars هستی. اولویت: غارت سریع، پل زدن به جزیرهٔ نزدیک، حمله به ضعیف‌ترین حریف.',
  survivalgames: 'تو یک بات در Survival Games هستی. اولویت: غارت اولیه، دوری از درگیری زودهنگام، کمین در اواخر.',
  tntrun: 'تو یک بات در TNT Run هستی. فقط روی مسیر امن و زمان‌بندی پرش تمرکز کن.',
  murdermystery: 'تو یک بات در Murder Mystery هستی. اگر قاتلی: جدا کردن هدف و فریب. اگر بی‌گناهی: جمع شدن و پیدا کردن قاتل.',
  parkour: 'تو یک بات در Parkour هستی. فقط مسیر بهینه و ریتم پرش.',
  buildbattle: 'تو یک بات در Build Battle هستی. با توجه به تم، طرحی انتخاب کن که بیشترین رای را بگیرد.',
  spleef: 'تو یک بات در Spleef هستی. زیر پای حریف را بکن و از سوراخ‌ها دور بمان.',
  thebridge: 'تو یک بات در The Bridge هستی. گل زدن مهم‌تر از کشتن است؛ مسیر را باز کن.',
  uhc: 'تو یک بات در UHC هستی. بدون بازیابی طبیعی جان: اول ابزار بساز، بعد شکار کن.',
  zombiesurvival: 'تو یک بات در Zombie Survival هستی. تیمی بازی کن: سنگربندی، نگهداری گلوگاه، احیای یار.',
  kitpvp: 'تو یک بات در KitPvP هستی. استریک بساز اما طمع نکن.',
  duels: 'تو یک بات در Duels هستی. ۱v۱ خالص: استریف، W-combo، زمان‌بندی معجون.',
  factions: 'تو یک بات NPC در Factions هستی. بیس بساز، منابع فارم کن و در زمان مناسب غارت کن.',
};

/**
 * ساخت پیام‌های مدل. خروجی باید JSON سخت‌گیرانه باشد تا پارس قطعی بماند.
 */
export function buildMessages(ctx) {
  const mode = ctx.mode;
  const allowed = allowedActions(mode);
  const digest = worldDigest(ctx);
  const system = [
    ROLE_HINT[mode.id] || 'تو یک بات در یک مینی‌گیم ماینکرفت هستی.',
    `سطح مهارت تو ${ctx.tier} است (مهارت ${Number(ctx.params?.skill ?? 0).toFixed(2)} از ۱).`,
    'خروجی را فقط و فقط به‌صورت یک آبجکت JSON بده، بدون هیچ توضیح اضافه:',
    '{"action":"<یکی از عمل‌های مجاز>","target":"<شناسه هدف یا null>","reason":"<حداکثر ۸ کلمه>","plan":["<حداکثر ۳ قدم بعدی>"]}',
    `عمل‌های مجاز: ${allowed.join(', ')}`,
    'قانون: هرگز عملی خارج از لیست مجاز برنگردان. اگر مطمئن نیستی، امن‌ترین گزینه را انتخاب کن.',
    'قانون: رفتار باید انسانی باشد — خطای کوچک مجاز است، اما بازی کامل (aim-lock) ممنوع.',
  ].join('\n');
  const user = `وضعیت:\n${JSON.stringify(digest)}\n\nعمل بعدی را انتخاب کن.`;
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

/** پارس + اعتبارسنجی پاسخ مدل؛ در صورت خرابی به مغز محلی برمی‌گردد */
export function parseLlmDecision(text, ctx) {
  const raw = String(text || '');
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return { ok: false, reason: 'no_json', fallback: heuristicDecide(ctx) };
  let obj;
  try {
    obj = JSON.parse(m[0]);
  } catch {
    // تلاش دوم: پاک کردن کاما/نقل‌قول اضافی
    try {
      obj = JSON.parse(m[0].replace(/,\s*([}\]])/g, '$1').replace(/'/g, '"'));
    } catch {
      return { ok: false, reason: 'bad_json', fallback: heuristicDecide(ctx) };
    }
  }
  const allowed = allowedActions(ctx.mode);
  const action = String(obj.action || '').trim();
  if (!allowed.includes(action)) return { ok: false, reason: 'action_not_allowed', fallback: heuristicDecide(ctx), got: action };
  const plan = Array.isArray(obj.plan) ? obj.plan.slice(0, 3).map((s) => String(s).slice(0, 60)) : [];
  return {
    ok: true,
    decision: {
      action,
      target: obj.target === undefined || obj.target === null ? null : String(obj.target).slice(0, 40),
      why: String(obj.reason || '').slice(0, 80),
      plan,
      source: 'llm',
      confidence: 0.8,
    },
  };
}

/** آیا الان وقت مشورت با مدل است؟ (کنترل هزینه + کش وضعیت تکراری) */
export function shouldConsultLlm(ctx, budget) {
  const tier = ctx.tier;
  const interval = Number(ctx.mode?.bot?.llm_interval_sec?.[tier] || 0);
  if (!interval || !budget?.llm_enabled) return false;
  const elapsed = Number(ctx.world?.elapsed_sec) || 0;
  const last = Number(budget.last_call_sec ?? -1e9);
  if (elapsed - last < interval) return false;
  if (Number(budget.used || 0) >= Number(budget.allowed || 0)) return false;
  const h = stateHash(ctx);
  if (budget.cache && budget.cache[h]) return false; // وضعیت یکسان → کش
  return true;
}

/** هش فشرده از وضعیت (برای کش تصمیم‌های یکسان) */
export function stateHash(ctx) {
  const w = ctx.world || {};
  const b = ctx.bot || {};
  const parts = [
    ctx.mode?.id,
    ctx.tier,
    Math.round((Number(w.elapsed_sec) || 0) / 5) * 5,
    Math.round(Number(b.hp) || 0),
    (w.alive_enemies || []).map((e) => `${e.id}:${Math.round(dist(e) / 3)}`).join(','),
    JSON.stringify(w.scores || {}),
    JSON.stringify(w.objectives?.beds || w.objectives?.goals || {}),
  ];
  let h = 2166136261 >>> 0;
  const s = parts.join('|');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h >>> 0).toString(36);
}

/** ادغام نتیجهٔ ابری با مغز محلی: ابری «هدف» می‌دهد، محلی اجرا می‌کند */
export function mergeDecisions(local, cloud) {
  if (!cloud?.ok) return { ...local, cloud_used: false };
  const d = cloud.decision;
  // اگر عمل ابری با وضعیت سازگار نیست (مثلاً جان کم و حمله)، محلی برنده است
  if (d.action === 'idle') return { ...local, cloud_used: true };
  return { ...d, alternatives: local.alternatives, cloud_used: true, local_action: local.action };
}
