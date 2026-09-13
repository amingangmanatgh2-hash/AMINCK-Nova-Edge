"""Mini protodef engine — encode/decode Minecraft packets from minecraft-data
protocol.json type definitions (the merged "types" namespace).

Value model:
  container -> dict
  switch    -> {case_name: value}
  mapper    -> mapped name (str) on encode/decode
  bitflags  -> {flag_name: bool}
  array     -> list
  option    -> value | None
  buffer    -> bytes
  entityMetadataLoop -> list of {key, type, value} entries
"""
import struct, math
from . import nbt
from .varint import Writer, Reader

def _switch_key(target):
    if isinstance(target, bool):
        return "true" if target else "false"
    return str(target) if target is not None else None


PRIMITIVES = {
    "u8", "i8", "u16", "i16", "u32", "i32", "u64", "i64", "f32", "f64",
    "bool", "varint", "varlong", "string", "pstring", "restBuffer", "void",
    "UUID", "position", "nbt", "anonymousNbt", "slot", "lpVec3",
}


class PDRuntime:
    def __init__(self, types):
        self.types = types or {}

    # ── resolution ─────────────────────────────────────────────────────────
    def resolve(self, t):
        if isinstance(t, str):
            if t in PRIMITIVES or t in ("native",):
                return t
            if t in self.types:
                return self.types[t]
            if t in ("vec3i16", "vec3f32", "vec3i8", "vec3f", "vec3i"):
                return t
            raise KeyError(f"unknown type {t!r}")
        return t

    # ── encoding ───────────────────────────────────────────────────────────
    def encode(self, t, value, w, scopes):
        t = self.resolve(t)
        if isinstance(t, str):
            self._enc_native(t, value, w, scopes)
            return
        kind = t[0]
        if kind == "container":
            self._enc_container(t[1], value, w, scopes)
        elif kind == "switch":
            self._enc_switch(t[1], value, w, scopes)
        elif kind == "mapper":
            self._enc_mapper(t[1], value, w, scopes)
        elif kind == "array":
            self._enc_array(t[1], value, w, scopes)
        elif kind == "option":
            self._enc_option(t[1], value, w, scopes)
        elif kind == "buffer":
            self._enc_buffer(t[1], value, w, scopes)
        elif kind == "bitflags":
            self._enc_bitflags(t[1], value, w, scopes)
        elif kind == "entityMetadataLoop":
            self._enc_meta_loop(t[1], value, w, scopes)
        elif kind == "bitfield":
            self._enc_bitfield(t[1], value, w)
        elif kind == "pstring":
            w.pstring(value)
        else:
            raise ValueError(f"unknown type kind {kind!r}")

    def _enc_native(self, t, value, w, scopes):
        if t == "u8" or t == "i8":
            w.u8(value)
        elif t == "u16":
            w.u16(value)
        elif t == "i16":
            w.i16(value)
        elif t == "u32":
            w.u32(value)
        elif t == "i32":
            w.i32(value)
        elif t == "u64":
            if isinstance(value, (list, tuple)):
                w.i32(value[0]); w.i32(value[1])
            else:
                w.i64(value)
        elif t == "i64":
            if isinstance(value, (list, tuple)):
                w.i32(value[0]); w.i32(value[1])
            else:
                w.i64(value)
        elif t == "f32":
            w.f32(value)
        elif t == "f64":
            w.f64(value)
        elif t == "bool":
            w.bool(value)
        elif t == "varint":
            w.varint(value)
        elif t == "varlong":
            if isinstance(value, (list, tuple)):
                w.varlong((value[0] << 32) | (value[1] & 0xFFFFFFFF))
            else:
                w.varlong(value)
        elif t == "string":
            w.string(value)
        elif t == "pstring":
            w.pstring(value)
        elif t == "UUID":
            w.uuid(value[0], value[1])
        elif t == "position":
            w.position(value[0], value[1], value[2])
        elif t == "nbt":
            w.raw(nbt.encode(value, with_name=True, name=""))
        elif t == "anonymousNbt":
            w.raw(nbt.encode_anon(value))
        elif t == "slot":
            self._enc_slot(value, w, scopes)
        elif t == "lpVec3":
            self._enc_lpvec3(value, w)
        elif t == "vec3i16":
            w.i16(value[0]); w.i16(value[1]); w.i16(value[2])
        elif t == "vec3f32" or t == "vec3f":
            w.f32(value[0]); w.f32(value[1]); w.f32(value[2])
        elif t == "vec3i8":
            w.i8(value[0]); w.i8(value[1]); w.i8(value[2])
        elif t == "vec3i" or t == "vec3":
            w.i32(value[0]); w.i32(value[1]); w.i32(value[2])
        elif t == "void":
            pass
        elif t == "restBuffer":
            w.raw(value)
        else:
            raise ValueError(f"native {t!r} not implemented")

    def _enc_lpvec3(self, value, w):
        if isinstance(value, dict):
            x, y, z = value.get("x", 0), value.get("y", 0), value.get("z", 0)
        else:
            x, y, z = (value[0], value[1], value[2])
        mx = max(abs(x), abs(y), abs(z))
        if mx < 3.051944088384301e-5:
            w.u8(0)
            return
        scale = int(math.ceil(mx))
        needs_cont = scale > 3
        markers = (scale % 4) | (4 if needs_cont else 0)

        def pack(v):
            return int(round((v * 0.5 + 0.5) * 32766.0))

        packed = markers + pack(x / scale) * 0x8 + pack(y / scale) * 0x40000 + pack(z / scale) * 0x200000000
        w.u8(packed & 0xFF)
        w.u8((packed >> 8) & 0xFF)
        w.u32((packed >> 16) & 0xFFFFFFFF)
        if needs_cont:
            w.varint(scale // 4)

    def _enc_slot(self, value, w, scopes):
        present = value is not None and value.get("present", True)
        if not present:
            w.bool(False)
            return
        w.bool(True)
        w.varint(value.get("itemId", 0))
        w.i8(value.get("itemCount", 1))
        tag = value.get("nbt")
        if tag is None:
            w.raw(b"\x00")
        else:
            w.raw(nbt.encode_anon(tag))

    def _enc_container(self, fields, value, w, scopes):
        value = value or {}
        scopes.append(value)
        try:
            for f in fields:
                name = f.get("name")
                if name is None:
                    # anonymous field (inline switch/splice): encode from the
                    # same scope value.
                    self.encode(f["type"], value, w, scopes)
                    continue
                v = value.get(name)
                self.encode(f["type"], v, w, scopes)
        finally:
            scopes.pop()

    def _enc_switch(self, spec, value, w, scopes):
        target = self._compare_value(spec.get("compareTo"), scopes)
        fields = spec.get("fields", {})
        key = _switch_key(target)
        if key in fields:
            t = fields[key]
        else:
            key = "default"
            t = spec.get("default", "void")
        if t == "void":
            return
        if isinstance(t, list) and t[0] == "container":
            # anonymous splice: encode container fields from current value dict
            self._enc_container(t[1], value, w, scopes)
        else:
            self.encode(t, value, w, scopes)

    def _enc_mapper(self, spec, value, w, scopes):
        # value = name; write the numeric via spec["type"], then nothing else
        mappings = spec.get("mappings", {})
        num = None
        for k, v in mappings.items():
            if v == value:
                num = int(k, 16)
                break
        if num is None:
            num = value if isinstance(value, int) else 0
        self.encode(spec["type"], num, w, scopes)

    def _enc_array(self, spec, value, w, scopes):
        value = value or []
        w.varint(len(value))
        for item in value:
            self.encode(spec["type"], item, w, scopes)

    def _enc_option(self, spec, value, w, scopes):
        if value is None:
            w.bool(False)
        else:
            w.bool(True)
            self.encode(spec, value, w, scopes)

    def _enc_buffer(self, spec, value, w, scopes):
        data = bytes(value)
        self.encode(spec.get("countType", "varint"), len(data), w, scopes)
        w.raw(data)

    def _enc_bitflags(self, spec, value, w, scopes):
        flags = spec.get("flags", [])
        num = 0
        for i, flag in enumerate(flags):
            if value and value.get(flag):
                num |= 1 << i
        self.encode(spec.get("type", "u8"), num, w, scopes)

    def _enc_meta_loop(self, spec, value, w, scopes):
        end = spec.get("endVal", 255)
        entry_type = spec["type"]
        for entry in value or []:
            scopes.append({"$compareTo": entry.get("type")})
            try:
                self.encode(entry_type, entry, w, scopes)
            finally:
                scopes.pop()
        w.u8(end)

    def _enc_bitfield(self, fields, value, w):
        num = 0
        offset = 0
        for f in fields:
            size = f.get("size", 0)
            v = (value or {}).get(f["name"], 0)
            num |= (v & ((1 << size) - 1)) << offset
            offset += size
        w.u8(num)

    # ── decoding ───────────────────────────────────────────────────────────
    def decode(self, t, r, scopes):
        t = self.resolve(t)
        if isinstance(t, str):
            return self._dec_native(t, r, scopes)
        kind = t[0]
        if kind == "container":
            return self._dec_container(t[1], r, scopes)
        if kind == "switch":
            return self._dec_switch(t[1], r, scopes)
        if kind == "mapper":
            return self._dec_mapper(t[1], r, scopes)
        if kind == "array":
            return self._dec_array(t[1], r, scopes)
        if kind == "option":
            return self._dec_option(t[1], r, scopes)
        if kind == "buffer":
            return self._dec_buffer(t[1], r, scopes)
        if kind == "bitflags":
            return self._dec_bitflags(t[1], r, scopes)
        if kind == "entityMetadataLoop":
            return self._dec_meta_loop(t[1], r, scopes)
        if kind == "bitfield":
            return self._dec_bitfield(t[1], r)
        raise ValueError(f"unknown type kind {kind!r}")

    def _dec_native(self, t, r, scopes):
        if t == "u8" or t == "i8":
            return r.u8()
        if t == "u16":
            return r.u16()
        if t == "i16":
            return r.i16()
        if t == "u32":
            return r.u32()
        if t == "i32":
            return r.i32()
        if t == "i64" or t == "u64":
            return r.i64()
        if t == "f32":
            return r.f32()
        if t == "f64":
            return r.f64()
        if t == "bool":
            return r.u8() != 0
        if t == "varint":
            return r.varint()
        if t == "varlong":
            return r.varlong()
        if t == "string":
            return r.string()
        if t == "pstring":
            return r.pstring()
        if t == "UUID":
            return (r.i64(), r.i64())
        if t == "position":
            v = r.i64()
            x = v >> 38
            y = (v >> 26) & 0xFFF
            z = v << 38 >> 38
            if x >= (1 << 25):
                x -= 1 << 26
            if y >= (1 << 11):
                y -= 1 << 12
            if z >= (1 << 25):
                z -= 1 << 26
            return (x, y, z)
        if t == "nbt" or t == "anonymousNbt":
            # minimal: skip raw NBT (we don't need to parse it serverbound)
            return None
        if t == "slot":
            present = r.u8() != 0
            if not present:
                return None
            item_id = r.varint()
            count = r.i8()
            return {"present": True, "itemId": item_id, "itemCount": count}
        if t in ("vec3i16", "vec3f32", "vec3f", "vec3i8", "vec3i", "vec3"):
            if t == "vec3i16":
                return (r.i16(), r.i16(), r.i16())
            if t == "vec3i8":
                return (r.i8(), r.i8(), r.i8())
            if t == "vec3i" or t == "vec3":
                return (r.i32(), r.i32(), r.i32())
            return (r.f32(), r.f32(), r.f32())
        if t == "void":
            return None
        if t == "restBuffer":
            return r.read(r.remaining())
        raise ValueError(f"native {t!r} not implemented")

    def _dec_container(self, fields, r, scopes):
        out = {}
        scopes.append(out)
        try:
            for f in fields:
                name = f.get("name")
                v = self.decode(f["type"], r, scopes)
                if name:
                    out[name] = v
                elif isinstance(v, dict):
                    # anonymous inline field (e.g. switch splice): flatten
                    # decoded container branches back into this scope.
                    self._splice(out, v)
        finally:
            scopes.pop()
        return out

    @staticmethod
    def _splice(out, v):
        for k, val in v.items():
            if isinstance(val, dict):
                out.update(val)
            elif val is not None:
                out[k] = val
        return out

    def _dec_switch(self, spec, r, scopes):
        # decode the compareTo target first
        target = self._compare_value(spec.get("compareTo"), scopes)
        fields = spec.get("fields", {})
        key = _switch_key(target)
        if key in fields:
            t = fields[key]
        else:
            key = "default"
            t = spec.get("default", "void")
        return {key: self.decode(t, r, scopes)} if t != "void" else {key: None}

    def _dec_mapper(self, spec, r, scopes):
        num = self.decode(spec["type"], r, scopes)
        mappings = spec.get("mappings", {})
        return mappings.get(f"0x{num:02x}", num)

    def _dec_array(self, spec, r, scopes):
        n = r.varint()
        return [self.decode(spec["type"], r, scopes) for _ in range(n)]

    def _dec_option(self, spec, r, scopes):
        if r.u8() == 0:
            return None
        return self.decode(spec, r, scopes)

    def _dec_buffer(self, spec, r, scopes):
        n = self.decode(spec.get("countType", "varint"), r, scopes)
        return r.read(n)

    def _dec_bitflags(self, spec, r, scopes):
        num = self.decode(spec.get("type", "u8"), r, scopes)
        out = {}
        for i, flag in enumerate(spec.get("flags", [])):
            out[flag] = bool(num & (1 << i))
        return out

    def _dec_meta_loop(self, spec, r, scopes):
        end = spec.get("endVal", 255)
        entry_type = spec["type"]
        out = []
        while True:
            b = r.buf[r.off]
            if b == end:
                r.off += 1
                break
            scopes.append({})
            try:
                entry = self.decode(entry_type, r, scopes)
                entry["type"] = entry.get("type", scopes[-1].get("$compareTo"))
            finally:
                scopes.pop()
            out.append(entry)
        return out

    def _dec_bitfield(self, fields, r):
        num = r.u8()
        out = {}
        offset = 0
        for f in fields:
            size = f.get("size", 0)
            out[f["name"]] = (num >> offset) & ((1 << size) - 1)
            offset += size
        return out

    def _compare_value(self, path, scopes):
        if not path:
            return None
        parts = [p for p in path.split("/") if p not in ("", ".")]
        idx = len(scopes) - 1
        cur = None
        have = False
        for p in parts:
            if p == "$compareTo":
                return scopes[-1].get("$compareTo")
            if p == "..":
                idx -= 1
                continue
            if not have:
                scope = scopes[idx] if 0 <= idx < len(scopes) else {}
                cur = scope.get(p)
                have = True
            else:
                cur = cur.get(p) if isinstance(cur, dict) else None
        return cur

    # ── high level helpers ─────────────────────────────────────────────────
    def enc_packet(self, type_name, value):
        w = Writer()
        self.encode(type_name, value, w, [])
        return w.bytes_()

    def dec_packet(self, type_name, data):
        r = Reader(data)
        v = self.decode(type_name, r, [])
        return v
