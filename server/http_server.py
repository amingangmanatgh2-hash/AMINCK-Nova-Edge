"""Tiny async HTTP panel (no dependencies) — status, admin-lite, favicon."""
import asyncio, json, os, time


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
    <div class="sub">Java 1.8 → 26.x &nbsp;•&nbsp; Bedrock (beta ping)</div>
  </div>
</header>

<div class="grid">
  <div class="card"><div class="k">Status</div><div class="v">● Online</div></div>
  <div class="card"><div class="k">Players online</div><div class="v">{online} / 100</div></div>
  <div class="card"><div class="k">Gamemodes</div><div class="v">{modes}</div></div>
  <div class="card"><div class="k">AI Bots</div><div class="v">{bots}</div></div>
  <div class="card"><div class="k">Workers AI</div><div class="v"><span class="badge {aicl}">{ai}</span></div></div>
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
<li><code>/companion</code> — AI friend that follows &amp; helps, <code>/enemy 3</code> — hostiles</li>
<li><code>/lobby</code> — back to hub, <code>/ai</code> — toggle bot chat</li>
</ul>

<h2>Server log</h2>
<pre>{log}</pre>
<div class="footer">AMINCK Nova • runs on Cloudflare Containers • {ts}</div>
</div></body></html>"""


class HttpPanel:
    def __init__(self, game, host="0.0.0.0", port=8080):
        self.game = game
        self.host = host
        self.port = port
        self.server = None

    async def start(self):
        self.server = await asyncio.start_server(self._handle, self.host, self.port)
        self.game.log(f"HTTP panel on http://{self.host}:{self.port}")

    async def _handle(self, reader, writer):
        try:
            data = await reader.read(65536)
            if not data:
                return
            request = data.decode("utf-8", "replace")
            line = request.split("\r\n")[0]
            method, path, _ = (line.split(" ") + ["", ""])[:3]
            if method != "GET":
                await self._resp(writer, 405, "text/plain", b"method not allowed")
                return
            path = path.split("?")[0]
            if path in ("/", "/index.html"):
                await self._resp(writer, 200, "text/html; charset=utf-8",
                                 self.render().encode("utf-8"))
            elif path == "/api/status":
                await self._resp(writer, 200, "application/json",
                                 json.dumps(self.status()).encode("utf-8"))
            elif path == "/favicon.png":
                await self._favicon(writer)
            else:
                await self._resp(writer, 404, "text/plain", b"not found")
        except Exception:
            pass
        finally:
            try:
                writer.close()
            except Exception:
                pass

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

    async def _resp(self, writer, code, ctype, body):
        head = (f"HTTP/1.1 {code} OK\r\nContent-Type: {ctype}\r\n"
                f"Content-Length: {len(body)}\r\nConnection: close\r\n\r\n").encode()
        writer.write(head + body)
        await writer.drain()

    def status(self):
        g = self.game
        return {
            "name": g.name, "motd": g.motd,
            "online": sum(1 for p in g.players.values() if p.connected),
            "players": [p.name for p in g.players.values() if p.connected],
            "bots": len(g.bots),
            "modes": list(g.modes.keys()),
            "ai": g.ai_enabled,
            "uptime": int(time.time() - g.started),
        }

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
            aicl="" if g.ai_enabled else "off",
            uptime=f"{hh}h {mm}m {ss}s", host=self._host(), bport=g.cfg.get("bedrock_port"),
            rows=rows, log=log or "(empty)", ts=time.strftime("%Y-%m-%d %H:%M:%S"),
        )

    def _host(self):
        return f"{self.host}:{self.game.cfg.get('port', 25565)}"
