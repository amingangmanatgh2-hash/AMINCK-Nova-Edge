"""VarInt / binary primitives for the Minecraft protocol."""
import struct


def read_varint(buf, off=0):
    """Return (value, new_offset). buf can be bytes or bytearray."""
    value = 0
    shift = 0
    while True:
        b = buf[off]
        off += 1
        value |= (b & 0x7F) << shift
        if not (b & 0x80):
            return value, off
        shift += 7
        if shift > 63:
            raise ValueError("varint too big")


def write_varint(buf, value):
    value &= 0xFFFFFFFF
    while True:
        if value & ~0x7F == 0:
            buf.append(value)
            return
        buf.append((value & 0x7F) | 0x80)
        value >>= 7


def write_varlong(buf, value):
    value &= 0xFFFFFFFFFFFFFFFF
    while True:
        if value & ~0x7F == 0:
            buf.append(value)
            return
        buf.append((value & 0x7F) | 0x80)
        value >>= 7


def read_varlong(buf, off=0):
    value = 0
    shift = 0
    while True:
        b = buf[off]
        off += 1
        value |= (b & 0x7F) << shift
        if not (b & 0x80):
            if value >= (1 << 63):
                value -= (1 << 64)
            return value, off
        shift += 7


class Reader:
    """Big-endian reader over a bytes-like buffer."""
    __slots__ = ("buf", "off")

    def __init__(self, buf):
        self.buf = buf
        self.off = 0

    def u8(self):
        b = self.buf[self.off]; self.off += 1; return b

    def i8(self):
        b = self.buf[self.off]; self.off += 1
        return b - 256 if b >= 128 else b

    def u16(self):
        v = struct.unpack_from(">H", self.buf, self.off)[0]; self.off += 2; return v

    def i16(self):
        v = struct.unpack_from(">h", self.buf, self.off)[0]; self.off += 2; return v

    def u32(self):
        v = struct.unpack_from(">I", self.buf, self.off)[0]; self.off += 4; return v

    def i32(self):
        v = struct.unpack_from(">i", self.buf, self.off)[0]; self.off += 4; return v

    def i64(self):
        v = struct.unpack_from(">q", self.buf, self.off)[0]; self.off += 8; return v

    def f32(self):
        v = struct.unpack_from(">f", self.buf, self.off)[0]; self.off += 4; return v

    def f64(self):
        v = struct.unpack_from(">d", self.buf, self.off)[0]; self.off += 8; return v

    def varint(self):
        v, self.off = read_varint(self.buf, self.off); return v

    def varlong(self):
        v, self.off = read_varlong(self.buf, self.off); return v

    def string(self):
        n, self.off = read_varint(self.buf, self.off)
        s = self.buf[self.off:self.off + n].decode("utf-8", "replace")
        self.off += n
        return s

    def pstring(self):
        n = self.u16()
        s = self.buf[self.off:self.off + n].decode("utf-8", "replace")
        self.off += n
        return s

    def uuid(self):
        hi = self.i64(); lo = self.i64()
        return hi, lo

    def read(self, n):
        b = self.buf[self.off:self.off + n]; self.off += n; return b

    def remaining(self):
        return len(self.buf) - self.off


class Writer:
    """Bytearray-based packet writer."""
    __slots__ = ("buf",)

    def __init__(self):
        self.buf = bytearray()

    def u8(self, v): self.buf.append(v & 0xFF); return self
    def i8(self, v): self.buf.append(v & 0xFF); return self
    def u16(self, v): self.buf += struct.pack(">H", v & 0xFFFF); return self
    def i16(self, v): self.buf += struct.pack(">h", v); return self
    def u32(self, v): self.buf += struct.pack(">I", v & 0xFFFFFFFF); return self
    def i32(self, v): self.buf += struct.pack(">i", v); return self
    def i64(self, v): self.buf += struct.pack(">q", v); return self
    def f32(self, v): self.buf += struct.pack(">f", v); return self
    def f64(self, v): self.buf += struct.pack(">d", v); return self
    def varint(self, v): write_varint(self.buf, v); return self
    def varlong(self, v): write_varlong(self.buf, v); return self
    def bool(self, v): self.buf.append(1 if v else 0); return self
    def string(self, s):
        if isinstance(s, str):
            s = s.encode("utf-8")
        write_varint(self.buf, len(s))
        self.buf += s
        return self
    def pstring(self, s):
        if isinstance(s, str):
            s = s.encode("utf-8")
        self.u16(len(s))
        self.buf += s
        return self
    def uuid(self, hi, lo):
        self.i64(hi).i64(lo)
        return self
    def position(self, x, y, z):
        v = ((x & 0x3FFFFFF) << 38) | ((z & 0x3FFFFFF) << 12) | (y & 0xFFF)
        self.i64(v)
        return self
    def raw(self, b): self.buf += b; return self
    def bytes_(self):
        return bytes(self.buf)


def encode_string_utf8(s):
    return s.encode("utf-8")
