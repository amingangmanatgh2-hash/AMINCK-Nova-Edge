<?php
// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — Game/GameSession.php
//  چرخهٔ یک مچ: تیم‌ها (انسان + بات تطبیقی) → تیک ۲۰Hz → جمع رویدادها →
//  کارنامهٔ قطعی (Engine) → گزارش به ورکر (match/report).
// ═══════════════════════════════════════════════════════════════════
declare(strict_types=1);

namespace NovaEdge\Game;

use NovaEdge\Bots\BotController;
use NovaEdge\Bridge\BridgeTask;
use NovaEdge\Engine\BotTier;
use NovaEdge\Engine\Elo;
use NovaEdge\Engine\Matchmaking;
use NovaEdge\Engine\Rng;
use NovaEdge\Engine\Scoring;
use NovaEdge\NovaEdgePlugin;

final class GameSession
{
    private string $id;
    private array $mode;
    /** @var array<int, array> تیم‌ها */
    private array $teams;
    /** @var array<string, BotController> */
    private array $bots = [];
    /** @var array<string, array> رویدادهای تجمع‌یافته per player id */
    private array $events = [];
    private array $humans = [];
    private int $startTs;
    private int $durationSec;
    private string $baseTier;
    private string $currentTier;
    private string $startTier;
    private bool $done = false;
    private int $tickCount = 0;
    private Rng $rng;
    private array $tierInfo;
    private NovaEdgePlugin $plugin;

    public function __construct(NovaEdgePlugin $plugin, array $mode, array $humans, int $fillSlots, ?array $tierInfo, int $seed = 0)
    {
        $this->plugin = $plugin;
        $this->mode = $mode;
        $this->humans = $humans;
        $this->rng = new Rng($seed ?: random_int(1, 2 ** 31 - 1));
        $this->id = 'bm_' . substr(bin2hex(random_bytes(6)), 0, 12);
        $this->startTs = time();
        $this->durationSec = (int) ($mode['match']['duration_sec'] ?? 900);

        // سطح هوش: از ورکر اگر هست، وگرنه محلی از روی پروفایل انسان‌ها
        if ($tierInfo && !empty($tierInfo['tier'])) {
            $this->tierInfo = $tierInfo;
            $this->baseTier = (string) $tierInfo['tier'];
            $this->startTier = (string) ($tierInfo['start_tier'] ?? $tierInfo['tier']);
        } else {
            $local = BotTier::chooseMatchTier([
                'mode' => $mode,
                'players' => $humans,
                'tiersSpec' => $plugin->tiersSpec(),
                'ranks' => [],
            ]);
            $this->tierInfo = $local;
            $this->baseTier = (string) $local['tier'];
            $this->startTier = (string) ($local['start_tier'] ?? $local['tier']);
        }
        $this->currentTier = $this->startTier;

        // تیم‌ها: درفت مارپیچی انسان‌ها + بات‌های هم‌سطح
        $teamCount = (int) ($mode['match']['teams'] ?? 2);
        $teamSize = (int) ($mode['match']['team_size'] ?? 4);
        $this->teams = Matchmaking::balanceTeams($humans, $fillSlots, $teamCount, $teamSize, [
            'mode' => $mode,
            'seed' => $seed ?: 1,
            'tier' => $this->startTier,
            'crossplay' => true,
        ]);

        // کنترلر بات‌ها با پارامترهای انسانی‌شدهٔ یکتا
        $tierDef = BotTier::tierById($plugin->tiersSpec(), $this->currentTier);
        $i = 0;
        foreach ($this->teams as $t) {
            foreach ($t['players'] as $p) {
                if (empty($p['is_bot'])) {
                    continue;
                }
                $params = BotTier::humanizeBot($tierDef, (int) ($p['seed'] ?? ++$i), ['humanization' => $plugin->tiersSpec()['humanization'] ?? []]);
                $this->bots[$p['id']] = new BotController($p, $t['index'], $params, $this->rng);
                $this->events[$p['id']] = [];
            }
        }
        foreach ($humans as $h) {
            $this->events[$h['id']] = [];
        }
    }

