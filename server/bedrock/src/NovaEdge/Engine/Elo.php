<?php
// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — Engine/Elo.php  (پورت دقیق shared/engine/elo.js)
//  تست: server/bedrock/tests/parity.php با shared/testvectors.json
// ═══════════════════════════════════════════════════════════════════
declare(strict_types=1);

namespace NovaEdge\Engine;

final class Elo
{
    public const FLOOR = 100;
    public const CAP = 4000;
    public const START = 1000;
    public const PROVISIONAL_GAMES = 10;
    public const PROVISIONAL_K_MULT = 1.5;
    public const HIGH_RATING = 2200;
    public const HIGH_K_MULT = 0.75;
    public const VERY_HIGH_RATING = 2600;
    public const VERY_HIGH_K_MULT = 0.6;
    public const DECAY_AFTER_DAYS = 21;
    public const DECAY_PER_WEEK = 8;
    public const DECAY_MIN_RATING = 1400;

    public static function expectedScore(float|int $ratingA, float|int $ratingB): float
    {
        $a = (float) ($ratingA ?: self::START);
        $b = (float) ($ratingB ?: self::START);
        return 1 / (1 + 10 ** (($b - $a) / 400));
    }

    /** @param array $ratings */
    public static function teamRating(array $ratings): float
    {
        $list = [];
        foreach ($ratings as $r) {
            $n = (float) ($r ?: self::START);
            if (is_finite($n)) {
                $list[] = $n;
            }
        }
        if (!$list) {
            return (float) self::START;
        }
        return array_sum($list) / count($list);
    }

    public static function effectiveK(float|int $baseK, int $gamesPlayed, float|int $rating): float
    {
        $k = max(4, (float) ($baseK ?: 24));
        if ($gamesPlayed < self::PROVISIONAL_GAMES) {
            $k *= self::PROVISIONAL_K_MULT;
        }
        if ($rating >= self::VERY_HIGH_RATING) {
            $k *= self::VERY_HIGH_K_MULT;
        } elseif ($rating >= self::HIGH_RATING) {
            $k *= self::HIGH_K_MULT;
        }
        return Bits::roundTo($k, 2);
    }

    public static function placementScore(float|int $place, int $playerCount): float
    {
        $p = RngCore::clamp((float) ($place ?: 1), 1, max(1, $playerCount));
        $n = max(2, $playerCount);
        return ($n - $p) / ($n - 1);
    }

    /** @param array $o {rating, opponentRating, baseK, gamesPlayed, score} */
    public static function eloDelta(array $o = []): array
    {
        $rating = RngCore::clamp((float) ($o['rating'] ?? 0) ?: self::START, self::FLOOR, self::CAP);
        $opp = RngCore::clamp((float) ($o['opponentRating'] ?? 0) ?: self::START, self::FLOOR, self::CAP);
        $e = self::expectedScore($rating, $opp);
        $s = RngCore::clamp((float) ($o['score'] ?? 0), 0, 1);
        $k = self::effectiveK($o['baseK'] ?? 24, (int) ($o['gamesPlayed'] ?? 0), $rating);
        $delta = Bits::jsRound($k * ($s - $e));
        return [
            'delta' => $delta,
            'expected' => Bits::roundTo($e, 4),
            'k' => $k,
            'rating' => RngCore::clamp($rating + $delta, self::FLOOR, self::CAP),
        ];
    }

    /**
     * @param array $mode  آبجکت مود (gamemodes.json)
     * @param array $players
     * @param array $placements
     * @param array|null $teams  [{index, players:[{id}]}]
     */
    public static function settleMatch(array $mode, array $players, array $placements = [], ?array $teams = null): array
    {
        $baseK = (float) ($mode['match']['elo_k'] ?? 0) ?: 24;
        $category = (string) ($mode['category'] ?? 'ffa');
        $humans = array_values(array_filter($players, fn ($p) => empty($p['is_bot'])));
        $n = count($players);

        $teamOf = [];
        $teamRatingOf = [];
        if (is_array($teams) && count($teams) > 1) {
            foreach ($teams as $t) {
                $ids = array_map(fn ($p) => (string) ($p['id'] ?? $p), $t['players'] ?? []);
                $list = array_values(array_filter($players, fn ($p) => in_array((string) ($p['id'] ?? ''), $ids, true)));
                foreach ($ids as $id) {
                    $teamOf[$id] = $t['index'];
                }
                $teamRatingOf[$t['index']] = self::teamRating(array_map(fn ($p) => (float) ($p['rating'] ?? 0) ?: self::START, $list));
            }
        }

        $total = 0;
        foreach ($players as $p) {
            $total += RngCore::clamp((float) ($p['rating'] ?? 0) ?: self::START, self::FLOOR, self::CAP);
        }

        $out = [];
        foreach ($players as $p) {
            $my = RngCore::clamp((float) ($p['rating'] ?? 0) ?: self::START, self::FLOOR, self::CAP);
            $myTeam = $teamOf[(string) ($p['id'] ?? '')] ?? null;
            if ($myTeam !== null && count($teamRatingOf) > 1) {
                $others = [];
                foreach ($teamRatingOf as $idx => $r) {
                    if ($idx !== $myTeam) {
                        $others[] = $r;
                    }
                }
                $oppRating = $others ? array_sum($others) / count($others) : $my;
            } else {
                $oppRating = $n > 1 ? ($total - $my) / ($n - 1) : $my;
            }
            if ($category === 'coop' || $category === 'social') {
                $score = !empty($p['won']) ? 1.0 : 0.0;
            } elseif (in_array($category, ['ffa', 'race', 'creative'], true)) {
                $place = (float) ($placements[$p['id'] ?? ''] ?? $p['place'] ?? (!empty($p['won']) ? 1 : $n));
                $score = self::placementScore($place, $n);
            } else {
                $score = !empty($p['won']) ? 1.0 : 0.0;
            }
            $r = self::eloDelta([
                'rating' => $my,
                'opponentRating' => $oppRating,
                'baseK' => $baseK,
                'gamesPlayed' => (int) ($p['games_played'] ?? $p['games'] ?? 0),
                'score' => $score,
            ]);
            $out[] = [
                'id' => $p['id'],
                'is_bot' => !empty($p['is_bot']),
                'before' => $my,
                'after' => $r['rating'],
                'delta' => $r['delta'],
                'expected' => $r['expected'],
                'score' => $score,
                'rp' => !empty($p['is_bot']) ? 0 : self::rankPointsFrom((float) ($p['score_points'] ?? 0), $r['delta']),
            ];
        }
        return ['category' => $category, 'base_k' => $baseK, 'human_count' => count($humans), 'results' => $out];
    }

