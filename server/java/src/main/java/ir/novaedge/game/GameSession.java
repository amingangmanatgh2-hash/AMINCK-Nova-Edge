// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — game/GameSession.java (پورت Game/GameSession.php)
//  یک جلسهٔ مینی‌گیم: تیم‌سازی با بات، تیک ۲۰Hz، ترفیع پلکانی تیر،
//  کارنامهٔ پایان مچ (Scoring/Elo) و گزارش به Worker با امضای HMAC.
// ═══════════════════════════════════════════════════════════════════
package ir.novaedge.game;

import ir.novaedge.NovaEdgePlugin;
import ir.novaedge.core.BotTier;
import ir.novaedge.core.Elo;
import ir.novaedge.core.Json;
import ir.novaedge.core.Matchmaking;
import ir.novaedge.core.Rng;
import ir.novaedge.core.Scoring;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class GameSession {

    private static final SecureRandom SYS_RNG = new SecureRandom();

    private final NovaEdgePlugin plugin;
    private final String id;
    private final Map<String, Object> mode;
    private final List<Map<String, Object>> teams;
    /** بات‌ها بر اساس شناسه */
    private final Map<String, BotController> bots = new LinkedHashMap<>();
    /** رویدادهای تجمع‌یافته per player id */
    private final Map<String, Map<String, Object>> events = new LinkedHashMap<>();
    private final List<Map<String, Object>> humans;
    private final long startMs;
    private final long durationSec;
    private final String baseTier;
    private String currentTier;
    private final String startTier;
    private boolean done = false;
    private long tickCount = 0;
    private final Rng.Generator rng;
    private final Map<String, Object> tierInfo;
    /** بودجهٔ رایزنی ابری جلسه — از BotTier.llmBudget */
    private final Map<String, Object> cloudBudget = Json.obj();

    public GameSession(NovaEdgePlugin plugin, Map<String, Object> mode, List<Map<String, Object>> humans,
            int fillSlots, Map<String, Object> tierInfo, long seed) {
        this.plugin = plugin;
        this.mode = mode != null ? mode : Json.obj();
        this.humans = humans != null ? humans : new ArrayList<>();
        long s = seed != 0 ? seed : (1 + (long) (SYS_RNG.nextDouble() * (Integer.MAX_VALUE - 1L)));
        this.rng = new Rng.Generator((int) s);
        this.id = "bm_" + randomHex(12);
        this.startMs = System.currentTimeMillis();
        this.durationSec = (long) Json.num(Json.map(this.mode, "match"), "duration_sec", 900);

        // سطح هوش: از ورکر اگر هست، وگرنه محلی از روی پروفایل انسان‌ها
        if (tierInfo != null && Json.truthy(tierInfo.get("tier"))) {
            this.tierInfo = tierInfo;
            this.baseTier = Json.str(tierInfo, "tier", plugin.defaultTier());
            this.startTier = Json.str(tierInfo, "start_tier", this.baseTier);
        } else {
            Map<String, Object> o = Json.obj();
            Json.put(o, "mode", this.mode);
            Json.put(o, "players", this.humans);
            Json.put(o, "tiersSpec", plugin.tiersSpec());
            Json.put(o, "ranks", new ArrayList<>());
            Map<String, Object> local = BotTier.chooseMatchTier(o);
            this.tierInfo = local;
            this.baseTier = Json.str(local, "tier", plugin.defaultTier());
            this.startTier = Json.str(local, "start_tier", this.baseTier);
        }
        this.currentTier = this.startTier;

        // تیم‌ها: درفت مارپیچی انسان‌ها + بات‌های هم‌سطح
        int teamCount = (int) Json.num(Json.map(this.mode, "match"), "teams", 2);
        int teamSize = (int) Json.num(Json.map(this.mode, "match"), "team_size", 4);
        Map<String, Object> opts = Json.obj();
        Json.put(opts, "mode", this.mode);
        Json.put(opts, "seed", (double) (seed != 0 ? seed : 1));
        Json.put(opts, "tier", this.startTier);
        Json.put(opts, "crossplay", true);
        this.teams = Matchmaking.balanceTeams(this.humans, fillSlots, teamCount, teamSize, opts);

        // کنترلر بات‌ها با پارامترهای انسانی‌شدهٔ یکتا
        Map<String, Object> tierDef = BotTier.tierById(plugin.tiersSpec(), this.currentTier);
        int i = 0;
        for (Map<String, Object> t : this.teams) {
            for (Map<String, Object> p : Json.mapList(t.get("players"))) {
                if (!Json.bool(p, "is_bot", false)) {
                    continue;
                }
                i++;
                long botSeed = p.get("seed") != null ? (long) Json.num(p, "seed", i) : i;
                Map<String, Object> humOpts = Json.obj();
                Json.put(humOpts, "humanization", plugin.tiersSpec().get("humanization") != null
                        ? plugin.tiersSpec().get("humanization") : Json.obj());
                Map<String, Object> params = BotTier.humanizeBot(tierDef, botSeed, humOpts);
                params.put("tier_id", this.currentTier);
                this.bots.put(Json.str(p, "id", ""), new BotController(p, (int) Json.num(t, "index", 0), params, this.rng));
                this.events.put(Json.str(p, "id", ""), new LinkedHashMap<>());
            }
        }
        for (Map<String, Object> h : this.humans) {
            this.events.put(Json.str(h, "id", ""), new LinkedHashMap<>());
        }

        // بودجهٔ LLM جلسه (مثل llmBudget در ورکر)
        Map<String, Object> budgetSpec = BotTier.llmBudget(tierDef, this.mode, this.bots.size(),
                Json.map(plugin.tiersSpec(), "cost_guard"));
        Json.put(cloudBudget, "llm_enabled", plugin.cloudEnabled() && Json.bool(tierDef, "llm_enabled", false));
        Json.put(cloudBudget, "per_bot", Json.num(budgetSpec, "per_bot", 90));
        Json.put(cloudBudget, "allowed_total", Json.num(budgetSpec, "allowed", 400));
        Json.put(cloudBudget, "used_total", 0);
        Json.put(cloudBudget, "cache", Json.obj());
    }

    private static String randomHex(int len) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < len; i++) {
            sb.append(Integer.toHexString(SYS_RNG.nextInt(16)));
        }
        return sb.toString();
    }

    // ── دسترسی‌ها ───────────────────────────────────────────────────
    public String id() {
        return id;
    }

    public String modeId() {
        return Json.str(mode, "id", "?");
    }

    public int humanCount() {
        return humans.size();
    }

    public int botCount() {
        return bots.size();
    }

    public String currentTier() {
        return currentTier;
    }

    public long elapsedSec() {
        return (System.currentTimeMillis() - startMs) / 1000L;
    }

    public boolean finished() {
        return done;
    }

    public List<Map<String, Object>> teams() {
        return teams;
    }

    public Map<String, BotController> bots() {
        return bots;
    }

    public void markLeft(String name) {
        // بازیکن انسانی خارج شد: رویداد leave ثبت می‌شود تا کارنامه صادق بماند
        for (Map<String, Object> h : humans) {
            String hn = Json.str(h, "username", Json.str(h, "id", ""));
            if (hn.equals(name)) {
                addEvent(Json.str(h, "id", ""), "leave", 1);
            }
        }
    }

    public void addEvent(String playerId, String type, long count) {
        Map<String, Object> ev = events.computeIfAbsent(playerId, k -> new LinkedHashMap<>());
        ev.put(type, Json.num(ev, type, 0) + count);
    }

    /** تیک ۲۰Hz: تصمیم بات‌ها + ترفیع پلکانی سطح + پایان مچ */
    public void tick() {
        if (done) {
            return;
        }
        tickCount++;
        long elapsed = elapsedSec();

        // ترفیع تدریجی (با rubber-band بر اساس سهم امتیاز انسان‌ها)
        if (tickCount % 100 == 0) {
            double share = humanScoreShare();
            Map<String, Object> o = Json.obj();
            Json.put(o, "duration_sec", (double) durationSec);
            Json.put(o, "elapsed_sec", (double) elapsed);
            Json.put(o, "human_score_share", share);
            Json.put(o, "escalation", tierInfo.get("escalation") != null ? tierInfo.get("escalation") : Json.obj());
            Map<String, Object> esc = BotTier.tierAtTime(baseTier, startTier, o);
            currentTier = Json.str(esc, "tier", currentTier);
        }

        // مغز بات‌ها: هر بات با decision_hz خودش تصمیم می‌گیرد
        for (BotController bot : bots.values()) {
            long hz = Math.max(1, (long) Json.num(bot.params(), "decision_hz", 5));
            if (tickCount % Math.max(1, 20 / hz) != 0) {
                continue;
            }
            Map<String, Object> world = worldFor(bot);
            bot.decide(world, mode);
            // رایزنی ابری (bot/decide) — با interval تیر + بودجهٔ llmBudget + کش stateHash
            if (plugin.cloudEnabled() && plugin.bridge().configured() && tickCount % 20 == 0) {
                Map<String, Object> payload = bot.consultPayloadIfNeeded(world, mode, id, bots.size(), cloudBudget);
                if (payload != null) {
                    Json.put(cloudBudget, "used_total", Json.num(cloudBudget, "used_total", 0) + 1);
                    final BotController fbot = bot;
                    plugin.bridge().send("/api/mc/v1/bot/decide", payload, resp -> {
                        if (resp != null && resp.has("decision")) {
                            Map<String, Object> plan = ir.novaedge.bridge.BridgeClient.toMap(resp.getAsJsonObject("decision"));
                            plugin.mainThread(() -> fbot.setCloudPlan(plan));
                        }
                    });
                }
            }
        }

        if (elapsed >= durationSec) {
            finish();
        }
    }

    private double humanScoreShare() {
        double h = 0;
        double t = 0;
        Map<String, Boolean> isHuman = humansById();
        for (Map.Entry<String, Map<String, Object>> e : events.entrySet()) {
            Map<String, Object> ev = e.getValue();
            double pts = Json.num(ev, "kill", 0) + Json.num(ev, "goal", 0) + Json.num(ev, "bed_break", 0);
            t += pts;
            if (Boolean.TRUE.equals(isHuman.get(e.getKey()))) {
                h += pts;
            }
        }
        return t > 0 ? h / t : 0.5;
    }

    private Map<String, Boolean> humansById() {
        Map<String, Boolean> out = new HashMap<>();
        for (Map<String, Object> h : humans) {
            out.put(Json.str(h, "id", ""), true);
        }
        return out;
    }

    /** snapshot جهان برای یک بات (فشرده، همان فرمت shared/engine/brain.js) */
    private Map<String, Object> worldFor(BotController bot) {
        Map<String, Object> w = Json.obj();
        Json.put(w, "elapsed_sec", (double) elapsedSec());
        Json.put(w, "duration_sec", (double) durationSec);
        Json.put(w, "alive_enemies", bot.nearbyEnemies());
        Json.put(w, "alive_allies", bot.nearbyAllies());
        Json.put(w, "objectives", bot.objectives());
        Map<String, Object> scores = Json.obj();
        Json.put(scores, "my_team", (double) bot.teamScore());
        Json.put(scores, "enemy_team", (double) bot.enemyScore());
        Json.put(w, "scores", scores);
        List<Map<String, Object>> resources = new ArrayList<>();
        Map<String, Object> gen = Json.obj();
        Json.put(gen, "id", "gen");
        Json.put(gen, "dist", bot.genDist());
        resources.add(gen);
        Json.put(w, "resources", resources);
        Json.put(w, "shop_affordable", bot.shopAffordable());
        Json.put(w, "gear_gap", bot.gearGap());
        return w;
    }

    /** پایان مچ: کارنامه + ELO + گزارش به ورکر */
    @SuppressWarnings("unchecked")
    public void finish() {
        if (done) {
            return;
        }
        done = true;
        List<Map<String, Object>> players = new ArrayList<>();
        List<Map<String, Object>> results = new ArrayList<>();
        for (Map<String, Object> t : teams) {
            for (Map<String, Object> p : Json.mapList(t.get("players"))) {
                String pid = Json.str(p, "id", "");
                Map<String, Object> ev = events.getOrDefault(pid, new LinkedHashMap<>());
                boolean won = Json.truthy(ev.get("won"));
                Map<String, Object> o = Json.obj();
                Json.put(o, "mode", mode);
                Json.put(o, "events", eventList(ev));
                Json.put(o, "won", won);
                Json.put(o, "placement", (double) (ev.get("placement") != null
                        ? Json.num(ev, "placement", players.size() + 1L)
                        : (won ? 1 : players.size() + 1L)));
                Json.put(o, "players", (double) (humanCount() + botCount()));
                Json.put(o, "duration_sec", (double) elapsedSec());
                Json.put(o, "afk_pct", Json.num(ev, "afk_pct", 0));
                Map<String, Object> res = Scoring.computePlayerResult(o);
                Map<String, Object> r = new LinkedHashMap<>(res);
                r.put("id", pid);
                r.put("is_bot", Json.bool(p, "is_bot", false));
                r.put("kills", Json.num(ev, "kill", 0));
                results.add(r);
                Map<String, Object> pl = Json.obj();
                Json.put(pl, "id", pid);
                Json.put(pl, "is_bot", Json.bool(p, "is_bot", false));
                Json.put(pl, "rating", Json.num(p, "rating", 1000));
                Json.put(pl, "games", (double) Json.num(p, "games", 0));
                Json.put(pl, "won", won);
                Json.put(pl, "score_points", res.get("points"));
                players.add(pl);
            }
        }
        String mvp = Scoring.pickMvp(results);
        Map<String, Object> settle = Elo.settleMatch(mode, players, Json.obj(), teams);
        reportToWorker(results, settle, mvp);
    }

    private static List<Map<String, Object>> eventList(Map<String, Object> ev) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map.Entry<String, Object> e : ev.entrySet()) {
            String type = e.getKey();
            if (type.equals("won") || type.equals("placement") || type.equals("afk_pct") || type.equals("leave")) {
                continue;
            }
            Map<String, Object> m = Json.obj();
            Json.put(m, "type", type);
            Json.put(m, "count", e.getValue());
            out.add(m);
        }
        return out;
    }

    private void reportToWorker(List<Map<String, Object>> results, Map<String, Object> settle, String mvp) {
        List<Map<String, Object>> pluginTeams = new ArrayList<>();
        for (Map<String, Object> t : teams) {
            Map<String, Object> tp = Json.obj();
            Json.put(tp, "index", t.get("index"));
            List<Map<String, Object>> players = new ArrayList<>();
            for (Map<String, Object> p : Json.mapList(t.get("players"))) {
                String pid = Json.str(p, "id", "");
                Map<String, Object> ev = events.getOrDefault(pid, new LinkedHashMap<>());
                Map<String, Object> pp = Json.obj();
                Json.put(pp, "username", Json.str(p, "name", pid));
                Json.put(pp, "platform", Json.str(p, "platform", "java"));
                Json.put(pp, "is_bot", Json.bool(p, "is_bot", false));
                Json.put(pp, "bot_tier", Json.bool(p, "is_bot", false) ? currentTier : null);
                Json.put(pp, "won", Json.truthy(ev.get("won")));
                Json.put(pp, "placement", (long) Json.num(ev, "placement", 0));
                Json.put(pp, "afk_pct", Json.num(ev, "afk_pct", 0));
                Json.put(pp, "events", eventList(ev));
                players.add(pp);
            }
            Json.put(tp, "players", players);
            pluginTeams.add(tp);
        }

        if (!plugin.bridge().configured()) {
            return; // بدون پل، کارنامه فقط محلی می‌ماند (لیدربرد سرور)
        }
        long aiCalls = 0;
        for (BotController b : bots.values()) {
            aiCalls += b.llmCalls();
        }
        Map<String, Object> payload = Json.obj();
        Json.put(payload, "match_id", id);
        Json.put(payload, "mode", modeId());
        Json.put(payload, "server_id", plugin.bridge().serverId());
        Json.put(payload, "duration_sec", (double) elapsedSec());
        Json.put(payload, "tier_start", startTier);
        Json.put(payload, "tier_end", currentTier);
        Json.put(payload, "model", tierInfo.get("model"));
        Json.put(payload, "ai_calls", (double) aiCalls);
        Json.put(payload, "ai_latency_ms", 0);
        Json.put(payload, "winner_team", (double) winnerTeam());
        Json.put(payload, "mvp", mvp);
        Json.put(payload, "teams", pluginTeams);
        plugin.bridge().send("/api/mc/v1/match/report", payload, resp -> {
            if (resp != null) {
                plugin.getLogger().info("[NovaEdge] match report ack: " + resp);
            }
        });
    }

    private int winnerTeam() {
        int best = 0;
        double bestScore = -1;
        for (Map<String, Object> t : teams) {
            double s = 0;
            for (Map<String, Object> p : Json.mapList(t.get("players"))) {
                Map<String, Object> ev = events.getOrDefault(Json.str(p, "id", ""), new LinkedHashMap<>());
                s += Json.num(ev, "kill", 0) + Json.num(ev, "goal", 0);
            }
            if (s > bestScore) {
                bestScore = s;
                best = (int) Json.num(t, "index", 0);
            }
        }
        return best;
    }

    public void abort(String reason) {
        done = true;
    }
}
