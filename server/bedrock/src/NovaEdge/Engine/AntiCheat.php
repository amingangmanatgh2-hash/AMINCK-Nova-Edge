<?php
// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — Engine/AntiCheat.php (پورت دقیق shared/engine/anticheat.js)
//  امتیاز تخطی با افول زمانی + جبران پینگ (حیاتی برای نت ایران)
// ═══════════════════════════════════════════════════════════════════
declare(strict_types=1);

namespace NovaEdge\Engine;

final class AntiCheat
{
    public const CHECKS = [
        'reach' => ['weight' => 6, 'limit_blocks' => 3.4, 'ping_compensation' => true, 'per_ms' => 0.004],
        'killaura' => ['weight' => 10, 'rotation_snap_deg' => 40, 'min_hits' => 3],
        'autoclicker' => ['weight' => 5, 'cps_max' => 18, 'cps_min_consistent' => 19.5],
        'fly' => ['weight' => 14, 'max_air_ticks' => 40, 'vy_tolerance' => 0.08],
        'speed' => ['weight' => 12, 'max_speed' => 0.42, 'sprint_max' => 0.62],
        'nofall' => ['weight' => 8, 'fall_damage_skips' => 3],
        'timer' => ['weight' => 15, 'tick_rate_max' => 22.5],
        'scaffold' => ['weight' => 4, 'place_rate_max' => 22],
        'xray' => ['weight' => 9, 'ore_per_min_max' => 26, 'straight_line_digs' => 6],
        'fastbow' => ['weight' => 7, 'charge_ms_min' => 550],
        'invmove' => ['weight' => 6, 'sprint_while_gui' => 2],
        'blink' => ['weight' => 13, 'position_jitter_blocks' => 12],
        'impossible' => ['weight' => 20],
    ];

    public const DEFAULT_CONFIG = [
        'warn_at' => 20,
        'kick_at' => 45,
        'tempban_at' => 80,
        'ban_at' => 150,
        'decay_per_min' => 3,
        'tempban_hours' => 24,
        'ping_tolerance_ms' => 250,
        'verbose' => false,
        'exempt_ops' => true,
    ];

    public static function reachLimit(float|int $pingMs, ?float $base = null, ?float $perMs = null): float
    {
        $base = $base ?? self::CHECKS['reach']['limit_blocks'];
        $perMs = $perMs ?? self::CHECKS['reach']['per_ms'];
        $ping = RngCore::clamp((float) $pingMs, 0, self::DEFAULT_CONFIG['ping_tolerance_ms']);
        return Bits::roundTo($base + $ping * $perMs * 0.25, 2);
    }

    public static function speedLimit(bool $sprinting, float|int $pingMs): float
    {
        $base = $sprinting ? self::CHECKS['speed']['sprint_max'] : self::CHECKS['speed']['max_speed'];
        $ping = RngCore::clamp((float) $pingMs, 0, self::DEFAULT_CONFIG['ping_tolerance_ms']);
        return Bits::roundTo($base + $ping * 0.00012, 3);
    }

