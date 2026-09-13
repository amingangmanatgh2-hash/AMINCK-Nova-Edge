"""Gamemodes: lobby, survival, creative, skywars, bedwars, sumo, parkour,
practice, kitpvp, spleef, tntrun, mlg, duels, zombies, bridge, hungergames,
hideseek, buildbattle."""
import random, time
from . import maps


class Gamemode:
    id = "base"
    name = "Base"
    desc = ""
    builder = None
    default_gamemode = 0

    def __init__(self, game):
        self.game = game
        self._world = None

    @property
    def world(self):
        if self._world is None:
            self._world, self.spawns, self.extra = type(self).builder(self.game.reg_for_lobby())
            import traceback
            self.game.log(f"world built: {self.id}")
            self.on_world_ready()
        return self._world

    def on_world_ready(self):
        pass

    def bots(self):
        return self.game.world_bots(self.world)

    def join(self, game, player):
        if player.mode is not None and player.mode is not self:
            player.mode.leave(game, player)
        old_world = player.world
        player.mode = self
        player.world = self.world
        player.gamemode = self.default_gamemode
        if old_world is not None and old_world is not self.world:
            game.despawn_from_world(player, old_world)
        self.respawn(game, player)
        self._send_spawn_packets(game, player)
        self.on_join(game, player)

    def _send_spawn_packets(self, game, player):
        prof = player.session.profile
        frames = [
            prof.abilities(creative=(player.gamemode == 1), allow_flying=(player.gamemode in (1, 2)),
                           flying=False),
            prof.update_health(player.health),
            prof.position(player.x, player.y, player.z, player.yaw, player.pitch),
            prof.game_state_change(3, 0.0),
        ]
        import asyncio
        async def send():
            for f in frames:
                if player.session.closed:
                    return
                await player.session.send_raw(f)
            player._send_chunks2 = True
        asyncio.ensure_future(send())
        # resend chunks for the new world
        game._resend_world(player)

    def leave(self, game, player):
        self.on_leave(game, player)

    def respawn(self, game, entity):
        sx, sy, sz = self._pick_spawn(entity)
        entity.alive = True
        entity.health = entity.max_health
        entity.knockback = (0.0, 0.0, 0.0)
        entity.set_pos(sx, sy, sz)
        if not entity.is_bot:
            self._send_spawn_packets(game, entity)

    def _pick_spawn(self, entity):
        if isinstance(self.spawns, dict):
            sp = list(self.spawns.values())[0]
        else:
            sp = random.choice(self.spawns)
        return sp

    # hooks
    def on_join(self, game, player): pass
    def on_leave(self, game, player): pass
    def on_move(self, game, player): pass
    def on_death(self, game, entity, killer): self.respawn(game, entity)
    def tick(self, game, dt): pass
    def handle_break(self, game, player, x, y, z):
        game.set_block_and_broadcast(player, x, y, z, "air")
    def handle_place(self, game, player, x, y, z, face):
        game.set_block_and_broadcast(player, x, y, z, "stone")


class Lobby(Gamemode):
    id = "lobby"
    name = "Lobby"
    desc = "hub"
    builder = maps.build_lobby
    default_gamemode = 2

    def on_join(self, game, player):
        pads = self.extra.get("pads", {})
        game._chat_to(player, f"§aWelcome to §6§l{game.name}§a! §7Type §f/menu §7for gamemodes.")


class Survival(Gamemode):
    id = "survival"
    name = "Survival"
    desc = "survival with AI companion & enemies"
    builder = maps.build_survival
    default_gamemode = 0

    def on_world_ready(self):
        pass

    def on_join(self, game, player):
        game._chat_to(player, "§aSurvival! §f/companion §7to get an AI friend, §f/enemy 3 §7for a fight.")


class Creative(Gamemode):
    id = "creative"
    name = "Creative"
    desc = "free build"
    builder = maps.build_survival
    default_gamemode = 1

    def on_join(self, game, player):
        game._chat_to(player, "§aCreative — build anything, fly with double-tap space.")


