// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — game/BotController.java (پورت دقیق Bots/BotController.php)
//  یک بات زنده: مغز محلی (Brain) در هر تصمیم + انسانی‌سازی (تاخیر/خطا/
//  اشتباه عمدی) + مشورت گاه‌به‌گاه ابری از طریق ورکر (bot/decide).
//  ⚠️ هیچ aim-lock یا واکنش صفر-ثانیه‌ای وجود ندارد: پارامترها از
//     BotTier.humanizeBot می‌آیند و per-bot jitter دارند.
// ═══════════════════════════════════════════════════════════════════
package ir.novaedge.game;

import ir.novaedge.core.Brain;
import ir.novaedge.core.Json;
import ir.novaedge.core.Rng;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class BotController {

    private final Map<String, Object> profile;
    private final int team;
    private final Map<String, Object> params;
    private final Rng.Generator rng;

    private Map<String, Object> lastDecision = defaultDecision();
    private int llmCalls = 0;
    private long lastLlmMs = -100_000_000L;
    private double lastLlmElapsed = -1e9; // بر حسب elapsed_sec مچ (هم‌واحد با shouldConsultLlm)
    private Map<String, Object> cloudPlan = null; // {ts_ms, decision}

    /** شبیه‌سازی وضعیت محلی بات (در سرور واقعی از رویدادهای آرنا پر می‌شود) */
    private final Map<String, Object> sim = defaultSim();

    private static Map<String, Object> defaultDecision() {
        Map<String, Object> d = Json.obj();
        Json.put(d, "action", "idle");
        Json.put(d, "target", null);
        return d;
    }

    private static Map<String, Object> defaultSim() {
        Map<String, Object> s = Json.obj();
        Json.put(s, "hp", 20);
        Json.put(s, "enemies", new ArrayList<>());
        Json.put(s, "allies", new ArrayList<>());
        Json.put(s, "gen_dist", 6);
        return s;
    }

    public BotController(Map<String, Object> profile, int team, Map<String, Object> params, Rng.Generator rng) {
        this.profile = profile;
        this.team = team;
        this.params = params;
        this.rng = rng;
    }

    public Map<String, Object> params() {
        return params;
    }

    public int llmCalls() {
        return llmCalls;
    }

    public Map<String, Object> profile() {
        return profile;
    }

    public int teamIndex() {
        return team;
    }

    /** ساخت ctx مشترک (همان فرمت brain.js) برای decide و مشورت ابری */
    private Map<String, Object> buildCtx(Map<String, Object> world, Map<String, Object> mode) {
        Map<String, Object> botState = Json.obj();
        Json.put(botState, "id", Json.str(profile, "id", "bot"));
        Json.put(botState, "team", team);
        Json.put(botState, "hp", Json.num(sim, "hp", 20));
        Json.put(botState, "max_hp", 20);
        Json.put(botState, "inventory", profile.get("inventory") != null ? profile.get("inventory") : Json.obj());
        Json.put(botState, "resources", profile.get("resources") != null ? profile.get("resources") : Json.obj());

        Map<String, Object> ctx = Json.obj();
        Json.put(ctx, "mode", mode);
        Json.put(ctx, "tier", Json.str(params, "tier_id", "T1"));
        Json.put(ctx, "bot", botState);
        Json.put(ctx, "world", world);
        Json.put(ctx, "params", params);
        ctx.put("rng", rng);
        return ctx;
    }

    /** تصمیم این تیک: محلی قطعی + ادغام نقشهٔ ابری اگر رسیده باشد */
    public Map<String, Object> decide(Map<String, Object> world, Map<String, Object> mode) {
        Map<String, Object> ctx = buildCtx(world, mode);
        Map<String, Object> local = Brain.heuristicDecide(ctx);
        Map<String, Object> decision = Brain.humanizeAction(local, params, rng);

        // اگر نقشهٔ ابری قبلاً رسیده و هنوز معتبر است (<۱۵ ثانیه)، اولویت با آن است
        if (cloudPlan != null && (System.currentTimeMillis() - Json.num(cloudPlan, "ts_ms", 0)) < 15_000) {
            Map<String, Object> cloud = Json.obj();
            Json.put(cloud, "ok", true);
            Json.put(cloud, "decision", cloudPlan.get("decision"));
            Map<String, Object> merged = Brain.mergeDecisions(local, cloud);
            if (Json.bool(merged, "cloud_used", false) && !"idle".equals(Json.str(merged, "action", "idle"))) {
                decision = Brain.humanizeAction(merged, params, rng);
            }
        }
        lastDecision = decision;
        return decision;
    }

    /**
     * اگر زمان مشورت ابری رسیده باشد (interval + بودجه + کش هش وضعیت)،
     * payload مسیر /api/mc/v1/bot/decide را می‌سازد؛ وگرنه null.
     * @param sessionBudget {llm_enabled, per_bot, allowed_total, used_total, cache}
     */
    public Map<String, Object> consultPayloadIfNeeded(Map<String, Object> world, Map<String, Object> mode,
            String matchId, int botCount, Map<String, Object> sessionBudget) {
        Map<String, Object> ctx = buildCtx(world, mode);
        Map<String, Object> budget = Json.obj();
        Json.put(budget, "llm_enabled", Json.bool(sessionBudget, "llm_enabled", false));
        Json.put(budget, "used", (double) llmCalls);
        Json.put(budget, "allowed", Json.num(sessionBudget, "per_bot", 90));
        Json.put(budget, "last_call_sec", lastLlmElapsed);
        Json.put(budget, "cache", sessionBudget.get("cache"));
        if (!Brain.shouldConsultLlm(ctx, budget)) {
            return null;
        }
        if (Json.num(sessionBudget, "used_total", 0) >= Json.num(sessionBudget, "allowed_total", 400)) {
            return null;
        }
        lastLlmElapsed = Json.num(world, "elapsed_sec", 0);
        Map<String, Object> ctxJson = Json.obj();
        Json.put(ctxJson, "match_id", matchId);
        Json.put(ctxJson, "bot", ctx.get("bot"));
        Json.put(ctxJson, "world", ctx.get("world"));
        Json.put(ctxJson, "bot_count", (double) botCount);
        return cloudRequestPayload(ctxJson, Json.str(mode, "id", "unknown"), Json.str(params, "tier_id", "T1"));
    }

    /**
     * آماده‌سازی درخواست مشورت ابری — ارسال واقعی با GameSession/پلاگین
     * (بودجهٔ فراخوانی از BotTier.llmBudget اعمال می‌شود).
     * @return payload برای مسیر /api/mc/v1/bot/decide
     */
    public Map<String, Object> cloudRequestPayload(Map<String, Object> ctxJson, String modeId, String tier) {
        llmCalls++;
        lastLlmMs = System.currentTimeMillis();
        Map<String, Object> out = Json.obj();
        Json.put(out, "mode", modeId);
        Json.put(out, "tier", tier);
        Json.put(out, "match_id", Json.str(ctxJson, "match_id", ""));
        Json.put(out, "bot", ctxJson.get("bot") != null ? ctxJson.get("bot") : Json.obj());
        Json.put(out, "world", ctxJson.get("world") != null ? ctxJson.get("world") : Json.obj());
        Json.put(out, "bot_count", (long) Json.num(ctxJson, "bot_count", 1));
        Json.put(out, "seed", (long) Json.num(profile, "seed", 1));
        return out;
    }

    public long secondsSinceLlm() {
        return (System.currentTimeMillis() - lastLlmMs) / 1000L;
    }

    public void setCloudPlan(Map<String, Object> decision) {
        cloudPlan = Json.obj();
        Json.put(cloudPlan, "ts_ms", System.currentTimeMillis());
        Json.put(cloudPlan, "decision", decision);
    }

    public Map<String, Object> lastDecision() {
        return lastDecision;
    }

    // ── دسترسی‌های snapshot برای GameSession ─────────────────────────
    public List<Map<String, Object>> nearbyEnemies() {
        return Json.mapList(sim.get("enemies"));
    }

    public List<Map<String, Object>> nearbyAllies() {
        return Json.mapList(sim.get("allies"));
    }

    public Map<String, Object> objectives() {
        Map<String, Object> o = Json.map(sim, "objectives");
        if (o != null) {
            return o;
        }
        Map<String, Object> dflt = Json.obj();
        Map<String, Object> myBed = Json.obj();
        Json.put(myBed, "obsidian", false);
        Json.put(dflt, "my_bed", myBed);
        Json.put(dflt, "bed_threat_dist", 999);
        Json.put(dflt, "enemy_beds", new ArrayList<>());
        return dflt;
    }

    public long teamScore() {
        return (long) Json.num(sim, "team_score", 0);
    }

    public long enemyScore() {
        return (long) Json.num(sim, "enemy_score", 0);
    }

    public double genDist() {
        return Json.num(sim, "gen_dist", 6);
    }

    public List<Map<String, Object>> shopAffordable() {
        return Json.mapList(sim.get("shop_affordable"));
    }

    public double gearGap() {
        return Json.num(sim, "gear_gap", 0);
    }

    /** به‌روزرسانی وضعیت از رویدادهای واقعی سرور (ضربه، حرکت، منبع…) */
    public void updateSim(Map<String, Object> patch) {
        if (patch != null) {
            sim.putAll(patch);
        }
    }

    /** کپی سطحی sim برای لاگ/گزارش */
    public Map<String, Object> sim() {
        return new LinkedHashMap<>(sim);
    }
}
