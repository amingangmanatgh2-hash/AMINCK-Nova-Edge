// ═══════════════════════════════════════════════════════════════
//  ⚠️ این فایل تولیدشده است — دستی ویرایش نکنید.
//  منبع: shared/spec/*.json   تولید: scripts/gen-spec-js.mjs
// ═══════════════════════════════════════════════════════════════
/** gamemodes.json — sha256:bf5ee9543918 */
export const Gamemodes = {
  "$schema": "./gamemodes.schema.json",
  "version": 3,
  "updated": "2026-09-14",
  "note": "Single source of truth for every game mode. Read by the Paper plugin (Java/Gson), the PocketMine plugin (PHP/json_decode) and the Cloudflare Worker (JS). Changing numbers here changes all three runtimes.",
  "modes": [
    {
      "id": "bedwars",
      "name_en": "BedWars",
      "name_fa": "بدوارز",
      "tagline_fa": "تخت تیمت را نگه دار، تخت دشمن را بشکن",
      "category": "team",
      "art": { "icon": "bedwars-icon", "banner": "bedwars-banner", "lobby": "bedwars-lobby" },
      "teams": { "count": 4, "size": 4, "min_players": 4, "max_players": 16, "min_humans": 1, "bot_fill": true },
      "match": {
        "duration_sec": 1800, "warmup_sec": 20, "grace_sec": 10, "respawn_sec": 5,
        "sudden_death_sec": 1500, "sudden_death": "bed_decay", "elo_k": 32, "score_cap": 0
      },
      "scoring": {
        "win": 500, "lose": 60, "kill": 20, "death": -5, "final_kill": 75, "final_death": -15,
        "bed_break": 150, "bed_defend": 40, "resource_collected": 1, "purchase": 2,
        "team_upgrade": 15, "assist": 8, "mvp_bonus": 200, "survive_min": 5
      },
      "economy": {
        "win": 250, "lose": 40, "kill": 10, "final_kill": 25, "bed_break": 60,
        "resource_collected": 1, "mvp_bonus": 80, "xp_win": 300, "xp_kill": 15
      },
      "resources": ["iron", "gold", "diamond", "emerald"],
      "shop": [
        { "id": "wool_16", "cost": { "iron": 4 }, "tier_floor": 0 },
        { "id": "stone_sword", "cost": { "iron": 10 }, "tier_floor": 0 },
        { "id": "iron_sword", "cost": { "iron": 18 }, "tier_floor": 0 },
        { "id": "diamond_sword", "cost": { "emerald": 6 }, "tier_floor": 1 },
        { "id": "chain_armor", "cost": { "iron": 40 }, "tier_floor": 0 },
        { "id": "iron_armor", "cost": { "gold": 12 }, "tier_floor": 1 },
        { "id": "diamond_armor", "cost": { "emerald": 12 }, "tier_floor": 2 },
        { "id": "tnt", "cost": { "gold": 4 }, "tier_floor": 1 },
        { "id": "ender_pearl", "cost": { "emerald": 4 }, "tier_floor": 2 },
        { "id": "invisibility_potion", "cost": { "emerald": 2 }, "tier_floor": 2 },
        { "id": "speed_potion", "cost": { "diamond": 2 }, "tier_floor": 1 },
        { "id": "fireball", "cost": { "iron": 40 }, "tier_floor": 2 },
        { "id": "bridge_egg", "cost": { "emerald": 3 }, "tier_floor": 2 },
        { "id": "obsidian", "cost": { "emerald": 4 }, "tier_floor": 2 }
      ],
      "team_upgrades": [
        { "id": "sharpness", "levels": 2, "cost": [{ "diamond": 4 }, { "diamond": 8 }] },
        { "id": "protection", "levels": 4, "cost": [{ "diamond": 5 }, { "diamond": 10 }, { "diamond": 20 }, { "diamond": 30 }] },
        { "id": "forge", "levels": 4, "cost": [{ "diamond": 4 }, { "diamond": 8 }, { "diamond": 12 }, { "diamond": 16 }] },
        { "id": "heal_pool", "levels": 1, "cost": [{ "diamond": 6 }] },
        { "id": "trap", "levels": 1, "cost": [{ "diamond": 6 }] },
        { "id": "dragon_buff", "levels": 1, "cost": [{ "diamond": 10 }] }
      ],
      "maps": [
        { "id": "lighthouse", "name_fa": "فانوس دریایی", "islands": 4, "size": "large" },
        { "id": "swashbuckle", "name_fa": "دزدان دریایی", "islands": 4, "size": "medium" },
        { "id": "archway", "name_fa": "طاق سنگی", "islands": 4, "size": "small" },
        { "id": "speedway", "name_fa": "بزرگراه", "islands": 8, "size": "large" },
        { "id": "playground", "name_fa": "زمین بازی", "islands": 4, "size": "medium" }
      ],
      "bot": {
        "weights": { "aggro": 0.55, "build": 0.85, "teamwork": 0.85, "defense": 0.7, "economy": 0.8, "utility": 0.6 },
        "roles": ["builder", "attacker", "defender", "support", "resource_carrier"],
        "decisions": [
          "collect_resource", "buy_item", "buy_upgrade", "bridge_to_island", "defend_bed",
          "attack_enemy_base", "place_obsidian", "set_trap", "retreat_low_hp", "team_up_push", "respawn_attack"
        ],
        "llm_interval_sec": { "T0": 0, "T1": 8, "T2": 5, "T3": 3, "T4": 2 },
        "needs_world_model": true
      },
      "anticheat": { "reach_max_blocks": 3.4, "cps_max": 18, "flag_weight_kill": 3 }
    },
    {
      "id": "skywars",
      "name_en": "SkyWars",
      "name_fa": "اسکای‌وارز",
      "tagline_fa": "آخرین بازمانده روی جزیره‌های معلق",
      "category": "ffa",
      "art": { "icon": "skywars-icon", "banner": "skywars-banner", "lobby": "skywars-lobby" },
      "teams": { "count": 12, "size": 1, "min_players": 6, "max_players": 12, "min_humans": 1, "bot_fill": true },
      "match": { "duration_sec": 900, "warmup_sec": 15, "grace_sec": 10, "respawn_sec": 0, "sudden_death_sec": 600, "sudden_death": "border_shrink", "elo_k": 28 },
      "scoring": { "win": 400, "lose": 30, "kill": 40, "death": -10, "assist": 12, "chest_looted": 6, "final_kill": 40, "mvp_bonus": 150, "survive_min": 6 },
      "economy": { "win": 200, "lose": 25, "kill": 18, "chest_looted": 3, "mvp_bonus": 60, "xp_win": 250, "xp_kill": 20 },
      "kits": [
        { "id": "default", "price_coins": 0, "items": ["wooden_sword", "cooked_beef_8"] },
        { "id": "knight", "price_coins": 900, "items": ["iron_sword", "iron_helmet", "cooked_beef_8"] },
        { "id": "archer", "price_coins": 1200, "items": ["bow", "arrow_24", "leather_chestplate"] },
        { "id": "engineer", "price_coins": 1500, "items": ["tnt_4", "flint_and_steel", "iron_boots"] },
        { "id": "enderman", "price_coins": 2500, "items": ["ender_pearl_6", "stone_sword", "iron_chestplate"] },
        { "id": "slime", "price_coins": 3000, "items": ["slime_block_16", "iron_sword", "diamond_boots"] }
      ],
      "maps": [
        { "id": "canopy", "name_fa": "پوشش جنگل", "islands": 12 },
        { "id": "shattered", "name_fa": "جزایر شکسته", "islands": 12 },
        { "id": "temple", "name_fa": "معبد آسمانی", "islands": 8 },
        { "id": "frostbite", "name_fa": "یخ‌زدگی", "islands": 12 }
      ],
      "bot": {
        "weights": { "aggro": 0.75, "build": 0.5, "teamwork": 0.1, "defense": 0.4, "economy": 0.6, "utility": 0.7 },
        "roles": ["looter", "hunter", "camper", "brider"],
        "decisions": ["loot_chest", "bridge_to_island", "hunt_nearest", "throw_ender_pearl", "retreat_low_hp", "camp_high_ground", "third_party_fight"],
        "llm_interval_sec": { "T0": 0, "T1": 10, "T2": 6, "T3": 4, "T4": 3 },
        "needs_world_model": true
      },
      "anticheat": { "reach_max_blocks": 3.4, "cps_max": 18, "flag_weight_kill": 3 }
    },
    {
      "id": "survivalgames",
      "name_en": "Survival Games",
      "name_fa": "بازی‌های بقا",
      "tagline_fa": "هانگر گیمز کلاسیک: غارت کن، فرار کن، بکش",
      "category": "ffa",
      "art": { "icon": "survivalgames-icon", "banner": "survivalgames-banner", "lobby": "survivalgames-lobby" },
      "teams": { "count": 24, "size": 1, "min_players": 8, "max_players": 24, "min_humans": 1, "bot_fill": true },
      "match": { "duration_sec": 1500, "warmup_sec": 20, "grace_sec": 30, "respawn_sec": 0, "sudden_death_sec": 1000, "sudden_death": "border_shrink", "elo_k": 26 },
      "scoring": { "win": 450, "lose": 35, "kill": 35, "death": -10, "assist": 10, "chest_looted": 5, "mvp_bonus": 150, "survive_min": 5 },
      "economy": { "win": 220, "lose": 30, "kill": 16, "chest_looted": 2, "mvp_bonus": 60, "xp_win": 260, "xp_kill": 18 },
      "kits": [
        { "id": "default", "price_coins": 0, "items": [] },
        { "id": "scout", "price_coins": 800, "items": ["leather_boots", "cooked_beef_6"] },
        { "id": "brute", "price_coins": 1600, "items": ["stone_axe", "iron_helmet"] },
        { "id": "medic", "price_coins": 1800, "items": ["splash_potion_healing_2", "golden_apple_1"] },
        { "id": "ranger", "price_coins": 2200, "items": ["bow", "arrow_16", "leather_helmet"] }
      ],
      "maps": [
        { "id": "colosseum", "name_fa": "کولوسئوم", "size": "medium" },
        { "id": "taiga", "name_fa": "جنگل تایگا", "size": "large" },
        { "id": "desert_ruins", "name_fa": "ویرانه‌های صحرا", "size": "large" }
      ],
      "bot": {
        "weights": { "aggro": 0.5, "build": 0.15, "teamwork": 0.1, "defense": 0.55, "economy": 0.7, "utility": 0.8 },
        "roles": ["looter", "hunter", "camper"],
        "decisions": ["loot_chest", "hunt_nearest", "avoid_strong", "eat_food", "retreat_low_hp", "rotate_border", "ambush"],
        "llm_interval_sec": { "T0": 0, "T1": 12, "T2": 8, "T3": 5, "T4": 4 },
        "needs_world_model": true
      },
      "anticheat": { "reach_max_blocks": 3.4, "cps_max": 18, "flag_weight_kill": 3 }
    },
    {
      "id": "tntrun",
      "name_en": "TNT Run",
      "name_fa": "تی‌ان‌تی ران",
      "tagline_fa": "زمین زیر پات منفجر می‌شود — فقط بدو",
      "category": "ffa",
      "art": { "icon": "tntrun-icon", "banner": "tntrun-banner", "lobby": "tntrun-lobby" },
      "teams": { "count": 20, "size": 1, "min_players": 4, "max_players": 20, "min_humans": 1, "bot_fill": true },
      "match": { "duration_sec": 600, "warmup_sec": 10, "grace_sec": 0, "respawn_sec": 0, "sudden_death_sec": 420, "sudden_death": "block_decay", "elo_k": 20 },
      "scoring": { "win": 300, "lose": 20, "survive_min": 40, "player_eliminated": 15, "death": 0, "mvp_bonus": 100 },
      "economy": { "win": 150, "lose": 20, "survive_min": 12, "player_eliminated": 6, "mvp_bonus": 40, "xp_win": 180, "xp_kill": 0 },
      "kits": [{ "id": "default", "price_coins": 0, "items": [] }, { "id": "double_jump", "price_coins": 1500, "items": ["ability_double_jump"] }],
      "maps": [{ "id": "grid", "name_fa": "شبکه", "size": "medium" }, { "id": "spiral", "name_fa": "مارپیچ", "size": "small" }],
      "bot": {
        "weights": { "aggro": 0.05, "build": 0.0, "teamwork": 0.05, "defense": 0.2, "economy": 0.1, "utility": 0.9 },
        "roles": ["runner"],
        "decisions": ["path_to_safe_block", "avoid_falling_block", "keep_moving", "knock_nearest", "center_control"],
        "llm_interval_sec": { "T0": 0, "T1": 0, "T2": 15, "T3": 10, "T4": 8 },
        "needs_world_model": false
      },
      "anticheat": { "reach_max_blocks": 3.0, "cps_max": 16, "flag_weight_kill": 2, "max_speed": 0.62 }
    },
    {
      "id": "murdermystery",
      "name_en": "Murder Mystery",
      "name_fa": "کارآگاه و قاتل",
      "tagline_fa": "یک قاتل، یک کارآگاه، بقیه بی‌گناه",
      "category": "social",
      "art": { "icon": "murdermystery-icon", "banner": "murdermystery-banner", "lobby": "murdermystery-lobby" },
      "teams": { "count": 1, "size": 12, "min_players": 5, "max_players": 12, "min_humans": 2, "bot_fill": true },
      "match": { "duration_sec": 600, "warmup_sec": 10, "grace_sec": 15, "respawn_sec": 0, "sudden_death_sec": 0, "elo_k": 22 },
      "roles_def": { "murderer": 1, "detective": 1, "innocent": 10 },
      "scoring": {
        "win": 300, "lose": 40, "kill": 60, "death": -5, "innocent_survive": 120,
        "murderer_win": 400, "detective_kill_murderer": 200, "gold_collected": 8, "mvp_bonus": 150
      },
      "economy": { "win": 160, "lose": 25, "kill": 30, "gold_collected": 4, "innocent_survive": 40, "mvp_bonus": 60, "xp_win": 200, "xp_kill": 25 },
      "kits": [],
      "maps": [
        { "id": "mansion", "name_fa": "عمت اشرافی", "size": "medium" },
        { "id": "library", "name_fa": "کتابخانه", "size": "small" },
        { "id": "archive", "name_fa": "آرشیو", "size": "medium" }
      ],
      "bot": {
        "weights": { "aggro": 0.4, "build": 0.05, "teamwork": 0.3, "defense": 0.6, "economy": 0.4, "utility": 0.5, "deception": 0.9 },
        "roles": ["murderer", "detective", "innocent"],
        "decisions": ["blend_with_crowd", "isolate_target", "collect_gold", "accuse", "follow_suspect", "escape_chase", "throw_bow", "fake_activity"],
        "llm_interval_sec": { "T0": 0, "T1": 6, "T2": 4, "T3": 3, "T4": 2 },
        "needs_world_model": true,
        "note": "Deception-heavy mode: higher tiers bluff, frame innocents and read crowd behaviour. This is where the LLM actually matters."
      },
      "anticheat": { "reach_max_blocks": 3.6, "cps_max": 16, "flag_weight_kill": 2 }
    },
    {
      "id": "parkour",
      "name_en": "Parkour",
      "name_fa": "پارکور",
      "tagline_fa": "مسیر را بدون سقوط تمام کن",
      "category": "race",
      "art": { "icon": "parkour-icon", "banner": "parkour-banner", "lobby": "parkour-lobby" },
      "teams": { "count": 16, "size": 1, "min_players": 2, "max_players": 16, "min_humans": 1, "bot_fill": true },
      "match": { "duration_sec": 900, "warmup_sec": 10, "grace_sec": 0, "respawn_sec": 0, "sudden_death_sec": 0, "elo_k": 18 },
      "scoring": { "win": 350, "lose": 25, "checkpoint": 12, "fall": -8, "finish": 300, "speed_bonus_max": 200, "mvp_bonus": 100 },
      "economy": { "win": 180, "lose": 15, "checkpoint": 5, "finish": 120, "mvp_bonus": 40, "xp_win": 200, "xp_kill": 0 },
      "kits": [],
      "maps": [
        { "id": "neon_city", "name_fa": "شهر نئونی", "checkpoints": 12, "difficulty": "hard" },
        { "id": "jungle_temple", "name_fa": "معبد جنگلی", "checkpoints": 10, "difficulty": "medium" },
        { "id": "ice_spire", "name_fa": "مناره یخی", "checkpoints": 14, "difficulty": "extreme" },
        { "id": "sky_pillars", "name_fa": "ستون‌های آسمان", "checkpoints": 8, "difficulty": "easy" }
      ],
      "bot": {
        "weights": { "aggro": 0.0, "build": 0.0, "teamwork": 0.0, "defense": 0.0, "economy": 0.0, "utility": 0.95 },
        "roles": ["runner"],
        "decisions": ["path_next_checkpoint", "jump_timing", "sprint_control", "recover_after_fall"],
        "llm_interval_sec": { "T0": 0, "T1": 0, "T2": 20, "T3": 15, "T4": 12 },
        "needs_world_model": false,
        "note": "Deterministic A* pathing is better than an LLM here; the LLM only tunes risk/speed policy."
      },
      "anticheat": { "reach_max_blocks": 3.0, "cps_max": 20, "flag_weight_kill": 1, "max_speed": 0.75, "check_fly": true }
    },
    {
      "id": "buildbattle",
      "name_en": "Build Battle",
      "name_fa": "نبرد ساخت‌وساز",
      "tagline_fa": "در ۵ دقیقه بهترین سازه را بساز، رای بگیر",
      "category": "creative",
      "art": { "icon": "buildbattle-icon", "banner": "buildbattle-banner", "lobby": "buildbattle-lobby" },
      "teams": { "count": 8, "size": 1, "min_players": 3, "max_players": 8, "min_humans": 2, "bot_fill": true },
      "match": { "duration_sec": 300, "warmup_sec": 10, "grace_sec": 0, "respawn_sec": 0, "sudden_death_sec": 0, "elo_k": 16 },
      "phases": { "theme_reveal_sec": 15, "build_sec": 300, "vote_sec_per_build": 20 },
      "scoring": { "win": 320, "lose": 30, "vote_received": 6, "blocks_placed": 1, "theme_match_bonus": 80, "mvp_bonus": 120 },
      "economy": { "win": 170, "lose": 20, "vote_received": 3, "blocks_placed": 1, "mvp_bonus": 50, "xp_win": 190, "xp_kill": 0 },
      "themes": ["قلعه", "فضا", "اقیانوس", "حیوانات", "شهر آینده", "غول", "زمستان", "ربات", "جشن", "آتش‌فشان"],
      "kits": [],
      "maps": [{ "id": "studio_a", "name_fa": "استودیو آ", "plots": 8 }, { "id": "studio_b", "name_fa": "استودیو ب", "plots": 6 }],
      "bot": {
        "weights": { "aggro": 0.0, "build": 1.0, "teamwork": 0.1, "defense": 0.0, "economy": 0.1, "utility": 0.4, "creativity": 0.9 },
        "roles": ["builder"],
        "decisions": ["choose_blueprint", "place_blocks", "decorate", "add_detail", "vote_for_build"],
        "llm_interval_sec": { "T0": 0, "T1": 12, "T2": 8, "T3": 5, "T4": 4 },
        "needs_world_model": false,
        "note": "LLM picks/parameterises a blueprint from the theme and grows it; T0 bots build crude boxes, T4 bots build shaped structures with palettes."
      },
      "anticheat": { "reach_max_blocks": 5.0, "cps_max": 25, "flag_weight_kill": 1, "max_blocks_per_sec": 22 }
    },
    {
      "id": "spleef",
      "name_en": "Spleef",
      "name_fa": "اسپلیف",
      "tagline_fa": "بلوک زیر پاهای حریف را بشکن",
      "category": "ffa",
      "art": { "icon": "spleef-icon", "banner": "spleef-banner", "lobby": "spleef-lobby" },
      "teams": { "count": 12, "size": 1, "min_players": 4, "max_players": 12, "min_humans": 1, "bot_fill": true },
      "match": { "duration_sec": 420, "warmup_sec": 10, "grace_sec": 0, "respawn_sec": 0, "sudden_death_sec": 300, "sudden_death": "lava_rise", "elo_k": 20 },
      "scoring": { "win": 280, "lose": 20, "player_eliminated": 30, "blocks_broken": 2, "death": -5, "mvp_bonus": 100 },
      "economy": { "win": 140, "lose": 15, "player_eliminated": 12, "blocks_broken": 1, "mvp_bonus": 40, "xp_win": 160, "xp_kill": 5 },
      "kits": [{ "id": "shovel", "price_coins": 0, "items": ["diamond_shovel"] }, { "id": "big_snowballs", "price_coins": 1200, "items": ["diamond_shovel", "snowball_16"] }],
      "maps": [{ "id": "snow_ring", "name_fa": "حلقه برفی", "size": "medium" }, { "id": "ice_dome", "name_fa": "گنبد یخی", "size": "small" }],
      "bot": {
        "weights": { "aggro": 0.6, "build": 0.1, "teamwork": 0.05, "defense": 0.4, "economy": 0.1, "utility": 0.7 },
        "roles": ["digger", "chaser"],
        "decisions": ["dig_under_target", "dig_escape_path", "throw_snowball", "avoid_holes", "corner_opponent"],
        "llm_interval_sec": { "T0": 0, "T1": 15, "T2": 10, "T3": 8, "T4": 6 },
        "needs_world_model": true
      },
      "anticheat": { "reach_max_blocks": 4.5, "cps_max": 22, "flag_weight_kill": 2, "max_blocks_per_sec": 20 }
    },
    {
      "id": "thebridge",
      "name_en": "The Bridge",
      "name_fa": "پل",
      "tagline_fa": "از روی پل به دروازه حریف بپر — ۱v۱ تا ۴v۴",
      "category": "team",
      "art": { "icon": "thebridge-icon", "banner": "thebridge-banner", "lobby": "thebridge-lobby" },
      "teams": { "count": 2, "size": 4, "min_players": 2, "max_players": 8, "min_humans": 1, "bot_fill": true },
      "match": { "duration_sec": 600, "warmup_sec": 10, "grace_sec": 3, "respawn_sec": 3, "sudden_death_sec": 0, "elo_k": 30, "score_to_win": 5 },
      "scoring": { "win": 380, "lose": 40, "kill": 25, "death": -8, "goal": 100, "assist": 10, "mvp_bonus": 150 },
      "economy": { "win": 190, "lose": 25, "kill": 12, "goal": 40, "mvp_bonus": 55, "xp_win": 230, "xp_kill": 14 },
      "kits": [
        { "id": "default", "price_coins": 0, "items": ["iron_sword", "leather_armor_dyed"] },
        { "id": "tank", "price_coins": 1400, "items": ["iron_axe", "iron_armor"] },
        { "id": "assassin", "price_coins": 1900, "items": ["diamond_sword", "speed_potion_1"] }
      ],
      "maps": [{ "id": "castle", "name_fa": "قلعه", "size": "medium" }, { "id": "temple", "name_fa": "معبد", "size": "medium" }, { "id": "nexus", "name_fa": "نکسوس", "size": "small" }],
      "bot": {
        "weights": { "aggro": 0.85, "build": 0.6, "teamwork": 0.8, "defense": 0.5, "economy": 0.2, "utility": 0.5 },
        "roles": ["rusher", "defender", "support"],
        "decisions": ["push_bridge", "defend_goal", "build_side_bridge", "combo_attack", "retreat_low_hp", "block_enemy_path"],
        "llm_interval_sec": { "T0": 0, "T1": 8, "T2": 5, "T3": 3, "T4": 2 },
        "needs_world_model": true
      },
      "anticheat": { "reach_max_blocks": 3.4, "cps_max": 18, "flag_weight_kill": 3 }
    },
    {
      "id": "uhc",
      "name_en": "UHC",
      "name_fa": "اولترا هاردکور",
      "tagline_fa": "بدون بازگشت طبیعی جان — بقای واقعی",
      "category": "ffa",
      "art": { "icon": "uhc-icon", "banner": "uhc-banner", "lobby": "uhc-lobby" },
      "teams": { "count": 16, "size": 1, "min_players": 6, "max_players": 16, "min_humans": 1, "bot_fill": true },
      "match": { "duration_sec": 1800, "warmup_sec": 20, "grace_sec": 60, "respawn_sec": 0, "sudden_death_sec": 1400, "sudden_death": "border_shrink", "elo_k": 30 },
      "scoring": { "win": 600, "lose": 40, "kill": 70, "death": -15, "assist": 20, "diamond_mined": 12, "gold_mined": 4, "apple_eaten": 3, "mvp_bonus": 200, "survive_min": 4 },
      "economy": { "win": 300, "lose": 30, "kill": 30, "diamond_mined": 5, "mvp_bonus": 80, "xp_win": 350, "xp_kill": 30 },
      "kits": [],
      "maps": [{ "id": "forest_arena", "name_fa": "جنگل", "size": "large", "radius": 300 }, { "id": "plains_arena", "name_fa": "دشت", "size": "large", "radius": 400 }],
      "bot": {
        "weights": { "aggro": 0.6, "build": 0.55, "teamwork": 0.1, "defense": 0.7, "economy": 0.9, "utility": 0.85 },
        "roles": ["miner", "hunter", "crafter", "camper"],
        "decisions": ["mine_ores", "craft_gear", "smelt_food", "hunt_weak_target", "build_fort", "heal_golden_apple", "avoid_border", "retreat_low_hp"],
        "llm_interval_sec": { "T0": 0, "T1": 10, "T2": 6, "T3": 4, "T4": 3 },
        "needs_world_model": true
      },
      "anticheat": { "reach_max_blocks": 3.4, "cps_max": 18, "flag_weight_kill": 3, "check_xray": true }
    },
    {
      "id": "zombiesurvival",
      "name_en": "Zombie Survival",
      "name_fa": "بقا در برابر زامبی",
      "tagline_fa": "موج‌های زامبی را با هم زنده بمانید",
      "category": "coop",
      "art": { "icon": "zombiesurvival-icon", "banner": "zombiesurvival-banner", "lobby": "zombiesurvival-lobby" },
      "teams": { "count": 1, "size": 8, "min_players": 2, "max_players": 8, "min_humans": 1, "bot_fill": true },
      "match": { "duration_sec": 1800, "warmup_sec": 15, "grace_sec": 10, "respawn_sec": 30, "sudden_death_sec": 0, "elo_k": 18, "waves": 25 },
      "scoring": { "win": 500, "lose": 60, "kill": 8, "wave_cleared": 40, "revive": 60, "death": -20, "door_built": 25, "mvp_bonus": 180 },
      "economy": { "win": 250, "lose": 40, "kill": 4, "wave_cleared": 20, "revive": 25, "mvp_bonus": 70, "xp_win": 300, "xp_kill": 6 },
      "kits": [
        { "id": "default", "price_coins": 0, "items": ["stone_sword", "bread_8"] },
        { "id": "gunner", "price_coins": 2000, "items": ["bow", "arrow_64", "iron_helmet"] },
        { "id": "engineer", "price_coins": 2200, "items": ["iron_axe", "oak_door_4", "iron_boots"] },
        { "id": "medic", "price_coins": 2400, "items": ["splash_potion_healing_4", "golden_apple_2"] }
      ],
      "maps": [{ "id": "prison", "name_fa": "زندان", "size": "medium" }, { "id": "village", "name_fa": "روستای متروک", "size": "large" }, { "id": "lab", "name_fa": "آزمایشگاه", "size": "medium" }],
      "bot": {
        "weights": { "aggro": 0.7, "build": 0.7, "teamwork": 0.95, "defense": 0.8, "economy": 0.5, "utility": 0.7 },
        "roles": ["defender", "barricader", "medic", "kiter"],
        "decisions": ["barricade_door", "hold_chokepoint", "revive_teammate", "kite_zombies", "repair_wall", "focus_fire", "retreat_low_hp"],
        "llm_interval_sec": { "T0": 0, "T1": 8, "T2": 5, "T3": 3, "T4": 2 },
        "needs_world_model": true
      },
      "anticheat": { "reach_max_blocks": 3.4, "cps_max": 18, "flag_weight_kill": 2 }
    },
    {
      "id": "kitpvp",
      "name_en": "KitPvP",
      "name_fa": "کیت‌پی‌وی‌پی",
      "tagline_fa": "کیت بردار، بکش، streak بساز",
      "category": "ffa",
      "art": { "icon": "kitpvp-icon", "banner": "kitpvp-banner", "lobby": "kitpvp-lobby" },
      "teams": { "count": 24, "size": 1, "min_players": 2, "max_players": 40, "min_humans": 1, "bot_fill": true, "persistent_lobby": true },
      "match": { "duration_sec": 0, "warmup_sec": 0, "grace_sec": 0, "respawn_sec": 3, "sudden_death_sec": 0, "elo_k": 24 },
      "scoring": { "kill": 25, "death": -8, "streak_bonus": 5, "killstreak_5": 60, "killstreak_10": 150, "assist": 8, "win": 0, "mvp_bonus": 0 },
      "economy": { "kill": 15, "death": 0, "streak_bonus": 3, "killstreak_5": 40, "killstreak_10": 90, "xp_kill": 20 },
      "kits": [
        { "id": "warrior", "price_coins": 0, "items": ["iron_sword", "iron_armor", "cooked_beef_8"] },
        { "id": "archer", "price_coins": 1000, "items": ["bow", "arrow_32", "leather_armor", "stone_sword"] },
        { "id": "tank", "price_coins": 1800, "items": ["diamond_axe", "diamond_armor", "golden_apple_2"] },
        { "id": "assassin", "price_coins": 2600, "items": ["diamond_sword", "speed_potion_2", "invisibility_potion_1", "leather_armor"] },
        { "id": "pyro", "price_coins": 2400, "items": ["flint_and_steel", "lava_bucket_2", "iron_sword", "fire_resistance_potion_2"] },
        { "id": "necro", "price_coins": 3500, "items": ["wither_skull_3", "diamond_sword", "diamond_boots"] },
        { "id": "frost", "price_coins": 3200, "items": ["ice_wand", "diamond_leggings", "snowball_16"] },
        { "id": "vampire", "price_coins": 4200, "items": ["diamond_sword_sharpness_3", "lifesteal_aura", "bat_form"] }
      ],
      "maps": [{ "id": "arena_classic", "name_fa": "آرنای کلاسیک", "size": "medium" }, { "id": "nether_pit", "name_fa": "گودال ندر", "size": "small" }],
      "bot": {
        "weights": { "aggro": 0.9, "build": 0.1, "teamwork": 0.15, "defense": 0.5, "economy": 0.3, "utility": 0.6 },
        "roles": ["duelist", "chaser", "archer"],
        "decisions": ["pick_kit", "engage_nearest", "strafe_combat", "use_potion", "chase_low_hp_target", "retreat_low_hp", "combo_attack"],
        "llm_interval_sec": { "T0": 0, "T1": 12, "T2": 8, "T3": 5, "T4": 4 },
        "needs_world_model": false
      },
      "anticheat": { "reach_max_blocks": 3.2, "cps_max": 18, "flag_weight_kill": 4 }
    },
    {
      "id": "duels",
      "name_en": "Duels",
      "name_fa": "دوئل",
      "tagline_fa": "۱v۱ خالص — رنک ELO واقعی",
      "category": "duel",
      "art": { "icon": "duels-icon", "banner": "duels-banner", "lobby": "duels-lobby" },
      "teams": { "count": 2, "size": 1, "min_players": 2, "max_players": 2, "min_humans": 1, "bot_fill": true },
      "match": { "duration_sec": 300, "warmup_sec": 5, "grace_sec": 0, "respawn_sec": 0, "sudden_death_sec": 240, "sudden_death": "border_shrink", "elo_k": 36 },
      "scoring": { "win": 300, "lose": 30, "kill": 50, "death": -20, "perfect_win_bonus": 120, "mvp_bonus": 0 },
      "economy": { "win": 150, "lose": 15, "kill": 20, "mvp_bonus": 0, "xp_win": 200, "xp_kill": 25 },
      "kits": [
        { "id": "classic", "price_coins": 0, "items": ["iron_sword", "bow", "arrow_8", "iron_armor", "golden_apple_2"] },
        { "id": "no_debuff", "price_coins": 500, "items": ["diamond_sword", "diamond_armor", "splash_potion_healing_6"] },
        { "id": "sumo", "price_coins": 400, "items": [] },
        { "id": "box", "price_coins": 600, "items": ["stone_sword", "leather_armor"] },
        { "id": "bow_spleef", "price_coins": 700, "items": ["bow", "arrow_32"] }
      ],
      "maps": [{ "id": "colosseum_1v1", "name_fa": "کولوسئوم ۱v۱", "size": "small" }, { "id": "ice_platform", "name_fa": "سکوی یخی", "size": "small" }],
      "bot": {
        "weights": { "aggro": 0.9, "build": 0.4, "teamwork": 0.0, "defense": 0.7, "economy": 0.3, "utility": 0.8 },
        "roles": ["duelist"],
        "decisions": ["engage_opponent", "strafe_combat", "w_combo", "use_potion", "bow_pressure", "block_corner", "retreat_low_hp"],
        "llm_interval_sec": { "T0": 0, "T1": 6, "T2": 4, "T3": 3, "T4": 2 },
        "needs_world_model": true,
        "note": "Highest skill ceiling mode: bot tier is driven by the human's duel ELO with no smoothing, so a Pro+ player meets a T3/T4 bot."
      },
      "anticheat": { "reach_max_blocks": 3.2, "cps_max": 18, "flag_weight_kill": 5 }
    },
    {
      "id": "factions",
      "name_en": "Factions Lite",
      "name_fa": "فکشنز لایت",
      "tagline_fa": "ادعا کن، بساز، غارت کن — نسخه سبک و بدون لاگ",
      "category": "persistent",
      "art": { "icon": "factions-icon", "banner": "factions-banner", "lobby": "factions-lobby" },
      "teams": { "count": 0, "size": 8, "min_players": 1, "max_players": 200, "min_humans": 1, "bot_fill": false },
      "match": { "duration_sec": 0, "warmup_sec": 0, "grace_sec": 0, "respawn_sec": 5, "sudden_death_sec": 0, "elo_k": 10, "persistent": true },
      "claims": { "chunk_radius_max": 24, "power_per_member": 20, "power_max": 200, "raid_grace_hours": 24 },
      "scoring": { "win": 0, "kill": 20, "death": -5, "chunk_claimed": 10, "raid_success": 250, "raid_defend": 180, "power_gained": 1, "mvp_bonus": 0 },
      "economy": { "kill": 10, "chunk_claimed": 5, "raid_success": 120, "raid_defend": 80, "tax_collected": 2, "xp_kill": 15 },
      "kits": [],
      "maps": [{ "id": "world_main", "name_fa": "دنیای اصلی", "size": "world", "border_radius": 5000 }],
      "bot": {
        "weights": { "aggro": 0.4, "build": 0.6, "teamwork": 0.9, "defense": 0.6, "economy": 0.8, "utility": 0.5 },
        "roles": ["settler", "raider", "farmer", "guard"],
        "decisions": ["claim_chunk", "build_base", "farm_resources", "raid_enemy_base", "defend_claim", "recruit"],
        "llm_interval_sec": { "T0": 0, "T1": 20, "T2": 12, "T3": 8, "T4": 6 },
        "needs_world_model": true,
        "note": "Bots here are NPC factions that claim land, farm and raid — they keep the map alive when the server is quiet."
      },
      "anticheat": { "reach_max_blocks": 3.4, "cps_max": 18, "flag_weight_kill": 3, "check_xray": true }
    }
  ]
};

