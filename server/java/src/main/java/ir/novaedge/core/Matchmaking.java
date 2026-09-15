// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — core/Matchmaking.java (پورت دقیق shared/engine/matchmaking.js)
// ═══════════════════════════════════════════════════════════════════
package ir.novaedge.core;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

public final class Matchmaking {

    public static final String[] BOT_NAMES = {
            "Arash_77", "NimaX", "SinaPvP", "KianCraft", "ParsaGod", "MiladYT", "AmirTNT", "RezaBridge",
            "Saman_98", "Tohid", "BardiaPro", "ErfanZ", "MahdiSword", "AlirezaMC", "HosseinBed", "JavadRun",
            "NaderSky", "YasinPvP", "Mobin_1", "Soroush", "FarhadGG", "KamyarX", "PeymanUHC", "Bahram",
            "AriaParkour", "ShayanKit", "OmidDuel", "VahidSpleef", "MortezaAim", "SaeedTNT", "DanialMurder",
            "ImanBuilder", "AshkanFrost", "MehdiVamp", "NavidRush", "ZahraMC", "SaraPvP", "NargesBuild",
            "LeilaSky", "MaryamGG", "ElnazRun", "FatemehKit", "HaniehDuel", "RoxanaX", "TaraMC", "YasnaPro",
            "Alex_Steve", "Notch_Fan", "EnderPro", "CreeperHug", "RedstoneRat", "PistonPete", "SlimeKing",
            "BlazeBorn", "IronGolemX", "WitherWatch", "GhastGoal", "ShulkerSam", "PiglinPal", "WardenWake",
    };

    private Matchmaking() {
    }

    public static String botName(int i, Rng.Generator rng) {
        String base = BOT_NAMES[Math.floorMod(i, BOT_NAMES.length)];
        String suffix = "";
        if (rng != null && rng.chance(0.35)) {
            suffix = "_" + rng.int_(10, 99);
        }
        return base + suffix;
    }

    public static Map<String, Object> makeBot(int index, String tier, double matchRating, Map<String, Object> mode,
            Rng.Generator rng, String platform) {
        String name = botName(index, rng);
        int jitter = rng != null ? rng.int_(-90, 90) : 0;
        double rating = Rng.clamp(Rng.jsRound(matchRating + jitter), 100, 4000);
        Map<String, Object> out = Json.obj();
        Json.put(out, "id", "bot_" + name.toLowerCase().replaceAll("[^a-z0-9]", "") + "_" + index);
        Json.put(out, "name", name);
        Json.put(out, "is_bot", true);
        Json.put(out, "tier", tier);
        Json.put(out, "rating", rating);
        Json.put(out, "level", rng != null ? rng.int_(5, 90) : 20);
        Json.put(out, "rank_id", "free");
        Json.put(out, "platform", platform != null ? platform : (rng != null && rng.chance(0.35) ? "bedrock" : "java"));
        Json.put(out, "games", rng != null ? rng.int_(20, 900) : 100);
        Json.put(out, "seed", rng != null ? rng.int_(1, 2147483647) : index + 1);
        Json.put(out, "mode", mode == null ? null : mode.get("id"));
        return out;
    }

    private static double sumRating(List<Map<String, Object>> players) {
        double s = 0;
        for (Map<String, Object> p : players) {
            double r = Json.num(p, "rating", 0);
            s += r != 0 ? r : 1000;
        }
        return s;
    }

    private static String pickPlatform(Map<String, Object> weakest, List<Map<String, Object>> teams, Object crossplay, Rng.Generator rng) {
        if (!Json.truthy(crossplay)) {
            return rng.chance(0.5) ? "java" : "bedrock";
        }
        int java = 0;
        int bedrock = 0;
        for (Map<String, Object> t : teams) {
            for (Map<String, Object> p : Json.mapList(t.get("players"))) {
                if ("bedrock".equals(Json.str(p, "platform", ""))) {
                    bedrock++;
                } else {
                    java++;
                }
            }
        }
        return java <= bedrock ? "java" : "bedrock";
    }

