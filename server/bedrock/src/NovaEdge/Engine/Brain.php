<?php
// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — Engine/Brain.php (پورت دقیق shared/engine/brain.js)
//  مغز محلی بات‌ها: درخت امتیازدهی سودمند (utility) در ۲۰ تیک/ثانیه.
//  تصمیم استراتژیک ابری (Workers AI) روی ورکر می‌ماند؛ اینجا فقط
//  اجرای محلی + انسانی‌سازی + ادغام نتیجهٔ ابری انجام می‌شود.
// ═══════════════════════════════════════════════════════════════════
declare(strict_types=1);

namespace NovaEdge\Engine;

final class Brain
{
    /** @param array $modeSpec */
    public static function allowedActions(array $modeSpec): array
    {
        return $modeSpec['bot']['decisions'] ?? [];
    }

    private static function dist(?array $a): float
    {
        if (!$a) {
            return 999.0;
        }
        return (float) ($a['dist'] ?? $a['distance'] ?? 999);
    }

    /** مرتب‌سازی پایدار (مثل sort جاوااسکریپت) */
    private static function stableSort(array $arr, callable $cmp): array
    {
        $dec = [];
        foreach ($arr as $i => $v) {
            $dec[] = [$i, $v];
        }
        usort($dec, fn ($a, $b) => $cmp($a[1], $b[1]) ?: ($a[0] <=> $b[0]));
        return array_map(fn ($x) => $x[1], $dec);
    }

    private static function nearestByDist(array $list): ?array
    {
        $sorted = self::stableSort($list, fn ($a, $b) => self::dist($a) <=> self::dist($b));
        return $sorted[0] ?? null;
    }

    private static function hpRatio(array $bot): float
    {
        $max = (float) ($bot['max_hp'] ?? 0) ?: 20;
        return RngCore::clamp(((float) ($bot['hp'] ?? $max)) / $max, 0, 1);
    }