class SkyWars(Gamemode):
    id = "skywars"
    name = "SkyWars"
    desc = "last one standing wins"
    builder = maps.build_skywars
    default_gamemode = 0

    def on_world_ready(self):
        for i, sp in enumerate(self.spawns):
            b = self.game.create_bot(f"SkyBot{i+1}", self.world, role="enemy",
                                     skill=0.7, personality="hostile", x=sp[0], y=sp[1], z=sp[2])
            b.brain.set_hunt(None)

    def on_death(self, game, entity, killer):
        # no respawn in skywars — spectate (send to lobby)
        game._chat_to(entity if not entity.is_bot else None, "") if False else None
        if not entity.is_bot:
            entity.alive = False
            game._chat_to(entity, "§cYou died! §7Type §f/lobby §7to leave.")
        self.check_win(game)

    def tick(self, game, dt):
        self.check_win(game)

    def check_win(self, game):
        if self._world is None:
            return
        alive = [p for p in game.players.values() if p.world is self.world and p.alive and p.connected]
        if alive and all(not p.alive for p in game.players.values() if p.world is self.world and p.connected and p is not alive[0]) and len([p for p in game.players.values() if p.world is self.world and p.connected]) > 1:
            game.announce(self.world, f"§a§l{next(iter(alive)).name} wins SkyWars!")


class BedWars(Gamemode):
    id = "bedwars"
    name = "BedWars"
    desc = "protect your bed, break theirs"
    builder = maps.build_bedwars
    default_gamemode = 0

    def on_world_ready(self):
        self.beds = {t: True for t in self.extra["teams"]}
        for i, t in enumerate(self.extra["teams"]):
            sp = self.spawns[t]
            b = self.game.create_bot(f"{t}Bot", self.world, role="enemy", skill=0.7,
                                     team=t, personality="hostile", x=sp[0], y=sp[1], z=sp[2])

    def _pick_spawn(self, entity):
        t = entity.team or random.choice(list(self.spawns.keys()))
        return self.spawns[t]

    def join(self, game, player):
        # assign smallest team
        counts = {}
        for p in game.players.values():
            if p.world is self.world:
                counts[p.team] = counts.get(p.team, 0) + 1
        player.team = min(self.extra["teams"], key=lambda t: counts.get(t, 0))
        super().join(game, player)


class Sumo(Gamemode):
    id = "sumo"
    name = "Sumo"
    desc = "knock opponents off the platform"
    builder = maps.build_sumo
    default_gamemode = 0

    def on_world_ready(self):
        sp = self.spawns[1]
        b = self.game.create_bot("SumoPro", self.world, role="enemy", skill=0.9,
                                 personality="hostile", x=sp[0], y=sp[1], z=sp[2])
        b.brain.set_hunt(None)

    def on_death(self, game, entity, killer):
        self.respawn(game, entity)
        if killer is not None:
            game.announce(self.world, f"§a{killer.name} §7won the round!")


class Parkour(Gamemode):
    id = "parkour"
    name = "Parkour"
    desc = "reach the end of the course"
    builder = maps.build_parkour
    default_gamemode = 0

    def on_move(self, game, player):
        if player.y < 55:
            self.respawn(game, player)
            game._chat_to(player, "§cYou fell! §7Back to the start.")
        course = self.extra["course"]
        ex, ey, ez = course[-1]
        if abs(player.x - ex) < 1.5 and abs(player.z - ez) < 1.5 and player.y >= ey - 1:
            game.announce(self.world, f"§a§l{player.name} completed the parkour!")


class Practice(Gamemode):
    id = "practice"
    name = "Practice"
    desc = "PvP training vs pro bots"
    builder = maps.build_practice
    default_gamemode = 0

    def on_world_ready(self):
        for i in range(3):
            b = self.game.create_bot(f"ProBot{i+1}", self.world, role="enemy", skill=0.85,
                                     personality="hostile", x=random.uniform(-8, 8), y=70, z=random.uniform(-8, 8))
            b.brain.set_hunt(None)

    def on_death(self, game, entity, killer):
        self.respawn(game, entity)


