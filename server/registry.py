"""Per-protocol block/item/biome registry helpers."""
import threading


# modern name -> legacy (1.8–1.12) name + metadata, for renamed blocks.
LEGACY_BLOCK = {
    "grass_block": ("grass", 0),
    "oak_log": ("log", 0),
    "spruce_log": ("log", 1),
    "birch_log": ("log", 2),
    "jungle_log": ("log", 3),
    "acacia_log": ("log2", 0),
    "dark_oak_log": ("log2", 1),
    "oak_planks": ("planks", 0),
    "spruce_planks": ("planks", 1),
    "oak_leaves": ("leaves", 0),
    "white_wool": ("wool", 0),
    "orange_wool": ("wool", 1),
    "magenta_wool": ("wool", 2),
    "light_blue_wool": ("wool", 3),
    "yellow_wool": ("wool", 4),
    "lime_wool": ("wool", 5),
    "pink_wool": ("wool", 6),
    "gray_wool": ("wool", 7),
    "light_gray_wool": ("wool", 8),
    "cyan_wool": ("wool", 9),
    "purple_wool": ("wool", 10),
    "blue_wool": ("wool", 11),
    "brown_wool": ("wool", 12),
    "green_wool": ("wool", 13),
    "red_wool": ("wool", 14),
    "black_wool": ("wool", 15),
    "stone_bricks": ("stonebrick", 0),
    "oak_slab": ("wooden_slab", 0),
    "oak_stairs": ("oak_stairs", 0),
    "oak_fence": ("fence", 0),
    "oak_wood": ("wood", 0),
    "terracotta": ("hardened_clay", 0),
    "white_concrete": ("concrete", 0),
    "orange_concrete": ("concrete", 1),
    "magenta_concrete": ("concrete", 2),
    "light_blue_concrete": ("concrete", 3),
    "yellow_concrete": ("concrete", 4),
    "lime_concrete": ("concrete", 5),
    "pink_concrete": ("concrete", 6),
    "gray_concrete": ("concrete", 7),
    "light_gray_concrete": ("concrete", 8),
    "cyan_concrete": ("concrete", 9),
    "purple_concrete": ("concrete", 10),
    "blue_concrete": ("concrete", 11),
    "brown_concrete": ("concrete", 12),
    "green_concrete": ("concrete", 13),
    "red_concrete": ("concrete", 14),
    "black_concrete": ("concrete", 15),
    "smooth_stone": ("stone", 6),
    "farmland": ("farmland", 0),
    "red_sand": ("sand", 1),
    "packed_ice": ("packed_ice", 0),
    "iron_block": ("iron_block", 0),
    "gold_block": ("gold_block", 0),
    "diamond_block": ("diamond_block", 0),
    "emerald_block": ("emerald_block", 0),
    "lapis_block": ("lapis_block", 0),
    "redstone_block": ("redstone_block", 0),
    "coal_block": ("coal_block", 0),
    "bookshelf": ("bookshelf", 0),
    "crafting_table": ("crafting_table", 0),
    "chest": ("chest", 0),
    "ender_chest": ("ender_chest", 0),
    "furnace": ("furnace", 0),
    "glowstone": ("glowstone", 0),
    "sea_lantern": ("sea_lantern", 0),
    "obsidian": ("obsidian", 0),
    "bedrock": ("bedrock", 0),
    "end_stone": ("end_stone", 0),
    "netherrack": ("netherrack", 0),
    "quartz_block": ("quartz_block", 0),
    "purpur_block": ("purpur_block", 0),
    "soul_sand": ("soul_sand", 0),
    "hay_block": ("hay_block", 0),
    "snow_block": ("snow", 0),
    "tnt": ("tnt", 0),
    "melon": ("melon_block", 0),
    "pumpkin": ("pumpkin", 0),
    "ladder": ("ladder", 0),
    "torch": ("torch", 0),
    "ice": ("ice", 0),
    "slime_block": ("slime", 0),
    "sponge": ("sponge", 0),
    "magma_block": ("magma", 0),
    "clay": ("clay", 0),
    "gravel": ("gravel", 0),
    "cobblestone": ("cobblestone", 0),
    "mossy_cobblestone": ("mossy_cobblestone", 0),
    "stone": ("stone", 0),
    "granite": ("stone", 1),
    "diorite": ("stone", 3),
    "andesite": ("stone", 5),
    "sand": ("sand", 0),
    "red_sand": ("sand", 1),
    "sandstone": ("sandstone", 0),
    "dirt": ("dirt", 0),
    "coarse_dirt": ("dirt", 1),
    "podzol": ("dirt", 2),
    "water": ("water", 0),
    "lava": ("lava", 0),
    "glass": ("glass", 0),
    "glass_pane": ("glass_pane", 0),
    "white_stained_glass": ("stained_glass", 0),
    "white_terracotta": ("stained_hardened_clay", 0),
    "red_stained_glass": ("stained_glass", 14),
    "bricks": ("brick_block", 0),
    "nether_bricks": ("nether_brick", 0),
}

FALLBACK_BLOCK = "stone"


class Registry:
    def __init__(self, proto_data):
        self.proto = proto_data["proto"]
        self.data = proto_data
        self.blocks = proto_data["blocks"]      # name -> [min, max, default]
        self.items = proto_data["items"]        # name -> id
        self.biomes = proto_data["biomes"]      # name -> id
        self.max_state = proto_data["block_max_state"]
        self.chunk = proto_data["chunk"]
        self._cache = {}
        self._lock = threading.Lock()
        self._name_of = None

    def name_of(self, state):
        """Reverse map: default state id -> block name (canonical protocols)."""
        if self._name_of is None:
            m = {}
            for name, (mn, mx, df) in self.blocks.items():
                m[df] = name
            self._name_of = m
        return self._name_of.get(state, "air")

    # blocks ----------------------------------------------------------------
    def block_state(self, name):
        name = name.split("[")[0]
        with self._lock:
            v = self._cache.get(name)
        if v is None:
            v = self._resolve_block(name)
            with self._lock:
                self._cache[name] = v
        return v

    def _resolve_block(self, name):
        if name in self.blocks:
            return self.blocks[name][2]  # default state
        if name in LEGACY_BLOCK and self.proto < 393:
            legacy, meta = LEGACY_BLOCK[name]
            if legacy in self.blocks:
                mn, mx, df = self.blocks[legacy]
                return mn + meta
        return self.blocks.get(FALLBACK_BLOCK, [0, 0, 0])[2]

    def item_id(self, name):
        return self.items.get(name, 1)

    def biome_id(self, name="plains"):
        return self.biomes.get(name, 1)

    @property
    def air(self):
        return 0
