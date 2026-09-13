"""Auto-generate the server icon with Workers AI from the server name.

Priority: Workers AI (via AI Gateway / REST token / companion Worker), then a
pure-Python procedural icon so the server *always* has a valid 64x64 PNG —
exactly what Minecraft expects for the status ping ``favicon`` field.
"""
import base64
import io
import os
import struct
import zlib

from .ai_client import ai_image


def _prompt(name):
    return (
        f"Epic Minecraft server logo icon, cubic voxel style, the word '{name}' "
        f"as a bold 3D blocky golden title on a dark navy background, glowing "
        f"blue and gold accents, floating cubes, dramatic lighting, high detail, "
        f"game art, square 1:1"
    )


# ── pure-python procedural fallback (always works, no network) ─────────────
def _fallback_png(name, size=64):
    """A deterministic gradient + block-letter initials icon as PNG bytes."""
    # 6x6 pixel-art font for A-Z0-9 (each glyph is a list of 6 rows of 6 bits)
    _font = {
        "A": [0x0E, 0x11, 0x11, 0x1F, 0x11, 0x11], "B": [0x1E, 0x11, 0x1E, 0x11, 0x11, 0x1E],
        "C": [0x0E, 0x11, 0x10, 0x10, 0x11, 0x0E], "D": [0x1C, 0x12, 0x11, 0x11, 0x12, 0x1C],
        "E": [0x1F, 0x10, 0x1E, 0x10, 0x10, 0x1F], "F": [0x1F, 0x10, 0x1E, 0x10, 0x10, 0x10],
        "G": [0x0E, 0x11, 0x10, 0x17, 0x11, 0x0F], "H": [0x11, 0x11, 0x1F, 0x11, 0x11, 0x11],
        "I": [0x1F, 0x04, 0x04, 0x04, 0x04, 0x1F], "J": [0x07, 0x02, 0x02, 0x02, 0x12, 0x0C],
        "K": [0x11, 0x12, 0x1C, 0x12, 0x11, 0x11], "L": [0x10, 0x10, 0x10, 0x10, 0x10, 0x1F],
        "M": [0x11, 0x1B, 0x15, 0x11, 0x11, 0x11], "N": [0x11, 0x19, 0x15, 0x13, 0x11, 0x11],
        "O": [0x0E, 0x11, 0x11, 0x11, 0x11, 0x0E], "P": [0x1E, 0x11, 0x11, 0x1E, 0x10, 0x10],
        "Q": [0x0E, 0x11, 0x11, 0x15, 0x12, 0x0D], "R": [0x1E, 0x11, 0x1E, 0x14, 0x12, 0x11],
        "S": [0x0F, 0x10, 0x0E, 0x01, 0x11, 0x0E], "T": [0x1F, 0x04, 0x04, 0x04, 0x04, 0x04],
        "U": [0x11, 0x11, 0x11, 0x11, 0x11, 0x0E], "V": [0x11, 0x11, 0x11, 0x11, 0x0A, 0x04],
        "W": [0x11, 0x11, 0x11, 0x15, 0x1B, 0x11], "X": [0x11, 0x11, 0x0A, 0x0A, 0x11, 0x11],
        "Y": [0x11, 0x11, 0x0A, 0x04, 0x04, 0x04], "Z": [0x1F, 0x01, 0x02, 0x04, 0x08, 0x1F],
        "0": [0x0E, 0x13, 0x15, 0x19, 0x11, 0x0E], "1": [0x04, 0x0C, 0x04, 0x04, 0x04, 0x0E],
        "2": [0x0E, 0x11, 0x01, 0x02, 0x04, 0x1F], "3": [0x1E, 0x01, 0x06, 0x01, 0x11, 0x0E],
        "4": [0x02, 0x06, 0x0A, 0x1F, 0x02, 0x02], "5": [0x1F, 0x10, 0x1E, 0x01, 0x11, 0x0E],
        "6": [0x06, 0x08, 0x1E, 0x11, 0x11, 0x0E], "7": [0x1F, 0x01, 0x02, 0x04, 0x08, 0x08],
        "8": [0x0E, 0x11, 0x0E, 0x11, 0x11, 0x0E], "9": [0x0E, 0x11, 0x0F, 0x01, 0x02, 0x0C],
    }
    px = [[(0, 0, 0, 0)] * size for _ in range(size)]
    # vertical gold->deep-blue gradient
    for y in range(size):
        t = y / (size - 1)
        r = int(24 + (255 - 24) * t * 0.35)
        g = int(26 + (215 - 26) * t * 0.5)
        b = int(52 + (106 - 52) * t)
        for x in range(size):
            px[y][x] = (r, g, b, 255)
    # initials (up to 2 chars)
    words = "".join(c for c in name.upper() if c.isalnum() or c == " ").split()
    initials = "".join(w[0] for w in words)[:2] or "AN"
    glyphs = [_font.get(c) for c in initials if c in _font]
    gw = 6
    gap = 2
    total = len(glyphs) * gw + (len(glyphs) - 1) * gap
    ox = (size - total) // 2
    oy = (size - 6) // 2
    for g, glyph in enumerate(glyphs):
        for gy in range(6):
            row = glyph[gy]
            for gx in range(6):
                if row & (1 << (5 - gx)):
                    x, y = ox + g * (gw + gap) + gx, oy + gy
                    if 0 <= x < size and 0 <= y < size:
                        # gold with subtle shading
                        shade = 1.0 - (gy * 0.04)
                        px[y][x] = (int(255 * shade), int(215 * shade), int(106 * shade), 255)
    # encode
    raw = bytearray()
    for y in range(size):
        raw.append(0)  # filter none
        for x in range(size):
            raw += bytes(px[y][x][:3])
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
            + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b""))


