// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — EngineParityTest
//  برابری موتور جاوا با ۶۷ بردار طلایی shared/testvectors.json —
//  همان بردارهایی که JS (مرجع) و PHP (پورت Bedrock) پاس کرده‌اند.
//  dispatch دقیقاً آینهٔ server/bedrock/tests/parity.php است.
//  اجرا: mvn -f server/java/pom.xml test
// ═══════════════════════════════════════════════════════════════════
package ir.novaedge;

import com.google.gson.Gson;
import ir.novaedge.core.AntiCheat;
import ir.novaedge.core.BotTier;
import ir.novaedge.core.Brain;
import ir.novaedge.core.Elo;
import ir.novaedge.core.Json;
import ir.novaedge.core.Matchmaking;
import ir.novaedge.core.Rng;
import ir.novaedge.core.Scoring;
import ir.novaedge.core.Spec;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.TestFactory;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

public class EngineParityTest {

    private static final Gson GSON = new Gson();

    // ── helpers ─────────────────────────────────────────────────────
    private static double num(Object o) {
        if (o instanceof Number n) {
            return n.doubleValue();
        }
        if (o == null) {
            return 0;
        }
        try {
            return Double.parseDouble(String.valueOf(o));
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static int inum(Object o) {
        return (int) num(o);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> m(Object o) {
        return o instanceof Map ? (Map<String, Object>) o : null;
    }

    @SuppressWarnings("unchecked")
    private static List<Object> l(Object o) {
        return o instanceof List ? (List<Object>) o : null;
    }

    private static List<Map<String, Object>> ml(Object o) {
        List<Map<String, Object>> out = new ArrayList<>();
        List<Object> list = l(o);
        if (list != null) {
            for (Object e : list) {
                out.add(m(e));
            }
        }
        return out;
    }

    private static List<Double> dl(Object o) {
        List<Double> out = new ArrayList<>();
        List<Object> list = l(o);
        if (list != null) {
            for (Object e : list) {
                out.add(num(e));
            }
        }
        return out;
    }

    private static boolean bool(Object o) {
        return o instanceof Boolean b && b;
    }

    // ── dispatch (آینهٔ parity.php) ─────────────────────────────────
    static Object dispatch(Map<String, Object> v) {
        String g = String.valueOf(v.get("group"));
        String fn = String.valueOf(v.get("fn"));
        List<Object> a = l(v.get("args"));
        if (a == null) {
            a = new ArrayList<>();
        }
        Object a0 = a.size() > 0 ? a.get(0) : null;
        Object a1 = a.size() > 1 ? a.get(1) : null;
        Object a2 = a.size() > 2 ? a.get(2) : null;
        Object a3 = a.size() > 3 ? a.get(3) : null;
        switch (g + "/" + fn) {
            // ── rng ──
            case "rng/mulberry32_seq": {
                java.util.function.DoubleSupplier r = Rng.mulberry32(inum(a0));
                List<Object> out = new ArrayList<>();
                for (int i = 0; i < inum(a1); i++) {
                    out.add(r.getAsDouble());
                }
                return out;
            }
            case "rng/mulberry32_first":
                return Rng.mulberry32(inum(a0)).getAsDouble();
            case "rng/hashSeed":
            case "rng/hashSeed_empty":
                return Rng.hashSeed(String.valueOf(a0));
            case "rng/clamp":
            case "rng/clamp_neg":
                return Rng.clamp(num(a0), num(a1), num(a2));
            case "rng/round":
                return Rng.roundTo(num(a0), inum(a1));

            // ── elo ──
            case "elo/expectedScore":
            case "elo/expectedScore_equal":
                return Elo.expectedScore(num(a0), num(a1));
            case "elo/teamRating":
                return Elo.teamRating(dl(a0));
            case "elo/effectiveK_new":
            case "elo/effectiveK_vet":
                return Elo.effectiveK(num(a0), inum(a1), num(a2));
            case "elo/placementScore_first":
            case "elo/placementScore_last":
                return Elo.placementScore(num(a0), inum(a1));
            case "elo/eloDelta_win":
            case "elo/eloDelta_loss":
            case "elo/eloDelta_provisional":
                return Elo.eloDelta(m(a0));
            case "elo/settleMatch_teams": {
                Map<String, Object> o = m(a0);
                Map<String, Object> mode = Spec.modeById(Json.str(o, "mode", ""));
                Map<String, Object> placements = m(o.get("placements")) != null ? m(o.get("placements")) : Json.obj();
                return Elo.settleMatch(mode, ml(o.get("players")), placements, l(o.get("teams")) != null ? ml(o.get("teams")) : null);
            }
            case "elo/rankPointsFrom":
                return Elo.rankPointsFrom(num(m(a0).get("score_points")), num(m(a0).get("elo_delta")));
            case "elo/rankForRp_low":
            case "elo/rankForRp_mid":
            case "elo/rankForRp_top":
                return Elo.rankForRp(Spec.ranks(), num(a0)).get("id");
            case "elo/effectiveRank_buy_lower":
            case "elo/effectiveRank_earn_higher": {
                Map<String, Object> r = Elo.effectiveRank(Spec.ranks(), num(a0), String.valueOf(a1));
                return m(r.get("rank")) != null ? m(r.get("rank")).get("id") : null;
            }
            case "elo/rankProgress":
                return Elo.rankProgress(Spec.ranks(), num(a0));
            case "elo/levelForXp":
                return Elo.levelForXp(num(a0));
            case "elo/xpForLevel":
                return Elo.xpForLevel((long) num(a0));
            case "elo/skillIndex":
                return Elo.skillIndex(m(a0));
            case "elo/decayRating":
            case "elo/decayRating_none":
                return Elo.decayRating(num(a0), inum(a1));

            // ── scoring ──
            case "scoring/tallyEvents":
                return Scoring.tallyEvents(ml(a0));
            case "scoring/parkourSpeedBonus_fast":
            case "scoring/parkourSpeedBonus_slow":
                return Scoring.parkourSpeedBonus(num(a0), num(a1), num(a2));
            case "scoring/computePlayerResult_bedwars":
            case "scoring/computePlayerResult_skywars": {
                Map<String, Object> o = new LinkedHashMap<>(m(a0));
                o.put("mode", Spec.modeById(Json.str(o, "mode", "")));
                return Scoring.computePlayerResult(o);
            }
            case "scoring/pickMvp":
                return Scoring.pickMvp(ml(a0));

            // ── bottier ──
            case "bottier/tierForSkill":
            case "bottier/tierForSkill_high":
                return BotTier.tierForSkill(num(a0));
            case "bottier/shiftTier_up":
            case "bottier/shiftTier_cap":
            case "bottier/shiftTier_floor":
                return BotTier.shiftTier(String.valueOf(a0), num(a1), "T4", "T0");
            case "bottier/maxTier":
                return BotTier.maxTier(String.valueOf(a0), String.valueOf(a1));
            case "bottier/percentile":
                return BotTier.percentile(dl(a0), num(a1));
            case "bottier/playerSkill":
                return BotTier.playerSkill(m(a0), Spec.ranks());
            case "bottier/chooseMatchTier_mixed":
            case "bottier/chooseMatchTier_newbie": {
                Map<String, Object> o = new LinkedHashMap<>(m(a0));
                o.put("mode", Spec.modeById(Json.str(o, "mode", "")));
                if (o.get("ranks") == null) {
                    o.put("ranks", Spec.ranks());
                }
                if (o.get("tiersSpec") == null) {
                    o.put("tiersSpec", Spec.tiersSpec());
                }
                return BotTier.chooseMatchTier(o);
            }
            case "bottier/tierAtTime_early":
            case "bottier/tierAtTime_mid":
            case "bottier/tierAtTime_late_winning":
            case "bottier/tierAtTime_late_losing":
                return BotTier.tierAtTime(String.valueOf(a0), String.valueOf(a1), m(a2));
            case "bottier/humanizeBot":
                return BotTier.humanizeBot(BotTier.tierById(Spec.tiersSpec(), String.valueOf(a0)),
                        (long) num(a1), a2 != null ? m(a2) : Json.obj());
            case "bottier/llmBudget":
                return BotTier.llmBudget(BotTier.tierById(Spec.tiersSpec(), String.valueOf(a0)),
                        Spec.modeById(String.valueOf(a1)), inum(a2), m(a3));

            // ── anticheat ──
            case "anticheat/reachLimit_low_ping":
            case "anticheat/reachLimit_high_ping":
                return AntiCheat.reachLimit(num(a0), null, null);
            case "anticheat/speedLimit_sprint":
                return AntiCheat.speedLimit(bool(a0), num(a1));
            case "anticheat/inspect_clean":
            case "anticheat/inspect_cheat":
                return AntiCheat.inspect(m(a0), a1 != null ? m(a1) : Json.obj());
            case "anticheat/tracker_sequence": {
                AntiCheat.ViolationTracker tr = new AntiCheat.ViolationTracker();
                Map<String, Object> cfg = m(Spec.modeById(String.valueOf(a1)).get("anticheat"));
                if (cfg == null) {
                    cfg = Json.obj();
                }
                List<Object> out = new ArrayList<>();
                for (Map<String, Object> s : ml(a0)) {
                    out.add(tr.record("cheater", s, cfg, num(a2)));
                }
                return out;
            }
            case "anticheat/summarize": {
                AntiCheat.ViolationTracker tr = new AntiCheat.ViolationTracker();
                Map<String, Object> cfg = m(Spec.modeById(String.valueOf(a1)).get("anticheat"));
                if (cfg == null) {
                    cfg = Json.obj();
                }
                for (Map<String, Object> s : ml(a0)) {
                    tr.record("cheater", s, cfg, num(a2));
                }
                return AntiCheat.summarize(tr);
            }

            // ── matchmaking ──
            case "matchmaking/botName":
                return Matchmaking.botName(inum(a0), new Rng.Generator(inum(a1)));
            case "matchmaking/balanceTeams": {
                Map<String, Object> o = m(a0);
                List<Map<String, Object>> humans = new ArrayList<>();
                for (int i = 0; i < inum(o.get("humans")); i++) {
                    Map<String, Object> p = Json.obj();
                    if (i == 0) {
                        Json.put(p, "id", "a");
                        Json.put(p, "rating", 1800.0);
                        Json.put(p, "level", 40.0);
                        Json.put(p, "rank_index", 3.0);
                    } else {
                        Json.put(p, "id", "b");
                        Json.put(p, "rating", 1100.0);
                        Json.put(p, "level", 6.0);
                        Json.put(p, "rank_index", 1.0);
                    }
                    humans.add(p);
                }
                Map<String, Object> opts = Json.obj();
                Json.put(opts, "mode", Spec.modeById(Json.str(o, "mode", "")));
                Json.put(opts, "seed", num(o.get("seed")));
                List<Map<String, Object>> teams = Matchmaking.balanceTeams(humans, inum(o.get("bots")),
                        inum(o.get("team_count")), inum(o.get("team_size")), opts);
                List<Object> teamsOut = new ArrayList<>();
                List<Object> avgs = new ArrayList<>();
                List<Object> colors = new ArrayList<>();
                for (Map<String, Object> t : teams) {
                    List<Object> ps = new ArrayList<>();
                    for (Map<String, Object> p : Json.mapList(t.get("players"))) {
                        Map<String, Object> q = Json.obj();
                        Json.put(q, "id", p.get("id"));
                        Json.put(q, "is_bot", Json.bool(p, "is_bot", false));
                        Json.put(q, "rating", p.get("rating"));
                        Json.put(q, "platform", p.get("platform"));
                        ps.add(q);
                    }
                    teamsOut.add(ps);
                    avgs.add(t.get("avg_rating"));
                    colors.add(t.get("color"));
                }
                Map<String, Object> out = Json.obj();
                Json.put(out, "teams", teamsOut);
                Json.put(out, "avg_ratings", avgs);
                Json.put(out, "colors", colors);
                return out;
            }

            // ── brain ──
            case "brain/heuristicDecide": {
                Map<String, Object> ctx = new LinkedHashMap<>(m(a0));
                ctx.put("mode", Spec.modeById(String.valueOf(ctx.get("mode"))));
                ctx.put("tier", BotTier.tierById(Spec.tiersSpec(), String.valueOf(ctx.get("tier"))));
                return Brain.heuristicDecide(ctx); // بدون rng → مسیر قطعی (مثل PHP)
            }
            case "brain/stateHash": {
                Map<String, Object> ctx = new LinkedHashMap<>(m(a0));
                ctx.put("mode", Spec.modeById(String.valueOf(ctx.get("mode"))));
                return Brain.stateHash(ctx); // tier همان رشته می‌ماند
            }
            case "brain/humanizeAction":
                return Brain.humanizeAction(m(a0), m(a1), new Rng.Generator(inum(a2)));
            case "brain/mergeDecisions_prefers_cloud":
            case "brain/mergeDecisions_bad_cloud":
                return Brain.mergeDecisions(m(a0), m(a1));
            case "brain/shouldConsultLlm": {
                Map<String, Object> ctx = new LinkedHashMap<>(m(a0));
                ctx.put("mode", Spec.modeById(String.valueOf(ctx.get("mode"))));
                return Brain.shouldConsultLlm(ctx, m(a1));
            }
            default:
                throw new IllegalStateException("vector پیاده‌سازی نشده در Java: " + g + "/" + fn);
        }
    }

    // ── مقایسهٔ tolerant: عدد با تلورانس ۱e-۶، null ≡ کلید غایب ──
    static boolean closeEnough(Object got, Object want) {
        if (got instanceof Number gn && want instanceof Number wn) {
            return Math.abs(gn.doubleValue() - wn.doubleValue()) <= 1e-6;
        }
        if (got instanceof Map<?, ?> gm && want instanceof Map<?, ?> wm) {
            Set<String> keys = new LinkedHashSet<>();
            for (Object k : gm.keySet()) {
                keys.add(String.valueOf(k));
            }
            for (Object k : wm.keySet()) {
                keys.add(String.valueOf(k));
            }
            for (String k : keys) {
                Object gv = gm.get(k);
                Object wv = wm.get(k);
                if (gv == null && wv == null) {
                    continue; // null ≡ missing
                }
                if (gv == null || wv == null) {
                    return false;
                }
                if (!closeEnough(gv, wv)) {
                    return false;
                }
            }
            return true;
        }
        if (got instanceof List<?> gl && want instanceof List<?> wl) {
            if (gl.size() != wl.size()) {
                return false;
            }
            for (int i = 0; i < gl.size(); i++) {
                if (!closeEnough(gl.get(i), wl.get(i))) {
                    return false;
                }
            }
            return true;
        }
        if (got instanceof Boolean || want instanceof Boolean) {
            return Objects.equals(got, want);
        }
        return Objects.equals(String.valueOf(got), String.valueOf(want));
    }

    static String show(Object o) {
        String s = GSON.toJson(o);
        return s.length() > 240 ? s.substring(0, 240) + "…" : s;
    }

    @TestFactory
    Collection<DynamicTest> goldenVectors() throws Exception {
        Map<String, Object> doc = Spec.parseObject(readResource("/testvectors.json"));
        List<Map<String, Object>> vectors = ml(doc.get("vectors"));
        List<DynamicTest> tests = new ArrayList<>();
        for (int i = 0; i < vectors.size(); i++) {
            final Map<String, Object> v = vectors.get(i);
            final int idx = i;
            final String name = v.get("group") + "/" + v.get("fn");
            tests.add(DynamicTest.dynamicTest("vector[" + idx + "] " + name, () -> {
                Object got = dispatch(v);
                Object want = v.get("expect");
                if (!closeEnough(got, want)) {
                    throw new AssertionError("FAIL " + name + "\n  expect: " + show(want) + "\n  got   : " + show(got));
                }
            }));
        }
        return tests;
    }

    private static String readResource(String path) throws Exception {
        try (java.io.InputStream in = EngineParityTest.class.getResourceAsStream(path)) {
            if (in == null) {
                throw new IllegalStateException(path + " در classpath نیست (pom.xml را ببینید)");
            }
            return new String(in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        }
    }
}
