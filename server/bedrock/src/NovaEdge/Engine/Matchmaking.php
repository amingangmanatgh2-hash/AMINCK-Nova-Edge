<?php
// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — Engine/Matchmaking.php (پورت دقیق shared/engine/matchmaking.js)
//  ⚠️ ترتیب مصرف RNG باید دقیقاً مثل JS باشد تا نام/رتبهٔ بات‌ها یکسان دربیاید.
// ═══════════════════════════════════════════════════════════════════
declare(strict_types=1);

namespace NovaEdge\Engine;

final class Matchmaking
{
    public const BOT_NAMES = [
        'Arash_77', 'NimaX', 'SinaPvP', 'KianCraft', 'ParsaGod', 'MiladYT', 'AmirTNT', 'RezaBridge',
        'Saman_98', 'Tohid', 'BardiaPro', 'ErfanZ', 'MahdiSword', 'AlirezaMC', 'HosseinBed', 'JavadRun',
        'NaderSky', 'YasinPvP', 'Mobin_1', 'Soroush', 'FarhadGG', 'KamyarX', 'PeymanUHC', 'Bahram',
        'AriaParkour', 'ShayanKit', 'OmidDuel', 'VahidSpleef', 'MortezaAim', 'SaeedTNT', 'DanialMurder',
        'ImanBuilder', 'AshkanFrost', 'MehdiVamp', 'NavidRush', 'ZahraMC', 'SaraPvP', 'NargesBuild',
        'LeilaSky', 'MaryamGG', 'ElnazRun', 'FatemehKit', 'HaniehDuel', 'RoxanaX', 'TaraMC', 'YasnaPro',
        'Alex_Steve', 'Notch_Fan', 'EnderPro', 'CreeperHug', 'RedstoneRat', 'PistonPete', 'SlimeKing',
        'BlazeBorn', 'IronGolemX', 'WitherWatch', 'GhastGoal', 'ShulkerSam', 'PiglinPal', 'WardenWake',
    ];

    public static function botName(int $i, ?Rng $rng): string
    {
        $list = self::BOT_NAMES;
        $base = $list[$i % count($list)];
        $suffix = '';
        if ($rng) {
            if ($rng->chance(0.35)) {
                $suffix = '_' . $rng->int(10, 99);
            }
        }
        return $base . $suffix;
    }

    /** @param array $o {index, tier, matchRating, mode, rng, platform} */
    public static function makeBot(array $o): array
    {
        $rng = $o['rng'] ?? null;
        $name = self::botName((int) ($o['index'] ?? 0), $rng);
        $jitter = $rng ? $rng->int(-90, 90) : 0;
        $rating = RngCore::clamp(Bits::jsRound((float) ($o['matchRating'] ?? 1000) + $jitter), 100, 4000);
        $mode = $o['mode'] ?? null;
        return [
            'id' => 'bot_' . preg_replace('/[^a-z0-9]/', '', strtolower($name)) . '_' . (int) ($o['index'] ?? 0),
            'name' => $name,
            'is_bot' => true,
            'tier' => $o['tier'] ?? null,
            'rating' => $rating,
            'level' => $rng ? $rng->int(5, 90) : 20,
            'rank_id' => 'free',
            'platform' => $o['platform'] ?? ($rng && $rng->chance(0.35) ? 'bedrock' : 'java'),
            'games' => $rng ? $rng->int(20, 900) : 100,
            'seed' => $rng ? $rng->int(1, 2147483647) : (int) ($o['index'] ?? 0) + 1,
            'mode' => is_array($mode) ? ($mode['id'] ?? null) : $mode,
        ];
    }

    private static function sumRating(array $players): float
    {
        $s = 0.0;
        foreach ($players as $p) {
            $s += (float) ($p['rating'] ?? 0) ?: 1000;
        }
        return $s;
    }

    /** @param array $teams */
    private static function pickPlatform(array $weakest, array $teams, mixed $crossplay, Rng $rng): string
    {
        if (!$crossplay) {
            return $rng->chance(0.5) ? 'java' : 'bedrock';
        }
        $java = 0;
        $bedrock = 0;
        foreach ($teams as $t) {
            foreach ($t['players'] as $p) {
                if (($p['platform'] ?? '') === 'bedrock') {
                    $bedrock++;
                } else {
                    $java++;
                }
            }
        }
        return $java <= $bedrock ? 'java' : 'bedrock';
    }

    /**
     * بالانس تیم‌ها: درفت مارپیچی + بات‌ها به ضعیف‌ترین تیم
     * @param array $humans @param array $opts {mode, seed, tier, crossplay}
     */
    public static function balanceTeams(array $humans, int $botsNeeded, int $teamCount, int $teamSize, array $opts = []): array
    {
        $rng = new Rng((int) ($opts['seed'] ?? 1));
        $mode = $opts['mode'] ?? [];
        $colors = ['red', 'blue', 'green', 'yellow', 'aqua', 'pink', 'gray', 'orange', 'white', 'purple', 'brown', 'lime'];
        $pool = $humans;
        usort($pool, fn ($a, $b) => (((float) ($b['rating'] ?? 0) ?: 1000)) <=> (((float) ($a['rating'] ?? 0) ?: 1000)));
        $avgRating = $pool ? array_sum(array_map(fn ($p) => (float) ($p['rating'] ?? 0) ?: 1000, $pool)) / count($pool) : 1000;

        $teams = [];
        $cat = $mode['category'] ?? '';
        $nTeams = in_array($cat, ['ffa', 'race', 'creative'], true)
            ? max(1, count($pool) + $botsNeeded)
            : max(1, min($teamCount ?: 2, max(2, (int) ceil((count($pool) + $botsNeeded) / max(1, $teamSize ?: 1)))));

        for ($i = 0; $i < $nTeams; $i++) {
            $teams[] = ['index' => $i, 'color' => $colors[$i % count($colors)], 'players' => [], 'avg_rating' => 0, 'platforms' => ['java' => 0, 'bedrock' => 0]];
        }

        $dir = 1;
        $cur = 0;
        foreach ($pool as $p) {
            $teams[$cur]['players'][] = $p;
            $cur += $dir;
            if ($cur >= count($teams)) {
                $cur = count($teams) - 1;
                $dir = -1;
            } elseif ($cur < 0) {
                $cur = 0;
                $dir = 1;
            }
        }

        $matchRating = $avgRating;
        for ($i = 0; $i < $botsNeeded; $i++) {
            // ضعیف‌ترین تیم (اولین حداقل در صورت تساوی — مثل sort پایدار JS) بدون برهم‌زدن ترتیب تیم‌ها
            $wi = 0;
            $wv = self::sumRating($teams[0]['players']);
            foreach ($teams as $ti => $t) {
                $sv = self::sumRating($t['players']);
                if ($sv < $wv) {
                    $wv = $sv;
                    $wi = $ti;
                }
            }
            $platform = self::pickPlatform($teams[$wi], $teams, $opts['crossplay'] ?? null, $rng);
            $teams[$wi]['players'][] = self::makeBot(['index' => $i, 'tier' => $opts['tier'] ?? 'T0', 'matchRating' => $matchRating, 'mode' => $mode, 'rng' => $rng, 'platform' => $platform]);
        }

        foreach ($teams as &$t) {
            $t['avg_rating'] = (int) Bits::jsRound(self::sumRating($t['players']) / max(1, count($t['players'])));
            foreach ($t['players'] as $p) {
                $t['platforms'][($p['platform'] ?? '') === 'bedrock' ? 'bedrock' : 'java']++;
            }
        }
        return $teams;
    }
}
