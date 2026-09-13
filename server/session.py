"""Per-connection Minecraft session (state machine)."""
import asyncio, struct, time, traceback
from .varint import read_varint, Reader, Writer
from .profile import Profile, offline_uuid


class Session:
    def __init__(self, game, reader, writer):
        self.game = game
        self.reader = reader
        self.writer = writer
        self.profile = None
        self.proto = 0
        self.state = "handshaking"
        self.username = None
        self.uuid = None
        self.closed = False
        self._send_lock = asyncio.Lock()
        self.keep_alive_id = 0
        self.last_keep_alive = time.time()
        self.player = None  # set once spawned

    # ── io ─────────────────────────────────────────────────────────────────
    async def send_raw(self, data):
        if self.closed:
            return
        async with self._send_lock:
            try:
                self.writer.write(data)
                await self.writer.drain()
            except Exception:
                self.closed = True

    async def send_packet(self, state, name, payload=b""):
        try:
            data = self.profile.send(state, name, payload)
        except KeyError as e:
            self.game.log(f"[{self.username}] no packet {e}")
            return
        await self.send_raw(data)

    async def disconnect(self, reason="Disconnected"):
        if self.closed:
            return
        try:
            if self.state == "login":
                await self.send_packet("login", "disconnect", _str(reason))
            elif self.state in ("play", "configuration"):
                if self.profile.sid("play", "kick_disconnect") is not None:
                    await self.send_packet("play", "kick_disconnect", _str(reason))
                elif self.profile.sid("configuration", "disconnect") is not None:
                    await self.send_packet("configuration", "disconnect", _str(reason))
        except Exception:
            pass
        self.closed = True
        try:
            self.writer.close()
        except Exception:
            pass

    # ── main loop ─────────────────────────────────────────────────────────
    async def run(self):
        try:
            while not self.closed:
                length = await self._read_varint()
                if length is None:
                    break
                data = await self.reader.readexactly(length)
                r = Reader(data)
                pid = r.varint()
                payload = r.read(r.remaining())
                await self.handle_packet(pid, payload)
        except asyncio.IncompleteReadError:
            pass
        except ConnectionError:
            pass
        except Exception:
            self.game.log("session error:\n" + traceback.format_exc())
        finally:
            await self._cleanup()

    async def _read_varint(self):
        buf = bytearray()
        while True:
            try:
                b = await self.reader.readexactly(1)
            except asyncio.IncompleteReadError:
                return None
            buf += b
            if not (b[0] & 0x80):
                break
        val, _ = read_varint(bytes(buf), 0)
        return val

    # ── dispatch ──────────────────────────────────────────────────────────
    async def handle_packet(self, pid, payload):
        s = self.state
        if s == "handshaking":
            await self._on_handshake(pid, payload)
        elif s == "status":
            await self._on_status(pid, payload)
        elif s == "login":
            await self._on_login(pid, payload)
        elif s == "configuration":
            await self._on_configuration(pid, payload)
        elif s == "play":
            await self._on_play(pid, payload)

    async def _on_handshake(self, pid, payload):
        r = Reader(payload)
        proto = r.varint()
        r.string()  # host
        r.u16()     # port
        nxt = r.varint()
        # load the correct per-version profile now that we know the protocol
        self.profile = self.game.profile_for(proto)
        self.proto = self.profile.proto
        if nxt == 1:
            self.state = "status"
        elif nxt == 2:
            self.state = "login"
        else:
            self.closed = True

    async def _on_status(self, pid, payload):
        if pid == 0:
            # live MOTD + player count + favicon at ping time
            self.profile.set_status_json(self.game.status_json(self.profile.proto))
            await self.send_packet("status", "server_info", self.profile.status_response_body())
        elif pid == 1:
            await self.send_packet("status", "ping", payload)

    async def _on_login(self, pid, payload):
        p = self.proto
        # login start = 0
        if pid == 0:
            r = Reader(payload)
            name = r.string()
            self.username = name
            self.uuid = offline_uuid(name)
            if p >= 759 and r.remaining() >= 16:
                r.i64(); r.i64()  # provided UUID (offline -> ignore)
            if self.game.is_banned(name):
                await self.disconnect("You are banned from this server.")
                return
            if p >= 764:
                await self.send_packet("login", "success", self.profile.login_success_payload(name))
                # stay in login state until login_acknowledged
            else:
                await self.send_packet("login", "success", self.profile.login_success_payload(name))
                self.state = "play"
                self.game.on_login(self)
                await self._start_play()
        elif pid == 3 and p >= 764:
            # login_acknowledged — enter configuration
            self.state = "configuration"
            await self._enter_configuration()

    async def _enter_configuration(self):
        # 1.20.2+ configuration phase
        packs = self.profile.config_select_known_packs()
        if packs:
            await self.send_raw(packs)
        for pkt in self.profile.config_registry_packets():
            await self.send_raw(pkt)
        ff = self.profile.config_feature_flags()
        if ff:
            await self.send_raw(ff)
        await self.send_raw(self.profile.config_finish())

    async def _on_configuration(self, pid, payload):
        p = self.proto
        rev = self.profile.c2s_rev.get("configuration", {})
        name = rev.get(pid, "")
        if name == "finish_configuration":
            self.state = "play"
            self.game.on_login(self)
            await self._start_play()
        # else: ignore (settings, select_known_packs, cookie, etc.)

    # ── play ──────────────────────────────────────────────────────────────
    async def _start_play(self):
        self.game.spawn_player(self)
        self.last_keep_alive = time.time()
        asyncio.ensure_future(self._keep_alive_loop())

    async def _keep_alive_loop(self):
        try:
            while not self.closed:
                await asyncio.sleep(2.0)
                if self.closed:
                    break
                self.keep_alive_id = (self.keep_alive_id + 1) & 0x7FFFFFFFFFFFFFFF
                self.last_keep_alive = time.time()
                await self.send_packet("play", "keep_alive", struct.pack(">q", self.keep_alive_id))
        except Exception:
            pass

    async def _on_play(self, pid, payload):
        rev = self.profile.c2s_rev.get("play", {})
        name = rev.get(pid)
        if name is None:
            return
        r = Reader(payload)
        p = self.proto
        try:
            if name == "keep_alive":
                self.last_keep_alive = time.time()
            elif name == "chat_command":
                msg = r.string()
                await self.game.on_command(self.player, msg)
            elif name in ("chat", "chat_message"):
                msg = r.string()
                await self.game.on_chat(self, msg)
            elif name == "position":
                x, y, z = r.f64(), r.f64(), r.f64()
                yaw, pitch = r.f32(), r.f32()
                flags = r.u8()
                self.game.on_move(self, x, y, z, yaw, pitch, flags & 0x01, None, name)
            elif name == "position_look":
                x, y, z = r.f64(), r.f64(), r.f64()
                yaw, pitch = r.f32(), r.f32()
                flags = r.u8()
                on_ground = r.u8() != 0
                self.game.on_move(self, x, y, z, yaw, pitch, flags & 0x01, on_ground, name)
            elif name == "look":
                yaw, pitch = r.f32(), r.f32()
                on_ground = r.u8() != 0
                self.game.on_look(self, yaw, pitch, on_ground)
            elif name == "teleport_confirm":
                r.varint()
            elif name == "held_item_slot":
                slot = r.i16()
                self.game.on_held_slot(self, slot)
            elif name == "client_command":
                action = r.varint()
                self.game.on_client_command(self, action)
            elif name in ("animation", "arm_animation", "swing_arm"):
                hand = r.varint() if p >= 107 else 0
                self.game.on_animation(self)
            elif name == "block_dig":
                status = r.varint()
                x, y, z = _read_position(r)
                face = r.i8()
                if p >= 759 and r.remaining() > 0:
                    r.varint()
                self.game.on_block_dig(self, status, x, y, z, face)
            elif name == "block_place":
                if p < 107:
                    x, y, z = _read_position(r)
                    face = r.i8()
                else:
                    hand = r.varint()
                    x, y, z = _read_position(r)
                    face = r.varint()
                    r.f32(); r.f32(); r.f32()
                    r.u8()
                    if p >= 759 and r.remaining() > 0:
                        r.varint()
                self.game.on_block_place(self, x, y, z, face)
            elif name == "use_item":
                r.varint()
            elif name in ("settings", "plugin_message", "custom_payload", "chat_session_update",
                          "chat_preview", "chat_ack", "pong", "player_session", "select_known_packs",
                          "cookie_response", "custom_report_details", "server_links", "configuration_acknowledged"):
                pass
            else:
                pass
        except Exception:
            self.game.log(f"packet parse error {name}: {traceback.format_exc()}")

    async def _cleanup(self):
        if self.closed and self.player is None:
            return
        if not self.closed:
            self.closed = True
        if self.player is not None:
            self.game.on_disconnect(self.player)
        try:
            self.writer.close()
        except Exception:
            pass


def _read_position(r):
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
    return x, y, z


def _str(s):
    w = Writer()
    w.string(s)
    return w.bytes_()
