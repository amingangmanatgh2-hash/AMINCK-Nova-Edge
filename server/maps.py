"""Procedural map builders — upgraded (design + technology).

Technology:
  • seeded fBm / ridged noise terrain (`noise.py`) with water + beaches
  • structure helper library (houses, towers, arenas, trees, walls, bridges)
  • reproducible via per-world seeds; blocks set through the World API so the
    canonical registry stays the single source of truth (per-protocol states
    are derived at send time via `translated_column`)
  • keeps the `build_<mode>(reg) -> (world, spawns, extra)` contract
"""
import math
import random

from .world import World
from .noise import fbm, ridged, RNG

GROUND = 64


# ────────────────────────────────────────────────────────────────────────────
# shared primitives
# ────────────────────────────────────────────────────────────────────────────
def _disc(w, cx, cy, cz, r, name):
    w.disc(cx, cy, cz, r, name)


def _ring(w, cx, cy, cz, r_in, r_out, name):
    r_out2 = r_out * r_out
    r_in2 = r_in * r_in
    for x in range(cx - r_out, cx + r_out + 1):
        for z in range(cz - r_out, cz + r_out + 1):
            d2 = (x - cx) ** 2 + (z - cz) ** 2
            if r_in2 < d2 <= r_out2:
                w.set_block(x, cy, z, name)


def _cylinder(w, cx, cz, y1, y2, r, name):
    for y in range(min(y1, y2), max(y1, y2) + 1):
        _disc(w, cx, y, cz, r, name)


def _island(w, cx, cz, r, top="grass_block", under="stone", depth=4, base=None):
    for y in range(GROUND - depth, GROUND):
        _disc(w, cx, y, cz, r, base or under)
    _disc(w, cx, GROUND, cz, r, top)


def _tree(w, x, y, z, log="oak_log", leaf="oak_leaves", h=5):
    for i in range(h):
        w.set_block(x, y + i, z, log)
    top = y + h - 2
    for dy in range(0, 3):
        r = 2 if dy == 0 else (1 if dy == 2 else 2)
        for dx in range(-r, r + 1):
            for dz in range(-r, r + 1):
                if abs(dx) == 2 and abs(dz) == 2 and dy != 0:
                    continue
                if w.get_state(x + dx, top + dy, z + dz) == 0:
                    w.set_block(x + dx, top + dy, z + dz, leaf)
    w.set_block(x, y + h, z, leaf)


def _wall(w, x1, z1, x2, z2, y, height, name):
    for x in range(min(x1, x2), max(x1, x2) + 1):
        for z in range(min(z1, z2), max(z1, z2) + 1):
            for dy in range(height):
                w.set_block(x, y + dy, z, name)


def _terrain(w, rng, x0, z0, x1, z1, seed, base=GROUND, amp=6.0,
             scale=0.06, water=-1, top="grass_block", sub="dirt",
             under="stone", forest=0.0, beach="sand"):
    """Rolling-noise terrain over [x0..x1] x [z0..z1]."""
    for x in range(x0, x1 + 1):
        for z in range(z0, z1 + 1):
            n = fbm(x * scale, z * scale, seed, 4)
            h = int(base + (n - 0.5) * 2 * amp)
            # water
            if h < base + water:
                for y in range(GROUND - 4, base + water + 1):
                    if y <= h:
                        w.set_block(x, y, z, under)
                    else:
                        w.set_block(x, y, z, "water")
                continue
            for y in range(GROUND - 4, h):
                w.set_block(x, y, z, under)
            w.set_block(x, h, z, sub)
            w.set_block(x, h + 1, z, top)
            if forest and rng.chance(forest):
                if (x + z) % 7 == 0:
                    _tree(w, x, h + 2, z)


