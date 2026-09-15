// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — core/BotTier.java (پورت دقیق shared/engine/bottier.js)
// ═══════════════════════════════════════════════════════════════════
package ir.novaedge.core;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

public final class BotTier {

    public static final String[] TIER_ORDER = {"T0", "T1", "T2", "T3", "T4"};

    private static final double[][] THRESH = {{0.0, 0}, {0.22, 1}, {0.42, 2}, {0.62, 3}, {0.8, 4}};

    private BotTier() {
    }

    public static int tierIndex(String id) {
        for (int i = 0; i < TIER_ORDER.length; i++) {
            if (TIER_ORDER[i].equals(id)) {
                return i;
            }
        }
        return 0;
    }

    public static Map<String, Object> tierById(Map<String, Object> tiersSpec, String id) {
        List<Map<String, Object>> list = Json.mapList(tiersSpec == null ? null : tiersSpec.get("tiers"));
        if (list.isEmpty() && tiersSpec != null) {
            list = Json.mapList(tiersSpec);
        }
        for (Map<String, Object> t : list) {
            if (Json.str(t, "id", "").equals(id)) {
                return t;
            }
        }
        return list.isEmpty() ? null : list.get(0);
    }

    public static String shiftTier(String id, double delta, String capId, String floorId) {
        int i = (int) Rng.clamp(tierIndex(id) + delta, tierIndex(floorId), tierIndex(capId));
        return TIER_ORDER[i];
    }

    public static String maxTier(String a, String b) {
        return tierIndex(a) >= tierIndex(b) ? a : b;
    }

    public static String tierForSkill(double skill) {
        String out = "T0";
        for (double[] t : THRESH) {
            if (skill >= t[0]) {
                out = TIER_ORDER[(int) t[1]];
            }
        }
        return out;
    }

    public static double percentile(List<Double> values, double p) {
        List<Double> list = new ArrayList<>(values);
        list.sort(Comparator.naturalOrder());
        if (list.isEmpty()) {
            return 0;
        }
        int idx = (int) Rng.clamp(Rng.jsRound(p * (list.size() - 1)), 0, list.size() - 1);
        return list.get(idx);
    }

    public static double playerSkill(Map<String, Object> p, List<Map<String, Object>> ranks) {
        Map<String, Object> rank = Json.obj();
        for (Map<String, Object> r : ranks) {
            String pid = p.get("rank_id") != null ? Json.str(p, "rank_id", "") : Json.str(p, "rank", "");
            if (Json.str(r, "id", "").equals(pid)) {
                rank = r;
                break;
            }
        }
        Map<String, Object> arg = Json.obj();
        Json.put(arg, "rating", p.get("rating") != null ? Json.num(p, "rating", 1000) : (p.get("elo") != null ? Json.num(p, "elo", 1000) : 1000));
        Json.put(arg, "level", p.get("level") != null ? Json.num(p, "level", 1) : 1);
        Json.put(arg, "rank_index", p.get("rank_index") != null ? Json.num(p, "rank_index", 0) : Json.num(rank, "index", 0));
        Json.put(arg, "games", p.get("games") != null ? Json.num(p, "games", 0) : Json.num(p, "games_played", 0));
        Json.put(arg, "bias", p.get("rank_bias") != null ? Json.num(p, "rank_bias", 0) : Json.num(rank, "bot_skill_bias", 0));
        return Elo.skillIndex(arg);
    }

