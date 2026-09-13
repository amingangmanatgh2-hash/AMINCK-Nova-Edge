"""GameServer: worlds, players, bots, physics, combat, chat/commands, AI,
economy, ranks, scoreboard, time/weather and admin actions."""
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
from . import economy as _econ

TICK = 1.0 / 20.0
VOID_MARGIN = 10
SB_OBJECTIVE = "nova_sidebar"


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
        self.admin_password = config.get("admin_password", "") or ""
        self.admin_names = {n.strip().lower() for n in
                            (config.get("admin_names", "") or "").split(",") if n.strip()}
        self.site_url = config.get("site_url", "") or ""
        self.difficulty = config.get("difficulty", "normal") or "normal"
        self.scoreboard_on = bool(config.get("scoreboard", True))
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

        # world time / weather
        self.world_time = 0          # day ticks (0..24000)
        self.world_age = 0
        self.weather = "clear"       # clear | rain | thunder
        self._time_broadcast = 0.0
        self._weather_levels = {"clear": (0.0, 0.0), "rain": (1.0, 0.0), "thunder": (1.0, 1.0)}

        # TPS measurement
        self._tick_times = []
        self.tps = 20.0

        # economy + persistence
        self.econ = _econ.Economy(self)

        # canonical block registry (modern names) — worlds store canonical ids
        self.canonical_reg = Registry(mcdata.load(775))
        # lobby + gamemode registry
        self.modes = G.build_modes(self)
        self.lobby = self.modes["lobby"]

    # ── admin ──────────────────────────────────────────────────────────────
    def is_admin(self, p):
        if not p:
            return False
        return getattr(p, "admin", False) or p.name.lower() in self.admin_names

    def check_admin_password(self, password):
        if not self.admin_password:
            return False
        import hmac as _hmac
        return _hmac.compare_digest(str(password), str(self.admin_password))

    def is_banned(self, name):
        return self.econ.is_banned(name)

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
        desc = f"§a§l{self.name}\n§r{self.motd}"
        if self.site_url:
            desc += f"\n§b§o{self.site_url}"
        return _json.dumps({
            "version": {"name": f"{self.name} 1.8→26.x", "protocol": proto},
            "players": {"max": 100, "online": online, "sample": []},
            "description": {"text": desc},
            "favicon": getattr(self, "favicon_data_uri", ""),
        })

    # ── player lifecycle ──────────────────────────────────────────────────
    def on_login(self, session):
        p = Player(session)
        p.entity_id = self.ids.alloc()
        p.uuid = session.uuid
        p.name = session.username
        p.admin = p.name.lower() in self.admin_names
        p._join_ts = time.time()
        session.player = p
        self.players[p.name.lower()] = p
        self.econ.get(p.name)  # ensure a record exists
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
        self._queue(p, prof.update_time(self.world_age, self.world_time))
        self._queue(p, prof.spawn_position(int(p.x), int(p.y), int(p.z)))
        self._queue(p, prof.abilities(creative=(p.gamemode == 1), allow_flying=(p.gamemode == 1)))
        self._queue(p, prof.update_health(p.health))
        self._queue(p, prof.position(p.x, p.y, p.z, p.yaw, p.pitch))
        # weather state
        rain, thunder = self._weather_levels.get(self.weather, (0.0, 0.0))
        self._queue(p, prof.game_state_change(7, rain))
        self._queue(p, prof.game_state_change(8, thunder))
        # experience
        lvl = self.econ.level(p.name)
        xp_total = self.econ.xp(p.name)
        self._queue(p, prof.experience(0.0, lvl, xp_total))
        self._send_chunks(p)
        self._queue(p, self._scoreboard_setup_frames(p))
        self._flush(p)
        self._welcome(p)

    def _welcome(self, p):
        lines = [f"§6§lWelcome to {self.name}§r §7— Java 1.8 → 26.x"]
        lines.append("§7Type §f/menu §7for gamemodes, §f/help §7for commands.")
        if self.site_url:
            lines.append(f"§bWebsite & shop: §f{self.site_url}")
        for ln in lines:
            self._chat_to(p, ln)

    # ── scoreboard ─────────────────────────────────────────────────────────
    def _scoreboard_setup_frames(self, p):
        """Objective + display + all known scores for this player."""
        prof = p.session.profile
        frames = []
        if not self.scoreboard_on or prof.proto < 393:
            return frames
        f = prof.scoreboard_objective(SB_OBJECTIVE, f"§6§l{self.name}")
        if f:
            frames.append(f)
        f = prof.scoreboard_display(1, SB_OBJECTIVE)
        if f:
            frames.append(f)
        for other in self.players.values():
            if other.connected:
                f = prof.scoreboard_score(other.name, SB_OBJECTIVE, self.econ.coins(other.name))
                if f:
                    frames.append(f)
        f = prof.scoreboard_score(p.name, SB_OBJECTIVE, self.econ.coins(p.name))
        if f:
            frames.append(f)
        return frames

    def refresh_score(self, name):
        """Update one player's sidebar score for everyone in their world."""
        p = self.players.get(name.lower())
        if not p:
            return
        score = self.econ.coins(name)
        frames = {}
        for other in self.players.values():
            if not other.connected:
                continue
            if other.world is not p.world:
                continue
            prof = other.session.profile
            f = prof.scoreboard_score(name, SB_OBJECTIVE, score)
            if f:
                frames[other.name.lower()] = f
        for oname, f in frames.items():
            o = self.players.get(oname)
            if o and o.connected:
                asyncio.ensure_future(o.session.send_raw(f))

    def remove_score(self, name):
        for other in self.players.values():
            if not other.connected:
                continue
            prof = other.session.profile
            f = prof.scoreboard_score(name, SB_OBJECTIVE, 0, remove=True)
            if f:
                asyncio.ensure_future(other.session.send_raw(f))

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
        # persist playtime + stats
        rec = self.econ.data["players"].get(p.name.lower())
        if rec:
            rec["playtime"] = rec.get("playtime", 0) + int(time.time() - getattr(p, "_join_ts", time.time()))
            self.econ.save()
        self.remove_score(p.name)
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
        # mute check
        if self.econ.is_muted(p.name):
            self._chat_to(p, "§cYou are muted.")
            return
        # in-game chat
        self.broadcast_chat(p, message)
        self._quest_progress(p, "chat")
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
            # economy: reward kills (bots and players), xp + coins
            if not killer.is_bot:
                reward = 10 if getattr(entity, "is_bot", False) else 25
                self.econ.add_kill(killer.name)
                self.econ.add_coins(killer.name, reward)
                leveled = self.econ.add_xp(killer.name, 15)
                self.refresh_score(killer.name)
                self._chat_to(killer, f"§6+{reward} coins §7(+15 XP)")
                if leveled:
                    self._chat_to(killer, f"§a§lLEVEL UP! §fYou are now level {self.econ.level(killer.name)}")
                    asyncio.ensure_future(self._send_many(killer, killer.session.profile.title(title="§a§lLEVEL UP!")))
                self._quest_progress(killer, "kill")
        entity.deaths += 1
        if not entity.is_bot:
            self.econ.add_death(entity.name)
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
            return f"§c{killer.name} §7killed §c{entity.name} §7(+coins)"
        return f"§7{entity.name} died"

    # ── daily quest ────────────────────────────────────────────────────────
    def _quest_progress(self, player, kind):
        rec = self.econ.get(player.name)
        day = time.strftime("%Y-%m-%d")
        if rec.get("quest_day") != day:
            rec["quest_day"] = day
            rec["quest_progress"] = {}
            rec["quest_done"] = False
            self.econ.save()
        if rec.get("quest_done"):
            return
        prog = rec["quest_progress"].get(kind, 0) + 1
        rec["quest_progress"][kind] = prog
        need = {"kill": 5, "join": 3, "chat": 5}.get(kind, 5)
        if prog >= need:
            rec["quest_done"] = True
            self.econ.add_coins(player.name, 150)
            self.econ.add_xp(player.name, 60)
            self._chat_to(player, "§a§lDaily quest complete! §f+150 coins, +60 XP 🎉")
            self.refresh_score(player.name)
        self.econ.save()

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
                   team=None, personality="hostile", x=0.5, y=70.0, z=0.5,
                   difficulty=None):
        if difficulty is None and role == "enemy":
            difficulty = self.difficulty
        bot = Bot(name, self.ids.alloc())
        bot.brain = Brain(role=role, skill=skill, aggression=aggression,
                          personality=personality, difficulty=difficulty)
        bot.world = world
        bot.team = team
        bot.set_pos(x, y, z)
        self.bots[bot.entity_id] = bot
        self._spawn_bot_to_world(bot)
        self.log(f"bot spawned: {name} in {world.name} (difficulty={bot.brain.difficulty})")
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
        info = self.econ.rank_info(p.name)
        prefix = info["color"] + info["label"] + " " if info["label"] != "Player" else ""
        msg = f"§8[{prefix}§f{p.name}§8] §f{message}"
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
        t0 = time.perf_counter()
        # advance world time + periodic broadcast
        self.world_age += 1
        self.world_time = (self.world_time + 1) % 24000
        self._time_broadcast += dt
        if self._time_broadcast >= 10.0:
            self._time_broadcast = 0.0
            self._broadcast_time()
            self.econ.save()
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
        # TPS measurement
        self._tick_times.append(time.perf_counter() - t0)
        if len(self._tick_times) > 40:
            self._tick_times.pop(0)
        avg = sum(self._tick_times) / max(1, len(self._tick_times))
        self.tps = min(20.0, 1.0 / avg) if avg > 0 else 20.0

    # ── commands ──────────────────────────────────────────────────────────
    async def on_command(self, p, command):
        parts = command.split(" ")
        cmd = parts[0].lower()
        args = parts[1:]
        prof = p.session.profile

        def reply(msg):
            self._chat_to(p, msg)

        def admin_only():
            if not self.is_admin(p):
                reply("§cYou need admin permissions for this. §7(/adminlogin <password>)")
                return False
            return True

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
                gm_map = {"survival": 0, "creative": 1, "adventure": 2, "spectator": 3}
                if args and args[0] in gm_map or (args and args[0].isdigit() and 0 <= int(args[0]) <= 3):
                    gm = gm_map.get(args[0], int(args[0]))
                    p.gamemode = gm
                    await p.session.send_raw(prof.abilities(creative=(gm == 1), allow_flying=(gm in (1, 2))))
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
                s = self.econ.stats(p.name)
                reply(f"§7Rank: §f{self.econ.rank_info(p.name)['color']}{self.econ.rank_info(p.name)['label']} "
                      f"§7| Level: §f{s['level']} §7| XP: §f{s['xp']} §7| Coins: §f{s['coins']} "
                      f"§7| Kills: §f{s['kills']} §7| Deaths: §f{s['deaths']}")
            elif cmd in ("coins", "bal", "money"):
                reply(f"§6Coins: §f{self.econ.coins(p.name)}")
            elif cmd == "pay":
                await self.cmd_pay(p, args, reply)
            elif cmd == "shop":
                reply(self.shop_text())
            elif cmd == "buy":
                await self.cmd_buy(p, args, reply)
            elif cmd == "redeem":
                if not args:
                    reply("§7Usage: /redeem <code>")
                else:
                    r = self.econ.redeem_code(p.name, args[0])
                    reply(f"§aCode redeemed: §f{r}§a!" if r else "§cInvalid or used code.")
            elif cmd in ("rank", "ranks"):
                reply(self.ranks_text())
            elif cmd in ("kit", "kits"):
                await self.cmd_kit(p, args, reply)
            elif cmd in ("xp", "level"):
                reply(f"§aLevel {self.econ.level(p.name)} §7({self.econ.xp(p.name)} XP)")
            elif cmd in ("quest", "quests"):
                reply(self.quest_text(p))
            elif cmd == "sethome":
                await self.cmd_sethome(p, args, reply)
            elif cmd == "home":
                await self.cmd_home(p, args, reply)
            elif cmd == "delhome":
                await self.cmd_delhome(p, args, reply)
            elif cmd == "homes":
                hs = self.econ.homes(p.name)
                reply("§7Homes: §f" + (", ".join(hs) if hs else "none"))
            elif cmd == "setwarp":
                if not admin_only():
                    return
                await self.cmd_setwarp(p, args, reply)
            elif cmd == "warp":
                await self.cmd_warp(p, args, reply)
            elif cmd == "delwarp":
                if not admin_only():
                    return
                await self.cmd_delwarp(p, args, reply)
            elif cmd == "warps":
                ws = self.econ.warps()
                reply("§7Warps: §f" + (", ".join(ws) if ws else "none"))
            elif cmd == "msg":
                await self.cmd_msg(p, args, reply)
            elif cmd == "r":
                await self.cmd_reply(p, args, reply)
            elif cmd == "list":
                names = ", ".join(pp.name for pp in self.players.values() if pp.connected)
                reply(f"§7Online ({len(self.players)}): §f{names}")
            elif cmd in ("server", "info", "version"):
                reply(f"§a{self.name} §7— Java 1.8 → 26.x, Bedrock ping. §f/site")
            elif cmd == "site":
                if self.site_url:
                    reply(f"§bWebsite & shop: §f{self.site_url}")
                else:
                    reply("§7No site URL configured.")
            elif cmd in ("ping", "tps"):
                reply(f"§7TPS: §f{self.tps:.1f} §7| Uptime: §f{self._uptime()}")
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
            elif cmd == "scoreboard":
                self.scoreboard_on = not self.scoreboard_on
                reply(f"§7Sidebar scoreboard: §f{'ON' if self.scoreboard_on else 'OFF'}")
            elif cmd == "tp":
                if len(args) >= 3:
                    p.set_pos(float(args[0]), float(args[1]), float(args[2]))
                    await p.session.send_raw(prof.position(p.x, p.y, p.z, p.yaw, p.pitch))
                    reply("§aTeleported.")
                else:
                    reply("§7Usage: /tp <x> <y> <z>")
            elif cmd == "time":
                await self.cmd_time(p, args, reply, admin_only)
            elif cmd == "weather":
                await self.cmd_weather(p, args, reply, admin_only)
            elif cmd == "give":
                if not admin_only():
                    return
                await self.cmd_give(p, args, reply)
            elif cmd == "broadcast":
                if not admin_only():
                    return
                if args:
                    msg = " ".join(args)
                    self.broadcast_all(f"§6§l[Broadcast] §r{msg}")
                    reply("§aBroadcast sent.")
                else:
                    reply("§7Usage: /broadcast <message>")
            elif cmd == "kick":
                if not admin_only():
                    return
                await self.cmd_kick(p, args, reply)
            elif cmd == "ban":
                if not admin_only():
                    return
                await self.cmd_ban(p, args, reply)
            elif cmd == "unban":
                if not admin_only():
                    return
                if args:
                    self.econ.unban(args[0])
                    reply(f"§aUnbanned {args[0]}.")
            elif cmd == "mute":
                if not admin_only():
                    return
                await self.cmd_mute(p, args, reply)
            elif cmd == "unmute":
                if not admin_only():
                    return
                if args:
                    self.econ.unmute(args[0])
                    reply(f"§aUnmuted {args[0]}.")
            elif cmd == "adminlogin":
                if args and self.check_admin_password(args[0]):
                    p.admin = True
                    reply("§aYou are now admin.")
                else:
                    reply("§cWrong password.")
            else:
                reply(f"§cUnknown command §7{cmd}. §fType /help")
        except Exception as e:
            self.log(f"command error: {cmd} {e!r}")
            reply("§cCommand error.")

    def _uptime(self):
        u = int(time.time() - self.started)
        h, m, s = u // 3600, (u % 3600) // 60, u % 60
        return f"{h}h {m}m {s}s"

    def help_text(self):
        return "\n".join([
            "§6§lAMINCK Nova — Help",
            "§7── Play ──",
            "§f/menu §7- gamemodes §8| §f/join <mode> §8| §f/lobby §8| §f/gamemode <0-3>",
            "§f/companion §8| §f/enemy <n> §8| §f/killbots §8| §f/fly §8| §f/heal §8| §f/tp <x y z>",
            "§7── Economy ──",
            "§f/coins §8| §f/pay <name> <n> §8| §f/shop §8| §f/buy <item> §8| §f/redeem <code>",
            "§f/rank §8| §f/kit <name> §8| §f/xp §8| §f/quest",
            "§7── Utility ──",
            "§f/sethome [n] §8| §f/home [n] §8| §f/delhome §8| §f/warp <n> §8| §f/warps",
            "§f/msg <name> <text> §8| §f/r <text> §8| §f/stats §8| §f/list §8| §f/site §8| §f/tps",
        ])

    def menu_text(self):
        lines = ["§6§lGamemodes §7(/join <name>):", ""]
        for m in self.modes.values():
            if m.id == "lobby":
                continue
            lines.append(f"§f/{m.id:12s} §7— {m.desc}")
        return "\n".join(lines)

    def shop_text(self):
        lines = ["§6§lShop §7(/buy <id>):", ""]
        for c in _econ.CATALOG:
            price = f"§6{c['price_coins']} coins" if c.get("price_coins") else f"§b{c['price_toman']} Toman (site)"
            lines.append(f"§f{c['id']:14s} §7{c['name']} — {price}")
        lines.append("")
        lines.append(f"§7Site shop: §f{self.site_url or '(not set)'}")
        return "\n".join(lines)

    def ranks_text(self):
        lines = ["§6§lRanks:", ""]
        for rid, r in _econ.RANKS.items():
            lines.append(f"{r['color']}{rid} §7— {r['label']} (fly={r['fly']}, coin ×{r['coin_mult']})")
        return "\n".join(lines)

    def quest_text(self, p):
        rec = self.econ.get(p.name)
        day = time.strftime("%Y-%m-%d")
        if rec.get("quest_day") != day:
            return "§7Daily quest: §fkill 5 enemies §7→ §f+150 coins, +60 XP"
        if rec.get("quest_done"):
            return "§aDaily quest complete! §7Come back tomorrow."
        prog = rec.get("quest_progress", {}).get("kill", 0)
        return f"§7Daily quest: kill 5 enemies §f({prog}/5) §7→ +150 coins, +60 XP"

    # ── command handlers ───────────────────────────────────────────────────
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
        self._quest_progress(p, "join")
        reply(f"§aYou joined §f{mode.name}§a! §7(/lobby to leave)")

    async def cmd_companion(self, p, reply):
        if p.mode is None or p.mode.id == "lobby":
            reply("§7Join survival first: §f/join survival")
            return
        bot = self.create_bot("Nova", p.world, role="companion", skill=0.75,
                              personality="friendly", x=p.x + 2, y=p.y, z=p.z)
        bot.brain.set_follow(p)
        bot.brain.set_owner(p)
        reply("§aYour companion §fNova§a has spawned and will follow + defend you!")

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
        reply(f"§c{n} enemy bot(s) spawned §7(difficulty: {self.difficulty})!")

    async def cmd_pay(self, p, args, reply):
        if len(args) < 2 or not args[1].isdigit():
            reply("§7Usage: /pay <name> <amount>")
            return
        target = self.players.get(args[0].lower())
        if not target or not target.connected:
            reply("§cPlayer not online.")
            return
        amt = int(args[1])
        if amt <= 0:
            return
        if self.econ.spend(p.name, amt):
            self.econ.add_coins(target.name, amt)
            self.refresh_score(p.name)
            self.refresh_score(target.name)
            reply(f"§aPaid §f{amt} §acoins to §f{target.name}§a.")
            self._chat_to(target, f"§6{p.name} §7paid you §f{amt} §7coins.")
        else:
            reply("§cNot enough coins.")

    async def cmd_buy(self, p, args, reply):
        if not args:
            reply("§7Usage: /buy <item id> — see /shop")
            return
        item = _econ.CATALOG_BY_ID.get(args[0].lower())
        if not item:
            reply("§cUnknown item. §f/shop")
            return
        if item.get("price_coins") is None:
            reply(f"§bThis item is bought on the site: §f{self.site_url or '(site not set)'}")
            return
        price = item["price_coins"]
        if not self.econ.spend(p.name, price):
            reply("§cNot enough coins.")
            return
        if item["type"] == "rank":
            self.econ.set_rank(p.name, item["rank"])
            reply(f"§aYou are now §f{_econ.RANKS[item['rank']]['color']}{item['rank'].upper()}§a!")
        elif item["type"] == "kit":
            rec = self.econ.get(p.name)
            rec.setdefault("kits", []).append(item["kit"])
            self.econ.save()
            reply(f"§aKit unlocked: §f{item['kit']}")
        self.refresh_score(p.name)

    async def cmd_kit(self, p, args, reply):
        if not args:
            allowed = set(self.econ.rank_info(p.name)["kits"]) | set(self.econ.get(p.name).get("kits", [])) | {"builder"}
            reply("§7Your kits: §f" + (", ".join(sorted(allowed)) or "none"))
            return
        kit = args[0].lower()
        allowed = set(self.econ.rank_info(p.name)["kits"]) | set(self.econ.get(p.name).get("kits", []))
        if kit not in allowed and not self.is_admin(p):
            reply("§cYou don't own this kit. §f/rank")
            return
        items = _econ.KITS.get(kit)
        if not items:
            reply("§cUnknown kit.")
            return
        self.give_items(p, items)
        reply(f"§aKit §f{kit}§a given!")

    async def cmd_sethome(self, p, args, reply):
        name = args[0].lower() if args else "home"
        ok = self.econ.set_home(p.name, name, (p.x, p.y, p.z, p.world.name if p.world else "lobby"))
        reply(f"§aHome '{name}' set." if ok else "§cMax homes reached (10).")

    async def cmd_home(self, p, args, reply):
        name = args[0].lower() if args else "home"
        pos = self.econ.home(p.name, name)
        if not pos:
            reply("§cNo such home.")
            return
        x, y, z, wname = pos
        if p.world is None or p.world.name != wname:
            mode = self.modes.get(wname) or self.modes.get("survival")
            mode.join(self, p)
        p.set_pos(x, y, z)
        await p.session.send_raw(p.session.profile.position(x, y, z, p.yaw, p.pitch))
        reply(f"§aTeleported home ({name}).")

    async def cmd_delhome(self, p, args, reply):
        name = args[0].lower() if args else "home"
        reply("§aHome deleted." if self.econ.del_home(p.name, name) else "§cNo such home.")

    async def cmd_setwarp(self, p, args, reply):
        if not args:
            reply("§7Usage: /setwarp <name>")
            return
        self.econ.set_warp(args[0].lower(), (p.x, p.y, p.z, p.world.name if p.world else "lobby"))
        reply(f"§aWarp '{args[0]}' set.")

    async def cmd_warp(self, p, args, reply):
        if not args:
            reply("§7Usage: /warp <name>")
            return
        pos = self.econ.warp(args[0].lower())
        if not pos:
            reply("§cNo such warp.")
            return
        x, y, z, wname = pos
        if p.world is None or p.world.name != wname:
            (self.modes.get(wname) or self.modes.get("survival")).join(self, p)
        p.set_pos(x, y, z)
        await p.session.send_raw(p.session.profile.position(x, y, z, p.yaw, p.pitch))
        reply(f"§aWarped to {args[0]}.")

    async def cmd_delwarp(self, p, args, reply):
        if args and self.econ.del_warp(args[0].lower()):
            reply("§aWarp deleted.")
        else:
            reply("§cNo such warp.")

    async def cmd_msg(self, p, args, reply):
        if len(args) < 2:
            reply("§7Usage: /msg <name> <message>")
            return
        target = self.players.get(args[0].lower())
        if not target or not target.connected:
            reply("§cPlayer not online.")
            return
        msg = " ".join(args[1:])
        self._chat_to(target, f"§d{p.name} §8→ §dYou§7: §f{msg}")
        target._last_msg = p.name
        reply(f"§7You §8→ §d{target.name}§7: §f{msg}")

    async def cmd_reply(self, p, args, reply):
        if not args or not getattr(p, "_last_msg", None):
            reply("§7No one to reply to.")
            return
        target = self.players.get(p._last_msg.lower())
        if not target or not target.connected:
            reply("§cPlayer offline.")
            return
        msg = " ".join(args)
        self._chat_to(target, f"§d{p.name} §8→ §dYou§7: §f{msg}")
        reply(f"§7You §8→ §d{target.name}§7: §f{msg}")

    async def cmd_time(self, p, args, reply, admin_only):
        times = {"day": 1000, "noon": 6000, "night": 13000, "midnight": 18000}
        if not args:
            reply(f"§7Time: §f{self.world_time} ticks")
            return
        if not admin_only():
            return
        if args[0] in times:
            self.set_time(times[args[0]])
            reply(f"§aTime set to {args[0]}.")
        elif args[0].isdigit():
            self.set_time(int(args[0]) % 24000)
            reply("§aTime set.")
        else:
            reply("§7Usage: /time <day|noon|night|midnight|ticks>")

    async def cmd_weather(self, p, args, reply, admin_only):
        if not args:
            reply(f"§7Weather: §f{self.weather}")
            return
        if not admin_only():
            return
        w = args[0].lower()
        if w in ("clear", "rain", "thunder"):
            self.set_weather(w)
            reply(f"§aWeather set to {w}.")
        else:
            reply("§7Usage: /weather <clear|rain|thunder>")

    async def cmd_give(self, p, args, reply):
        if not args:
            reply("§7Usage: /give <item> [count]")
            return
        name = args[0]
        count = int(args[1]) if len(args) > 1 and args[1].isdigit() else 1
        prof = p.session.profile
        item_id = prof.reg.item_id(name)
        if item_id is None or item_id == 1 and name not in ("air",):
            reply(f"§cUnknown item '{name}'.")
            return
        slot = 36 + (p.held_slot % 9)
        await p.session.send_raw(prof.set_slot(-2, slot, item_id, count))
        inv = getattr(p, "inventory", None) or {}
        inv[name] = inv.get(name, 0) + count
        p.inventory = inv
        reply(f"§aGave §f{count}× {name}§a.")

    async def cmd_kick(self, p, args, reply):
        if not args:
            reply("§7Usage: /kick <name> [reason]")
            return
        target = self.players.get(args[0].lower())
        if not target:
            reply("§cPlayer not online.")
            return
        reason = " ".join(args[1:]) or "Kicked by admin"
        asyncio.ensure_future(target.session.disconnect(reason))
        reply(f"§aKicked {target.name}.")

    async def cmd_ban(self, p, args, reply):
        if not args:
            reply("§7Usage: /ban <name> [reason]")
            return
        self.econ.ban(args[0])
        target = self.players.get(args[0].lower())
        if target:
            reason = " ".join(args[1:]) or "Banned"
            asyncio.ensure_future(target.session.disconnect(reason))
        reply(f"§aBanned {args[0]}.")

    async def cmd_mute(self, p, args, reply):
        if not args:
            reply("§7Usage: /mute <name> [minutes]")
            return
        minutes = int(args[1]) if len(args) > 1 and args[1].isdigit() else 30
        self.econ.mute(args[0], minutes * 60)
        reply(f"§aMuted {args[0]} for {minutes} min.")

    # ── game-wide actions (commands + panel) ───────────────────────────────
    def set_time(self, ticks):
        self.world_time = ticks % 24000
        self._broadcast_time()

    def set_weather(self, weather):
        self.weather = weather
        rain, thunder = self._weather_levels.get(weather, (0.0, 0.0))
        for p in self.players.values():
            if p.connected and hasattr(p, "_spawned"):
                prof = p.session.profile
                asyncio.ensure_future(self._send_many(p, [prof.game_state_change(7, rain),
                                                          prof.game_state_change(8, thunder)]))

    def _broadcast_time(self):
        for p in self.players.values():
            if p.connected and hasattr(p, "_spawned"):
                asyncio.ensure_future(p.session.send_raw(
                    p.session.profile.update_time(self.world_age, self.world_time)))

    def broadcast_all(self, message):
        for p in self.players.values():
            if p.connected:
                self._chat_to(p, message)

    def give_items(self, p, items):
        prof = p.session.profile
        inv = getattr(p, "inventory", None) or {}
        slot = 36
        for name, count in items:
            item_id = prof.reg.item_id(name)
            if item_id is None:
                continue
            asyncio.ensure_future(p.session.send_raw(prof.set_slot(-2, slot, item_id, count)))
            inv[name] = inv.get(name, 0) + count
            slot += 1
        p.inventory = inv

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
