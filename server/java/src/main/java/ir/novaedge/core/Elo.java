// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — core/Elo.java (پورت دقیق shared/engine/elo.js)
// ═══════════════════════════════════════════════════════════════════
package ir.novaedge.core;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public final class Elo {

    public static final double FLOOR = 100;
    public static final double CAP = 4000;
    public static final double START = 1000;
    public static final int PROVISIONAL_GAMES = 10;
    public static final double PROVISIONAL_K_MULT = 1.5;
    public static final double HIGH_RATING = 2200;
    public static final double HIGH_K_MULT = 0.75;
    public static final double VERY_HIGH_RATING = 2600;
    public static final double VERY_HIGH_K_MULT = 0.6;
    public static final int DECAY_AFTER_DAYS = 21;
    public static final double DECAY_PER_WEEK = 8;
    public static final double DECAY_MIN_RATING = 1400;

    private Elo() {
    }

    public static double expectedScore(double a0, double b0) {
        double a = a0 != 0 ? a0 : START;
        double b = b0 != 0 ? b0 : START;
        return 1 / (1 + Math.pow(10, (b - a) / 400));
    }

    public static double teamRating(List<Double> ratings) {
        List<Double> list = new ArrayList<>();
        for (Double r : ratings) {
            double n = r != null && r != 0 ? r : START;
            if (Double.isFinite(n)) {
                list.add(n);
            }
        }
        if (list.isEmpty()) {
            return START;
        }
        double s = 0;
        for (double n : list) {
            s += n;
        }
        return s / list.size();
    }

    public static double effectiveK(double baseK, int gamesPlayed, double rating) {
        double k = Math.max(4, baseK != 0 ? baseK : 24);
        if (gamesPlayed < PROVISIONAL_GAMES) {
            k *= PROVISIONAL_K_MULT;
        }
        if (rating >= VERY_HIGH_RATING) {
            k *= VERY_HIGH_K_MULT;
        } else if (rating >= HIGH_RATING) {
            k *= HIGH_K_MULT;
        }
        return Rng.roundTo(k, 2);
    }

    public static double placementScore(double place, int playerCount) {
        double p = Rng.clamp(place != 0 ? place : 1, 1, Math.max(1, playerCount));
        double n = Math.max(2, playerCount);
        return (n - p) / (n - 1);
    }

    public static Map<String, Object> eloDelta(Map<String, Object> o) {
        double rating = Rng.clamp(Json.numOr(o, "rating", START), FLOOR, CAP);
        double opp = Rng.clamp(Json.numOr(o, "opponentRating", START), FLOOR, CAP);
        double e = expectedScore(rating, opp);
        double s = Rng.clamp(Json.num(o, "score", 0), 0, 1);
        double k = effectiveK(Json.num(o, "baseK", 24), (int) Json.num(o, "gamesPlayed", 0), rating);
        long delta = Rng.jsRound(k * (s - e));
        Map<String, Object> out = Json.obj();
        Json.put(out, "delta", delta);
        Json.put(out, "expected", Rng.roundTo(e, 4));
        Json.put(out, "k", k);
        Json.put(out, "rating", Rng.clamp(rating + delta, FLOOR, CAP));
        return out;
    }

    public static Map<String, Object> settleMatch(Map<String, Object> mode, List<Map<String, Object>> players,
            Map<String, Object> placements, List<Map<String, Object>> teams) {
        double baseK = Json.numOr(Json.map(mode, "match"), "elo_k", 24);
        String category = Json.str(mode, "category", "ffa");
        int humans = 0;
        for (Map<String, Object> p : players) {
            if (!Json.bool(p, "is_bot", false)) {
                humans++;
            }
        }
        int n = players.size();

        Map<String, Integer> teamOf = new HashMap<>();
        Map<Integer, Double> teamRatingOf = new HashMap<>();
        if (teams != null && teams.size() > 1) {
            for (Map<String, Object> t : teams) {
                List<String> ids = new ArrayList<>();
                for (Map<String, Object> pp : Json.mapList(t.get("players"))) {
                    ids.add(Json.str(pp, "id", String.valueOf(pp.get("id"))));
                }
                List<Double> rlist = new ArrayList<>();
                for (Map<String, Object> p : players) {
                    if (ids.contains(Json.str(p, "id", ""))) {
                        rlist.add(Json.numOr(p, "rating", START));
                    }
                }
                for (String id : ids) {
                    teamOf.put(id, (int) Json.num(t, "index", 0));
                }
                teamRatingOf.put((int) Json.num(t, "index", 0), teamRating(rlist));
            }
        }

        double total = 0;
        for (Map<String, Object> p : players) {
            total += Rng.clamp(Json.numOr(p, "rating", START), FLOOR, CAP);
        }

        List<Map<String, Object>> results = new ArrayList<>();
        for (Map<String, Object> p : players) {
            double my = Rng.clamp(Json.numOr(p, "rating", START), FLOOR, CAP);
            Integer myTeam = teamOf.get(Json.str(p, "id", ""));
            double oppRating;
            if (myTeam != null && teamRatingOf.size() > 1) {
                List<Double> others = new ArrayList<>();
                for (Map.Entry<Integer, Double> en : teamRatingOf.entrySet()) {
                    if (!en.getKey().equals(myTeam)) {
                        others.add(en.getValue());
                    }
                }
                double sum = 0;
                for (double d : others) {
                    sum += d;
                }
                oppRating = others.isEmpty() ? my : sum / others.size();
            } else {
                oppRating = n > 1 ? (total - my) / (n - 1) : my;
            }
            double score;
            if (category.equals("coop") || category.equals("social")) {
                score = Json.bool(p, "won", false) ? 1 : 0;
            } else if (category.equals("ffa") || category.equals("race") || category.equals("creative")) {
                Object place = placements != null ? placements.get(p.get("id")) : null;
                double pl = place != null ? Json.num(place, 0) : (p.get("place") != null ? Json.num(p, "place", 0) : (Json.bool(p, "won", false) ? 1 : n));
                score = placementScore(pl, n);
            } else {
                score = Json.bool(p, "won", false) ? 1 : 0;
            }
            Map<String, Object> arg = Json.obj();
            Json.put(arg, "rating", my);
            Json.put(arg, "opponentRating", oppRating);
            Json.put(arg, "baseK", baseK);
            Json.put(arg, "gamesPlayed", (int) Json.num(p, "games_played", Json.num(p, "games", 0)));
            Json.put(arg, "score", score);
            Map<String, Object> r = eloDelta(arg);
            Map<String, Object> row = Json.obj();
            Json.put(row, "id", p.get("id"));
            Json.put(row, "is_bot", Json.bool(p, "is_bot", false));
            Json.put(row, "before", my);
            Json.put(row, "after", r.get("rating"));
            Json.put(row, "delta", r.get("delta"));
            Json.put(row, "expected", r.get("expected"));
            Json.put(row, "score", score);
            Json.put(row, "rp", Json.bool(p, "is_bot", false) ? 0
                    : rankPointsFrom(Json.num(p, "score_points", 0), ((Number) r.get("delta")).doubleValue()));
            results.add(row);
        }
        Map<String, Object> out = Json.obj();
        Json.put(out, "category", category);
        Json.put(out, "base_k", baseK);
        Json.put(out, "human_count", humans);
        Json.put(out, "results", results);
        return out;
    }

    public static long rankPointsFrom(double scorePoints, double eloDelta) {
        long base = (long) Math.floor(Math.max(0, scorePoints) / 10);
        long bonus = (long) Math.floor(Math.max(0, eloDelta) / 4);
        return Math.max(0, base + bonus);
    }

    public static Map<String, Object> rankForRp(List<Map<String, Object>> ranks, double rp) {
        List<Map<String, Object>> list = new ArrayList<>(ranks);
        list.sort(Comparator.comparingDouble(m -> Json.num(m, "rp_required", 0)));
        Map<String, Object> best = list.isEmpty() ? Json.obj() : list.get(0);
        for (Map<String, Object> r : list) {
            if (Json.num(r, "rp_required", 0) <= rp) {
                best = r;
            }
        }
        return best;
    }

    public static Map<String, Object> effectiveRank(List<Map<String, Object>> ranks, double rp, String purchasedRankId) {
        List<Map<String, Object>> list = new ArrayList<>(ranks);
        list.sort(Comparator.comparingDouble(m -> Json.num(m, "index", 0)));
        Map<String, Object> earned = rankForRp(list, rp);
        Map<String, Object> bought = null;
        for (Map<String, Object> r : list) {
            if (Json.str(r, "id", "").equals(purchasedRankId)) {
                bought = r;
                break;
            }
        }
        Map<String, Object> out = Json.obj();
        if (bought != null && Json.num(bought, "index", 0) > Json.num(earned, "index", 0)) {
            Json.put(out, "rank", bought);
            Json.put(out, "source", "purchased");
        } else {
            Json.put(out, "rank", earned);
            Json.put(out, "source", bought != null ? "earned_over_purchased" : "earned");
        }
        return out;
    }

    public static Map<String, Object> rankProgress(List<Map<String, Object>> ranks, double rp) {
        List<Map<String, Object>> list = new ArrayList<>(ranks);
        list.sort(Comparator.comparingDouble(m -> Json.num(m, "rp_required", 0)));
        Map<String, Object> cur = rankForRp(list, rp);
        Map<String, Object> next = null;
        for (Map<String, Object> r : list) {
            if (Json.num(r, "rp_required", 0) > Json.num(cur, "rp_required", 0)) {
                next = r;
                break;
            }
        }
        Map<String, Object> out = Json.obj();
        if (next == null) {
            Json.put(out, "current", Json.str(cur, "id", ""));
            Json.put(out, "next", null);
            Json.put(out, "pct", 100);
            Json.put(out, "remaining_rp", 0);
            return out;
        }
        double span = Json.num(next, "rp_required", 0) - Json.num(cur, "rp_required", 0);
        double done = rp - Json.num(cur, "rp_required", 0);
        Json.put(out, "current", Json.str(cur, "id", ""));
        Json.put(out, "next", Json.str(next, "id", ""));
        Json.put(out, "pct", Rng.jsRound(Rng.clamp(done / Math.max(1, span) * 100, 0, 100)));
        Json.put(out, "remaining_rp", (long) Math.max(0, Math.ceil(Json.num(next, "rp_required", 0) - rp)));
        return out;
    }

    public static long levelForXp(double xp) {
        return Math.min(200, (long) Math.floor(Math.sqrt(Math.max(0, xp) / 100)));
    }

    public static long xpForLevel(long level) {
        long l = Math.max(0, level);
        return l * l * 100;
    }

    public static double skillIndex(Map<String, Object> o) {
        double rating = Json.numOr(o, "rating", START);
        double eloPart = Rng.clamp((rating - 700) / 2000, 0, 1);
        double levelPart = Rng.clamp(Json.num(o, "level", 1) / 120, 0, 1);
        double rankPart = Rng.clamp(Json.num(o, "rank_index", 0) / 5, 0, 1);
        double expPart = Rng.clamp(Json.num(o, "games", 0) / 400, 0, 1);
        double raw = 0.5 * eloPart + 0.2 * levelPart + 0.2 * rankPart + 0.1 * expPart;
        return Rng.roundTo(Rng.clamp(raw + Json.num(o, "bias", 0), 0, 1), 3);
    }

    public static double decayRating(double rating, int daysInactive) {
        double r = rating != 0 ? rating : START;
        if (r <= DECAY_MIN_RATING) {
            return r;
        }
        long weeks = Math.max(0, (long) Math.floor((daysInactive - DECAY_AFTER_DAYS) / 7.0));
        if (weeks <= 0) {
            return r;
        }
        return Math.max(DECAY_MIN_RATING, r - weeks * DECAY_PER_WEEK);
    }
}
