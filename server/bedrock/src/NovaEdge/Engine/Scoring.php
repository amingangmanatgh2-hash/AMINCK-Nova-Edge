<?php
// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — Engine/Scoring.php (پورت دقیق shared/engine/scoring.js)
// ═══════════════════════════════════════════════════════════════════
declare(strict_types=1);

namespace NovaEdge\Engine;

final class Scoring
{
    private const EVENT_KEYS = [
        'kill', 'death', 'final_kill', 'final_death', 'bed_break', 'bed_defend', 'assist',
        'resource_collected', 'purchase', 'team_upgrade', 'chest_looted', 'blocks_broken',
        'blocks_placed', 'player_eliminated', 'checkpoint', 'fall', 'goal', 'vote_received',
        'gold_collected', 'wave_cleared', 'revive', 'door_built', 'diamond_mined', 'gold_mined',
        'apple_eaten', 'chunk_claimed', 'raid_success', 'raid_defend', 'power_gained', 'innocent_survive',
        'murderer_win', 'detective_kill_murderer', 'finish',
    ];

    /** @param array $events [{type, count|value}] */
    public static function tallyEvents(array $events = []): array
    {
        $t = [];
        foreach ($events as $e) {
            if (!$e || empty($e['type'])) {
                continue;
            }
            $n = (float) ($e['count'] ?? $e['value'] ?? 1) ?: 0;
            $t[$e['type']] = ($t[$e['type']] ?? 0) + $n;
        }
        return $t;
    }

    public static function parkourSpeedBonus(float|int $finishSec, float|int $parSec, float|int $maxBonus): int
    {
        $f = (float) $finishSec;
        $p = (float) $parSec;
        $cap = (float) $maxBonus;
        if (!$f || !$p || !$cap) {
            return 0;
        }
        if ($f >= $p) {
            return 0;
        }
        $ratio = RngCore::clamp(($p - $f) / $p, 0, 1);
        return Bits::jsRound($cap * $ratio);
    }

