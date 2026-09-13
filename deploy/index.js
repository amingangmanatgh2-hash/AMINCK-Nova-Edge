#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
//  AMINCK Nova — interactive deploy wizard (Node 18+, no dependencies)
//
//  از شما «نام سرور» و «دامنه» را می‌پرسد، لوگو را با Workers AI می‌سازد
//  (بدون توکن) و دیپلوی را انجام می‌دهد:
//     node deploy/index.js
//
//  گزینه‌ها:
//     node deploy/index.js --workers      فقط Worker جلو (رایگان، بدون توکن)
//     node deploy/index.js --full         Worker + کانتینر بازی (نیاز به لاگین)
// ═══════════════════════════════════════════════════════════════════════════
import readline from "node:readline/promises";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
// Generated config lives next to the source config so `main`/`image` relative
// paths keep resolving correctly. Git-ignored.
const GEN_CFG = path.join(__dirname, ".generated.toml");

const BANNER = `
  █████╗ ███╗   ███╗██╗███╗   ██╗ ██████╗██╗  ██╗   ███╗   ██╗ ██████╗ ██╗   ██╗ █████╗
 ██╔══██╗████╗ ████║██║████╗  ██║██╔════╝██║ ██╔╝   ████╗  ██║██╔═══██╗██║   ██║██╔══██╗
 ███████║██╔████╔██║██║██╔██╗ ██║██║     █████╔╝    ██╔██╗ ██║██║   ██║██║   ██║███████║
 ██╔══██║██║╚██╔╝██║██║██║╚██╗██║██║     ██╔═██╗    ██║╚██╗██║██║   ██║╚██╗ ██╔╝██╔══██║
 ██║  ██║██║ ╚═╝ ██║██║██║ ╚████║╚██████╗██║  ██╗   ██║ ╚████║╚██████╔╝ ╚████╔╝ ██║  ██║
 ╚═╝  ╚═╝╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝ ╚═════╝╚═╝  ╚═╝   ╚═╝  ╚═══╝ ╚═════╝   ╚═╝  ╚═╝  ╚═╝
`;

const REPO_URL = "https://github.com/amingangmanatgh2-hash/AMINCK-Nova-Edge";
const ONE_CLICK =
  `https://deploy.workers.cloudflare.com/?url=${REPO_URL}/tree/main/deploy`;

// The one-click button needs a ref that actually contains deploy/. Until the
// work is merged to main, the current branch is the usable link — derive it so
// the wizard never prints a link that 404s.
function branchOneClick() {
  const res = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"],
    { encoding: "utf-8", cwd: ROOT });
  const br = (res.stdout || "").trim();
  if (res.status !== 0 || !br || br === "main" || br === "HEAD") return "";
  // Keep the "/" in branch names literal (arena/xxxx) — GitHub tree URLs need
  // a real slash, a %2F would not resolve to the branch.
  const ref = br.split("/").map(encodeURIComponent).join("/");
  return `https://deploy.workers.cloudflare.com/?url=${REPO_URL}/tree/${ref}/deploy`;
}

function ask(rl, q, def = "") {
  const suffix = def ? ` [${def}]` : "";
  return rl.question(`${q}${suffix}: `).then((a) => (a || "").trim() || def);
}

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: "utf-8", cwd: opts.cwd || ROOT });
  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);
  return res;
}

// Hosts that show up in wrangler output but are never the deployed Worker URL.
const NON_DEPLOY_HOSTS = [
  "dash.cloudflare.com", "developers.cloudflare.com", "cloudflare.com",
  "github.com", "npmjs.com", "registry.npmjs.org",
];

function parseWorkersUrl(out) {
  const s = String(out || "");
  // wrangler prints something like:
  //   Published aminck-nova (0.00 sec)
  //     https://aminck-nova.<account-subdomain>.workers.dev
  // Note the account subdomain: there are normally 2+ labels before workers.dev.
  const wd = s.match(
    /https:\/\/[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)*\.workers\.dev/i);
  if (wd) return wd[0];

  // A custom route is equally usable — wrangler prints it as https://host/*
  const routes = s.match(/https:\/\/[a-z0-9.-]+\.[a-z]{2,}(?:\/\*)?/gi) || [];
  for (const r of routes) {
    const host = r.replace(/^https:\/\//, "").replace(/\/\*$/, "").split("/")[0];
    if (!NON_DEPLOY_HOSTS.some((h) => host === h || host.endsWith("." + h))) {
      return `https://${host}`;
    }
  }
  return null;
}

function randomPassword(len = 16) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  const rnd = new Uint32Array(len);
  crypto.getRandomValues(rnd);
  for (let i = 0; i < len; i++) out += chars[rnd[i] % chars.length];
  return out;
}

function failed(res) {
  return !res || res.status !== 0;
}

function failExit(msg) {
  console.error(`\n❌ ${msg}`);
  console.error("   دیپلوی انجام نشد. خروجی بالا را بررسی کنید (معمولاً نیاز به `npx wrangler login` یا رفع خطای پیکربندی است).");
  process.exit(1);
}