    public static Map<String, Object> chooseMatchTier(Map<String, Object> o) {
        Map<String, Object> mode = Json.map(o, "mode");
        Map<String, Object> tiersSpec = Json.map(o, "tiersSpec");
        List<Map<String, Object>> ranks = Json.mapList(o.get("ranks"));
        Map<String, Object> settings = Json.map(o, "settings");
        List<Map<String, Object>> players = Json.mapList(o.get("players"));
        List<Map<String, Object>> humans = new ArrayList<>();
        for (Map<String, Object> p : players) {
            if (!Json.bool(p, "is_bot", false)) {
                humans.add(p);
            }
        }
        List<String> reasons = new ArrayList<>();
        if (tiersSpec == null) {
            tiersSpec = Json.obj();
        }
        if (settings == null) {
            settings = Json.obj();
        }
        if (mode == null) {
            mode = Json.obj();
        }

        String force = Json.str(settings, "force_tier", null);
        if (force != null && !force.isEmpty() && tierIndex(force) >= 0) {
            Map<String, Object> out = Json.obj();
            Json.put(out, "tier", force);
            Json.put(out, "tier_def", tierById(tiersSpec, force));
            Json.put(out, "model", null);
            Json.put(out, "skill_human", 0);
            Json.put(out, "human_count", humans.size());
            Json.put(out, "reasons", List.of("force_tier از تنظیمات ادمین"));
            Json.put(out, "escalated_from", null);
            return out;
        }

        List<Double> skills = new ArrayList<>();
        for (Map<String, Object> p : humans) {
            skills.add(playerSkill(p, ranks));
        }
        boolean useMax = "duels".equals(Json.str(mode, "id", "")) || "thebridge".equals(Json.str(mode, "id", ""));
        double stat;
        if (skills.isEmpty()) {
            stat = 0;
        } else if (useMax) {
            stat = skills.stream().mapToDouble(Double::doubleValue).max().orElse(0);
        } else {
            stat = percentile(skills, "coop".equals(Json.str(mode, "category", "")) ? 0.5 : 0.75);
        }
        String tier = tierForSkill(stat);

        String rankFloor = "T0";
        for (Map<String, Object> p : humans) {
            String pid = p.get("rank_id") != null ? Json.str(p, "rank_id", "") : Json.str(p, "rank", "");
            for (Map<String, Object> r : ranks) {
                if (Json.str(r, "id", "").equals(pid)) {
                    if (Json.truthy(r.get("bot_min_tier"))) {
                        rankFloor = maxTier(rankFloor, Json.str(r, "bot_min_tier", "T0"));
                    }
                    break;
                }
            }
        }
        if (tierIndex(rankFloor) > tierIndex(tier)) {
            reasons.add("رنک بازیکن حاضر کف سطح را به " + rankFloor + " برد");
            tier = rankFloor;
        }

        String cap = modeCap(Json.str(mode, "id", ""));
        if (tierIndex(tier) > tierIndex(cap)) {
            reasons.add("سقف مود " + Json.str(mode, "id", "") + " سطح را به " + cap + " محدود کرد");
            tier = cap;
        }
        String maxTierSetting = Json.str(settings, "max_tier", null);
        if (maxTierSetting != null && !maxTierSetting.isEmpty() && tierIndex(tier) > tierIndex(maxTierSetting)) {
            tier = maxTierSetting;
        }

        Object llmRaw = settings.get("llm_enabled");
        boolean llmEnabled = llmRaw == null || (Json.truthy(llmRaw) && !"0".equals(String.valueOf(llmRaw)));
        if (!llmEnabled) {
            reasons.add("LLM غیرفعال: تصمیم‌ها فقط از درخت رفتار محلی می‌آیند");
        }

        Map<String, Object> esc = Json.map(tiersSpec, "escalation");
        double startOffset = esc != null && esc.get("start_offset") != null
                ? Json.num(esc, "start_offset", 0)
                : (Json.numOr(Json.map(mode, "match"), "duration_sec", 0) != 0 ? -1 : 0);
        String startTier = Json.numOr(Json.map(mode, "match"), "duration_sec", 0) != 0
                ? shiftTier(tier, startOffset, tier, "T0")
                : tier;
        if (!startTier.equals(tier)) {
            reasons.add("شروع از " + startTier + " و ترفیع تدریجی تا " + tier + " در طول مچ");
        }

        Map<String, Object> tierDef = tierById(tiersSpec, tier);
        Map<String, Object> out = Json.obj();
        Json.put(out, "tier", tier);
        Json.put(out, "start_tier", startTier);
        Json.put(out, "tier_def", tierDef);
        Json.put(out, "start_tier_def", tierById(tiersSpec, startTier));
        Json.put(out, "model", llmEnabled && tierDef != null ? tierDef.get("model") : null);
        Json.put(out, "llm_enabled", llmEnabled && tierDef != null && Json.bool(tierDef, "llm_enabled", false));
        Json.put(out, "skill_human", Rng.roundTo(stat, 3));
        Json.put(out, "human_count", humans.size());
        Json.put(out, "bot_count", players.size() - humans.size());
        Json.put(out, "reasons", reasons);
        Json.put(out, "cap", cap);
        return out;
    }

