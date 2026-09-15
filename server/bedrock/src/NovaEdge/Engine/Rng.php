<?php
// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — Engine/Rng.php  (پورت دقیق shared/engine/rng.js)
//  ⚠️ همهٔ عملیات ۳۲بیتی با ماسک/کمکی‌ها شبیه‌سازی می‌شوند تا خروجی
//     با JS (ورکر) و Java (پیپر) بیت‌به‌بیت یکسان باشد.
// ═══════════════════════════════════════════════════════════════════
declare(strict_types=1);

namespace NovaEdge\Engine;

final class Bits
{
    private const M = 4294967296.0; // 2^32

    /**
     * نگه‌داشتن مقدار به‌صورت float در بازهٔ [0, 2^32) — چون پی‌اچ‌پی داخل
     * wasm سی‌ودو بیتی است و int نمی‌تواند 2^32 را نگه دارد. همهٔ عملیات
     * بیتی زیر روی همین نمایش کار می‌کنند و در ۳۲/۶۴ بیتی یکسان‌اند.
     */
    public static function u32(float|int $x): float
    {
        $v = fmod(floor((float) $x), self::M);
        if ($v < 0) {
            $v += self::M;
        }
        return $v;
    }

    /** شیفت منطقی به راست (>>> در JS) */
    public static function shru(float $a, int $n): float
    {
        return floor($a / (2 ** $n));
    }

    private static function chunks(float $a): array
    {
        return [(int) floor($a / 65536), (int) fmod($a, 65536)];
    }

    /** OR بیتی */
    public static function bor(float $a, float $b): float
    {
        [$ah, $al] = self::chunks($a);
        [$bh, $bl] = self::chunks($b);
        return ($ah | $bh) * 65536 + ($al | $bl);
    }

    /** XOR بیتی */
    public static function bxor(float $a, float $b): float
    {
        [$ah, $al] = self::chunks($a);
        [$bh, $bl] = self::chunks($b);
        return ($ah ^ $bh) * 65536 + ($al ^ $bl);
    }

    /** معادل Math.imul جاوااسکریپت (ضرب ۳۲بیتی mod 2^32) */
    public static function imul(float $a, float $b): float
    {
        $a = self::u32($a);
        $b = self::u32($b);
        [$ah, $al] = self::chunks($a);
        [$bh, $bl] = self::chunks($b);
        $lo = $al * $bl;                                   // < 2^32
        $mid = fmod($al * $bh + $ah * $bl, 65536) * 65536; // < 2^32
        return fmod($lo + $mid, self::M);
    }

/** معادل Math.round جاوااسکریپت (نصف به سمت +∞) — round() پی‌اچ‌پی برای منفی‌ها فرق می‌کند */
    public static function jsRound(float|int $x): int
    {
        return (int) floor($x + 0.5);
    }

    /** گرد کردن با d رقم اعشار، دقیقاً مثل round(n, d) در rng.js */
    public static function roundTo(float|int $n, int $digits = 0): float
    {
        $f = 10 ** $digits;
        return self::jsRound($n * $f) / $f;
    }
}

final class RngCore
{
    public static function clamp(float|int $n, float|int $min, float|int $max): float|int
    {
        $v = is_numeric($n) ? $n : 0;
        return max($min, min($max, $v));
    }

    /** mulberry32 — دنبالهٔ یکسان با JS */
    public static function mulberry32(int $seed): \Closure
    {
        $a = Bits::u32($seed);
        return function () use (&$a): float {
            $a = Bits::u32($a + 0x6D2B79F5);
            $t = $a;
            $t = Bits::imul(Bits::bxor($t, Bits::shru($t, 15)), Bits::bor($t, 1));
            $t = Bits::bxor($t, Bits::u32($t + Bits::imul(Bits::bxor($t, Bits::shru($t, 7)), Bits::bor($t, 61))));
            return Bits::bxor($t, Bits::shru($t, 14)) / 4294967296.0;
        };
    }

    /** هش FNV-1a مثل hashSeed در rng.js */
    public static function hashSeed(string $s): float
    {
        $h = 2166136261.0;
        $len = strlen($s);
        for ($i = 0; $i < $len; $i++) {
            $h = Bits::bxor($h, (float) ord($s[$i]));
            $h = Bits::imul($h, 16777619);
        }
        $u = Bits::u32($h);
        return $u ?: 1;
    }
}

/**
 * کلاس Rng — دقیقاً متدهای rng.js: float/int/chance/pick/weighted/gauss/normal/shuffle
 */
class Rng
{
    private int $seed;
    private \Closure $next;

    public function __construct(int $seed = 1)
    {
        $this->seed = $seed ?: 1;
        $this->next = RngCore::mulberry32($this->seed);
    }

    public function float(): float
    {
        return ($this->next)();
    }

    public function int(int|float $min, int|float $max): int
    {
        $lo = (int) ceil($min);
        $hi = (int) floor($max);
        if ($hi <= $lo) {
            return $lo;
        }
        return $lo + (int) floor(($this->next)() * ($hi - $lo + 1));
    }

    public function chance(float|int $p): bool
    {
        return ($this->next)() < (float) ($p ?: 0);
    }

    /** @param array $arr */
    public function pick(array $arr): mixed
    {
        if (!$arr) {
            return null;
        }
        $i = (int) floor(($this->next)() * count($arr)) % count($arr);
        return array_values($arr)[$i];
    }

    /** @param array $items لیستی از آرایه‌ها با کلید وزن */
    public function weighted(array $items, string $weightKey = 'w'): mixed
    {
        if (!$items) {
            return null;
        }
        $total = 0.0;
        foreach ($items as $it) {
            $total += max(0, (float) ($it[$weightKey] ?? 0));
        }
        if ($total <= 0) {
            return $items[0];
        }
        $r = ($this->next)() * $total;
        foreach ($items as $it) {
            $r -= max(0, (float) ($it[$weightKey] ?? 0));
            if ($r <= 0) {
                return $it;
            }
        }
        return $items[count($items) - 1];
    }

    public function gauss(): float
    {
        $u = 0.0;
        $v = 0.0;
        while ($u === 0.0) {
            $u = ($this->next)();
        }
        while ($v === 0.0) {
            $v = ($this->next)();
        }
        return sqrt(-2 * log($u)) * cos(2 * M_PI * $v);
    }

    public function normal(float|int $mean = 0, float|int $sd = 1): float
    {
        return (float) $mean + $this->gauss() * (float) $sd;
    }

    /** @param array $arr */
    public function shuffle(array $arr): array
    {
        $a = array_values($arr);
        for ($i = count($a) - 1; $i > 0; $i--) {
            $j = (int) floor(($this->next)() * ($i + 1));
            $t = $a[$i];
            $a[$i] = $a[$j];
            $a[$j] = $t;
        }
        return $a;
    }
}