def _is_png(data):
    return bool(data) and data[:8] == b"\x89PNG\r\n\x1a\n"


def _resize_64(png_bytes):
    """Resize to 64x64 (Minecraft favicon spec). Returns bytes."""
    if not _is_png(png_bytes):
        return png_bytes
    try:
        from .tools.png_tools import load, save
        import tempfile
        src = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
        src.write(png_bytes)
        src.close()
        dst = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
        dst.close()
        w, h, bpp, pixels = load(src.name)
        if (w, h) == (64, 64):
            os.unlink(src.name)
            os.unlink(dst.name)
            return png_bytes
        save(dst.name, 64, 64, bpp, _nearest(pixels, w, h, bpp, 64, 64))
        out = open(dst.name, "rb").read()
        os.unlink(src.name)
        os.unlink(dst.name)
        return out
    except Exception:
        return png_bytes


def _nearest(px, w, h, bpp, nw, nh):
    stride = w * bpp
    out = bytearray(nw * nh * bpp)
    for y in range(nh):
        sy = min(int(y * h / nh), h - 1)
        for x in range(nw):
            sx = min(int(x * w / nw), w - 1)
            o = y * nw * bpp + x * bpp
            s = sy * stride + sx * bpp
            out[o:o + bpp] = px[s:s + bpp]
    return out


def make_icon(account_id, token, name, path, model="@cf/black-forest-labs/flux-1-schnell",
              fallback_url=None, gateway_url=None, gateway_token=None):
    """Generate + cache a 64x64 icon. Returns a PNG data-URI (never None)."""
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return _data_uri(path)

    png = ai_image(account_id, token, _prompt(name), model=model,
                   fallback_url=fallback_url, gateway_url=gateway_url,
                   gateway_token=gateway_token)
    if not png:
        png = _fallback_png(name)
    png = _resize_64(png)

    try:
        with open(path, "wb") as f:
            f.write(png)
    except Exception:
        pass
    return _data_uri(path)


def _data_uri(path):
    try:
        with open(path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode("ascii")
        return "data:image/png;base64," + b64
    except Exception:
        return None
