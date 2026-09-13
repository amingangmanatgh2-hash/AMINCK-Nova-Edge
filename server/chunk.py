"""Chunk (section) encoding for every supported version family.

Derived from the PrismarineJS prismarine-chunk wire format so it is
byte-compatible with real clients.
"""
import struct
from . import nbt


def needed_bits(n):
    if n <= 1:
        return 1
    return (n - 1).bit_length()


def pack_entries(values, bits):
    """Pack `values` into 64-bit longs, LSB-first within each long."""
    longs = []
    cur = 0
    bitpos = 0
    for v in values:
        cur |= (v & ((1 << bits) - 1)) << bitpos
        bitpos += bits
        if bitpos >= 64:
            longs.append(cur & 0xFFFFFFFFFFFFFFFF)
            if bitpos == 64:
                cur = 0
                bitpos = 0
            else:
                overflow = bitpos - 64
                cur = (v & ((1 << bits) - 1)) >> (bits - overflow)
                bitpos = overflow
    if bitpos > 0:
        longs.append(cur & 0xFFFFFFFFFFFFFFFF)
    return longs


def write_longs(buf, longs):
    for l in longs:
        buf += struct.pack(">Q", l & 0xFFFFFFFFFFFFFFFF)


def nibble_array(buf, values):
    """values: 4096 entries of 4-bit values -> 2048 bytes."""
    for i in range(0, 4096, 2):
        lo = values[i] & 0xF
        hi = values[i + 1] & 0xF
        buf.append(lo | (hi << 4))


def _palette_write(buf, states, no_size_prefix, global_bits):
    """Write a paletted container for 4096 block states.
    states: list of state ids in yzx order (index = (y<<8)|(z<<4)|x)."""
    uniq = []
    seen = {}
    for s in states:
        if s not in seen:
            seen[s] = len(uniq)
            uniq.append(s)
    if len(uniq) == 1:
        buf.append(0)  # bits per block = 0 (single value)
        _varint(buf, uniq[0])
        if not no_size_prefix:
            buf.append(0)  # data array length 0
        return
    bits = max(4, needed_bits(len(uniq) - 1))
    if bits > 8:
        # global/direct palette
        buf.append(global_bits)
        vals = states
    else:
        buf.append(bits)
        _varint(buf, len(uniq))
        for u in uniq:
            _varint(buf, u)
        vals = [seen[s] for s in states]
    longs = pack_entries(vals, bits if bits <= 8 else global_bits)
    if not no_size_prefix:
        _varint(buf, len(longs))
    write_longs(buf, longs)


def _biome_write(buf, biome_id, count, no_size_prefix):
    """Paletted container for `count` identical biomes."""
    buf.append(0)  # single value
    _varint(buf, biome_id)
    if not no_size_prefix:
        buf.append(0)


def _varint(buf, v):
    v &= 0xFFFFFFFF
    while True:
        if v & ~0x7F == 0:
            buf.append(v)
            return
        buf.append((v & 0x7F) | 0x80)
        v >>= 7


class ChunkSection:
    __slots__ = ("states", "biome")

    def __init__(self):
        self.states = [0] * 4096
        self.biome = 0

    def set(self, x, y, z, state):
        self.states[(y << 8) | (z << 4) | x] = state

    def get(self, x, y, z):
        return self.states[(y << 8) | (z << 4) | x]


class ChunkColumn:
    def __init__(self, num_sections, min_y=0):
        self.sections = [ChunkSection() for _ in range(num_sections)]
        self.min_y = min_y

    def set_block(self, x, y, z, state):
        sy = (y - self.min_y) >> 4
        if 0 <= sy < len(self.sections):
            self.sections[sy].set(x, y & 15, z, state)

    def get_block(self, x, y, z):
        sy = (y - self.min_y) >> 4
        if 0 <= sy < len(self.sections):
            return self.sections[sy].get(x, y & 15, z)
        return 0