// Non-interactive (piped) stdin: read all lines up-front so readline never
// loses answers at EOF. Returns null in a real TTY (use readline normally).
function readPipedLines() {
  if (process.stdin.isTTY) return Promise.resolve(null);
  return new Promise((resolve) => {
    let buf = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (c) => (buf += c));
    process.stdin.on("end", () => {
      // Keep blank lines: an empty answer to an optional prompt (card number,
      // domain, …) is meaningful. Only strip the artifact of the trailing "\n".
      const lines = buf.split(/\r?\n/);
      if (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
      resolve(lines);
    });
  });
}

function makeAsk(rl, lines) {
  // Piped/non-interactive mode: answers come from `lines`. Never fall back to
  // readline here — stdin is already closed, and touching it throws
  // ERR_USE_AFTER_CLOSE. Missing lines simply take the default.
  const piped = Array.isArray(lines);
  return (q, def = "") => {
    const suffix = def ? ` [${def}]` : "";
    if (piped) {
      const v = lines.length ? lines.shift().trim() : "";
      console.log(`${q}${suffix}: ${v === "" ? "(پیش‌فرض)" : v}`);
      return Promise.resolve(v || def);
    }
    return ask(rl, q, def);
  };
}

async function main() {
  console.log(BANNER);
  const args = process.argv.slice(2);
  const modeFull = args.includes("--full");
  const modeWorkers = args.includes("--workers") || !modeFull;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const piped = await readPipedLines();
  const q = makeAsk(rl, piped);

  console.log("🚀 راه‌انداز دیپلوی AMINCK Nova\n");
  const name = await q("▶ نام سرور (برای لوگو + MOTD)", "AMINCK Nova");
  let domain = await q("▶ دامنه یا آدرس دلخواه (اختیاری؛ برای ایران بهتر است)", "");
  domain = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim();
  const motd = await q("▶ توضیح کوتاه / MOTD", "Minecraft God Server — Java 1.8 → 26.x");

  // Admin + shop settings are asked in BOTH modes: the front Worker serves
  // /admin and /site itself when no game container is attached, so its
  // ADMIN_PASSWORD / PAYMENT_* vars matter just as much as the container's.
  let adminPassword = await q("▶ رمز پنل ادمین (خالی = ساخت خودکار)", "");
  if (!adminPassword) {
    adminPassword = randomPassword(16);
    console.log(`   🔑 رمز ادمین ساخته شد: ${adminPassword} (یادداشت کنید!)`);
  }
  let difficulty = (await q("▶ سختی ربات‌های AI (easy | normal | hard)", "normal")).toLowerCase();
  if (!["easy", "normal", "hard"].includes(difficulty)) difficulty = "normal";
  const payCard = await q("▶ شماره کارت فروشگاه /site (اختیاری)", "");
  const payHolder = payCard ? await q("▶ نام دارنده کارت", "") : "";

  if (modeFull) {
    const confirm = await q("▶ دیپلوی کامل (Worker + کانتینر بازی) انجام شود؟ (y/n)", "y");
    if (!/^y/i.test(confirm)) {
      console.log("لغو شد.");
      process.exit(0);
    }
  }
  rl.close();

  mkdirSync(__dirname, { recursive: true });

  // ── generate config with the chosen name/domain ─────────────────────────
  const target = modeFull ? "wrangler.containers.toml" : "wrangler.toml";
  const src = path.join(__dirname, target);
  let toml = readFileSync(src, "utf-8");
  const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  toml = toml
    .replace(/SERVER_NAME = "[^"]*"/, `SERVER_NAME = "${esc(name)}"`)
    .replace(/MOTD = "[^"]*"/, `MOTD = "${esc(motd)}"`);
  if (/SERVER_DOMAIN = "[^"]*"/.test(toml)) {
    toml = toml.replace(/SERVER_DOMAIN = "[^"]*"/, `SERVER_DOMAIN = "${esc(domain)}"`);
  }
  // Inject the deploy-time admin/site/shop settings into whichever config we
  // are deploying (wrangler.toml for the front Worker, wrangler.containers.toml
  // for the full stack). Both configs declare these keys under [vars].
  const setVar = (toml_, key, val) => {
    if (toml_.includes(`${key} = `)) {
      return toml_.replace(new RegExp(`${key} = "[^"]*"`), `${key} = "${esc(val)}"`);
    }
    // append under the existing [vars] block
    return toml_.replace(/(\[vars\][\s\S]*?)(\n\[[a-z]|\n*$)/, (m, block, tail) =>
      `${block}${key} = "${esc(val)}"\n${tail}`);
  };
  toml = setVar(toml, "ADMIN_PASSWORD", adminPassword);
  toml = setVar(toml, "ADMIN_NAMES", "");
  toml = setVar(toml, "BOT_DIFFICULTY", difficulty);
  toml = setVar(toml, "PAYMENT_CARD", payCard);
  toml = setVar(toml, "PAYMENT_CARD_HOLDER", payHolder);
  toml = setVar(toml, "PAYMENT_NOTE", "");
  if (domain) {
    toml = setVar(toml, "SITE_URL", `https://${domain}/site`);
  }
  const outCfg = GEN_CFG;
  writeFileSync(outCfg, toml);
  console.log(`\n✅ تنظیمات نوشته شد: ${path.relative(ROOT, outCfg)}`);

  // ── deploy ──────────────────────────────────────────────────────────────
  console.log("\n📦 در حال دیپلوی با wrangler ...\n");
  const first = run("npx", ["wrangler@latest", "deploy", "--config", outCfg]);
  if (failed(first)) failExit("دیپلوی wrangler با خطا مواجه شد.");
  const url = parseWorkersUrl((first.stdout || "") + (first.stderr || ""));
  const publicUrl = domain ? `https://${domain}` : url;

  // Full stack: register the Worker's public URL as the game server's
  // no-token AI fallback (container -> Worker /ai/chat) and redeploy once.
  // Second pass: now that we know the Worker's public URL, pin SITE_URL (and,
  // for the full stack, the container's no-token AI fallback) and redeploy.
  if (publicUrl) {
    console.log(`\n🔁 ثبت SITE_URL=${publicUrl}/site` +
      (modeFull ? ` و AI_FALLBACK_URL=${publicUrl}` : "") + " و دیپلوی مجدد...\n");
    let again = readFileSync(outCfg, "utf-8")
      .replace(/SITE_URL = "[^"]*"/, `SITE_URL = "${publicUrl}/site"`);
    if (modeFull) {
      again = again.replace(/AI_FALLBACK_URL = "[^"]*"/, `AI_FALLBACK_URL = "${publicUrl}"`);
    }
    writeFileSync(outCfg, again);
    const second = run("npx", ["wrangler@latest", "deploy", "--config", outCfg]);
    if (failed(second)) failExit("دیپلوی مجدد wrangler با خطا مواجه شد.");
  } else {
    console.log("⚠️  آدرس عمومی Worker پیدا نشد؛ SITE_URL ثبت نشد.");
  }

  console.log("\n═══════════════════════════════════════════════════════");
  console.log(`🎉 تمام شد! نام سرور: ${name}`);
  if (publicUrl) {
    console.log(`🌐 پنل:        ${publicUrl}`);
    console.log(`🛒 سایت/فروشگاه: ${publicUrl}/site`);
  }
  if (adminPassword) {
    console.log(`🔑 رمز پنل ادمین: ${adminPassword}`);
    console.log(`🛠️ پنل ادمین:   ${publicUrl || "<آدرس ورکر>"}/admin`);
  }
  if (domain) {
    console.log(`🎮 Java:       ${domain}:25565`);
    console.log(`⛏️ Bedrock:    ${domain}:19132 (ping)`);
    console.log(`\n⚠️  برای TCP روی دامنه، یک اپ Spectrum از نوع Worker بسازید (پورت 25565).`);
  } else {
    console.log(`\n🎮 برای آدرس بازی، یک دامنه اضافه کنید + Spectrum (پورت 25565).`);
  }
  console.log(`\n🔗 لینک دیپلوی یک‌کلیکی (برای بقیه):\n   ${ONE_CLICK}`);
  const brLink = branchOneClick();
  if (brLink) {
    console.log(`   (اگر هنوز merge نشده، از لینک برنچ فعلی استفاده کنید):\n   ${brLink}`);
  }
  console.log("═══════════════════════════════════════════════════════");
}