# ────────────────────────────────────────────────────────────────────────────
# lobby — grand hub with portals
# ────────────────────────────────────────────────────────────────────────────
def build_lobby(reg):
    w = World(reg, "lobby", seed=2026)
    rng = RNG(7)
    R = 30
    # concentric plaza
    _disc(w, 0, GROUND - 1, 0, R, "stone")
    _disc(w, 0, GROUND, 0, R, "stone_bricks")
    _ring(w, 0, GROUND, 0, R - 6, R, "stone")
    _ring(w, 0, GROUND, 0, R - 8, R - 6, "smooth_stone")
    # center beacon-ish fountain
    _cylinder(w, 0, 0, GROUND + 1, GROUND + 4, 3, "quartz_block")
    _disc(w, 0, GROUND + 5, 0, 1, "glowstone")
    for dx, dz in ((4, 0), (-4, 0), (0, 4), (0, -4)):
        _disc(w, dx, GROUND + 1, dz, 1, "sea_lantern")

    pads = {
        "skywars": ("skywars", 18, 0, "blue_wool"),
        "bedwars": ("bedwars", -18, 0, "red_wool"),
        "survival": ("survival", 0, 18, "green_wool"),
        "practice": ("practice", 0, -18, "cyan_wool"),
        "kitpvp": ("kitpvp", 13, 13, "orange_wool"),
        "sumo": ("sumo", -13, 13, "yellow_wool"),
        "parkour": ("parkour", 13, -13, "purple_wool"),
        "tntrun": ("tntrun", -13, -13, "lime_wool"),
        "spleef": ("spleef", 23, -23, "white_wool"),
        "duels": ("duels", -23, 23, "magenta_wool"),
        "mlg": ("mlg", 23, 23, "light_blue_wool"),
        "zombies": ("zombies", 28, 0, "black_wool"),
        "bridge": ("bridge", -28, 0, "brown_wool"),
        "hungergames": ("hungergames", 0, 28, "pink_wool"),
        "hideseek": ("hideseek", 0, -28, "gray_wool"),
        "buildbattle": ("buildbattle", 28, 28, "green_wool"),
    }
    for _, px, pz, wool in pads.values():
        _disc(w, px, GROUND + 1, pz, 2, wool)
        _disc(w, px, GROUND + 2, pz, 1, "glowstone")
        # small frame
        for sx, sz in ((-3, -3), (3, -3), (-3, 3), (3, 3)):
            w.set_block(px + sx, GROUND + 1, pz + sz, "quartz_block")
        for sx, sz in ((-3, 0), (3, 0), (0, -3), (0, 3)):
            for y in (GROUND + 2, GROUND + 3):
                w.set_block(px + sx, y, pz + sz, "quartz_block")

    # gardens + paths
    for ang in range(0, 360, 36):
        tx = int(math.cos(math.radians(ang)) * 10)
        tz = int(math.sin(math.radians(ang)) * 10)
        if w.get_state(tx, GROUND + 1, tz) == 0:
            _tree(w, tx, GROUND + 1, tz, h=rng.randint(4, 6))
    spawns = [(0.5, GROUND + 6, 0.5)]
    return w, spawns, {"pads": pads}


# ────────────────────────────────────────────────────────────────────────────
# survival — terrain, village, farm, mine
# ────────────────────────────────────────────────────────────────────────────
def build_survival(reg):
    w = World(reg, "survival", seed=1234)
    rng = RNG(42)
    _terrain(w, rng, -90, -90, 90, 90, seed=1234, amp=5.0, scale=0.05,
             forest=0.02)
    # village: 3 houses around a well
    house_centers = [(6, 6), (-10, 4), (2, -12)]
    for hx, hz in house_centers:
        top = w.top_y(hx, hz)
        _house(w, hx, top, hz, rng)
    # well
    well_top = w.top_y(0, 0)
    _disc(w, 0, well_top, 0, 3, "stone_bricks")
    _ring(w, 0, well_top + 1, 0, 1, 2, "cobblestone")
    # farm
    for x in range(14, 22):
        for z in range(-4, 4):
            w.set_block(x, w.top_y(x, z) - 1, z, "farmland")
    # mine entrance
    for x in range(-20, -16):
        w.set_block(x, w.top_y(x, 22), 22, "cobblestone")
    spawns = [(0.5, well_top + 2, 0.5)]
    return w, spawns, {}


def _house(w, cx, top, cz, rng, log="oak_log", planks="oak_planks"):
    x0, z0, x1, z1 = cx - 3, cz - 3, cx + 3, cz + 3
    # walls
    for x in range(x0, x1 + 1):
        for z in range(z0, z1 + 1):
            for y in range(top, top + 4):
                if x in (x0, x1) or z in (z0, z1):
                    w.set_block(x, y, z, planks if y % 4 else log)
    # roof
    for x in range(x0 - 1, x1 + 2):
        for z in range(z0 - 1, z1 + 2):
            if x0 - 1 <= x <= x1 + 1 and z0 - 1 <= z <= z1 + 1:
                w.set_block(x, top + 4, z, "oak_slab")
    # door + window
    w.set_block(cx, top, z1, "air")
    w.set_block(cx, top + 1, z1, "air")
    w.set_block(cx, top + 1, z0, "glass_pane")
    w.set_block(cx, top + 1, z0 - 1 if z0 - 1 >= z0 else z0, "glass_pane")
    w.set_block(cx, top + 1, z1 - 2, "torch")


