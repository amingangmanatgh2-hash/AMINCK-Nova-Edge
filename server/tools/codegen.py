#!/usr/bin/env python3
"""
Codegen: extract per-version Minecraft protocol data from PrismarineJS/minecraft-data
and emit compact JSON modules consumed by the AMINCK Nova server runtime.

Output: <repo>/server/data/protocols/p<proto>.json  +  index.json

Usage:
  python3 tools/codegen.py /path/to/minecraft-data/repo /path/to/output
"""
import json, os, sys, math

# ─────────────────────────────────────────────────────────────────────────────
# Protocol → (data key in dataPaths) canonical mapping. data key selects which
# version directory's data is used for a given protocol number.
# ─────────────────────────────────────────────────────────────────────────────
PROTO_KEYS = {
    47: "1.8",
    107: "1.9",
    108: "1.9.2",
    109: "1.9.2",
    110: "1.9.4",
    210: "1.10.2",
    315: "1.11.2",
    316: "1.11.2",
    335: "1.12.2",
    338: "1.12.2",
    340: "1.12.2",
    393: "1.13.2",
    401: "1.13.2",
    404: "1.13.2",
    477: "1.14.4",
    480: "1.14.4",
    485: "1.14.4",
    490: "1.14.4",
    498: "1.14.4",
    573: "1.15.2",
    575: "1.15.2",
    578: "1.15.2",
    735: "1.16.5",
    736: "1.16.5",
    751: "1.16.5",
    753: "1.16.5",
    754: "1.16.5",
    755: "1.17.1",
    756: "1.17.1",
    757: "1.18.2",
    758: "1.18.2",
    759: "1.19.4",
    760: "1.19.4",
    761: "1.19.4",
    762: "1.19.4",
    763: "1.20.1",
    764: "1.20.2",
    765: "1.20.4",
    766: "1.20.6",
    767: "1.21.1",
    768: "1.21.3",
    769: "1.21.4",
    770: "1.21.5",
    771: "1.21.6",
    772: "1.21.8",
    773: "1.21.9",
    774: "1.21.11",
    775: "26.1",
    776: "26.1",   # 26.2 not yet in dataset; reuse 26.1 layout
}

VERSION_NAMES = {
    47: "1.8.x", 107: "1.9", 108: "1.9.1", 109: "1.9.2", 110: "1.9.4",
    210: "1.10.x", 315: "1.11", 316: "1.11.x", 335: "1.12", 338: "1.12.1",
    340: "1.12.2", 393: "1.13", 401: "1.13.1", 404: "1.13.2",
    477: "1.14", 480: "1.14.1", 485: "1.14.2", 490: "1.14.3", 498: "1.14.4",
    573: "1.15", 575: "1.15.1", 578: "1.15.2",
    735: "1.16", 736: "1.16.1", 751: "1.16.2", 753: "1.16.3", 754: "1.16.4/5",
    755: "1.17", 756: "1.17.1", 757: "1.18/1.18.1", 758: "1.18.2",
    759: "1.19", 760: "1.19.2", 761: "1.19.3", 762: "1.19.4",
    763: "1.20/1.20.1", 764: "1.20.2", 765: "1.20.3/4", 766: "1.20.5/6",
    767: "1.21/1.21.1", 768: "1.21.2/3", 769: "1.21.4", 770: "1.21.5",
    771: "1.21.6", 772: "1.21.7/8", 773: "1.21.9/10", 774: "1.21.11",
    775: "26.1", 776: "26.2",
}


def needed_bits(n):
    if n <= 1:
        return 1
    return (n - 1).bit_length()


def chunk_meta(proto):
    m = {"no_size_prefix": False, "has_fluid": False, "trust_edges": False,
         "biomes_in_section": False, "block_count_field": False,
         "light_in_section": False, "biome_bytes": 1, "biomes_packet_field": False,
         "min_y": 0, "height": 256, "bitmap_field": False}
    if proto == 47:
        m["format"] = "pre17"
    elif proto < 393:
        m["format"] = "legacy_palette"
        m["block_count_field"] = True
        m["light_in_section"] = True
    elif proto < 477:
        m["format"] = "p113"
        m["light_in_section"] = True
        m["biome_bytes"] = 4
    elif proto < 735:
        m["format"] = "p114"
        m["block_count_field"] = True
        m["biome_bytes"] = 4
    elif proto < 755:
        m["format"] = "p116"
        m["block_count_field"] = True
        m["biomes_packet_field"] = True
    elif proto < 757:
        m["format"] = "p117"
        m["block_count_field"] = True
        m["biomes_packet_field"] = True
        m["bitmap_field"] = True
    else:
        m["format"] = "p118"
        m["block_count_field"] = True
        m["biomes_in_section"] = True
        m["min_y"] = -64
        m["height"] = 384
        m["trust_edges"] = proto < 764
        m["no_size_prefix"] = proto >= 770
        m["has_fluid"] = proto >= 775
    m["num_sections"] = m["height"] // 16
    return m


