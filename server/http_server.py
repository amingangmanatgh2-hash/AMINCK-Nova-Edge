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
import base64
import hashlib
import hmac
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

    def _worker_token_ok(self, tok):
        """Accept the Cloudflare Worker's HMAC token.

        The front Worker (deploy/worker.js) signs a session token with
        HMAC-SHA256(ADMIN_PASSWORD, expiry). Because both tiers share the same
        deploy-time password, one login works for the Worker panel *and* this
        container panel — the Worker can proxy admin actions straight through
        without a second login round-trip.
        """
        password = getattr(self.game, "admin_password", "") or ""
        if not password or "." not in tok:
            return False
        exp_b64, sig_b64 = tok.split(".", 1)
        try:
            pad = "=" * (-len(exp_b64) % 4)
            exp = base64.urlsafe_b64decode(exp_b64 + pad).decode("utf-8")
            if not exp.isdigit() or int(exp) < time.time():
                return False
            want = base64.urlsafe_b64encode(
                hmac.new(password.encode("utf-8"), exp.encode("utf-8"),
                         hashlib.sha256).digest()
            ).decode("ascii").rstrip("=")
            return hmac.compare_digest(want, sig_b64)
        except Exception:
            return False

    def _authed(self, headers):
        auth = headers.get("authorization", "") or headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return False
        tok = auth[7:].strip()
        if not tok:
            return False
        exp = self._tokens.get(tok)
        if exp and exp >= time.time():
            return True
        return self._worker_token_ok(tok)

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
            if path == "/admin/api/orders" and method == "GET":
                await self._json(writer, 200, {"ok": True, "orders": self.admin_orders()})
                return
            if path == "/admin/api/codes" and method == "GET":
                codes = self.game.econ.codes()
                if isinstance(codes, dict):
                    codes = [dict(code=k, **v) if isinstance(v, dict)
                             else {"code": k, "value": v} for k, v in codes.items()]
                await self._json(writer, 200, {"ok": True, "codes": codes})
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
    def admin_orders(self):
        """Order book as a list, shaped for the Worker admin panel."""
        raw = self.game.econ.orders()
        out = []
        if isinstance(raw, dict):
            for oid, o in raw.items():
                if isinstance(o, dict):
                    item = dict(o)
                    item.setdefault("id", oid)
                    out.append(item)
                else:
                    out.append({"id": oid, "item": str(o), "status": "pending"})
        elif isinstance(raw, list):
            out = [o if isinstance(o, dict) else {"id": str(o)} for o in raw]
        return out

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

    # Action names accepted by admin_action. The Cloudflare Worker admin panel
    # (deploy/panel.js) posts exactly these, so both tiers speak one vocabulary.
    TIME_PRESETS = {
        "sunrise": 0, "day": 1000, "morning": 2000, "noon": 6000,
        "sunset": 12000, "night": 13000, "midnight": 18000,
    }

    def _online(self, name):
        return self.game.players.get(str(name or "").strip().lower())

    def admin_action(self, data):
        g = self.game
        action = str(data.get("action") or "").lower().strip()
        econ = g.econ
        try:
            # ── chat / broadcast ──────────────────────────────────────────
            if action == "broadcast":
                msg = str(data.get("message") or data.get("text") or "").strip()
                if not msg:
                    return False, "no message"
                g.broadcast_all("§6§l[Broadcast] §r" + msg)
                return True, "broadcast sent"

            # ── moderation ────────────────────────────────────────────────
            if action == "kick":
                p = self._online(data.get("player"))
                if not p:
                    return False, "player not online"
                reason = str(data.get("reason") or "Kicked by admin")
                asyncio.ensure_future(p.session.disconnect(reason))
                return True, "kicked"
            if action == "ban":
                name = str(data.get("player") or "").strip()
                if not name:
                    return False, "no player"
                econ.ban(name)
                p = self._online(name)
                if p:
                    asyncio.ensure_future(
                        p.session.disconnect(str(data.get("reason") or "Banned by admin")))
                return True, "banned"
            if action == "unban":
                econ.unban(str(data.get("player") or ""))
                return True, "unbanned"
            if action == "mute":
                econ.mute(str(data.get("player") or ""),
                          int(data.get("minutes", 30)) * 60)
                return True, "muted"
            if action == "unmute":
                econ.unmute(str(data.get("player") or ""))
                return True, "unmuted"

            # ── economy ───────────────────────────────────────────────────
            if action in ("give_coins", "coins_add"):
                name = str(data.get("player") or "")
                amount = int(data.get("amount") or 0)
                econ.add_coins(name, amount)
                g.refresh_score(name)
                return True, {"player": name, "coins": econ.coins(name)}
            if action == "coins_set":
                name = str(data.get("player") or "")
                coins = econ.set_coins(name, int(data.get("amount") or 0))
                g.refresh_score(name)
                return True, {"player": name, "coins": coins}
            if action in ("set_rank", "rank_set"):
                name = str(data.get("player") or "")
                ok = econ.set_rank(name, str(data.get("rank") or ""))
                if ok:
                    g.refresh_score(name)
                    p = self._online(name)
                    if p and hasattr(g, "send_prefix_update"):
                        g.send_prefix_update(p)
                return ok, ({"player": name, "rank": str(data.get("rank"))}
                            if ok else "invalid rank")
            if action == "xp_add":
                name = str(data.get("player") or "")
                gained = econ.add_xp(name, int(data.get("amount") or 0))
                g.refresh_score(name)
                return True, {"player": name, "level": econ.level(name),
                              "levels_gained": gained}
            if action == "give":
                name = str(data.get("player") or "").strip()
                item = str(data.get("item") or "").strip()
                count = max(1, int(data.get("count") or 1))
                if not name or not item:
                    return False, "player and item are required"
                p = self._online(name)
                if p:
                    g.give_items(p, [(item, count)])
                    return True, {"player": name, "item": item, "count": count,
                                  "delivered": "now"}
                # offline: stash it so it is restored on next join
                inv = dict(econ.inventory(name) or {})
                inv[item] = int(inv.get(item, 0)) + count
                econ.set_inventory(name, inv)
                return True, {"player": name, "item": item, "count": count,
                              "delivered": "on next join"}

            if action == "player_info":
                name = str(data.get("player") or "").strip()
                if not name:
                    return False, "player name is required"
                rec = econ.get(name)
                p = self._online(name)
                return True, {
                    "name": name,
                    "online": bool(p),
                    "coins": rec["coins"], "xp": rec["xp"],
                    "level": _econ.level_for_xp(rec["xp"]),
                    "rank": rec["rank"], "kills": rec["kills"], "deaths": rec["deaths"],
                    "banned": bool(rec.get("banned")),
                    "muted": econ.is_muted(name),
                    "muted_until": rec.get("muted_until", 0),
                    "playtime": rec.get("playtime", 0),
                    "first_join": rec.get("first_join", 0),
                    "inventory": econ.inventory(name),
                    "homes": econ.homes(name),
                    "world": (p.world.name if p and p.world else ""),
                    "position": ([round(p.x, 1), round(p.y, 1), round(p.z, 1)]
                                 if p else []),
                }

            # ── world ─────────────────────────────────────────────────────
            if action == "world":
                t = str(data.get("time") or "").lower()
                w = str(data.get("weather") or "").lower()
                done = []
                if t:
                    ticks = self.TIME_PRESETS.get(t)
                    if ticks is None:
                        try:
                            ticks = int(t)
                        except ValueError:
                            return False, f"unknown time '{t}'"
                    g.set_time(ticks)
                    done.append(f"time={t}({ticks})")
                if w:
                    g.set_weather(w)
                    done.append(f"weather={w}")
                return (True, ", ".join(done)) if done else (False, "nothing to do")
            if action == "settime":
                t = str(data.get("time") or data.get("ticks") or "noon").lower()
                ticks = self.TIME_PRESETS.get(t)
                if ticks is None:
                    ticks = int(t)
                g.set_time(ticks)
                return True, f"time set to {ticks}"
            if action == "setweather":
                g.set_weather(str(data.get("weather") or "clear"))
                return True, f"weather={g.weather}"

            # ── AI bots ───────────────────────────────────────────────────
            if action in ("bots_spawn", "bot_spawn"):
                kind = str(data.get("kind") or data.get("role") or "enemy").lower()
                role = "companion" if kind in ("companion", "friend") else "enemy"
                diff = str(data.get("difficulty") or g.difficulty or "normal").lower()
                mode = g.modes.get(str(data.get("mode") or "lobby"), g.lobby)
                try:
                    count = max(1, min(20, int(data.get("count") or 1)))
                except (TypeError, ValueError):
                    count = 1
                spawned = []
                for i in range(count):
                    nm = f"{'Ally' if role == 'companion' else 'Bot'}{len(g.bots) + i + 1}"
                    bot = g.create_bot(
                        nm, mode.world, role=role,
                        personality="friendly" if role == "companion" else "hostile",
                        difficulty=diff if role == "enemy" else None,
                        x=0.5 + i, y=mode.world.top_y(0, 0), z=0.5)
                    spawned.append(bot.entity_id)
                return True, {"spawned": spawned, "role": role, "difficulty": diff,
                              "world": mode.world.name}
            if action in ("bots_clear", "killbots"):
                n = len(g.bots)
                for b in list(g.bots.values()):
                    g.remove_bot(b)
                return True, f"{n} bots removed"

            # ── server config ─────────────────────────────────────────────
            if action == "config_set":
                cfg = econ.data.setdefault("config", {})
                if data.get("name"):
                    g.name = str(data["name"])[:40]
                    cfg["name"] = g.name
                if data.get("motd"):
                    g.motd = str(data["motd"])[:140]
                    cfg["motd"] = g.motd
                if data.get("domain"):
                    dom = str(data["domain"]).strip()[:120]
                    cfg["domain"] = dom
                    # Re-derive the shop URL when the admin changes the domain,
                    # unless the current one already points at it.
                    if dom and dom not in (g.site_url or ""):
                        g.site_url = f"https://{dom}/site"
                        cfg["site_url"] = g.site_url
                if data.get("site_url"):
                    g.site_url = str(data["site_url"])[:200]
                    cfg["site_url"] = g.site_url
                econ.save()
                return True, {"name": g.name, "motd": g.motd, "site": g.site_url}
            if action == "icon_regenerate":
                name = str(data.get("name") or g.name)
                fp = g.cfg.get("favicon_path") or "favicon.png"
                from . import image_gen
                try:
                    if os.path.exists(fp):
                        os.remove(fp)
                except Exception:
                    pass
                uri = image_gen.make_icon(
                    g.cfg.get("account_id", ""), g.cfg.get("ai_token", ""),
                    name, fp, model=g.cfg.get("image_model",
                                              "@cf/black-forest-labs/flux-1-schnell"),
                    fallback_url=g.cfg.get("ai_fallback_url", "") or None,
                    gateway_url=g.cfg.get("ai_gateway_url", "") or None,
                    gateway_token=g.cfg.get("ai_gateway_token", "") or None)
                if uri:
                    g.favicon_data_uri = uri
                return bool(uri), ("icon regenerated" if uri else "icon generation failed")
            if action == "difficulty":
                d = str(data.get("difficulty") or "normal").lower()
                if d not in ("easy", "normal", "hard"):
                    return False, "difficulty must be easy|normal|hard"
                g.difficulty = d
                for b in list(g.bots.values()):
                    if getattr(b, "brain", None) and b.brain.role == "enemy":
                        b.brain.difficulty = d
                return True, f"difficulty={d}"

            # ── shop / catalog / payment ──────────────────────────────────
            if action == "catalog_add":
                item = econ.catalog_add(data)
                return bool(item), (item or "invalid item")
            if action == "catalog_remove":
                ok = econ.catalog_remove(data.get("id"))
                return ok, ("removed" if ok else "invalid id")
            if action == "payment_set":
                pay = econ.set_payment(card=data.get("card"),
                                       card_holder=data.get("card_holder"),
                                       note=data.get("note"))
                return True, pay
            if action == "code_create":
                code = str(data.get("code") or "").strip().upper()
                ctype = str(data.get("type") or "coins")
                cval = data.get("value", 1000)
                if ctype in ("coins",):
                    try:
                        cval = int(cval)
                    except (TypeError, ValueError):
                        cval = 1000
                if code:
                    econ.data["codes"][code] = {
                        "type": ctype, "value": cval,
                        "uses": int(data.get("uses") or 1),
                        "created_by": "admin", "created": int(time.time()),
                    }
                    econ.save()
                else:
                    code = econ.create_code(ctype, cval, int(data.get("uses") or 1))
                return True, code
            if action == "order_create":
                oid = econ.create_order(str(data.get("item") or ""),
                                        str(data.get("buyer") or "guest"))
                return bool(oid), (oid or "unknown item")
            if action == "order_resolve":
                oid = str(data.get("order_id") or "")
                code = econ.resolve_order(oid, str(data.get("gateway_ref") or ""))
                return bool(code), ({"order_id": oid, "code": code}
                                    if code else "no such order")

            # ── player utilities ──────────────────────────────────────────
            if action == "heal":
                p = self._online(data.get("player"))
                if not p:
                    return False, "player not online"
                prof = p.session.profile
                p.health = getattr(p, "max_health", 20.0)
                p.food = 20
                asyncio.ensure_future(p.session.send_raw(prof.update_health(p.health)))
                return True, "healed"
            if action == "tp":
                p = self._online(data.get("player"))
                if not p:
                    return False, "player not online"
                prof = p.session.profile
                p.set_pos(float(data.get("x", p.x)), float(data.get("y", p.y)),
                          float(data.get("z", p.z)))
                asyncio.ensure_future(p.session.send_raw(
                    prof.position(p.x, p.y, p.z, p.yaw, p.pitch)))
                return True, f"teleported to {p.x:.1f} {p.y:.1f} {p.z:.1f}"
            if action == "fly":
                p = self._online(data.get("player"))
                if not p:
                    return False, "player not online"
                prof = p.session.profile
                want = data.get("on")
                on = (p.gamemode == 1) if want is None else bool(want)
                p.gamemode = 1 if on else 0
                asyncio.ensure_future(p.session.send_raw(prof.abilities(
                    creative=on, allow_flying=on, flying=on)))
                return True, f"fly={'on' if on else 'off'}"

            # ── lifecycle ─────────────────────────────────────────────────
            if action == "save":
                econ.save()
                return True, "saved"
            if action == "scoreboard":
                g.scoreboard_on = not g.scoreboard_on
                for p in list(g.players.values()):
                    if p.connected:
                        g.refresh_score(p.name)
                return True, f"scoreboard {'on' if g.scoreboard_on else 'off'}"
            if action == "restart":
                return self._soft_restart()
            if action == "console":
                return self.console_command(data.get("command") or data.get("cmd") or "")

            return False, f"unknown action '{action}'"
        except Exception as e:
            return False, f"{type(e).__name__}: {e}"

    # ── soft restart: reload persisted state and reset the live session ──────
    def _soft_restart(self):
        g = self.game
        g.econ.save()
        g.econ.load()
        for b in list(g.bots.values()):
            g.remove_bot(b)
        g._tick_times.clear()
        moved = 0
        for p in list(g.players.values()):
            if p.connected:
                try:
                    g.lobby.join(g, p)
                    moved += 1
                except Exception:
                    pass
        g.broadcast_all("§e§l[Server] §rSoft restart complete — welcome back!")
        g.log(f"soft restart: state reloaded, bots cleared, {moved} players re-lobbied")
        return True, {"reloaded": True, "players_reset": moved}

    # ── console: a real command line over the same admin operations ──────────
    CONSOLE_HELP = (
        "say|broadcast <msg> · time <day|noon|night|midnight|ticks> · "
        "weather <clear|rain|thunder> · kick <player> · ban <player> · "
        "unban <player> · mute <player> [min] · unmute <player> · "
        "coins <player> <n> · setcoins <player> <n> · rank <player> <rank> · "
        "xp <player> <n> · give <player> <item> [n] · heal <player> · "
        "tp <player> <x> <y> <z> · bot <n> [enemy|companion] [easy|normal|hard] · "
        "killbots · code [coins|rank|kit] <value> · orders · codes · "
        "info <player> · status · list · save · scoreboard · restart · help"
    )

    def console_command(self, line):
        parts = str(line or "").strip().lstrip("/").split()
        if not parts:
            return False, "empty command"
        cmd, a = parts[0].lower(), parts[1:]
        act = self.admin_action

        if cmd == "help":
            return True, self.CONSOLE_HELP
        if cmd == "status":
            return True, self.admin_status()
        if cmd == "list":
            names = [p.name for p in self.game.players.values() if p.connected]
            return True, {"online": len(names), "players": names,
                          "bots": len(self.game.bots)}
        if cmd == "orders":
            return True, self.admin_orders()
        if cmd == "codes":
            return True, self.game.econ.codes()
        if cmd in ("info", "whois", "player"):
            return act({"action": "player_info", "player": a[0] if a else ""})
        if cmd in ("say", "broadcast", "bc"):
            return act({"action": "broadcast", "message": " ".join(a)})
        if cmd == "time":
            return act({"action": "settime", "time": a[0] if a else "noon"})
        if cmd == "weather":
            return act({"action": "setweather", "weather": a[0] if a else "clear"})
        if cmd == "kick":
            return act({"action": "kick", "player": a[0] if a else ""})
        if cmd == "ban":
            return act({"action": "ban", "player": a[0] if a else "",
                        "reason": " ".join(a[1:]) or "Banned by admin"})
        if cmd == "unban":
            return act({"action": "unban", "player": a[0] if a else ""})
        if cmd == "mute":
            return act({"action": "mute", "player": a[0] if a else "",
                        "minutes": int(a[1]) if len(a) > 1 and a[1].isdigit() else 30})
        if cmd == "unmute":
            return act({"action": "unmute", "player": a[0] if a else ""})
        if cmd == "coins":
            return act({"action": "coins_add", "player": a[0] if a else "",
                        "amount": int(a[1]) if len(a) > 1 else 0})
        if cmd == "setcoins":
            return act({"action": "coins_set", "player": a[0] if a else "",
                        "amount": int(a[1]) if len(a) > 1 else 0})
        if cmd == "rank":
            return act({"action": "rank_set", "player": a[0] if a else "",
                        "rank": a[1] if len(a) > 1 else "player"})
        if cmd == "xp":
            return act({"action": "xp_add", "player": a[0] if a else "",
                        "amount": int(a[1]) if len(a) > 1 else 0})
        if cmd == "give":
            return act({"action": "give", "player": a[0] if a else "",
                        "item": a[1] if len(a) > 1 else "",
                        "count": int(a[2]) if len(a) > 2 and a[2].isdigit() else 1})
        if cmd == "heal":
            return act({"action": "heal", "player": a[0] if a else ""})
        if cmd == "tp" and len(a) >= 4:
            return act({"action": "tp", "player": a[0], "x": float(a[1]),
                        "y": float(a[2]), "z": float(a[3])})
        if cmd in ("bot", "spawnbot"):
            return act({"action": "bots_spawn",
                        "count": int(a[0]) if a and a[0].isdigit() else 1,
                        "kind": a[1] if len(a) > 1 else "enemy",
                        "difficulty": a[2] if len(a) > 2 else "normal"})
        if cmd in ("killbots", "clearbots"):
            return act({"action": "bots_clear"})
        if cmd == "code":
            return act({"action": "code_create", "type": a[0] if a else "coins",
                        "value": a[1] if len(a) > 1 else 1000})
        if cmd == "save":
            return act({"action": "save"})
        if cmd == "scoreboard":
            return act({"action": "scoreboard"})
        if cmd in ("restart", "softrestart"):
            return act({"action": "restart"})
        return False, f"unknown console command '{cmd}'. Try: help"

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
            "catalog": g.econ.catalog(),
            # econ.payment() layers admin overrides on top of the deploy-time
            # PAYMENT_* env vars, so panel edits reach /site immediately.
            "payment": g.econ.payment(),
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
        pay = g.econ.payment()
        items = ""
        for c in g.econ.catalog():
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
            card=pay.get("card") or "—",
            holder=pay.get("card_holder") or "—",
            note=pay.get("note") or
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