# ────────────────────────────────────────────────────────────────────────────
# skywars — 8 islands + layered mid
# ────────────────────────────────────────────────────────────────────────────
def build_skywars(reg):
    w = World(reg, "skywars")
    mid = (0, GROUND, 0)
    islands = []
    # layered mid island
    for r, block in ((9, "stone"), (7, "cobblestone"), (5, "grass_block")):
        for y in range(GROUND - 5, GROUND):
            _disc(w, 0, y, 0, r, "stone")
    _disc(w, 0, GROUND, 0, 5, "grass_block")
    _disc(w, 0, GROUND + 1, 0, 2, "gold_block")
    for i in range(8):
        ang = i * math.tau / 8
        ix = int(round(math.cos(ang) * 30))
        iz = int(round(math.sin(ang) * 30))
        _island(w, ix, iz, 5, top="grass_block")
        # chest + tree
        w.set_block(ix, GROUND + 1, iz, "chest")
        _tree(w, ix + 2, GROUND + 1, iz + 2, h=4)
        # bridge hint
        sx = int(round(math.cos(ang) * 10))
        sz = int(round(math.sin(ang) * 10))
        w.set_block(ix + sx, GROUND, iz + sz, "oak_planks")
        islands.append((ix + 0.5, GROUND + 2, iz + 0.5))
    spawns = islands
    return w, spawns, {"mid": mid}


# ────────────────────────────────────────────────────────────────────────────
# bedwars — 4 team bases with beds, forge, mid emeralds
# ────────────────────────────────────────────────────────────────────────────
def build_bedwars(reg):
    w = World(reg, "bedwars")
    teams = {
        "red": (34, 0, "red_wool"),
        "blue": (-34, 0, "blue_wool"),
        "green": (0, 34, "green_wool"),
        "yellow": (0, -34, "yellow_wool"),
    }
    spawns = {}
    for tname, (tx, tz, wool) in teams.items():
        # base platform
        _island(w, tx, tz, 7, top=wool, under="stone", depth=4)
        # bed (wool blocks, colored)
        w.set_block(tx, GROUND + 1, tz, wool)
        w.set_block(tx, GROUND + 1, tz + 1, wool)
        # forge
        w.set_block(tx + 3, GROUND + 1, tz + 3, "furnace")
        # wall
        _ring(w, tx, GROUND + 1, tz, 6, 7, "stone")
        spawns[tname] = (tx + 0.5, GROUND + 2, tz - 2.5)
        # bridge to mid (bounded, walks toward the center)
        sx = -1 if tx > 0 else (1 if tx < 0 else 0)
        sz = -1 if tz > 0 else (1 if tz < 0 else 0)
        x, z = tx, tz
        for _ in range(40):
            if abs(x) <= 7 and abs(z) <= 7:
                break
            x += sx
            z += sz
            w.set_block(x, GROUND, z, "oak_planks")
            w.set_block(x, GROUND - 1, z, "stone")
    # mid
    for y in range(GROUND - 4, GROUND):
        _disc(w, 0, y, 0, 6, "stone")
    _disc(w, 0, GROUND, 0, 5, "gold_block")
    for dx, dz in ((0, 4), (0, -4), (4, 0), (-4, 0)):
        w.set_block(dx, GROUND + 1, dz, "emerald_block")
    return w, spawns, {"teams": list(teams.keys())}


def _sign(v):
    return 1 if v >= 0 else -1


