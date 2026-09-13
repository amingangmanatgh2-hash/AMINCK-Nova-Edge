"""Async HTTP panel + full admin API (no dependencies).

Public:
  GET /                — server panel (HTML)
  GET /api/status      — JSON status
  GET /favicon.png     — server icon

Admin (password from ADMIN_PASSWORD, set at deploy):
  POST /admin/login    — {"password": ...} → {"token": ...}
  GET  /admin/api/status   (Bearer token)
  POST /admin/api/action   (Bearer token)  {"action": "...", ...}
  GET  /admin          — minimal admin UI (the Worker serves the full one)
"""
import asyncio
import json
import os
import time
import secrets

from .server import enable_low_latency
from . import economy as _econ

SITE_HTML = """<!doctype html>
<html lang="fa"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{name} — فروشگاه</title>
<style>
:root{{color-scheme:dark}}*{{box-sizing:border-box}}
body{{margin:0;font-family:system-ui,"Vazirmatn",sans-serif;background:radial-gradient(1200px 800px at 50% -10%,#1b2a4a 0%,#0b1120 55%,#070a14 100%);color:#e8ecf4;min-height:100vh}}
.wrap{{max-width:960px;margin:0 auto;padding:30px 20px 80px;direction:rtl;text-align:right}}
h1{{margin:0;font-size:1.8rem;background:linear-gradient(90deg,#ffd76a,#ff8a5c);-webkit-background-clip:text;background-clip:text;color:transparent}}
.sub{{color:#93a2bd;margin-top:6px}}
.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px;margin-top:24px}}
.card{{background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:16px 18px}}
.card .k{{color:#7f8fb0;font-size:.75rem;letter-spacing:.05em}}
.card .v{{font-size:1.2rem;font-weight:650;margin:6px 0}}
.card .p{{color:#cfe3ff;font-size:.95rem;margin-bottom:10px}}
button{{padding:9px 18px;border:none;border-radius:10px;cursor:pointer;background:linear-gradient(90deg,#ffd76a,#ff8a5c);color:#201300;font-weight:700}}
.note{{background:rgba(255,170,60,.08);border:1px solid rgba(255,170,60,.25);border-radius:14px;padding:14px 18px;margin-top:22px;color:#ffd9a0;line-height:1.8}}
code{{background:rgba(255,255,255,.08);padding:2px 7px;border-radius:6px}}
#msg{{margin-top:14px;white-space:pre-wrap}}
.footer{{margin-top:40px;color:#5f6f8c;font-size:.8rem}}
</style></head><body><div class="wrap">
<h1>🛒 فروشگاه {name}</h1>
<div class="sub">{motd}</div>
<div class="grid">{items}</div>
<div class="note">
<b>روش پرداخت:</b><br>
شماره کارت: <code>{card}</code> &nbsp; به نام <code>{holder}</code><br>
{note}<br>
<b>نحوه فعال‌سازی:</b> بعد از تأیید پرداخت، کد فعال‌سازی دریافت می‌کنید. داخل بازی دستور <code>/redeem &lt;کد&gt;</code> را بزنید.
</div>
<div id="msg"></div>
<div class="footer">AMINCK Nova • اتصال: <code>{site}</code></div>
</div>
<script>
async function buy(item){{
  const msg = document.getElementById('msg');
  msg.textContent = 'در حال ثبت سفارش…';
  const r = await fetch('/api/order',{{method:'POST',headers:{{'Content-Type':'application/json'}},
    body:JSON.stringify({{item:item,buyer:prompt('نام شما در بازی (IGN):')||'guest',contact:prompt('راه ارتباطی (اختیاری):')||''}})}});
  const j = await r.json();
  if(!j.ok){{ msg.textContent = 'خطا: ' + (j.error||'نامشخص'); return; }}
  msg.textContent = '✅ سفارش ثبت شد!\\nکد سفارش: ' + j.order_id + '\\nمبلغ: ' + (j.price_toman||0) + ' تومان\\n' + j.how;
}}
</script>
</body></html>"""

