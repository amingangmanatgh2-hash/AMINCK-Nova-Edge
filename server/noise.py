"""Small seeded noise utilities (value noise + fBm) for procedural terrain.

Pure Python, no dependencies. Deterministic per (seed, coords).
"""
import math
import random


def _hash2(x, y, seed):
    # integer hash -> [0,1)
    h = (x * 374761393 + y * 668265263 + seed * 1442695040888963407) & 0xFFFFFFFFFFFFFFFF
    h = (h ^ (h >> 13)) * 1274126177 & 0xFFFFFFFFFFFFFFFF
    h ^= h >> 31
    return (h & 0xFFFFFF) / 0xFFFFFF


def _smooth(t):
    return t * t * (3 - 2 * t)


def value_noise(x, y, seed):
    """Smooth 2D value noise in [0,1)."""
    x0, y0 = math.floor(x), math.floor(y)
    fx, fy = x - x0, y - y0
    v00 = _hash2(x0, y0, seed)
    v10 = _hash2(x0 + 1, y0, seed)
    v01 = _hash2(x0, y0 + 1, seed)
    v11 = _hash2(x0 + 1, y0 + 1, seed)
    sx, sy = _smooth(fx), _smooth(fy)
    a = v00 + (v10 - v00) * sx
    b = v01 + (v11 - v01) * sx
    return a + (b - a) * sy


def fbm(x, y, seed, octaves=4, lacunarity=2.0, gain=0.5):
    """Fractal Brownian motion; output roughly in [0,1)."""
    total = 0.0
    amp = 1.0
    freq = 1.0
    norm = 0.0
    for _ in range(octaves):
        total += value_noise(x * freq, y * freq, seed + _) * amp
        norm += amp
        amp *= gain
        freq *= lacunarity
    return total / norm if norm else 0.0


def ridged(x, y, seed, octaves=4):
    """Ridged multifractal (mountain-like) in [0,1)."""
    return 1.0 - abs(2.0 * fbm(x, y, seed, octaves) - 1.0)


class RNG:
    """Deterministic per-world RNG so maps are reproducible."""

    def __init__(self, seed):
        self.rng = random.Random(seed)

    def uniform(self, a, b):
        return self.rng.uniform(a, b)

    def randint(self, a, b):
        return self.rng.randint(a, b)

    def choice(self, seq):
        return self.rng.choice(seq)

    def chance(self, p):
        return self.rng.random() < p
