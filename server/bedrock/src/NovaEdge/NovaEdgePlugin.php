<?php
// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — پلاگین PocketMine-MP (Bedrock)
//
//  مسئولیت‌ها:
//   • هارت‌بیت به ورکر (وضعیت سرور + گرفتن کانفیگ زنده)
//   • همگام‌سازی پروفایل بازیکنان هنگام ورود
//   • ساخت مچ‌ها با بات‌های تطبیقی (GameSession + BotController)
//   • گزارش مچ/آنتی‌چیت/گرانت‌ها به ورکر (BridgeClient)
//   • تحویل خریدها (grants) هنگام ورود بازیکن
//
//  ⚠️ موتور امتیاز/ELO/سطح‌بندی بات دقیقاً همان shared/engine است
//     (کلاس‌های Engine/) و با shared/testvectors.json تست می‌شود.
// ═══════════════════════════════════════════════════════════════════
declare(strict_types=1);

namespace NovaEdge;

use NovaEdge\Bridge\BridgeClient;
use NovaEdge\Bridge\BridgeTask;
use NovaEdge\Engine\BotTier;
use NovaEdge\Game\GameSession;
use pocketmine\event\Listener;
use pocketmine\event\player\PlayerJoinEvent;
use pocketmine\event\player\PlayerQuitEvent;
use pocketmine\plugin\PluginBase;
use pocketmine\scheduler\ClosureTask;

final class NovaEdgePlugin extends PluginBase implements Listener
{
    public const CONFIG_VERSION = 1;

    private ?BridgeClient $bridge = null;
    /** @var array<string, GameSession> */
    private array $sessions = [];
    /** @var array<string, array> پروفایل زندهٔ بازیکنان از ورکر */
    private array $profiles = [];
    private array $runtime = [];
    private int $heartbeatEverySec = 30;
    private int $lastHeartbeat = 0;

    public function onEnable(): void
    {
        $this->saveDefaultConfig();
        $base = (string) $this->getConfig()->get('worker_url', 'https://aminck-nova-bot.workers.dev');
        $key = (string) $this->getConfig()->get('bridge_key', '');
        if ($key === '') {
            $this->getLogger()->warning('bridge_key خالی است — پل به ورکر غیرفعال می‌ماند. از پنل مالک (/mc/admin → تب API) کلید را بردارید و در config.yml بگذارید.');
        } else {
            $this->bridge = new BridgeClient($base, $key);
        }

        $this->getServer()->getPluginManager()->registerEvents(new Listener\PlayerListener($this), $this);
        $this->getServer()->getCommandMap()->register('novaedge', new Commands\NovaCommand($this));

        // حلقهٔ اصلی: ۲۰ تیک بر ثانیه برای مغز بات‌ها + تخلیهٔ صف پل + هارت‌بیت
        $this->getScheduler()->scheduleRepeatingTask(new ClosureTask(function (): void {
            $this->tick();
        }), 1);
        $this->getLogger()->info('Nova Edge فعال شد — ' . count($this->sessions) . ' مچ فعال، پل: ' . ($this->bridge ? 'وصل' : 'قطع'));
    }

    public function onDisable(): void
    {
        foreach ($this->sessions as $s) {
            $s->abort('server_shutdown');
        }
    }

    public function bridge(): ?BridgeClient
    {
        return $this->bridge;
    }

    /** @return array<string, GameSession> */
    public function sessions(): array
    {
        return $this->sessions;
    }

    public function profile(string $name): ?array
    {
        return $this->profiles[strtolower($name)] ?? null;
    }

    public function runtime(): array
    {
        return $this->runtime;
    }

    /** شروع یک مچ جدید با پر کردن جای خالی با بات تطبیقی */
    public function startMatch(string $modeId, array $humans, int $fillSlots, int $seed = 0): ?GameSession
    {
        if (!$this->bridge) {
            $this->getLogger()->warning('بدون پل، مچ بدون سطح‌بندی ابری ساخته می‌شود (محلی).');
        }
        $spec = $this->modeSpec($modeId);
        if (!$spec) {
            return null;
        }
        $tier = $this->bridge
            ? ($this->bridge->request('bot/tier', ['mode' => $modeId, 'players' => $humans, 'fill_slots' => $fillSlots, 'seed' => $seed])['json'] ?? null)
            : null;
        $session = new GameSession($this, $spec, $humans, $fillSlots, $tier, $seed);
        $this->sessions[$session->id()] = $session;
        return $session;
    }

    /** spec مود از روی فایل مشترک (همان منبع ورکر/جاوا) */
    public function modeSpec(string $modeId): ?array
    {
        static $cache = null;
        if ($cache === null) {
            $path = dirname(__DIR__, 4) . '/shared/spec/gamemodes.json';
            $json = @file_get_contents($path);
            $cache = $json ? (json_decode($json, true)['modes'] ?? []) : [];
        }
        foreach ($cache as $m) {
            if (($m['id'] ?? '') === $modeId) {
                return $m;
            }
        }
        return null;
    }

