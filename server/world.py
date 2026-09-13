"""World model: chunk store + building primitives."""
import math, random
from .chunk import ChunkColumn, encode_chunk_data, encode_heightmap
from .registry import Registry


class World:
    def __init__(self, reg: Registry, name="world", seed=None):
        self.reg = reg
        self.name = name
        self.seed = seed if seed is not None else random.getrandbits(32)
        self.chunks = {}
        cm = reg.chunk
        self.min_y = cm.get("min_y", 0)
        self.height = cm.get("height", 256)
        self.num_sections = cm.get("num_sections", 16)
        self.rng = random.Random(self.seed)
        self._trans_cache = {}

    def _invalidate(self, cx, cz):
        for k in list(self._trans_cache):
            if k[0] == cx and k[1] == cz:
                del self._trans_cache[k]

    # ── block access ──────────────────────────────────────────────────────
    def _chunk_at(self, cx, cz):
        c = self.chunks.get((cx, cz))
        if c is None:
            c = ChunkColumn(self.num_sections, self.min_y)
            self.chunks[(cx, cz)] = c
        return c

    def set_state(self, x, y, z, state):
        if y < self.min_y or y >= self.min_y + self.height:
            return
        self._chunk_at(x >> 4, z >> 4).set_block(x & 15, y, z & 15, state)
        self._invalidate(x >> 4, z >> 4)

    def get_state(self, x, y, z):
        if y < self.min_y or y >= self.min_y + self.height:
            return 0
        return self._chunk_at(x >> 4, z >> 4).get_block(x & 15, y, z & 15)

    def set_block(self, x, y, z, name):
        self.set_state(x, y, z, self.reg.block_state(name))

    def get_block_name(self, x, y, z):
        return self.get_state(x, y, z)

    # ── builders ──────────────────────────────────────────────────────────
    def fill(self, x1, y1, z1, x2, y2, z2, name):
        st = self.reg.block_state(name)
        for x in range(min(x1, x2), max(x1, x2) + 1):
            for y in range(min(y1, y2), max(y1, y2) + 1):
                for z in range(min(z1, z2), max(z1, z2) + 1):
                    self.set_state(x, y, z, st)

    def platform(self, cx, cz, y, radius, name):
        st = self.reg.block_state(name)
        for x in range(cx - radius, cx + radius + 1):
            for z in range(cz - radius, cz + radius + 1):
                self.set_state(x, y, z, st)

    def disc(self, cx, cy, cz, radius, name):
        st = self.reg.block_state(name)
        r2 = radius * radius
        for x in range(cx - radius, cx + radius + 1):
            for z in range(cz - radius, cz + radius + 1):
                if (x - cx) ** 2 + (z - cz) ** 2 <= r2:
                    self.set_state(x, cy, z, st)

    def hollow_box(self, x1, y1, z1, x2, y2, z2, name):
        st = self.reg.block_state(name)
        for x in range(min(x1, x2), max(x1, x2) + 1):
            for y in range(min(y1, y2), max(y1, y2) + 1):
                for z in range(min(z1, z2), max(z1, z2) + 1):
                    if (x in (x1, x2) or y in (y1, y2) or z in (z1, z2)):
                        self.set_state(x, y, z, st)

    def column(self, x, z, y1, y2, name):
        st = self.reg.block_state(name)
        for y in range(min(y1, y2), max(y1, y2) + 1):
            self.set_state(x, y, z, st)

    def flat_layer(self, x1, z1, x2, z2, y, name):
        st = self.reg.block_state(name)
        for x in range(min(x1, x2), max(x1, x2) + 1):
            for z in range(min(z1, z2), max(z1, z2) + 1):
                self.set_state(x, y, z, st)

    # ── serialization ─────────────────────────────────────────────────────
    def chunk_column(self, cx, cz):
        return self._chunk_at(cx, cz)

    def serialize_chunk(self, cx, cz, biome="plains"):
        col = self._chunk_at(cx, cz)
        return encode_chunk_data(self.reg.chunk, col, self.reg.biome_id(biome))

    def translated_column(self, cx, cz, target_reg):
        """Return a ChunkColumn whose states are target-protocol state ids."""
        key = (cx, cz, target_reg.proto)
        c = self._trans_cache.get(key)
        if c is None:
            src = self._chunk_at(cx, cz)
            c = ChunkColumn(self.num_sections, self.min_y)
            lookup = target_reg.block_state
            name_of = self.reg.name_of
            for si, sec in enumerate(src.sections):
                c.sections[si].states = [
                    (lookup(name_of(s)) if s else 0) for s in sec.states
                ]
            self._trans_cache[key] = c
        return c

    def heightmap(self, cx, cz):
        return encode_heightmap(self._chunk_at(cx, cz))

    def top_y(self, x, z):
        """Highest solid block y + 1 in a column (for safe spawn)."""
        for y in range(self.min_y + self.height - 1, self.min_y - 1, -1):
            if self.get_state(x, y, z) != 0:
                return y + 1
        return self.min_y + 64
