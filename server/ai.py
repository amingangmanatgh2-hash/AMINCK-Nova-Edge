"""AI brains for companion + enemy bots (movement, combat, pathing, banter)."""
import math, random, time

WALK_SPEED = 4.32          # m/s (matches vanilla walk)
SPRINT_SPEED = 5.6
JUMP_VELOCITY = 0.42
GRAVITY = 0.08
REACH = 3.0


class Brain:
    def __init__(self, role="companion", skill=0.8, aggression=0.4, personality="friendly"):
        self.role = role              # companion | enemy | guard | patrol
        self.skill = skill            # 0..1 aim accuracy
        self.aggression = aggression  # 0..1 how eagerly it fights
        self.personality = personality
        self.target = None
        self.mode = "follow"          # follow | guard | hunt | patrol | defend | idle
        self.guard_pos = None
        self.strafe_dir = 1
        self.strafe_timer = 0.0
        self.jump_timer = 0.0
        self.repath_timer = 0.0
        self.attack_timer = 0.0
        self.retreat_until = 0.0
        self.think_timer = 0.0
        self.chat_lines = []
        self.last_chat = 0.0

    # ── intent ────────────────────────────────────────────────────────────
    def set_follow(self, target):
        self.mode = "follow"
        self.target = target

    def set_hunt(self, target):
        self.mode = "hunt"
        self.target = target

    def set_guard(self, pos):
        self.mode = "guard"
        self.guard_pos = pos

    def set_patrol(self):
        self.mode = "patrol"

    # ── main tick ─────────────────────────────────────────────────────────
    def tick(self, game, bot, dt):
        if not bot.alive:
            return
        self.think_timer -= dt
        self.jump_timer -= dt
        self.strafe_timer -= dt
        self.attack_timer -= dt

        target = self._acquire_target(game, bot)
        if target is None:
            self._idle(game, bot, dt)
            return

        dist = bot.distance(target)
        # face the target
        self._face(bot, target)

        if self.role == "enemy" and target.alive and dist < REACH and self.attack_timer <= 0:
            self._attack(game, bot, target)
            return

        if self.mode in ("follow", "hunt") and dist > (1.8 if self.role == "companion" else REACH - 0.5):
            self._move_toward(game, bot, target, dist)
        elif self.mode == "guard":
            gx, gy, gz = self.guard_pos
            if math.hypot(bot.x - gx, bot.z - gz) > 6:
                self._move_toward(game, bot, None, 0, (gx, gy, gz))
        elif self.mode == "patrol":
            self._patrol(game, bot)

    def _acquire_target(self, game, bot):
        if self.mode in ("follow", "hunt", "guard") and self.target is not None:
            t = self.target
            if t is not None and getattr(t, "alive", False) is False:
                if self.mode == "hunt":
                    self.target = self._nearest_enemy(game, bot)
            return self.target
        if self.mode == "hunt":
            return self._nearest_enemy(game, bot)
        return None

    def _nearest_enemy(self, game, bot):
        best = None
        best_d = 1e9
        for p in game.players.values():
            if p is bot or not p.alive:
                continue
            if getattr(p, "world", None) is not bot.world:
                continue
            if game.are_enemies(bot, p):
                d = bot.distance(p)
                if d < best_d:
                    best_d = d
                    best = p
        return best

    def _idle(self, game, bot, dt):
        pass

    def _face(self, bot, target):
        dx = target.x - bot.x
        dz = target.z - bot.z
        bot.yaw = math.degrees(math.atan2(-dx, dz)) % 360.0
        dy = (target.y + 1.5) - (bot.y + 1.5)
        dist = max(0.001, math.hypot(dx, dz))
        bot.pitch = math.degrees(math.atan2(-dy, dist))

    def _move_toward(self, game, bot, target, dist=0, dest=None):
        tx, ty, tz = dest if dest else (target.x, target.y, target.z)
        dx = tx - bot.x
        dz = tz - bot.z
        h = math.hypot(dx, dz)
        if h < 0.05:
            return
        speed = SPRINT_SPEED if self.role == "enemy" else WALK_SPEED
        step = min(speed * (1 / 20.0), h)
        nx = bot.x + dx / h * step
        nz = bot.z + dz / h * step

        # avoid walking off void / into walls
        game.move_entity(bot, nx, bot.y, nz, bot.yaw, bot.pitch)

        # jump if blocked in front and on ground
        if bot.on_ground and self.jump_timer <= 0 and self._blocked_ahead(game, bot, dx / h, dz / h):
            game.entity_jump(bot)
            self.jump_timer = 0.45

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

    def _attack(self, game, bot, target):
        if self.attack_timer > 0:
            return
        # aim with human-like error
        hit = random.random() < (self.skill * 0.9 + 0.1)
        self.attack_timer = random.uniform(0.45, 0.75)  # 1.3–2.2 hits/s
        game.bot_attack(bot, target, hit)

    # ── banter ────────────────────────────────────────────────────────────
    def reply(self, game, bot, message):
        """Generate a chat reply for the bot. Uses Workers AI when enabled,
        otherwise a canned line (language-aware, but replies in the bot's own
        persona). Returns a string or None."""
        now = time.time()
        if now - self.last_chat < 1.2:
            return None
        self.last_chat = now
        text = game.ai_reply(bot.name, self.personality, message)
        return text

    def canned_reply(self, message):
        """Local fallback when Workers AI is unreachable — short persona lines,
        Persian-flavoured and always non-empty."""
        import random as _r
        lower = (message or "").lower()
        fa = any("\u0600" <= c <= "\u06FF" for c in message or "")
        pools = {
            "friendly": {
                "fa": [
                    "ساختم! همیشه کنارتم 🙂", "آفرین! بزن بریم جلو 💪",
                    "مواظب باش، از پشت مواظبتم 👀", "بیا اینجا، یه چیز باحال نشونت بدم ✨",
                    "همینطوری ادامه بده، داری عالی پیش میری!",
                ],
                "en": [
                    "On it! I've got your back 🙂", "Nice one! Let's keep moving 💪",
                    "Careful — I'm watching your six 👀", "Over here, check this out ✨",
                    "Keep going, you're doing great!",
                ],
            },
            "hostile": {
                "fa": [
                    "هنوز فرار نکردی؟ 😏", "این آخرین ضربه‌ت بود، بعدش نوبت منه!",
                    "ضعیف بود 😈 دوباره امتحان کن", "یه کم تمرین کن بعد برگرد 🥱",
                    "EZ. ولی انصافاً خوب جنگیدی 🔥",
                ],
                "en": [
                    "Still not running? 😏", "That was your last hit — my turn now!",
                    "Weak 😈 try again", "Go practice, then come back 🥱",
                    "EZ. But honestly, good fight 🔥",
                ],
            },
            "guide": {
                "fa": [
                    "برای لیست مودها /menu رو بزن 📜", "با /join <mode> وارد بازی شو 🎮",
                    "برای رفیق هوشمند /companion رو بزن 🤖", "با /enemy 3 دشمن بساز ⚔️",
                ],
                "en": [
                    "Type /menu for the gamemode list 📜", "Join a game with /join <mode> 🎮",
                    "/companion spawns a smart friend 🤖", "/enemy 3 spawns hostiles ⚔️",
                ],
            },
        }
        pool = pools.get(self.personality, pools["friendly"])
        lang = "fa" if fa else "en"
        lines = pool.get(lang) or pool["en"]
        # occasionally echo the player's message back in-character
        if _r.random() < 0.18 and message and len(message) < 40:
            return lines[0]
        return _r.choice(lines)