    /** @param array $s نمونهٔ تیک، @param array $cfg تنظیم آنتی‌چیت مود */
    public static function inspect(array $s = [], array $cfg = []): ?array
    {
        $check = (string) ($s['check'] ?? '');
        $mode = $cfg;
        $v = (float) ($s['value'] ?? 0);
        $hit = fn (float $limit, string $detail, float $weight) => ['check' => $check, 'weight' => $weight, 'value' => $v, 'limit' => $limit, 'detail' => $detail];

        switch ($check) {
            case 'reach':
                $limit = self::reachLimit($s['ping'] ?? 0, ((float) ($mode['reach_max_blocks'] ?? 0)) ?: self::CHECKS['reach']['limit_blocks']);
                if ($v > $limit) {
                    return $hit($limit, sprintf('reach=%.2f > %s', $v, self::num($limit)), self::CHECKS['reach']['weight'] * (((float) ($mode['flag_weight_kill'] ?? 0)) ?: 2) / 2);
                }
                return null;
            case 'cps':
                $max = ((float) ($mode['cps_max'] ?? 0)) ?: self::CHECKS['autoclicker']['cps_max'];
                if ($v > $max) {
                    return $hit($max, 'cps=' . self::num($v), self::CHECKS['autoclicker']['weight']);
                }
                return null;
            case 'rotation_snap':
                if ((float) ($s['snap_streak'] ?? 0) >= self::CHECKS['killaura']['min_hits'] && $v < self::CHECKS['killaura']['rotation_snap_deg']) {
                    return $hit(self::CHECKS['killaura']['rotation_snap_deg'], 'snap_streak=' . self::num($s['snap_streak'] ?? 0) . ' err=' . self::num($v) . '°', self::CHECKS['killaura']['weight']);
                }
                return null;
            case 'air_ticks':
                if (empty($s['on_ground']) && $v > self::CHECKS['fly']['max_air_ticks'] && empty($s['elytra']) && empty($s['levitation'])) {
                    return $hit(self::CHECKS['fly']['max_air_ticks'], 'air_ticks=' . self::num($v), self::CHECKS['fly']['weight']);
                }
                return null;
            case 'speed':
                $limit = self::speedLimit(!empty($s['sprinting']), $s['ping'] ?? 0);
                $cap = ((float) ($mode['max_speed'] ?? 0)) ?: $limit;
                if ($v > max($limit, $cap) && ($s['on_ground'] ?? null) !== false) {
                    return $hit(max($limit, $cap), sprintf('speed=%.3f', $v), self::CHECKS['speed']['weight']);
                }
                return null;
            case 'tick_rate':
                if ($v > self::CHECKS['timer']['tick_rate_max']) {
                    return $hit(self::CHECKS['timer']['tick_rate_max'], 'tps=' . self::num($v), self::CHECKS['timer']['weight']);
                }
                return null;
            case 'place_rate':
                $max = ((float) ($mode['max_blocks_per_sec'] ?? 0)) ?: self::CHECKS['scaffold']['place_rate_max'];
                if ($v > $max) {
                    return $hit($max, 'place/s=' . self::num($v), self::CHECKS['scaffold']['weight']);
                }
                return null;
            case 'ore_rate':
                if ($v > self::CHECKS['xray']['ore_per_min_max'] || (float) ($s['straight_digs'] ?? 0) >= self::CHECKS['xray']['straight_line_digs']) {
                    return $hit(self::CHECKS['xray']['ore_per_min_max'], 'ore/min=' . self::num($v), self::CHECKS['xray']['weight']);
                }
                return null;
            case 'bow_charge':
                if ($v > 0 && $v < self::CHECKS['fastbow']['charge_ms_min']) {
                    return $hit(self::CHECKS['fastbow']['charge_ms_min'], 'charge=' . self::num($v) . 'ms', self::CHECKS['fastbow']['weight']);
                }
                return null;
            case 'nofall':
                if ((float) ($s['skips'] ?? 0) >= self::CHECKS['nofall']['fall_damage_skips']) {
                    return $hit(self::CHECKS['nofall']['fall_damage_skips'], 'skips=' . self::num($s['skips'] ?? 0), self::CHECKS['nofall']['weight']);
                }
                return null;
            case 'blink':
                if ($v > self::CHECKS['blink']['position_jitter_blocks']) {
                    return $hit(self::CHECKS['blink']['position_jitter_blocks'], 'jump=' . self::num($v) . ' blocks', self::CHECKS['blink']['weight']);
                }
                return null;
            case 'impossible':
                return $hit(0, (string) ($s['detail'] ?? 'impossible action'), self::CHECKS['impossible']['weight']);
            default:
                return null;
        }
    }

    /** چاپ عدد مثل جاوااسکریپت (بدون صفرهای اضافی) */
    private static function num(float|int $x): string
    {
        $f = (float) $x;
        return $f == (int) $f ? (string) (int) $f : (string) $f;
    }
}

/** ردیاب تخطی با افول زمانی — یک نمونه برای هر بازیکن */
class ViolationTracker
{
    public array $cfg;
    /** @var array<string, array> */
    public array $players = [];

