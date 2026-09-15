<?php
// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — Engine/BotTier.php (پورت دقیق shared/engine/bottier.js)
//  سطح هوش بات از ELO/لول/رنک بازیکنان واقعیِ حاضر در مچ محاسبه می‌شود.
// ═══════════════════════════════════════════════════════════════════
declare(strict_types=1);

namespace NovaEdge\Engine;

final class BotTier
{
    public const TIER_THRESHOLDS = [
        ['tier' => 'T0', 'min' => 0.0],
        ['tier' => 'T1', 'min' => 0.22],
        ['tier' => 'T2', 'min' => 0.42],
        ['tier' => 'T3', 'min' => 0.62],
        ['tier' => 'T4', 'min' => 0.8],
    ];

    public const MODE_TIER_CAP = [
        'tntrun' => 'T2',
        'parkour' => 'T2',
        'spleef' => 'T3',
        'buildbattle' => 'T4',
        'factions' => 'T3',
    ];

    public const TIER_ORDER = ['T0', 'T1', 'T2', 'T3', 'T4'];

    public static function tierIndex(string $id): int
    {
        return max(0, (int) array_search($id, self::TIER_ORDER, true));
    }

    /** @param array $tiersSpec */
    public static function tierById(array $tiersSpec, string $id): ?array
    {
        $list = $tiersSpec['tiers'] ?? $tiersSpec;
        foreach ($list as $t) {
            if (($t['id'] ?? '') === $id) {
                return $t;
            }
        }
        return $list[0] ?? null;
    }

    public static function shiftTier(string $id, int|float $delta, string $capId = 'T4', string $floorId = 'T0'): string
    {
        $i = (int) RngCore::clamp(self::tierIndex($id) + (float) $delta, self::tierIndex($floorId), self::tierIndex($capId));
        return self::TIER_ORDER[$i];
    }

    public static function maxTier(string $a, string $b): string
    {
        return self::tierIndex($a) >= self::tierIndex($b) ? $a : $b;
    }

    public static function tierForSkill(float|int $skill): string
    {
        $out = 'T0';
        foreach (self::TIER_THRESHOLDS as $t) {
            if ((float) $skill >= $t['min']) {
                $out = $t['tier'];
            }
        }
        return $out;
    }

    /** @param array $values */
    public static function percentile(array $values, float $p): float
    {
        $list = array_map(fn ($v) => (float) $v, $values);
        sort($list, SORT_NUMERIC);
        if (!$list) {
            return 0.0;
        }
        $idx = (int) RngCore::clamp(Bits::jsRound($p * (count($list) - 1)), 0, count($list) - 1);
        return $list[$idx];
    }

    /** @param array $p بازیکن، @param array $ranks */
    public static function playerSkill(array $p = [], array $ranks = []): float
    {
        $rank = ['index' => 0, 'bot_skill_bias' => 0];
        foreach ($ranks as $r) {
            if (($r['id'] ?? '') === ($p['rank_id'] ?? $p['rank'] ?? '')) {
                $rank = $r;
                break;
            }
        }
        return Elo::skillIndex([
            'rating' => $p['rating'] ?? $p['elo'] ?? 1000,
            'level' => $p['level'] ?? 1,
            'rank_index' => $p['rank_index'] ?? $rank['index'] ?? 0,
            'games' => $p['games'] ?? $p['games_played'] ?? 0,
            'bias' => $p['rank_bias'] ?? $rank['bot_skill_bias'] ?? 0,
        ]);
    }

