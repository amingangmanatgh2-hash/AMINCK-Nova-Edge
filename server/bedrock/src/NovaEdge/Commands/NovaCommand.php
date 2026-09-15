<?php
// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — Commands/NovaCommand.php
//  /novaedge (alias: ne) — join/start/status برای مچ‌های بات‌دار
// ═══════════════════════════════════════════════════════════════════
declare(strict_types=1);

namespace NovaEdge\Commands;

use NovaEdge\NovaEdgePlugin;
use pocketmine\command\Command;
use pocketmine\command\CommandSender;
use pocketmine\player\Player;

final class NovaCommand extends Command
{
    public function __construct(private NovaEdgePlugin $plugin)
    {
        parent::__construct('novaedge', 'Nova Edge: مچ‌ها و بات‌های تطبیقی', '/novaedge <join|start|status|tiers> [args]', ['ne']);
    }

    public function execute(CommandSender $sender, string $commandLabel, array $args): void
    {
        $sub = strtolower($args[0] ?? 'status');
        switch ($sub) {
            case 'tiers':
                foreach ($this->plugin->tiersSpec()['tiers'] ?? [] as $t) {
                    $sender->sendMessage(sprintf('%s — skill %s | model %s | llm %s', $t['id'], $t['skill'] ?? '?', $t['model'] ?? '—', !empty($t['llm_enabled']) ? 'on' : 'off'));
                }
                return;
            case 'status':
                $sessions = $this->plugin->sessions();
                $sender->sendMessage('§6Nova Edge§r — مچ‌های فعال: ' . count($sessions));
                foreach ($sessions as $s) {
                    $sender->sendMessage(sprintf('  %s | %s | humans %d bots %d | tier %s | %ds', $s->id(), $s->modeId(), $s->humanCount(), $s->botCount(), $s->currentTier(), $s->elapsedSec()));
                }
                $rt = $this->plugin->runtime();
                if ($rt) {
                    $sender->sendMessage('  ورکر: ' . ($rt['server_name'] ?? '?') . ' | crossplay ' . (!empty($rt['crossplay']) ? 'on' : 'off'));
                }
                return;
            case 'start':
                if (!$sender instanceof Player && !($sender->isOp() ?? false)) {
                    $sender->sendMessage('فقط از داخل بازی/با op.');
                    return;
                }
                $mode = $args[1] ?? 'bedwars';
                $fill = max(1, min(16, (int) ($args[2] ?? 4)));
                $humans = [];
                if ($sender instanceof Player) {
                    $prof = $this->plugin->profile($sender->getName()) ?? ['id' => $sender->getName(), 'rating' => 1000, 'level' => 1, 'rank_id' => 'free', 'games' => 0];
                    $humans[] = $prof;
                }
                $s = $this->plugin->startMatch($mode, $humans, $fill, random_int(1, 2 ** 31 - 1));
                $sender->sendMessage($s ? '§aمچ ' . $s->id() . ' شروع شد (tier ' . $s->currentTier() . ')' : '§cمود نامعتبر یا پل قطع است.');
                return;
            case 'join':
            default:
                $sender->sendMessage('دستور: /novaedge <status|start <mode> [bots]|tiers>');
        }
    }
}