# ────────────────────────────────────────────────────────────────────────────
# sumo — arena with border walls + spectator ring
# ────────────────────────────────────────────────────────────────────────────
def build_sumo(reg):
    w = World(reg, "sumo")
    for y in range(GROUND - 2, GROUND):
        _disc(w, 0, y, 0, 9, "stone")
    _disc(w, 0, GROUND, 0, 8, "oak_planks")
    _ring(w, 0, GROUND, 0, 8, 9, "stone_bricks")
    # decorative corners
    for dx, dz in ((7, 7), (-7, 7), (7, -7), (-7, -7)):
        w.set_block(dx, GROUND + 1, dz, "glowstone")
    spawns = [(3.5, GROUND + 1, 0.5), (-3.5, GROUND + 1, 0.5)]
    return w, spawns, {}


# ────────────────────────────────────────────────────────────────────────────
# parkour — generated course with checkpoints + finish
# ────────────────────────────────────────────────────────────────────────────
def build_parkour(reg):
    w = World(reg, "parkour")
    rng = RNG(3)
    _disc(w, 0, GROUND - 1, 30, 6, "stone")
    course = []
    x, z = 0, 18
    py = GROUND + 1
    for i in range(46):
        block = "stone_bricks" if i % 6 == 0 else "stone"
        w.set_block(x, py, z, block)
        course.append((x, py, z))
        # checkpoint every 10
        if i % 10 == 9:
            w.set_block(x, py, z, "gold_block")
        # jump type varies
        j = rng.randint(2, 4)
        if i % 7 == 6:
            z += rng.randint(2, 4)
        elif i % 5 == 4:
            py += 1
            w.set_block(x, py - 1, z, "stone")
            x += 2
        else:
            x += j
    # finish pad
    fx, fz = course[-1][0], course[-1][2]
    _disc(w, fx, py + 1, fz, 2, "diamond_block")
    course.append((fx, py + 1, fz))
    spawns = [(0.5, GROUND + 2, 18.5)]
    return w, spawns, {"course": course}


# ────────────────────────────────────────────────────────────────────────────
# practice — flat arena with sumo + mlg sub-zones
# ────────────────────────────────────────────────────────────────────────────
def build_practice(reg):
    w = World(reg, "practice")
    _disc(w, 0, GROUND - 1, 0, 32, "stone")
    _disc(w, 0, GROUND, 0, 32, "stone_bricks")
    # center flat arena markers
    for dx in range(-28, 29, 4):
        for dz in range(-28, 29, 4):
            if (dx + dz) % 8 == 0:
                w.set_block(dx, GROUND + 1, dz, "iron_block")
    # sumo sub-arena
    _disc(w, 22, GROUND, 22, 6, "oak_planks")
    _ring(w, 22, GROUND, 22, 6, 7, "stone_bricks")
    # mlg tower
    _cylinder(w, -24, -24, GROUND + 1, GROUND + 40, 3, "stone")
    w.set_block(-24, GROUND + 41, -24, "glowstone")
    for x in range(-28, -21):
        for z in range(-28, -21):
            w.set_block(x, GROUND, z, "water")
    spawns = [(0.5, GROUND + 1, 0.5)]
    return w, spawns, {}


# ────────────────────────────────────────────────────────────────────────────
# kitpvp — ruined arena with pillars + cover
# ────────────────────────────────────────────────────────────────────────────
def build_kitpvp(reg):
    w = World(reg, "kitpvp")
    rng = RNG(5)
    _disc(w, 0, GROUND - 1, 0, 28, "stone")
    _disc(w, 0, GROUND, 0, 28, "grass_block")
    # cover pillars
    for i in range(10):
        bx, bz = rng.randint(-24, 24), rng.randint(-24, 24)
        h = rng.randint(2, 5)
        for y in range(GROUND + 1, GROUND + h + 1):
            w.set_block(bx, y, bz, "cobblestone")
    # center ruins
    _ring(w, 0, GROUND + 1, 0, 4, 6, "mossy_cobblestone")
    for dx, dz in ((8, 8), (-8, 8), (8, -8), (-8, -8)):
        w.set_block(dx, GROUND + 1, dz, "obsidian")
    spawns = [(0.5, GROUND + 1, 0.5)]
    return w, spawns, {}


# ────────────────────────────────────────────────────────────────────────────
# spleef — layered snow arena
# ────────────────────────────────────────────────────────────────────────────
def build_spleef(reg):
    w = World(reg, "spleef")
    for y in range(GROUND - 2, GROUND):
        _disc(w, 0, y, 0, 14, "stone")
    _disc(w, 0, GROUND, 0, 14, "snow_block")
    _ring(w, 0, GROUND, 0, 14, 15, "stone_bricks")
    # second layer
    _disc(w, 0, GROUND + 1, 0, 9, "snow_block")
    spawns = [(3.5, GROUND + 2, 0.5), (-3.5, GROUND + 2, 0.5)]
    return w, spawns, {}


