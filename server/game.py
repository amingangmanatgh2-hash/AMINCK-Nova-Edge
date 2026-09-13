"""GameServer: worlds, players, bots, physics, combat, chat/commands, AI."""
import asyncio, math, random, time, traceback
from . import data as mcdata
from .profile import Profile
from .entities import Player, Bot, EntityIdAllocator
from .world import World
from . import maps
from .ai import Brain
from .ai_client import ai_chat, configured as _ai_configured
from .registry import Registry
from . import gamemodes as G

TICK = 1.0 / 20.0
VOID_MARGIN = 10


class GameServer:
    def __init__(self, config):
        self.cfg = config
        self.name = config.get("server_name", "AMINCK Nova")
        self.motd = config.get("motd", "AMINCK Nova — Minecraft God Server")
        self.account_id = config.get("account_id", "")
        self.ai_token = config.get("ai_token", "")
        self.ai_fallback_url = config.get("ai_fallback_url", "")
        self.ai_gateway_url = config.get("ai_gateway_url", "")
        self.ai_gateway_token = config.get("ai_gateway_token", "")
        self.ai_model = config.get("ai_model", "@cf/meta/llama-3.1-8b-instruct")
        self.image_model = config.get("image_model", "@cf/black-forest-labs/flux-1-schnell")
        self.players = {}
        self.bots = {}
        self.ids = EntityIdAllocator()
        self.profiles = {}
        self.log_lines = []
        self.ai_enabled = _ai_configured(
            self.account_id, self.ai_token, self.ai_fallback_url, self.ai_gateway_url)
        self.started = time.time()
        self._chat_lock = asyncio.Lock()
        self._seq = 0

        # canonical block registry (modern names) — worlds store canonical ids
        self.canonical_reg = Registry(mcdata.load(775))
        # lobby + gamemode registry
        self.modes = G.build_modes(self)
        self.lobby = self.modes["lobby"]

    def is_banned(self, name):
        return False

    # ── logging ───────────────────────────────────────────────────────────
    def log(self, msg):
        line = f"[{time.strftime('%H:%M:%S')}] {msg}"
        print(line, flush=True)
        self.log_lines.append(line)
        if len(self.log_lines) > 500:
            self.log_lines = self.log_lines[-500:]

    # ── profile ───────────────────────────────────────────────────────────
    def profile_for(self, proto):
        proto = proto if proto in mcdata.index() else mcdata.nearest(proto)
        if proto is None:
            proto = 763
        if proto not in self.profiles:
            d = mcdata.load(proto)
            if d is None:
                d = mcdata.load(763)
            self.profiles[proto] = Profile(d)
        return self.profiles[proto]

    # ── status ────────────────────────────────────────────────────────────
    def status_json(self, proto):
        import json as _json
        online = sum(1 for p in self.players.values() if p.connected)
        return _json.dumps({
            "version": {"name": f"{self.name} 1.8→26.x", "protocol": proto},
            "players": {"max": 100, "online": online, "sample": []},
            "description": {"text": f"§a§l{self.name}\n§r{self.motd}"},
            "favicon": getattr(self, "favicon_data_uri", ""),
        })

    # ── player lifecycle ──────────────────────────────────────────────────
    def on_login(self, session):
        p = Player(session)
        p.entity_id = self.ids.alloc()
        p.uuid = session.uuid
        p.name = session.username
        session.player = p
        self.players[p.name.lower()] = p
        self.log(f"+ {p.name} joined (protocol {session.proto})")

    def spawn_player(self, session):
        p = session.player
        if p is None:
            return
        prof = session.profile
        # status json for the motd
        prof.set_status_json(self.status_json(session.proto))
        mode = self.lobby
        mode.join(self, p)
        self._send_join_sequence(p)

    def _send_join_sequence(self, p):
        prof = p.session.profile
        p.set_pos(p.x, p.y, p.z, p.yaw, p.pitch)
        # player info for self
        p.session._send = True  # noop marker
        self._queue(p, prof.player_info_add(p.uuid, p.name, gamemode=p.gamemode))
        self._queue(p, prof.update_time(0, 6000))
        self._queue(p, prof.spawn_position(int(p.x), int(p.y), int(p.z)))
        self._queue(p, prof.abilities(creative=(p.gamemode == 1), allow_flying=(p.gamemode == 1)))
        self._queue(p, prof.update_health(p.health))
        self._queue(p, prof.position(p.x, p.y, p.z, p.yaw, p.pitch))
        self._send_chunks(p)
        self._flush(p)

    def _queue(self, p, data):
        if data is None:
            return
        if not hasattr(p, "_sendbuf"):
            p._sendbuf = []
        if isinstance(data, list):
            p._sendbuf.extend(data)
        else:
            p._sendbuf.append(data)

    def _flush(self, p):
        buf = getattr(p, "_sendbuf", [])
        p._sendbuf = []
        if buf:
            asyncio.ensure_future(self._send_many(p, buf))

    async def _send_many(self, p, frames):
        for f in frames:
            if p.session.closed:
                break
            await p.session.send_raw(f)

    def _send_chunks(self, p):
        prof = p.session.profile
        cx, cz = int(p.x) >> 4, int(p.z) >> 4
        R = self.cfg.get("view_distance", 4)
        ordered = [(0, 0)]
        for r in range(1, R + 1):
            for dx in range(-r, r + 1):
                for dz in range(-r, r + 1):
                    if max(abs(dx), abs(dz)) == r:
                        ordered.append((dx, dz))
        frames = []
        for dx, dz in ordered:
            col = p.world.translated_column(cx + dx, cz + dz, prof.reg)
            frames.extend(prof.chunk_packet(cx + dx, cz + dz, col))
            light = prof.update_light_packet(cx + dx, cz + dz)
            if light:
                frames.append(light)
        self._queue(p, frames)
        # broadcast self to others + others to self
        self._broadcast_entities(p)

    def _broadcast_entities(self, p):
        """Send existing entities (other players + world bots) to p, and p to others."""
        prof = p.session.profile
        world = p.world
        for other in self.players.values():
            if other is p or not other.connected:
                continue
            if other.world is not world:
                continue
            self._queue(p, self._spawn_player_frames(prof, other))
            # send p to other (if other already in play)
            if hasattr(other, "_spawned"):
                self._queue(other, other.session.profile.spawn_player(
                    p.entity_id, p.uuid, p.x, p.y, p.z, p.yaw, p.pitch))
                self._queue(other, other.session.profile.player_info_add(p.uuid, p.name))
        for b in self.world_bots(world):
            self._queue(p, self._spawn_player_frames(prof, b))
        self._flush(p)
        for other in self.players.values():
            if other is not p and other.world is world and hasattr(other, "_spawned"):
                self._flush(other)
        p._spawned = True

    def _spawn_player_frames(self, prof, ent):
        return [
            prof.player_info_add(ent.uuid, ent.name, gamemode=0),
            prof.spawn_player(ent.entity_id, ent.uuid, ent.x, ent.y, ent.z, ent.yaw, ent.pitch),
        ]

    def on_disconnect(self, p):
        if p.name.lower() in self.players:
            del self.players[p.name.lower()]
        if p.mode is not None:
            p.mode.leave(self, p)
        # broadcast removal
        for other in self.players.values():
            if other.world is p.world and other.connected and hasattr(other, "_spawned"):
                prof = other.session.profile
                frames = [prof.player_info_remove(p.uuid), prof.entity_destroy([p.entity_id])]
                asyncio.ensure_future(self._send_many(other, frames))
        self.log(f"- {p.name} left")

    # ── packet handlers (from sessions) ───────────────────────────────────
    async def on_chat(self, session, message):
        p = session.player
        if not p:
            return
        message = message.strip()
        if message.startswith("/"):
            await self.on_command(p, message[1:])
            return
        # in-game chat
        self.broadcast_chat(p, message)
        # AI / bots respond (network call offloaded to a thread)
        for b in self.bots.values():
            if b.world is p.world and b.brain is not None:
                reply = await self.bot_reply(b, message)
                if reply:
                    await asyncio.sleep(random.uniform(0.3, 1.2))
                    self.bot_chat(b, reply)

    def on_move(self, session, x, y, z, yaw, pitch, relative, on_ground, pkt):
        p = session.player
        if not p:
            return
        if relative:
            p.x += x; p.y += y; p.z += z
        else:
            p.set_pos(x, y, z, yaw, pitch)
        p.on_ground = on_ground if on_ground is not None else p.on_ground
        if p.mode is not None:
            p.mode.on_move(self, p)

    def on_look(self, session, yaw, pitch, on_ground):
        p = session.player
        if not p:
            return
        p.yaw, p.pitch, p.on_ground = yaw, pitch, on_ground

    def on_held_slot(self, session, slot):
        if session.player:
            session.player.held_slot = slot

    def on_client_command(self, session, action):
        p = session.player
        if not p:
            return
        if action == 0:  # respawn
            if p.mode is not None:
                p.mode.respawn(self, p)
            else:
                self.lobby.respawn(self, p)

    def on_animation(self, session):
        p = session.player
        if not p:
            return
        # attack detection: nearest enemy in reach
        self.player_attack(p)

    def on_block_dig(self, session, status, x, y, z, face):
        p = session.player
        if not p:
            return
        if status == 2 or p.gamemode == 1:
            if p.mode is not None:
                p.mode.handle_break(self, p, x, y, z)
            else:
                self._default_break(p, x, y, z)

    def on_block_place(self, session, x, y, z, face):
        p = session.player
        if not p:
            return
        if p.mode is not None:
            p.mode.handle_place(self, p, x, y, z, face)

    # ── blocks ────────────────────────────────────────────────────────────
    def _default_break(self, p, x, y, z):
        self.set_block_and_broadcast(p, x, y, z, "air")

    def set_block_and_broadcast(self, p, x, y, z, name):
        """Set a block by NAME in the world and broadcast it (per-protocol state)."""
        canon = self.canonical_reg.block_state(name) if name != "air" else 0
        p.world.set_state(x, y, z, canon)
        for other in self.players.values():
            if other.world is p.world and other.connected and hasattr(other, "_spawned"):
                prof = other.session.profile
                state = prof.reg.block_state(name) if name != "air" else 0
                asyncio.ensure_future(self._send_many(other, [prof.block_change(x, y, z, state)]))

    def broadcast_block(self, p, x, y, z, name):
        self.set_block_and_broadcast(p, x, y, z, name)

    # ── combat ────────────────────────────────────────────────────────────
    def are_enemies(self, a, b):
        if a is b:
            return False
        if a.team is not None and a.team == b.team:
            return False
        return True

    def player_attack(self, p):
        if time.time() < p.attack_cooldown:
            return
        p.attack_cooldown = time.time() + 0.4
        target = self._nearest_attackable(p, REACH=3.5)
        if target is None:
            return
        self.damage(target, 1.0 if p.gamemode != 1 else 100.0, attacker=p)

    def bot_attack(self, bot, target, hit):
        if not hit:
            # miss: still face, no damage
            return
        self.damage(target, random.uniform(0.8, 1.6), attacker=bot)

    def _nearest_attackable(self, ent, REACH=3.5):
        best, best_d = None, REACH
        for other in list(self.players.values()) + list(self.bots.values()):
            if other is ent or not other.alive:
                continue
            if other.world is not ent.world:
                continue
            if not self.are_enemies(ent, other):
                continue
            d = ent.distance(other)
            if d < best_d:
                best_d, best = d, other
        return best

    def damage(self, entity, amount, attacker=None, knockback=0.4):
        if not entity.alive:
            return
        entity.health -= amount
        if attacker is not None:
            dx = entity.x - attacker.x
            dz = entity.z - attacker.z
            h = math.hypot(dx, dz) or 1.0
            entity.knockback = (dx / h * knockback, 0.42 * knockback, dz / h * knockback)
        self._send_health(entity)
        if entity.health <= 0:
            entity.health = 0
            self.on_death(entity, attacker)

    def _send_health(self, entity):
        if not entity.is_bot:
            p = entity
            prof = p.session.profile
            asyncio.ensure_future(p.session.send_raw(prof.update_health(p.health)))

    def on_death(self, entity, killer):
        entity.alive = False
        entity.health = 0.0
        if killer is not None and killer is not entity:
            killer.kills += 1
        entity.deaths += 1
        self.broadcast_world(entity.world, self._death_message(entity, killer))
        # play death effect (game state change + respawn)
        if not entity.is_bot:
            p = entity
            prof = p.session.profile
            frames = [prof.game_state_change(3, 0.0)]
            asyncio.ensure_future(self._send_many(p, frames))
        if entity.mode is not None:
            entity.mode.on_death(self, entity, killer)
        else:
            self.lobby.respawn(self, entity)

    def _death_message(self, entity, killer):
        if killer is not None and killer is not entity:
            return f"§c{killer.name} §7killed §c{entity.name}"
        return f"§7{entity.name} died"

    def respawn_entity(self, entity, x, y, z):
        entity.alive = True
        entity.health = entity.max_health
        entity.knockback = (0.0, 0.0, 0.0)
        entity.set_pos(x, y, z)
        if not entity.is_bot:
            p = entity
            prof = p.session.profile
            frames = [
                prof.game_state_change(3, 0.0),
                prof.update_health(p.health),
                prof.position(p.x, p.y, p.z, p.yaw, p.pitch),
            ]
            asyncio.ensure_future(self._send_many(p, frames))

    # ── entity movement ───────────────────────────────────────────────────
    def move_entity(self, ent, nx, ny, nz, yaw=None, pitch=None):
        """Move a bot with collision-ish checks; returns True if moved."""
        world = ent.world
        if world is None:
            return False
        # clamp into world
        if ny < world.min_y - VOID_MARGIN:
            return False
        # simple collision: don't walk into solid blocks at feet/head
        fx, fy, fz = int(nx), int(ny), int(nz)
        if world.get_state(fx, fy, fz) != 0:
            nx, nz = ent.x, ent.z
        if world.get_state(fx, fy + 1, fz) != 0:
            nx, nz = ent.x, ent.z
        ent.last_x, ent.last_y, ent.last_z = ent.x, ent.y, ent.z
        ent.x, ent.y, ent.z = nx, ny, nz
        if yaw is not None:
            ent.yaw = yaw
        if pitch is not None:
            ent.pitch = pitch
        return True

    def entity_jump(self, ent):
        ent.knockback = (ent.knockback[0], 0.42, ent.knockback[2])

    def _physics(self, ent, dt):
        """Gravity + knockback + void detection for players and bots."""
        if ent.world is None:
            return
        wy = ent.world
        # ground detection
        ground_y = ent.y
        ent.on_ground = False
        for dy in range(0, -6, -1):
            if wy.get_state(int(ent.x), int(ent.y) + dy, int(ent.z)) != 0:
                if dy == 0:
                    ent.on_ground = True
                break
        # apply knockback
        if ent.knockback != (0.0, 0.0, 0.0):
            ent.x += ent.knockback[0]
            ent.z += ent.knockback[2]
            ent.y += ent.knockback[1]
            ent.knockback = (ent.knockback[0] * 0.8, ent.knockback[1], ent.knockback[2] * 0.8)
        # gravity
        if not ent.on_ground:
            ent.y -= 9.81 * dt * 0.6
        # land
        for dy in range(0, -6, -1):
            if wy.get_state(int(ent.x), int(ent.y) + dy, int(ent.z)) != 0:
                if dy < 0 and ent.y != int(ent.y) + dy + 1:
                    ent.y = int(ent.y) + dy + 1
                    ent.on_ground = True
                break
        # void
        if ent.y < wy.min_y - VOID_MARGIN:
            if ent.alive:
                self.damage(ent, 1000.0, attacker=None)

    # ── bots ──────────────────────────────────────────────────────────────
    def create_bot(self, name, world, role="enemy", skill=0.7, aggression=0.6,
                   team=None, personality="hostile", x=0.5, y=70.0, z=0.5):
        bot = Bot(name, self.ids.alloc())
        bot.brain = Brain(role=role, skill=skill, aggression=aggression, personality=personality)
        bot.world = world
        bot.team = team
        bot.set_pos(x, y, z)
        self.bots[bot.entity_id] = bot
        self._spawn_bot_to_world(bot)
        self.log(f"bot spawned: {name} in {world.name}")
        return bot

    def remove_bot(self, bot):
        if bot.entity_id in self.bots:
            del self.bots[bot.entity_id]
        self._despawn_bot(bot)

    def _spawn_bot_to_world(self, bot):
        for p in self.players.values():
            if p.world is bot.world and p.connected and hasattr(p, "_spawned"):
                prof = p.session.profile
                frames = self._spawn_player_frames(prof, bot)
                asyncio.ensure_future(self._send_many(p, frames))

    def _despawn_bot(self, bot):
        for p in self.players.values():
            if p.world is bot.world and p.connected and hasattr(p, "_spawned"):
                prof = p.session.profile
                asyncio.ensure_future(self._send_many(p, [prof.entity_destroy([bot.entity_id])]))

    def bot_chat(self, bot, text):
        self.broadcast_world(bot.world, f"§7[{bot.name}] §f{text}")

    def broadcast_world(self, world, message):
        for p in self.players.values():
            if p.world is world and p.connected:
                self._chat_to(p, message)

    def _chat_to(self, p, message):
        prof = p.session.profile
        frame = prof.system_chat(message)
        if frame:
            asyncio.ensure_future(p.session.send_raw(frame))

    def broadcast_chat(self, p, message):
        msg = f"§7<{p.name}> §f{message}"
        for other in self.players.values():
            if other.world is p.world and other.connected:
                self._chat_to(other, msg)

    def _bot_tick(self, dt):
        for b in self.bots.values():
            if b.brain is not None:
                try:
                    b.brain.tick(self, b, dt)
                except Exception:
                    pass
            self._physics(b, dt)
            # broadcast movement
            self._broadcast_bot_movement(b)

    def _broadcast_bot_movement(self, b):
        moved = (abs(b.x - b.last_x) + abs(b.y - b.last_y) + abs(b.z - b.last_z))
        yaw_changed = abs(b.yaw - b.last_yaw) > 1e-6
        if moved < 1e-6 and not yaw_changed:
            return
        dx = int((b.x - b.last_x) * 4096)
        dy = int((b.y - b.last_y) * 4096)
        dz = int((b.z - b.last_z) * 4096)
        big = abs(b.x - b.last_x) > 4 or abs(b.y - b.last_y) > 4 or abs(b.z - b.last_z) > 4
        b.last_x, b.last_y, b.last_z = b.x, b.y, b.z
        b.last_yaw, b.last_pitch = b.yaw, b.pitch
        for p in self.players.values():
            if p.world is b.world and p.connected and hasattr(p, "_spawned"):
                prof = p.session.profile
                if big:
                    f = prof.entity_teleport(b.entity_id, b.x, b.y, b.z, b.yaw, b.pitch, b.on_ground)
                elif moved and yaw_changed:
                    f = prof.entity_move_look(b.entity_id, dx, dy, dz, b.yaw, b.pitch, b.on_ground)
                elif moved:
                    f = prof.entity_move(b.entity_id, dx, dy, dz, b.on_ground)
                else:
                    f = prof.entity_look(b.entity_id, b.yaw, b.pitch, b.on_ground)
                asyncio.ensure_future(p.session.send_raw(f))

    # ── AI reply ──────────────────────────────────────────────────────────
    async def bot_reply(self, bot, message):
        """One bot's reply to a chat line. Workers AI first (threaded), then a
        local canned line so the bots always feel alive."""
        text = None
        if self.ai_enabled:
            system = {
                "friendly": "You are a friendly Minecraft companion. Reply in the same language as the player, short and fun.",
                "hostile": "You are a competitive Minecraft PvP enemy bot. Taunt briefly, same language as the player.",
                "guide": "You are a helpful Minecraft server guide. Answer briefly.",
            }.get(getattr(bot.brain, "personality", "friendly"),
                  "You are a Minecraft NPC. Reply briefly.")
            try:
                text = await asyncio.to_thread(
                    ai_chat, self.account_id, self.ai_token,
                    [{"role": "system", "content": system},
                     {"role": "user", "content": message}],
                    model=self.ai_model, max_tokens=120,
                    fallback_url=self.ai_fallback_url,
                    gateway_url=self.ai_gateway_url,
                    gateway_token=self.ai_gateway_token)
            except Exception:
                text = None
        if not text:
            text = bot.brain.canned_reply(message)
        return text

    def ai_reply(self, name, personality, message):
        """Synchronous convenience wrapper (kept for compatibility)."""
        if not self.ai_enabled:
            return None
        system = {
            "friendly": "You are a friendly Minecraft companion. Reply in the same language as the player, short and fun.",
            "hostile": "You are a competitive Minecraft PvP enemy bot. Taunt briefly, same language as the player.",
            "guide": "You are a helpful Minecraft server guide. Answer briefly.",
        }.get(personality, "You are a Minecraft NPC. Reply briefly.")
        try:
            return ai_chat(self.account_id, self.ai_token, [
                {"role": "system", "content": system},
                {"role": "user", "content": message},
            ], model=self.ai_model, max_tokens=120,
                fallback_url=self.ai_fallback_url,
                gateway_url=self.ai_gateway_url,
                gateway_token=self.ai_gateway_token)
        except Exception:
            return None

    def ai_available(self):
        return self.ai_enabled

    # ── main tick ─────────────────────────────────────────────────────────
    async def tick_loop(self):
        last = time.time()
        while True:
            await asyncio.sleep(TICK)
            now = time.time()
            dt = min(now - last, 0.1)
            last = now
            try:
                self._tick(dt)
            except Exception:
                self.log("tick error:\n" + traceback.format_exc())

    def _tick(self, dt):
        for p in list(self.players.values()):
            if p.connected:
                self._physics(p, dt)
        self._bot_tick(dt)
        for mode in self.modes.values():
            if mode._world is None:
                continue
            try:
                mode.tick(self, dt)
            except Exception:
                pass

    # ── commands ──────────────────────────────────────────────────────────
    async def on_command(self, p, command):
        parts = command.split(" ")
        cmd = parts[0].lower()
        args = parts[1:]
        prof = p.session.profile

        def reply(msg):
            self._chat_to(p, msg)

        try:
            if cmd in ("help", "?"):
                reply(self.help_text())
            elif cmd in ("menu", "modes", "gamemodes", "gm"):
                reply(self.menu_text())
            elif cmd == "join":
                await self.cmd_join(p, args, reply)
            elif cmd in ("lobby", "hub", "spawn", "leave"):
                self.lobby.join(self, p)
                reply("§aBack to lobby!")
            elif cmd in ("gamemode", "mode"):
                if args and args[0] in ("0", "1", "2", "3", "survival", "creative"):
                    gm = {"survival": 0, "creative": 1, "adventure": 2, "spectator": 3}.get(args[0], int(args[0]) if args[0].isdigit() else 0)
                    p.gamemode = gm
                    await p.session.send_raw(prof.abilities(creative=(gm == 1), allow_flying=(gm == 1)))
                    reply(f"§aGamemode set to {gm}")
                else:
                    reply("§7Usage: /gamemode <0|1|2|3>")
            elif cmd == "companion":
                await self.cmd_companion(p, reply)
            elif cmd == "enemy":
                await self.cmd_enemy(p, args, reply)
            elif cmd == "killbots":
                self.clear_world_bots(p.world)
                reply("§aBots cleared.")
            elif cmd in ("stats", "me"):
                reply(f"§7Kills: §f{p.kills} §7Deaths: §f{p.deaths}")
            elif cmd == "list":
                names = ", ".join(pp.name for pp in self.players.values() if pp.connected)
                reply(f"§7Online ({len(self.players)}): §f{names}")
            elif cmd in ("server", "info", "version"):
                reply(f"§a{self.name} §7— supports Minecraft 1.8 → 26.x (Java), Bedrock beta")
            elif cmd == "fly":
                p.gamemode = 1
                await p.session.send_raw(prof.abilities(creative=True, allow_flying=True, flying=True))
                reply("§aCreative flight enabled. /gamemode 0 to disable.")
            elif cmd == "heal":
                p.health = p.max_health
                await p.session.send_raw(prof.update_health(p.health))
                reply("§aHealed!")
            elif cmd == "ai":
                self.ai_enabled = not self.ai_enabled
                reply(f"§7Bot AI chat: §f{'ON' if self.ai_enabled else 'OFF'}")
            elif cmd == "tp":
                if len(args) >= 3:
                    p.set_pos(float(args[0]), float(args[1]), float(args[2]))
                    await p.session.send_raw(prof.position(p.x, p.y, p.z, p.yaw, p.pitch))
                    reply("§aTeleported.")
                else:
                    reply("§7Usage: /tp <x> <y> <z>")
            else:
                reply(f"§cUnknown command §7{cmd}. §fType /help")
        except Exception as e:
            self.log(f"command error: {cmd} {e!r}")
            reply("§cCommand error.")

    def help_text(self):
        return "\n".join([
            "§6§lAMINCK Nova — Help",
            "§f/menu §7— list gamemodes",
            "§f/join <mode> §7— join a gamemode",
            "§f/lobby §7— back to hub",
            "§f/gamemode <0|1|2|3>",
            "§f/companion §7— spawn a friendly AI",
            "§f/enemy <n> §7— spawn hostile AI bots",
            "§f/killbots §7— clear AI bots",
            "§f/stats /list /tp /fly /heal /ai /server",
        ])

    def menu_text(self):
        lines = ["§6§lGamemodes §7(/join <name>):", ""]
        for m in self.modes.values():
            if m.id == "lobby":
                continue
            lines.append(f"§f/{m.id:12s} §7— {m.desc}")
        return "\n".join(lines)

    async def cmd_join(self, p, args, reply):
        if not args:
            reply(self.menu_text())
            return
        key = args[0].lower()
        mode = self.modes.get(key)
        if mode is None:
            reply(f"§cUnknown mode §7{key}. §f/menu")
            return
        mode.join(self, p)
        reply(f"§aYou joined §f{mode.name}§a! §7(/lobby to leave)")

    async def cmd_companion(self, p, reply):
        if p.mode is None or p.mode.id == "lobby":
            reply("§7Join survival first: §f/join survival")
            return
        bot = self.create_bot("Nova", p.world, role="companion", skill=0.75,
                              personality="friendly", x=p.x + 2, y=p.y, z=p.z)
        bot.brain.set_follow(p)
        reply("§aYour companion §fNova§a has spawned and will follow you!")

    async def cmd_enemy(self, p, args, reply):
        if p.mode is None or p.mode.id == "lobby":
            reply("§7Join a PvP mode first.")
            return
        n = int(args[0]) if args and args[0].isdigit() else 1
        n = max(1, min(n, 8))
        for i in range(n):
            ang = random.uniform(0, math.tau)
            x = p.x + math.cos(ang) * 12
            z = p.z + math.sin(ang) * 12
            bot = self.create_bot(f"Raider{i+1}", p.world, role="enemy", skill=0.72,
                                  personality="hostile", x=x, y=p.y, z=z)
            bot.brain.set_hunt(p)
        reply(f"§c{n} enemy bot(s) spawned!")

    def clear_world_bots(self, world):
        for b in list(self.bots.values()):
            if b.world is world:
                self.remove_bot(b)

    # ── helpers for gamemodes ─────────────────────────────────────────────
    def world(self, key):
        return self.modes[key].world

    def announce(self, world, message):
        self.broadcast_world(world, message)

    def reg_for_lobby(self):
        return self.canonical_reg

    def world_bots(self, world):
        return [b for b in self.bots.values() if b.world is world]

    def _resend_world(self, player):
        """Resend chunks + entities after switching worlds."""
        player._spawned = False
        self._send_chunks(player)
        self._flush(player)

    def despawn_from_world(self, player, world):
        """Remove player entity from viewers in `world`."""
        for other in self.players.values():
            if other is player and other.world is world:
                continue
            if other.world is world and other.connected and hasattr(other, "_spawned"):
                prof = other.session.profile
                frames = [prof.entity_destroy([player.entity_id])]
                asyncio.ensure_future(self._send_many(other, frames))