    public function __construct(array $cfg = [])
    {
        $this->cfg = array_merge(AntiCheat::DEFAULT_CONFIG, $cfg);
    }

    private function get(string $id): array
    {
        if (!isset($this->players[$id])) {
            $this->players[$id] = ['id' => $id, 'score' => 0, 'history' => [], 'last_action' => '', 'last_ts' => 0, 'exempt' => false];
        }
        return $this->players[$id];
    }

    private function decay(array &$p, float|int $nowTs): void
    {
        $mins = max(0, ($nowTs - ($p['last_ts'] ?: $nowTs)) / 60000);
        if ($mins > 0) {
            $p['score'] = max(0, $p['score'] - $mins * $this->cfg['decay_per_min']);
        }
        $p['last_ts'] = $nowTs;
    }

    /** @param array $sample @param array $modeCfg @return array */
    public function record(string $id, array $sample, array $modeCfg = [], ?float $nowTs = null): array
    {
        $nowTs = $nowTs ?? (int) (microtime(true) * 1000);
        $p = $this->get($id);
        $this->decay($p, $nowTs);
        $v = AntiCheat::inspect($sample, $modeCfg);
        if (!$v) {
            $this->players[$id] = $p;
            return ['id' => $id, 'score' => Bits::jsRound($p['score']), 'violation' => null, 'action' => 'none', 'reasons' => []];
        }
        if ($p['exempt'] && $this->cfg['exempt_ops']) {
            $p['history'][] = array_merge($v, ['ts' => $nowTs, 'exempted' => true]);
            $this->players[$id] = $p;
            return ['id' => $id, 'score' => Bits::jsRound($p['score']), 'violation' => $v, 'action' => 'none', 'reasons' => ['exempt']];
        }
        $p['score'] += (float) ($v['weight'] ?: 1);
        $p['history'][] = array_merge($v, ['ts' => $nowTs]);
        if (count($p['history']) > 60) {
            $p['history'] = array_slice($p['history'], count($p['history']) - 60);
        }

        $action = 'none';
        if ($p['score'] >= $this->cfg['ban_at']) {
            $action = 'ban';
        } elseif ($p['score'] >= $this->cfg['tempban_at']) {
            $action = 'tempban';
        } elseif ($p['score'] >= $this->cfg['kick_at']) {
            $action = 'kick';
        } elseif ($p['score'] >= $this->cfg['warn_at']) {
            $action = 'warn';
        }

        if ($action !== 'none' && $action !== $p['last_action']) {
            $p['last_action'] = $action;
        }
        $this->players[$id] = $p;
        $reasons = array_map(fn ($h) => $h['check'] . ': ' . $h['detail'], array_slice($p['history'], -6));
        return [
            'id' => $id,
            'score' => Bits::jsRound($p['score']),
            'violation' => $v,
            'action' => $action,
            'reasons' => array_values($reasons),
            'tempban_hours' => $action === 'tempban' ? $this->cfg['tempban_hours'] : 0,
        ];
    }

    public function reset(string $id): void
    {
        unset($this->players[$id]);
    }

    public function snapshot(): array
    {
        $out = [];
        foreach ($this->players as $p) {
            $out[] = [
                'id' => $p['id'],
                'score' => Bits::jsRound($p['score']),
                'last_action' => $p['last_action'],
                'violations' => count($p['history']),
                'top' => array_map(fn ($h) => $h['check'], array_slice($p['history'], -3)),
            ];
        }
        return $out;
    }
}

/** @param ViolationTracker $tracker */
function summarize(ViolationTracker $tracker): array
{
    $byCheck = [];
    $flagged = 0;
    foreach ($tracker->players as $p) {
        if ($p['score'] >= $tracker->cfg['warn_at']) {
            $flagged++;
        }
        foreach ($p['history'] as $h) {
            $byCheck[$h['check']] = ($byCheck[$h['check']] ?? 0) + 1;
        }
    }
    return ['players_tracked' => count($tracker->players), 'flagged' => $flagged, 'by_check' => $byCheck];
}
