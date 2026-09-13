"""AI brains for companion + enemy bots — upgraded.

Movement & combat intelligence (pro but human, never aimbot):
  • waypoint steering + obstacle sidestep + jump + stuck recovery
  • circle-strafing in melee, retreat & re-engage when low on HP
  • crit jumps, reaction-time delays, lead-aim vs. moving targets
  • per-bot difficulty (easy / normal / pro) tuning skill, aggression, reaction
  • companion roles: follow, guard, defend owner, patrol, collect tips
  • conversation memory: keeps context so Workers AI replies stay coherent

No network I/O here — chat goes through `game.bot_reply()`.
"""
import math
import random
import time

WALK_SPEED = 4.32
SPRINT_SPEED = 5.6
JUMP_VELOCITY = 0.42
REACH = 3.0

# difficulty presets -> (skill, aggression, reaction_seconds, strafe_chance)
DIFFICULTY = {
    "easy":   (0.55, 0.35, 0.55, 0.15),
    "normal": (0.75, 0.55, 0.30, 0.35),
    "pro":    (0.90, 0.75, 0.12, 0.60),
}


class Brain:
    def __init__(self, role="companion", skill=0.8, aggression=0.4,
                 personality="friendly", difficulty=None):
        self.role = role
        self.personality = personality
        if difficulty and difficulty in DIFFICULTY:
            skill, aggression, reaction, strafe = DIFFICULTY[difficulty]
            self.skill, self.aggression = skill, aggression
            self.reaction, self.strafe_chance = reaction, strafe
        else:
            self.skill, self.aggression = skill, aggression
            self.reaction, self.strafe_chance = 0.3, 0.35
        self.difficulty = difficulty or "normal"
        self.target = None
        self.mode = "follow"          # follow | guard | hunt | patrol | defend | idle
        self.guard_pos = None
        self.owner = None             # companion owner (defend/help)
        self.strafe_dir = 1
        self.strafe_timer = 0.0
        self.jump_timer = 0.0
        self.repath_timer = 0.0
        self.attack_timer = 0.0
        self.react_timer = self.reaction
        self.retreat_until = 0.0
        self.think_timer = 0.0
        self.sidestep_timer = 0.0
        self.sidestep_dir = 1
        self.stuck_timer = 0.0
        self.last_x = None
        self.last_z = None
        self.chat_lines = []
        self.last_chat = time.time() + random.uniform(10, 25)
        self.chat_cooldown = random.uniform(30, 70)
        self.memory = []              # conversation history (truncated)

    # ── intent ──────────────────────────────────────────────────────────────
    def set_follow(self, target):
        self.mode = "follow"
        self.target = target
        self.owner = target

    def set_hunt(self, target):
        self.mode = "hunt"
        self.target = target

    def set_guard(self, pos):
        self.mode = "guard"
        self.guard_pos = pos

    def set_patrol(self):
        self.mode = "patrol"

    def set_owner(self, owner):
        self.owner = owner

    # ── main tick ───────────────────────────────────────────────────────────
    def tick(self, game, bot, dt):
        if not bot.alive:
            return
        self.think_timer -= dt
        self.jump_timer -= dt
        self.strafe_timer -= dt
        self.sidestep_timer -= dt
        self.attack_timer -= dt
        self.react_timer -= dt

        # stuck detection
        if self.last_x is not None:
            if abs(bot.x - self.last_x) < 0.01 and abs(bot.z - self.last_z) < 0.01:
                self.stuck_timer += dt
            else:
                self.stuck_timer = 0.0
        self.last_x, self.last_z = bot.x, bot.z

        target = self._acquire_target(game, bot)
        if target is None:
            self._idle(game, bot, dt)
            self._maybe_chat(game, bot)
            return

        # track target velocity for lead aim
        self._track_target(target)

        dist = bot.distance(target)

        # companion: defend owner if they're being attacked
        if self.role == "companion" and self.owner is not None:
            threat = self._threat_to(game, bot, self.owner)
            if threat is not None:
                target = threat
                dist = bot.distance(target)

        # low HP -> retreat briefly (pro bots kite instead of feeding)
        if self.role == "enemy" and bot.health < 8 and time.time() > self.retreat_until:
            self.retreat_until = time.time() + random.uniform(1.2, 2.5)
        retreating = time.time() < self.retreat_until

        # face + aim (with lead)
        aim = self._lead_point(target)
        self._face(bot, target, aim)

        # combat
        if self.role == "enemy" and target.alive and dist < REACH and self.attack_timer <= 0 and self.react_timer <= 0:
            if retreating:
                self._strafe_away(game, bot, target, dt)
            else:
                self._attack(game, bot, target)
            self._maybe_chat(game, bot)
            return

        # movement
        if retreating:
            self._strafe_away(game, bot, target, dt)
        elif self.mode in ("follow", "hunt", "defend") and dist > (1.6 if self.role == "companion" else REACH - 0.4):
            self._move_toward(game, bot, target, dist)
        elif self.mode == "guard":
            gx, gy, gz = self.guard_pos or (bot.x, bot.y, bot.z)
            if math.hypot(bot.x - gx, bot.z - gz) > 5:
                self._move_toward(game, bot, None, 0, (gx, gy, gz))
        elif self.mode == "patrol":
            self._patrol(game, bot)
        elif dist < REACH and self.strafe_timer <= 0:
            # in melee range: circle-strafe
            self.strafe_dir = 1 if random.random() < 0.5 else -1
            self.strafe_timer = random.uniform(0.4, 0.9)

        # strafe perpendicular around target while close
        if self.role == "enemy" and target.alive and dist < REACH + 1.5 and not retreating:
            self._strafe(game, bot, target)

        self._maybe_chat(game, bot)

    # ── targeting ───────────────────────────────────────────────────────────
    def _acquire_target(self, game, bot):
        if self.mode == "hunt":
            return self._nearest_enemy(game, bot)
        if self.mode in ("follow", "guard", "defend") and self.target is not None:
            t = self.target
            if getattr(t, "alive", False) is False:
                if self.mode == "hunt":
                    self.target = self._nearest_enemy(game, bot)
            return self.target
        return None

    def _nearest_enemy(self, game, bot):
        best, best_d = None, 1e9
        for p in game.players.values():
            if p is bot or not p.alive:
                continue
            if getattr(p, "world", None) is not bot.world:
                continue
            if game.are_enemies(bot, p):
                d = bot.distance(p)
                if d < best_d:
                    best_d, best = d, p
        return best

    def _threat_to(self, game, bot, owner):
        """Enemy that recently damaged / is near our owner."""
        if owner is None or not getattr(owner, "alive", False):
            return None
        best, best_d = None, 12.0
        for e in list(game.players.values()) + list(game.bots.values()):
            if e is bot or e is owner or not getattr(e, "alive", False):
                continue
            if getattr(e, "world", None) is not bot.world:
                continue
            if not game.are_enemies(owner, e):
                continue
            d = owner.distance(e)
            if d < best_d:
                best_d, best = d, e
        return best

    def _track_target(self, target):
        prev = getattr(self, "_tpos", None)
        if prev is not None:
            self._tvel = (target.x - prev[0], target.y - prev[1], target.z - prev[2])
        else:
            self._tvel = (0.0, 0.0, 0.0)
        self._tpos = (target.x, target.y, target.z)

    def _lead_point(self, target):
        """Predict target position a few ticks ahead (pro bots lead shots)."""
        vx, vy, vz = getattr(self, "_tvel", (0.0, 0.0, 0.0))
        lead = 0.15 if self.skill > 0.8 else 0.05
        return (target.x + vx * lead, target.y + vy * lead, target.z + vz * lead)

    # ── movement ────────────────────────────────────────────────────────────
    def _idle(self, game, bot, dt):
        pass

    def _face(self, bot, target, aim=None):
        tx, ty, tz = aim if aim else (target.x, target.y, target.z)
        dx, dz = tx - bot.x, tz - bot.z
        bot.yaw = math.degrees(math.atan2(-dx, dz)) % 360.0
        dy = (ty + 1.5) - (bot.y + 1.5)
        dist = max(0.001, math.hypot(dx, dz))
        bot.pitch = math.degrees(math.atan2(-dy, dist))

    def _move_toward(self, game, bot, target, dist=0, dest=None):
        tx, ty, tz = dest if dest else (target.x, target.y, target.z)
        dx, dz = tx - bot.x, tz - bot.z
        h = math.hypot(dx, dz)
        if h < 0.05:
            return
        speed = SPRINT_SPEED if self.role == "enemy" else WALK_SPEED
        step = min(speed * (1 / 20.0), h)
        nx = bot.x + dx / h * step
        nz = bot.z + dz / h * step

        # stuck recovery: sidestep
        if self.stuck_timer > 0.6 and self.sidestep_timer <= 0:
            self.sidestep_timer = random.uniform(0.5, 1.0)
            self.sidestep_dir = 1 if random.random() < 0.5 else -1
        if self.sidestep_timer > 0:
            px, pz = -dz / h, dx / h
            nx = bot.x + px * self.sidestep_dir * step
            nz = bot.z + pz * self.sidestep_dir * step

        game.move_entity(bot, nx, bot.y, nz, bot.yaw, bot.pitch)

        if bot.on_ground and self.jump_timer <= 0 and self._blocked_ahead(game, bot, dx / h, dz / h):
            game.entity_jump(bot)
            self.jump_timer = 0.45
        elif self.stuck_timer > 1.0 and self.jump_timer <= 0:
            game.entity_jump(bot)
            self.jump_timer = 0.4

    def _strafe(self, game, bot, target):
        if self.strafe_timer > 0:
            return
        self.strafe_timer = random.uniform(0.3, 0.7)
        self.strafe_dir = 1 if random.random() < self.strafe_chance else -1
        dx, dz = bot.x - target.x, bot.z - target.z
        h = math.hypot(dx, dz) or 1.0
        px, pz = -dz / h, dx / h
        step = 4.3 / 20.0
        game.move_entity(bot, bot.x + px * self.strafe_dir * step, bot.y,
                         bot.z + pz * self.strafe_dir * step, bot.yaw, bot.pitch)

    def _strafe_away(self, game, bot, target, dt):
        dx, dz = bot.x - target.x, bot.z - target.z
        h = math.hypot(dx, dz) or 1.0
        step = SPRINT_SPEED / 20.0
        game.move_entity(bot, bot.x + dx / h * step, bot.y,
                         bot.z + dz / h * step, bot.yaw, bot.pitch)

    def _blocked_ahead(self, game, bot, dx, dz):
        bx = int(bot.x + dx * 0.8)
        bz = int(bot.z + dz * 0.8)
        world = bot.world
        if world is None:
            return False
        for dy in (0, 1):
            if world.get_state(bx, int(bot.y) + dy, bz) != 0:
                return True
        return False

    def _patrol(self, game, bot):
        if self.think_timer <= 0:
            self.think_timer = random.uniform(3, 6)
            ang = random.uniform(0, math.tau)
            self.guard_pos = (bot.x + math.cos(ang) * 8, bot.y, bot.z + math.sin(ang) * 8)
        gx, gy, gz = self.guard_pos
        self._move_toward(game, bot, None, 0, (gx, gy, gz))

    # ── combat ──────────────────────────────────────────────────────────────
    def _attack(self, game, bot, target):
        if self.attack_timer > 0:
            return
        # crit-jump: jump then swing for extra reach/feel (pro bots)
        if self.skill > 0.8 and bot.on_ground and random.random() < 0.3:
            game.entity_jump(bot)
        hit = random.random() < (self.skill * 0.9 + 0.1)
        self.attack_timer = random.uniform(0.42, 0.72)  # 1.4–2.4 hits/s
        self.react_timer = self.reaction
        game.bot_attack(bot, target, hit)

    # ── chat ────────────────────────────────────────────────────────────────
    def _maybe_chat(self, game, bot):
        now = time.time()
        if now - self.last_chat < self.chat_cooldown:
            return
        self.last_chat = now
        self.chat_cooldown = random.uniform(30, 80)
        line = self._proactive_line(game, bot)
        if line:
            game.bot_chat(bot, line)

    def _proactive_line(self, game, bot):
        lines = {
            "friendly": ["همین‌جا بمون، دارم گشت می‌زنم 🧭", "پیشرفتت عالیه! 🔥",
                          "من مراقبتم، تو بازی کن 😉", "یه دقیقه، مسیر بعدی رو چک کنم..."],
            "hostile": ["کجایی؟ من هنوز زنده‌ام 😈", "بیا جلوتر، ازت پذیرایی می‌کنم ⚔️",
                         "خودت رو آماده کن 🔥", "این‌بار غافل‌گیرت می‌کنم..."],
            "guide": ["برای مود بعدی /menu رو بزن 📜", "نکته: با /enemy می‌تونی تمرین کنی ⚔️",
                       "با /companion یه رفیق هوشمند بگیر 🤖"],
        }.get(self.personality, ["..."] if False else [])
        if not lines:
            return None
        return random.choice(lines)

    def reply(self, game, bot, message):
        """Async-friendly hook (legacy). The game now uses game.bot_reply()."""
        now = time.time()
        if now - self.last_chat < 1.2:
            return None
        self.last_chat = now
        return game.ai_reply(bot.name, self.personality, message)

    def canned_reply(self, message):
        import random as _r
        fa = any("\u0600" <= c <= "\u06FF" for c in message or "")
        pools = {
            "friendly": {
                "fa": ["ساختم! همیشه کنارتم 🙂", "آفرین! بزن بریم جلو 💪",
                       "مواظب باش، از پشت مواظبتم 👀", "بیا اینجا، یه چیز باحال نشونت بدم ✨",
                       "همین‌طوری ادامه بده، داری عالی پیش می‌ری!"],
                "en": ["On it! I've got your back 🙂", "Nice one! Let's keep moving 💪",
                       "Careful — I'm watching your six 👀", "Over here, check this out ✨",
                       "Keep going, you're doing great!"],
            },
            "hostile": {
                "fa": ["هنوز فرار نکردی؟ 😏", "این آخرین ضربه‌ت بود، بعدش نوبت منه!",
                       "ضعیف بود 😈 دوباره امتحان کن", "یه کم تمرین کن بعد برگرد 🥱",
                       "EZ. ولی انصافاً خوب جنگیدی 🔥"],
                "en": ["Still not running? 😏", "That was your last hit — my turn now!",
                       "Weak 😈 try again", "Go practice, then come back 🥱",
                       "EZ. But honestly, good fight 🔥"],
            },
            "guide": {
                "fa": ["برای لیست مودها /menu رو بزن 📜", "با /join <mode> وارد بازی شو 🎮",
                       "برای رفیق هوشمند /companion رو بزن 🤖", "با /enemy 3 دشمن بساز ⚔️"],
                "en": ["Type /menu for the gamemode list 📜", "Join a game with /join <mode> 🎮",
                       "/companion spawns a smart friend 🤖", "/enemy 3 spawns hostiles ⚔️"],
            },
        }
        pool = pools.get(self.personality, pools["friendly"])
        lang = "fa" if fa else "en"
        lines = pool.get(lang) or pool["en"]
        return _r.choice(lines)
