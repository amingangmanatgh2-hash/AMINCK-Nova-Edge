"""Protocol data loader — lazy per-protocol JSON."""
import json, os, threading

_DIR = os.path.dirname(os.path.abspath(__file__))
_PROTOS = os.path.join(_DIR, "protocols")

_lock = threading.Lock()
_cache = {}


def index():
    with open(os.path.join(_PROTOS, "index.json")) as f:
        return json.load(f)


def load(proto):
    """Load protocol data (cached). Returns dict or None."""
    proto = int(proto)
    with _lock:
        if proto in _cache:
            return _cache[proto]
    fn = os.path.join(_PROTOS, f"p{proto}.json")
    if not os.path.exists(fn):
        return None
    with open(fn) as f:
        data = json.load(f)
    with _lock:
        _cache[proto] = data
    return data


def supported():
    return sorted(int(k) for k in index().keys())


def nearest(proto):
    """Closest supported protocol (<= requested)."""
    idx = index()
    protos = sorted(int(k) for k in idx.keys())
    best = None
    for p in protos:
        if p <= proto:
            best = p
    return best