    /**
     * کاندیدهای عمل با امتیاز سودمندی — دقیقاً مثل scoreActions
     * @param array $ctx {mode, bot, world, params}
     */
    public static function scoreActions(array $ctx): array
    {
        $mode = $ctx['mode'] ?? [];
        $bot = $ctx['bot'] ?? [];
        $w = $ctx['world'] ?? [];
        $params = $ctx['params'] ?? [];
        $out = [];
        $push = function (string $action, float $score, ?string $target = null, string $why = '', array $extra = []) use (&$out): void {
            $out[] = array_merge(['action' => $action, 'score' => Bits::roundTo($score, 3), 'target' => $target, 'why' => $why], $extra);
        };
        $allowed = self::allowedActions($mode);
        $can = fn (string $a) => in_array($a, $allowed, true);

        $enemy = self::nearestByDist($w['alive_enemies'] ?? []);
        $ally = self::nearestByDist($w['alive_allies'] ?? []);
        $hp = self::hpRatio($bot);
        $aggro = (float) ($params['aggro'] ?? $mode['bot']['weights']['aggro'] ?? 0.5);
        $tw = (float) ($params['teamwork'] ?? 0.5);
        $eco = (float) ($params['resource_efficiency'] ?? 0.5);
        $build = (float) ($params['build_skill'] ?? 0.3);
        $skill = (float) ($params['skill'] ?? 0.3);
        $timeLeft = max(0, ((float) ($w['duration_sec'] ?? 0)) - ((float) ($w['elapsed_sec'] ?? 0)));
        $myScore = (float) ($w['scores']['my_team'] ?? 0);
        $enScore = (float) ($w['scores']['enemy_team'] ?? 0);
        $losing = $enScore > $myScore;

        if ($can('retreat_low_hp') && $hp <= (float) ($params['retreat_hp'] ?? 0.25)) {
            $push('retreat_low_hp', 3 + (1 - $hp) * 4, $enemy['id'] ?? null, 'جان ' . Bits::jsRound($hp * 100) . '%');
        }
        if ($enemy && $can('hunt_nearest')) {
            $push('hunt_nearest', 1.4 + $aggro * 2 - self::dist($enemy) / 40 - ((float) ($enemy['hp'] ?? 20)) / 40, $enemy['id'], 'دشمن در ' . Bits::jsRound(self::dist($enemy)) . ' بلوکی');
        }
        if ($enemy && $can('engage_nearest')) {
            $push('engage_nearest', 1.5 + $aggro * 2 - self::dist($enemy) / 35, $enemy['id'], 'درگیری نزدیک');
        }
        if ($enemy && $can('engage_opponent')) {
            $push('engage_opponent', 1.6 + $aggro * 2 - self::dist($enemy) / 30, $enemy['id'], 'حریف دوئل');
        }
        if ($enemy && $can('combo_attack') && self::dist($enemy) < 4) {
            $push('combo_attack', 2 + $skill * 2.5, $enemy['id'], 'کمبو در برد');
        }
        if ($enemy && $can('focus_fire') && $ally && self::dist($enemy) < 12) {
            $push('focus_fire', 1.8 + $tw * 2, $enemy['id'], 'تمرکز آتش تیمی');
        }

        $resList = self::stableSort($w['resources'] ?? [], fn ($a, $b) => self::dist($a) <=> self::dist($b));
        $res = $resList[0] ?? null;
        if ($can('collect_resource')) {
            $need = isset($bot['resources']) && (float) ($bot['resources']['iron'] ?? 0) < 20 ? 1.2 : 0.6;
            $push('collect_resource', 0.9 + $eco * $need * 1.5 - self::dist($res) / 60, $res['id'] ?? null, 'جمع‌آوری منبع');
        }
        if ($can('mine_ores')) {
            $push('mine_ores', 0.8 + $eco * 1.6 - self::dist($res) / 80, $res['id'] ?? null, 'استخراج');
        }
        if ($can('loot_chest')) {
            $chests = self::stableSort(array_values(array_filter($w['chests'] ?? [], fn ($c) => empty($c['looted']))), fn ($a, $b) => self::dist($a) <=> self::dist($b));
            $chest = $chests[0] ?? null;
            if ($chest) {
                $push('loot_chest', 1.2 + $eco * 1.2 - self::dist($chest) / 50, $chest['id'], 'صندوق غارت‌نشده');
            }
        }
        if ($can('farm_resources')) {
            $push('farm_resources', 0.5 + $eco, null, 'فارم');
        }
        if ($can('eat_food') && $hp < 0.75 && (float) ($bot['inventory']['food'] ?? 0) > 0) {
            $push('eat_food', 2.2 - $hp, null, 'گرسنگی/جان');
        }
        if ($can('heal_golden_apple') && $hp < 0.6 && (float) ($bot['inventory']['golden_apple'] ?? 0) > 0) {
            $push('heal_golden_apple', 3 - $hp, null, 'جان کم + سیب طلایی');
        }
        if ($can('use_potion') && $hp < 0.55 && (float) ($bot['inventory']['potion'] ?? 0) > 0) {
            $push('use_potion', 2.6 - $hp, null, 'معجون');
        }

        if ($can('buy_item')) {
            $affordable = count($w['shop_affordable'] ?? []);
            $betterGear = (float) ($w['gear_gap'] ?? 0);
            $push('buy_item', 0.7 + $eco * 1.4 + $betterGear * 2 + min(1.2, $affordable * 0.2), null, $affordable . ' خرید ممکن');
        }
        if ($can('buy_upgrade')) {
            $push('buy_upgrade', 0.6 + $eco * 1.8 + ($losing ? 0.8 : 0), null, 'ارتقای تیمی');
        }
        if ($can('craft_gear')) {
            $push('craft_gear', 0.8 + $eco * 1.5 + (float) ($w['gear_gap'] ?? 0), null, 'ساخت ابزار');
        }
        if ($can('smelt_food')) {
            $push('smelt_food', 0.4 + $eco, null, 'پخت غذا');
        }
        if ($can('pick_kit')) {
            $push('pick_kit', 2.5 + ((float) ($w['elapsed_sec'] ?? 0) < 20 ? 2 : 0), null, 'انتخاب کیت');
        }

        if ($can('bridge_to_island')) {
            $islands = self::stableSort(array_values(array_filter($w['islands'] ?? [], fn ($i) => empty($i['owned_by_me']))), fn ($a, $b) => self::dist($a) <=> self::dist($b));
            $target = $islands[0] ?? null;
            $push('bridge_to_island', 0.9 + $build * 2 - self::dist($target) / 90, $target['id'] ?? null, 'پل به جزیره');
        }
        if ($can('build_side_bridge')) {
            $push('build_side_bridge', 0.7 + $build * 1.6, null, 'مسیر فرعی');
        }
        if ($can('build_fort')) {
            $push('build_fort', 0.5 + $build * 1.4 + ($losing ? 0.4 : 0), null, 'سنگر');
        }
        if ($can('build_base')) {
            $push('build_base', 0.6 + $build * 1.5, null, 'ساخت بیس');
        }
        if ($can('place_blocks')) {
            $push('place_blocks', 0.5 + $build * 2, null, 'ساخت‌وساز');
        }
        if ($can('add_detail')) {
            $push('add_detail', 0.3 + $build * 1.2, null, 'جزئیات');
        }
        if ($can('decorate')) {
            $push('decorate', 0.25 + $build, null, 'تزئین');
        }
        if ($can('choose_blueprint')) {
            $push('choose_blueprint', 3 + $build, null, 'انتخاب طرح');
        }
        if ($can('barricade_door')) {
            $push('barricade_door', 1.6 + $tw * 1.8 - (float) ($w['doors_broken'] ?? 0) * 0.3, null, 'سنگربندی');
        }
        if ($can('repair_wall')) {
            $push('repair_wall', 1.2 + $build, null, 'تعمیر');
        }

        if ($can('defend_bed')) {
            $bed = $w['objectives']['my_bed'] ?? null;
            $threatNearBed = (float) ($w['objectives']['bed_threat_dist'] ?? 999) < 18 ? 1 : 0;
            $push('defend_bed', 1.1 + $tw * 1.2 + $threatNearBed * 3 - (isset($bed['obsidian']) && $bed['obsidian'] ? 0.6 : 0), null, $threatNearBed ? 'تهدید نزدیک تخت' : 'محافظت تخت');
        }
        if ($can('place_obsidian') && empty($w['objectives']['my_bed']['obsidian']) && (float) ($bot['inventory']['obsidian'] ?? 0) > 0) {
            $push('place_obsidian', 2.4, null, 'ابسیدین روی تخت');
        }
        if ($can('set_trap') && empty($w['objectives']['my_trap'])) {
            $push('set_trap', 0.8 + $skill, null, 'تله');
        }
        if ($can('attack_enemy_base')) {
            $weakList = self::stableSort(array_values(array_filter($w['objectives']['enemy_beds'] ?? [], fn ($b) => empty($b['obsidian']))), fn ($a, $b) => self::dist($a) <=> self::dist($b));
            $weak = $weakList[0] ?? null;
            $weakTeam = $weak['team'] ?? null;
            $push('attack_enemy_base', 1.2 + $aggro * 1.6 - self::dist($weak) / 100 + ($timeLeft < 180 ? 1.5 : 0), $weak && $weakTeam ? (string) $weakTeam : null, $weak ? 'تخت بدون اابسیدین' : 'حمله به بیس');
        }
        if ($can('push_bridge')) {
            $push('push_bridge', 1.5 + $aggro * 1.4 - self::dist($enemy) / 60, $enemy['id'] ?? null, 'فشار روی پل');
        }
        if ($can('defend_goal')) {
            $push('defend_goal', 1 + $tw * 1.6 + ($losing ? 1 : 0), null, 'دفاع از دروازه');
        }
        if ($can('block_enemy_path')) {
            $push('block_enemy_path', 0.9 + $build + $aggro * 0.5, $enemy['id'] ?? null, 'بستن مسیر');
        }
        if ($can('goal')) {
            $push('goal', 3, null, 'گل');
        }

        if ($can('path_next_checkpoint')) {
            $d = (float) ($w['next_checkpoint_dist'] ?? 10);
            $push('path_next_checkpoint', 2.5 - $d / 60, $w['next_checkpoint_id'] ?? null, 'چک‌پوینت بعدی');
        }
        if ($can('path_to_safe_block')) {
            $push('path_to_safe_block', 2.2 - (float) ($w['unsafe_blocks_ahead'] ?? 0) * 0.2, null, 'بلوک امن');
        }
        if ($can('keep_moving')) {
            $push('keep_moving', 1.4, null, 'توقف = مرگ');
        }
        if ($can('avoid_falling_block')) {
            $push('avoid_falling_block', 1.8 - (float) ($w['blocks_left_ratio'] ?? 1) * 0.5, null, 'بلوک در حال ریزش');
        }
        if ($can('center_control')) {
            $push('center_control', 0.6 + ($timeLeft < 120 ? 1.2 : 0), null, 'مرکز نقشه');
        }
        if ($can('knock_nearest') && $enemy && self::dist($enemy) < 5) {
            $push('knock_nearest', 1 + $aggro, $enemy['id'], 'پرت کردن حریف');
        }
        if ($can('jump_timing')) {
            $push('jump_timing', 0.8 + $skill, null, 'زمان‌بندی پرش');
        }
        if ($can('sprint_control')) {
            $push('sprint_control', 0.7 + $skill, null, 'کنترل دویدن');
        }
        if ($can('recover_after_fall')) {
            $push('recover_after_fall', !empty($w['just_fell']) ? 3 : 0.1, null, 'بازگشت بعد سقوط');
        }

        if ($can('blend_with_crowd')) {
            $push('blend_with_crowd', 1 + ((float) ($params['deception'] ?? 0)) * 1.6, null, 'قاطی جمعیت');
        }
        if ($can('isolate_target')) {
            $sorted = self::stableSort($w['alive_enemies'] ?? [], fn ($a, $b) => (((float) ($a['nearby_allies'] ?? 0)) - ((float) ($b['nearby_allies'] ?? 0))) ?: (self::dist($a) - self::dist($b)));
            $target = $sorted[0] ?? null;
            $push('isolate_target', ($bot['role'] ?? '') === 'murderer' ? 2.2 + ((float) ($params['deception'] ?? 0)) * 2 - self::dist($target) / 40 : 0, $target['id'] ?? null, 'هدف تنها');
        }
        if ($can('collect_gold')) {
            $g = self::nearestByDist($w['gold'] ?? []);
            $push('collect_gold', 1 + $eco - self::dist($g) / 50, $g['id'] ?? null, 'طلای روی زمین');
        }
        if ($can('accuse')) {
            $push('accuse', 0.4 + ((float) ($params['deception'] ?? 0)) * 1.5 + (float) ($w['suspicion'] ?? 0), $w['suspect_id'] ?? null, 'اتهام');
        }
        if ($can('follow_suspect')) {
            $push('follow_suspect', 0.9 + $skill + (float) ($w['suspicion'] ?? 0) * 0.5, $w['suspect_id'] ?? null, 'تعقیب مشکوک');
        }
        if ($can('escape_chase')) {
            $push('escape_chase', !empty($w['being_chased']) ? 3.2 : 0.2, null, 'فرار از تعقیب');
        }
        if ($can('throw_bow')) {
            $push('throw_bow', !empty($w['has_bow']) ? 2.4 : 0, $enemy['id'] ?? null, 'کمان');
        }
        if ($can('fake_activity')) {
            $push('fake_activity', 0.5 + ((float) ($params['deception'] ?? 0)) * 1.4, null, 'فعالیت جعلی');
        }

        if ($can('dig_under_target') && $enemy) {
            $push('dig_under_target', 1.4 + $aggro * 1.4 - self::dist($enemy) / 25, $enemy['id'], 'کندن زیر حریف');
        }
        if ($can('dig_escape_path')) {
            $push('dig_escape_path', 0.8 + (float) ($w['holes_near'] ?? 0) * 0.3, null, 'مسیر فرار');
        }
        if ($can('avoid_holes')) {
            $push('avoid_holes', 1 + (float) ($w['holes_near'] ?? 0) * 0.4, null, 'دوری از سوراخ‌ها');
        }
        if ($can('throw_snowball') && $enemy && (float) ($bot['inventory']['snowball'] ?? 0) > 0) {
            $push('throw_snowball', 1 + $aggro, $enemy['id'], 'گلوله برفی');
        }
        if ($can('corner_opponent') && $enemy) {
            $push('corner_opponent', 0.9 + $skill, $enemy['id'], 'گوشه انداختن');
        }

        if ($can('hold_chokepoint')) {
            $push('hold_chokepoint', 1.3 + $tw * 1.5 - (float) ($w['zombie_pressure'] ?? 0) * 0.2, null, 'نقطهٔ گلوگاه');
        }
        if ($can('kite_zombies')) {
            $push('kite_zombies', 1 + ((float) ($w['zombie_pressure'] ?? 0) > 6 ? 1.5 : 0), null, 'کایت کردن');
        }
        if ($can('revive_teammate')) {
            $down = self::nearestByDist($w['downed_allies'] ?? []);
            $push('revive_teammate', $down ? 2.4 + $tw * 2 - self::dist($down) / 30 : 0, $down['id'] ?? null, $down ? 'یار افتاده' : '');
        }

        if ($can('throw_ender_pearl') && (float) ($bot['inventory']['ender_pearl'] ?? 0) > 0 && $enemy && self::dist($enemy) > 12 && self::dist($enemy) < 30) {
            $push('throw_ender_pearl', 1.2 + $aggro, $enemy['id'], 'اندرفرل');
        }
        if ($can('camp_high_ground')) {
            $push('camp_high_ground', 0.6 + (1 - $aggro) * 1.4 + ($timeLeft < 120 ? -1 : 0), null, 'ارتفاع');
        }
        if ($can('third_party_fight')) {
            $push('third_party_fight', !empty($w['fighting_nearby']) ? 1.6 + $aggro : 0.2, null, 'حمله به درگیری');
        }
        if ($can('avoid_strong')) {
            $push('avoid_strong', $enemy && (float) ($enemy['gear_score'] ?? 0) > (float) ($bot['gear_score'] ?? 0) * 1.4 ? 1.8 : 0.2, $enemy['id'] ?? null, 'حریف قوی‌تر');
        }
        if ($can('rotate_border')) {
            $push('rotate_border', !empty($w['border_close']) ? 2.2 : 0.3, null, 'چرخش به مرکز');
        }
        if ($can('avoid_border')) {
            $push('avoid_border', !empty($w['border_close']) ? 2.2 : 0.3, null, 'دوری از بوردر');
        }
        if ($can('ambush')) {
            $push('ambush', 0.7 + $aggro * 0.8 + (1 - $skill) * -0.3, null, 'کمین');
        }

        if ($can('claim_chunk')) {
            $push('claim_chunk', 1 + $tw - (float) ($w['claimed_chunks'] ?? 0) * 0.05, null, 'ادعا');
        }
        if ($can('raid_enemy_base')) {
            $push('raid_enemy_base', 0.9 + $aggro * 1.6 - (float) ($w['enemy_power_gap'] ?? 0) * 0.4, null, 'غارت');
        }
        if ($can('defend_claim')) {
            $push('defend_claim', 1 + $tw + (float) ($w['under_raid'] ?? 0) * 2, null, 'دفاع از ادعا');
        }
        if ($can('recruit')) {
            $push('recruit', 0.3, null, 'یارگیری');
        }

        if ($can('vote_for_build')) {
            $push('vote_for_build', !empty($w['voting_phase']) ? 3 : 0, $w['best_build_id'] ?? null, 'رای');
        }

        if ($can('bow_pressure') && (float) ($bot['inventory']['arrow'] ?? 0) > 0 && $enemy && self::dist($enemy) > 6) {
            $push('bow_pressure', 1.3 + $skill, $enemy['id'], 'فشار با کمان');
        }
        if ($can('w_combo') && $enemy && self::dist($enemy) < 5) {
            $push('w_combo', 1.6 + $skill * 2, $enemy['id'], 'W-combo');
        }
        if ($can('block_corner') && $enemy) {
            $push('block_corner', 0.8 + $skill, $enemy['id'], 'گوشه');
        }
        if ($can('strafe_combat') && $enemy && self::dist($enemy) < 8) {
            $push('strafe_combat', 1.2 + (float) ($params['strafe_quality'] ?? 0.4), $enemy['id'], 'استریف');
        }
        if ($can('respawn_attack')) {
            $push('respawn_attack', !empty($w['just_respawned']) ? 2 : 0.4, null, 'حمله بعد ریسپاون');
        }
        if ($can('team_up_push')) {
            $push('team_up_push', 1 + $tw * 1.6 + ($losing ? 1.2 : 0), null, 'حملهٔ هماهنگ');
        }

        return self::stableSort($out, fn ($a, $b) => $b['score'] <=> $a['score']);
    }

