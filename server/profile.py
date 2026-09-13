"""Per-version protocol profile: packet ids + builders."""
import struct, copy, hashlib
from .varint import Writer
from . import nbt
from .registry import Registry
from .chunk import (encode_update_light, encode_map_chunk_light, encode_chunk_data)
from .pd import PDRuntime

DIM_ID = {"minecraft:overworld": 0, "minecraft:the_nether": -1, "minecraft:the_end": 1}


def offline_uuid(name):
    d = hashlib.md5(("OfflinePlayer:" + name).encode("utf-8")).digest()
    d = bytearray(d)
    d[6] = (d[6] & 0x0F) | 0x30
    d[8] = (d[8] & 0x3F) | 0x80
    hi = struct.unpack(">q", bytes(d[0:8]))[0]
    lo = struct.unpack(">q", bytes(d[8:16]))[0]
    return hi, lo


def _uuid_str(hi, lo):
    h = (hi & 0xFFFFFFFFFFFFFFFF)
    l = (lo & 0xFFFFFFFFFFFFFFFF)
    b = h.to_bytes(8, "big") + l.to_bytes(8, "big")
    return f"{b[0:4].hex()}-{b[4:6].hex()}-{b[6:8].hex()}-{b[8:10].hex()}-{b[10:16].hex()}"