// `node deploy/index.js --selftest` — regression checks for the parts of the
// wizard that are easy to break silently (URL parsing above all: a miss means
// SITE_URL / AI_FALLBACK_URL never get written and nothing errors out).
function selftest() {
  const cases = [
    ["Published aminck-nova (0.00 sec)\n  https://aminck-nova.myaccount.workers.dev\nCurrent Version ID: abc",
      "https://aminck-nova.myaccount.workers.dev", "workers.dev with account subdomain"],
    ["Deployed to https://nova.workers.dev",
      "https://nova.workers.dev", "workers.dev single label"],
    ["Published x\n  https://aminck-nova.sub-domain.workers.dev\n",
      "https://aminck-nova.sub-domain.workers.dev", "hyphenated subdomain"],
    ["Deployed aminck-nova triggers:\n  https://play.example.com/*\n",
      "https://play.example.com", "custom route with /*"],
    ["See https://dash.cloudflare.com/123/workers for details",
      null, "dashboard URL is not a deploy URL"],
    ["no url here at all", null, "no URL"],
    ["", null, "empty output"],
  ];
  let fail = 0;
  for (const [input, want, label] of cases) {
    const got = parseWorkersUrl(input);
    const ok = got === want;
    if (!ok) fail++;
    console.log(`  ${ok ? "✓" : "✗"} ${label} → ${got}`);
    if (!ok) console.log(`      expected: ${want}`);
  }
  console.log(fail === 0
    ? `\n✅ parseWorkersUrl: all ${cases.length} cases passed`
    : `\n❌ parseWorkersUrl: ${fail}/${cases.length} FAILED`);
  process.exit(fail === 0 ? 0 : 1);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  main().catch((e) => {
    console.error("خطا:", e);
    process.exit(1);
  });
}