    /**
     * انتخاب سطح پایهٔ بات‌ها برای یک مچ
     * @param array $o {mode, players, tiersSpec, ranks, settings}
     */
    public static function chooseMatchTier(array $o = []): array
    {
        $mode = $o['mode'] ?? [];
        $tiersSpec = $o['tiersSpec'] ?? ['tiers' => []];
        $ranks = $o['ranks'] ?? [];
        $settings = $o['settings'] ?? [];
        $players = $o['players'] ?? [];
        $humans = array_values(array_filter($players, fn ($p) => empty($p['is_bot'])));
        $reasons = [];

        $force = $settings['force_tier'] ?? null;
        if ($force && self::tierIndex((string) $force) >= 0) {
            return [
                'tier' => $force,
                'tier_def' => self::tierById($tiersSpec, (string) $force),
                'model' => null,
                'skill_human' => 0,
                'human_count' => count($humans),
                'reasons' => ['force_tier از تنظیمات ادمین'],
                'escalated_from' => null,
            ];
        }

        $skills = array_map(fn ($p) => self::playerSkill($p, $ranks), $humans);
        $useMax = in_array($mode['id'] ?? '', ['duels', 'thebridge'], true);
        if (!$skills) {
            $stat = 0.0;
        } elseif ($useMax) {
            $stat = max($skills);
        } else {
            $stat = self::percentile($skills, ($mode['category'] ?? '') === 'coop' ? 0.5 : 0.75);
        }
        $tier = self::tierForSkill($stat);

        $rankFloor = 'T0';
        foreach ($humans as $p) {
            foreach ($ranks as $r) {
                if (($r['id'] ?? '') === ($p['rank_id'] ?? $p['rank'] ?? '')) {
                    if (!empty($r['bot_min_tier'])) {
                        $rankFloor = self::maxTier($rankFloor, (string) $r['bot_min_tier']);
                    }
                    break;
                }
            }
        }
        if (self::tierIndex($rankFloor) > self::tierIndex($tier)) {
            $reasons[] = "رنک بازیکن حاضر کف سطح را به {$rankFloor} برد";
            $tier = $rankFloor;
        }

        $cap = self::MODE_TIER_CAP[$mode['id'] ?? ''] ?? 'T4';
        if (self::tierIndex($tier) > self::tierIndex($cap)) {
            $reasons[] = "سقف مود {$mode['id']} سطح را به {$cap} محدود کرد";
            $tier = $cap;
        }
        if (!empty($settings['max_tier']) && self::tierIndex($tier) > self::tierIndex((string) $settings['max_tier'])) {
            $tier = (string) $settings['max_tier'];
        }

        $llmEnabled = ($settings['llm_enabled'] ?? true) !== false && ($settings['llm_enabled'] ?? true) !== '0';
        if (!$llmEnabled) {
            $reasons[] = 'LLM غیرفعال: تصمیم‌ها فقط از درخت رفتار محلی می‌آیند';
        }

        $esc = $tiersSpec['escalation'] ?? [];
        $startOffset = (float) ($esc['start_offset'] ?? (!empty($mode['match']['duration_sec']) ? -1 : 0));
        $startTier = !empty($mode['match']['duration_sec']) ? self::shiftTier($tier, $startOffset, $tier) : $tier;
        if ($startTier !== $tier) {
            $reasons[] = "شروع از {$startTier} و ترفیع تدریجی تا {$tier} در طول مچ";
        }

        $tierDef = self::tierById($tiersSpec, $tier);
        return [
            'tier' => $tier,
            'start_tier' => $startTier,
            'tier_def' => $tierDef,
            'start_tier_def' => self::tierById($tiersSpec, $startTier),
            'model' => $llmEnabled && $tierDef ? ($tierDef['model'] ?? null) : null,
            'llm_enabled' => $llmEnabled && !empty($tierDef['llm_enabled']),
            'skill_human' => Bits::roundTo($stat, 3),
            'human_count' => count($humans),
            'bot_count' => count($players) - count($humans),
            'reasons' => $reasons,
            'cap' => $cap,
        ];
    }

    /** ترفیع تدریجی در طول مچ + rubber-band */
    public static function tierAtTime(string $baseTier, string $startTier, array $o = []): array
    {
        $esc = $o['escalation'] ?? [];
        $steps = $esc['ramp_steps'] ?? [];
        $duration = max(1, (float) ($o['duration_sec'] ?? 0));
        $elapsed = RngCore::clamp((float) ($o['elapsed_sec'] ?? 0), 0, $duration);
        $pct = ($elapsed / $duration) * 100;

        $rb = $esc['comeback_rubbery'] ?? [];
        $humanShare = isset($o['human_score_share']) ? (float) $o['human_score_share'] : null;
        $extra = 0;
        if (!empty($rb['enabled']) && $humanShare !== null && is_finite($humanShare)) {
            if ($humanShare <= ($rb['crushed_threshold'] ?? 0.25)) {
                return ['tier' => $startTier ?: $baseTier, 'delta' => 0, 'reason' => 'انسان‌ها عقب‌اند → ترفیع متوقف (rubber-band)'];
            }
            if ($humanShare >= ($rb['dominating_threshold'] ?? 0.65)) {
                $extra = 1;
            }
        }

        $delta = 0;
        foreach ($steps as $s) {
            if ($pct >= ((float) ($s['at_pct_of_duration'] ?? 0)) + ($extra ? -8 : 0)) {
                $delta += (int) ($s['delta'] ?? 0);
            }
        }
        $tier = self::shiftTier($startTier ?: $baseTier, $delta, $baseTier);
        return ['tier' => $tier, 'delta' => $delta, 'reason' => $delta ? Bits::jsRound($pct) . '% از مچ → +' . $delta . ' سطح' : 'بدون ترفیع'];
    }