PANEL_HTML = """<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{name} — Control Panel</title>
<style>
:root {{ color-scheme: dark; }}
* {{ box-sizing: border-box; }}
body {{ margin:0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  background: radial-gradient(1200px 800px at 50% -10%, #1b2a4a 0%, #0b1120 55%, #070a14 100%);
  color:#e8ecf4; min-height:100vh; }}
.wrap {{ max-width: 980px; margin: 0 auto; padding: 32px 20px 80px; }}
header {{ display:flex; gap:20px; align-items:center; flex-wrap:wrap; }}
.icon {{ width:88px; height:88px; border-radius:18px; background:rgba(255,255,255,.06);
  border:1px solid rgba(255,255,255,.12); object-fit:cover; }}
h1 {{ margin:0; font-size:1.9rem; background:linear-gradient(90deg,#ffd76a,#ff8a5c);
  -webkit-background-clip:text; background-clip:text; color:transparent; }}
.sub {{ color:#93a2bd; margin-top:6px; }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:14px; margin-top:26px; }}
.card {{ background:rgba(255,255,255,.045); border:1px solid rgba(255,255,255,.1);
  border-radius:16px; padding:16px 18px; }}
.card .k {{ color:#7f8fb0; font-size:.78rem; text-transform:uppercase; letter-spacing:.06em; }}
.card .v {{ font-size:1.35rem; font-weight:650; margin-top:6px; }}
.badge {{ display:inline-block; padding:3px 10px; border-radius:999px; font-size:.75rem;
  background:#123b2a; color:#5ee6a8; border:1px solid #1f5f41; }}
.badge.off {{ background:#3a1220; color:#ff9bb0; border-color:#5f2030; }}
code {{ background:rgba(255,255,255,.08); padding:2px 7px; border-radius:6px; }}
ul {{ line-height:1.8; }}
a {{ color:#8ec9ff; }}
pre {{ background:rgba(0,0,0,.3); padding:14px; border-radius:12px; overflow:auto; font-size:.8rem; }}
table {{ width:100%; border-collapse:collapse; margin-top:10px; }}
td, th {{ padding:8px 10px; border-bottom:1px solid rgba(255,255,255,.08); text-align:left; }}
.footer {{ margin-top:40px; color:#5f6f8c; font-size:.8rem; }}
</style></head><body><div class="wrap">
<header>
  <img class="icon" src="/favicon.png" alt="icon">
  <div>
    <h1>{name}</h1>
    <div class="sub">{motd}</div>
    <div class="sub">Java 1.8 → 26.x &nbsp;•&nbsp; 18 gamemodes &nbsp;•&nbsp; AI bots &nbsp;•&nbsp; <a href="/admin">Admin</a></div>
  </div>
</header>

<div class="grid">
  <div class="card"><div class="k">Status</div><div class="v">● Online</div></div>
  <div class="card"><div class="k">Players online</div><div class="v">{online} / 100</div></div>
  <div class="card"><div class="k">Gamemodes</div><div class="v">{modes}</div></div>
  <div class="card"><div class="k">AI Bots</div><div class="v">{bots}</div></div>
  <div class="card"><div class="k">TPS</div><div class="v">{tps}</div></div>
  <div class="card"><div class="k">Workers AI</div><div class="v"><span class="badge {aicl}">{ai}</span></div></div>
  <div class="card"><div class="k">Weather</div><div class="v">{weather}</div></div>
  <div class="card"><div class="k">Uptime</div><div class="v">{uptime}</div></div>
</div>

<h2>Address</h2>
<p>Java: <code>{host}</code> &nbsp; Bedrock: <code>{host}:{bport}</code></p>

<h2>Gamemodes</h2>
<table>
<thead><tr><th>Command</th><th>Mode</th><th>Description</th></tr></thead>
<tbody>{rows}</tbody>
</table>

<h2>How to play</h2>
<ul>
<li><code>/menu</code> — list gamemodes, <code>/join &lt;mode&gt;</code> — enter</li>
<li><code>/companion</code> — AI friend, <code>/enemy 3</code> — hostiles, <code>/shop</code> — buy ranks/kits</li>
<li><code>/sethome</code> · <code>/warp</code> · <code>/msg</code> · <code>/coins</code> · <code>/stats</code></li>
</ul>

<h2>Server log</h2>
<pre>{log}</pre>
<div class="footer">AMINCK Nova • runs on Cloudflare Containers • {ts}</div>
</div></body></html>"""