def main(src, out):
    dp = json.load(open(os.path.join(src, "data", "dataPaths.json")))["pc"]

    def read(v, kind):
        path = dp[v].get(kind)
        if not path:
            return None
        p = os.path.join(src, "data", path, kind + ".json")
        if not os.path.exists(p):
            return None
        return json.load(open(p))

    def version_info(key):
        return read(key, "version")

    def packets(d):
        """Return {state: {dir: {name: id}}} for toClient/toServer."""
        out = {}
        for state in ("handshaking", "status", "login", "configuration", "play"):
            st = d.get(state)
            if not st:
                continue
            out[state] = {}
            for direction in ("toClient", "toServer"):
                t = st.get(direction)
                if not t:
                    continue
                p = t.get("types", {}).get("packet")
                if isinstance(p, list) and p and p[0] == "container":
                    mp = p[1][0]["type"][1]["mappings"]
                    ids = {}
                    for hexid, name in mp.items():
                        ids[name] = int(hexid, 16)
                    out[state][direction] = ids
        return out

    def merged_types(d):
        """Merge root types + CLIENTBOUND per-state types into one namespace.

        We only encode clientbound packets, so serverbound types are dropped to
        avoid name collisions (e.g. 'packet_chat' exists in both directions).
        """
        merged = {}
        merged.update(d.get("types", {}))
        for state in ("handshaking", "status", "login", "configuration", "play"):
            st = d.get(state)
            if not st:
                continue
            t = st.get("toClient")
            if t:
                merged.update(t.get("types", {}))
        return merged

    index = {}
    for proto, key in PROTO_KEYS.items():
        vinfo = version_info(key)
        if vinfo is None:
            print(f"!! missing version.json for {key} (proto {proto})", file=sys.stderr)
            continue
        protocol = proto
        d = read(key, "protocol")
        if d is None:
            print(f"!! missing protocol.json for {key}", file=sys.stderr)
            continue
        pkts = packets(d)
        types = merged_types(d)
        lp = read(key, "loginPacket")

        blocks = read(key, "blocks")
        block_map = {}
        max_state = 0
        if blocks:
            for b in blocks:
                name = b.get("name")
                if not name:
                    continue
                if "defaultState" in b:
                    mn = b["minStateId"]; mx = b["maxStateId"]; df = b["defaultState"]
                else:
                    bid = b.get("id", 0)
                    mn = bid << 4
                    metas = [v.get("metadata", 0) for v in b.get("variations", [])]
                    mx = (bid << 4) | (max(metas) if metas else 15)
                    df = mn
                block_map[name] = [mn, mx, df]
                if mx > max_state:
                    max_state = mx

        biomes = read(key, "biomes")
        biome_map = {}
        if biomes:
            for b in biomes:
                biome_map[b.get("name")] = b.get("id")

        items = read(key, "items")
        item_map = {}
        if items:
            if isinstance(items, dict):
                # some versions store as dict name -> {id}
                for name, v in items.items():
                    if isinstance(v, dict) and "id" in v:
                        item_map[name] = v["id"]
                    elif isinstance(v, int):
                        item_map[name] = v
            else:
                for it in items:
                    item_map[it.get("name")] = it.get("id")

        entities = read(key, "entities")
        player_entity_id = 1
        if entities:
            for e in entities:
                if e.get("name") == "player":
                    player_entity_id = e.get("id", 1)
                    break

        # entity metadata info
        rt = d.get("types", {})
        meta = {}
        em = rt.get("entityMetadata")
        if isinstance(em, list) and em and em[0] == "entityMetadataLoop":
            meta["end_val"] = em[1].get("endVal", 255)
            inner = em[1]["type"]
            # inner is container of [key/type, value]
            meta["entry"] = inner
        item_t = rt.get("entityMetadataItem")
        if item_t is not None:
            meta["item_type"] = item_t

        cm = chunk_meta(proto)
        cm["max_bits_block"] = needed_bits(max_state)

        rec = {
            "proto": proto,
            "protocol": protocol,
            "minecraft_version": VERSION_NAMES.get(proto, vinfo.get("minecraftVersion")),
            "data_key": key,
            "chunk": cm,
            "s2c": {s: pkts[s].get("toClient", {}) for s in pkts},
            "c2s": {s: pkts[s].get("toServer", {}) for s in pkts},
            "types": types,
            "login_template": lp,
            "blocks": block_map,
            "block_max_state": max_state,
            "biomes": biome_map,
            "items": item_map,
            "player_entity_id": player_entity_id,
            "metadata": meta,
        }
        os.makedirs(out, exist_ok=True)
        fn = os.path.join(out, f"p{proto}.json")
        with open(fn, "w") as f:
            json.dump(rec, f, separators=(",", ":"))
        index[proto] = {
            "file": f"p{proto}.json",
            "minecraft_version": rec["minecraft_version"],
            "data_key": key,
            "chunk_format": cm["format"],
            "has_config": "configuration" in pkts and bool(pkts["configuration"].get("toClient")),
        }
        print(f"  proto {proto:4d}  {rec['minecraft_version']:14s} -> {fn}")

    with open(os.path.join(out, "index.json"), "w") as f:
        json.dump(index, f, indent=1, sort_keys=True)
    print(f"\nwrote {len(index)} protocols -> {out}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    main(sys.argv[1], sys.argv[2])