    public function id(): string
    {
        return $this->id;
    }

    public function modeId(): string
    {
        return (string) ($this->mode['id'] ?? '?');
    }

    public function humanCount(): int
    {
        return count($this->humans);
    }

    public function botCount(): int
    {
        return count($this->bots);
    }

    public function currentTier(): string
    {
        return $this->currentTier;
    }

    public function elapsedSec(): int
    {
        return time() - $this->startTs;
    }

    public function finished(): bool
    {
        return $this->done;
    }

    public function markLeft(string $name): void
    {
        // بازیکن انسانی خارج شد: رویداد leave ثبت می‌شود تا کارنامه صادق بماند
        foreach ($this->humans as $h) {
            if (($h['username'] ?? $h['id'] ?? '') === $name) {
                $this->addEvent((string) $h['id'], 'leave', 1);
            }
        }
    }

    public function addEvent(string $playerId, string $type, int $count = 1): void
    {
        $this->events[$playerId][$type] = ($this->events[$playerId][$type] ?? 0) + $count;
    }

    /** تیک ۲۰Hz: تصمیم بات‌ها + ترفیع پلکانی سطح + پایان مچ */
    public function tick(): void
    {
        if ($this->done) {
            return;
        }
        $this->tickCount++;
        $elapsed = $this->elapsedSec();

        // ترفیع تدریجی (با rubber-band بر اساس سهم امتیاز انسان‌ها)
        if ($this->tickCount % 100 === 0) {
            $share = $this->humanScoreShare();
            $esc = BotTier::tierAtTime($this->baseTier, $this->startTier, [
                'duration_sec' => $this->durationSec,
                'elapsed_sec' => $elapsed,
                'human_score_share' => $share,
                'escalation' => $this->tierInfo['escalation'] ?? [],
            ]);
            $this->currentTier = (string) $esc['tier'];
        }

        // مغز بات‌ها: هر بات با decision_hz خودش تصمیم می‌گیرد
        foreach ($this->bots as $bot) {
            if ($this->tickCount % max(1, (int) floor(20 / max(1, $bot->params()['decision_hz'] ?? 5))) === 0) {
                $bot->decide($this->worldFor($bot), $this->mode);
            }
        }

        if ($elapsed >= $this->durationSec) {
            $this->finish();
        }
    }

    private function humanScoreShare(): float
    {
        $h = 0.0;
        $t = 0.0;
        foreach ($this->events as $id => $ev) {
            $pts = (float) ($ev['kill'] ?? 0) + (float) ($ev['goal'] ?? 0) + (float) ($ev['bed_break'] ?? 0);
            $t += $pts;
            if (isset($this->humansById()[$id])) {
                $h += $pts;
            }
        }
        return $t > 0 ? $h / $t : 0.5;
    }

    private function humansById(): array
    {
        $out = [];
        foreach ($this->humans as $h) {
            $out[(string) $h['id']] = $h;
        }
        return $out;
    }

    /** snapshot جهان برای یک بات (فشرده، همان فرمت shared/engine/brain.js) */
    private function worldFor(BotController $bot): array
    {
        return [
            'elapsed_sec' => $this->elapsedSec(),
            'duration_sec' => $this->durationSec,
            'alive_enemies' => $bot->nearbyEnemies(),
            'alive_allies' => $bot->nearbyAllies(),
            'objectives' => $bot->objectives(),
            'scores' => ['my_team' => $bot->teamScore(), 'enemy_team' => $bot->enemyScore()],
            'resources' => [['id' => 'gen', 'dist' => $bot->genDist()]],
            'shop_affordable' => $bot->shopAffordable(),
            'gear_gap' => $bot->gearGap(),
        ];
    }