    public static function rankPointsFrom(float|int $scorePoints = 0, float|int $eloDelta = 0): int
    {
        $base = (int) floor(max(0, (float) $scorePoints) / 10);
        $bonus = (int) floor(max(0, (float) $eloDelta) / 4);
        return max(0, $base + $bonus);
    }

    /** @param array $ranks */
    public static function rankForRp(array $ranks, float|int $rp): ?array
    {
        $list = $ranks;
        usort($list, fn ($a, $b) => ($a['rp_required'] ?? 0) <=> ($b['rp_required'] ?? 0));
        $best = $list[0] ?? ['id' => 'free', 'index' => 0];
        foreach ($list as $r) {
            if ((float) ($r['rp_required'] ?? 0) <= (float) $rp) {
                $best = $r;
            }
        }
        return $best;
    }

    /** @param array $ranks */
    public static function effectiveRank(array $ranks, float|int $rp, ?string $purchasedRankId): array
    {
        $list = $ranks;
        usort($list, fn ($a, $b) => ($a['index'] ?? 0) <=> ($b['index'] ?? 0));
        $earned = self::rankForRp($list, $rp);
        $bought = null;
        foreach ($list as $r) {
            if (($r['id'] ?? '') === $purchasedRankId) {
                $bought = $r;
                break;
            }
        }
        if ($bought && (int) ($bought['index'] ?? 0) > (int) ($earned['index'] ?? 0)) {
            return ['rank' => $bought, 'source' => 'purchased'];
        }
        return ['rank' => $earned, 'source' => $bought ? 'earned_over_purchased' : 'earned'];
    }

    /** @param array $ranks */
    public static function rankProgress(array $ranks, float|int $rp): array
    {
        $list = $ranks;
        usort($list, fn ($a, $b) => ($a['rp_required'] ?? 0) <=> ($b['rp_required'] ?? 0));
        $cur = self::rankForRp($list, $rp);
        $next = null;
        foreach ($list as $r) {
            if ((float) ($r['rp_required'] ?? 0) > (float) ($cur['rp_required'] ?? 0)) {
                $next = $r;
                break;
            }
        }
        if (!$next) {
            return ['current' => $cur['id'], 'next' => null, 'pct' => 100, 'remaining_rp' => 0];
        }
        $span = (float) ($next['rp_required'] ?? 0) - (float) ($cur['rp_required'] ?? 0);
        $done = (float) $rp - (float) ($cur['rp_required'] ?? 0);
        return [
            'current' => $cur['id'],
            'next' => $next['id'],
            'pct' => Bits::jsRound(RngCore::clamp(($done / max(1, $span)) * 100, 0, 100)),
            'remaining_rp' => max(0, (int) ceil((float) ($next['rp_required'] ?? 0) - (float) $rp)),
        ];
    }

    public static function levelForXp(float|int $xp): int
    {
        return min(200, (int) floor(sqrt(max(0, (float) $xp) / 100)));
    }

    public static function xpForLevel(int $level): int
    {
        $l = max(0, $level);
        return $l * $l * 100;
    }

    /** @param array $o {rating, level, rank_index, games, bias} */
    public static function skillIndex(array $o = []): float
    {
        $rating = (float) ($o['rating'] ?? 0) ?: self::START;
        $eloPart = RngCore::clamp(($rating - 700) / 2000, 0, 1);
        $levelPart = RngCore::clamp((float) ($o['level'] ?? 1) / 120, 0, 1);
        $rankPart = RngCore::clamp((float) ($o['rank_index'] ?? 0) / 5, 0, 1);
        $expPart = RngCore::clamp((float) ($o['games'] ?? 0) / 400, 0, 1);
        $raw = 0.5 * $eloPart + 0.2 * $levelPart + 0.2 * $rankPart + 0.1 * $expPart;
        return Bits::roundTo(RngCore::clamp($raw + (float) ($o['bias'] ?? 0), 0, 1), 3);
    }

    public static function decayRating(float|int $rating, int $daysInactive): float|int
    {
        $r = (float) $rating ?: self::START;
        if ($r <= self::DECAY_MIN_RATING) {
            return $r;
        }
        $weeks = max(0, (int) floor((($daysInactive) - self::DECAY_AFTER_DAYS) / 7));
        if ($weeks <= 0) {
            return $r;
        }
        return max(self::DECAY_MIN_RATING, $r - $weeks * self::DECAY_PER_WEEK);
    }
}
