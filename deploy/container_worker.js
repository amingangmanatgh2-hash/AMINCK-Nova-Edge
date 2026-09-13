// ─────────────────────────────────────────────────────────────────────────────
//  AMINCK Nova — container-backed Worker (Cloudflare Containers, public beta).
//
//  This is the full-stack entrypoint used by `wrangler.containers.toml`:
//    •  HTTP panel proxied to the Python game server (container port 8080)
//    •  Workers AI icon + /ai/chat (no token) — the container also calls this
//    •  Inbound Minecraft TCP (25565) via Spectrum `connect()` → container
//
//  The game server (server/Dockerfile) listens on 25565 (Java), 19132
//  (Bedrock ping) and 8080 (HTTP panel).
// ─────────────────────────────────────────────────────────────────────────────
import { Container } from "@cloudflare/containers";
import {
  CHAT_MODEL, IMAGE_MODEL, setupPage, panelPage, GAMEMODES,
  generateIconPng, aiChat,
} from "./panel.js";

const JAVA_PORT = 25565;
const PANEL_PORT = 8080;

export class NovaContainer extends Container {
  defaultPort = PANEL_PORT;
  sleepAfter = "10m";
  enableInternet = true;

  // Runtime environment forwarded into the Python container (see config.py).
  get envVars() {
    return {
      SERVER_NAME: this.env.SERVER_NAME || "AMINCK Nova",
      MOTD: this.env.MOTD || "Minecraft God Server — Java 1.8 → 26.x",
      AI_FALLBACK_URL: this.env.AI_FALLBACK_URL || "",
      CLOUDFLARE_API_TOKEN: this.env.CLOUDFLARE_API_TOKEN || "",
      CLOUDFLARE_ACCOUNT_ID: this.env.CLOUDFLARE_ACCOUNT_ID || "",
      PORT: String(JAVA_PORT),
      BEDROCK_PORT: "19132",
      HTTP_PORT: String(PANEL_PORT),
      VIEW_DISTANCE: "4",
    };
  }

  // Inbound raw TCP (Minecraft) forwarded into the container network.
  async connect(socket) {
    const port = JAVA_PORT;
    const containerSocket = this.ctx.container
      .getTcpPort(port)
      .connect(`10.0.0.1:${port}`);
    await containerSocket.opened;
    await Promise.all([
      socket.readable.pipeTo(containerSocket.writable),
      containerSocket.readable.pipeTo(socket.writable),
    ]);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ── Workers AI endpoints (no token) ──────────────────────────────────
    if (path === "/ai/chat" && request.method === "POST") {
      try {
        const body = await request.json();
        const messages = Array.isArray(body.messages) ? body.messages
          : [{ role: "user", content: String(body.prompt || "") }];
        const text = await aiChat(env, messages, body.model || CHAT_MODEL, body.max_tokens || 160);
        return Response.json({ response: text });
      } catch (e) {
        return Response.json({ response: "", error: String(e) }, { status: 500 });
      }
    }

    if (path === "/favicon.png" || path === "/icon.png") {
      try {
        const png = await generateIconPng(env, env.SERVER_NAME || "AMINCK Nova");
        return new Response(png, { headers: { "Content-Type": "image/png",
          "Cache-Control": "public, max-age=86400" } });
      } catch {
        // fall through to container (its own procedural icon)
      }
    }

    // ── everything else → the Python game server panel (container) ───────
    const container = env.NOVA.getByName("main");
    return container.fetch(request);
  },

  // Inbound Minecraft TCP via Spectrum → container 25565
  async connect(socket, env) {
    try {
      const stub = env.NOVA.getByName("main");
      // Beta socket RPC: connect a raw socket into the container network.
      const containerSocket = stub.connect(`10.0.0.1:${JAVA_PORT}`) ??
        stub.connect(`${JAVA_PORT}`);
      await Promise.all([
        socket.readable.pipeTo(containerSocket.writable),
        containerSocket.readable.pipeTo(socket.writable),
      ]);
    } catch (e) {
      // Spectrum/containers socket path unavailable — close gracefully.
      try { await socket.writable.getWriter().close(); } catch { /* noop */ }
    }
  },
};
