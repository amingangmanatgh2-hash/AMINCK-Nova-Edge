// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — core/Brain.java (پورت دقیق shared/engine/brain.js)
//  مغز محلی بات‌ها (utility scoring) + انسانی‌سازی + ادغام ابری + هش وضعیت
// ═══════════════════════════════════════════════════════════════════
package ir.novaedge.core;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

public final class Brain {

    private Brain() {
    }

    public static List<String> allowedActions(Map<String, Object> modeSpec) {
        List<String> out = new ArrayList<>();
        Map<String, Object> bot = Json.map(modeSpec, "bot");
        for (Object o : Json.list(bot == null ? null : bot.get("decisions"))) {
            out.add(String.valueOf(o));
        }
        return out;
    }

    private static double dist(Map<String, Object> a) {
        if (a == null) {
            return 999;
        }
        if (a.get("dist") != null) {
            return Json.num(a, "dist", 999);
        }
        return Json.num(a, "distance", 999);
    }

    /** مرتب‌سازی پایدار مثل Array.prototype.sort در JS */
    private static <T> List<T> stableSort(List<T> list, Comparator<T> cmp) {
        List<Object[]> dec = new ArrayList<>();
        for (int i = 0; i < list.size(); i++) {
            dec.add(new Object[]{i, list.get(i)});
        }
        dec.sort((x, y) -> {
            @SuppressWarnings("unchecked")
            int c = cmp.compare((T) x[1], (T) y[1]);
            return c != 0 ? c : ((Integer) x[0]).compareTo((Integer) y[0]);
        });
        List<T> out = new ArrayList<>();
        for (Object[] d : dec) {
            @SuppressWarnings("unchecked")
            T v = (T) d[1];
            out.add(v);
        }
        return out;
    }

    private static Map<String, Object> nearest(List<Map<String, Object>> list) {
        if (list == null || list.isEmpty()) {
            return null;
        }
        return stableSort(list, Comparator.comparingDouble(Brain::dist)).get(0);
    }

    private static double hpRatio(Map<String, Object> bot) {
        double max = Json.num(bot, "max_hp", 0);
        if (max == 0) {
            max = 20;
        }
        double hp = bot.get("hp") != null ? Json.num(bot, "hp", max) : max;
        return Rng.clamp(hp / max, 0, 1);
    }

