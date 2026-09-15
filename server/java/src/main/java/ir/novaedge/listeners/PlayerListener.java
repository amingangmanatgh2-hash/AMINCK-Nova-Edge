// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — listeners/PlayerListener.java
//  رویدادهای بازیکن: ورود/خروج (اطلاع به Worker + صف)، مرگ/کیل (کارنامهٔ
//  جلسات فعال)، حرکت (آنتی‌چیت سرعت با سرعت مجاز پینگ‌محور).
// ═══════════════════════════════════════════════════════════════════
package ir.novaedge.listeners;

import ir.novaedge.NovaEdgePlugin;
import ir.novaedge.core.AntiCheat;
import ir.novaedge.core.Json;
import ir.novaedge.game.GameSession;

import org.bukkit.Location;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.PlayerDeathEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerMoveEvent;
import org.bukkit.event.player.PlayerQuitEvent;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class PlayerListener implements Listener {

    private final NovaEdgePlugin plugin;
    /** وضعیت حرکت هر بازیکن برای آنتی‌چیت سرعت */
    private final Map<String, long[]> moveState = new ConcurrentHashMap<>();
    /** ردیاب تخلف (آنتی‌چیت) */
    private final AntiCheat.ViolationTracker violations = new AntiCheat.ViolationTracker();

    public PlayerListener(NovaEdgePlugin plugin) {
        this.plugin = plugin;
    }

    public AntiCheat.ViolationTracker violations() {
        return violations;
    }

    @EventHandler
    public void onJoin(PlayerJoinEvent ev) {
        Player p = ev.getPlayer();
        // همگام‌سازی پروفایل + تحویل خریدها (گرانت‌ها) از ورکر
        plugin.syncPlayer(p);
        plugin.fetchGrants(p);
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent ev) {
        Player p = ev.getPlayer();
        moveState.remove(p.getUniqueId().toString());
        // کارنامه صادق بماند: خروج در میانهٔ مچ = رویداد leave
        for (GameSession s : plugin.activeSessions().values()) {
            s.markLeft(p.getName());
        }
    }

    /** آنتی‌چیت سرعت — نمونه با کلید check مثل موتور مشترک (anticheat.js) */
    @EventHandler
    public void onMove(PlayerMoveEvent ev) {
        Player p = ev.getPlayer();
        Location from = ev.getFrom();
        Location to = ev.getTo();
        if (to == null || p.isFlying() || p.isGliding() || p.isInsideVehicle() || p.isSwimming()) {
            return;
        }
        long now = System.currentTimeMillis();
        long[] last = moveState.get(p.getUniqueId().toString());
        if (last == null) {
            moveState.put(p.getUniqueId().toString(), new long[]{now, Double.doubleToLongBits(from.getX()), Double.doubleToLongBits(from.getZ())});
            return;
        }
        double interval = (now - last[0]) / 1000.0;
        if (interval <= 0.05) {
            return; // نمونهٔ خیلی نزدیک — نادیده
        }
        double lx = Double.longBitsToDouble(last[1]);
        double lz = Double.longBitsToDouble(last[2]);
        double dx = to.getX() - lx;
        double dz = to.getZ() - lz;
        double delta = Math.sqrt(dx * dx + dz * dz);
        double perTick = delta / Math.max(1, interval * 20.0); // بلوک بر تیک — واحد موتور

        Map<String, Object> sample = Json.obj();
        Json.put(sample, "check", "speed");
        Json.put(sample, "value", perTick);
        Json.put(sample, "sprinting", p.isSprinting());
        Json.put(sample, "ping", (double) Math.max(0, p.getPing()));
        Json.put(sample, "on_ground", p.isOnGround());
        Map<String, Object> cfg = new HashMap<>();
        Map<String, Object> verdict = violations.record(p.getUniqueId().toString(), sample, cfg, now);
        moveState.put(p.getUniqueId().toString(), new long[]{now, Double.doubleToLongBits(to.getX()), Double.doubleToLongBits(to.getZ())});

        String action = Json.str(verdict, "action", "none");
        double score = Json.num(verdict, "score", 0);
        if ("none".equals(action)) {
            return;
        }
        // گزارش به ورکر — حکم/لاگ مرکزی در داشبورد تخلفات
        plugin.reportAnticheat(p.getName(), sample, "kitpvp", Math.max(0, p.getPing()));
        StringBuilder rb = new StringBuilder();
        List<Object> rl = Json.list(verdict.get("reasons"));
        if (rl != null) {
            for (Object o : rl) {
                if (rb.length() > 0) {
                    rb.append(" | ");
                }
                rb.append(o);
            }
        }
        String reasons = rb.toString();
        switch (action) {
            case "warn" -> p.sendMessage("§c[NovaEdge] §fهشدار آنتی‌چیت — حرکت غیرعادی تشخیص داده شد (امتیاز " + (long) score + ").");
            case "kick" -> p.kickPlayer("§c[NovaEdge AntiCheat] §fحرکت غیرعادی — score=" + (long) score);
            case "tempban", "ban" -> {
                long hours = (long) Json.num(verdict, "tempban_hours", 0);
                java.util.Date expires = "tempban".equals(action) && hours > 0
                        ? new java.util.Date(now + hours * 3600_000L)
                        : null;
                p.banPlayer("§c[NovaEdge AntiCheat] " + reasons, expires, "NovaEdge");
            }
            default -> { }
        }
    }

    /** مرگ → رویداد death در تمام جلسات فعال (کارنامهٔ پایان مچ) */
    @EventHandler
    public void onDeath(PlayerDeathEvent ev) {
        Player p = ev.getEntity();
        for (GameSession s : plugin.activeSessions().values()) {
            s.addEvent(p.getUniqueId().toString(), "death", 1);
        }
        Player killer = p.getKiller();
        if (killer != null) {
            for (GameSession s : plugin.activeSessions().values()) {
                s.addEvent(killer.getUniqueId().toString(), "kill", 1);
            }
        }
    }
}