    public static String modeCap(String modeId) {
        return switch (modeId) {
            case "tntrun", "parkour" -> "T2";
            case "spleef" -> "T3";
            case "buildbattle" -> "T4";
            case "factions" -> "T3";
            default -> "T4";
        };
    }

    public static Map<String, Object> tierAtTime(String baseTier, String startTier, Map<String, Object> o) {
        Map<String, Object> esc = Json.map(o, "escalation");
        List<Map<String, Object>> steps = esc == null ? List.of() : Json.mapList(esc.get("ramp_steps"));
        double duration = Math.max(1, Json.num(o, "duration_sec", 0));
        double elapsed = Rng.clamp(Json.num(o, "elapsed_sec", 0), 0, duration);
        double pct = elapsed / duration * 100;

        Map<String, Object> rb = esc == null ? null : Json.map(esc, "comeback_rubbery");
        Object shareRaw = o.get("human_score_share");
        Double humanShare = shareRaw == null ? null : Json.num(shareRaw, 0);
        int extra = 0;
        if (rb != null && Json.bool(rb, "enabled", false) && humanShare != null && Double.isFinite(humanShare)) {
            if (humanShare <= Json.num(rb, "crushed_threshold", 0.25)) {
                Map<String, Object> out = Json.obj();
                Json.put(out, "tier", startTier.isEmpty() ? baseTier : startTier);
                Json.put(out, "delta", 0);
                Json.put(out, "reason", "انسان‌ها عقب‌اند → ترفیع متوقف (rubber-band)");
                return out;
            }
            if (humanShare >= Json.num(rb, "dominating_threshold", 0.65)) {
                extra = 1;
            }
        }

        int delta = 0;
        for (Map<String, Object> s : steps) {
            if (pct >= Json.num(s, "at_pct_of_duration", 0) + (extra == 1 ? -8 : 0)) {
                delta += (int) Json.num(s, "delta", 0);
            }
        }
        String tier = shiftTier(startTier.isEmpty() ? baseTier : startTier, delta, baseTier, "T0");
        Map<String, Object> out = Json.obj();
        Json.put(out, "tier", tier);
        Json.put(out, "delta", delta);
        Json.put(out, "reason", delta != 0 ? Rng.jsRound(pct) + "% از مچ → +" + delta + " سطح" : "بدون ترفیع");
        return out;
    }

