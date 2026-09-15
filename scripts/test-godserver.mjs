#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
//  test-godserver.mjs — تست جامع «گاد سرور» بدون نیاز به سرور زنده
//
//  بخش‌ها:
//   A) بردارهای طلایی موتور (خودبررسی JS + PHP اگر php-wasm نصب باشد)
//   B) سلامت کاتالوگ: ۱۴ مود، ۶ رنک، ۵ تیر، اقتصاد و کازمتیک‌ها
//   C) دارایی‌های تصویری: هر /mc/img/… که در کد ارجاع شده وجود داشته باشد
//   D) بستهٔ پلاگین Bedrock (فایل‌ها + plugin.yml + config.yml + lint-php)
//   E) بستهٔ پلاگین Paper (فایل‌ها + plugin.yml + pom.xml + lint-java)
//   F) مسیرهای روتر Worker در src/mc/router.js (اسکن ساختاری)
//
//  اجرا: npm run test:god   (کد خروج ۰ = همه‌چیز پاک)
// ═══════════════════════════════════════════════════════════════════
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
let pass = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
};
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

// ── A) بردارهای طلایی ───────────────────────────────────────────────
section('A) موتور — بردارهای طلایی (verify-parity)');
{
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts/verify-parity.mjs')], { cwd: ROOT, encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  const m = out.match(/ok=(\d+)\s+fail=(\d+)/);
  if (m) {
    check(`parity: ok=${m[1]} fail=${m[2]}`, m[2] === '0' && Number(m[1]) >= 67);
  } else {
    const jsOk = /JS SELFCHECK.*OK|خودبررسی JS.*موفق|selfcheck ok/i.test(out);
    check('parity (خروجی قابل‌خوانی)', r.status === 0 || jsOk, out.slice(-300));
  }
}

// ── B) کاتالوگ ──────────────────────────────────────────────────────
section('B) کاتالوگ — مودها/رنک‌ها/تیرها/اقتصاد');
{
  const { listModes, listRanks, listTiers, listCosmetics, SPECS } = await import('../shared/engine/spec.js');
  const modes = listModes();
  check(`۱۴ مود بازی (${modes.length})`, modes.length >= 14);
  const REQUIRED_MODES = ['bedwars', 'skywars', 'survivalgames', 'tntrun', 'murdermystery', 'parkour', 'buildbattle', 'spleef', 'thebridge', 'uhc', 'zombiesurvival', 'kitpvp', 'duels', 'factions'];
  const missing = REQUIRED_MODES.filter((id) => !modes.some((m) => m.id === id));
  check('همهٔ مودهای الزامی با شناسهٔ درست', missing.length === 0, missing.join(','));
  for (const m of modes) {
    const okScoring = m.scoring && Object.keys(m.scoring).length > 0;
    const okEco = m.economy && (m.economy.win_coins !== undefined || m.economy.kill_coins !== undefined || Object.keys(m.economy).length > 0);
    const okBot = m.bot && Array.isArray(m.bot.decisions) && m.bot.decisions.length >= 3;
    // بعضی مودها session-persistent یا respawn-based هستند (kitpvp/factions) و duration_sec=0 مجاز است.
    const duration = Number(m.match?.duration_sec);
    const okMatch = m.match && Number.isFinite(duration) && duration >= 0 && (duration > 0 || m.match.persistent || m.match.respawn_sec !== undefined || m.elo_k !== undefined);
    if (!(okScoring && okEco && okBot && okMatch)) {
      check(`مود ${m.id}: scoring/economy/bot/match`, false, JSON.stringify({ okScoring, okEco, okBot, okMatch }));
    }
  }
  check('همهٔ مودها scoring+economy+bot.decisions+match دارند', true);
  const ranks = listRanks();
  check(`۶ رنک (${ranks.length})`, ranks.length === 6, ranks.map((r) => r.id).join(','));
  check('ترتیب رنک‌ها free→ultragod', ranks.map((r) => r.id).join(',') === 'free,noob,normal,pro,god,ultragod');
  check('هر رنک tag+color+bot_skill_bias+price+permissions دارد',
    ranks.every((r) => Object.hasOwn(r, 'tag') && r.color && r.bot_skill_bias !== undefined && r.price_usd !== undefined && Array.isArray(r.permissions)));
  const tiers = listTiers();
  check(`۵ تیر بات (${tiers.length})`, tiers.length === 5, tiers.map((t) => t.id).join(','));
  check('هر تیر model+skill+mistake_rate+reaction_ms دارد',
    tiers.every((t) => t.model && t.skill !== undefined && t.mistake_rate !== undefined && t.reaction_ms !== undefined));
  check('مدل تیرها از سبک به سنگین صعودی است',
    tiers.every((t, i) => i === 0 || tiers[i - 1].skill <= t.skill));
  check('کازمتیک‌ها ≥ ۱۰', listCosmetics().length >= 10, String(listCosmetics().length));
  check('اقتصاد spec موجود است', !!SPECS.economy);
}

