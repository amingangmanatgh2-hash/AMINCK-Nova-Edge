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
  generateIconPng, aiChat, shopPage, SHOP_CATALOG,
  adminPage, adminLoginPage, adminNoPasswordPage,
} from "./panel.js";

// ─────────────────────────────────────────────────────────────────────────────
//  Admin session tokens — HMAC-SHA256 signed with ADMIN_PASSWORD.
//  The same password protects the Python container's /admin API, so one
//  credential set works for both tiers and nothing has to be stored.
// ─────────────────────────────────────────────────────────────────────────────
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)))
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64uDecode = (s) => {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(pad + "=".repeat((4 - (pad.length % 4)) % 4)),
    (c) => c.charCodeAt(0));
};

async function hmac(password, message) {
  const key = await crypto.subtle.importKey("raw",
    new TextEncoder().encode(password), { name: "HMAC", hash: "SHA-256" },
    false, ["sign"]);
  return crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
}

export async function issueToken(password, ttlSeconds = 12 * 3600) {
  const exp = String(Math.floor(Date.now() / 1000) + ttlSeconds);
  return `${b64u(new TextEncoder().encode(exp))}.${b64u(await hmac(password, exp))}`;
}

export async function verifyToken(password, token) {
  if (!password || !token || typeof token !== "string") return false;
  const [e, s] = token.split(".");
  if (!e || !s) return false;
  try {
    const exp = new TextDecoder().decode(b64uDecode(e));
    if (!/^\d+$/.test(exp)) return false;
    if (Number(exp) * 1000 < Date.now()) return false;
    const want = b64u(await hmac(password, exp));
    // constant-time compare
    if (want.length !== s.length) return false;
    let diff = 0;
    for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ s.charCodeAt(i);
    return diff === 0;
  } catch {
    return false;
  }
}