    @SuppressWarnings("unchecked")
    public static List<Map<String, Object>> balanceTeams(List<Map<String, Object>> humans, int botsNeeded,
            int teamCount, int teamSize, Map<String, Object> opts) {
        Rng.Generator rng = new Rng.Generator((int) Json.num(opts, "seed", 1));
        Map<String, Object> mode = Json.map(opts, "mode");
        String[] colors = {"red", "blue", "green", "yellow", "aqua", "pink", "gray", "orange", "white", "purple", "brown", "lime"};
        List<Map<String, Object>> pool = new ArrayList<>(humans);
        pool.sort(Comparator.comparingDouble((Map<String, Object> p) -> {
            double r = Json.num(p, "rating", 0);
            return r != 0 ? r : 1000;
        }).reversed());
        double avg = 1000;
        if (!pool.isEmpty()) {
            double s = 0;
            for (Map<String, Object> p : pool) {
                double r = Json.num(p, "rating", 0);
                s += r != 0 ? r : 1000;
            }
            avg = s / pool.size();
        }

        List<Map<String, Object>> teams = new ArrayList<>();
        String cat = mode == null ? "" : Json.str(mode, "category", "");
        int nTeams = cat.equals("ffa") || cat.equals("race") || cat.equals("creative")
                ? Math.max(1, pool.size() + botsNeeded)
                : Math.max(1, Math.min(teamCount != 0 ? teamCount : 2,
                        Math.max(2, (int) Math.ceil((pool.size() + botsNeeded) / (double) Math.max(1, teamSize)))));
        for (int i = 0; i < nTeams; i++) {
            Map<String, Object> t = Json.obj();
            Json.put(t, "index", i);
            Json.put(t, "color", colors[i % colors.length]);
            Json.put(t, "players", new ArrayList<Map<String, Object>>());
            Json.put(t, "avg_rating", 0);
            Map<String, Object> pf = Json.obj();
            pf.put("java", 0);
            pf.put("bedrock", 0);
            Json.put(t, "platforms", pf);
            teams.add(t);
        }

        int dir = 1;
        int cur = 0;
        for (Map<String, Object> p : pool) {
            ((List<Map<String, Object>>) teams.get(cur).get("players")).add(p);
            cur += dir;
            if (cur >= teams.size()) {
                cur = teams.size() - 1;
                dir = -1;
            } else if (cur < 0) {
                cur = 0;
                dir = 1;
            }
        }

        for (int i = 0; i < botsNeeded; i++) {
            int wi = 0;
            double wv = sumRating((List<Map<String, Object>>) teams.get(0).get("players"));
            for (int ti = 0; ti < teams.size(); ti++) {
                double sv = sumRating((List<Map<String, Object>>) teams.get(ti).get("players"));
                if (sv < wv) {
                    wv = sv;
                    wi = ti;
                }
            }
            String platform = pickPlatform(teams.get(wi), teams, opts.get("crossplay"), rng);
            ((List<Map<String, Object>>) teams.get(wi).get("players")).add(
                    makeBot(i, Json.str(opts, "tier", "T0"), avg, mode, rng, platform));
        }

        for (Map<String, Object> t : teams) {
            List<Map<String, Object>> ps = (List<Map<String, Object>>) t.get("players");
            Json.put(t, "avg_rating", (long) Rng.jsRound(sumRating(ps) / Math.max(1, ps.size())));
            Map<String, Object> pf = (Map<String, Object>) t.get("platforms");
            pf.put("java", 0);
            pf.put("bedrock", 0);
            for (Map<String, Object> p : ps) {
                String k = "bedrock".equals(Json.str(p, "platform", "")) ? "bedrock" : "java";
                pf.put(k, ((Number) pf.get(k)).intValue() + 1);
            }
        }
        return teams;
    }
}
