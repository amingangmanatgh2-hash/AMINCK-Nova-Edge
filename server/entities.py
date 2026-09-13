"""Player / bot entities."""
import time, random, math
from .profile import offline_uuid


class EntityIdAllocator:
    def __init__(self):
        self._next = 100

    def alloc(self):
        self._next += 1
        return self._next


class Living:
    """Shared state for a player or bot."""
    def __init__(self, name, entity_id, uuid=None):
        self.name = name
        self.entity_id = entity_id
        self.uuid = uuid if uuid is not None else offline_uuid(name)
        self.x = 0.5
        self.y = 64.0
        self.z = 0.5
        self.yaw = 0.0
        self.pitch = 0.0
        self.on_ground = True
        self.health = 20.0
        self.max_health = 20.0
        self.food = 20
        self.alive = True
        self.gamemode = 0
        self.world = None
        self.held_slot = 0
        self.kills = 0
        self.deaths = 0
        self.team = None
        self.last_x = self.x
        self.last_y = self.y
        self.last_z = self.z
        self.last_yaw = self.yaw
        self.last_pitch = self.pitch

    def set_pos(self, x, y, z, yaw=None, pitch=None):
        self.x, self.y, self.z = x, y, z
        if yaw is not None:
            self.yaw = yaw
        if pitch is not None:
            self.pitch = pitch

    def distance(self, other):
        return math.sqrt((self.x - other.x) ** 2 + (self.y - other.y) ** 2 + (self.z - other.z) ** 2)


class Player(Living):
    def __init__(self, session):
        super().__init__(session.username, 0)
        self.session = session
        self.mode = None          # active Gamemode arena (or lobby)
        self.is_bot = False
        self.attack_cooldown = 0.0
        self.knockback = (0.0, 0.0, 0.0)
        self.selected_bot = None
        self.grace = time.time() + 3.0

    @property
    def connected(self):
        return not self.session.closed


class Bot(Living):
    def __init__(self, name, entity_id, brain=None):
        super().__init__(name, entity_id)
        self.is_bot = True
        self.brain = brain      # ai.Brain instance
        self.target = None
        self.home = (self.x, self.y, self.z)
        self.mode = None
        self.attack_cooldown = 0.0
        self.knockback = (0.0, 0.0, 0.0)
        self.move_timer = 0.0
        self.team = None
