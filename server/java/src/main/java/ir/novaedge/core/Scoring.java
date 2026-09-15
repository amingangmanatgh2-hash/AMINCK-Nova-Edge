// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — core/Scoring.java (پورت دقیق shared/engine/scoring.js)
// ═══════════════════════════════════════════════════════════════════
package ir.novaedge.core;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class Scoring {

    private static final String[] EVENT_KEYS = {
            "kill", "death", "final_kill", "final_death", "bed_break", "bed_defend", "assist",
            "resource_collected", "purchase", "team_upgrade", "chest_looted", "blocks_broken",
            "blocks_placed", "player_eliminated", "checkpoint", "fall", "goal", "vote_received",
            "gold_collected", "wave_cleared", "revive", "door_built", "diamond_mined", "gold_mined",
            "apple_eaten", "chunk_claimed", "raid_success", "raid_defend", "power_gained", "innocent_survive",
            "murderer_win", "detective_kill_murderer", "finish" };

    private Scoring() {
    }

    public static Map<String, Double> tallyEvents(List<Map<String, Object>> events) {
        Map<String, Double> t = new LinkedHashMap<>();
        if (events == null) {
            return t;
        }
        for (Map<String, Object> e : events) {
            if (e == null || e.get("type") == null) {
                continue;
            }
            Object c = e.get("count") != null ? e.get("count") : (e.get("value") != null ? e.get("value") : 1);
            double n = Json.num(c, 1);
            String k = String.valueOf(e.get("type"));
            t.merge(k, n, Double::sum);
        }
        return t;
    }

    public static long parkourSpeedBonus(double finishSec, double parSec, double maxBonus) {
        if (finishSec == 0 || parSec == 0 || maxBonus == 0) {
            return 0;
        }
        if (finishSec >= parSec) {
            return 0;
        }
        double ratio = Rng.clamp((parSec - finishSec) / parSec, 0, 1);
        return Rng.jsRound(maxBonus * ratio);
    }

    public static Map<String, Object> computePlayerResult(Map<String, Object> o) {
        Map<String, Object> mode = Json.map(o, "mode");
        Map<String, Object> sc = mode == null ? Json.obj() : Json.map(mode, "scoring");
        Map<String, Object> eco = mode == null ? Json.obj() : Json.map(mode, "economy");
        if (sc == null) {
            sc = Json.obj();
        }
        if (eco == null) {
            eco = Json.obj();
        }
        Map<String, Double> events = tallyEvents(Json.mapList(o.get("events")));
        boolean won = Json.bool(o, "won", false);
        int players = (int) Math.max(1, Json.num(o, "players", 1));
        double placementRaw = Json.num(o, "placement", 0);
        long placement = Rng.jsRound(Rng.clamp(placementRaw != 0 ? placementRaw : (won ? 1 : players), 1, players));
        double duration = Math.max(0, Json.num(o, "duration_sec", 0));
        double afk = Rng.clamp(Json.num(o, "afk_pct", 0), 0, 100);
        Map<String, Object> rank = Json.map(o, "rank");

        List<Map<String, Object>> breakdown = new ArrayList<>();
        double[] points = {0};

        for (String k : EVENT_KEYS) {
            double per = Json.num(sc, k, 0);
            Double cnt = events.get(k);
            if (per == 0 || cnt == null) {
                continue;
            }
            long v = Rng.jsRound(per * cnt);
            if (v != 0) {
                points[0] += v;
                Map<String, Object> b = Json.obj();
                Json.put(b, "label", k);
                Json.put(b, "key", k);
                Json.put(b, "count", cnt);
                Json.put(b, "each", per);
                Json.put(b, "value", v);
                breakdown.add(b);
            }
        }

        if (won && Json.truthy(sc.get("win"))) {
            points[0] += Json.num(sc, "win", 0);
            Map<String, Object> b = Json.obj();
            Json.put(b, "label", "win");
            Json.put(b, "key", "win");
            Json.put(b, "count", 1);
            Json.put(b, "each", sc.get("win"));
            Json.put(b, "value", sc.get("win"));
            breakdown.add(b);
        } else if (!won && Json.truthy(sc.get("lose"))) {
            points[0] += Json.num(sc, "lose", 0);
            Map<String, Object> b = Json.obj();
            Json.put(b, "label", "lose");
            Json.put(b, "key", "lose");
            Json.put(b, "count", 1);
            Json.put(b, "each", sc.get("lose"));
            Json.put(b, "value", sc.get("lose"));
            breakdown.add(b);
        }

        if (Json.truthy(sc.get("survive_min"))) {
            long mins = (long) Math.floor(duration / 60);
            if (mins > 0) {
                double v = Json.num(sc, "survive_min", 0) * mins;
                points[0] += v;
                Map<String, Object> b = Json.obj();
                Json.put(b, "label", "survive_min");
                Json.put(b, "key", "survive_min");
                Json.put(b, "count", mins);
                Json.put(b, "each", sc.get("survive_min"));
                Json.put(b, "value", v);
                breakdown.add(b);
            }
        }

        for (String k : new String[]{"killstreak_5", "killstreak_10"}) {
            if (Json.truthy(sc.get(k)) && events.get(k) != null) {
                double v = Json.num(sc, k, 0) * events.get(k);
                points[0] += v;
                Map<String, Object> b = Json.obj();
                Json.put(b, "label", k);
                Json.put(b, "key", k);
                Json.put(b, "count", events.get(k));
                Json.put(b, "each", sc.get(k));
                Json.put(b, "value", v);
                breakdown.add(b);
            }
        }
        if (Json.truthy(sc.get("streak_bonus")) && events.get("best_streak") != null) {
            double v = Json.num(sc, "streak_bonus", 0) * Math.max(0, events.get("best_streak") - 1);
            if (v > 0) {
                points[0] += v;
                Map<String, Object> b = Json.obj();
                Json.put(b, "label", "streak_bonus");
                Json.put(b, "key", "streak_bonus");
                Json.put(b, "count", events.get("best_streak"));
                Json.put(b, "each", sc.get("streak_bonus"));
                Json.put(b, "value", v);
                breakdown.add(b);
            }
        }

        if ("parkour".equals(Json.str(mode, "id", "")) && Json.truthy(o.get("finish_sec"))) {
            long bonus = parkourSpeedBonus(Json.num(o, "finish_sec", 0), Json.numOr(o, "par_sec", 180), Json.num(sc, "speed_bonus_max", 0));
            if (bonus > 0) {
                points[0] += bonus;
                Map<String, Object> b = Json.obj();
                Json.put(b, "label", "speed_bonus");
                Json.put(b, "key", "speed_bonus");
                Json.put(b, "count", 1);
                Json.put(b, "each", bonus);
                Json.put(b, "value", bonus);
                breakdown.add(b);
            }
        }

        if (Json.truthy(sc.get("perfect_win_bonus")) && won && events.get("death") == null && events.get("fall") == null) {
            points[0] += Json.num(sc, "perfect_win_bonus", 0);
            Map<String, Object> b = Json.obj();
            Json.put(b, "label", "perfect_win");
            Json.put(b, "key", "perfect_win_bonus");
            Json.put(b, "count", 1);
            Json.put(b, "each", sc.get("perfect_win_bonus"));
            Json.put(b, "value", sc.get("perfect_win_bonus"));
            breakdown.add(b);
        }
        if (Json.truthy(sc.get("theme_match_bonus")) && events.get("theme_match") != null) {
            points[0] += Json.num(sc, "theme_match_bonus", 0);
            Map<String, Object> b = Json.obj();
            Json.put(b, "label", "theme_match");
            Json.put(b, "key", "theme_match_bonus");
            Json.put(b, "count", 1);
            Json.put(b, "each", sc.get("theme_match_bonus"));
            Json.put(b, "value", sc.get("theme_match_bonus"));
            breakdown.add(b);
        }
        if (Json.truthy(o.get("mvp")) && Json.truthy(sc.get("mvp_bonus"))) {
            points[0] += Json.num(sc, "mvp_bonus", 0);
            Map<String, Object> b = Json.obj();
            Json.put(b, "label", "mvp");
            Json.put(b, "key", "mvp_bonus");
            Json.put(b, "count", 1);
            Json.put(b, "each", sc.get("mvp_bonus"));
            Json.put(b, "value", sc.get("mvp_bonus"));
            breakdown.add(b);
        }

        double coins = 0;
        for (Map.Entry<String, Object> en : eco.entrySet()) {
            String k = en.getKey();
            if (k.startsWith("xp_")) {
                continue;
            }
            double per = Json.num(en.getValue(), 0);
            if (per == 0) {
                continue;
            }
            if (k.equals("win")) {
                if (won) {
                    coins += per;
                }
                continue;
            }
            if (k.equals("lose")) {
                if (!won) {
                    coins += per;
                }
                continue;
            }
            if (k.equals("survive_min")) {
                coins += per * Math.floor(duration / 60);
                continue;
            }
            if (events.containsKey(k)) {
                coins += per * events.get(k);
            }
        }
        if (Json.truthy(o.get("mvp")) && Json.truthy(eco.get("mvp_bonus"))) {
            coins += Json.num(eco, "mvp_bonus", 0);
        }

        double xp = 0;
        if (won && Json.truthy(eco.get("xp_win"))) {
            xp += Json.num(eco, "xp_win", 0);
        }
        if (Json.truthy(eco.get("xp_kill")) && events.get("kill") != null) {
            xp += Json.num(eco, "xp_kill", 0) * events.get("kill");
        }
        xp += Math.floor(Math.max(0, points[0]) / 20);

        double coinMult = rank != null && Json.num(rank, "coin_multiplier", 0) != 0 ? Json.num(rank, "coin_multiplier", 1) : 1;
        double xpMult = rank != null && Json.num(rank, "xp_multiplier", 0) != 0 ? Json.num(rank, "xp_multiplier", 1) : 1;
        coins = Rng.jsRound(coins * coinMult);
        xp = Rng.jsRound(xp * xpMult);

        List<String> flags = new ArrayList<>();
        boolean eligible = duration >= 120 || "kitpvp".equals(Json.str(mode, "id", "")) || "factions".equals(Json.str(mode, "id", ""));
        if (!eligible) {
            flags.add("too_short");
        }
        if (afk > 60) {
            flags.add("afk");
        }
        if (events.get("death") != null && events.get("death") > 0 && (events.get("kill") == null || events.get("kill") == 0) && afk > 40) {
            flags.add("farm_suspect");
        }
        boolean rewarded = eligible && afk <= 60;
        if (!rewarded) {
            coins = Math.min(coins, 10);
            xp = Math.min(xp, 10);
        }

        points[0] = Rng.jsRound(points[0]);
        Map<String, Object> out = Json.obj();
        Json.put(out, "mode", mode == null ? null : mode.get("id"));
        Json.put(out, "won", won);
        Json.put(out, "placement", placement);
        Json.put(out, "points", rewarded ? points[0] : Math.max(0, Math.min(points[0], 20)));
        Json.put(out, "points_raw", points[0]);
        Json.put(out, "coins", coins);
        Json.put(out, "xp", xp);
        Json.put(out, "rp", Elo.rankPointsFrom(rewarded ? points[0] : 0, Json.num(o, "elo_delta", 0)));
        Json.put(out, "breakdown", breakdown);
        Json.put(out, "flags", flags);
        Json.put(out, "rewarded", rewarded);
        return out;
    }

    public static String pickMvp(List<Map<String, Object>> results) {
        Map<String, Object> best = null;
        for (Map<String, Object> r : results) {
            if (Json.bool(r, "is_bot", false)) {
                continue;
            }
            if (best == null) {
                best = r;
                continue;
            }
            double a = Json.num(r, "points", 0);
            double b = Json.num(best, "points", 0);
            if (a > b) {
                best = r;
            } else if (a == b && Json.num(r, "kills", 0) > Json.num(best, "kills", 0)) {
                best = r;
            }
        }
        return best == null ? null : Json.str(best, "id", null);
    }
}