    /** پارامترهای انسانی‌شدهٔ یک بات مشخص */
    public static function humanizeBot(array $tierDef, int $botSeed, array $o = []): array
    {
        $hum = $o['humanization'] ?? [];
        $jitter = (float) ($hum['per_bot_jitter'] ?? 0.18);
        $r = (($botSeed ?: 1) % 1000) / 1000;
        $j = function (float|int|null $v, bool $inv = false) use ($r, $jitter): float {
            $n = (float) ($v ?: 0);
            $f = 1 + ($r - 0.5) * 2 * $jitter * ($inv ? -1 : 1);
            return Bits::roundTo($n * $f, 3);
        };
        $elapsed = (float) ($o['elapsed_sec'] ?? 0);
        $fatigue = 0.0;
        if (!empty($hum['fatigue']['enabled']) && $elapsed > (float) ($hum['fatigue']['skill_decay_after_sec'] ?? 420)) {
            $decay = (float) ($hum['fatigue']['decay'] ?? 0.06);
            $fatigue = min($decay, (($elapsed - 420) / 600) * $decay);
        }
        $skill = RngCore::clamp(((float) ($tierDef['skill'] ?? 0.2)) - $fatigue + (float) ($o['rank_bias'] ?? 0), 0, 1);
        return [
            'skill' => Bits::roundTo($skill, 3),
            'reaction_ms' => [
                'min' => Bits::jsRound($j($tierDef['reaction_ms']['min'] ?? 400, true)),
                'max' => Bits::jsRound($j($tierDef['reaction_ms']['max'] ?? 700, true)),
            ],
            'aim_error_deg' => [
                'min' => Bits::roundTo($j($tierDef['aim_error_deg']['min'] ?? 5, true), 1),
                'max' => Bits::roundTo($j($tierDef['aim_error_deg']['max'] ?? 12, true), 1),
            ],
            'mistake_rate' => RngCore::clamp($j($tierDef['mistake_rate'] ?? 0.1, true), 0.01, 0.5),
            'bridge_quality' => RngCore::clamp($j($tierDef['bridge_quality'] ?? 0.5), 0, 1),
            'combo_chance' => RngCore::clamp($j($tierDef['combo_chance'] ?? 0.2), 0, 1),
            'strafe_quality' => RngCore::clamp($j($tierDef['strafe_quality'] ?? 0.4), 0, 1),
            'teamwork' => RngCore::clamp($j($tierDef['teamwork'] ?? 0.3), 0, 1),
            'retreat_hp' => RngCore::clamp($j($tierDef['retreat_hp'] ?? 0.25), 0, 0.6),
            'build_skill' => RngCore::clamp($j($tierDef['build_skill'] ?? 0.3), 0, 1),
            'deception' => RngCore::clamp($j($tierDef['deception'] ?? 0, true), 0, 1),
            'resource_efficiency' => RngCore::clamp($j($tierDef['resource_efficiency'] ?? 0.5), 0, 1),
            'decision_hz' => max(1, Bits::jsRound($j($tierDef['decision_hz'] ?? 5))),
            'fatigue' => $fatigue,
            'chat_enabled' => self::tierIndex((string) ($tierDef['id'] ?? '')) >= self::tierIndex((string) ($hum['chat']['enabled_from_tier'] ?? 'T2')),
            'chat_per_min' => min(2, (float) ($hum['chat']['messages_per_min_max'] ?? 2)),
        ];
    }

    /** بودجهٔ فراخوانی LLM (محافظ هزینه) */
    public static function llmBudget(array $tierDef, array $modeSpec, int $botCount, array $guard = []): array
    {
        $perMatch = (float) ($guard['max_llm_calls_per_match'] ?? 0) ?: 400;
        $perBot = (float) ($guard['max_llm_calls_per_bot_per_match'] ?? 0) ?: 90;
        $interval = (float) ($modeSpec['bot']['llm_interval_sec'][$tierDef['id'] ?? ''] ?? 0);
        $duration = (float) ($modeSpec['match']['duration_sec'] ?? 0);
        $theoretical = $interval > 0 && $duration > 0 ? (int) floor($duration / $interval) * $botCount : 0;
        $capped = min($theoretical, $perBot * $botCount, $perMatch);
        return [
            'interval_sec' => $interval,
            'per_bot' => $perBot,
            'per_match' => $perMatch,
            'theoretical' => $theoretical,
            'allowed' => $capped,
            'llm_used' => $capped > 0,
        ];
    }
}