/** ranks.json — sha256:bca4b3d66af4 */
export const Ranks = {
  "version": 3,
  "note": "Rank ladder. Auto-promotion by Rank Points (RP) earned from in-game score; every rank is ALSO purchasable in USD. bot_min_tier forces the adaptive bot brain to at least this tier whenever a holder of the rank is in the match.",
  "currency": { "rp": "rank_points", "prices_in": "USD" },
  "ranks": [
    {
      "id": "free",
      "index": 0,
      "name_fa": "رایگان",
      "name_en": "Free",
      "tag": "",
      "prefix": "",
      "color": "#9AA3AD",
      "rgb": [154, 163, 173],
      "rp_required": 0,
      "price_usd": 0,
      "purchasable": false,
      "bot_min_tier": "T0",
      "bot_skill_bias": 0.0,
      "coin_multiplier": 1.0,
      "xp_multiplier": 1.0,
      "max_gems_held": 500,
      "cosmetic_slots": 1,
      "party_max": 3,
      "permissions": ["lobby.join", "mode.play", "chat.normal", "shop.browse"],
      "perks_fa": ["دسترسی به همهٔ گیم‌مودها", "یک اسلات کازمتیک", "چت معمولی"],
      "art": { "icon": "rank-free" }
    },
    {
      "id": "noob",
      "index": 1,
      "name_fa": "نوب",
      "name_en": "Noob",
      "tag": "[NOOB]",
      "prefix": "نوب",
      "color": "#7ED957",
      "rgb": [126, 217, 87],
      "rp_required": 2500,
      "price_usd": 1.99,
      "purchasable": true,
      "bot_min_tier": "T0",
      "bot_skill_bias": 0.05,
      "coin_multiplier": 1.05,
      "xp_multiplier": 1.05,
      "max_gems_held": 1000,
      "cosmetic_slots": 2,
      "party_max": 4,
      "permissions": ["lobby.join", "mode.play", "chat.normal", "chat.color.basic", "shop.browse", "party.create", "kit.basic"],
      "perks_fa": ["تگ سبز [NOOB] در چت", "+۵٪ سکه و تجربه", "دو اسلات کازمتیک", "رنگ چت پایه", "ساخت پارتی"],
      "art": { "icon": "rank-noob" }
    },
    {
      "id": "normal",
      "index": 2,
      "name_fa": "معمولی",
      "name_en": "Normal",
      "tag": "[PRO-]",
      "prefix": "معمولی",
      "color": "#3FA9F5",
      "rgb": [63, 169, 245],
      "rp_required": 10000,
      "price_usd": 3.99,
      "purchasable": true,
      "bot_min_tier": "T1",
      "bot_skill_bias": 0.1,
      "coin_multiplier": 1.15,
      "xp_multiplier": 1.15,
      "max_gems_held": 2500,
      "cosmetic_slots": 3,
      "party_max": 6,
      "permissions": ["lobby.join", "mode.play", "chat.normal", "chat.color.basic", "chat.color.hex", "shop.browse", "shop.buy", "party.create", "kit.basic", "kit.premium_1", "nick.custom", "queue.priority_1"],
      "perks_fa": ["تگ آبی", "+۱۵٪ سکه و تجربه", "سه اسلات کازمتیک", "رنگ هگز نیک‌نیم", "صف اولویت‌دار", "کیت‌های پریمیوم ۱"],
      "art": { "icon": "rank-normal" }
    },
    {
      "id": "pro",
      "index": 3,
      "name_fa": "پرو",
      "name_en": "Pro",
      "tag": "[PRO]",
      "prefix": "پرو",
      "color": "#A55EEA",
      "rgb": [165, 94, 234],
      "rp_required": 30000,
      "price_usd": 7.99,
      "purchasable": true,
      "bot_min_tier": "T2",
      "bot_skill_bias": 0.2,
      "coin_multiplier": 1.3,
      "xp_multiplier": 1.3,
      "max_gems_held": 6000,
      "cosmetic_slots": 5,
      "party_max": 8,
      "permissions": ["lobby.join", "mode.play", "chat.normal", "chat.color.basic", "chat.color.hex", "chat.bold", "shop.browse", "shop.buy", "party.create", "kit.basic", "kit.premium_1", "kit.premium_2", "nick.custom", "queue.priority_2", "lobby.fly", "cosmetic.wings", "cosmetic.hat", "report.priority"],
      "perks_fa": ["تگ بنفش و بولد چت", "+۳۰٪ سکه و تجربه", "پنج اسلات کازمتیک", "بال و کلاه", "پرواز در لابی", "کیت‌های پریمیوم ۲"],
      "art": { "icon": "rank-pro" }
    },
    {
      "id": "god",
      "index": 4,
      "name_fa": "گاد",
      "name_en": "God",
      "tag": "[GOD]",
      "prefix": "گاد",
      "color": "#FFB020",
      "rgb": [255, 176, 32],
      "rp_required": 75000,
      "price_usd": 14.99,
      "purchasable": true,
      "bot_min_tier": "T3",
      "bot_skill_bias": 0.32,
      "coin_multiplier": 1.5,
      "xp_multiplier": 1.5,
      "max_gems_held": 15000,
      "cosmetic_slots": 8,
      "party_max": 12,
      "permissions": ["lobby.join", "mode.play", "chat.normal", "chat.color.basic", "chat.color.hex", "chat.bold", "chat.rainbow", "shop.browse", "shop.buy", "party.create", "kit.basic", "kit.premium_1", "kit.premium_2", "kit.god", "nick.custom", "nick.animated", "queue.priority_3", "lobby.fly", "cosmetic.wings", "cosmetic.hat", "cosmetic.cape", "cosmetic.killeffect", "report.priority", "arena.private"],
      "perks_fa": ["تگ طلایی و چت رنگین‌کمانی", "+۵۰٪ سکه و تجربه", "هشت اسلات کازمتیک", "کیپ و افکت کشتن", "آرنای خصوصی", "نیک‌نیم متحرک"],
      "art": { "icon": "rank-god" }
    },
    {
      "id": "ultragod",
      "index": 5,
      "name_fa": "الترا گاد",
      "name_en": "Ultra God",
      "tag": "[ULTRA]",
      "prefix": "الترا گاد",
      "color": "#FF3B6B",
      "rgb": [255, 59, 107],
      "rp_required": 160000,
      "price_usd": 24.99,
      "purchasable": true,
      "bot_min_tier": "T4",
      "bot_skill_bias": 0.45,
      "coin_multiplier": 1.8,
      "xp_multiplier": 1.8,
      "max_gems_held": 50000,
      "cosmetic_slots": 12,
      "party_max": 16,
      "permissions": ["lobby.join", "mode.play", "chat.normal", "chat.color.basic", "chat.color.hex", "chat.bold", "chat.rainbow", "chat.gradient", "shop.browse", "shop.buy", "party.create", "kit.basic", "kit.premium_1", "kit.premium_2", "kit.god", "kit.ultra", "nick.custom", "nick.animated", "queue.priority_4", "lobby.fly", "cosmetic.wings", "cosmetic.hat", "cosmetic.cape", "cosmetic.killeffect", "cosmetic.portal", "cosmetic.pet", "cosmetic.trail", "report.priority", "arena.private", "beta.features", "season.skin"],
      "perks_fa": ["تگ قرمز الترا با گرادیانت چت", "+۸۰٪ سکه و تجربه", "دوازده اسلات کازمتیک", "افکت پرتال، پت و دنباله", "دسترسی به امکانات بتا", "پوستهٔ فصلی اختصاصی"],
      "art": { "icon": "rank-ultragod" }
    }
  ],
  "promotion": {
    "rp_formula": "floor(score / 10) + elo_delta_bonus",
    "elo_delta_bonus_divisor": 4,
    "demotion": false,
    "note": "RP never decays: a rank earned by playing is kept even if ELO drops. Purchased ranks set rank_index = max(earned, purchased)."
  }
};