class KitPvP(Gamemode):
    id = "kitpvp"
    name = "KitPvP"
    desc = "free-for-all combat"
    builder = maps.build_kitpvp
    default_gamemode = 0

    def on_world_ready(self):
        for i in range(4):
            b = self.game.create_bot(f"Fighter{i+1}", self.world, role="enemy", skill=0.75,
                                     personality="hostile", x=random.uniform(-15, 15), y=70, z=random.uniform(-15, 15))
            b.brain.set_hunt(None)

    def on_death(self, game, entity, killer):
        self.respawn(game, entity)


class Spleef(Gamemode):
    id = "spleef"
    name = "Spleef"
    desc = "break blocks under opponents"
    builder = maps.build_spleef
    default_gamemode = 0

    def on_death(self, game, entity, killer):
        game.announce(self.world, f"§c{entity.name} §7fell out!")
        if not entity.is_bot:
            game._chat_to(entity, "§7Type §f/lobby §7to leave, or wait for next round.")
            entity.alive = False

    def handle_break(self, game, player, x, y, z):
        game.set_block_and_broadcast(player, x, y, z, 0)


class TNTRun(Gamemode):
    id = "tntrun"
    name = "TNT Run"
    desc = "blocks vanish under your feet"
    builder = maps.build_tntrun
    default_gamemode = 0

    def __init__(self, game):
        super().__init__(game)
        self.decay = {}

    def on_move(self, game, player):
        bx, by, bz = int(player.x), int(player.y) - 1, int(player.z)
        if self.world.get_state(bx, by, bz) != 0:
            self.decay[(bx, by, bz)] = time.time() + 0.4

    def tick(self, game, dt):
        now = time.time()
        for (bx, by, bz), t in list(self.decay.items()):
            if now >= t:
                del self.decay[(bx, by, bz)]
                self.world.set_state(bx, by, bz, 0)
                prof = None
                for p in game.players.values():
                    if p.world is self.world and p.connected and hasattr(p, "_spawned"):
                        prof = p.session.profile
                        import asyncio
                        asyncio.ensure_future(p.session.send_raw(prof.block_change(bx, by, bz, 0)))
        # check falls
        for p in game.players.values():
            if p.world is self.world and p.connected and p.y < 55 and p.alive:
                p.alive = False
                game.announce(self.world, f"§c{p.name} §7fell out!")
                game._chat_to(p, "§7Type §f/lobby §7to leave.")

    def on_death(self, game, entity, killer):
        pass


class MLG(Gamemode):
    id = "mlg"
    name = "MLG Rush"
    desc = "jump and land in the water"
    builder = maps.build_mlg
    default_gamemode = 0

    def on_move(self, game, player):
        if player.y < 62 and self.world.get_state(int(player.x), 63, int(player.z)) == self.world.reg.block_state("water"):
            game.announce(self.world, f"§a§l{player.name} §7stuck the MLG landing!")
            self.respawn(game, player)


class Duels(Gamemode):
    id = "duels"
    name = "Duels"
    desc = "1v1 against a pro bot"
    builder = maps.build_duels
    default_gamemode = 0

    def on_world_ready(self):
        sp = self.spawns[1]
        self.duel_bot = self.game.create_bot("DuelMaster", self.world, role="enemy", skill=0.92,
                                             personality="hostile", x=sp[0], y=sp[1], z=sp[2])

    def on_join(self, game, player):
        game._chat_to(player, "§aFight! First to die loses.")
        if getattr(self, "duel_bot", None):
            self.duel_bot.brain.set_hunt(player)

    def on_death(self, game, entity, killer):
        if killer is not None:
            game.announce(self.world, f"§a§l{killer.name} wins the duel!")
        self.respawn(game, entity)


