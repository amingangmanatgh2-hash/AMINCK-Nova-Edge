"""Economy, ranks, kits, homes/warps, XP/levels, quests, codes & orders.

Persisted to a JSON file (STATE_PATH, default `state.json` next to the package).
The GameServer owns one Economy instance; this module never imports game.* so
there are no cycles — it calls back into `game` methods at runtime only.
"""
import json
import os
import random
import string
import time
import threading

DEFAULT_STATE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "state.json")

# ── ranks ────────────────────────────────────────────────────────────────────
RANKS = {
    "player":   {"color": "§7", "label": "Player",   "fly": False, "coin_mult": 1.0, "kits": [], "price": 0},
    "vip":      {"color": "§a", "label": "VIP",      "fly": False, "coin_mult": 1.25, "kits": ["knight"], "price": 2500},
    "mvp":      {"color": "§b", "label": "MVP",      "fly": True,  "coin_mult": 1.5,  "kits": ["knight", "archer"], "price": 6000},
    "legend":   {"color": "§6", "label": "Legend",   "fly": True,  "coin_mult": 2.0,  "kits": ["knight", "archer", "tank"], "price": 15000},
    "god":      {"color": "§d", "label": "God",      "fly": True,  "coin_mult": 3.0,  "kits": ["knight", "archer", "tank", "berserker"], "price": 40000},
}

# ── kits ─────────────────────────────────────────────────────────────────────
KITS = {
    "knight":   [("iron_sword", 1), ("bread", 8)],
    "archer":   [("bow", 1), ("arrow", 24), ("leather_chestplate", 1)],
    "tank":     [("iron_sword", 1), ("golden_apple", 4), ("iron_chestplate", 1)],
    "berserker": [("diamond_sword", 1), ("golden_apple", 6)],
    "builder":  [("stone", 64), ("oak_planks", 64), ("ladder", 16)],
}

# ── catalog (in-game coin shop + site shop share these ids) ─────────────────
CATALOG = [
    {"id": "coins_1000", "type": "coins", "amount": 1000, "name": "۱۰۰۰ سکه", "price_coins": None, "price_toman": 20000},
    {"id": "coins_5000", "type": "coins", "amount": 5000, "name": "۵۰۰۰ سکه", "price_coins": None, "price_toman": 80000},
    {"id": "rank_vip", "type": "rank", "rank": "vip", "name": "رنک VIP", "price_coins": 2500, "price_toman": 50000},
    {"id": "rank_mvp", "type": "rank", "rank": "mvp", "name": "رنک MVP", "price_coins": 6000, "price_toman": 120000},
    {"id": "rank_legend", "type": "rank", "rank": "legend", "name": "رنک Legend", "price_coins": 15000, "price_toman": 300000},
    {"id": "rank_god", "type": "rank", "rank": "god", "name": "رنک God", "price_coins": 40000, "price_toman": 700000},
    {"id": "kit_builder", "type": "kit", "kit": "builder", "name": "کیت Builder", "price_coins": 800, "price_toman": 25000},
]

CATALOG_BY_ID = {c["id"]: c for c in CATALOG}

# Pristine copy of the built-in catalog. Admin edits (add/remove/price) are
# stored as overrides in state.json and re-applied on boot by rebuild_catalog,
# so the shop survives restarts without mutating the defaults in the source.
BASE_CATALOG = [dict(c) for c in CATALOG]


def rebuild_catalog(extra):
    """Rebuild CATALOG / CATALOG_BY_ID in place from BASE_CATALOG + overrides.

    `extra` entries are either `{"removed": True, "id": ...}` tombstones or
    full item dicts added/overridden by the admin panel.
    """
    extra = extra or []
    removed = {e.get("id") for e in extra if e.get("removed")}
    added = []
    for e in extra:
        if e.get("removed"):
            continue
        item = {k: v for k, v in e.items() if k != "removed"}
        if item.get("id"):
            added.append(item)
    overridden = {a["id"] for a in added}
    CATALOG[:] = ([dict(c) for c in BASE_CATALOG
                   if c["id"] not in removed and c["id"] not in overridden] + added)
    CATALOG_BY_ID.clear()
    CATALOG_BY_ID.update({c["id"]: c for c in CATALOG})
    return CATALOG

# XP: xp needed to go from level L to L+1
def xp_for_level(level):
    return 100 + (level - 1) * 50


def level_for_xp(xp):
    level = 1
    while xp >= xp_for_level(level):
        xp -= xp_for_level(level)
        level += 1
    return level


def gen_code(n=8):
    alphabet = string.ascii_uppercase + string.digits
    return "".join(random.choice(alphabet) for _ in range(n))


def _now():
    return int(time.time())


