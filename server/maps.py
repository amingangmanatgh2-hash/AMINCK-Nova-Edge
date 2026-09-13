"""Procedural map builders for all gamemodes."""
import math, random
from .world import World

GROUND = 64


def _flat_island(w, cx, cz, r, top, under, bottom, edge_r=None):
    edge_r = edge_r or r
    for x in range(cx - edge_r, cx + edge_r + 1):
        for z in range(cz - edge_r, cz + edge_r + 1):
            if (x - cx) ** 2 + (z - cz) ** 2 > edge_r * edge_r:
                continue
            for y in range(bottom, top):
                w.set_block(x, y, z, under)
            w.set_block(x, y if False else top, z, top)


def _disc(w, cx, cz, y, r, name):
    for x in range(cx - r, cx + r + 1):
        for z in range(cz - r, cz + r + 1):
            if (x - cx) ** 2 + (z - cz) ** 2 <= r * r:
                w.set_block(x, y, z, name)


def _pyramid(w, cx, y, cz, size, block):
    for i in range(size):
        _disc(w, cx, y + i, cz, size - i, block)


def _tree(w, x, y, z, log="oak_log", leaf="oak_leaves"):
    for i in range(4):
        w.set_block(x, y + i, z, log)
    top = y + 4
    for dx in range(-2, 3):
        for dz in range(-2, 3):
            for dy in range(-1, 3):
                if abs(dx) == 2 and abs(dz) == 2 and dy != 0:
                    continue
                if w.get_state(x + dx, top + dy, z + dz) == 0:
                    w.set_block(x + dx, top + dy, z + dz, leaf)


# ────────────────────────────────────────────────────────────────────────────
def build_lobby(reg):
    w = World(reg, "lobby")
    r = 26
    for x in range(-r, r + 1):
        for z in range(-r, r + 1):
            if x * x + z * z <= r * r:
                for y in range(GROUND - 3, GROUND):
                    w.set_block(x, y, z, "stone")
                w.set_block(x, GROUND, z, "grass_block")
    # central fountain
    _disc(w, 0, GROUND, 0, 5, "stone_bricks")
    _disc(w, 0, GROUND + 1, 0, 4, "stone_bricks")
    w.set_block(0, GROUND + 1, 0, "glowstone")
    w.set_block(0, GROUND + 2, 0, "glowstone")
    for dx, dz in ((3, 0), (-3, 0), (0, 3), (0, -3)):
        w.set_block(dx, GROUND + 1, dz, "sea_lantern")
    # warp pads (colored)
    pads = {
        "skywars": ("skywars", 12, 0, "blue_wool"),
        "bedwars": ("bedwars", -12, 0, "red_wool"),
        "survival": ("survival", 0, 12, "green_wool"),
        "practice": ("practice", 0, -12, "cyan_wool"),
        "kitpvp": ("kitpvp", 10, 10, "orange_wool"),
        "sumo": ("sumo", -10, 10, "yellow_wool"),
        "parkour": ("parkour", 10, -10, "purple_wool"),
        "tntrun": ("tntrun", -10, -10, "lime_wool"),
        "spleef": ("spleef", 16, -16, "white_wool"),
        "duels": ("duels", -16, 16, "magenta_wool"),
        "mlg": ("mlg", 16, 16, "light_blue_wool"),
        "zombies": ("zombies", 20, 0, "black_wool"),
        "bridge": ("bridge", -20, 0, "brown_wool"),
        "hungergames": ("hungergames", 0, 20, "pink_wool"),
        "hideseek": ("hideseek", 0, -20, "gray_wool"),
        "buildbattle": ("buildbattle", 20, 20, "yellow_wool"),
    }
    spawns = [(0.5, GROUND + 1, 0.5)]
    for _, px, pz, wool in pads.values():
        _disc(w, px, GROUND + 1, pz, 2, wool)
        _disc(w, px, GROUND + 2, pz, 2, "air") if False else None
    # decorative trees around
    for ang in range(0, 360, 60):
        tx = int(math.cos(math.radians(ang)) * 20)
        tz = int(math.sin(math.radians(ang)) * 20)
        _tree(w, tx, GROUND + 1, tz)
    return w, spawns, {"pads": pads}


def build_survival(reg):
    w = World(reg, "survival", seed=1234)
    rng = random.Random(7)
    for cx in range(-6, 7):
        for cz in range(-6, 7):
            h = GROUND + int(3 * math.sin(cx * 0.7) * math.cos(cz * 0.6)) + rng.randint(-1, 1)
            for x in range(cx * 16, cx * 16 + 16):
                for z in range(cz * 16, cz * 16 + 16):
                    for y in range(GROUND - 4, h):
                        w.set_block(x, y, z, "stone")
                    for y in range(h, h + 2):
                        w.set_block(x, y, z, "dirt")
                    w.set_block(x, h + 2, z, "grass_block")
    # trees + a cabin
    for (tx, tz) in [(8, 10), (-14, 6), (20, -12), (-20, 18), (5, -20)]:
        top = w.top_y(tx, tz)
        _tree(w, tx, top, tz)
    # cabin
    for x in range(-4, 5):
        for z in range(-4, 5):
            for y in range(GROUND + 1, GROUND + 4):
                w.set_block(x, y, z, "oak_planks")
    for x in range(-4, 5):
        for z in range(-4, 5):
            w.set_block(x, GROUND + 4, z, "oak_planks")
    # door
    w.set_block(0, GROUND + 1, 4, "air")
    w.set_block(0, GROUND + 2, 4, "air")
    spawns = [(0.5, GROUND + 4, 0.5)]
    return w, spawns, {}