# ────────────────────────────────────────────────────────────────────────────
# tntrun — layered arena with sand gradient
# ────────────────────────────────────────────────────────────────────────────
def build_tntrun(reg):
    w = World(reg, "tntrun")
    for layer, block in ((0, "red_sand"), (1, "sand"), (2, "sandstone")):
        _disc(w, 0, GROUND + layer, 0, 16 - layer * 2, block)
    _ring(w, 0, GROUND, 0, 16, 17, "stone_bricks")
    spawns = [(3.5, GROUND + 1, 0.5), (-3.5, GROUND + 1, 0.5)]
    return w, spawns, {}


# ────────────────────────────────────────────────────────────────────────────
# mlg — tall tower + water pool
# ────────────────────────────────────────────────────────────────────────────
def build_mlg(reg):
    w = World(reg, "mlg")
    _disc(w, 0, GROUND - 1, 0, 10, "stone")
    for x in range(-6, 7):
        for z in range(-6, 7):
            w.set_block(x, GROUND, z, "water")
    _disc(w, 0, GROUND, 0, 1, "sea_lantern")
    h = GROUND + 52
    for i in range(8):
        _disc(w, 0, h + i, 0, 7 - i, "stone")
    _disc(w, 0, h + 8, 0, 1, "gold_block")
    spawns = [(0.5, h + 9, 0.5)]
    return w, spawns, {"top": h + 8}


# ────────────────────────────────────────────────────────────────────────────
# zombies — walled fortress arena
# ────────────────────────────────────────────────────────────────────────────
def build_zombies(reg):
    w = World(reg, "zombies")
    _disc(w, 0, GROUND - 1, 0, 22, "stone")
    _disc(w, 0, GROUND, 0, 22, "stone_bricks")
    # fortress walls + towers
    _wall(w, -20, -20, 20, -20, GROUND + 1, 4, "stone_bricks")
    _wall(w, -20, 20, 20, 20, GROUND + 1, 4, "stone_bricks")
    _wall(w, -20, -20, -20, 20, GROUND + 1, 4, "stone_bricks")
    _wall(w, 20, -20, 20, 20, GROUND + 1, 4, "stone_bricks")
    for dx, dz in ((20, 20), (-20, 20), (20, -20), (-20, -20)):
        _cylinder(w, dx, dz, GROUND + 1, GROUND + 6, 2, "obsidian")
        w.set_block(dx, GROUND + 7, dz, "glowstone")
    # gates
    w.set_block(0, GROUND + 1, -20, "air")
    w.set_block(0, GROUND + 2, -20, "air")
    w.set_block(0, GROUND + 1, 20, "air")
    w.set_block(0, GROUND + 2, 20, "air")
    spawns = [(0.5, GROUND + 1, 0.5)]
    return w, spawns, {}


# ────────────────────────────────────────────────────────────────────────────
# duels — symmetrical 1v1 arena
# ────────────────────────────────────────────────────────────────────────────
def build_duels(reg):
    w = World(reg, "duels")
    _disc(w, 0, GROUND - 1, 0, 12, "stone")
    _disc(w, 0, GROUND, 0, 12, "stone_bricks")
    _ring(w, 0, GROUND, 0, 10, 11, "oak_planks")
    for dx, dz in ((6, 0), (-6, 0), (0, 6), (0, -6)):
        w.set_block(dx, GROUND + 1, dz, "iron_block")
    spawns = [(5.5, GROUND + 1, 0.5), (-5.5, GROUND + 1, 0.5)]
    return w, spawns, {}


# ────────────────────────────────────────────────────────────────────────────
# bridge — two lanes + goals
# ────────────────────────────────────────────────────────────────────────────
def build_bridge(reg):
    w = World(reg, "bridge")
    for tx, tz, wool in ((-26, 0, "red_wool"), (26, 0, "blue_wool")):
        _island(w, tx, tz, 6, top=wool, under="stone", depth=4)
        # goal portal
        gx = tx + (-2 if tx < 0 else 2)
        w.set_block(gx, GROUND + 1, tz, "gold_block")
        w.set_block(gx, GROUND + 2, tz, "gold_block")
    # two lanes with a gap
    for x in range(-25, 26):
        w.set_block(x, GROUND - 1, 0, "oak_planks")
        w.set_block(x, GROUND - 1, 4, "oak_planks")
    # mid gap obstacle
    for x in range(-3, 4):
        w.set_block(x, GROUND, 2, "air")
    spawns = [(-26.5, GROUND + 1, 2.5), (26.5, GROUND + 1, 2.5)]
    return w, spawns, {}