    /** تصمیم نهایی مغز محلی با نویز متناسب با (۱ − مهارت) */
    public static function heuristicDecide(array $ctx): array
    {
        $scored = self::scoreActions($ctx);
        if (!$scored) {
            return ['action' => 'idle', 'target' => null, 'score' => 0, 'why' => 'هیچ عمل مجازی نیست', 'source' => 'heuristic', 'confidence' => 0];
        }
        $skill = RngCore::clamp((float) ($ctx['params']['skill'] ?? 0.3), 0, 1);
        $rng = $ctx['rng'] ?? null;
        $mistakeRate = RngCore::clamp((float) ($ctx['params']['mistake_rate'] ?? 0.1), 0, 0.5);

        $chosen = $scored[0];
        if ($rng && $rng->chance($mistakeRate) && count($scored) > 1) {
            $chosen = $scored[min(count($scored) - 1, $rng->int(1, 3))];
        } elseif ($rng && count($scored) > 1) {
            $spread = (1 - $skill) * 0.9;
            $noisy = [];
            foreach ($scored as $i => $c) {
                $noisy[] = array_merge($c, ['n' => $c['score'] + ($rng->gauss() * $spread * (1 + $i * 0.15))]);
            }
            $noisy = self::stableSort($noisy, fn ($a, $b) => $b['n'] <=> $a['n']);
            $found = null;
            foreach ($scored as $c) {
                if ($c['action'] === $noisy[0]['action'] && $c['target'] === $noisy[0]['target']) {
                    $found = $c;
                    break;
                }
            }
            $chosen = $found ?? $scored[0];
        }
        return [
            'action' => $chosen['action'],
            'target' => $chosen['target'],
            'score' => $chosen['score'],
            'why' => $chosen['why'],
            'source' => 'heuristic',
            'confidence' => Bits::roundTo(RngCore::clamp($chosen['score'] / 4, 0, 1), 2),
            'alternatives' => array_map(fn ($s) => ['action' => $s['action'], 'score' => $s['score']], array_slice($scored, 0, 4)),
        ];
    }