/** bot-tiers.json — sha256:c5e423ccf929 */
export const BotTiers = {
  "version": 3,
  "note": "Adaptive bot brain tiers. T0/T1 = deterministic behaviour tree only (cheap, offline-safe). From T1 upward the match also consults a Workers AI model at low frequency for STRATEGIC decisions. Model ids are Cloudflare Workers AI models that are NOT deprecated as of 2026-09 (see src/ai.js DEPRECATED_MODELS).",
  "models": {
    "none": null,
    "small": "@cf/meta/llama-3.2-3b-instruct",
    "medium": "@cf/meta/llama-3.1-8b-instruct-fp8",
    "large": "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    "vision": "@cf/meta/llama-3.2-11b-vision-instruct",
    "image": "@cf/black-forest-labs/flux-1-schnell"
  },
  "tiers": [
    {
      "id": "T0",
      "name_fa": "تازه‌کار",
      "name_en": "Rookie",
      "skill": 0.15,
      "model": "none",
      "llm_enabled": false,
      "prompt_tokens": 0,
      "max_tokens": 0,
      "temperature": 0.9,
      "reaction_ms": { "min": 520, "max": 900 },
      "aim_error_deg": { "min": 9, "max": 22 },
      "mistake_rate": 0.22,
      "decision_hz": 3,
      "bridge_quality": 0.35,
      "combo_chance": 0.05,
      "strafe_quality": 0.25,
      "teamwork": 0.15,
      "retreat_hp": 0.15,
      "resource_efficiency": 0.4,
      "build_skill": 0.2,
      "deception": 0.0,
      "notes_fa": "بات‌های ساده: مسیر مستقیم، حملهٔ دیرهنگام، اشتباه زیاد. هیچ هزینهٔ AI ندارد."
    },
    {
      "id": "T1",
      "name_fa": "معمولی",
      "name_en": "Casual",
      "skill": 0.38,
      "model": "small",
      "llm_enabled": true,
      "prompt_tokens": 900,
      "max_tokens": 160,
      "temperature": 0.8,
      "reaction_ms": { "min": 380, "max": 700 },
      "aim_error_deg": { "min": 5, "max": 14 },
      "mistake_rate": 0.15,
      "decision_hz": 5,
      "bridge_quality": 0.55,
      "combo_chance": 0.15,
      "strafe_quality": 0.4,
      "teamwork": 0.35,
      "retreat_hp": 0.22,
      "resource_efficiency": 0.55,
      "build_skill": 0.4,
      "deception": 0.15,
      "notes_fa": "مدل سبک و ارزان (llama-3.2-3b) فقط هر چند ثانیه یک‌بار برای تصمیم سطح بالا؛ حرکت و جنگ درجا روی سرور محاسبه می‌شود."
    },
    {
      "id": "T2",
      "name_fa": "ماهر",
      "name_en": "Skilled",
      "skill": 0.6,
      "model": "medium",
      "llm_enabled": true,
      "prompt_tokens": 1400,
      "max_tokens": 240,
      "temperature": 0.7,
      "reaction_ms": { "min": 260, "max": 520 },
      "aim_error_deg": { "min": 3, "max": 9 },
      "mistake_rate": 0.09,
      "decision_hz": 8,
      "bridge_quality": 0.72,
      "combo_chance": 0.3,
      "strafe_quality": 0.6,
      "teamwork": 0.55,
      "retreat_hp": 0.28,
      "resource_efficiency": 0.7,
      "build_skill": 0.62,
      "deception": 0.35,
      "notes_fa": "مدل ۸B: خرید بهینه در بدوارز، چرخش منابع، حمایت تیمی."
    },
    {
      "id": "T3",
      "name_fa": "تاکتیسین",
      "name_en": "Tactician",
      "skill": 0.8,
      "model": "large",
      "llm_enabled": true,
      "prompt_tokens": 2200,
      "max_tokens": 320,
      "temperature": 0.55,
      "reaction_ms": { "min": 180, "max": 380 },
      "aim_error_deg": { "min": 1.5, "max": 6 },
      "mistake_rate": 0.05,
      "decision_hz": 12,
      "bridge_quality": 0.86,
      "combo_chance": 0.5,
      "strafe_quality": 0.78,
      "teamwork": 0.78,
      "retreat_hp": 0.33,
      "resource_efficiency": 0.85,
      "build_skill": 0.8,
      "deception": 0.6,
      "notes_fa": "مدل ۷۰B: نقشه‌خوانی، هماهنگی حملهٔ هم‌زمان دو تیم، بلوف در ماردِر میستری."
    },
    {
      "id": "T4",
      "name_fa": "خدایی",
      "name_en": "Godlike",
      "skill": 0.95,
      "model": "large",
      "llm_enabled": true,
      "prompt_tokens": 2600,
      "max_tokens": 420,
      "temperature": 0.4,
      "reaction_ms": { "min": 130, "max": 280 },
      "aim_error_deg": { "min": 0.8, "max": 3.5 },
      "mistake_rate": 0.03,
      "decision_hz": 16,
      "bridge_quality": 0.95,
      "combo_chance": 0.68,
      "strafe_quality": 0.9,
      "teamwork": 0.92,
      "retreat_hp": 0.38,
      "resource_efficiency": 0.95,
      "build_skill": 0.95,
      "deception": 0.85,
      "notes_fa": "بالاترین سطح: نگاه به جلو (lookahead)، استراتژی تیمی کامل، ساخت‌وساز دقیق. عمداً خطای انسانی دارد تا غیرقابل‌تشخیص نباشد اما غیرعادلانه هم نشود."
    }
  ],
  "escalation": {
    "note": "A match does not start at the final tier. It ramps so a lobby of high-ranked players feels pressure grow over time.",
    "start_offset": -1,
    "ramp_steps": [
      { "at_pct_of_duration": 0, "delta": 0 },
      { "at_pct_of_duration": 25, "delta": 0 },
      { "at_pct_of_duration": 45, "delta": 1 },
      { "at_pct_of_duration": 70, "delta": 1 },
      { "at_pct_of_duration": 88, "delta": 1 }
    ],
    "max_tier": "T4",
    "comeback_rubbery": {
      "enabled": true,
      "note": "Rubber-banding: if the human team/player is being crushed, bots do NOT escalate; if they are dominating, bots escalate one step earlier.",
      "dominating_threshold": 0.65,
      "crushed_threshold": 0.25
    }
  },
  "humanization": {
    "note": "Every tier is jittered per-bot so 4 bots of the same tier do not move identically.",
    "per_bot_jitter": 0.18,
    "fatigue": { "enabled": true, "skill_decay_after_sec": 420, "decay": 0.06 },
    "chat": { "enabled_from_tier": "T2", "messages_per_min_max": 2, "safe": true },
    "never": ["perfect_aim_lock", "through_wall_hits", "instant_bridge", "zero_reaction_time"]
  },
  "cost_guard": {
    "max_llm_calls_per_bot_per_match": 90,
    "max_llm_calls_per_match": 400,
    "cache_identical_states": true,
    "fallback": "heuristic_tree",
    "fallback_reason_fa": "اگر Workers AI در دسترس نبود یا سهمیه تمام شد، بات به درخت رفتار محلی برمی‌گردد و بازی هرگز نمی‌خوابد."
  }
};

