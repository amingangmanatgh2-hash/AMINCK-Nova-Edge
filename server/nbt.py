"""NBT (Named Binary Tag) encoder.

Supports the "simplified JSON" representation used by minecraft-data's
loginPacket.json: every tag is {"type": ..., "value": ...}. Longs are
[hi, lo] 32-bit pairs.
"""
import struct

_TAG_IDS = {
    "end": 0, "byte": 1, "short": 2, "int": 3, "long": 4, "float": 5,
    "double": 6, "byteArray": 7, "string": 8, "list": 9, "compound": 10,
    "intArray": 11, "longArray": 12,
}


class Tag:
    __slots__ = ("type", "value")
    def __init__(self, type_, value):
        self.type = type_
        self.value = value


# builder helpers
def byte(v): return Tag("byte", v & 0xFF)
def short(v): return Tag("short", v)
def int_(v): return Tag("int", v)
def long_(hi, lo): return Tag("long", [hi & 0xFFFFFFFF, lo & 0xFFFFFFFF])
def float_(v): return Tag("float", v)
def double_(v): return Tag("double", v)
def string_(v): return Tag("string", v)
def byte_array(v): return Tag("byteArray", list(v))
def int_array(v): return Tag("intArray", list(v))
def long_array(v): return Tag("longArray", list(v))
def list_(elem_type, items): return Tag("list", {"type": elem_type, "value": list(items)})
def compound(**kv): return Tag("compound", kv)


def _norm(tag):
    """Normalize a Tag/builder dict/plain value into a Tag."""
    if isinstance(tag, Tag):
        return tag
    if isinstance(tag, dict) and "type" in tag:
        return Tag(tag["type"], tag["value"])
    if isinstance(tag, bool):
        return Tag("byte", 1 if tag else 0)
    if isinstance(tag, int):
        return Tag("int", tag)
    if isinstance(tag, float):
        return Tag("double", tag)
    if isinstance(tag, str):
        return Tag("string", tag)
    raise TypeError(f"cannot normalize NBT value {tag!r}")


def _write_payload(buf, tag):
    t = tag.type
    v = tag.value
    if t == "byte":
        buf.append(v & 0xFF)
    elif t == "short":
        buf += struct.pack(">h", v)
    elif t == "int":
        buf += struct.pack(">i", v)
    elif t == "long":
        buf += struct.pack(">ii", v[0], v[1])
    elif t == "float":
        buf += struct.pack(">f", v)
    elif t == "double":
        buf += struct.pack(">d", v)
    elif t == "byteArray":
        buf += struct.pack(">i", len(v))
        for x in v:
            buf.append(x & 0xFF)
    elif t == "string":
        s = v.encode("utf-8") if isinstance(v, str) else v
        buf += struct.pack(">H", len(s))
        buf += s
    elif t == "list":
        inner = v  # {"type": elem_type, "value": [...]}
        elem_type = inner["type"]
        items = inner["value"]
        buf.append(_TAG_IDS.get(elem_type, 0))
        buf += struct.pack(">i", len(items))
        for it in items:
            # list elements are stored unwrapped (no "type" key): wrap by elem type
            _write_payload(buf, Tag(elem_type, it))
    elif t == "compound":
        for name, child in v.items():
            child = _norm(child)
            buf.append(_TAG_IDS[child.type])
            nb = name.encode("utf-8")
            buf += struct.pack(">H", len(nb))
            buf += nb
            _write_payload(buf, child)
        buf.append(0)  # TAG_End
    elif t == "intArray":
        buf += struct.pack(">i", len(v))
        for x in v:
            buf += struct.pack(">i", x)
    elif t == "longArray":
        buf += struct.pack(">i", len(v))
        for x in v:
            if isinstance(x, Tag):
                x = x.value
            buf += struct.pack(">II", x[0] & 0xFFFFFFFF, x[1] & 0xFFFFFFFF)
    elif t == "end":
        pass
    else:
        raise ValueError(f"unknown NBT type {t!r}")


def encode(tag, with_name=True, name=""):
    """Encode a tag; with_name wraps it in a named tag (network NBT root is
    usually anonymous, i.e. with_name=False)."""
    tag = _norm(tag)
    buf = bytearray()
    if with_name:
        buf.append(_TAG_IDS[tag.type])
        nb = name.encode("utf-8")
        buf += struct.pack(">H", len(nb))
        buf += nb
        _write_payload(buf, tag)
    else:
        buf.append(_TAG_IDS[tag.type])
        _write_payload(buf, tag)
    return bytes(buf)


def encode_named(tag, name):
    return encode(tag, True, name)


def encode_anon(tag):
    return encode(tag, False)
