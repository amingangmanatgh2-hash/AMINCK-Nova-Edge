<?php
// ═══════════════════════════════════════════════════════════════════
//  parity.php — اجرای بردارهای طلایی (shared/testvectors.json) روی موتور PHP
//
//  این فایل «بدون» پاکت‌ماین اجرا می‌شود (کلاس‌های Engine خالص‌اند) تا
//  بتوان آن را هم روی سرور واقعی و هم داخل php-wasm (تست سندباکس) اجرا کرد.
//
//  اجرا:  php server/bedrock/tests/parity.php [مسیر testvectors.json]
//  خروجی: خطوط PASS/FAIL + خط پایانی «RESULT ok=.. fail=..» و کد خروج.
// ═══════════════════════════════════════════════════════════════════
declare(strict_types=1);

$base = dirname(__DIR__);
require_once $base . '/src/NovaEdge/Engine/Rng.php';
require_once $base . '/src/NovaEdge/Engine/Elo.php';
require_once $base . '/src/NovaEdge/Engine/Scoring.php';
require_once $base . '/src/NovaEdge/Engine/BotTier.php';
require_once $base . '/src/NovaEdge/Engine/AntiCheat.php';
require_once $base . '/src/NovaEdge/Engine/Brain.php';
require_once $base . '/src/NovaEdge/Engine/Matchmaking.php';

use NovaEdge\Engine\AntiCheat;
use NovaEdge\Engine\Bits;
use NovaEdge\Engine\BotTier;
use NovaEdge\Engine\Brain;
use NovaEdge\Engine\Elo;
use NovaEdge\Engine\Matchmaking;
use NovaEdge\Engine\Rng;
use NovaEdge\Engine\RngCore;
use NovaEdge\Engine\Scoring;
use NovaEdge\Engine\ViolationTracker;

// ── بارگذاری spec ──
$root = dirname(dirname($base));
$SPEC = [
    'gamemodes' => json_decode(file_get_contents($root . '/shared/spec/gamemodes.json'), true),
    'ranks' => json_decode(file_get_contents($root . '/shared/spec/ranks.json'), true),
    'tiers' => json_decode(file_get_contents($root . '/shared/spec/bot-tiers.json'), true),
];
$mode = fn (string $id) => (function (array $list, string $id) {
    foreach ($list['modes'] ?? $list as $m) {
        if (($m['id'] ?? '') === $id) {
            return $m;
        }
    }
    return [];
})($SPEC['gamemodes'], $id);
$ranks = fn () => $SPEC['ranks']['ranks'] ?? $SPEC['ranks'];
$tiers = fn () => $SPEC['tiers'];

$vecPath = $argv[1] ?? ($root . '/shared/testvectors.json');
$doc = json_decode(file_get_contents($vecPath), true);
$TOL = (float) ($doc['tolerance'] ?? 1e-6);

/** مقایسهٔ tolerant: عدد با تلورانس، null ≡ کلید غایب، بولین/رشته دقیق */
function eq(mixed $a, mixed $b, float $tol, string $path = ''): ?string
{
    if (is_array($a) && is_array($b)) {
        $keys = array_unique(array_merge(array_keys($a), array_keys($b)));
        foreach ($keys as $k) {
            $hasA = array_key_exists($k, $a);
            $hasB = array_key_exists($k, $b);
            $va = $hasA ? $a[$k] : null;
            $vb = $hasB ? $b[$k] : null;
            if ($hasA !== $hasB) {
                // null در یک طرف و غیبت در طرف دیگر → مساوی
                if (($hasA && $va === null) || ($hasB && $vb === null)) {
                    continue;
                }
                return $path . '.' . $k . ': missing on one side';
            }
            $e = eq($va, $vb, $tol, $path . '.' . $k);
            if ($e !== null) {
                return $e;
            }
        }
        return null;
    }
    if (is_bool($a) || is_bool($b)) {
        return $a === $b ? null : $path . ': bool ' . var_export($a, true) . ' != ' . var_export($b, true);
    }
    if (is_numeric($a) && is_numeric($b)) {
        return abs((float) $a - (float) $b) <= $tol ? null : $path . ': ' . $a . ' != ' . $b;
    }
    if ($a === null || $b === null) {
        return $a === $b ? null : $path . ': null mismatch';
    }
    return (string) $a === (string) $b ? null : $path . ': "' . $a . '" != "' . $b . '"';
}