    public static List<Map<String, Object>> scoreActions(Map<String, Object> ctx) {
        Map<String, Object> mode = Json.map(ctx, "mode");
        Map<String, Object> bot = Json.map(ctx, "bot");
        Map<String, Object> w = Json.map(ctx, "world");
        Map<String, Object> params = Json.map(ctx, "params");
        if (mode == null) {
            mode = Json.obj();
        }
        if (bot == null) {
            bot = Json.obj();
        }
        if (w == null) {
            w = Json.obj();
        }
        if (params == null) {
            params = Json.obj();
        }
        List<Map<String, Object>> out = new ArrayList<>();
        List<String> allowed = allowedActions(mode);

        Map<String, Object> enemy = nearest(Json.mapList(w.get("alive_enemies")));
        Map<String, Object> ally = nearest(Json.mapList(w.get("alive_allies")));
        double hp = hpRatio(bot);
        Map<String, Object> weights = Json.map(Json.map(mode, "bot"), "weights");
        double aggro = params.get("aggro") != null ? Json.num(params, "aggro", 0.5) : (weights != null ? Json.num(weights, "aggro", 0.5) : 0.5);
        double tw = Json.num(params, "teamwork", 0.5);
        double eco = Json.num(params, "resource_efficiency", 0.5);
        double build = Json.num(params, "build_skill", 0.3);
        double skill = Json.num(params, "skill", 0.3);
        double timeLeft = Math.max(0, Json.num(w, "duration_sec", 0) - Json.num(w, "elapsed_sec", 0));
        Map<String, Object> scores = Json.map(w, "scores");
        double myScore = Json.num(scores, "my_team", 0);
        double enScore = Json.num(scores, "enemy_team", 0);
        boolean losing = enScore > myScore;

        if (allowed.contains("retreat_low_hp") && hp <= Json.num(params, "retreat_hp", 0.25)) {
            push(out, "retreat_low_hp", 3 + (1 - hp) * 4, enemy == null ? null : idOf(enemy), "جان " + Rng.jsRound(hp * 100) + "%");
        }
        if (enemy != null && allowed.contains("hunt_nearest")) {
            push(out, "hunt_nearest", 1.4 + aggro * 2 - dist(enemy) / 40 - Json.num(enemy, "hp", 20) / 40, idOf(enemy), "دشمن در " + Rng.jsRound(dist(enemy)) + " بلوکی");
        }
        if (enemy != null && allowed.contains("engage_nearest")) {
            push(out, "engage_nearest", 1.5 + aggro * 2 - dist(enemy) / 35, idOf(enemy), "درگیری نزدیک");
        }
        if (enemy != null && allowed.contains("engage_opponent")) {
            push(out, "engage_opponent", 1.6 + aggro * 2 - dist(enemy) / 30, idOf(enemy), "حریف دوئل");
        }
        if (enemy != null && allowed.contains("combo_attack") && dist(enemy) < 4) {
            push(out, "combo_attack", 2 + skill * 2.5, idOf(enemy), "کمبو در برد");
        }
        if (enemy != null && allowed.contains("focus_fire") && ally != null && dist(enemy) < 12) {
            push(out, "focus_fire", 1.8 + tw * 2, idOf(enemy), "تمرکز آتش تیمی");
        }

        List<Map<String, Object>> resSorted = stableSort(Json.mapList(w.get("resources")), Comparator.comparingDouble(Brain::dist));
        Map<String, Object> res = resSorted.isEmpty() ? null : resSorted.get(0);
        if (allowed.contains("collect_resource")) {
            Map<String, Object> bres = Json.map(bot, "resources");
            double need = bres != null && Json.num(bres, "iron", 0) < 20 ? 1.2 : 0.6;
            push(out, "collect_resource", 0.9 + eco * need * 1.5 - dist(res) / 60, res == null ? null : idOf(res), "جمع‌آوری منبع");
        }
        if (allowed.contains("mine_ores")) {
            push(out, "mine_ores", 0.8 + eco * 1.6 - dist(res) / 80, res == null ? null : idOf(res), "استخراج");
        }
        if (allowed.contains("loot_chest")) {
            List<Map<String, Object>> chests = stableSort(filterLoose(Json.mapList(w.get("chests"))), Comparator.comparingDouble(Brain::dist));
            if (!chests.isEmpty()) {
                Map<String, Object> chest = chests.get(0);
                push(out, "loot_chest", 1.2 + eco * 1.2 - dist(chest) / 50, idOf(chest), "صندوق غارت‌نشده");
            }
        }
        if (allowed.contains("farm_resources")) {
            push(out, "farm_resources", 0.5 + eco, null, "فارم");
        }
        Map<String, Object> inv = Json.map(bot, "inventory");
        if (allowed.contains("eat_food") && hp < 0.75 && Json.num(inv, "food", 0) > 0) {
            push(out, "eat_food", 2.2 - hp, null, "گرسنگی/جان");
        }
        if (allowed.contains("heal_golden_apple") && hp < 0.6 && Json.num(inv, "golden_apple", 0) > 0) {
            push(out, "heal_golden_apple", 3 - hp, null, "جان کم + سیب طلایی");
        }
        if (allowed.contains("use_potion") && hp < 0.55 && Json.num(inv, "potion", 0) > 0) {
            push(out, "use_potion", 2.6 - hp, null, "معجون");
        }

        if (allowed.contains("buy_item")) {
            int affordable = Json.list(w.get("shop_affordable")) == null ? 0 : Json.list(w.get("shop_affordable")).size();
            double betterGear = Json.num(w, "gear_gap", 0);
            push(out, "buy_item", 0.7 + eco * 1.4 + betterGear * 2 + Math.min(1.2, affordable * 0.2), null, affordable + " خرید ممکن");
        }
        if (allowed.contains("buy_upgrade")) {
            push(out, "buy_upgrade", 0.6 + eco * 1.8 + (losing ? 0.8 : 0), null, "ارتقای تیمی");
        }
        if (allowed.contains("craft_gear")) {
            push(out, "craft_gear", 0.8 + eco * 1.5 + Json.num(w, "gear_gap", 0), null, "ساخت ابزار");
        }
        if (allowed.contains("smelt_food")) {
            push(out, "smelt_food", 0.4 + eco, null, "پخت غذا");
        }
        if (allowed.contains("pick_kit")) {
            push(out, "pick_kit", 2.5 + (Json.num(w, "elapsed_sec", 0) < 20 ? 2 : 0), null, "انتخاب کیت");
        }

        if (allowed.contains("bridge_to_island")) {
            List<Map<String, Object>> islands = stableSort(filterOwned(Json.mapList(w.get("islands"))), Comparator.comparingDouble(Brain::dist));
            Map<String, Object> target = islands.isEmpty() ? null : islands.get(0);
            push(out, "bridge_to_island", 0.9 + build * 2 - dist(target) / 90, target == null ? null : idOf(target), "پل به جزیره");
        }
        if (allowed.contains("build_side_bridge")) {
            push(out, "build_side_bridge", 0.7 + build * 1.6, null, "مسیر فرعی");
        }
        if (allowed.contains("build_fort")) {
            push(out, "build_fort", 0.5 + build * 1.4 + (losing ? 0.4 : 0), null, "سنگر");
        }
        if (allowed.contains("build_base")) {
            push(out, "build_base", 0.6 + build * 1.5, null, "ساخت بیس");
        }
        if (allowed.contains("place_blocks")) {
            push(out, "place_blocks", 0.5 + build * 2, null, "ساخت‌وساز");
        }
        if (allowed.contains("add_detail")) {
            push(out, "add_detail", 0.3 + build * 1.2, null, "جزئیات");
        }
        if (allowed.contains("decorate")) {
            push(out, "decorate", 0.25 + build, null, "تزئین");
        }
        if (allowed.contains("choose_blueprint")) {
            push(out, "choose_blueprint", 3 + build, null, "انتخاب طرح");
        }
        if (allowed.contains("barricade_door")) {
            push(out, "barricade_door", 1.6 + tw * 1.8 - Json.num(w, "doors_broken", 0) * 0.3, null, "سنگربندی");
        }
        if (allowed.contains("repair_wall")) {
            push(out, "repair_wall", 1.2 + build, null, "تعمیر");
        }

        if (allowed.contains("defend_bed")) {
            Map<String, Object> obj = Json.map(w, "objectives");
            Map<String, Object> bed = Json.map(obj, "my_bed");
            double threat = Json.num(obj, "bed_threat_dist", 999);
            int threatNearBed = threat < 18 ? 1 : 0;
            push(out, "defend_bed", 1.1 + tw * 1.2 + threatNearBed * 3 - (bed != null && Json.bool(bed, "obsidian", false) ? 0.6 : 0), null,
                    threatNearBed == 1 ? "تهدید نزدیک تخت" : "محافظت تخت");
        }
        Map<String, Object> obj2 = Json.map(w, "objectives");
        Map<String, Object> myBed = Json.map(obj2, "my_bed");
        if (allowed.contains("place_obsidian") && !(myBed != null && Json.bool(myBed, "obsidian", false)) && Json.num(inv, "obsidian", 0) > 0) {
            push(out, "place_obsidian", 2.4, null, "ابسیدین روی تخت");
        }
        if (allowed.contains("set_trap") && !Json.truthy(obj2 == null ? null : obj2.get("my_trap"))) {
            push(out, "set_trap", 0.8 + skill, null, "تله");
        }
        if (allowed.contains("attack_enemy_base")) {
            List<Map<String, Object>> weaks = stableSort(filterObsidian(Json.mapList(obj2 == null ? null : obj2.get("enemy_beds"))), Comparator.comparingDouble(Brain::dist));
            Map<String, Object> weak = weaks.isEmpty() ? null : weaks.get(0);
            Object teamVal = weak == null ? null : weak.get("team");
            push(out, "attack_enemy_base", 1.2 + aggro * 1.6 - dist(weak) / 100 + (timeLeft < 180 ? 1.5 : 0),
                    weak != null && Json.truthy(teamVal) ? jsStr(teamVal) : null,
                    weak != null ? "تخت بدون اابسیدین" : "حمله به بیس");
        }
        if (allowed.contains("push_bridge")) {
            push(out, "push_bridge", 1.5 + aggro * 1.4 - dist(enemy) / 60, enemy == null ? null : idOf(enemy), "فشار روی پل");
        }
        if (allowed.contains("defend_goal")) {
            push(out, "defend_goal", 1 + tw * 1.6 + (losing ? 1 : 0), null, "دفاع از دروازه");
        }
        if (allowed.contains("block_enemy_path")) {
            push(out, "block_enemy_path", 0.9 + build + aggro * 0.5, enemy == null ? null : idOf(enemy), "بستن مسیر");
        }
        if (allowed.contains("goal")) {
            push(out, "goal", 3, null, "گل");
        }

        if (allowed.contains("path_next_checkpoint")) {
            double d = Json.num(w, "next_checkpoint_dist", 10);
            push(out, "path_next_checkpoint", 2.5 - d / 60, w.get("next_checkpoint_id"), "چک‌پوینت بعدی");
        }
        if (allowed.contains("path_to_safe_block")) {
            push(out, "path_to_safe_block", 2.2 - Json.num(w, "unsafe_blocks_ahead", 0) * 0.2, null, "بلوک امن");
        }
        if (allowed.contains("keep_moving")) {
            push(out, "keep_moving", 1.4, null, "توقف = مرگ");
        }
        if (allowed.contains("avoid_falling_block")) {
            push(out, "avoid_falling_block", 1.8 - Json.num(w, "blocks_left_ratio", 1) * 0.5, null, "بلوک در حال ریزش");
        }
        if (allowed.contains("center_control")) {
            push(out, "center_control", 0.6 + (timeLeft < 120 ? 1.2 : 0), null, "مرکز نقشه");
        }
        if (allowed.contains("knock_nearest") && enemy != null && dist(enemy) < 5) {
            push(out, "knock_nearest", 1 + aggro, idOf(enemy), "پرت کردن حریف");
        }
        if (allowed.contains("jump_timing")) {
            push(out, "jump_timing", 0.8 + skill, null, "زمان‌بندی پرش");
        }
        if (allowed.contains("sprint_control")) {
            push(out, "sprint_control", 0.7 + skill, null, "کنترل دویدن");
        }
        if (allowed.contains("recover_after_fall")) {
            push(out, "recover_after_fall", Json.truthy(w.get("just_fell")) ? 3 : 0.1, null, "بازگشت بعد سقوط");
        }

        double deception = Json.num(params, "deception", 0);
        if (allowed.contains("blend_with_crowd")) {
            push(out, "blend_with_crowd", 1 + deception * 1.6, null, "قاطی جمعیت");
        }
        if (allowed.contains("isolate_target")) {
            List<Map<String, Object>> sorted = stableSort(Json.mapList(w.get("alive_enemies")),
                    (a, b) -> {
                        int c = Double.compare(Json.num(a, "nearby_allies", 0), Json.num(b, "nearby_allies", 0));
                        return c != 0 ? c : Double.compare(dist(a), dist(b));
                    });
            Map<String, Object> target = sorted.isEmpty() ? null : sorted.get(0);
            push(out, "isolate_target", "murderer".equals(Json.str(bot, "role", "")) ? 2.2 + deception * 2 - dist(target) / 40 : 0,
                    target == null ? null : idOf(target), "هدف تنها");
        }
        if (allowed.contains("collect_gold")) {
            Map<String, Object> g = nearest(Json.mapList(w.get("gold")));
            push(out, "collect_gold", 1 + eco - dist(g) / 50, g == null ? null : idOf(g), "طلای روی زمین");
        }
        if (allowed.contains("accuse")) {
            push(out, "accuse", 0.4 + deception * 1.5 + Json.num(w, "suspicion", 0), w.get("suspect_id"), "اتهام");
        }
        if (allowed.contains("follow_suspect")) {
            push(out, "follow_suspect", 0.9 + skill + Json.num(w, "suspicion", 0) * 0.5, w.get("suspect_id"), "تعقیب مشکوک");
        }
        if (allowed.contains("escape_chase")) {
            push(out, "escape_chase", Json.truthy(w.get("being_chased")) ? 3.2 : 0.2, null, "فرار از تعقیب");
        }
        if (allowed.contains("throw_bow")) {
            push(out, "throw_bow", Json.truthy(w.get("has_bow")) ? 2.4 : 0, enemy == null ? null : idOf(enemy), "کمان");
        }
        if (allowed.contains("fake_activity")) {
            push(out, "fake_activity", 0.5 + deception * 1.4, null, "فعالیت جعلی");
        }

        if (allowed.contains("dig_under_target") && enemy != null) {
            push(out, "dig_under_target", 1.4 + aggro * 1.4 - dist(enemy) / 25, idOf(enemy), "کندن زیر حریف");
        }
        if (allowed.contains("dig_escape_path")) {
            push(out, "dig_escape_path", 0.8 + Json.num(w, "holes_near", 0) * 0.3, null, "مسیر فرار");
        }
        if (allowed.contains("avoid_holes")) {
            push(out, "avoid_holes", 1 + Json.num(w, "holes_near", 0) * 0.4, null, "دوری از سوراخ‌ها");
        }
        if (allowed.contains("throw_snowball") && enemy != null && Json.num(inv, "snowball", 0) > 0) {
            push(out, "throw_snowball", 1 + aggro, idOf(enemy), "گلوله برفی");
        }
        if (allowed.contains("corner_opponent") && enemy != null) {
            push(out, "corner_opponent", 0.9 + skill, idOf(enemy), "گوشه انداختن");
        }

        if (allowed.contains("hold_chokepoint")) {
            push(out, "hold_chokepoint", 1.3 + tw * 1.5 - Json.num(w, "zombie_pressure", 0) * 0.2, null, "نقطهٔ گلوگاه");
        }
        if (allowed.contains("kite_zombies")) {
            push(out, "kite_zombies", 1 + (Json.num(w, "zombie_pressure", 0) > 6 ? 1.5 : 0), null, "کایت کردن");
        }
        if (allowed.contains("revive_teammate")) {
            Map<String, Object> down = nearest(Json.mapList(w.get("downed_allies")));
            push(out, "revive_teammate", down != null ? 2.4 + tw * 2 - dist(down) / 30 : 0, down == null ? null : idOf(down), down != null ? "یار افتاده" : "");
        }

        if (allowed.contains("throw_ender_pearl") && Json.num(inv, "ender_pearl", 0) > 0 && enemy != null && dist(enemy) > 12 && dist(enemy) < 30) {
            push(out, "throw_ender_pearl", 1.2 + aggro, idOf(enemy), "اندرفرل");
        }
        if (allowed.contains("camp_high_ground")) {
            push(out, "camp_high_ground", 0.6 + (1 - aggro) * 1.4 + (timeLeft < 120 ? -1 : 0), null, "ارتفاع");
        }
        if (allowed.contains("third_party_fight")) {
            push(out, "third_party_fight", Json.truthy(w.get("fighting_nearby")) ? 1.6 + aggro : 0.2, null, "حمله به درگیری");
        }
        if (allowed.contains("avoid_strong")) {
            push(out, "avoid_strong", enemy != null && Json.num(enemy, "gear_score", 0) > Json.num(bot, "gear_score", 0) * 1.4 ? 1.8 : 0.2, enemy == null ? null : idOf(enemy), "حریف قوی‌تر");
        }
        if (allowed.contains("rotate_border")) {
            push(out, "rotate_border", Json.truthy(w.get("border_close")) ? 2.2 : 0.3, null, "چرخش به مرکز");
        }
        if (allowed.contains("avoid_border")) {
            push(out, "avoid_border", Json.truthy(w.get("border_close")) ? 2.2 : 0.3, null, "دوری از بوردر");
        }
        if (allowed.contains("ambush")) {
            push(out, "ambush", 0.7 + aggro * 0.8 + (1 - skill) * -0.3, null, "کمین");
        }

        if (allowed.contains("claim_chunk")) {
            push(out, "claim_chunk", 1 + tw - Json.num(w, "claimed_chunks", 0) * 0.05, null, "ادعا");
        }
        if (allowed.contains("raid_enemy_base")) {
            push(out, "raid_enemy_base", 0.9 + aggro * 1.6 - Json.num(w, "enemy_power_gap", 0) * 0.4, null, "غارت");
        }
        if (allowed.contains("defend_claim")) {
            push(out, "defend_claim", 1 + tw + Json.num(w, "under_raid", 0) * 2, null, "دفاع از ادعا");
        }
        if (allowed.contains("recruit")) {
            push(out, "recruit", 0.3, null, "یارگیری");
        }
        if (allowed.contains("vote_for_build")) {
            push(out, "vote_for_build", Json.truthy(w.get("voting_phase")) ? 3 : 0, w.get("best_build_id"), "رای");
        }

        if (allowed.contains("bow_pressure") && Json.num(inv, "arrow", 0) > 0 && enemy != null && dist(enemy) > 6) {
            push(out, "bow_pressure", 1.3 + skill, idOf(enemy), "فشار با کمان");
        }
        if (allowed.contains("w_combo") && enemy != null && dist(enemy) < 5) {
            push(out, "w_combo", 1.6 + skill * 2, idOf(enemy), "W-combo");
        }
        if (allowed.contains("block_corner") && enemy != null) {
            push(out, "block_corner", 0.8 + skill, idOf(enemy), "گوشه");
        }
        if (allowed.contains("strafe_combat") && enemy != null && dist(enemy) < 8) {
            push(out, "strafe_combat", 1.2 + Json.num(params, "strafe_quality", 0.4), idOf(enemy), "استریف");
        }
        if (allowed.contains("respawn_attack")) {
            push(out, "respawn_attack", Json.truthy(w.get("just_respawned")) ? 2 : 0.4, null, "حمله بعد ریسپاون");
        }
        if (allowed.contains("team_up_push")) {
            push(out, "team_up_push", 1 + tw * 1.6 + (losing ? 1.2 : 0), null, "حملهٔ هماهنگ");
        }

        return stableSort(out, Comparator.comparingDouble((Map<String, Object> m) -> Json.num(m, "score", 0)).reversed());
    }

