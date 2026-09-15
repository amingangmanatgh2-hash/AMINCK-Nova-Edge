<?php
// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — Bots/BotController.php
//  یک بات زنده: مغز محلی (Brain) در هر تصمیم + انسانی‌سازی (تاخیر/خطا/
//  اشتباه عمدی) + مشورت گاه‌به‌گاه ابری از طریق ورکر (bot/decide).
//  ⚠️ هیچ aim-lock یا واکنش صفر-ثانیه‌ای وجود ندارد: پارامترها از
//     BotTier::humanizeBot می‌آیند و per-bot jitter دارند.
// ═══════════════════════════════════════════════════════════════════
declare(strict_types=1);

namespace NovaEdge\Bots;

use NovaEdge\Engine\Brain;
use NovaEdge\Engine\Rng;

final class BotController
{
    private array $profile;
    private int $team;
    private array $params;
    private Rng $rng;
    private array $lastDecision = ['action' => 'idle', 'target' => null];
    private int $llmCalls = 0;
    private int $lastLlmSec = -100000;
    private array $cloudPlan = [];
    /** شبیه‌سازی وضعیت محلی بات (در سرور واقعی از رویدادهای Arenа پر می‌شود) */
    private array $sim = ['hp' => 20, 'enemies' => [], 'allies' => [], 'gen_dist' => 6];

    public function __construct(array $profile, int $team, array $params, Rng $rng)
    {
        $this->profile = $profile;
        $this->team = $team;
        $this->params = $params;
        $this->rng = $rng;
    }

    public function params(): array
    {
        return $this->params;
    }

    public function llmCalls(): int
    {
        return $this->llmCalls;
    }

    public function profile(): array
    {
        return $this->profile;
    }

    public function teamIndex(): int
    {
        return $this->team;
    }

    /** تصمیم این تیک: محلی قطعی + ادغام نقشهٔ ابری اگر رسیده باشد */
    public function decide(array $world, array $mode): array
    {
        $ctx = [
            'mode' => $mode,
            'tier' => $this->params['tier_id'] ?? 'T1',
            'bot' => [
                'id' => (string) ($this->profile['id'] ?? 'bot'),
                'team' => $this->team,
                'hp' => $this->sim['hp'],
                'max_hp' => 20,
                'inventory' => $this->profile['inventory'] ?? [],
                'resources' => $this->profile['resources'] ?? [],
            ],
            'world' => $world,
            'params' => $this->params,
            'rng' => $this->rng,
        ];
        $local = Brain::heuristicDecide($ctx);
        $decision = Brain::humanizeAction($local, $this->params, $this->rng);

        // اگر نقشهٔ ابری قبلاً رسیده و هنوز معتبر است، اولویت با آن است
        if ($this->cloudPlan && (time() - ($this->cloudPlan['ts'] ?? 0)) < 15) {
            $merged = Brain::mergeDecisions($local, ['ok' => true, 'decision' => $this->cloudPlan['decision'] ?? null]);
            if (!empty($merged['cloud_used']) && ($merged['action'] ?? 'idle') !== 'idle') {
                $decision = Brain::humanizeAction($merged, $this->params, $this->rng);
            }
        }
        $this->lastDecision = $decision;
        return $decision;
    }

    /**
     * آماده‌سازی درخواست مشورت ابری — ارسال واقعی با GameSession/پلاگین
     * (بودجهٔ فراخوانی از BotTier::llmBudget اعمال می‌شود).
     * @return array payload برای /api/mc/v1/bot/decide
     */
    public function cloudRequestPayload(array $ctxJson, string $modeId, string $tier): array
    {
        $this->llmCalls++;
        $this->lastLlmSec = time();
        return [
            'mode' => $modeId,
            'tier' => $tier,
            'match_id' => (string) ($ctxJson['match_id'] ?? ''),
            'bot' => $ctxJson['bot'] ?? [],
            'world' => $ctxJson['world'] ?? [],
            'bot_count' => (int) ($ctxJson['bot_count'] ?? 1),
            'seed' => (int) ($this->profile['seed'] ?? 1),
        ];
    }

    public function secondsSinceLlm(): int
    {
        return time() - $this->lastLlmSec;
    }

    public function setCloudPlan(array $decision): void
    {
        $this->cloudPlan = ['ts' => time(), 'decision' => $decision];
    }

    public function lastDecision(): array
    {
        return $this->lastDecision;
    }

    // ── دسترسی‌های snapshot برای GameSession ──
    public function nearbyEnemies(): array
    {
        return $this->sim['enemies'];
    }

    public function nearbyAllies(): array
    {
        return $this->sim['allies'];
    }

    public function objectives(): array
    {
        return $this->sim['objectives'] ?? ['my_bed' => ['obsidian' => false], 'bed_threat_dist' => 999, 'enemy_beds' => []];
    }

    public function teamScore(): int
    {
        return (int) ($this->sim['team_score'] ?? 0);
    }

    public function enemyScore(): int
    {
        return (int) ($this->sim['enemy_score'] ?? 0);
    }

    public function genDist(): float
    {
        return (float) $this->sim['gen_dist'];
    }

    public function shopAffordable(): array
    {
        return $this->sim['shop_affordable'] ?? [];
    }

    public function gearGap(): float
    {
        return (float) ($this->sim['gear_gap'] ?? 0);
    }

    /** به‌روزرسانی وضعیت از رویدادهای واقعی سرور (ضربه، حرکت، منبع…) */
    public function updateSim(array $patch): void
    {
        $this->sim = array_merge($this->sim, $patch);
    }
}