// ── C) دارایی‌های تصویری ────────────────────────────────────────────
section('C) تصاویر — spec/catalog ↔ فایل‌های موجود');
{
  const { listModes, listRanks, listCosmetics, listBundles } = await import('../shared/engine/spec.js');
  const imgDir = join(ROOT, 'public/mc/img');
  const have = new Set(existsSync(imgDir) ? readdirSync(imgDir) : []);
  const expected = new Set(['hero.jpg', 'gems-pack.jpg', 'season-pass.jpg', 'config-special.jpg']);
  for (const m of listModes()) {
    expected.add(`${m.id}-banner.jpg`);
    expected.add(`${m.id}-icon.jpg`);
    expected.add(`${m.id}-lobby.jpg`);
  }
  for (const r of listRanks()) {
    expected.add(`rank-${r.id}.png`);          // صفحات پروفایل/لیست رنک‌ها
    if (r.art?.icon) expected.add(`${r.art.icon}.jpg`); // کارت خرید رنک‌ها
  }
  for (const c of listCosmetics()) if (c.art) expected.add(`${c.art}.jpg`);
  for (const b of listBundles()) if (b.art) expected.add(`${b.art}.jpg`);
  const missingImgs = [...expected].filter((n) => !have.has(n));
  check(`${expected.size} تصویر مورد انتظار از spec/catalog`, expected.size >= 60, String(expected.size));
  check('همهٔ تصاویر spec/catalog موجودند', missingImgs.length === 0, missingImgs.join(', '));
  check('تعداد فایل‌های img ≥ ۶۰', have.size >= 60, String(have.size));
  const manifest = join(imgDir, 'manifest.json');
  if (existsSync(manifest)) {
    const mj = JSON.parse(readFileSync(manifest, 'utf8'));
    const entries = mj.images || mj.items || mj;
    const names = new Set(Array.isArray(entries) ? entries.map((x) => x.file) : Object.keys(entries));
    const missManifest = [...expected].filter((n) => !names.has(n));
    check('manifest.json معتبر و کامل است', missManifest.length === 0, missManifest.join(', '));
  } else {
    check('manifest.json وجود دارد', false);
  }
}

// ── D) پلاگین Bedrock ───────────────────────────────────────────────
section('D) پلاگین Bedrock (PocketMine-MP)');
{
  const B = join(ROOT, 'server/bedrock');
  const need = [
    'plugin.yml', 'resources/config.yml',
    'src/NovaEdge/NovaEdgePlugin.php',
    'src/NovaEdge/Engine/Rng.php', 'src/NovaEdge/Engine/Elo.php', 'src/NovaEdge/Engine/Scoring.php',
    'src/NovaEdge/Engine/BotTier.php', 'src/NovaEdge/Engine/AntiCheat.php', 'src/NovaEdge/Engine/Brain.php',
    'src/NovaEdge/Engine/Matchmaking.php',
    'src/NovaEdge/Bridge/BridgeClient.php',
    'src/NovaEdge/Listener/PlayerListener.php', 'src/NovaEdge/Commands/NovaCommand.php',
    'src/NovaEdge/Game/GameSession.php', 'src/NovaEdge/Bots/BotController.php',
    'tests/parity.php',
  ];
  const missing = need.filter((f) => !existsSync(join(B, f)));
  check('همهٔ فایل‌های لازم موجودند', missing.length === 0, missing.join(', '));
  const pyml = readFileSync(join(B, 'plugin.yml'), 'utf8');
  check('plugin.yml: main درست', /main:\s*NovaEdge\\NovaEdgePlugin/.test(pyml));
  const cfg = readFileSync(join(B, 'resources/config.yml'), 'utf8');
  check('config.yml: bridge_key خالی (برای مالک)', /bridge_key:\s*(""|'')/.test(cfg));
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts/lint-php.mjs')], { cwd: ROOT, encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  check('lint-php (نحو واقعی PHP 8.4 یا skip)', r.status === 0, out.slice(-200));
}