    private static List<Map<String, Object>> filterLoose(List<Map<String, Object>> chests) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (chests != null) {
            for (Map<String, Object> c : chests) {
                if (!Json.bool(c, "looted", false)) {
                    out.add(c);
                }
            }
        }
        return out;
    }

    private static List<Map<String, Object>> filterOwned(List<Map<String, Object>> islands) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (islands != null) {
            for (Map<String, Object> c : islands) {
                if (!Json.bool(c, "owned_by_me", false)) {
                    out.add(c);
                }
            }
        }
        return out;
    }

    private static List<Map<String, Object>> filterObsidian(List<Map<String, Object>> beds) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (beds != null) {
            for (Map<String, Object> c : beds) {
                if (!Json.bool(c, "obsidian", false)) {
                    out.add(c);
                }
            }
        }
        return out;
    }

    /** معادل $x['id'] ?? null در PHP — مقدار خام بدون رشته‌سازی */
    private static Object idOf(Map<String, Object> m) {
        return m == null ? null : m.get("id");
    }

    /** رشته‌سازی به سبک JS/PHP: عدد صحیح بدون .0 */
    private static String jsStr(Object o) {
        if (o == null) {
            return "";
        }
        if (o instanceof Number) {
            return numStr(o);
        }
        return String.valueOf(o);
    }

    private static void push(List<Map<String, Object>> out, String action, double score, Object target, String why) {
        Map<String, Object> m = Json.obj();
        Json.put(m, "action", action);
        Json.put(m, "score", Rng.roundTo(score, 3));
        Json.put(m, "target", target);
        Json.put(m, "why", why);
        out.add(m);
    }

    public static Map<String, Object> heuristicDecide(Map<String, Object> ctx) {
        List<Map<String, Object>> scored = scoreActions(ctx);
        if (scored.isEmpty()) {
            Map<String, Object> idle = Json.obj();
            Json.put(idle, "action", "idle");
            Json.put(idle, "target", null);
            Json.put(idle, "score", 0);
            Json.put(idle, "why", "هیچ عمل مجازی نیست");
            Json.put(idle, "source", "heuristic");
            Json.put(idle, "confidence", 0);
            return idle;
        }
        Map<String, Object> params = Json.map(ctx, "params");
        double skill = Rng.clamp(Json.num(params, "skill", 0.3), 0, 1);
        Rng.Generator rng = (Rng.Generator) ctx.get("rng");
        double mistakeRate = Rng.clamp(Json.num(params, "mistake_rate", 0.1), 0, 0.5);

        Map<String, Object> chosen = scored.get(0);
        if (rng != null && rng.chance(mistakeRate) && scored.size() > 1) {
            chosen = scored.get(Math.min(scored.size() - 1, rng.int_(1, 3)));
        } else if (rng != null && scored.size() > 1) {
            double spread = (1 - skill) * 0.9;
            List<Map<String, Object>> noisy = new ArrayList<>();
            for (int i = 0; i < scored.size(); i++) {
                Map<String, Object> c = new java.util.LinkedHashMap<>(scored.get(i));
                c.put("n", Json.num(c, "score", 0) + rng.gauss() * spread * (1 + i * 0.15));
                noisy.add(c);
            }
            noisy = stableSort(noisy, Comparator.comparingDouble((Map<String, Object> m) -> Json.num(m, "n", 0)).reversed());
            Map<String, Object> top = noisy.get(0);
            Map<String, Object> found = null;
            for (Map<String, Object> c : scored) {
                if (java.util.Objects.equals(c.get("action"), top.get("action")) && java.util.Objects.equals(c.get("target"), top.get("target"))) {
                    found = c;
                    break;
                }
            }
            chosen = found != null ? found : scored.get(0);
        }
        Map<String, Object> out = Json.obj();
        Json.put(out, "action", chosen.get("action"));
        Json.put(out, "target", chosen.get("target"));
        Json.put(out, "score", chosen.get("score"));
        Json.put(out, "why", chosen.get("why"));
        Json.put(out, "source", "heuristic");
        Json.put(out, "confidence", Rng.roundTo(Rng.clamp(Json.num(chosen, "score", 0) / 4, 0, 1), 2));
        List<Map<String, Object>> alts = new ArrayList<>();
        for (int i = 0; i < Math.min(4, scored.size()); i++) {
            Map<String, Object> a = Json.obj();
            Json.put(a, "action", scored.get(i).get("action"));
            Json.put(a, "score", scored.get(i).get("score"));
            alts.add(a);
        }
        Json.put(out, "alternatives", alts);
        return out;
    }

    public static Map<String, Object> humanizeAction(Map<String, Object> decision, Map<String, Object> params, Rng.Generator rng) {
        Map<String, Object> p = params == null ? Json.obj() : params;
        Map<String, Object> out = new java.util.LinkedHashMap<>(decision);
        long reaction = rng != null ? rng.int_(Json.num(Json.map(p, "reaction_ms"), "min", 300), Json.num(Json.map(p, "reaction_ms"), "max", 600)) : 400;
        double aimError = rng != null ? Math.abs(rng.normal(0, Json.num(Json.map(p, "aim_error_deg"), "max", 8) / 2)) : 4;
        boolean fumble = rng != null && rng.chance(Json.num(p, "mistake_rate", 0.1));
        out.put("reaction_ms", reaction);
        out.put("aim_error_deg", Rng.roundTo(aimError, 1));
        out.put("fumble", fumble);
        out.put("fumble_kind", fumble ? (rng != null ? rng.pick(List.of("miss_click", "wrong_direction", "late_jump", "drop_item")) : "miss_click") : null);
        boolean chatGate = Json.bool(p, "chat_enabled", false) && rng != null;
        out.put("should_chat", chatGate
                ? rng.chance((Json.num(p, "chat_per_min", 2) / 60) / Math.max(1, Json.num(p, "decision_hz", 5)))
                : false);
        return out;
    }

    /** هش FNV-1a — مثل stateHash در brain.js (خروجی base36) */
    public static String stateHash(Map<String, Object> ctx) {
        Map<String, Object> w = Json.map(ctx, "world");
        Map<String, Object> b = Json.map(ctx, "bot");
        if (w == null) {
            w = Json.obj();
        }
        if (b == null) {
            b = Json.obj();
        }
        List<String> enemies = new ArrayList<>();
        for (Map<String, Object> e : Json.mapList(w.get("alive_enemies"))) {
            enemies.add(jsStr(e.get("id")) + ":" + Rng.jsRound(dist(e) / 3));
        }
        Map<String, Object> obj = Json.map(w, "objectives");
        Object bedsGoals = obj != null && obj.get("beds") != null ? obj.get("beds") : (obj != null && obj.get("goals") != null ? obj.get("goals") : Json.obj());
        List<Object> parts = new ArrayList<>();
        parts.add(Json.str(Json.map(ctx, "mode"), "id", null));
        parts.add(ctx.get("tier"));
        parts.add(Rng.jsRound(Json.num(w, "elapsed_sec", 0) / 5) * 5);
        parts.add(Rng.jsRound(Json.num(b, "hp", 0)));
        parts.add(String.join(",", enemies));
        parts.add(compactJson(w.get("scores") != null ? w.get("scores") : Json.obj()));
        parts.add(compactJson(bedsGoals));
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < parts.size(); i++) {
            if (i > 0) {
                sb.append('|');
            }
            Object x = parts.get(i);
            sb.append(jsStr(x)); // null → "" مثل join در JS و (string) در PHP
        }
        int h = 2166136261;
        String s = sb.toString();
        for (int i = 0; i < s.length(); i++) {
            h ^= s.charAt(i);
            h *= 16777619;
        }
        return Integer.toUnsignedString(h, 36);
    }

    /** JSON فشرده با ترتیب درج و {} برای آبجکت خالی (مثل JSON.stringify) */
    public static String compactJson(Object o) {
        if (o instanceof Map<?, ?> m) {
            if (m.isEmpty()) {
                return "{}";
            }
            StringBuilder sb = new StringBuilder("{");
            boolean first = true;
            for (Map.Entry<?, ?> e : m.entrySet()) {
                if (!first) {
                    sb.append(',');
                }
                first = false;
                sb.append('"').append(escape(String.valueOf(e.getKey()))).append("\":").append(compactJson(e.getValue()));
            }
            return sb.append('}').toString();
        }
        if (o instanceof List<?> l) {
            StringBuilder sb = new StringBuilder("[");
            boolean first = true;
            for (Object e : l) {
                if (!first) {
                    sb.append(',');
                }
                first = false;
                sb.append(compactJson(e));
            }
            return sb.append(']').toString();
        }
        if (o == null) {
            return "null";
        }
        if (o instanceof Boolean || o instanceof Number) {
            return numStr(o);
        }
        return '"' + escape(String.valueOf(o)) + '"';
    }

    private static String numStr(Object o) {
        if (o instanceof Double d || o instanceof Float f) {
            double d = ((Number) o).doubleValue();
            if (d == Math.floor(d) && !Double.isInfinite(d) && Math.abs(d) < 1e15) {
                return String.valueOf((long) d);
            }
            return String.valueOf(d);
        }
        return String.valueOf(o);
    }

    private static String escape(String s) {
        return s.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    public static boolean shouldConsultLlm(Map<String, Object> ctx, Map<String, Object> budget) {
        String tier = Json.str(ctx, "tier", null);
        Map<String, Object> bot = Json.map(Json.map(ctx, "mode"), "bot");
        Map<String, Object> intervals = bot == null ? null : Json.map(bot, "llm_interval_sec");
        double interval = intervals == null || tier == null ? 0 : Json.num(intervals, tier, 0);
        if (interval == 0 || !Json.bool(budget, "llm_enabled", false)) {
            return false;
        }
        double elapsed = Json.num(Json.map(ctx, "world"), "elapsed_sec", 0);
        double last = budget.get("last_call_sec") != null ? Json.num(budget, "last_call_sec", -1e9) : -1e9;
        if (elapsed - last < interval) {
            return false;
        }
        if (Json.num(budget, "used", 0) >= Json.num(budget, "allowed", 0)) {
            return false;
        }
        String h = stateHash(ctx);
        Map<String, Object> cache = Json.map(budget, "cache");
        if (cache != null && Json.truthy(cache.get(h))) {
            return false;
        }
        return true;
    }

    public static Map<String, Object> mergeDecisions(Map<String, Object> local, Map<String, Object> cloud) {
        if (cloud == null || !Json.bool(cloud, "ok", false)) {
            Map<String, Object> out = new java.util.LinkedHashMap<>(local);
            out.put("cloud_used", false);
            return out;
        }
        Map<String, Object> d = Json.map(cloud, "decision");
        if (d == null || "idle".equals(Json.str(d, "action", ""))) {
            Map<String, Object> out = new java.util.LinkedHashMap<>(local);
            out.put("cloud_used", true);
            return out;
        }
        Map<String, Object> out = new java.util.LinkedHashMap<>(d);
        out.put("alternatives", local.get("alternatives"));
        out.put("cloud_used", true);
        out.put("local_action", local.get("action"));
        return out;
    }
}
