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

const ONE_CLICK =
  "https://deploy.workers.cloudflare.com/?url=https://github.com/amingangmanatgh2-hash/AMINCK-Nova-Edge/tree/main/deploy";

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

function parseWorkersUrl(out) {
  // wrangler prints something like:
  //   Deployed to https://aminck-nova.<subdomain>.workers.dev
  const m = String(out || "").match(/https:\/\/[a-z0-9-]+\.workers\.dev/g);
  return m ? m[0] : null;
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
      const lines = buf.split(/\r?\n/).filter((l) => l.trim() !== "");
      resolve(lines);
    });
  });
}

function makeAsk(rl, lines) {
  return (q, def = "") => {
    const suffix = def ? ` [${def}]` : "";
    if (lines && lines.length) {
      const v = lines.shift().trim();
      console.log(`${q}${suffix}: ${v}`);
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

  let adminPassword = "";
  let difficulty = "normal";
  let payCard = "";
  let payHolder = "";
  if (modeFull) {
    adminPassword = await q("▶ رمز پنل ادمین (خالی = ساخت خودکار)", "");
    if (!adminPassword) {
      adminPassword = randomPassword(16);
      console.log(`   🔑 رمز ادمین ساخته شد: ${adminPassword} (یادداشت کنید!)`);
    }
    difficulty = (await q("▶ سختی ربات‌های AI (easy | normal | hard)", "normal")).toLowerCase();
    if (!["easy", "normal", "hard"].includes(difficulty)) difficulty = "normal";
    payCard = await q("▶ شماره کارت فروشگاه /site (اختیاری)", "");
    if (payCard) payHolder = await q("▶ نام دارنده کارت", "");
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
  if (modeFull) {
    // inject deploy-time admin/site/shop settings into the container vars
    const setVar = (toml_, key, val) => {
      if (toml_.includes(`${key} = `)) {
        return toml_.replace(new RegExp(`${key} = "[^"]*"`), `${key} = "${esc(val)}"`);
      }
      // append under the existing [vars] block
      return toml_.replace(/(\[vars\][\s\S]*?)(\n\[[a-z]|\n*$)/, (m, block, tail) =>
        `${block}${key} = "${esc(val)}"\n${tail}`);
    };
    toml = setVar(toml, "ADMIN_PASSWORD", adminPassword);
    toml = setVar(toml, "BOT_DIFFICULTY", difficulty);
    toml = setVar(toml, "PAYMENT_CARD", payCard);
    toml = setVar(toml, "PAYMENT_CARD_HOLDER", payHolder);
    toml = setVar(toml, "PAYMENT_NOTE", "");
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
  if (modeFull && publicUrl) {
    console.log(`\n🔁 ثبت AI_FALLBACK_URL=${publicUrl} برای هوش مصنوعی داخل بازی و دیپلوی مجدد...\n`);
    const again = readFileSync(outCfg, "utf-8")
      .replace(/AI_FALLBACK_URL = "[^"]*"/, `AI_FALLBACK_URL = "${publicUrl}"`)
      .replace(/SITE_URL = "[^"]*"/, `SITE_URL = "${publicUrl}/site"`);
    writeFileSync(outCfg, again);
    const second = run("npx", ["wrangler@latest", "deploy", "--config", outCfg]);
    if (failed(second)) failExit("دیپلوی مجدد wrangler (ثبت AI fallback) با خطا مواجه شد.");
  } else if (modeFull) {
    console.log("⚠️  آدرس عمومی Worker پیدا نشد؛ AI fallback ثبت نشد.");
  }

  console.log("\n═══════════════════════════════════════════════════════");
  console.log(`🎉 تمام شد! نام سرور: ${name}`);
  if (publicUrl) {
    console.log(`🌐 پنل:        ${publicUrl}`);
    console.log(`🛒 سایت/فروشگاه: ${publicUrl}/site`);
  }
  if (modeFull && adminPassword) {
    console.log(`🔑 رمز پنل ادمین: ${adminPassword}`);
  }
  if (domain) {
    console.log(`🎮 Java:       ${domain}:25565`);
    console.log(`⛏️ Bedrock:    ${domain}:19132 (ping)`);
    console.log(`\n⚠️  برای TCP روی دامنه، یک اپ Spectrum از نوع Worker بسازید (پورت 25565).`);
  } else {
    console.log(`\n🎮 برای آدرس بازی، یک دامنه اضافه کنید + Spectrum (پورت 25565).`);
  }
  console.log(`\n🔗 لینک دیپلوی یک‌کلیکی (برای بقیه):\n   ${ONE_CLICK}`);
  console.log("═══════════════════════════════════════════════════════");
}

main().catch((e) => {
  console.error("خطا:", e);
  process.exit(1);
});
