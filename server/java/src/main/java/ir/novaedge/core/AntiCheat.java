// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — core/AntiCheat.java (پورت دقیق shared/engine/anticheat.js)
// ═══════════════════════════════════════════════════════════════════
package ir.novaedge.core;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public final class AntiCheat {

    public static final double REACH_LIMIT = 3.4;
    public static final double REACH_PER_MS = 0.004;
    public static final double REACH_WEIGHT = 6;
    public static final double KILLAURA_WEIGHT = 10;
    public static final double KILLAURA_SNAP_DEG = 40;
    public static final double KILLAURA_MIN_HITS = 3;
    public static final double CPS_MAX = 18;
    public static final double CPS_WEIGHT = 5;
    public static final double FLY_MAX_AIR = 40;
    public static final double FLY_WEIGHT = 14;
    public static final double SPEED_MAX = 0.42;
    public static final double SPEED_SPRINT = 0.62;
    public static final double SPEED_WEIGHT = 12;
    public static final double NOFALL_SKIPS = 3;
    public static final double NOFALL_WEIGHT = 8;
    public static final double TICK_MAX = 22.5;
    public static final double TICK_WEIGHT = 15;
    public static final double PLACE_MAX = 22;
    public static final double PLACE_WEIGHT = 4;
    public static final double ORE_MAX = 26;
    public static final double ORE_DIGS = 6;
    public static final double ORE_WEIGHT = 9;
    public static final double BOW_MIN = 550;
    public static final double BOW_WEIGHT = 7;
    public static final double BLINK_MAX = 12;
    public static final double BLINK_WEIGHT = 13;
    public static final double IMPOSSIBLE_WEIGHT = 20;
    public static final double PING_TOLERANCE = 250;

    private AntiCheat() {
    }

    public static double reachLimit(double pingMs, Double base, Double perMs) {
        double b = base == null ? REACH_LIMIT : base;
        double pm = perMs == null ? REACH_PER_MS : perMs;
        double ping = Rng.clamp(pingMs, 0, PING_TOLERANCE);
        return Rng.roundTo(b + ping * pm * 0.25, 2);
    }

    public static double speedLimit(boolean sprinting, double pingMs) {
        double base = sprinting ? SPEED_SPRINT : SPEED_MAX;
        double ping = Rng.clamp(pingMs, 0, PING_TOLERANCE);
        return Rng.roundTo(base + ping * 0.00012, 3);
    }

    private static String num(double v) {
        if (v == Math.floor(v) && !Double.isInfinite(v)) {
            return String.valueOf((long) v);
        }
        return String.valueOf(v);
    }

    public static Map<String, Object> inspect(Map<String, Object> s, Map<String, Object> cfg) {
        if (s == null) {
            s = Json.obj();
        }
        if (cfg == null) {
            cfg = Json.obj();
        }
        String check = Json.str(s, "check", "");
        double v = Json.num(s, "value", 0);

        switch (check) {
            case "reach": {
                double limit = reachLimit(Json.num(s, "ping", 0),
                        Json.numOr(cfg, "reach_max_blocks", REACH_LIMIT), null);
                if (v > limit) {
                    return hit(check, v, limit, String.format(Locale.ROOT, "reach=%.2f > %s", v, num(limit)),
                            REACH_WEIGHT * Json.numOr(cfg, "flag_weight_kill", 2) / 2);
                }
                return null;
            }
            case "cps": {
                double max = Json.numOr(cfg, "cps_max", CPS_MAX);
                if (v > max) {
                    return hit(check, v, max, "cps=" + num(v), CPS_WEIGHT);
                }
                return null;
            }
            case "rotation_snap": {
                if (Json.num(s, "snap_streak", 0) >= KILLAURA_MIN_HITS && v < KILLAURA_SNAP_DEG) {
                    return hit(check, v, KILLAURA_SNAP_DEG, "snap_streak=" + num(Json.num(s, "snap_streak", 0)) + " err=" + num(v) + "°", KILLAURA_WEIGHT);
                }
                return null;
            }
            case "air_ticks": {
                if (!Json.bool(s, "on_ground", false) && v > FLY_MAX_AIR && !Json.truthy(s.get("elytra")) && !Json.truthy(s.get("levitation"))) {
                    return hit(check, v, FLY_MAX_AIR, "air_ticks=" + num(v), FLY_WEIGHT);
                }
                return null;
            }
            case "speed": {
                double limit = speedLimit(Json.bool(s, "sprinting", false), Json.num(s, "ping", 0));
                double cap = Json.numOr(cfg, "max_speed", limit);
                if (v > Math.max(limit, cap) && !Boolean.FALSE.equals(s.get("on_ground"))) {
                    return hit(check, v, Math.max(limit, cap), String.format(Locale.ROOT, "speed=%.3f", v), SPEED_WEIGHT);
                }
                return null;
            }
            case "tick_rate": {
                if (v > TICK_MAX) {
                    return hit(check, v, TICK_MAX, "tps=" + num(v), TICK_WEIGHT);
                }
                return null;
            }
            case "place_rate": {
                double max = Json.numOr(cfg, "max_blocks_per_sec", PLACE_MAX);
                if (v > max) {
                    return hit(check, v, max, "place/s=" + num(v), PLACE_WEIGHT);
                }
                return null;
            }
            case "ore_rate": {
                if (v > ORE_MAX || Json.num(s, "straight_digs", 0) >= ORE_DIGS) {
                    return hit(check, v, ORE_MAX, "ore/min=" + num(v), ORE_WEIGHT);
                }
                return null;
            }
            case "bow_charge": {
                if (v > 0 && v < BOW_MIN) {
                    return hit(check, v, BOW_MIN, "charge=" + num(v) + "ms", BOW_WEIGHT);
                }
                return null;
            }
            case "nofall": {
                if (Json.num(s, "skips", 0) >= NOFALL_SKIPS) {
                    return hit(check, v, NOFALL_SKIPS, "skips=" + num(Json.num(s, "skips", 0)), NOFALL_WEIGHT);
                }
                return null;
            }
            case "blink": {
                if (v > BLINK_MAX) {
                    return hit(check, v, BLINK_MAX, "jump=" + num(v) + " blocks", BLINK_WEIGHT);
                }
                return null;
            }
            case "impossible":
                return hit(check, v, 0, Json.str(s, "detail", "impossible action"), IMPOSSIBLE_WEIGHT);
            default:
                return null;
        }
    }

    private static Map<String, Object> hit(String check, double value, double limit, String detail, double weight) {
        Map<String, Object> m = Json.obj();
        Json.put(m, "check", check);
        Json.put(m, "weight", weight);
        Json.put(m, "value", value);
        Json.put(m, "limit", limit);
        Json.put(m, "detail", detail);
        return m;
    }

    /** ردیاب تخطی با افول زمانی */
    public static class ViolationTracker {
        public final Map<String, Object> cfg = new LinkedHashMap<>();
        public final Map<String, Map<String, Object>> players = new LinkedHashMap<>();

        public ViolationTracker() {
            cfg.put("warn_at", 20.0);
            cfg.put("kick_at", 45.0);
            cfg.put("tempban_at", 80.0);
            cfg.put("ban_at", 150.0);
            cfg.put("decay_per_min", 3.0);
            cfg.put("tempban_hours", 24.0);
            cfg.put("ping_tolerance_ms", PING_TOLERANCE);
            cfg.put("verbose", false);
            cfg.put("exempt_ops", true);
        }

        private Map<String, Object> get(String id) {
            return players.computeIfAbsent(id, k -> {
                Map<String, Object> p = Json.obj();
                Json.put(p, "id", k);
                Json.put(p, "score", 0.0);
                Json.put(p, "history", new ArrayList<Map<String, Object>>());
                Json.put(p, "last_action", "");
                Json.put(p, "last_ts", 0.0);
                Json.put(p, "exempt", false);
                return p;
            });
        }

        @SuppressWarnings("unchecked")
        public Map<String, Object> record(String id, Map<String, Object> sample, Map<String, Object> modeCfg, double nowTs) {
            Map<String, Object> p = get(id);
            double mins = Math.max(0, (nowTs - (Json.num(p, "last_ts", 0) != 0 ? Json.num(p, "last_ts", 0) : nowTs)) / 60000);
            if (mins > 0) {
                Json.put(p, "score", Math.max(0, Json.num(p, "score", 0) - mins * Json.num(cfg, "decay_per_min", 3)));
            }
            Json.put(p, "last_ts", nowTs);
            Map<String, Object> v = inspect(sample, modeCfg);
            if (v == null) {
                Map<String, Object> out = Json.obj();
                Json.put(out, "id", id);
                Json.put(out, "score", Rng.jsRound(Json.num(p, "score", 0)));
                Json.put(out, "violation", null);
                Json.put(out, "action", "none");
                Json.put(out, "reasons", List.of());
                return out;
            }
            List<Map<String, Object>> history = (List<Map<String, Object>>) p.get("history");
            if (Json.bool(p, "exempt", false) && Json.bool(cfg, "exempt_ops", true)) {
                Map<String, Object> h = new LinkedHashMap<>(v);
                h.put("ts", nowTs);
                h.put("exempted", true);
                history.add(h);
                Map<String, Object> out = Json.obj();
                Json.put(out, "id", id);
                Json.put(out, "score", Rng.jsRound(Json.num(p, "score", 0)));
                Json.put(out, "violation", v);
                Json.put(out, "action", "none");
                Json.put(out, "reasons", List.of("exempt"));
                return out;
            }
            Json.put(p, "score", Json.num(p, "score", 0) + Json.numOr(v, "weight", 1));
            Map<String, Object> h = new LinkedHashMap<>(v);
            h.put("ts", nowTs);
            history.add(h);
            if (history.size() > 60) {
                ((List<Map<String, Object>>) p.get("history")).subList(0, history.size() - 60).clear();
            }
            String action = "none";
            double score = Json.num(p, "score", 0);
            if (score >= Json.num(cfg, "ban_at", 150)) {
                action = "ban";
            } else if (score >= Json.num(cfg, "tempban_at", 80)) {
                action = "tempban";
            } else if (score >= Json.num(cfg, "kick_at", 45)) {
                action = "kick";
            } else if (score >= Json.num(cfg, "warn_at", 20)) {
                action = "warn";
            }
            if (!action.equals("none") && !action.equals(Json.str(p, "last_action", ""))) {
                Json.put(p, "last_action", action);
            }
            List<Map<String, Object>> hist = (List<Map<String, Object>>) p.get("history");
            List<String> reasons = new ArrayList<>();
            for (int i = Math.max(0, hist.size() - 6); i < hist.size(); i++) {
                reasons.add(hist.get(i).get("check") + ": " + hist.get(i).get("detail"));
            }
            Map<String, Object> out = Json.obj();
            Json.put(out, "id", id);
            Json.put(out, "score", Rng.jsRound(score));
            Json.put(out, "violation", v);
            Json.put(out, "action", action);
            Json.put(out, "reasons", reasons);
            Json.put(out, "tempban_hours", action.equals("tempban") ? Json.num(cfg, "tempban_hours", 24) : 0);
            return out;
        }

        public void reset(String id) {
            players.remove(id);
        }
    }

    public static Map<String, Object> summarize(ViolationTracker tracker) {
        Map<String, Object> byCheck = new HashMap<>();
        int flagged = 0;
        for (Map<String, Object> p : tracker.players.values()) {
            if (Json.num(p, "score", 0) >= Json.num(tracker.cfg, "warn_at", 20)) {
                flagged++;
            }
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> hist = (List<Map<String, Object>>) p.get("history");
            for (Map<String, Object> h : hist) {
                String k = String.valueOf(h.get("check"));
                byCheck.merge(k, 1, (a, b) -> ((Number) a).intValue() + ((Number) b).intValue());
            }
        }
        Map<String, Object> out = Json.obj();
        Json.put(out, "players_tracked", tracker.players.size());
        Json.put(out, "flagged", flagged);
        Json.put(out, "by_check", byCheck);
        return out;
    }
}
