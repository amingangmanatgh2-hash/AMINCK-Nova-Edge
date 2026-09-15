// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — NovaEdgePlugin.java (پلاگین Paper/Spigot)
//  معادل NovaEdgePlugin.php: اتصال به Worker (HMAC)، صف محلی، جلسات
//  بازی با بات‌های AI، ضربان، آنتی‌چیت و دستورات.
// ═══════════════════════════════════════════════════════════════════
package ir.novaedge;

import ir.novaedge.bridge.BridgeClient;
import ir.novaedge.commands.NovaCommand;
import ir.novaedge.core.Json;
import ir.novaedge.core.Spec;
import ir.novaedge.game.GameSession;
import ir.novaedge.listeners.PlayerListener;

import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitTask;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public final class NovaEdgePlugin extends JavaPlugin {

    private BridgeClient bridge;
    private PlayerListener playerListener;
    private final Map<String, GameSession> active = new ConcurrentHashMap<>();
    private BukkitTask heartbeatTask;
    private BukkitTask tickTask;
    private String defaultTier = "T1";
    private boolean cloudEnabled = true;
    private boolean offlineBotsLocalBrain = true;
    private final List<Map<String, Object>> queue = new ArrayList<>();

    @Override
    public void onEnable() {
        saveDefaultConfig();
        FileConfiguration cfg = getConfig();
        String url = cfg.getString("worker_url", "");
        String key = cfg.getString("bridge_key", "");
        String serverId = cfg.getString("server_id", "nova-java-main");
        defaultTier = cfg.getString("default_tier", "T1");
        cloudEnabled = cfg.getBoolean("cloud_llm_enabled", true);
        offlineBotsLocalBrain = cfg.getBoolean("offline_bots_local_brain", true);

        bridge = new BridgeClient(url, key, serverId);
        playerListener = new PlayerListener(this);
        getServer().getPluginManager().registerEvents(playerListener, this);

        NovaCommand cmd = new NovaCommand(this);
        if (getCommand("novaedge") != null) {
            getCommand("novaedge").setExecutor(cmd);
        }
        if (getCommand("ne") != null) {
            getCommand("ne").setExecutor(cmd);
        }

        // ضربان به Worker — وضعیت سرور و بازیکنان آنلاین
        long hbSec = cfg.getLong("heartbeat_sec", 30);
        heartbeatTask = getServer().getScheduler().runTaskTimerAsynchronously(this, this::sendHeartbeat,
                20L * hbSec, 20L * hbSec);

        // تیک جلسات روی نخ اصلی (۲۰ بار در ثانیه — مثل Bedrock)
        tickTask = getServer().getScheduler().runTaskTimer(this, this::tickSessions, 1L, 1L);

        if (!bridge.configured()) {
            getLogger().warning("[NovaEdge] bridge_key/worker_url خالی است — حالت آفلاین (بات‌ها با مغز محلی).");
        } else {
            getLogger().info("[NovaEdge] متصل به " + bridge.url() + " به‌عنوان " + serverId);
        }
    }

    @Override
    public void onDisable() {
        if (heartbeatTask != null) {
            heartbeatTask.cancel();
        }
        if (tickTask != null) {
            tickTask.cancel();
        }
        for (GameSession s : active.values()) {
            s.abort("shutdown");
        }
        active.clear();
    }

    // ── دسترسی‌ها ───────────────────────────────────────────────────
    public BridgeClient bridge() {
        return bridge;
    }

    public PlayerListener playerListener() {
        return playerListener;
    }

    public String defaultTier() {
        return defaultTier;
    }

    public boolean cloudEnabled() {
        return cloudEnabled;
    }

    public boolean offlineBotsLocalBrain() {
        return offlineBotsLocalBrain;
    }

    /** مشخصات تیرهای بات (bot-tiers.json داخل jar) */
    public Map<String, Object> tiersSpec() {
        return Spec.tiersSpec();
    }

    public Map<String, GameSession> activeSessions() {
        return active;
    }

    /** اجرا روی نخ اصلی (کال‌بک‌های HTTP روی نخ دیگری هستند) */
    public void mainThread(Runnable r) {
        getServer().getScheduler().runTask(this, r);
    }

    // ── صف و شروع بازی ───────────────────────────────────────────────
    public void joinQueue(String playerId, String username, String modeId) {
        Map<String, Object> entry = new HashMap<>();
        entry.put("player_id", playerId);
        entry.put("username", username);
        entry.put("mode_id", modeId);
        entry.put("joined_at", System.currentTimeMillis() / 1000L);
        queue.add(entry);
        // صف محلی: با رسیدن به حد نصاب، بازی را با بات پر می‌کنیم
        if (queue.size() >= getConfig().getInt("queue_min_players", 1)) {
            startLocalMatch(modeId);
        }
    }

    /** شروع یک مچ محلی با بات‌پرکن — مسیر آفلاین/سبک (مثل PHP) */
    public GameSession startLocalMatch(String modeId) {
        List<Map<String, Object>> entries = new ArrayList<>(queue);
        queue.clear();
        List<Map<String, Object>> humans = new ArrayList<>();
        for (Map<String, Object> e : entries) {
            if (!modeId.equals(e.get("mode_id"))) {
                continue;
            }
            Map<String, Object> p = new HashMap<>();
            p.put("id", e.get("player_id"));
            p.put("username", e.get("username"));
            p.put("platform", "java");
            p.put("is_bot", false);
            p.put("rating", 1000.0);
            p.put("level", 1.0);
            p.put("games", 0.0);
            humans.add(p);
        }
        Map<String, Object> modeSpec = Spec.modeById(modeId);
        if (modeSpec.isEmpty()) {
            getLogger().warning("[NovaEdge] مود ناشناخته: " + modeId);
            return null;
        }
        int fillTo = getConfig().getInt("bots_fill_to", 8);
        int fillSlots = offlineBotsLocalBrain ? Math.max(0, fillTo - humans.size()) : 0;
        GameSession session = new GameSession(this, modeSpec, humans, fillSlots, null, 0);
        active.put(session.id(), session);
        getLogger().info("[NovaEdge] مچ شروع شد: " + modeId + " id=" + session.id()
                + " humans=" + session.humanCount() + " bots=" + session.botCount()
                + " tier=" + session.currentTier());
        return session;
    }

    private void tickSessions() {
        for (GameSession s : new ArrayList<>(active.values())) {
            if (s.finished()) {
                active.remove(s.id());
                continue;
            }
            s.tick();
        }
    }

    private void sendHeartbeat() {
        if (!bridge.configured()) {
            return;
        }
        double tps = 20.0;
        try {
            tps = Math.round(getServer().getTPS()[0] * 100) / 100.0;
        } catch (Throwable ignored) {
            // در Spigot بدون getTPS — همان ۲۰
        }
        long botsActive = 0;
        List<Object> modeIds = new ArrayList<>();
        for (GameSession s : active.values()) {
            botsActive += s.botCount();
            if (!modeIds.contains(s.modeId())) {
                modeIds.add(s.modeId());
            }
        }
        Map<String, Object> payload = Json.obj();
        Json.put(payload, "server_id", bridge.serverId());
        Json.put(payload, "name", getServer().getMotd());
        Json.put(payload, "software", "paper");
        Json.put(payload, "version", getServer().getVersion());
        Json.put(payload, "players_now", (double) getServer().getOnlinePlayers().size());
        Json.put(payload, "max_slots", (double) getServer().getMaxPlayers());
        Json.put(payload, "bedrock_now", 0);
        Json.put(payload, "java_now", (double) getServer().getOnlinePlayers().size());
        Json.put(payload, "tps", tps);
        Json.put(payload, "mspt", 0);
        Json.put(payload, "bots_active", (double) botsActive);
        Json.put(payload, "modes", modeIds);
        bridge.send("/api/mc/v1/heartbeat", payload, null);
    }

    // ── همگام‌سازی بازیکن و گرانت‌ها (مثل NovaEdgePlugin.php) ────────
    /** ورود بازیکن: ساخت/به‌روزرسانی پروفایل در ورکر */
    public void syncPlayer(org.bukkit.entity.Player p) {
        if (!bridge.configured()) {
            return;
        }
        Map<String, Object> payload = Json.obj();
        Json.put(payload, "username", p.getName());
        Json.put(payload, "platform", "java");
        Json.put(payload, "uuid", p.getUniqueId().toString());
        bridge.send("/api/mc/v1/player/sync", payload, null);
    }

    /** دریافت خریدهای تحویل‌نشده (گرانت) و اعمال آن‌ها روی بازیکن */
    public void fetchGrants(org.bukkit.entity.Player p) {
        if (!bridge.configured()) {
            return;
        }
        Map<String, Object> payload = Json.obj();
        Json.put(payload, "username", p.getName());
        bridge.send("/api/mc/v1/grants", payload, resp -> {
            if (resp == null || !resp.has("grants")) {
                return;
            }
            String username = p.getName();
            String uuid = p.getUniqueId().toString();
            List<Map<String, Object>> grants = new ArrayList<>();
            for (com.google.gson.JsonElement el : resp.getAsJsonArray("grants")) {
                Map<String, Object> g = ir.novaedge.bridge.BridgeClient.toMap(el.getAsJsonObject());
                if (g != null) {
                    grants.add(g);
                }
            }
            if (grants.isEmpty()) {
                return;
            }
            mainThread(() -> deliverGrants(username, uuid, grants));
        });
    }

    private void deliverGrants(String username, String uuid, List<Map<String, Object>> grants) {
        List<Object> ids = new ArrayList<>();
        org.bukkit.entity.Player p = getServer().getPlayer(java.util.UUID.fromString(uuid));
        for (Map<String, Object> g : grants) {
            ids.add(g.get("id"));
            String kind = Json.str(g, "kind", "");
            String item = Json.str(g, "item_id", "");
            if (p != null) {
                p.sendMessage("§6[NovaEdge]§f خرید شما فعال شد: §a" + kind + " " + item);
                if (kind.equals("rank")) {
                    p.addAttachment(this, "novaedge.rank." + item, true);
                }
            }
        }
        if (!ids.isEmpty() && bridge.configured()) {
            Map<String, Object> ack = Json.obj();
            Json.put(ack, "ids", ids);
            bridge.send("/api/mc/v1/grants/ack", ack, null);
        }
    }

    /** گزارش نمونهٔ آنتی‌چیت به ورکر (حکم نهایی آنجا صادر و لاگ می‌شود) */
    public void reportAnticheat(String username, Map<String, Object> sample, String modeId, int ping) {
        if (!bridge.configured()) {
            return;
        }
        Map<String, Object> payload = Json.obj();
        Json.put(payload, "username", username);
        Json.put(payload, "mode", modeId);
        Json.put(payload, "ping", (double) ping);
        Json.put(payload, "samples", List.of(sample));
        bridge.send("/api/mc/v1/anticheat", payload, null);
    }
}