    /**
     * کارنامهٔ یک بازیکن — دقیقاً مثل computePlayerResult در scoring.js
     * @param array $o {mode, events, won, placement, players, duration_sec, afk_pct, rank, finish_sec, par_sec, mvp, elo_delta}
     */
    public static function computePlayerResult(array $o = []): array
    {
        $mode = $o['mode'] ?? [];
        $sc = $mode['scoring'] ?? [];
        $eco = $mode['economy'] ?? [];
        $events = self::tallyEvents($o['events'] ?? []);
        $won = !empty($o['won']);
        $players = max(1, (int) ($o['players'] ?? 1));
        $placement = (int) RngCore::clamp((float) ($o['placement'] ?? 0) ?: ($won ? 1 : $players), 1, $players);
        $duration = max(0, (float) ($o['duration_sec'] ?? 0));
        $afk = RngCore::clamp((float) ($o['afk_pct'] ?? 0), 0, 100);
        $rank = $o['rank'] ?? ['coin_multiplier' => 1, 'xp_multiplier' => 1];

        $breakdown = [];
        $points = 0.0;
        $add = function (string $label, string $key, float $mult = 1.0) use (&$points, &$breakdown, $sc, $events): void {
            $per = (float) ($sc[$key] ?? 0);
            $cnt = $events[$key] ?? null;
            if (!$per || $cnt === null) {
                return;
            }
            $v = Bits::jsRound($per * $cnt * $mult);
            if ($v) {
                $points += $v;
                $breakdown[] = ['label' => $label, 'key' => $key, 'count' => $cnt, 'each' => $per, 'value' => $v];
            }
        };

        foreach (self::EVENT_KEYS as $k) {
            $add($k, $k);
        }

        if ($won && !empty($sc['win'])) {
            $points += $sc['win'];
            $breakdown[] = ['label' => 'win', 'key' => 'win', 'count' => 1, 'each' => $sc['win'], 'value' => $sc['win']];
        } elseif (!$won && !empty($sc['lose'])) {
            $points += $sc['lose'];
            $breakdown[] = ['label' => 'lose', 'key' => 'lose', 'count' => 1, 'each' => $sc['lose'], 'value' => $sc['lose']];
        }

        if (!empty($sc['survive_min'])) {
            $mins = (int) floor($duration / 60);
            if ($mins > 0) {
                $v = $sc['survive_min'] * $mins;
                $points += $v;
                $breakdown[] = ['label' => 'survive_min', 'key' => 'survive_min', 'count' => $mins, 'each' => $sc['survive_min'], 'value' => $v];
            }
        }

        foreach (['killstreak_5', 'killstreak_10'] as $k) {
            if (!empty($sc[$k]) && !empty($events[$k])) {
                $points += $sc[$k] * $events[$k];
                $breakdown[] = ['label' => $k, 'key' => $k, 'count' => $events[$k], 'each' => $sc[$k], 'value' => $sc[$k] * $events[$k]];
            }
        }
        if (!empty($sc['streak_bonus']) && !empty($events['best_streak'])) {
            $v = $sc['streak_bonus'] * max(0, (float) $events['best_streak'] - 1);
            if ($v > 0) {
                $points += $v;
                $breakdown[] = ['label' => 'streak_bonus', 'key' => 'streak_bonus', 'count' => $events['best_streak'], 'each' => $sc['streak_bonus'], 'value' => $v];
            }
        }

        if (($mode['id'] ?? '') === 'parkour' && !empty($o['finish_sec'])) {
            $bonus = self::parkourSpeedBonus($o['finish_sec'], $o['par_sec'] ?? 180, $sc['speed_bonus_max'] ?? 0);
            if ($bonus > 0) {
                $points += $bonus;
                $breakdown[] = ['label' => 'speed_bonus', 'key' => 'speed_bonus', 'count' => 1, 'each' => $bonus, 'value' => $bonus];
            }
        }

        if (!empty($sc['perfect_win_bonus']) && $won && empty($events['death']) && empty($events['fall'])) {
            $points += $sc['perfect_win_bonus'];
            $breakdown[] = ['label' => 'perfect_win', 'key' => 'perfect_win_bonus', 'count' => 1, 'each' => $sc['perfect_win_bonus'], 'value' => $sc['perfect_win_bonus']];
        }

        if (!empty($sc['theme_match_bonus']) && !empty($events['theme_match'])) {
            $points += $sc['theme_match_bonus'];
            $breakdown[] = ['label' => 'theme_match', 'key' => 'theme_match_bonus', 'count' => 1, 'each' => $sc['theme_match_bonus'], 'value' => $sc['theme_match_bonus']];
        }

        if (!empty($o['mvp']) && !empty($sc['mvp_bonus'])) {
            $points += $sc['mvp_bonus'];
            $breakdown[] = ['label' => 'mvp', 'key' => 'mvp_bonus', 'count' => 1, 'each' => $sc['mvp_bonus'], 'value' => $sc['mvp_bonus']];
        }

        // ── سکه ──
        $coins = 0.0;
        foreach ($eco as $k => $per) {
            if (str_starts_with((string) $k, 'xp_')) {
                continue;
            }
            $per = (float) $per;
            if (!$per) {
                continue;
            }
            if ($k === 'win') {
                if ($won) {
                    $coins += $per;
                }
                continue;
            }
            if ($k === 'lose') {
                if (!$won) {
                    $coins += $per;
                }
                continue;
            }
            if ($k === 'survive_min') {
                $coins += $per * floor($duration / 60);
                continue;
            }
            if (array_key_exists($k, $events)) {
                $coins += $per * $events[$k];
            }
        }
        if (!empty($o['mvp']) && !empty($eco['mvp_bonus'])) {
            $coins += $eco['mvp_bonus'];
        }

        // ── XP ──
        $xp = 0.0;
        if ($won && !empty($eco['xp_win'])) {
            $xp += $eco['xp_win'];
        }
        if (!empty($eco['xp_kill']) && !empty($events['kill'])) {
            $xp += $eco['xp_kill'] * $events['kill'];
        }
        $xp += floor(max(0, $points) / 20);

        $coinMult = (float) ($rank['coin_multiplier'] ?? 1) ?: 1;
        $xpMult = (float) ($rank['xp_multiplier'] ?? 1) ?: 1;
        $coins = Bits::jsRound($coins * $coinMult);
        $xp = Bits::jsRound($xp * $xpMult);

        // ── ضدسوءاستفاده ──
        $flags = [];
        $eligible = $duration >= 120 || in_array($mode['id'] ?? '', ['kitpvp', 'factions'], true);
        if (!$eligible) {
            $flags[] = 'too_short';
        }
        if ($afk > 60) {
            $flags[] = 'afk';
        }
        if (!empty($events['death']) && empty($events['kill']) && $afk > 40) {
            $flags[] = 'farm_suspect';
        }
        $rewarded = $eligible && $afk <= 60;
        if (!$rewarded) {
            $coins = min($coins, 10);
            $xp = min($xp, 10);
        }

        $points = (float) Bits::jsRound($points);
        return [
            'mode' => $mode['id'] ?? null,
            'won' => $won,
            'placement' => $placement,
            'points' => $rewarded ? $points : max(0, min($points, 20)),
            'points_raw' => $points,
            'coins' => $coins,
            'xp' => $xp,
            'rp' => Elo::rankPointsFrom($rewarded ? $points : 0, (float) ($o['elo_delta'] ?? 0)),
            'breakdown' => $breakdown,
            'flags' => $flags,
            'rewarded' => $rewarded,
        ];
    }

    /** @param array $results */
    public static function pickMvp(array $results = []): ?string
    {
        $best = null;
        foreach ($results as $r) {
            if (!empty($r['is_bot'])) {
                continue;
            }
            if ($best === null) {
                $best = $r;
                continue;
            }
            $a = (float) ($r['points'] ?? 0);
            $b = (float) ($best['points'] ?? 0);
            if ($a > $b) {
                $best = $r;
            } elseif ($a === $b && (float) ($r['kills'] ?? 0) > (float) ($best['kills'] ?? 0)) {
                $best = $r;
            }
        }
        return $best ? $best['id'] : null;
    }
}