class Zombies(Gamemode):
    id = "zombies"
    name = "Zombies"
    desc = "survive the waves"
    builder = maps.build_zombies
    default_gamemode = 0

    def __init__(self, game):
        super().__init__(game)
        self.wave = 0
        self.wave_timer = 0.0

    def on_join(self, game, player):
        if self.wave == 0:
            self.start_wave(game)

    def start_wave(self, game):
        self.wave += 1
        n = 2 + self.wave * 2
        for i in range(n):
            ang = random.uniform(0, 6.283)
            x = 14 * (1 if random.random() < 0.5 else -1)
            z = random.uniform(-14, 14)
            b = game.create_bot(f"Zombie{i+1}", self.world, role="enemy", skill=0.55,
                                personality="hostile", x=x, y=70, z=z)
        game.announce(self.world, f"§c§lWave {self.wave} incoming!")

    def tick(self, game, dt):
        if self.wave > 0 and not self.bots():
            self.wave_timer += dt
            if self.wave_timer > 5:
                self.wave_timer = 0
                self.start_wave(game)

    def on_death(self, game, entity, killer):
        self.respawn(game, entity)


class Bridge(Gamemode):
    id = "bridge"
    name = "The Bridge"
    desc = "score by reaching the enemy side"
    builder = maps.build_bridge
    default_gamemode = 0

    def on_world_ready(self):
        for i, sp in enumerate(self.spawns):
            team = "red" if i == 0 else "blue"
            b = self.game.create_bot(f"{team}Guard", self.world, role="enemy", skill=0.7,
                                     team=team, personality="hostile", x=sp[0], y=sp[1], z=sp[2])

    def on_move(self, game, player):
        if player.x > 26:
            game.announce(self.world, f"§a{player.name} §7scored!")
            self.respawn(game, player)
        elif player.x < -26:
            game.announce(self.world, f"§a{player.name} §7scored!")
            self.respawn(game, player)


class HungerGames(Gamemode):
    id = "hungergames"
    name = "Hunger Games"
    desc = "last one alive"
    builder = maps.build_hungergames
    default_gamemode = 0

    def on_world_ready(self):
        for i in range(5):
            b = self.game.create_bot(f"Tribute{i+1}", self.world, role="enemy", skill=0.7,
                                     personality="hostile", x=random.uniform(-20, 20), y=70, z=random.uniform(-20, 20))
            b.brain.set_hunt(None)

    def on_death(self, game, entity, killer):
        if not entity.is_bot:
            entity.alive = False
            game._chat_to(entity, "§cYou died! §7Type §f/lobby §7to leave.")


class HideSeek(Gamemode):
    id = "hideseek"
    name = "Hide & Seek"
    desc = "hiders hide, seeker tags"
    builder = maps.build_hideseek
    default_gamemode = 0

    def on_join(self, game, player):
        player.team = "hider"
        game._chat_to(player, "§aYou are a §fhider§a! Hide from the seeker bots.")

    def on_world_ready(self):
        for i in range(2):
            b = self.game.create_bot(f"Seeker{i+1}", self.world, role="enemy", skill=0.8,
                                     personality="hostile", x=random.uniform(-10, 10), y=70, z=random.uniform(-10, 10))
            b.team = "seeker"
            b.brain.set_hunt(None)


class BuildBattle(Gamemode):
    id = "buildbattle"
    name = "Build Battle"
    desc = "build on your plot"
    builder = maps.build_buildbattle
    default_gamemode = 1

    def on_join(self, game, player):
        game._chat_to(player, "§aBuild Battle — creative building on your plot!")


_MODES = [
    Lobby, Survival, Creative, SkyWars, BedWars, Sumo, Parkour, Practice,
    KitPvP, Spleef, TNTRun, MLG, Duels, Zombies, Bridge, HungerGames,
    HideSeek, BuildBattle,
]


def build_modes(game):
    return {m.id if hasattr(m, "id") else m.__name__.lower(): m(game) for m in _MODES}