function cookieToken(request) {
  const hdr = request.headers.get("Cookie") || "";
  const m = hdr.match(/(?:^|;\s*)nova_admin=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

function authHeader(request) {
  const h = request.headers.get("Authorization") || request.headers.get("authorization") || "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

export function newCode(prefix = "NOVA") {
  const alpha = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let out = "";
  for (const b of bytes) out += alpha[b % alpha.length];
  return `${prefix}-${out.slice(0, 4)}-${out.slice(4, 8)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Durable-Object-backed shop store. Used as the authoritative shop when the
//  Worker is deployed standalone (one-click), and as a cache/fallback when a
//  game container is attached.
// ─────────────────────────────────────────────────────────────────────────────
async function readJson(store, key, fallback) {
  const cfg = await store.load();
  const raw = cfg[key];
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

async function writeJson(store, key, value) {
  return store.save({ [key]: JSON.stringify(value) });
}

// Forward an admin action to the running game server. Returns null when there
// is no backend configured or the call failed, so callers can fall back to the
// Worker-side shop book instead of silently pretending the action worked.
async function backendAction(env, token, body) {
  if (!env.SERVER_HOST) return null;
  try {
    const r = await fetch(env.SERVER_HOST + "/admin/api/action", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      cf: { cacheTtl: 0 },
    });
    const j = await r.json().catch(() => ({}));
    return { status: r.status, body: j };
  } catch (e) {
    return { status: 502, body: { ok: false, error: "ارتباط با سرور بازی ناموفق: " + String(e) } };
  }
}

async function backendOrders(env, token) {
  if (!env.SERVER_HOST) return null;
  try {
    const r = await fetch(env.SERVER_HOST + "/admin/api/orders", {
      headers: { Authorization: `Bearer ${token}` }, cf: { cacheTtl: 0 },
    });
    if (!r.ok) return null;
    const j = await r.json();
    const list = Array.isArray(j) ? j : (j.orders || []);
    return Array.isArray(list) ? list : null;
  } catch {
    return null;
  }
}

async function shopState(store, env) {
  const [catalogExtra, payment, orders] = await Promise.all([
    readJson(store, "catalog", []),
    readJson(store, "payment", null),
    readJson(store, "orders", []),
  ]);
  const removed = new Set(catalogExtra.filter((c) => c.removed).map((c) => c.id));
  const added = catalogExtra.filter((c) => !c.removed);
  const catalog = [...SHOP_CATALOG.filter((c) => !removed.has(c.id)), ...added];
  return {
    catalog,
    payment: payment || {
      card: env.PAYMENT_CARD || "", card_holder: env.PAYMENT_CARD_HOLDER || "",
      note: env.PAYMENT_NOTE || "",
    },
    orders,
  };
}

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

    // ── site shop ────────────────────────────────────────────────────────
    if (path === "/site") {
      const cfg = await store.load();
      const local = await shopState(store, env);
      let catalog = local.catalog;
      let payment = local.payment;
      if (env.SERVER_HOST) {
        try {
          const r = await fetch(env.SERVER_HOST + "/api/catalog", { cf: { cacheTtl: 30 } });
          if (r.ok) {
            const j = await r.json();
            if (Array.isArray(j.catalog) && j.catalog.length) catalog = j.catalog;
            if (j.payment && (j.payment.card || j.payment.card_holder)) payment = j.payment;
          }
        } catch { /* offline — serve the Worker-side catalog */ }
      }
      return new Response(shopPage({
        name: cfg.name || "AMINCK Nova", motd: cfg.motd || "",
        catalog, payment, site: cfg.domain || url.origin,
      }), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    if (path === "/site/order" && request.method === "POST") {
      let body = {};
      try { body = await request.json(); } catch { body = {}; }

      // Prefer the game server when it is attached: it owns economy state.
      if (env.SERVER_HOST) {
        try {
          const r = await fetch(env.SERVER_HOST + "/api/order", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          return Response.json(await r.json());
        } catch (e) { /* fall through to the Worker-side order book */ }
      }

      const local = await shopState(store, env);
      const item = local.catalog.find((c) => c.id === String(body.item || ""));
      if (!item) {
        return Response.json({ ok: false, error: "آیتم نامعتبر است." });
      }
      const order = {
        id: `ORD-${Date.now().toString(36).toUpperCase()}`,
        item: item.id, name: item.name, buyer: String(body.buyer || "guest").slice(0, 32),
        contact: String(body.contact || "").slice(0, 120),
        price_toman: Number(item.price_toman || 0), status: "pending",
        created: new Date().toISOString(), code: "",
      };
      await writeJson(store, "orders", [...(await readJson(store, "orders", [])), order]);
      const how = local.payment.card
        ? `واریز به کارت ${local.payment.card} به نام ${local.payment.card_holder || "—"}`
        : "برای هماهنگی پرداخت با ادمین تماس بگیرید.";
      return Response.json({
        ok: true, order_id: order.id, price_toman: order.price_toman, how,
        note: "سفارش در پنل ادمین (/admin) تأیید و کد فعال‌سازی صادر می‌شود.",
      });
    }

    // ── admin panel ──────────────────────────────────────────────────────
    const password = String(env.ADMIN_PASSWORD || "");

    if (path === "/admin/login" && request.method === "POST") {
      if (!password) {
        return new Response(adminNoPasswordPage(),
          { headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
      let supplied = "";
      const ct = request.headers.get("Content-Type") || "";
      if (ct.includes("application/json")) {
        try { supplied = String((await request.json()).password || ""); } catch { supplied = ""; }
      } else {
        try { supplied = String((await request.formData()).get("password") || ""); } catch { supplied = ""; }
      }
      // constant-time-ish compare on length-padded strings
      const a = supplied.padEnd(64, "\0").slice(0, 64);
      const b = password.padEnd(64, "\0").slice(0, 64);
      let diff = a.length ^ b.length;
      for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
      if (diff !== 0) {
        if (ct.includes("application/json")) {
          return Response.json({ ok: false, error: "رمز ادمین اشتباه است." }, { status: 401 });
        }
        return new Response(adminLoginPage("❌ رمز ادمین اشتباه است."),
          { status: 401, headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
      const token = await issueToken(password);
      const cookie = `nova_admin=${encodeURIComponent(token)}; Path=/; HttpOnly; ` +
        `SameSite=Lax; Max-Age=${12 * 3600}; Secure`;
      if (ct.includes("application/json")) {
        return Response.json({ ok: true, token }, { headers: { "Set-Cookie": cookie } });
      }
      return new Response("", {
        status: 302,
        headers: { Location: url.origin + "/admin", "Set-Cookie": cookie },
      });
    }

    if (path === "/admin/logout") {
      return new Response("", {
        status: 302,
        headers: {
          Location: url.origin + "/",
          "Set-Cookie": "nova_admin=; Path=/; HttpOnly; Max-Age=0; Secure",
        },
      });
    }

    if (path === "/admin" || path === "/admin/" || path === "/admin/index.html") {
      if (!password) {
        return new Response(adminNoPasswordPage(),
          { headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
      const token = cookieToken(request) || authHeader(request);
      if (!(await verifyToken(password, token))) {
        return new Response(adminLoginPage(""), { status: 401,
          headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
      const cfg = await store.load();
      const local = await shopState(store, env);
      let backend = null;
      let orders = local.orders;
      if (env.SERVER_HOST) {
        try {
          const r = await fetch(env.SERVER_HOST + "/admin/api/status", {
            headers: { Authorization: `Bearer ${token}` }, cf: { cacheTtl: 0 },
          });
          if (r.ok) backend = await r.json();
        } catch { /* container offline */ }
        try {
          const r = await fetch(env.SERVER_HOST + "/admin/api/orders", {
            headers: { Authorization: `Bearer ${token}` }, cf: { cacheTtl: 0 },
          });
          if (r.ok) {
            const j = await r.json();
            const list = Array.isArray(j) ? j : (j.orders || []);
            if (list.length) orders = list;
          }
        } catch { /* container offline */ }
      }
      return new Response(adminPage({
        name: cfg.name || "AMINCK Nova", domain: cfg.domain || "",
        motd: cfg.motd || "", backend, orders, payment: local.payment,
      }), { headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      } });
    }

    if (path.startsWith("/admin/api/")) {
      if (!password) {
        return Response.json({ ok: false, error: "ADMIN_PASSWORD تنظیم نشده است." }, { status: 503 });
      }
      const token = authHeader(request) || cookieToken(request);
      if (!(await verifyToken(password, token))) {
        return Response.json({ ok: false, error: "احراز هویت ناموفق." }, { status: 401 });
      }

      if (path === "/admin/api/status") {
        const cfg = await store.load();
        const local = await shopState(store, env);
        let backend = null;
        if (env.SERVER_HOST) {
          try {
            const r = await fetch(env.SERVER_HOST + "/admin/api/status", {
              headers: { Authorization: `Bearer ${token}` }, cf: { cacheTtl: 0 },
            });
            if (r.ok) backend = await r.json();
          } catch { /* offline */ }
        }
        return Response.json({
          ok: true, online: true, name: cfg.name || "AMINCK Nova",
          domain: cfg.domain || "", motd: cfg.motd || "",
          server_host: env.SERVER_HOST || "", backend,
          orders: local.orders.length, ai: "on",
        });
      }

      if (path === "/admin/api/orders") {
        const local = await shopState(store, env);
        const remote = await backendOrders(env, token);
        // The game server owns the economy when it is attached; otherwise the
        // Worker-side order book (written by /site/order) is authoritative.
        const orders = remote && remote.length ? remote : local.orders;
        return Response.json({ ok: true, orders, source: remote && remote.length ? "server" : "worker" });
      }

      if (path === "/admin/api/action" && request.method === "POST") {
        let body = {};
        try { body = await request.json(); } catch { body = {}; }
        const action = String(body.action || "");

        // Shop/economy actions belong to the game server when one is attached:
        // it owns state.json, the live catalog and the /redeem codes. Ask it
        // first, and only keep a Worker-side copy when it is unreachable.
        const BACKEND_FIRST = new Set([
          "payment_set", "catalog_add", "catalog_remove",
          "code_create", "order_create", "order_resolve",
        ]);
        if (BACKEND_FIRST.has(action)) {
          const res = await backendAction(env, token, body);
          const unreachable = res === null || res.status === 502;
          if (res && !unreachable) {
            const j = res.body || {};
            return Response.json({
              ok: j.ok !== false,
              result: j.message !== undefined ? j.message : j.result,
              source: "server",
            }, { status: res.status });
          }
          // fall through to the Worker-side shop book
        }

        // Actions the front Worker owns outright (config, icon, shop book).
        if (action === "config_set") {
          const cfg = await store.load();
          const next = {
            name: String(body.name || cfg.name || "AMINCK Nova").slice(0, 40),
            domain: String(body.domain || "").slice(0, 120),
            motd: String(body.motd || cfg.motd || "").slice(0, 140),
          };
          await store.save(next);
          // Mirror into the running game server so the in-game MOTD, server
          // name and /site link change too (best effort — it may be offline).
          const mirrored = await backendAction(env, token, {
            action: "config_set", name: next.name, motd: next.motd,
            domain: next.domain, site_url: body.site_url || "",
          });
          return Response.json({
            ok: true, result: "تنظیمات ذخیره شد.",
            server_synced: !!(mirrored && mirrored.status === 200 && mirrored.body?.ok !== false),
          });
        }
        if (action === "icon_regenerate") {
          const cfg = await store.load();
          const name = String(body.name || cfg.name || "AMINCK Nova");
          try {
            const png = await generateIconPng(env, name);
            await store.save({ name, icon: btoa(String.fromCharCode(...png)) });
            // keep the container's own name/icon in step (best effort)
            await backendAction(env, token, { action: "icon_regenerate", name });
            return Response.json({ ok: true, result: "لوگو با Workers AI ساخته شد." });
          } catch (e) {
            return Response.json({ ok: false, error: "ساخت لوگو ناموفق: " + String(e) });
          }
        }
        if (action === "payment_set") {
          await writeJson(store, "payment", {
            card: String(body.card || "").slice(0, 40),
            card_holder: String(body.card_holder || "").slice(0, 60),
            note: String(body.note || "").slice(0, 200),
          });
          return Response.json({ ok: true, result: "اطلاعات پرداخت ذخیره شد." });
        }
        if (action === "catalog_add") {
          const extra = await readJson(store, "catalog", []);
          const id = String(body.id || "").trim();
          if (!id) return Response.json({ ok: false, error: "شناسهٔ آیتم خالی است." });
          const entry = {
            id, name: String(body.name || id), type: String(body.type || "coins"),
            amount: Number(body.amount || 0) || undefined,
            rank: body.rank || undefined, kit: body.kit || undefined,
            price_toman: Number(body.price_toman || 0),
          };
          await writeJson(store, "catalog",
            [...extra.filter((c) => c.id !== id), entry]);
          return Response.json({ ok: true, result: `آیتم ${id} افزوده شد.` });
        }
        if (action === "catalog_remove") {
          const extra = await readJson(store, "catalog", []);
          await writeJson(store, "catalog",
            [...extra.filter((c) => c.id !== body.id && !c.removed),
             { id: String(body.id || ""), removed: true }]);
          return Response.json({ ok: true, result: `آیتم ${body.id} حذف شد.` });
        }
        if (action === "code_create") {
          const code = String(body.code || "").trim() || newCode();
          const codes = await readJson(store, "codes", []);
          const entry = {
            code, type: String(body.type || "coins"),
            value: String(body.value || ""), uses: Number(body.uses || 1),
            created: new Date().toISOString(),
          };
          await writeJson(store, "codes",
            [...codes.filter((c) => c.code !== code), entry]);
          return Response.json({ ok: true, result: `کد ${code} ساخته شد.` });
        }
        if (action === "order_resolve") {
          const orders = await readJson(store, "orders", []);
          const o = orders.find((x) => x.id === String(body.order_id || ""));
          if (!o) return Response.json({ ok: false, error: "سفارش پیدا نشد." });
          const code = newCode();
          o.status = "paid";
          o.code = code;
          o.resolved_at = new Date().toISOString();
          o.gateway_ref = String(body.gateway_ref || "");
          await writeJson(store, "orders", orders);
          const codes = await readJson(store, "codes", []);
          const item = SHOP_CATALOG.find((c) => c.id === o.item) || {};
          await writeJson(store, "codes", [...codes, {
            code, type: item.type || "coins",
            value: String(item.rank || item.kit || item.amount || ""),
            item: o.item, buyer: o.buyer, uses: 1,
            created: o.resolved_at,
          }]);
          return Response.json({ ok: true, result: `سفارش تأیید شد — کد فعال‌سازی: ${code}` });
        }

        // Everything else belongs to the running game server.
        if (!env.SERVER_HOST) {
          return Response.json({
            ok: false,
            error: "سرور بازی (Container) متصل نیست؛ این اکشن نیاز به سرور در حال اجرا دارد. " +
                   "SERVER_HOST را بعد از دیپلوی کانتینر تنظیم کنید.",
          }, { status: 503 });
        }
        const res = await backendAction(env, token, body);
        if (!res) {
          return Response.json({ ok: false, error: "سرور بازی در دسترس نیست." }, { status: 503 });
        }
        const j = res.body || {};
        return Response.json({
          ok: j.ok !== false,
          result: j.message !== undefined ? j.message : j.result,
          error: j.ok === false ? (j.message || j.error) : undefined,
          source: "server",
        }, { status: res.status });
      }

      return Response.json({ ok: false, error: "مسیر ادمین نامعتبر است." }, { status: 404 });
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