    /** @param array $decision @param array $params @param Rng|null $rng */
    public static function humanizeAction(array $decision, array $params, ?Rng $rng): array
    {
        $p = $params;
        $reaction = $rng ? $rng->int($p['reaction_ms']['min'] ?? 300, $p['reaction_ms']['max'] ?? 600) : 400;
        $aimError = $rng ? abs($rng->normal(0, ((float) ($p['aim_error_deg']['max'] ?? 8)) / 2)) : 4;
        $fumble = $rng ? $rng->chance($p['mistake_rate'] ?? 0.1) : false;
        $out = $decision;
        $out['reaction_ms'] = $reaction;
        $out['aim_error_deg'] = Bits::roundTo($aimError, 1);
        $out['fumble'] = $fumble;
        $out['fumble_kind'] = $fumble ? ($rng ? $rng->pick(['miss_click', 'wrong_direction', 'late_jump', 'drop_item']) : 'miss_click') : null;
        $chatP = !empty($p['chat_enabled']) && $rng;
        $out['should_chat'] = $chatP ? $rng->chance((($p['chat_per_min'] ?? 2) / 60) / max(1, $p['decision_hz'] ?? 5)) : false;
        return $out;
    }

    /** هش FNV-1a از وضعیت (کش تصمیم‌های یکسان) — مثل stateHash */
    public static function stateHash(array $ctx): string
    {
        $w = $ctx['world'] ?? [];
        $b = $ctx['bot'] ?? [];
        $enemies = array_map(fn ($e) => $e['id'] . ':' . Bits::jsRound(self::dist($e) / 3), $w['alive_enemies'] ?? []);
        $parts = [
            $ctx['mode']['id'] ?? null,
            $ctx['tier'] ?? null,
            Bits::jsRound(((float) ($w['elapsed_sec'] ?? 0)) / 5) * 5,
            Bits::jsRound((float) ($b['hp'] ?? 0)),
            implode(',', $enemies),
            self::jsJson($w['scores'] ?? []),
            self::jsJson($w['objectives']['beds'] ?? $w['objectives']['goals'] ?? []),
        ];
        $s = implode('|', array_map(fn ($x) => is_bool($x) ? ($x ? 'true' : 'false') : (string) $x, $parts));
        $h = 2166136261.0;
        $len = strlen($s);
        for ($i = 0; $i < $len; $i++) {
            $h = Bits::bxor($h, (float) ord($s[$i]));
            $h = Bits::imul($h, 16777619);
        }
        return base_convert(sprintf('%.0f', Bits::u32($h)), 10, 36);
    }