# ────────────────────────────────────────────────────────────────────────────
# hungergames — varied biome + cornucopia
# ────────────────────────────────────────────────────────────────────────────
def build_hungergames(reg):
    w = World(reg, "hungergames", seed=99)
    rng = RNG(11)
    for cx in range(-5, 6):
        for cz in range(-5, 6):
            for x in range(cx * 16, cx * 16 + 16):
                for z in range(cz * 16, cz * 16 + 16):
                    n = fbm(x * 0.05, z * 0.05, 99, 4)
                    h = GROUND + int((n - 0.5) * 2 * 7) + rng.randint(-1, 1)
                    for y in range(GROUND - 3, h):
                        w.set_block(x, y, z, "stone")
                    w.set_block(x, h, z, "grass_block")
    # cornucopia (center)
    _cylinder(w, 0, 0, GROUND + 1, GROUND + 5, 4, "stone_bricks")
    _disc(w, 0, GROUND + 6, 0, 4, "oak_planks")
    for ang in range(0, 360, 45):
        tx = int(math.cos(math.radians(ang)) * 7)
        tz = int(math.sin(math.radians(ang)) * 7)
        top = w.top_y(tx, tz)
        w.set_block(tx, top, tz, "chest")
    # forests
    for _ in range(40):
        tx, tz = rng.randint(-70, 70), rng.randint(-70, 70)
        if abs(tx) < 12 and abs(tz) < 12:
            continue
        _tree(w, tx, w.top_y(tx, tz), tz, h=rng.randint(4, 7))
    spawns = [(0.5, GROUND + 7, 0.5)]
    return w, spawns, {}


# ────────────────────────────────────────────────────────────────────────────
# hideseek — small town with hiding spots
# ────────────────────────────────────────────────────────────────────────────
def build_hideseek(reg):
    w = World(reg, "hideseek")
    rng = RNG(13)
    _disc(w, 0, GROUND - 1, 0, 26, "stone")
    _disc(w, 0, GROUND, 0, 26, "grass_block")
    # buildings
    for i in range(10):
        bx, bz = rng.randint(-20, 20), rng.randint(-20, 20)
        _house(w, bx, GROUND + 1, bz, rng, log="spruce_log", planks="cobblestone")
    # crates / stacks to hide behind
    for i in range(14):
        bx, bz = rng.randint(-22, 22), rng.randint(-22, 22)
        h = rng.randint(1, 3)
        for y in range(GROUND + 1, GROUND + h + 1):
            w.set_block(bx, y, bz, "oak_planks" if i % 2 else "cobblestone")
    # seeker spawn beacon
    _disc(w, 0, GROUND + 1, 0, 2, "gold_block")
    spawns = [(0.5, GROUND + 2, 0.5)]
    return w, spawns, {}


# ────────────────────────────────────────────────────────────────────────────
# buildbattle — 4 plots + center theme board
# ────────────────────────────────────────────────────────────────────────────
def build_buildbattle(reg):
    w = World(reg, "buildbattle")
    for px, pz, wool in ((-14, 0, "red_wool"), (14, 0, "blue_wool"),
                         (0, -14, "green_wool"), (0, 14, "yellow_wool")):
        _disc(w, px, GROUND - 1, pz, 9, "stone")
        _disc(w, px, GROUND, pz, 9, "stone_bricks")
        _ring(w, px, GROUND, pz, 9, 10, wool)
    # center theme board
    _cylinder(w, 0, 0, GROUND + 1, GROUND + 4, 3, "quartz_block")
    for i in range(4):
        ang = i * math.tau / 4
        tx = int(math.cos(ang) * 6)
        tz = int(math.sin(ang) * 6)
        w.set_block(tx, GROUND + 1, tz, ["red_wool", "blue_wool", "green_wool", "yellow_wool"][i])
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
