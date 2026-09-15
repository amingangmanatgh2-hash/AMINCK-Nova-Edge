// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — commands/NovaCommand.java
//  /novaedge (و /ne): وضعیت، صف، شروع مچ، آمار بات‌ها
// ═══════════════════════════════════════════════════════════════════
package ir.novaedge.commands;

import ir.novaedge.NovaEdgePlugin;
import ir.novaedge.game.GameSession;

import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;

public class NovaCommand implements CommandExecutor {

    private final NovaEdgePlugin plugin;

    public NovaCommand(NovaEdgePlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
        String sub = args.length > 0 ? args[0].toLowerCase() : "status";
        switch (sub) {
            case "status" -> {
                sender.sendMessage("§6[NovaEdge] §fسرور: " + plugin.bridge().serverId()
                        + " | متصل: " + (plugin.bridge().configured() ? "§aبله" : "§cنه (آفلاین)")
                        + " | جلسات فعال: §b" + plugin.activeSessions().size());
            }
            case "join", "queue" -> {
                if (!(sender instanceof Player p)) {
                    sender.sendMessage("§cفقط بازیکن می‌تواند وارد صف شود.");
                    return true;
                }
                String mode = args.length > 1 ? args[1] : "bedwars";
                plugin.joinQueue(p.getUniqueId().toString(), p.getName(), mode);
                p.sendMessage("§a[NovaEdge] §fوارد صف §b" + mode + " §fشدی.");
            }
            case "start" -> {
                String mode = args.length > 1 ? args[1] : "bedwars";
                GameSession s = plugin.startLocalMatch(mode);
                sender.sendMessage(s != null
                        ? "§a[NovaEdge] §fمچ §b" + mode + " §fشروع شد (id=" + s.id() + "، بات=" + s.botCount() + ")."
                        : "§c[NovaEdge] مود ناشناخته: " + mode);
            }
            case "sessions" -> {
                if (plugin.activeSessions().isEmpty()) {
                    sender.sendMessage("§7جلسهٔ فعالی نیست.");
                }
                for (GameSession s : plugin.activeSessions().values()) {
                    sender.sendMessage("§6[NovaEdge] §f" + s.id() + " — مود: §b" + s.modeId()
                            + " | تیم‌ها: §b" + s.teams().size()
                            + " | تیر: §b" + s.currentTier()
                            + " | سپری‌شده: §b" + s.elapsedSec() + "s");
                }
            }
            case "reload" -> {
                plugin.reloadConfig();
                sender.sendMessage("§a[NovaEdge] §fکانفیگ بازخوانی شد (برای اتصال جدید، سرور را ری‌استارت کنید).");
            }
            default -> sender.sendMessage("§e/novaedge §f<status|join <mode>|start <mode>|sessions|reload>");
        }
        return true;
    }
}