def build_skywars(reg):
    w = World(reg, "skywars")
    islands = []
    mid = (0, GROUND, 0)
    _disc(w, 0, GROUND, 0, 7, "grass_block")
    for y in range(GROUND - 6, GROUND):
        _disc(w, 0, y, 0, 6, "stone")
    for ang in range(0, 360, 90):
        ix = int(math.cos(math.radians(ang)) * 26)
        iz = int(math.sin(math.radians(ang)) * 26)
        _disc(w, ix, GROUND, iz, 5, "grass_block")
        for y in range(GROUND - 5, GROUND):
            _disc(w, ix, y, iz, 4, "stone")
        # chest-ish decoration
        w.set_block(ix, GROUND + 1, iz, "chest")
        islands.append((ix + 0.5, GROUND + 1, iz + 0.5))
    # mid loot + bridge hint
    w.set_block(0, GROUND + 1, 0, "ender_chest")
    spawns = islands
    return w, spawns, {"mid": mid}


def build_bedwars(reg):
    w = World(reg, "bedwars")
    teams = {
        "red": (30, 0, "red_wool"),
        "blue": (-30, 0, "blue_wool"),
        "green": (0, 30, "green_wool"),
        "yellow": (0, -30, "yellow_wool"),
    }
    spawns = {}
    for tname, (tx, tz, wool) in teams.items():
        _disc(w, tx, GROUND, tz, 6, "stone")
        for y in range(GROUND - 4, GROUND):
            _disc(w, tx, y, tz, 5, "stone")
        _disc(w, tx, GROUND, tz, 5, wool)
        # bed (two wool blocks + bed marker)
        w.set_block(tx, GROUND + 1, tz, "white_wool")
        w.set_block(tx + 1, GROUND + 1, tz, "white_wool")
        # spawn
        spawns[tname] = (tx + 0.5, GROUND + 2, tz + 0.5)
        # bridge to mid
        sx, sz = _sign(-tx), _sign(-tz)
        x, z = tx, tz
        for i in range(28):
            x += sx
            z += sz
            w.set_block(x, GROUND - 1, z, "stone")
    _disc(w, 0, GROUND, 0, 5, "stone")
    for y in range(GROUND - 4, GROUND):
        _disc(w, 0, y, 0, 4, "stone")
    _disc(w, 0, GROUND, 0, 4, "gold_block")
    return w, spawns, {"teams": list(teams.keys())}


def _sign(v):
    return 1 if v >= 0 else -1


def build_sumo(reg):
    w = World(reg, "sumo")
    _disc(w, 0, GROUND, 0, 8, "stone")
    for y in range(GROUND - 2, GROUND):
        _disc(w, 0, y, 0, 8, "stone")
    _disc(w, 0, GROUND, 0, 7, "oak_planks")
    spawns = [(3.5, GROUND + 1, 0.5), (-3.5, GROUND + 1, 0.5)]
    return w, spawns, {}


def build_parkour(reg):
    w = World(reg, "parkour")
    _flat_island(w, 0, 30, 3, "grass_block", "stone", GROUND - 1, edge_r=40)
    course = []
    x, z = 0, 20
    rng = random.Random(3)
    for i in range(40):
        block = "stone" if i % 5 else "stone_bricks"
        w.set_block(x, GROUND + 1, z, block)
        course.append((x, GROUND + 1, z))
        x += rng.randint(2, 4)
        if i % 7 == 6:
            z += rng.randint(2, 4)
    spawns = [(0.5, GROUND + 2, 20.5)]
    return w, spawns, {"course": course}


def build_practice(reg):
    w = World(reg, "practice")
    _flat_island(w, 0, 0, 30, "stone_bricks", "stone", GROUND - 1, edge_r=30)
    for dx in range(-30, 31, 4):
        for dz in range(-30, 31, 4):
            if (dx + dz) % 8 == 0:
                w.set_block(dx, GROUND + 1, dz, "iron_block")
    spawns = [(0.5, GROUND + 1, 0.5)]
    return w, spawns, {}


def build_kitpvp(reg):
    w = World(reg, "kitpvp")
    _flat_island(w, 0, 0, 26, "grass_block", "stone", GROUND - 1, edge_r=26)
    rng = random.Random(5)
    for i in range(12):
        bx, bz = rng.randint(-22, 22), rng.randint(-22, 22)
        w.set_block(bx, GROUND + 1, bz, "cobblestone")
        w.set_block(bx, GROUND + 2, bz, "cobblestone")
    for dx, dz in ((8, 8), (-8, 8), (8, -8), (-8, -8)):
        w.set_block(dx, GROUND + 1, dz, "obsidian")
    spawns = [(0.5, GROUND + 1, 0.5)]
    return w, spawns, {}