class Economy:
    def __init__(self, game, path=None):
        self.game = game
        self.path = path or os.environ.get("STATE_PATH") or DEFAULT_STATE_PATH
        self.data = {"players": {}, "warps": {}, "codes": {}, "orders": {},
                     "catalog_extra": [], "payment": {}, "config": {}}
        self._lock = threading.Lock()
        self.load()

    # ── persistence ─────────────────────────────────────────────────────────
    def load(self):
        try:
            with open(self.path) as f:
                d = json.load(f)
            self.data.update(d)
            self.data.setdefault("players", {})
            self.data.setdefault("warps", {})
            self.data.setdefault("codes", {})
            self.data.setdefault("orders", {})
            self.data.setdefault("catalog_extra", [])
            self.data.setdefault("payment", {})
            self.data.setdefault("config", {})
        except Exception:
            pass
        # re-apply admin shop edits so /site and /shop match what was saved
        rebuild_catalog(self.data.get("catalog_extra", []))

    def save(self):
        try:
            tmp = self.path + ".tmp"
            with open(tmp, "w") as f:
                json.dump(self.data, f, ensure_ascii=False)
            os.replace(tmp, self.path)
        except Exception:
            pass

    # ── player record ───────────────────────────────────────────────────────
    def get(self, name):
        key = name.lower()
        rec = self.data["players"].get(key)
        if rec is None:
            rec = {
                "coins": 100, "xp": 0, "kills": 0, "deaths": 0,
                "rank": "player", "homes": {}, "muted_until": 0,
                "banned": False, "first_join": _now(), "playtime": 0,
                "quest_progress": {}, "quest_day": "",
            }
            self.data["players"][key] = rec
        return rec

    def set(self, name, key, value):
        rec = self.get(name)
        rec[key] = value
        self.save()

    # ── coins / xp / kills ──────────────────────────────────────────────────
    def coins(self, name):
        return self.get(name)["coins"]

    def add_coins(self, name, amount):
        rec = self.get(name)
        mult = RANKS.get(rec["rank"], RANKS["player"])["coin_mult"]
        rec["coins"] = int(rec["coins"] + amount * mult)
        self.save()
        return rec["coins"]

    def spend(self, name, amount):
        rec = self.get(name)
        if rec["coins"] < amount:
            return False
        rec["coins"] -= amount
        self.save()
        return True

    def add_xp(self, name, amount):
        rec = self.get(name)
        before = level_for_xp(rec["xp"])
        rec["xp"] += amount
        after = level_for_xp(rec["xp"])
        self.save()
        return after - before  # levels gained

    def xp(self, name):
        return self.get(name)["xp"]

    def level(self, name):
        return level_for_xp(self.get(name)["xp"])

    def add_kill(self, name):
        rec = self.get(name)
        rec["kills"] += 1
        self.save()

    def add_death(self, name):
        rec = self.get(name)
        rec["deaths"] += 1
        self.save()

    def stats(self, name):
        rec = self.get(name)
        return {"coins": rec["coins"], "xp": rec["xp"], "level": level_for_xp(rec["xp"]),
                "kills": rec["kills"], "deaths": rec["deaths"], "rank": rec["rank"]}

    # ── inventory (persisted across sessions) ───────────────────────────────
    def inventory(self, name):
        return dict(self.get(name).get("inventory", {}))

    def set_inventory(self, name, inv):
        rec = self.get(name)
        rec["inventory"] = dict(inv or {})
        self.save()

    # ── rank ────────────────────────────────────────────────────────────────
    def rank(self, name):
        return self.get(name)["rank"]

    def rank_info(self, name):
        return RANKS.get(self.get(name)["rank"], RANKS["player"])

    def set_rank(self, name, rank):
        if rank not in RANKS:
            return False
        self.set(name, "rank", rank)
        return True

    # ── homes / warps ───────────────────────────────────────────────────────
    def set_home(self, name, home_name, pos):
        rec = self.get(name)
        if len(rec["homes"]) >= 10 and home_name not in rec["homes"]:
            return False
        rec["homes"][home_name] = pos
        self.save()
        return True

    def home(self, name, home_name):
        return self.get(name)["homes"].get(home_name)

    def homes(self, name):
        return self.get(name)["homes"]

    def del_home(self, name, home_name):
        rec = self.get(name)
        if home_name in rec["homes"]:
            del rec["homes"][home_name]
            self.save()
            return True
        return False

    def set_warp(self, warp_name, pos):
        self.data["warps"][warp_name] = pos
        self.save()

    def warp(self, warp_name):
        return self.data["warps"].get(warp_name)

    def warps(self):
        return self.data["warps"]

    def del_warp(self, warp_name):
        if warp_name in self.data["warps"]:
            del self.data["warps"][warp_name]
            self.save()
            return True
        return False

    # ── moderation ──────────────────────────────────────────────────────────
    def mute(self, name, seconds):
        self.set(name, "muted_until", _now() + seconds)

    def unmute(self, name):
        self.set(name, "muted_until", 0)

    def is_muted(self, name):
        rec = self.get(name)
        return rec["muted_until"] > _now()

    def ban(self, name):
        self.set(name, "banned", True)

    def unban(self, name):
        self.set(name, "banned", False)

    def is_banned(self, name):
        return self.get(name).get("banned", False)

    # ── activation codes ────────────────────────────────────────────────────
    def create_code(self, reward_type, reward_value, uses=1):
        """reward_type: 'rank' | 'coins' | 'kit'. Returns the code string."""
        code = gen_code()
        self.data["codes"][code] = {
            "type": reward_type, "value": reward_value, "uses": uses,
            "created_by": "admin", "created": _now(),
        }
        self.save()
        return code

    def redeem_code(self, name, code):
        code = code.strip().upper()
        entry = self.data["codes"].get(code)
        if not entry or entry["uses"] <= 0:
            return None
        reward = (entry["type"], entry["value"])
        entry["uses"] -= 1
        if entry["uses"] <= 0:
            del self.data["codes"][code]
        self.save()
        self._apply_reward(name, *reward)
        return reward

    def _apply_reward(self, name, rtype, value):
        if rtype == "rank":
            self.set_rank(name, value)
        elif rtype == "coins":
            self.add_coins(name, value)
        elif rtype == "kit":
            pass  # kit unlock flag; kits are per-rank only for now

    def codes(self):
        return self.data["codes"]

    # ── orders (site purchases) ─────────────────────────────────────────────
    def create_order(self, item_id, buyer=""):
        item = CATALOG_BY_ID.get(item_id)
        if not item:
            return None
        oid = "ORD-" + gen_code(6)
        self.data["orders"][oid] = {
            "id": oid, "item": item_id, "buyer": buyer or "guest",
            "status": "pending", "created": _now(),
        }
        self.save()
        return oid

    def resolve_order(self, oid, gateway_ref=""):
        """Mark an order paid and issue an activation code."""
        order = self.data["orders"].get(oid)
        if not order:
            return None
        item = CATALOG_BY_ID.get(order["item"])
        order["status"] = "paid"
        order["gateway_ref"] = gateway_ref
        code = None
        if item:
            if item["type"] == "coins":
                code = self.create_code("coins", item["amount"])
            elif item["type"] == "rank":
                code = self.create_code("rank", item["rank"])
            elif item["type"] == "kit":
                code = self.create_code("kit", item["kit"])
        order["code"] = code
        self.save()
        return code

    def orders(self):
        return self.data["orders"]

    # ── admin-managed shop catalog & payment details ────────────────────────
    def catalog(self):
        """Live catalog (built-ins + persisted admin overrides)."""
        return list(CATALOG)

    def catalog_add(self, entry):
        """Add or replace a shop item. Persists and rebuilds the live catalog."""
        item = dict(entry or {})
        iid = str(item.get("id") or "").strip()
        if not iid:
            return None
        item["id"] = iid
        item.setdefault("name", iid)
        item.setdefault("type", "coins")
        item["price_toman"] = int(item.get("price_toman") or 0)
        if item.get("price_coins") is not None:
            try:
                item["price_coins"] = int(item["price_coins"])
            except (TypeError, ValueError):
                item["price_coins"] = None
        extra = [e for e in self.data["catalog_extra"]
                 if not (e.get("id") == iid)]
        extra.append(item)
        self.data["catalog_extra"] = extra
        rebuild_catalog(extra)
        self.save()
        return item

    def catalog_remove(self, item_id):
        """Remove an item (tombstoned so a restart does not restore it)."""
        item_id = str(item_id or "").strip()
        if not item_id:
            return False
        extra = [e for e in self.data["catalog_extra"] if e.get("id") != item_id]
        extra.append({"id": item_id, "removed": True})
        self.data["catalog_extra"] = extra
        rebuild_catalog(extra)
        self.save()
        return True

    def payment(self):
        """Payment details shown on /site; admin overrides beat env config."""
        saved = self.data.get("payment") or {}
        cfg = getattr(self.game, "cfg", {}) or {}
        return {
            "card": saved.get("card", cfg.get("payment_card", "")) or "",
            "card_holder": saved.get("card_holder",
                                     cfg.get("payment_card_holder", "")) or "",
            "note": saved.get("note", cfg.get("payment_note", "")) or "",
        }

    def set_payment(self, card=None, card_holder=None, note=None):
        cur = self.data.get("payment") or {}
        if card is not None:
            cur["card"] = str(card)[:40]
        if card_holder is not None:
            cur["card_holder"] = str(card_holder)[:60]
        if note is not None:
            cur["note"] = str(note)[:200]
        self.data["payment"] = cur
        self.save()
        return self.payment()

    def set_coins(self, name, amount):
        """Set an exact coin balance (bypasses the rank multiplier)."""
        rec = self.get(name)
        rec["coins"] = max(0, int(amount))
        self.save()
        return rec["coins"]