def encode_chunk_data(meta, column, biome_id, heightmap_fn=None):
    """Encode the `chunkData` buffer for a full chunk column.
    meta: the 'chunk' dict from generated protocol data."""
    fmt = meta["format"]
    buf = bytearray()
    full_bright = bytes([0xFF]) * 2048
    zero_light = bytes([0x00]) * 2048

    for section in column.sections:
        if fmt == "pre17":
            for s in section.states:
                buf += struct.pack("<H", s & 0xFFFF)
            buf += zero_light
            buf += full_bright
        elif fmt == "legacy_palette":
            solid = sum(1 for s in section.states if s != 0)
            buf += struct.pack(">h", solid)
            _palette_write(buf, section.states, False, 16)
            buf += zero_light
            buf += full_bright
        elif fmt == "p113":
            _palette_write(buf, section.states, False, 14)
            buf += zero_light
            buf += full_bright
        elif fmt in ("p114", "p116", "p117"):
            solid = sum(1 for s in section.states if s != 0)
            buf += struct.pack(">h", solid)
            _palette_write(buf, section.states, False, meta["max_bits_block"])
        elif fmt == "p118":
            solid = sum(1 for s in section.states if s != 0)
            buf += struct.pack(">h", solid)
            if meta.get("has_fluid"):
                buf += struct.pack(">h", 0)
            _palette_write(buf, section.states, meta.get("no_size_prefix"), meta["max_bits_block"])
            _biome_write(buf, biome_id, 64, meta.get("no_size_prefix"))
        else:
            raise ValueError(f"unknown chunk format {fmt!r}")

    if fmt in ("pre17", "legacy_palette"):
        for _ in range(256):
            buf.append(biome_id & 0xFF)
    elif fmt == "p113":
        for _ in range(256):
            buf += struct.pack(">i", biome_id)
    elif fmt == "p114":
        for _ in range(256):
            buf += struct.pack(">i", biome_id)
    return bytes(buf)


def heightmap_longs(column):
    """MOTION_BLOCKING / WORLD_SURFACE heights packed into 64-bit longs (9 bits/entry)."""
    h = [0] * 256
    for z in range(16):
        for x in range(16):
            top = 0
            for sy, section in enumerate(column.sections):
                for y in range(15, -1, -1):
                    if section.get(x, y, z) != 0:
                        top = sy * 16 + y + 1
                        break
                else:
                    continue
                break
            h[z * 16 + x] = top
    return pack_entries(h, 9)


def encode_heightmap(column):
    """Build MOTION_BLOCKING / WORLD_SURFACE heightmaps (9 bits/entry)."""
    longs = heightmap_longs(column)
    la = [[int(l >> 32), int(l & 0xFFFFFFFF)] for l in longs]
    return nbt.compound(
        MOTION_BLOCKING=nbt.long_array(la),
        WORLD_SURFACE=nbt.long_array(la),
    )


def encode_light_masks_array(num_sections, set_all):
    """1.18+ mask: array of i64, one element (sections < 64)."""
    if set_all:
        return [(1 << num_sections) - 1]
    return [0]


def encode_update_light(meta, chunk_x, chunk_z, full_bright=True):
    """Encode the Update Light packet payload (1.14 → 1.17.x)."""
    fmt = meta["format"]
    n = meta["num_sections"]
    sky = bytes([0xFF]) * 2048 if full_bright else bytes([0x00]) * 2048
    block = bytes([0x00]) * 2048
    buf = bytearray()
    _varint(buf, chunk_x)
    _varint(buf, chunk_z)
    if fmt in ("p114", "p116", "p117"):
        buf.append(1 if True else 0)  # trust edges
        _varint(buf, (1 << n) - 1)    # sky light mask (all sections)
        _varint(buf, 0)               # block light mask
        _varint(buf, 0)               # empty sky light mask
        _varint(buf, (1 << n) - 1)    # empty block light mask
        for _ in range(n):
            _varint(buf, 2048)
            buf += sky
    return bytes(buf)


def encode_map_chunk_light(meta, full_bright=True):
    """Light tail of the 1.18+ map_chunk packet."""
    n = meta["num_sections"]
    sky = bytes([0xFF]) * 2048 if full_bright else bytes([0x00]) * 2048
    block = bytes([0x00]) * 2048
    buf = bytearray()
    all_mask = (1 << n) - 1

    def i64_array(vals):
        _varint(buf, len(vals))
        for v in vals:
            buf.extend(struct.pack(">q", v))

    i64_array([all_mask])   # sky light mask
    i64_array([0])          # block light mask
    i64_array([0])          # empty sky light mask
    i64_array([all_mask])   # empty block light mask
    _varint(buf, n)         # sky light array count
    for _ in range(n):
        _varint(buf, 2048)
        buf += sky
    _varint(buf, n)         # block light array count
    for _ in range(n):
        _varint(buf, 2048)
        buf += block
    return bytes(buf)
