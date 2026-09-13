// ─────────────────────────────────────────────────────────────────────────────
//  AMINCK Nova — Workers front (standalone). One-click deployable, NO token.
//
//  •  Panel + setup form (asks server name & domain at first visit)
//  •  AI server icon generated with the Workers AI binding (Flux) — no token
//  •  `/ai/chat` — Workers AI chat (the game server calls this as a fallback
//     when its own token isn't configured / fails)
//  •  `/api/status` — forwards to the game server when SERVER_HOST is set
//  •  Raw TCP passthrough (Spectrum) when a container is bound (see
//     container_worker.js for the container-backed variant)
// ─────────────────────────────────────────────────────────────────────────────
import {
  CHAT_MODEL, IMAGE_MODEL, setupPage, panelPage, escapeHtml,
  generateIconPng, aiChat,
} from "./panel.js";

// Persistent config (name / domain / icon) in a SQLite-backed Durable Object.
export class NovaStore {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }
  async _ensure() {
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS cfg (k TEXT PRIMARY KEY, v TEXT)");
  }
  async load() {
    await this._ensure();
    try {
      const out = {};
      for (const row of this.ctx.storage.sql.exec("SELECT k, v FROM cfg").toArray()) {
        out[row.k] = row.v;
      }
      return out;
    } catch {
      return {};
    }
  }
  async save(data) {
    await this._ensure();
    const stmt = this.ctx.storage.sql.prepare("INSERT OR REPLACE INTO cfg (k, v) VALUES (?, ?)");
    for (const [k, v] of Object.entries(data)) {
      stmt.bind(k, String(v == null ? "" : v)).run();
    }
    return true;
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const store = env.STORE.get(env.STORE.idFromName("main"));

    // ── setup ────────────────────────────────────────────────────────────
    if (path === "/__setup" && request.method === "POST") {
      const form = await request.formData();
      const name = (form.get("name") || "AMINCK Nova").toString().slice(0, 40);
      const domain = (form.get("domain") || "").toString().slice(0, 120);
      const motd = (form.get("motd") || "Minecraft God Server — Java 1.8 → 26.x").toString().slice(0, 140);
      try {
        const png = await generateIconPng(env, name);
        await store.save({ name, domain, motd, icon: btoa(String.fromCharCode(...png)) });
      } catch (e) {
        // AI image failed — keep going without an icon (panel shows fallback)
        await store.save({ name, domain, motd });
      }
      return Response.redirect(url.origin + "/", 302);
    }

    if (path === "/__reset") {
      await store.save({ name: "", domain: "", motd: "", icon: "" });
      return Response.redirect(url.origin + "/", 302);
    }

    // ── icon ─────────────────────────────────────────────────────────────
    if (path === "/favicon.png" || path === "/icon.png") {
      const cfg = await store.load();
      if (cfg.icon) {
        const bin = Uint8Array.from(atob(cfg.icon), (c) => c.charCodeAt(0));
        return new Response(bin, { headers: { "Content-Type": "image/png",
          "Cache-Control": "public, max-age=86400" } });
      }
      // procedural fallback: tiny gold "AN" mark
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#16213f"/><stop offset="1" stop-color="#0a0f1e"/></linearGradient></defs><rect width="64" height="64" rx="12" fill="url(#g)"/><text x="32" y="42" font-family="system-ui" font-size="26" font-weight="800" fill="#ffd76a" text-anchor="middle">AN</text></svg>`;
      return new Response(svg, { headers: { "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=3600" } });
    }

    // ── Workers AI chat (no token) — called by the game server ───────────
    if (path === "/ai/chat" && request.method === "POST") {
      try {
        const body = await request.json();
        const messages = Array.isArray(body.messages) ? body.messages
          : [{ role: "user", content: String(body.prompt || body.message || "") }];
        const text = await aiChat(env, messages, body.model || CHAT_MODEL, body.max_tokens || 160);
        return Response.json({ response: text });
      } catch (e) {
        return Response.json({ response: "", error: String(e) }, { status: 500 });
      }
    }

    // ── status API ───────────────────────────────────────────────────────
    if (path === "/api/status") {
      const cfg = await store.load();
      let backend = null;
      if (env.SERVER_HOST) {
        try {
          const r = await fetch(env.SERVER_HOST + "/api/status", { cf: { cacheTtl: 0 } });
          if (r.ok) backend = await r.json();
        } catch { /* container unreachable */ }
      }
      return Response.json({
        name: cfg.name || "AMINCK Nova",
        domain: cfg.domain || "",
        motd: cfg.motd || "",
        ai: "on", // Workers AI binding always available here
        backend,
      });
    }

    // ── panel ────────────────────────────────────────────────────────────
    if (path === "/" || path === "/index.html") {
      const cfg = await store.load();
      if (!cfg.name) return new Response(setupPage(""), {
        headers: { "Content-Type": "text/html; charset=utf-8" } });
      const backend = env.SERVER_HOST ? await (async () => {
        try {
          const r = await fetch(env.SERVER_HOST + "/api/status", { cf: { cacheTtl: 5 } });
          return r.ok ? await r.json() : null;
        } catch { return null; }
      })() : null;
      const backendNote = env.SERVER_HOST && !backend
        ? `<div class="note">⚠️ سرور بازی (Container) هنوز متصل نیست — پنل جلو فعال است اما آدرس اتصال بازی بعد از دیپلوی کانتینر فعال می‌شود.</div>`
        : "";
      return new Response(panelPage({
        name: cfg.name, motd: cfg.motd, domain: cfg.domain,
        java: backend ? (cfg.domain ? cfg.domain + ":25565" : "") : "",
        online: backend?.online ?? 0, bots: backend?.bots ?? 0,
        uptime: backend?.uptime ?? "—", ai: "on", backendNote,
      }), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    return new Response("not found", { status: 404 });
  },

  // Raw TCP (Spectrum) — in standalone mode we have no container, so just
  // close the socket. The container-backed variant wires this to 25565.
  async connect(socket, env) {
    try {
      const writer = socket.writable.getWriter();
      await writer.close();
    } catch { /* noop */ }
  },
};