    public function tiersSpec(): array
    {
        static $cache = null;
        if ($cache === null) {
            $path = dirname(__DIR__, 4) . '/shared/spec/bot-tiers.json';
            $json = @file_get_contents($path);
            $cache = $json ? json_decode($json, true) : ['tiers' => []];
        }
        return $cache;
    }

    private function tick(): void
    {
        // ۱) تخلیهٔ پاسخ‌های پل
        while ($r = array_shift(BridgeTask::$results)) {
            $this->onBridgeResult($r['action'], $r['json']);
        }
        // ۲) هارت‌بیت
        $now = time();
        if ($this->bridge && $now - $this->lastHeartbeat >= $this->heartbeatEverySec) {
            $this->lastHeartbeat = $now;
            $this->getServer()->getAsyncPool()->submitTask(new BridgeTask(
                (string) $this->getConfig()->get('worker_url'),
                (string) $this->getConfig()->get('bridge_key'),
                'heartbeat',
                [
                    'server_id' => (string) $this->getConfig()->get('server_id', 'bedrock-main'),
                    'name' => $this->getServer()->getMotd(),
                    'software' => 'pocketmine',
                    'version' => $this->getServer()->getVersion(),
                    'players_now' => count($this->getServer()->getOnlinePlayers()),
                    'max_slots' => $this->getServer()->getMaxPlayers(),
                    'bedrock_now' => count($this->getServer()->getOnlinePlayers()),
                    'java_now' => 0,
                    'tps' => round($this->getServer()->getTicksPerSecond(), 2),
                    'mspt' => 0,
                    'bots_active' => array_sum(array_map(fn (GameSession $s) => $s->botCount(), $this->sessions)),
                    'modes' => array_keys($this->sessions),
                ]
            ));
        }
        // ۳) تیک مچ‌ها (مغز بات‌ها)
        foreach ($this->sessions as $id => $s) {
            $s->tick();
            if ($s->finished()) {
                unset($this->sessions[$id]);
            }
        }
    }

    private function onBridgeResult(string $action, array $json): void
    {
        if ($action === 'heartbeat' && !empty($json['config'])) {
            $this->runtime = $json['config'];
        }
        if ($action === 'player/sync' && !empty($json['player'])) {
            $this->profiles[strtolower((string) $json['player']['username'])] = $json['player'];
        }
    }

    /** ورود بازیکن: همگام‌سازی + تحویل گرانت‌ها */
    public function onPlayerJoin(\pocketmine\player\Player $p): void
    {
        if (!$this->bridge) {
            return;
        }
        $name = $p->getName();
        $this->getServer()->getAsyncPool()->submitTask(new BridgeTask(
            (string) $this->getConfig()->get('worker_url'),
            (string) $this->getConfig()->get('bridge_key'),
            'player/sync',
            ['username' => $name, 'platform' => 'bedrock', 'uuid' => $p->getUniqueId()->toString()]
        ));
        $this->getServer()->getAsyncPool()->submitTask(new BridgeTask(
            (string) $this->getConfig()->get('worker_url'),
            (string) $this->getConfig()->get('bridge_key'),
            'grants',
            ['username' => $name]
        ));
    }

    public function deliverGrants(\pocketmine\player\Player $p, array $grants): void
    {
        $ids = [];
        foreach ($grants as $g) {
            $ids[] = $g['id'];
            $kind = (string) ($g['kind'] ?? '');
            $item = (string) ($g['item_id'] ?? '');
            $p->sendMessage("§6[NovaEdge]§r خرید شما فعال شد: §a{$kind} {$item}");
            // اعمال واقعی (رنک/کازمتیک) توسط افزونه‌های جانبی یا 퍼میشتن:
            if ($kind === 'rank') {
                $p->addAttachment($this, 'novaedge.rank.' . $item, true);
            }
        }
        if ($ids && $this->bridge) {
            $this->getServer()->getAsyncPool()->submitTask(new BridgeTask(
                (string) $this->getConfig()->get('worker_url'),
                (string) $this->getConfig()->get('bridge_key'),
                'grants/ack',
                ['ids' => $ids]
            ));
        }
    }

    public function onPlayerQuit(\pocketmine\player\Player $p): void
    {
        foreach ($this->sessions as $s) {
            $s->markLeft($p->getName());
        }
    }

    /** گزارش نمونهٔ آنتی‌چیت به ورکر (حکم نهایی آنجا صادر و لاگ می‌شود) */
    public function reportAnticheat(string $username, array $sample, string $modeId = 'kitpvp', int $ping = 0): void
    {
        if (!$this->bridge) {
            return;
        }
        $this->getServer()->getAsyncPool()->submitTask(new BridgeTask(
            (string) $this->getConfig()->get('worker_url'),
            (string) $this->getConfig()->get('bridge_key'),
            'anticheat',
            ['username' => $username, 'mode' => $modeId, 'ping' => $ping, 'samples' => [$sample]]
        ));
    }
}