ADMIN_HTML = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AMINCK Nova — Admin</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}
body{margin:0;font-family:system-ui,Segoe UI,Roboto,sans-serif;background:#0b1120;color:#e8ecf4;min-height:100vh}
.wrap{max-width:900px;margin:0 auto;padding:30px 20px}
h1{font-size:1.6rem}
input,button{padding:10px 13px;border-radius:10px;border:1px solid rgba(255,255,255,.15);background:rgba(0,0,0,.3);color:#fff;font-size:.95rem}
button{background:linear-gradient(90deg,#ffd76a,#ff8a5c);color:#201300;font-weight:700;border:none;cursor:pointer}
button.ghost{background:rgba(255,255,255,.08);color:#fff}
table{width:100%;border-collapse:collapse;margin-top:12px}
td,th{padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.08);text-align:left;font-size:.9rem}
pre{background:rgba(0,0,0,.3);padding:12px;border-radius:10px;overflow:auto}
.row{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0}
.card{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:16px;margin-top:16px}
#msg{color:#8ec9ff;min-height:1.2em;margin-top:8px}
</style></head><body><div class="wrap">
<h1>🛠️ AMINCK Nova — Admin</h1>
<div id="login">
  <div class="row"><input id="pw" type="password" placeholder="Admin password"><button onclick="login()">Login</button></div>
</div>
<div id="panel" style="display:none">
  <div class="card">
    <h3 id="st_title">Status</h3>
    <pre id="st"></pre>
  </div>
  <div class="card">
    <h3>Broadcast</h3>
    <div class="row"><input id="bc" placeholder="message" style="flex:1"><button onclick="act('broadcast',{message:document.getElementById('bc').value})">Send</button></div>
  </div>
  <div class="card">
    <h3>Actions</h3>
    <div class="row">
      <input id="a_target" placeholder="player/item">
      <button onclick="act('give_coins',{player:document.getElementById('a_target').value,amount:100})">+100 coins</button>
      <button onclick="act('kick',{player:document.getElementById('a_target').value})">Kick</button>
      <button onclick="act('ban',{player:document.getElementById('a_target').value})">Ban</button>
      <button onclick="act('mute',{player:document.getElementById('a_target').value,minutes:30})">Mute 30m</button>
      <button onclick="act('bots_clear',{})">Clear bots</button>
      <button class="ghost" onclick="act('save',{})">Save state</button>
    </div>
    <div class="row">
      <input id="code_rank" placeholder="rank">
      <input id="code_uses" placeholder="uses" value="1" style="width:70px">
      <button onclick="act('code_create',{type:'rank',value:document.getElementById('code_rank').value,uses:parseInt(document.getElementById('code_uses').value||1)})">Create rank code</button>
    </div>
    <div id="msg"></div>
  </div>
  <div class="card"><h3>Players</h3><table id="players"></table></div>
  <div class="card"><h3>Log</h3><pre id="log"></pre></div>
</div>
<script>
let token = localStorage.getItem('nova_admin_token') || '';
function headers(){return {'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})}}
async function login(){
  const r = await fetch('/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:document.getElementById('pw').value})});
  if(r.ok){token=(await r.json()).token;localStorage.setItem('nova_admin_token',token);document.getElementById('login').style.display='none';document.getElementById('panel').style.display='block';load();}
  else{document.getElementById('msg').textContent='Wrong password';document.getElementById('msg').style.display='block';}
}
async function act(action,payload){
  const r = await fetch('/admin/api/action',{method:'POST',headers:headers(),body:JSON.stringify({action,...payload})});
  document.getElementById('msg').textContent = (await r.json()).ok ? 'OK: '+action : 'FAILED: '+action;
  load();
}
async function load(){
  const r = await fetch('/admin/api/status',{headers:headers()});
  if(r.status===401){token='';localStorage.removeItem('nova_admin_token');document.getElementById('login').style.display='block';document.getElementById('panel').style.display='none';return;}
  const s = await r.json();
  document.getElementById('st').textContent = JSON.stringify(s,null,2);
  document.getElementById('log').textContent = (s.log||[]).join('\\n');
  const tb = document.getElementById('players');tb.innerHTML = '<tr><th>name</th><th>rank</th><th>coins</th><th>level</th><th>kills</th><th>deaths</th><th>world</th></tr>'
    + (s.players||[]).map(p=>`<tr><td>${p.name}</td><td>${p.rank}</td><td>${p.coins}</td><td>${p.level}</td><td>${p.kills}</td><td>${p.deaths}</td><td>${p.world}</td></tr>`).join('');
}
if(token){document.getElementById('login').style.display='none';document.getElementById('panel').style.display='block';load();}
</script>
</div></body></html>"""


class HttpPanel:
    def __init__(self, game, host="0.0.0.0", port=8080):
        self.game = game
        self.host = host
        self.port = port
        self.server = None
        self._tokens = {}  # token -> expiry

    async def start(self):
        self.server = await asyncio.start_server(self._handle, self.host, self.port)
        self.game.log(f"HTTP panel on http://{self.host}:{self.port}")

    # ── auth ──────────────────────────────────────────────────────────────
    def _new_token(self):
        tok = secrets.token_hex(24)
        self._tokens[tok] = time.time() + 86400
        return tok

    def _authed(self, headers):
        auth = headers.get("authorization", "") or headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return False
        tok = auth[7:]
        exp = self._tokens.get(tok)
        if not exp or exp < time.time():
            return False
        return True

    # ── request handling ──────────────────────────────────────────────────
    async def _handle(self, reader, writer):
        enable_low_latency(writer)
        try:
            data = await reader.read(65536)
            if not data:
                return
            request = data.decode("utf-8", "replace")
            head, _, body = request.partition("\r\n\r\n")
            lines = head.split("\r\n")
            method, path, _ = (lines[0].split(" ") + ["", ""])[:3]
            headers = {}
            for ln in lines[1:]:
                if ":" in ln:
                    k, v = ln.split(":", 1)
                    headers[k.strip().lower()] = v.strip()
            path = path.split("?")[0]
            await self._route(method, path, headers, body, writer)
        except Exception:
            pass
        finally:
            try:
                writer.close()
            except Exception:
                pass

    async def _route(self, method, path, headers, body, writer):
        g = self.game
        if path == "/favicon.png":
            await self._favicon(writer)
            return
        if path in ("/", "/index.html"):
            await self._resp(writer, 200, "text/html; charset=utf-8", self.render().encode("utf-8"))
            return
        if path == "/api/status":
            await self._json(writer, 200, self.status())
            return
        if path == "/api/catalog":
            await self._json(writer, 200, self.catalog_api())
            return
        if path in ("/api/order", "/site/order") and method == "POST":
            try:
                data = json.loads(body or "{}")
            except Exception:
                data = {}
            await self._json(writer, 200, self.create_order_api(data))
            return
        if path == "/site":
            await self._resp(writer, 200, "text/html; charset=utf-8", self.site_page().encode("utf-8"))
            return
        if path == "/admin":
            await self._resp(writer, 200, "text/html; charset=utf-8", ADMIN_HTML.encode("utf-8"))
            return
        if path == "/admin/login" and method == "POST":
            try:
                data = json.loads(body or "{}")
            except Exception:
                data = {}
            if self.game.check_admin_password(data.get("password", "")):
                await self._json(writer, 200, {"token": self._new_token()})
            else:
                await self._json(writer, 401, {"error": "wrong password"})
            return
        if path.startswith("/admin/api/"):
            if not self._authed(headers):
                await self._json(writer, 401, {"error": "unauthorized"})
                return
            if path == "/admin/api/status" and method == "GET":
                await self._json(writer, 200, self.admin_status())
                return
            if path == "/admin/api/action" and method == "POST":
                try:
                    data = json.loads(body or "{}")
                except Exception:
                    data = {}
                ok, msg = self.admin_action(data)
                await self._json(writer, 200, {"ok": ok, "message": msg})
                return
        await self._resp(writer, 404, "text/plain", b"not found")

    # ── admin logic ───────────────────────────────────────────────────────
    def admin_status(self):
        g = self.game
        players = []
        for p in g.players.values():
            if p.connected:
                s = g.econ.stats(p.name)
                players.append({
                    "name": p.name, "rank": s["rank"], "coins": s["coins"],
                    "level": s["level"], "xp": s["xp"], "kills": s["kills"],
                    "deaths": s["deaths"], "world": p.world.name if p.world else "-",
                    "admin": g.is_admin(p),
                })
        return {
            "name": g.name, "online": len(players), "players": players,
            "bots": len(g.bots), "tps": round(g.tps, 1), "weather": g.weather,
            "time": g.world_time, "ai": g.ai_enabled, "scoreboard": g.scoreboard_on,
            "difficulty": g.difficulty, "site": g.site_url,
            "modes": list(g.modes.keys()), "uptime": int(time.time() - g.started),
            "codes": g.econ.codes(), "orders": g.econ.orders(),
            "log": g.log_lines[-30:],
        }

    def admin_action(self, data):
        g = self.game
        action = (data.get("action") or "").lower()
        try:
            if action == "broadcast":
                msg = data.get("message", "")
                if msg:
                    g.broadcast_all("§6§l[Broadcast] §r" + msg)
                    return True, "broadcast sent"
                return False, "no message"
            if action == "kick":
                p = g.players.get(str(data.get("player", "")).lower())
                if p:
                    asyncio.ensure_future(p.session.disconnect("Kicked by admin"))
                    return True, "kicked"
                return False, "player not online"
            if action == "ban":
                name = str(data.get("player", "")).strip()
                if name:
                    g.econ.ban(name)
                    p = g.players.get(name.lower())
                    if p:
                        asyncio.ensure_future(p.session.disconnect("Banned by admin"))
                    return True, "banned"
                return False, "no player"
            if action == "unban":
                g.econ.unban(str(data.get("player", "")))
                return True, "unbanned"
            if action == "mute":
                g.econ.mute(str(data.get("player", "")), int(data.get("minutes", 30)) * 60)
                return True, "muted"
            if action == "unmute":
                g.econ.unmute(str(data.get("player", "")))
                return True, "unmuted"
            if action == "give_coins":
                g.econ.add_coins(str(data.get("player", "")), int(data.get("amount", 0)))
                g.refresh_score(str(data.get("player", "")))
                return True, "coins added"
            if action == "set_rank":
                ok = g.econ.set_rank(str(data.get("player", "")), str(data.get("rank", "")))
                return ok, "rank set" if ok else "invalid rank"
            if action == "settime":
                g.set_time(int(data.get("ticks", 6000)))
                return True, "time set"
            if action == "setweather":
                g.set_weather(str(data.get("weather", "clear")))
                return True, "weather set"
            if action == "bots_clear":
                for b in list(g.bots.values()):
                    g.remove_bot(b)
                return True, "bots cleared"
            if action == "bot_spawn":
                mode = g.modes.get(str(data.get("mode", "survival")), g.lobby)
                bot = g.create_bot("AdminBot", mode.world, role="enemy",
                                   personality="hostile", x=0.5, y=mode.world.top_y(0, 0), z=0.5)
                return True, f"bot {bot.entity_id} spawned"
            if action == "code_create":
                code = g.econ.create_code(str(data.get("type", "coins")),
                                          data.get("value", 1000),
                                          int(data.get("uses", 1)))
                return True, code
            if action == "order_create":
                oid = g.econ.create_order(str(data.get("item", "")),
                                          str(data.get("buyer", "guest")))
                return bool(oid), (oid or "unknown item")
            if action == "order_resolve":
                code = g.econ.resolve_order(str(data.get("order_id", "")),
                                            str(data.get("gateway_ref", "")))
                return bool(code), (code or "no such order")
            if action == "save":
                g.econ.save()
                return True, "saved"
            if action == "scoreboard":
                g.scoreboard_on = not g.scoreboard_on
                return True, f"scoreboard {'on' if g.scoreboard_on else 'off'}"
            return False, "unknown action"
        except Exception as e:
            return False, str(e)

    # ── responses ─────────────────────────────────────────────────────────
    async def _favicon(self, writer):
        png = None
        fp = self.game.cfg.get("favicon_path") or "favicon.png"
        if os.path.exists(fp):
            with open(fp, "rb") as f:
                png = f.read()
        if png:
            await self._resp(writer, 200, "image/png", png)
        else:
            await self._resp(writer, 404, "text/plain", b"no icon")

    async def _json(self, writer, code, obj):
        body = json.dumps(obj).encode("utf-8")
        await self._resp(writer, code, "application/json", body)

    async def _resp(self, writer, code, ctype, body):
        head = (f"HTTP/1.1 {code} OK\r\nContent-Type: {ctype}\r\n"
                f"Content-Length: {len(body)}\r\nConnection: close\r\n\r\n").encode()
        writer.write(head + body)
        await writer.drain()

    # ── public status / panel ─────────────────────────────────────────────
    def status(self):
        g = self.game
        return {
            "name": g.name, "motd": g.motd,
            "online": sum(1 for p in g.players.values() if p.connected),
            "players": [p.name for p in g.players.values() if p.connected],
            "bots": len(g.bots),
            "modes": list(g.modes.keys()),
            "ai": g.ai_enabled,
            "tps": round(g.tps, 1),
            "weather": g.weather,
            "site": g.site_url,
            "uptime": int(time.time() - g.started),
        }

    # ── site shop ─────────────────────────────────────────────────────────
    def catalog_api(self):
        g = self.game
        return {
            "name": g.name,
            "site": g.site_url,
            "catalog": _econ.CATALOG,
            "payment": {
                "card": g.cfg.get("payment_card", ""),
                "card_holder": g.cfg.get("payment_card_holder", ""),
                "note": g.cfg.get("payment_note", ""),
            },
        }

    def create_order_api(self, data):
        g = self.game
        item_id = str(data.get("item", "")).strip()
        buyer = str(data.get("buyer", "")).strip() or "guest"
        contact = str(data.get("contact", "")).strip()
        oid = g.econ.create_order(item_id, buyer=buyer)
        if not oid:
            return {"ok": False, "error": "unknown item"}
        item = _econ.CATALOG_BY_ID[item_id]
        order = g.econ.data["orders"][oid]
        order["contact"] = contact
        g.econ.save()
        return {
            "ok": True,
            "order_id": oid,
            "item": item_id,
            "item_name": item.get("name", item_id),
            "price_toman": item.get("price_toman"),
            "payment": self.catalog_api()["payment"],
            "how": ("پس از پرداخت، کد سفارش را در پنل ادمین تأیید کنید؛ "
                    "سپس کد فعال‌سازی را در بازی با /redeem وارد کنید."),
        }

    def site_page(self):
        """Persian shop page served at /site (also used directly)."""
        g = self.game
        items = ""
        for c in _econ.CATALOG:
            if c.get("price_toman") is not None:
                price = f"{c['price_toman']:,} تومان"
                btn = ("<button onclick=\"buy('%s')\">خرید</button>" % c["id"])
            else:
                price = "فقط با سکه (در بازی)"
                btn = ""
            items += (
                "<div class='card'><div class='k'>%s</div><div class='v'>%s</div>"
                "<div class='p'>%s</div>%s</div>" %
                (c["id"], c["name"], price, btn))
        return SITE_HTML.format(
            name=g.name, motd=g.motd, site=g.site_url or "",
            card=g.cfg.get("payment_card", "") or "—",
            holder=g.cfg.get("payment_card_holder", "") or "—",
            note=g.cfg.get("payment_note", "") or
                 "پس از واریز، کد سفارش را به ادمین اطلاع دهید تا تأیید شود.",
            items=items)

    def render(self):
        g = self.game
        rows = ""
        for m in g.modes.values():
            if m.id == "lobby":
                continue
            rows += f"<tr><td><code>/join {m.id}</code></td><td>{m.name}</td><td>{m.desc}</td></tr>"
        online = sum(1 for p in g.players.values() if p.connected)
        uptime = int(time.time() - g.started)
        mm, ss = divmod(uptime, 60)
        hh, mm = divmod(mm, 60)
        log = "\n".join(g.log_lines[-18:])
        return PANEL_HTML.format(
            name=g.name, motd=g.motd, online=online, modes=len(g.modes) - 1,
            bots=len(g.bots), ai="ENABLED" if g.ai_enabled else "OFF",
            aicl="" if g.ai_enabled else "off", tps=f"{g.tps:.1f}",
            weather=g.weather, uptime=f"{hh}h {mm}m {ss}s",
            host=self._host(), bport=g.cfg.get("bedrock_port"),
            rows=rows, log=log or "(empty)", ts=time.strftime("%Y-%m-%d %H:%M:%S"),
        )

    def _host(self):
        return f"{self.host}:{self.game.cfg.get('port', 25565)}"
