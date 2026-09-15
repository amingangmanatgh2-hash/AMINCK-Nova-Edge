// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — bridge/BridgeClient.java (پورت Bridge/BridgeClient.php)
//  کلاینت HTTP به Worker با امضای HMAC یکسان با PHP/JS
// ═══════════════════════════════════════════════════════════════════
package ir.novaedge.bridge;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.function.Consumer;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

public class BridgeClient {

    private static final Gson GSON = new Gson();

    private final String url;
    private final String key;
    private final String serverId;
    private final HttpClient http;

    public BridgeClient(String url, String key, String serverId) {
        this.url = url == null ? "" : url.replaceAll("/+$", "");
        this.key = key == null ? "" : key;
        this.serverId = serverId == null ? "" : serverId;
        this.http = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(8))
                .build();
    }

    public boolean configured() {
        return !url.isEmpty() && !key.isEmpty();
    }

    public String url() {
        return url;
    }

    public String serverId() {
        return serverId;
    }

    // ── امضای یکسان با PHP/JS: hex(sha256(body)) → HMAC → hex ─────
    public static String hex(byte[] bytes) {
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) {
            sb.append(String.format("%02x", b & 0xFF));
        }
        return sb.toString();
    }

    public static String sha256Hex(String s) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return hex(md.digest(s.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            return "";
        }
    }

    public String sign(String body, String ts) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return hex(mac.doFinal((ts + ":" + sha256Hex(body)).getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            return "";
        }
    }

    /** ارسال ناهمزمان (بدون بلاک کردن سرور بازی) با کال‌بک روی نتیجه */
    public CompletableFuture<JsonObject> send(String path, Object payload) {
        if (!configured()) {
            return CompletableFuture.completedFuture(null);
        }
        String body = GSON.toJson(payload);
        String ts = String.valueOf(System.currentTimeMillis() / 1000L);
        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(url + path))
                .timeout(Duration.ofSeconds(12))
                .header("Content-Type", "application/json")
                .header("X-Nova-Server", serverId)
                .header("X-Nova-Key", key)
                .header("X-Nova-Ts", ts)
                .header("X-Nova-Sig", sign(body, ts))
                .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                .build();
        return http.sendAsync(req, HttpResponse.BodyHandlers.ofString())
                .thenApply(resp -> {
                    try {
                        return JsonParser.parseString(resp.body()).getAsJsonObject();
                    } catch (Exception e) {
                        return null;
                    }
                })
                .exceptionally(err -> null);
    }

    public void send(String path, Object payload, Consumer<JsonObject> cb) {
        send(path, payload).thenAccept(j -> {
            if (cb != null) {
                cb.accept(j);
            }
        });
    }

    /** تبدیل JsonObject به Map برای مصرف موتور (Json/Brain) */
    @SuppressWarnings("unchecked")
    public static Map<String, Object> toMap(JsonObject j) {
        if (j == null) {
            return null;
        }
        return (Map<String, Object>) SpecBridge.convert(j);
    }

    // ── کانورتر gson → Map (مشابه Spec.convert) ─────────────────────
    static final class SpecBridge {
        static Object convert(com.google.gson.JsonElement el) {
            if (el == null || el.isJsonNull()) {
                return null;
            }
            if (el.isJsonPrimitive()) {
                com.google.gson.JsonPrimitive p = el.getAsJsonPrimitive();
                if (p.isBoolean()) {
                    return p.getAsBoolean();
                }
                if (p.isNumber()) {
                    return p.getAsDouble();
                }
                return p.getAsString();
            }
            if (el.isJsonArray()) {
                java.util.List<Object> out = new java.util.ArrayList<>();
                for (com.google.gson.JsonElement e : el.getAsJsonArray()) {
                    out.add(convert(e));
                }
                return out;
            }
            java.util.Map<String, Object> out = new java.util.LinkedHashMap<>();
            for (Map.Entry<String, com.google.gson.JsonElement> e : el.getAsJsonObject().entrySet()) {
                out.put(e.getKey(), convert(e.getValue()));
            }
            return out;
        }
    }
}