    public static Map<String, Object> humanizeBot(Map<String, Object> tierDef, long botSeed, Map<String, Object> o) {
        Map<String, Object> hum = Json.map(o, "humanization");
        if (hum == null) {
            hum = Json.obj();
        }
        if (tierDef == null) {
            tierDef = Json.obj();
        }
        double jitter = Json.num(hum, "per_bot_jitter", 0.18);
        double r = ((botSeed == 0 ? 1 : botSeed) % 1000) / 1000.0;
        double elapsed = Json.num(o, "elapsed_sec", 0);
        double fatigue = 0;
        Map<String, Object> fat = Json.map(hum, "fatigue");
        if (fat != null && Json.bool(fat, "enabled", false) && elapsed > Json.num(fat, "skill_decay_after_sec", 420)) {
            double decay = Json.num(fat, "decay", 0.06);
            fatigue = Math.min(decay, (elapsed - 420) / 600.0 * decay);
        }
        double skill = Rng.clamp(Json.num(tierDef, "skill", 0.2) - fatigue + Json.num(o, "rank_bias", 0), 0, 1);

        Map<String, Object> out = Json.obj();
        Json.put(out, "skill", Rng.roundTo(skill, 3));
        Map<String, Object> rm = Json.obj();
        Json.put(rm, "min", Rng.jsRound(j(Json.num(tierDef, "reaction_ms.min", def(tierDef, "reaction_ms", "min", 400)), r, jitter, true)));
        Json.put(rm, "max", Rng.jsRound(j(Json.num(tierDef, "reaction_ms.max", def(tierDef, "reaction_ms", "max", 700)), r, jitter, true)));
        Json.put(out, "reaction_ms", rm);
        Map<String, Object> ae = Json.obj();
        Json.put(ae, "min", Rng.roundTo(j(def(tierDef, "aim_error_deg", "min", 5), r, jitter, true), 1));
        Json.put(ae, "max", Rng.roundTo(j(def(tierDef, "aim_error_deg", "max", 12), r, jitter, true), 1));
        Json.put(out, "aim_error_deg", ae);
        Json.put(out, "mistake_rate", Rng.clamp(j(Json.num(tierDef, "mistake_rate", 0.1), r, jitter, true), 0.01, 0.5));
        Json.put(out, "bridge_quality", Rng.clamp(j(Json.num(tierDef, "bridge_quality", 0.5), r, jitter, false), 0, 1));
        Json.put(out, "combo_chance", Rng.clamp(j(Json.num(tierDef, "combo_chance", 0.2), r, jitter, false), 0, 1));
        Json.put(out, "strafe_quality", Rng.clamp(j(Json.num(tierDef, "strafe_quality", 0.4), r, jitter, false), 0, 1));
        Json.put(out, "teamwork", Rng.clamp(j(Json.num(tierDef, "teamwork", 0.3), r, jitter, false), 0, 1));
        Json.put(out, "retreat_hp", Rng.clamp(j(Json.num(tierDef, "retreat_hp", 0.25), r, jitter, false), 0, 0.6));
        Json.put(out, "build_skill", Rng.clamp(j(Json.num(tierDef, "build_skill", 0.3), r, jitter, false), 0, 1));
        Json.put(out, "deception", Rng.clamp(j(Json.num(tierDef, "deception", 0), r, jitter, true), 0, 1));
        Json.put(out, "resource_efficiency", Rng.clamp(j(Json.num(tierDef, "resource_efficiency", 0.5), r, jitter, false), 0, 1));
        Json.put(out, "decision_hz", (long) Math.max(1, Rng.jsRound(j(Json.num(tierDef, "decision_hz", 5), r, jitter, false))));
        Json.put(out, "fatigue", fatigue);
        Map<String, Object> chat = Json.map(hum, "chat");
        Json.put(out, "chat_enabled", tierIndex(Json.str(tierDef, "id", "")) >= tierIndex(Json.str(chat, "enabled_from_tier", "T2")));
        Json.put(out, "chat_per_min", Math.min(2, Json.num(chat, "messages_per_min_max", 2)));
        return out;
    }

    private static double def(Map<String, Object> tierDef, String group, String key, double dflt) {
        Map<String, Object> g = Json.map(tierDef, group);
        return g == null ? dflt : Json.num(g, key, dflt);
    }

    private static double j(double v, double r, double jitter, boolean inv) {
        double f = 1 + (r - 0.5) * 2 * jitter * (inv ? -1 : 1);
        return Rng.roundTo(v * f, 3);
    }

    public static Map<String, Object> llmBudget(Map<String, Object> tierDef, Map<String, Object> modeSpec, int botCount, Map<String, Object> guard) {
        if (guard == null) {
            guard = Json.obj();
        }
        double perMatch = Json.numOr(guard, "max_llm_calls_per_match", 400);
        double perBot = Json.numOr(guard, "max_llm_calls_per_bot_per_match", 90);
        Map<String, Object> bot = Json.map(modeSpec, "bot");
        Map<String, Object> intervals = bot == null ? null : Json.map(bot, "llm_interval_sec");
        double interval = intervals == null || tierDef == null ? 0 : Json.num(intervals, Json.str(tierDef, "id", ""), 0);
        double duration = Json.num(Json.map(modeSpec, "match"), "duration_sec", 0);
        long theoretical = interval > 0 && duration > 0 ? (long) Math.floor(duration / interval) * botCount : 0;
        double capped = Math.min(Math.min(theoretical, perBot * botCount), perMatch);
        Map<String, Object> out = Json.obj();
        Json.put(out, "interval_sec", interval);
        Json.put(out, "per_bot", perBot);
        Json.put(out, "per_match", perMatch);
        Json.put(out, "theoretical", theoretical);
        Json.put(out, "allowed", capped);
        Json.put(out, "llm_used", capped > 0);
        return out;
    }
}