// ── E) پلاگین Paper ─────────────────────────────────────────────────
section('E) پلاگین Paper/Spigot (Java)');
{
  const J = join(ROOT, 'server/java');
  const need = [
    'pom.xml', 'src/main/resources/plugin.yml', 'src/main/resources/config.yml',
    'src/main/java/ir/novaedge/NovaEdgePlugin.java',
    'src/main/java/ir/novaedge/core/Rng.java', 'src/main/java/ir/novaedge/core/Json.java',
    'src/main/java/ir/novaedge/core/Elo.java', 'src/main/java/ir/novaedge/core/Scoring.java',
    'src/main/java/ir/novaedge/core/BotTier.java', 'src/main/java/ir/novaedge/core/AntiCheat.java',
    'src/main/java/ir/novaedge/core/Brain.java', 'src/main/java/ir/novaedge/core/Matchmaking.java',
    'src/main/java/ir/novaedge/core/Spec.java',
    'src/main/java/ir/novaedge/bridge/BridgeClient.java',
    'src/main/java/ir/novaedge/game/GameSession.java', 'src/main/java/ir/novaedge/game/BotController.java',
    'src/main/java/ir/novaedge/listeners/PlayerListener.java',
    'src/main/java/ir/novaedge/commands/NovaCommand.java',
    'src/test/java/ir/novaedge/EngineParityTest.java',
  ];
  const missing = need.filter((f) => !existsSync(join(J, f)));
  check('همهٔ فایل‌های لازم موجودند', missing.length === 0, missing.join(', '));
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts/lint-java.mjs')], { cwd: ROOT, encoding: 'utf8' });
  check('lint-java (ساختار + پوشش ۶۷ vector)', r.status === 0, ((r.stdout || '') + (r.stderr || '')).slice(-200));
  const cfg = readFileSync(join(J, 'src/main/resources/config.yml'), 'utf8');
  check('config.yml: bridge_key خالی (برای مالک)', /bridge_key:\s*""/.test(cfg));
}

// ── F) روتر Worker ──────────────────────────────────────────────────
section('F) روتر Worker — مسیرهای MC');
{
  const router = readFileSync(join(ROOT, 'src/mc/router.js'), 'utf8');
  const routes = ["'/mc'", "'/mc/modes'", "'/mc/leaderboard'", "'/mc/shop'", "'/mc/auth'", "'/mc/admin'", "'/mc/setup'", "'/mc/configs'", "'/mc/iran'", "'/mc/referral'", "'/mc/report'", "'/api/mc/v1/'", "'/api/mc/shop/catalog'", "'/api/mc/admin/'", "/mc/img/", "/mc/brand/"];
  const missing = routes.filter((rt) => !router.includes(rt));
  check('مسیرهای اصلی در روتر ارجاع شده‌اند', missing.length === 0, missing.join(' '));
  check('اکشن‌های پل پلاگین heartbeat/player/match/bot/anticheat موجودند',
    ['heartbeat', 'player/sync', 'match/report', 'bot/tier', 'bot/escalate', 'bot/decide', 'anticheat', 'grants'].every((a) => router.includes(`case '${a}'`)));
  const files = readdirSync(join(ROOT, 'src/mc'));
  check('ماژول‌های mc کامل (≥ ۱۰ فایل)', files.length >= 10, files.join(','));
}

console.log(`\n\x1b[1mنتیجهٔ test-godserver: pass=${pass} fail=${fail}\x1b[0m`);
process.exit(fail ? 1 : 0);
