#!/usr/bin/env python3
"""Build the AMINCK Nova custom resource pack (pure Python, no deps)."""
import os, struct, zlib, zipfile

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(HERE, "AMINCK_Nova_ResourcePack.zip")


def png(width, height, pixel_fn):
    """Encode an RGB PNG. pixel_fn(x, y) -> (r, g, b)."""
    raw = bytearray()
    for y in range(height):
        raw.append(0)  # filter type 0
        for x in range(width):
            r, g, b = pixel_fn(x, y)
            raw += bytes((r, g, b))

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        c += struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        return c

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", ihdr)
            + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
            + chunk(b"IEND", b""))


def panorama(i):
    """Six 512x512 gradient tiles (navy→blue with a moving light streak)."""
    size = 512
    shift = (i * 85) % size

    def px(x, y):
        t = y / size
        r = int(18 + 40 * t)
        g = int(26 + 90 * t)
        b = int(60 + 160 * t)
        # diagonal light streak
        d = abs((x + y) % size - shift)
        if d < 40:
            k = 1 - d / 40
            r = min(255, int(r + 120 * k))
            g = min(255, int(g + 160 * k))
            b = min(255, int(b + 200 * k))
        return (r, g, b)

    return png(size, size, px)


def build():
    splashes = [
        "AMINCK Nova!",
        "amin_ck was here!",
        "1.8 to 26.x, one server!",
        "AI friends inside!",
        "SkyWars? BedWars? /menu!",
        "Pro bots, not cheaters!",
        "Now with 18 gamemodes!",
        "Made with Python on Cloudflare!",
        "Try /companion!",
        "Java + Bedrock!",
    ]
    mcmeta = {
        "pack": {
            "pack_format": 46,
            "supported_formats": {"min_inclusive": 4, "max_inclusive": 86},
            "description": "§6§lAMINCK Nova §r— Custom Server Pack by amin_ck",
        }
    }
    import json as _json
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("pack.mcmeta", _json.dumps(mcmeta, indent=2))
        fav = os.path.join(HERE, "favicon.png")
        if os.path.exists(fav):
            z.write(fav, "pack.png")
        z.writestr("assets/minecraft/texts/splashes.txt", "\n".join(splashes) + "\n")
        for i in range(6):
            z.writestr(
                f"assets/minecraft/textures/gui/title/background/panorama_{i}.png",
                panorama(i))
    print(f"resource pack written: {OUT} ({os.path.getsize(OUT)} bytes)")


if __name__ == "__main__":
    build()