class Profile:
    def __init__(self, proto_data):
        self.proto = proto_data["proto"]
        self.data = proto_data
        self.s2c = proto_data["s2c"]
        self.c2s = proto_data["c2s"]
        self.types = proto_data["types"]
        self.reg = Registry(proto_data)
        self.meta = proto_data["chunk"]
        self.pd = PDRuntime(self.types)
        self.login_tpl = proto_data.get("login_template")
        self.has_config = "configuration" in self.s2c and bool(self.s2c["configuration"])
        self.c2s_rev = {}
        for state, names in self.c2s.items():
            self.c2s_rev[state] = {v: k for k, v in names.items()}
        self.status_json = '{"version":{"name":"AMINCK Nova","protocol":%d},"players":{"max":100,"online":0},"description":{"text":"AMINCK Nova Server"}}' % self.proto

    def set_status_json(self, text):
        self.status_json = text

    def status_response_body(self):
        w = Writer()
        w.string(self.status_json)
        return w.bytes_()

    def login_success_payload(self, name):
        hi, lo = offline_uuid(name)
        if self.proto < 735:
            value = {"uuid": _uuid_str(hi, lo), "username": name}
        elif self.proto < 759:
            value = {"uuid": [hi, lo], "username": name}
        else:
            value = {"uuid": [hi, lo], "username": name, "properties": []}
        return self.pd.enc_packet("packet_success", value)

    # ── ids ───────────────────────────────────────────────────────────────
    def sid(self, state, name):
        return self.s2c.get(state, {}).get(name)

    def cid(self, state, name):
        return self.c2s.get(state, {}).get(name)

    def frame(self, packet_id, payload):
        w = Writer()
        w.varint(packet_id)
        w.raw(payload)
        body = w.bytes_()
        out = Writer()
        out.varint(len(body))
        out.raw(body)
        return out.bytes_()

    def send(self, state, name, payload=b""):
        pid = self.sid(state, name)
        if pid is None:
            raise KeyError(f"no clientbound packet {state}/{name} for proto {self.proto}")
        return self.frame(pid, payload)

    # ── handshake / status ────────────────────────────────────────────────
    def status_response(self, payload_json):
        return self.send("status", "status_response", _enc_string(payload_json))

    def pong(self, payload):
        return self.send("status", "pong", struct.pack(">q", payload))

    # ── login ─────────────────────────────────────────────────────────────
    def login_success(self, name):
        return self.send("login", "success", self.login_success_payload(name))

    def login_disconnect(self, message):
        w = Writer()
        w.string(message)
        return self.send("login", "disconnect", w.bytes_())

    # ── configuration (1.20.2+) ───────────────────────────────────────────
    def config_registry_packets(self):
        """Return list of framed registry_data packets for the config state."""
        if not self.has_config:
            return []
        if self.proto < 766:
            codec = self.login_tpl.get("dimensionCodec")
            w = Writer()
            w.raw(nbt.encode_anon(codec))
            return [self.send("configuration", "registry_data", w.bytes_())]
        out = []
        codec = self.login_tpl.get("dimensionCodec", {})
        for registry_name, reg in codec.items():
            entries = []
            for e in reg.get("entries", []):
                entries.append({"key": e["key"], "value": e["value"]})
            w = Writer()
            w.string(registry_name)
            w.varint(len(entries))
            for e in entries:
                w.string(e["key"])
                if e["value"] is None:
                    w.bool(False)
                else:
                    w.bool(True)
                    w.raw(nbt.encode_anon(e["value"]))
            out.append(self.send("configuration", "registry_data", w.bytes_()))
        return out

    def config_feature_flags(self):
        if not self.has_config or self.sid("configuration", "feature_flags") is None:
            return None
        w = Writer()
        w.varint(0)
        return self.send("configuration", "feature_flags", w.bytes_())

    def config_select_known_packs(self):
        if not self.has_config or self.sid("configuration", "select_known_packs") is None:
            return None
        w = Writer()
        w.varint(0)
        return self.send("configuration", "select_known_packs", w.bytes_())

    def config_finish(self):
        if not self.has_config or self.sid("configuration", "finish_configuration") is None:
            return None
        return self.send("configuration", "finish_configuration", b"")

    # ── play: login (join game) ───────────────────────────────────────────
    def join_game(self, entity_id, gamemode, name, hardcore=False):
        p = self.proto
        if self.login_tpl is not None and p >= 735:
            tpl = copy.deepcopy(self.login_tpl)
            tpl["entityId"] = entity_id
            tpl["isHardcore"] = hardcore
            if "gameMode" in tpl:
                tpl["gameMode"] = gamemode
            if "previousGameMode" in tpl:
                tpl["previousGameMode"] = 255 if not hardcore else 0
            if "worldName" in tpl:
                tpl["worldName"] = name
            if "worldType" in tpl:
                tpl["worldType"] = "minecraft:overworld"
            if "hashedSeed" in tpl:
                tpl["hashedSeed"] = [0, 0]
            if "dimension" in tpl and isinstance(tpl["dimension"], dict):
                pass  # keep template dimension
            if "worldState" in tpl:
                ws = tpl["worldState"]
                if isinstance(ws, dict):
                    ws["gamemode"] = {0: "survival", 1: "creative", 2: "adventure", 3: "spectator"}[gamemode]
            payload = self.pd.enc_packet("packet_login", tpl)
            return self.send("play", "login", payload)
        # legacy (< 1.16): hand-encode
        w = Writer()
        w.i32(entity_id)
        if p < 477:
            w.u8(gamemode)
            if p >= 107:
                w.i32(0)      # dimension
            else:
                w.i8(0)
            w.u8(1)           # difficulty
            w.u8(60)          # max players
            w.string("default")
            w.bool(False)     # reduced debug info
        else:
            w.u8(gamemode)
            w.i32(0)          # dimension
            if p >= 575:
                w.i64(0)      # hashed seed
            w.u8(60)          # max players
            w.string("default")
            w.varint(8)       # view distance
            w.bool(False)     # reduced debug
            if p >= 575:
                w.bool(True)  # respawn screen
        return self.send("play", "login", w.bytes_())

    # ── play packets ───────────────────────────────────────────────────────
    def position(self, x, y, z, yaw, pitch, flags=0, teleport_id=0):
        w = Writer()
        w.f64(x); w.f64(y); w.f64(z)
        w.f32(yaw); w.f32(pitch)
        w.i8(flags)
        if self.proto >= 107:
            w.varint(teleport_id)
        return self.send("play", "position", w.bytes_())

    def keep_alive(self, value):
        return self.send("play", "keep_alive", struct.pack(">q", value))

    def system_chat(self, message, overlay=False):
        if self.proto >= 759:
            w = Writer()
            w.string(message)
            w.bool(overlay)
            return self.send("play", "system_chat", w.bytes_())
        w = Writer()
        w.string(message)
        w.i8(1)  # position = system message
        if self.proto >= 735:
            w.i64(0); w.i64(0)  # sender UUID (zero = system)
        return self.send("play", "chat", w.bytes_())

    def action_bar(self, message):
        if self.sid("play", "action_bar") is None:
            return None
        w = Writer()
        w.string(message)
        return self.send("play", "action_bar", w.bytes_())

    def title(self, title=None, subtitle=None, action_bar=None):
        """Return list of packets for title/subtitle."""
        out = []
        if title is not None and self.sid("play", "set_title_text"):
            w = Writer(); w.string(title)
            out.append(self.send("play", "set_title_text", w.bytes_()))
        if subtitle is not None and self.sid("play", "set_title_subtitle"):
            w = Writer(); w.string(subtitle)
            out.append(self.send("play", "set_title_subtitle", w.bytes_()))
        if (title is not None or subtitle is not None) and self.sid("play", "set_title_time"):
            w = Writer(); w.i32(10); w.i32(70); w.i32(20)
            out.append(self.send("play", "set_title_time", w.bytes_()))
        return out

    def player_info_add(self, uuid, name, gamemode=0, ping=0, listed=True):
        p = self.proto
        if p < 761:  # pre-1.19.3 (action based)
            value = {
                "action": "add_player",
                "data": [{
                    "uuid": [uuid[0], uuid[1]],
                    "name": name,
                    "properties": [],
                    "gamemode": gamemode,
                    "ping": ping,
                    "displayName": None,
                }],
            }
            payload = self.pd.enc_packet("packet_player_info", value)
            return self.send("play", "player_info", payload)
        # 1.19.3+ bitflags
        value = {
            "action": {
                "add_player": True,
                "initialize_chat": False,
                "update_game_mode": False,
                "update_listed": True,
                "update_latency": True,
                "update_display_name": False,
            },
            "data": [{
                "uuid": [uuid[0], uuid[1]],
                "player": {"name": name, "properties": []},
                "chatSession": None,
                "gamemode": gamemode,
                "listed": 1 if listed else 0,
                "latency": ping,
                "displayName": None,
            }],
        }
        payload = self.pd.enc_packet("packet_player_info", value)
        return self.send("play", "player_info", payload)

    def player_info_remove(self, uuid):
        p = self.proto
        if p >= 763:
            # 1.19.3+ uses player_remove packet
            w = Writer()
            w.varint(1)
            w.uuid(uuid[0], uuid[1])
            return self.send("play", "player_remove", w.bytes_())
        w = Writer()
        w.varint(4)  # remove_player
        w.varint(1)
        w.uuid(uuid[0], uuid[1])
        return self.send("play", "player_info", w.bytes_())

    def update_health(self, health, food=20, saturation=5.0):
        w = Writer()
        w.f32(health)
        w.varint(food)
        w.f32(saturation)
        return self.send("play", "update_health", w.bytes_())

    def held_item_slot(self, slot):
        if self.proto >= 755:
            w = Writer(); w.varint(slot)
            return self.send("play", "held_item_slot", w.bytes_())
        w = Writer(); w.i8(slot)
        return self.send("play", "held_item_slot", w.bytes_())

    def abilities(self, invulnerable=False, flying=False, allow_flying=True,
                  creative=False, fly_speed=0.05, walk_speed=0.1):
        p = self.proto
        w = Writer()
        flags = 0
        if invulnerable: flags |= 1
        if flying: flags |= 2
        if allow_flying: flags |= 4
        if creative: flags |= 8
        w.i8(flags)
        if p >= 735:
            w.f32(fly_speed); w.f32(walk_speed)
        else:
            w.f32(0.05); w.f32(0.1)
        return self.send("play", "abilities", w.bytes_())

    def update_time(self, world_age, time_of_day):
        if self.proto >= 775:
            # 1.21.6+ (26.x): independent clock updates
            value = {
                "age": world_age,
                "clockUpdates": [
                    {"id": 0, "totalTicks": time_of_day, "partialTick": 0.0, "rate": 20.0},
                ],
            }
            payload = self.pd.enc_packet("packet_update_time", value)
            return self.send("play", "update_time", payload)
        if self.proto >= 770:
            value = {"age": world_age, "time": time_of_day, "tickDayTime": True}
            payload = self.pd.enc_packet("packet_update_time", value)
            return self.send("play", "update_time", payload)
        w = Writer()
        w.i64(world_age); w.i64(time_of_day)
        return self.send("play", "update_time", w.bytes_())

    # ── scoreboard (1.13+) ─────────────────────────────────────────────────
    def scoreboard_objective(self, name, display_name, action=0):
        """action: 0=create, 1=remove, 2=update."""
        if self.proto < 393 or self.sid("play", "scoreboard_objective") is None:
            return None
        if self.proto >= 765:
            value = {"name": name, "action": action,
                     "displayText": nbt.compound(text=nbt.string_(display_name)),
                     "type": 0, "number_format": None}
        else:
            value = {"name": name, "action": action, "displayText": display_name, "type": 0}
        payload = self.pd.enc_packet("packet_scoreboard_objective", value)
        return self.send("play", "scoreboard_objective", payload)

    def scoreboard_display(self, position, name):
        if self.proto < 393 or self.sid("play", "scoreboard_display_objective") is None:
            return None
        payload = self.pd.enc_packet("packet_scoreboard_display_objective",
                                     {"position": position, "name": name})
        return self.send("play", "scoreboard_display_objective", payload)

    def scoreboard_score(self, item_name, objective, value, remove=False):
        if self.proto < 393 or self.sid("play", "scoreboard_score") is None:
            return None
        if self.proto >= 765:
            if remove:
                return self.reset_score(item_name, objective)
            payload = self.pd.enc_packet("packet_scoreboard_score", {
                "itemName": item_name, "scoreName": objective, "value": value,
                "display_name": None, "number_format": None})
            return self.send("play", "scoreboard_score", payload)
        payload = self.pd.enc_packet("packet_scoreboard_score", {
            "itemName": item_name, "action": 1 if remove else 0,
            "scoreName": objective, "value": value})
        return self.send("play", "scoreboard_score", payload)

    def reset_score(self, entity_name, objective_name):
        if self.sid("play", "reset_score") is None:
            return None
        payload = self.pd.enc_packet("packet_reset_score",
                                     {"entity_name": entity_name, "objective_name": objective_name})
        return self.send("play", "reset_score", payload)

    def experience(self, bar, level, total):
        w = Writer()
        w.f32(bar); w.varint(level); w.varint(total)
        return self.send("play", "experience", w.bytes_())

    def set_slot(self, window_id, slot, item_id, count=1):
        if self.proto >= 766:
            # 1.20.5+ item-components slot format (itemCount i8 in 766, varint ≥767)
            if count <= 0:
                value = {"windowId": window_id, "stateId": 0, "slot": slot,
                         "item": {"itemCount": 0}}
            else:
                value = {"windowId": window_id, "stateId": 0, "slot": slot,
                         "item": {"itemCount": count, "itemId": item_id,
                                  "addedComponentCount": 0, "removedComponentCount": 0,
                                  "components": [], "removeComponents": []}}
        else:
            value = {"windowId": window_id, "stateId": 0, "slot": slot,
                     "item": {"present": count > 0, "itemId": item_id,
                              "itemCount": count, "nbt": None}}
        payload = self.pd.enc_packet("packet_set_slot", value)
        return self.send("play", "set_slot", payload)



    def spawn_position(self, x, y, z, angle=0.0):
        w = Writer()
        if self.proto >= 735:
            w.position(x, y, z); w.f32(angle)
        else:
            w.position(x, y, z)
        return self.send("play", "spawn_position", w.bytes_())

    def game_state_change(self, reason, value):
        w = Writer()
        w.u8(reason); w.f32(value)
        return self.send("play", "game_state_change", w.bytes_())

    def block_change(self, x, y, z, state_id):
        w = Writer()
        w.position(x, y, z)
        w.varint(state_id)
        return self.send("play", "block_change", w.bytes_())

    def chunk_packet(self, cx, cz, column, biome="plains"):
        """Framed chunk packet(s) for one column. Returns list of frames."""
        data = encode_chunk_data(self.meta, column, self.reg.biome_id(biome))
        if self.meta["format"] == "pre17":
            w = Writer()
            w.i32(cx); w.i32(cz)
            w.bool(True)          # ground up continuous
            w.u16(0xFFFF)         # primary bit mask (all 16 sections)
            w.varint(len(data)); w.raw(data)
            return [self.send("play", "map_chunk", w.bytes_())]
        if self.meta["format"] == "legacy_palette":
            w = Writer()
            w.i32(cx); w.i32(cz)
            w.bool(True)
            w.varint(0xFFFF)
            w.varint(len(data)); w.raw(data)
            w.varint(0)  # block entities
            return [self.send("play", "map_chunk", w.bytes_())]
        if self.meta["format"] == "p113":
            w = Writer()
            w.i32(cx); w.i32(cz)
            w.bool(True)
            w.varint(0xFFFF)
            w.varint(len(data)); w.raw(data)
            w.varint(0)
            return [self.send("play", "map_chunk", w.bytes_())]
        if self.meta["format"] in ("p114", "p116"):
            hm = _heightmap_bytes(self.proto, column)
            w = Writer()
            w.i32(cx); w.i32(cz)
            w.bool(True)
            w.varint(0xFFFF)
            w.raw(hm)
            if self.meta["format"] == "p116":
                w.varint(1024)
                b = self.reg.biome_id(biome)
                for _ in range(1024):
                    w.varint(b)
            w.varint(len(data)); w.raw(data)
            w.varint(0)
            return [self.send("play", "map_chunk", w.bytes_())]
        if self.meta["format"] == "p117":
            hm = _heightmap_bytes(self.proto, column)
            w = Writer()
            w.i32(cx); w.i32(cz)
            w.varint(0xFFFF)      # bit map
            w.raw(hm)
            w.varint(1024)
            b = self.reg.biome_id(biome)
            for _ in range(1024):
                w.varint(b)
            w.varint(len(data)); w.raw(data)
            w.varint(0)
            return [self.send("play", "map_chunk", w.bytes_())]
        # p118: batched chunk (1.21.2+ uses chunk_batch_start/finished)
        hm = _heightmap_bytes(self.proto, column)
        light = encode_map_chunk_light(self.meta, full_bright=True)
        body = Writer()
        body.i32(cx); body.i32(cz)
        body.raw(hm)
        body.varint(len(data)); body.raw(data)
        body.varint(0)  # block entities
        body.raw(light)
        payload = body.bytes_()
        if self.sid("play", "chunk_batch_start") is not None and self.proto >= 768:
            start = Writer()
            start.varint(0)  # batch max size
            frames = [self.send("play", "chunk_batch_start", start.bytes_())]
            frames.append(self.send("play", "map_chunk", payload))
            fin = Writer()
            fin.varint(1024)  # batch size (bytes sent)
            frames.append(self.send("play", "chunk_batch_finished", fin.bytes_()))
            return frames
        return [self.send("play", "map_chunk", payload)]

    def update_light_packet(self, cx, cz):
        if self.meta["format"] not in ("p114", "p116", "p117"):
            return None
        return self.send("play", "update_light", encode_update_light(self.meta, cx, cz))

    # ── entities ───────────────────────────────────────────────────────────
    def spawn_player(self, entity_id, uuid, x, y, z, yaw, pitch):
        p = self.proto
        if p >= 764:
            # 1.20.2+: no named_entity_spawn; spawn via spawn_entity (type=player)
            value = {
                "entityId": entity_id,
                "objectUUID": [uuid[0], uuid[1]],
                "type": self.data.get("player_entity_id", 1),
                "x": float(x), "y": float(y), "z": float(z),
                "pitch": _angle_byte(pitch), "yaw": _angle_byte(yaw),
                "headPitch": 0,
                "objectData": 0,
                "velocity": {"x": 0, "y": 0, "z": 0},
            }
            payload = self.pd.enc_packet("packet_spawn_entity", value)
            return self.send("play", "spawn_entity", payload)
        if p < 107:
            value = {
                "entityId": entity_id,
                "playerUUID": [uuid[0], uuid[1]],
                "x": int(x * 32), "y": int(y * 32), "z": int(z * 32),
                "yaw": _angle_byte(yaw), "pitch": _angle_byte(pitch),
                "currentItem": 0,
                "metadata": [],
            }
        else:
            value = {
                "entityId": entity_id,
                "playerUUID": [uuid[0], uuid[1]],
                "x": float(x), "y": float(y), "z": float(z),
                "yaw": _angle_byte(yaw), "pitch": _angle_byte(pitch),
                "metadata": [],
            }
        payload = self.pd.enc_packet("packet_named_entity_spawn", value)
        return self.send("play", "named_entity_spawn", payload)

    def spawn_mob(self, entity_id, mob_type, uuid, x, y, z, yaw, pitch, head_pitch=0,
                  velocity=(0, 0, 0)):
        p = self.proto
        if self.sid("play", "spawn_entity_living") is not None:
            value = {
                "entityId": entity_id,
                "type": mob_type,
                "x": int(x * 32) if p < 107 else float(x),
                "y": int(y * 32) if p < 107 else float(y),
                "z": int(z * 32) if p < 107 else float(z),
                "yaw": _angle_byte(yaw), "pitch": _angle_byte(pitch),
                "headPitch": _angle_byte(head_pitch),
                "velocity": {"x": velocity[0], "y": velocity[1], "z": velocity[2]},
                "metadata": [],
            }
            if p >= 107:
                value["entityUUID"] = [uuid[0], uuid[1]]
            payload = self.pd.enc_packet("packet_spawn_entity_living", value)
            return self.send("play", "spawn_entity_living", payload)
        # 1.20.1+ : generic spawn_entity
        value = {
            "entityId": entity_id,
            "objectUUID": [uuid[0], uuid[1]],
            "type": mob_type,
            "x": float(x), "y": float(y), "z": float(z),
            "pitch": _angle_byte(pitch), "yaw": _angle_byte(yaw),
            "headPitch": _angle_byte(head_pitch),
            "objectData": 0,
            "velocity": {"x": velocity[0], "y": velocity[1], "z": velocity[2]},
        }
        payload = self.pd.enc_packet("packet_spawn_entity", value)
        return self.send("play", "spawn_entity", payload)

    def entity_metadata_empty(self, entity_id):
        w = Writer()
        w.varint(entity_id)
        _write_metadata_empty(w, self.proto)
        return self.send("play", "entity_metadata", w.bytes_())

    def entity_destroy(self, entity_ids):
        p = self.proto
        if self.sid("play", "entity_destroy") is None:
            name = "entity_remove" if p >= 763 else "entity_destroy"
        else:
            name = "entity_destroy"
        w = Writer()
        w.varint(len(entity_ids))
        for eid in entity_ids:
            w.varint(eid)
        return self.send("play", name, w.bytes_())

    def entity_teleport(self, entity_id, x, y, z, yaw, pitch, on_ground=False):
        w = Writer()
        w.varint(entity_id)
        w.f64(x); w.f64(y); w.f64(z)
        w.i8(_angle_byte(yaw)); w.i8(_angle_byte(pitch))
        w.bool(on_ground)
        return self.send("play", "entity_teleport", w.bytes_())

    def entity_move(self, entity_id, dx, dy, dz, on_ground=False):
        w = Writer()
        w.varint(entity_id)
        w.i16(_clamp_i16(int(dx * 4096)))
        w.i16(_clamp_i16(int(dy * 4096)))
        w.i16(_clamp_i16(int(dz * 4096)))
        w.bool(on_ground)
        return self.send("play", "rel_entity_move", w.bytes_())

    def entity_look(self, entity_id, yaw, pitch, on_ground=False):
        w = Writer()
        w.varint(entity_id)
        w.i8(_angle_byte(yaw)); w.i8(_angle_byte(pitch))
        w.bool(on_ground)
        return self.send("play", "entity_look", w.bytes_())

    def entity_move_look(self, entity_id, dx, dy, dz, yaw, pitch, on_ground=False):
        w = Writer()
        w.varint(entity_id)
        w.i16(_clamp_i16(int(dx * 4096)))
        w.i16(_clamp_i16(int(dy * 4096)))
        w.i16(_clamp_i16(int(dz * 4096)))
        w.i8(_angle_byte(yaw)); w.i8(_angle_byte(pitch))
        w.bool(on_ground)
        return self.send("play", "entity_move_look", w.bytes_())

    def head_rotation(self, entity_id, yaw):
        w = Writer()
        w.varint(entity_id)
        w.i8(_angle_byte(yaw))
        return self.send("play", "entity_head_rotation", w.bytes_())

    def entity_velocity(self, entity_id, vx, vy, vz):
        w = Writer()
        w.varint(entity_id)
        w.i16(int(vx * 8000)); w.i16(int(vy * 8000)); w.i16(int(vz * 8000))
        return self.send("play", "entity_velocity", w.bytes_())


def _angle_byte(degrees):
    return int((degrees % 360.0) / 360.0 * 256) & 0xFF


def _clamp_i16(v):
    if v > 32767:
        return 32767
    if v < -32768:
        return -32768
    return v


def _enc_string(s):
    w = Writer()
    w.string(s)
    return w.bytes_()


def _write_metadata_empty(w, proto):
    if proto < 107:
        w.u8(127)
    else:
        w.u8(255)


def _heightmap_bytes(proto, column):
    from .chunk import encode_heightmap, heightmap_longs
    if proto >= 775:
        # 26.1+: heightmaps are an array of {type, data[]} entries
        # type mapper: 1 = world_surface, 4 = motion_blocking
        longs = heightmap_longs(column)
        w = Writer()
        w.varint(2)
        for type_id in (1, 4):
            w.varint(type_id)
            w.varint(len(longs))
            for v in longs:
                w.i64(v & 0x7FFFFFFFFFFFFFFF)
        return w.bytes_()
    hm = encode_heightmap(column)
    if proto >= 764:
        return nbt.encode_anon(hm)
    return nbt.encode(hm, with_name=True, name="")