/** cosmetics.json — sha256:8aad5a00eed5 */
export const Cosmetics = {
  "version": 2,
  "note": "Cosmetic catalogue sold in the web shop (USD) and in the in-game coin shop. slot = which cosmetic slot it occupies; rank_min = lowest rank allowed to equip it.",
  "slots": ["cape", "hat", "wings", "killeffect", "portaleffect", "nickcolor", "chattag", "trail", "pet", "victorydance", "projectile"],
  "items": [
    { "id": "cape_nova", "slot": "cape", "name_fa": "کیپ نوا", "name_en": "Nova Cape", "price_usd": 1.49, "price_coins": 2500, "rank_min": "free", "art": "cosmetic-cape", "tags": ["cape", "animated"] },
    { "id": "cape_godflame", "slot": "cape", "name_fa": "کیپ شعلهٔ ایزدی", "name_en": "Godflame Cape", "price_usd": 2.99, "price_coins": 6000, "rank_min": "pro", "art": "cosmetic-cape", "tags": ["cape", "particle"] },
    { "id": "cape_void", "slot": "cape", "name_fa": "کیپ پوچی", "name_en": "Void Cape", "price_usd": 3.49, "price_coins": 7000, "rank_min": "god", "art": "cosmetic-cape", "tags": ["cape", "rare"] },
    { "id": "hat_crown", "slot": "hat", "name_fa": "تاج پادشاهی", "name_en": "Royal Crown", "price_usd": 1.99, "price_coins": 3500, "rank_min": "noob", "art": "cosmetic-hat" },
    { "id": "hat_halo", "slot": "hat", "name_fa": "هالهٔ فرشته", "name_en": "Angel Halo", "price_usd": 2.49, "price_coins": 4500, "rank_min": "pro", "art": "cosmetic-hat" },
    { "id": "hat_horns", "slot": "hat", "name_fa": "شاخ‌های شیطانی", "name_en": "Demon Horns", "price_usd": 2.49, "price_coins": 4500, "rank_min": "pro", "art": "cosmetic-hat" },
    { "id": "hat_top", "slot": "hat", "name_fa": "کلاه سیلندر", "name_en": "Top Hat", "price_usd": 0.99, "price_coins": 1500, "rank_min": "free", "art": "cosmetic-hat" },
    { "id": "wings_dragon", "slot": "wings", "name_fa": "بال اژدها", "name_en": "Dragon Wings", "price_usd": 3.99, "price_coins": 8000, "rank_min": "pro", "art": "cosmetic-wings" },
    { "id": "wings_angel", "slot": "wings", "name_fa": "بال فرشته", "name_en": "Angel Wings", "price_usd": 3.99, "price_coins": 8000, "rank_min": "pro", "art": "cosmetic-wings" },
    { "id": "wings_mecha", "slot": "wings", "name_fa": "بال مکانیکی", "name_en": "Mecha Wings", "price_usd": 4.99, "price_coins": 10000, "rank_min": "god", "art": "cosmetic-wings" },
    { "id": "kill_lightning", "slot": "killeffect", "name_fa": "افکت صاعقه", "name_en": "Lightning Strike", "price_usd": 1.99, "price_coins": 3000, "rank_min": "noob", "art": "cosmetic-kill" },
    { "id": "kill_heart", "slot": "killeffect", "name_fa": "افکت قلب", "name_en": "Heart Burst", "price_usd": 1.49, "price_coins": 2500, "rank_min": "noob", "art": "cosmetic-kill" },
    { "id": "kill_explosion", "slot": "killeffect", "name_fa": "انفجار طلایی", "name_en": "Golden Boom", "price_usd": 2.99, "price_coins": 5500, "rank_min": "pro", "art": "cosmetic-kill" },
    { "id": "kill_blackhole", "slot": "killeffect", "name_fa": "سیاه‌چاله", "name_en": "Black Hole", "price_usd": 4.49, "price_coins": 9000, "rank_min": "god", "art": "cosmetic-kill" },
    { "id": "portal_nether", "slot": "portaleffect", "name_fa": "افکت پرتال ندر", "name_en": "Nether Portal FX", "price_usd": 2.49, "price_coins": 4800, "rank_min": "normal", "art": "cosmetic-portal" },
    { "id": "portal_galaxy", "slot": "portaleffect", "name_fa": "افکت پرتال کهکشانی", "name_en": "Galaxy Portal FX", "price_usd": 3.49, "price_coins": 6800, "rank_min": "pro", "art": "cosmetic-portal" },
    { "id": "portal_emerald", "slot": "portaleffect", "name_fa": "افکت پرتال زمردی", "name_en": "Emerald Portal FX", "price_usd": 1.99, "price_coins": 3600, "rank_min": "normal", "art": "cosmetic-portal" },
    { "id": "nick_rainbow", "slot": "nickcolor", "name_fa": "رنگ نیک‌نیم رنگین‌کمانی", "name_en": "Rainbow Nickname", "price_usd": 1.99, "price_coins": 3200, "rank_min": "pro", "art": "cosmetic-nick" },
    { "id": "nick_gold", "slot": "nickcolor", "name_fa": "رنگ نیک‌نیم طلایی", "name_en": "Gold Nickname", "price_usd": 0.99, "price_coins": 1600, "rank_min": "noob", "art": "cosmetic-nick" },
    { "id": "nick_aqua", "slot": "nickcolor", "name_fa": "رنگ نیک‌نیم فیروزه‌ای", "name_en": "Aqua Nickname", "price_usd": 0.79, "price_coins": 1200, "rank_min": "free", "art": "cosmetic-nick" },
    { "id": "nick_gradient_sunset", "slot": "nickcolor", "name_fa": "گرادیانت غروب", "name_en": "Sunset Gradient", "price_usd": 2.99, "price_coins": 5800, "rank_min": "god", "art": "cosmetic-nick" },
    { "id": "tag_mvp", "slot": "chattag", "name_fa": "تگ چت MVP", "name_en": "MVP Chat Tag", "price_usd": 1.49, "price_coins": 2400, "rank_min": "noob", "art": "cosmetic-tag" },
    { "id": "tag_veteran", "slot": "chattag", "name_fa": "تگ چت کهنه‌سرباز", "name_en": "Veteran Tag", "price_usd": 1.99, "price_coins": 3400, "rank_min": "normal", "art": "cosmetic-tag" },
    { "id": "tag_streamer", "slot": "chattag", "name_fa": "تگ چت استریمر", "name_en": "Streamer Tag", "price_usd": 2.49, "price_coins": 4400, "rank_min": "pro", "art": "cosmetic-tag" },
    { "id": "trail_fire", "slot": "trail", "name_fa": "دنبالهٔ آتش", "name_en": "Fire Trail", "price_usd": 1.29, "price_coins": 2100, "rank_min": "noob", "art": "cosmetic-trail" },
    { "id": "trail_star", "slot": "trail", "name_fa": "دنبالهٔ ستاره", "name_en": "Star Trail", "price_usd": 1.79, "price_coins": 2900, "rank_min": "normal", "art": "cosmetic-trail" },
    { "id": "pet_wolf", "slot": "pet", "name_fa": "پت گرگ", "name_en": "Wolf Pet", "price_usd": 2.99, "price_coins": 5200, "rank_min": "pro", "art": "cosmetic-pet" },
    { "id": "pet_dragon", "slot": "pet", "name_fa": "پت بچه‌اژدها", "name_en": "Baby Dragon Pet", "price_usd": 4.99, "price_coins": 9800, "rank_min": "ultragod", "art": "cosmetic-pet" },
    { "id": "dance_floss", "slot": "victorydance", "name_fa": "رقص پیروزی", "name_en": "Victory Dance", "price_usd": 1.49, "price_coins": 2300, "rank_min": "noob", "art": "cosmetic-dance" },
    { "id": "proj_flame", "slot": "projectile", "name_fa": "تیر آتشین", "name_en": "Flaming Arrow", "price_usd": 1.29, "price_coins": 2000, "rank_min": "normal", "art": "cosmetic-proj" }
  ],
  "bundles": [
    { "id": "starter_pack", "name_fa": "باندل شروع", "name_en": "Starter Pack", "items": ["hat_top", "nick_aqua", "cape_nova"], "price_usd": 2.49, "compare_at_usd": 3.27, "art": "bundle-starter" },
    { "id": "god_pack", "name_fa": "باندل خدایی", "name_en": "God Pack", "items": ["wings_dragon", "kill_blackhole", "cape_void", "nick_gradient_sunset"], "price_usd": 12.99, "compare_at_usd": 14.96, "art": "bundle-god" },
    { "id": "pvp_pack", "name_fa": "باندل پی‌وی‌پی", "name_en": "PvP Pack", "items": ["kill_lightning", "trail_fire", "proj_flame", "tag_mvp"], "price_usd": 4.99, "compare_at_usd": 6.26, "art": "bundle-pvp" },
    { "id": "season_pack", "name_fa": "باندل فصلی", "name_en": "Season Pack", "items": ["portal_galaxy", "hat_halo", "dance_floss", "pet_wolf"], "price_usd": 8.49, "compare_at_usd": 9.96, "art": "bundle-season" }
  ],
  "gem_packs": [
    { "id": "gems_500", "gems": 500, "price_usd": 0.99 },
    { "id": "gems_1500", "gems": 1500, "price_usd": 2.49, "bonus_pct": 5 },
    { "id": "gems_4000", "gems": 4000, "price_usd": 5.99, "bonus_pct": 12 },
    { "id": "gems_10000", "gems": 10000, "price_usd": 12.99, "bonus_pct": 20 }
  ]
};