    /** پایان مچ: کارنامه + ELO + گزارش به ورکر */
    public function finish(): void
    {
        if ($this->done) {
            return;
        }
        $this->done = true;
        $players = [];
        $results = [];
        foreach ($this->teams as $t) {
            foreach ($t['players'] as $p) {
                $id = (string) $p['id'];
                $ev = $this->events[$id] ?? [];
                $won = (bool) ($ev['won'] ?? false);
                $res = Scoring::computePlayerResult([
                    'mode' => $this->mode,
                    'events' => self::eventList($ev),
                    'won' => $won,
                    'placement' => (int) ($ev['placement'] ?? ($won ? 1 : count($players) + 1)),
                    'players' => $this->humanCount() + $this->botCount(),
                    'duration_sec' => $this->elapsedSec(),
                    'afk_pct' => (float) ($ev['afk_pct'] ?? 0),
                ]);
                $results[] = $res + ['id' => $id, 'is_bot' => !empty($p['is_bot']), 'kills' => (float) ($ev['kill'] ?? 0)];
                $players[] = [
                    'id' => $id,
                    'is_bot' => !empty($p['is_bot']),
                    'rating' => (float) ($p['rating'] ?? 1000),
                    'games' => (int) ($p['games'] ?? 0),
                    'won' => $won,
                    'score_points' => $res['points'],
                ];
            }
        }
        $mvp = Scoring::pickMvp($results);
        $settle = Elo::settleMatch($this->mode, $players, [], $this->teams);

        $this->reportToWorker($results, $settle, $mvp);
    }

    /** @param array $ev @return array */
    private static function eventList(array $ev): array
    {
        $out = [];
        foreach ($ev as $type => $count) {
            if (in_array($type, ['won', 'placement', 'afk_pct', 'leave'], true)) {
                continue;
            }
            $out[] = ['type' => $type, 'count' => $count];
        }
        return $out;
    }

    private function reportToWorker(array $results, array $settle, ?string $mvp): void
    {
        $pluginTeams = array_map(fn (array $t) => [
            'index' => $t['index'],
            'players' => array_map(fn (array $p) => [
                'username' => (string) ($p['name'] ?? $p['id'] ?? ''),
                'platform' => (string) ($p['platform'] ?? 'bedrock'),
                'is_bot' => !empty($p['is_bot']),
                'bot_tier' => !empty($p['is_bot']) ? $this->currentTier : null,
                'won' => (bool) ($this->events[(string) $p['id']]['won'] ?? false),
                'placement' => (int) ($this->events[(string) $p['id']]['placement'] ?? 0),
                'afk_pct' => (float) ($this->events[(string) $p['id']]['afk_pct'] ?? 0),
                'events' => self::eventList($this->events[(string) $p['id']] ?? []),
            ], $t['players']),
        ], $this->teams);

        $bridge = $this->plugin->bridge();
        if (!$bridge) {
            return; // بدون پل، کارنامه فقط محلی می‌ماند (لیدربرد سرور)
        }
        $this->plugin->getServer()->getAsyncPool()->submitTask(new BridgeTask(
            (string) $this->plugin->getConfig()->get('worker_url'),
            (string) $this->plugin->getConfig()->get('bridge_key'),
            'match/report',
            [
                'match_id' => $this->id,
                'mode' => $this->modeId(),
                'server_id' => (string) $this->plugin->getConfig()->get('server_id', 'bedrock-main'),
                'duration_sec' => $this->elapsedSec(),
                'tier_start' => $this->startTier,
                'tier_end' => $this->currentTier,
                'model' => $this->tierInfo['model'] ?? null,
                'ai_calls' => array_sum(array_map(fn (BotController $b) => $b->llmCalls(), $this->bots)),
                'ai_latency_ms' => 0,
                'winner_team' => $this->winnerTeam(),
                'mvp' => $mvp,
                'teams' => $pluginTeams,
            ]
        ));
    }

    private function winnerTeam(): int
    {
        $best = 0;
        $bestScore = -1;
        foreach ($this->teams as $t) {
            $s = 0;
            foreach ($t['players'] as $p) {
                $s += (int) ($this->events[(string) $p['id']]['kill'] ?? 0) + (int) ($this->events[(string) $p['id']]['goal'] ?? 0);
            }
            if ($s > $bestScore) {
                $bestScore = $s;
                $best = (int) $t['index'];
            }
        }
        return $best;
    }

    public function abort(string $reason): void
    {
        $this->done = true;
    }
}