def build_spleef(reg):
    w = World(reg, "spleef")
    _flat_island(w, 0, 0, 14, "snow_block", "stone", GROUND - 1, edge_r=14)
    spawns = [(3.5, GROUND + 1, 0.5), (-3.5, GROUND + 1, 0.5)]
    return w, spawns, {}


def build_tntrun(reg):
    w = World(reg, "tntrun")
    _flat_island(w, 0, 0, 16, "sand", "sand", GROUND - 1, edge_r=16)
    spawns = [(3.5, GROUND + 1, 0.5), (-3.5, GROUND + 1, 0.5)]
    return w, spawns, {}


def build_mlg(reg):
    w = World(reg, "mlg")
    _flat_island(w, 0, 0, 10, "stone", "stone", GROUND - 1, edge_r=10)
    h = GROUND + 48
    for i in range(6):
        _disc(w, 0, h + i, 0, 6 - i, "stone")
    # water pool at bottom
    for x in range(-4, 5):
        for z in range(-4, 5):
            w.set_block(x, GROUND, z, "water")
    spawns = [(0.5, h + 7, 0.5)]
    return w, spawns, {"top": h + 6}


def build_zombies(reg):
    w = World(reg, "zombies")
    _flat_island(w, 0, 0, 22, "stone", "stone", GROUND - 1, edge_r=22)
    for dx, dz in ((10, 0), (-10, 0), (0, 10), (0, -10)):
        _pyramid(w, dx, GROUND + 1, dz, 3, "obsidian")
    spawns = [(0.5, GROUND + 1, 0.5)]
    return w, spawns, {}


def build_duels(reg):
    w = World(reg, "duels")
    _flat_island(w, 0, 0, 12, "stone_bricks", "stone", GROUND - 1, edge_r=12)
    spawns = [(4.5, GROUND + 1, 0.5), (-4.5, GROUND + 1, 0.5)]
    return w, spawns, {}


def build_bridge(reg):
    w = World(reg, "bridge")
    for tx, tz in ((-24, 0), (24, 0)):
        _disc(w, tx, GROUND, tz, 6, "stone")
        for y in range(GROUND - 4, GROUND):
            _disc(w, tx, y, tz, 5, "stone")
        _disc(w, tx, GROUND, tz, 5, "red_wool" if tx < 0 else "blue_wool")
    for x in range(-23, 24):
        w.set_block(x, GROUND - 1, 0, "oak_planks")
    spawns = [(-24.5, GROUND + 1, 0.5), (24.5, GROUND + 1, 0.5)]
    return w, spawns, {}


def build_hungergames(reg):
    w = World(reg, "hungergames", seed=99)
    rng = random.Random(11)
    for cx in range(-4, 5):
        for cz in range(-4, 5):
            for x in range(cx * 16, cx * 16 + 16):
                for z in range(cz * 16, cz * 16 + 16):
                    h = GROUND + int(2 * math.sin(x * 0.4)) + rng.randint(-1, 2)
                    for y in range(GROUND - 3, h):
                        w.set_block(x, y, z, "stone")
                    w.set_block(x, h, z, "grass_block")
    for _ in range(30):
        tx, tz = rng.randint(-50, 50), rng.randint(-50, 50)
        _tree(w, tx, w.top_y(tx, tz), tz)
    spawns = [(0.5, GROUND + 2, 0.5)]
    return w, spawns, {}


def build_hideseek(reg):
    w = World(reg, "hideseek")
    _flat_island(w, 0, 0, 24, "stone", "stone", GROUND - 1, edge_r=24)
    rng = random.Random(13)
    for i in range(18):
        bx, bz = rng.randint(-20, 20), rng.randint(-20, 20)
        h = rng.randint(2, 5)
        for y in range(GROUND + 1, GROUND + h + 1):
            w.set_block(bx, y, bz, "oak_planks" if i % 3 else "cobblestone")
    spawns = [(0.5, GROUND + 1, 0.5)]
    return w, spawns, {}


def build_buildbattle(reg):
    w = World(reg, "buildbattle")
    for px, pz in ((-12, 0), (12, 0), (0, -12), (0, 12)):
        _disc(w, px, GROUND, pz, 8, "stone_bricks")
        for y in range(GROUND - 2, GROUND):
            _disc(w, px, y, pz, 8, "stone")
    spawns = [(0.5, GROUND + 1, 0.5)]
    return w, spawns, {}


BUILDERS = {
    "lobby": build_lobby,
    "survival": build_survival,
    "creative": build_survival,
    "skywars": build_skywars,
    "bedwars": build_bedwars,
    "sumo": build_sumo,
    "parkour": build_parkour,
    "practice": build_practice,
    "kitpvp": build_kitpvp,
    "spleef": build_spleef,
    "tntrun": build_tntrun,
    "mlg": build_mlg,
    "zombies": build_zombies,
    "duels": build_duels,
    "bridge": build_bridge,
    "hungergames": build_hungergames,
    "hideseek": build_hideseek,
    "buildbattle": build_buildbattle,
}
