#!/usr/bin/env python3
"""Minimal pure-Python PNG decode/resize/encode (filters 0-4, RGB/RGBA)."""
import struct, zlib


def load(path):
    data = open(path, "rb").read()
    assert data[:8] == b"\x89PNG\r\n\x1a\n", "not a PNG"
    pos = 8
    width = height = bitdepth = colortype = None
    idat = b""
    while pos < len(data):
        length = struct.unpack(">I", data[pos:pos + 4])[0]
        tag = data[pos + 4:pos + 8]
        chunk = data[pos + 8:pos + 8 + length]
        if tag == b"IHDR":
            width, height, bitdepth, colortype = struct.unpack(">IIBB", chunk[:10])
        elif tag == b"IDAT":
            idat += chunk
        elif tag == b"IEND":
            break
        pos += 12 + length
    raw = zlib.decompress(idat)
    bpp = 3 if colortype == 2 else 4
    stride = width * bpp
    out = bytearray(width * height * bpp)
    prev = bytearray(stride)
    off = 0
    for y in range(height):
        f = raw[off]
        off += 1
        line = bytearray(raw[off:off + stride])
        off += stride
        if f == 1:
            for i in range(bpp, stride):
                line[i] = (line[i] + line[i - bpp]) & 0xFF
        elif f == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 0xFF
        elif f == 3:
            for i in range(stride):
                a = line[i - bpp] if i >= bpp else 0
                line[i] = (line[i] + ((a + prev[i]) >> 1)) & 0xFF
        elif f == 4:
            for i in range(stride):
                a = line[i - bpp] if i >= bpp else 0
                b = prev[i]
                c = prev[i - bpp] if i >= bpp else 0
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 0xFF
        out[y * stride:(y + 1) * stride] = line
        prev = line
    return width, height, bpp, out


def _chunk(tag, data):
    c = struct.pack(">I", len(data)) + tag + data
    return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def save(path, width, height, bpp, pixels):
    stride = width * bpp
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        raw += pixels[y * stride:(y + 1) * stride]
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2 if bpp == 3 else 6, 0, 0, 0)
    out = (b"\x89PNG\r\n\x1a\n" + _chunk(b"IHDR", ihdr)
           + _chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + _chunk(b"IEND", b""))
    open(path, "wb").write(out)


def resize(src, dst, new_w, new_h=None):
    new_h = new_h or new_w
    w, h, bpp, px = load(src)
    stride = w * bpp
    out = bytearray(new_w * new_h * bpp)
    for y in range(new_h):
        sy = min(int(y * h / new_h), h - 1)
        for x in range(new_w):
            sx = min(int(x * w / new_w), w - 1)
            o = y * new_w * bpp + x * bpp
            s = sy * stride + sx * bpp
            out[o:o + bpp] = px[s:s + bpp]
    save(dst, new_w, new_h, bpp, out)
    print(f"{dst}: {new_w}x{new_h}")


if __name__ == "__main__":
    import sys
    resize(sys.argv[1], sys.argv[2], int(sys.argv[3]))