/** اجرای یک بردار و برگرداندن خروجی موتور PHP */
function runVector(array $v, callable $mode, callable $ranks, callable $tiers): mixed
{
    $g = $v['group'];
    $fn = $v['fn'];
    $a = $v['args'];
    $hydrate = function ($x) use ($mode, $tiers) {
        if (is_array($x)) {
            if (isset($x['mode']) && is_string($x['mode'])) {
                $x['mode'] = $mode($x['mode']);
            }
            if (isset($x['tier']) && is_string($x['tier']) && isset($x['world'])) {
                $x['tier'] = NovaEdge\Engine\BotTier::tierById($tiers(), $x['tier']);
            }
            foreach ($x as $k => $val) {
                if (is_array($val)) {
                    $x[$k] = (function ($vv) use (&$hydrateInner) {
                        return $vv;
                    })($val);
                }
            }
        }
        return $x;
    };

    switch ($g . '/' . $fn) {
        case 'rng/mulberry32_seq':
            $r = RngCore::mulberry32((int) $a[0]);
            $out = [];
            for ($i = 0; $i < $a[1]; $i++) {
                $out[] = $r();
            }
            return $out;
        case 'rng/mulberry32_first':
            return (RngCore::mulberry32((int) $a[0]))();
        case 'rng/hashSeed':
        case 'rng/hashSeed_empty':
            return RngCore::hashSeed((string) $a[0]);
        case 'rng/clamp':
        case 'rng/clamp_neg':
            return RngCore::clamp($a[0], $a[1], $a[2]);
        case 'rng/round':
            return Bits::roundTo($a[0], (int) $a[1]);

        case 'elo/expectedScore':
        case 'elo/expectedScore_equal':
            return Elo::expectedScore($a[0], $a[1]);
        case 'elo/teamRating':
            return Elo::teamRating($a[0]);
        case 'elo/effectiveK_new':
        case 'elo/effectiveK_vet':
            return Elo::effectiveK($a[0], (int) $a[1], $a[2]);
        case 'elo/placementScore_first':
        case 'elo/placementScore_last':
            return Elo::placementScore($a[0], (int) $a[1]);
        case 'elo/eloDelta_win':
        case 'elo/eloDelta_loss':
        case 'elo/eloDelta_provisional':
            return Elo::eloDelta($a[0]);
        case 'elo/settleMatch_teams':
            return Elo::settleMatch($mode($a[0]['mode']), $a[0]['players'], $a[0]['placements'] ?? [], $a[0]['teams'] ?? null);
        case 'elo/rankPointsFrom':
            return Elo::rankPointsFrom($a[0]['score_points'] ?? 0, $a[0]['elo_delta'] ?? 0);
        case 'elo/rankForRp_low':
        case 'elo/rankForRp_mid':
        case 'elo/rankForRp_top':
            return Elo::rankForRp($ranks(), $a[0])['id'] ?? null;
        case 'elo/effectiveRank_buy_lower':
        case 'elo/effectiveRank_earn_higher':
            return Elo::effectiveRank($ranks(), $a[0], $a[1])['rank']['id'] ?? null;
        case 'elo/rankProgress':
            return Elo::rankProgress($ranks(), $a[0]);
        case 'elo/levelForXp':
            return Elo::levelForXp($a[0]);
        case 'elo/xpForLevel':
            return Elo::xpForLevel((int) $a[0]);
        case 'elo/skillIndex':
            return Elo::skillIndex($a[0]);
        case 'elo/decayRating':
        case 'elo/decayRating_none':
            return Elo::decayRating($a[0], (int) $a[1]);

        case 'scoring/tallyEvents':
            return Scoring::tallyEvents($a[0]);
        case 'scoring/parkourSpeedBonus_fast':
        case 'scoring/parkourSpeedBonus_slow':
            return Scoring::parkourSpeedBonus($a[0], $a[1], $a[2]);
        case 'scoring/computePlayerResult_bedwars':
        case 'scoring/computePlayerResult_skywars':
            $o = $a[0];
            $o['mode'] = $mode($o['mode']);
            return Scoring::computePlayerResult($o);
        case 'scoring/pickMvp':
            return Scoring::pickMvp($a[0]);

        case 'bottier/tierForSkill':
        case 'bottier/tierForSkill_high':
            return BotTier::tierForSkill($a[0]);
        case 'bottier/shiftTier_up':
        case 'bottier/shiftTier_cap':
        case 'bottier/shiftTier_floor':
            return BotTier::shiftTier($a[0], $a[1]);
        case 'bottier/maxTier':
            return BotTier::maxTier($a[0], $a[1]);
        case 'bottier/percentile':
            return BotTier::percentile($a[0], $a[1]);
        case 'bottier/playerSkill':
            return BotTier::playerSkill($a[0], $ranks());
        case 'bottier/chooseMatchTier_mixed':
        case 'bottier/chooseMatchTier_newbie':
            $o = $a[0];
            $o['mode'] = $mode($o['mode']);
            $o['ranks'] = $o['ranks'] ?? $ranks();
            $o['tiersSpec'] = $o['tiersSpec'] ?? $tiers();
            return BotTier::chooseMatchTier($o);
        case 'bottier/tierAtTime_early':
        case 'bottier/tierAtTime_mid':
        case 'bottier/tierAtTime_late_winning':
        case 'bottier/tierAtTime_late_losing':
            return BotTier::tierAtTime($a[0], $a[1], $a[2]);
        case 'bottier/humanizeBot':
            return BotTier::humanizeBot(BotTier::tierById($tiers(), $a[0]), (int) $a[1], $a[2] ?? []);
        case 'bottier/llmBudget':
            return BotTier::llmBudget(BotTier::tierById($tiers(), $a[0]), $mode($a[1]), (int) $a[2], $a[3]);

        case 'anticheat/reachLimit_low_ping':
        case 'anticheat/reachLimit_high_ping':
            return AntiCheat::reachLimit($a[0]);
        case 'anticheat/speedLimit_sprint':
            return AntiCheat::speedLimit((bool) $a[0], $a[1]);
        case 'anticheat/inspect_clean':
        case 'anticheat/inspect_cheat':
            return AntiCheat::inspect($a[0], $a[1] ?? []);
        case 'anticheat/tracker_sequence': {
            $tr = new ViolationTracker();
            $cfg = $mode($a[1])['anticheat'] ?? [];
            $out = [];
            foreach ($a[0] as $s) {
                $out[] = $tr->record('cheater', $s, $cfg, (float) $a[2]);
            }
            return $out;
        }
        case 'anticheat/summarize': {
            $tr = new ViolationTracker();
            $cfg = $mode($a[1])['anticheat'] ?? [];
            foreach ($a[0] as $s) {
                $tr->record('cheater', $s, $cfg, (float) $a[2]);
            }
            return NovaEdge\Engine\summarize($tr);
        }

        case 'matchmaking/botName':
            return Matchmaking::botName((int) $a[0], new Rng((int) $a[1]));
        case 'matchmaking/balanceTeams': {
            $o = $a[0];
            $humans = [];
            for ($i = 0; $i < $o['humans']; $i++) {
                $humans[] = $i === 0
                    ? ['id' => 'a', 'rating' => 1800, 'level' => 40, 'rank_index' => 3]
                    : ['id' => 'b', 'rating' => 1100, 'level' => 6, 'rank_index' => 1];
            }
            $teams = Matchmaking::balanceTeams($humans, (int) $o['bots'], (int) $o['team_count'], (int) $o['team_size'], ['mode' => $mode($o['mode']), 'seed' => (int) $o['seed']]);
            return [
                'teams' => array_map(fn ($t) => array_map(fn ($p) => ['id' => $p['id'], 'is_bot' => !empty($p['is_bot']), 'rating' => $p['rating'], 'platform' => $p['platform']], $t['players']), $teams),
                'avg_ratings' => array_map(fn ($t) => $t['avg_rating'], $teams),
                'colors' => array_map(fn ($t) => $t['color'], $teams),
            ];
        }

        case 'brain/heuristicDecide': {
            $ctx = $a[0];
            $ctx['mode'] = $mode($ctx['mode']);
            $ctx['tier'] = BotTier::tierById($tiers(), $ctx['tier']);
            return Brain::heuristicDecide($ctx);
        }
        case 'brain/stateHash': {
            $ctx = $a[0];
            $ctx['mode'] = $mode($ctx['mode']);
            $ctx['tier'] = $ctx['tier'];
            return Brain::stateHash($ctx);
        }
        case 'brain/humanizeAction':
            return Brain::humanizeAction($a[0], $a[1], new Rng((int) $a[2]));
        case 'brain/mergeDecisions_prefers_cloud':
        case 'brain/mergeDecisions_bad_cloud':
            return Brain::mergeDecisions($a[0], $a[1]);
        case 'brain/shouldConsultLlm': {
            $ctx = $a[0];
            $ctx['mode'] = $mode($ctx['mode']);
            return Brain::shouldConsultLlm($ctx, $a[1]);
        }
    }
    throw new RuntimeException('vector پیاده‌سازی نشده در PHP: ' . $g . '/' . $fn);
}

$ok = 0;
$fail = 0;
foreach ($doc['vectors'] as $v) {
    $name = $v['group'] . '/' . $v['fn'];
    try {
        $got = runVector($v, $mode, $ranks, $tiers);
        $err = eq($v['expect'], $got, $TOL);
        if ($err === null) {
            $ok++;
            echo "PASS {$name}\n";
        } else {
            $fail++;
            echo "FAIL {$name} — {$err}\n";
            echo '     expect: ' . substr(json_encode($v['expect'], JSON_UNESCAPED_UNICODE), 0, 220) . "\n";
            echo '     got   : ' . substr(json_encode($got, JSON_UNESCAPED_UNICODE), 0, 220) . "\n";
        }
    } catch (Throwable $e) {
        $fail++;
        echo "FAIL {$name} — EXCEPTION: {$e->getMessage()}\n";
    }
}
echo 'RESULT ok=' . $ok . ' fail=' . $fail . ' total=' . ($ok + $fail) . "\n";
if (!defined('PARITY_NO_EXIT')) {
    exit($fail ? 1 : 0);
}