/** economy.json — sha256:1d1bca6c0955 */
export const Economy = {
  "version": 2,
  "note": "Server economy. Two currencies: coins (earned by playing, spent in-game and on coin-shop cosmetics) and gems (premium, bought with USD or earned rarely). All USD prices live in cosmetics.json / ranks.json and are shown in the web shop only after OTP verification.",
  "coins": {
    "starting_balance": 500,
    "daily_login_bonus": [50, 75, 100, 125, 150, 200, 300],
    "win_streak_bonus_pct": 10,
    "max_win_streak_bonus_pct": 50,
    "weekly_cap": 60000,
    "referral_reward": 250,
    "report_valid_reward": 100
  },
  "gems": {
    "starting_balance": 0,
    "free_per_season": 100,
    "earned_per_level_up": 25,
    "battlepass_reward_total": 900
  },
  "xp": {
    "level_formula": "level = floor(sqrt(total_xp / 100))",
    "xp_per_level_base": 100,
    "max_level": 200,
    "prestige_at": [50, 100, 150, 200],
    "prestige_reward_gems": [100, 250, 500, 1000]
  },
  "in_game_shops": [
    { "mode": "bedwars", "currency": "resources" },
    { "mode": "kitpvp", "currency": "coins", "items": ["kit_archer", "kit_tank", "kit_assassin", "kit_pyro", "kit_necro", "kit_frost", "kit_vampire"] },
    { "mode": "skywars", "currency": "coins", "items": ["kit_knight", "kit_archer", "kit_engineer", "kit_enderman", "kit_slime"] },
    { "mode": "zombiesurvival", "currency": "coins", "items": ["kit_gunner", "kit_engineer", "kit_medic"] }
  ],
  "coin_sinks": ["kits", "cosmetics", "luck_chests", "boosters", "rename", "party_privates"],
  "luck_chest": { "price_coins": 800, "pool": ["coins", "xp", "gems_small", "cosmetic_common", "cosmetic_rare", "dust"], "weights": [40, 25, 10, 15, 8, 2], "dust_to_cosmetic": 40 },
  "boosters": [
    { "id": "coin_x2", "price_gems": 150, "duration_min": 60, "scope": "network" },
    { "id": "xp_x2", "price_gems": 150, "duration_min": 60, "scope": "network" },
    { "id": "coin_x3_self", "price_gems": 90, "duration_min": 30, "scope": "self" }
  ],
  "anti_abuse": {
    "min_match_minutes_for_reward": 2,
    "no_reward_if_afk_pct": 60,
    "max_coin_transfers_per_day": 10,
    "transfer_tax_pct": 5,
    "self_kill_farming_penalty": true
  }
};

export const SPEC_HASHES = {"gamemodes":"bf5ee9543918","ranks":"bca4b3d66af4","bot-tiers":"c5e423ccf929","cosmetics":"8aad5a00eed5","economy":"1d1bca6c0955"};
