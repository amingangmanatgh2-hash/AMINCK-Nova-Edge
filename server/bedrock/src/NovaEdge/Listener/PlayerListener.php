<?php
// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — Listener/PlayerListener.php
// ═══════════════════════════════════════════════════════════════════
declare(strict_types=1);

namespace NovaEdge\Listener;

use NovaEdge\NovaEdgePlugin;
use pocketmine\event\Listener;
use pocketmine\event\player\PlayerJoinEvent;
use pocketmine\event\player\PlayerQuitEvent;

final class PlayerListener implements Listener
{
    public function __construct(private NovaEdgePlugin $plugin)
    {
    }

    public function onJoin(PlayerJoinEvent $e): void
    {
        $this->plugin->onPlayerJoin($e->getPlayer());
    }

    public function onQuit(PlayerQuitEvent $e): void
    {
        $this->plugin->onPlayerQuit($e->getPlayer());
    }
}
