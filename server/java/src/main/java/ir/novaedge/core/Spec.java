// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — core/Spec.java (معادل shared/engine/spec.js)
//  بارگذاری کاتالوگ از JSONهای shared/spec (که با pom داخل jar کپی می‌شوند):
//    spec/gamemodes.json → مودها، spec/ranks.json → رنک‌ها،
//    spec/bot-tiers.json → تیرهای بات + humanization
// ═══════════════════════════════════════════════════════════════════
package ir.novaedge.core;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.JsonPrimitive;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class Spec {

    private Spec() {
    }

    private static Map<String, Object> gamemodesCache;
    private static Map<String, Object> ranksCache;
    private static Map<String, Object> tiersCache;

    private static String readResource(String path) {
        try (InputStream in = Spec.class.getResourceAsStream(path)) {
            if (in == null) {
                return null;
            }
            StringBuilder sb = new StringBuilder();
            char[] buf = new char[4096];
            InputStreamReader r = new InputStreamReader(in, StandardCharsets.UTF_8);
            int n;
            while ((n = r.read(buf)) > 0) {
                sb.append(buf, 0, n);
            }
            return sb.toString();
        } catch (IOException e) {
            return null;
        }
    }

    private static Object convert(JsonElement el) {
        if (el == null || el.isJsonNull()) {
            return null;
        }
        if (el.isJsonPrimitive()) {
            JsonPrimitive p = el.getAsJsonPrimitive();
            if (p.isBoolean()) {
                return p.getAsBoolean();
            }
            if (p.isNumber()) {
                return p.getAsDouble();
            }
            return p.getAsString();
        }
        if (el.isJsonArray()) {
            JsonArray arr = el.getAsJsonArray();
            List<Object> out = new ArrayList<>();
            for (JsonElement e : arr) {
                out.add(convert(e));
            }
            return out;
        }
        JsonObject obj = el.getAsJsonObject();
        Map<String, Object> out = new LinkedHashMap<>();
        for (Map.Entry<String, JsonElement> e : obj.entrySet()) {
            out.put(e.getKey(), convert(e.getValue()));
        }
        return out;
    }

    /** پارس JSON دلخواه به Map/List/primitives (برای تست‌ها و پاسخ Worker) */
    public static Object parse(String json) {
        return convert(JsonParser.parseString(json));
    }

    @SuppressWarnings("unchecked")
    public static Map<String, Object> parseObject(String json) {
        return (Map<String, Object>) parse(json);
    }

    @SuppressWarnings("unchecked")
    public static List<Object> parseArray(String json) {
        return (List<Object>) parse(json);
    }

    private static synchronized Map<String, Object> load(String res) {
        String json = readResource(res);
        if (json == null) {
            return Json.obj();
        }
        return parseObject(json);
    }

    public static synchronized Map<String, Object> gamemodes() {
        if (gamemodesCache == null) {
            gamemodesCache = load("/spec/gamemodes.json");
        }
        return gamemodesCache;
    }

    public static synchronized Map<String, Object> ranksDoc() {
        if (ranksCache == null) {
            ranksCache = load("/spec/ranks.json");
        }
        return ranksCache;
    }

    public static synchronized Map<String, Object> tiersSpec() {
        if (tiersCache == null) {
            tiersCache = load("/spec/bot-tiers.json");
        }
        return tiersCache;
    }

    /** لیست رنک‌ها (ranks.json → .ranks) */
    public static List<Map<String, Object>> ranks() {
        return Json.mapList(ranksDoc().get("ranks") != null ? ranksDoc().get("ranks") : ranksDoc());
    }

    /** مشخصات یک مود بر اساس شناسه — مثل $mode() در parity.php */
    public static Map<String, Object> modeById(String id) {
        Object modes = gamemodes().get("modes");
        for (Map<String, Object> m : Json.mapList(modes != null ? modes : gamemodes())) {
            if (id != null && id.equals(Json.str(m, "id", null))) {
                return m;
            }
        }
        return Json.obj();
    }

    /** تعریف یک تیر بات از bot-tiers.json */
    public static Map<String, Object> tierById(String id) {
        return BotTier.tierById(tiersSpec(), id);
    }
}