    /**
     * json_encode با رفتار جاوااسکریپت: آبجکت خالی → {} نه []
     * (ترتیب کلیدها مثل JSON.stringify از ترتیب درج پی‌اچ‌پی پیروی می‌کند)
     */
    public static function jsJson(mixed $v): string
    {
        $conv = function ($x) use (&$conv) {
            if (is_array($x)) {
                if ($x === []) {
                    return new \stdClass();
                }
                $isList = array_keys($x) === range(0, count($x) - 1);
                $out = [];
                foreach ($x as $k => $val) {
                    $out[$k] = $conv($val);
                }
                return $isList ? array_values($out) : $out;
            }
            return $x;
        };
        return json_encode($conv($v), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }

    /** @param array $ctx @param array $budget */
    public static function shouldConsultLlm(array $ctx, array $budget): bool
    {
        $tier = $ctx['tier'] ?? null;
        $interval = (float) ($ctx['mode']['bot']['llm_interval_sec'][$tier] ?? 0);
        if (!$interval || empty($budget['llm_enabled'])) {
            return false;
        }
        $elapsed = (float) ($ctx['world']['elapsed_sec'] ?? 0);
        $last = (float) ($budget['last_call_sec'] ?? -1e9);
        if ($elapsed - $last < $interval) {
            return false;
        }
        if ((float) ($budget['used'] ?? 0) >= (float) ($budget['allowed'] ?? 0)) {
            return false;
        }
        $h = self::stateHash($ctx);
        if (!empty($budget['cache'][$h])) {
            return false;
        }
        return true;
    }

    /** ادغام نتیجهٔ ابری با مغز محلی */
    public static function mergeDecisions(array $local, ?array $cloud): array
    {
        if (empty($cloud['ok'])) {
            return array_merge($local, ['cloud_used' => false]);
        }
        $d = $cloud['decision'];
        if (($d['action'] ?? '') === 'idle') {
            return array_merge($local, ['cloud_used' => true]);
        }
        $out = $d;
        $out['alternatives'] = $local['alternatives'] ?? [];
        $out['cloud_used'] = true;
        $out['local_action'] = $local['action'];
        return $out;
    }
}
