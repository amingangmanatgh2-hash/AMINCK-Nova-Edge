<?php
// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — Bridge/BridgeClient.php
//  کلاینت پل HTTPS به ورکر کلادفلر (/api/mc/v1/*) با امضای HMAC:
//    X-Nova-Key : کلید مشترک (از پنل مالک → تب API)
//    X-Nova-Ts  :unix timestamp (ضد تکرار/بازیابی؛ ورکر ±۳۰۰ثانیه می‌پذیرد)
//    X-Nova-Sig :HMAC-SHA256(key, ts + ':' + sha256(body))
//  درخواست‌ها داخل AsyncTask اجرا می‌شوند تا تیک اصلی سرور هرگز بلوکه نشود.
// ═══════════════════════════════════════════════════════════════════
declare(strict_types=1);

namespace NovaEdge\Bridge;

use pocketmine\scheduler\AsyncTask;

final class BridgeClient
{
    private string $base;
    private string $key;
    private int $timeoutMs;

    public function __construct(string $base, string $key, int $timeoutMs = 4000)
    {
        $this->base = rtrim($base, '/');
        $this->key = $key;
        $this->timeoutMs = $timeoutMs;
    }

    public static function sign(string $key, string $body, int $ts): string
    {
        return hash_hmac('sha256', $ts . ':' . hash('sha256', $body), $key);
    }

    /** @return array{status:int, json:array} */
    public function request(string $action, array $payload = [], string $method = 'POST'): array
    {
        $body = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $ts = time();
        $ch = curl_init($this->base . '/api/mc/v1/' . $action);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_TIMEOUT_MS => $this->timeoutMs,
            CURLOPT_CONNECTTIMEOUT_MS => min(2500, $this->timeoutMs),
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'X-Nova-Key: ' . $this->key,
                'X-Nova-Ts: ' . $ts,
                'X-Nova-Sig: ' . self::sign($this->key, $body, $ts),
            ],
        ]);
        $raw = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($raw === false || $raw === '') {
            return ['status' => 0, 'json' => ['ok' => false, 'error' => 'bridge_unreachable: ' . $err]];
        }
        $json = json_decode((string) $raw, true);
        return ['status' => $status, 'json' => is_array($json) ? $json : ['ok' => false, 'error' => 'bad_json']];
    }
}

/**
 * درخواست ناهمزمان (روی thread جدا) — تیک سرور نمی‌خوابد.
 * ⚠️ AsyncTask نمی‌تواند closure نگه دارد؛ نتیجه در یک صف ایستا می‌نشیند
 *    و ثبات‌گیر (scheduler) هر تیک آن را تخلیه می‌کند (NovaEdgePlugin::drainBridge).
 */
class BridgeTask extends AsyncTask
{
    /** @var array<int, array{action:string, json:array}> */
    public static array $results = [];

    private string $base;
    private string $key;
    private string $action;
    private string $payload;

    public function __construct(string $base, string $key, string $action, array $payload)
    {
        $this->base = $base;
        $this->key = $key;
        $this->action = $action;
        $this->payload = json_encode($payload, JSON_UNESCAPED_UNICODE);
    }

    public function onRun(): void
    {
        $client = new BridgeClient($this->base, $this->key);
        $res = $client->request($this->action, json_decode($this->payload, true) ?? []);
        self::$results[] = ['action' => $this->action, 'json' => $res['json']];
    }
}
