#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
//  lint-java.mjs — لینتر ساختاری پلاگین Paper (server/java)
//
//  در این سندباکس JDK/Maven در دسترس نیست (مخازن Maven بلاک‌اند)، پس
//  «کامپایل» ممکن نیست. این اسکریپت هر چیزی را که بدون کامپایلر قابل
//  راستی‌آزمایی است بررسی می‌کند:
//    1) توازن {} () [] و نقل‌قول‌ها (با حذف رشته/کاراکتر/کامنت)
//    2) تطابق package با مسیر دایرکتوری
//    3) تطابق نام کلاس public با نام فایل
//    4) همهٔ importهای ir.novaedge.* به فایل موجود نگاشت شوند
//    5) main در plugin.yml به کلاس موجود اشاره کند
//    6) توابع همسانی (parity) موردنیاز تست در کلاس‌های موتور وجود داشته باشند
//    7) pom.xml تگ‌های متوازن و وابستگی‌های لازم داشته باشد
//    8) هر group/fn در shared/testvectors.json یک case در EngineParityTest داشته باشد
//
//  اجرا: node scripts/lint-java.mjs   (کد خروج ۰ = همه‌چیز پاک)
// ═══════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const JAVA_DIR = join(ROOT, 'server/java');
const SRC = join(JAVA_DIR, 'src/main/java');
const TEST = join(JAVA_DIR, 'src/test/java');

let errors = 0;
let checked = 0;
const err = (msg) => { errors++; console.error('  ✗ ' + msg); };

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.java')) out.push(p);
  }
  return out;
}

/** حذف رشته‌ها/کاراکترها/کامنت‌ها برای بررسی توازن (text blocks شامل نمی‌شود) */
function stripLiterals(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
    } else if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
    } else if (c === '"') {
      i++;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\\') i++;
        i++;
      }
      i++;
      out += '""';
    } else if (c === "'") {
      i++;
      while (i < src.length && src[i] !== "'") {
        if (src[i] === '\\') i++;
        i++;
      }
      i++;
      out += "''";
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

function checkBalance(file, src) {
  const s = stripLiterals(src);
  const pairs = { '{': '}', '(': ')', '[': ']' };
  const stack = [];
  let line = 1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\n') line++;
    if (pairs[c]) stack.push({ c, line });
    else if (c === '}' || c === ')' || c === ']') {
      const top = stack.pop();
      if (!top || pairs[top.c] !== c) {
        err(`${relative(ROOT, file)}:${line} — نابرابری '${c}' (انتظار '${top ? pairs[top.c] : '?'}')`);
        return false;
      }
    }
  }
  if (stack.length) {
    const t = stack[stack.length - 1];
    err(`${relative(ROOT, file)}:${t.line} — '${t.c}' بسته نشده (${stack.length} باز)`);
    return false;
  }
  return true;
}

// ── ۱..۴: فایل‌های جاوا ────────────────────────────────────────────
const files = [...walk(SRC), ...(existsSync(TEST) ? walk(TEST) : [])];
console.log(`lint-java: ${files.length} فایل در server/java`);
for (const f of files) {
  checked++;
  const src = readFileSync(f, 'utf8');
  const rel = relative(ROOT, f);
  checkBalance(f, src);

  // package ↔ dir
  const pkgMatch = src.match(/^\s*package\s+([\w.]+)\s*;/m);
  if (!pkgMatch) { err(`${rel}: package ندارد`); continue; }
  const pkg = pkgMatch[1];
  const expectDir = f.startsWith(SRC) ? relative(SRC, dirname(f)) : relative(TEST, dirname(f));
  if (pkg.replaceAll('.', '/') !== expectDir.replaceAll('\\', '/')) {
    err(`${rel}: package '${pkg}' با دایرکتوری '${expectDir}' نمی‌خواند`);
  }

  // نام کلاس public ↔ نام فایل
  const base = f.split('/').pop().replace(/\.java$/, '');
  const cls = src.match(/public\s+(?:final\s+|abstract\s+)?(?:class|interface|enum)\s+(\w+)/);
  if (cls && cls[1] !== base) err(`${rel}: کلاس public '${cls[1]}' ≠ نام فایل '${base}'`);

  // importهای داخلی باید فایل داشته باشند
  for (const im of src.matchAll(/^import\s+(ir\.novaedge\.[\w.]+)\s*;/gm)) {
    const cls2 = im[1];
    const p = cls2.replaceAll('.', '/');
    const exists = existsSync(join(SRC, p + '.java')) || existsSync(join(TEST, p + '.java'));
    if (!exists) err(`${rel}: import '${cls2}' به فایل موجود نگاشت نشد`);
  }
}

// ── ۵: plugin.yml main ──────────────────────────────────────────────
const pyml = readFileSync(join(JAVA_DIR, 'src/main/resources/plugin.yml'), 'utf8');
const mainCls = pyml.match(/^main:\s*([\w.]+)\s*$/m);
if (!mainCls) err('plugin.yml: کلید main پیدا نشد');
else {
  const p = mainCls[1].replaceAll('.', '/');
  if (!existsSync(join(SRC, p + '.java'))) err(`plugin.yml: main '${mainCls[1]}' فایل ندارد`);
  else checked++;
}

// ── ۶: توابع parity در موتور ────────────────────────────────────────
const REQUIRED = {
  'core/Rng.java': ['mulberry32', 'hashSeed', 'clamp', 'roundTo', 'class Generator', 'chance', 'pick', 'gauss', 'normal', 'int_', 'shuffle'],
  'core/Elo.java': ['expectedScore', 'teamRating', 'effectiveK', 'placementScore', 'eloDelta', 'settleMatch', 'rankPointsFrom', 'rankForRp', 'effectiveRank', 'rankProgress', 'levelForXp', 'xpForLevel', 'skillIndex', 'decayRating'],
  'core/Scoring.java': ['tallyEvents', 'parkourSpeedBonus', 'computePlayerResult', 'pickMvp'],
  'core/BotTier.java': ['tierForSkill', 'shiftTier', 'maxTier', 'percentile', 'playerSkill', 'chooseMatchTier', 'tierAtTime', 'humanizeBot', 'llmBudget', 'tierById'],
  'core/AntiCheat.java': ['reachLimit', 'speedLimit', 'inspect', 'summarize', 'class ViolationTracker', 'record'],
  'core/Brain.java': ['allowedActions', 'scoreActions', 'heuristicDecide', 'humanizeAction', 'stateHash', 'shouldConsultLlm', 'mergeDecisions'],
  'core/Matchmaking.java': ['botName', 'makeBot', 'balanceTeams', 'BOT_NAMES'],
  'core/Spec.java': ['modeById', 'ranks', 'tiersSpec', 'parse', 'parseObject', 'parseArray'],
};
for (const [rel, fns] of Object.entries(REQUIRED)) {
  const src = readFileSync(join(SRC, 'ir/novaedge', rel), 'utf8');
  checked++;
  for (const fn of fns) {
    if (!src.includes(fn)) err(`ir/novaedge/${rel}: '${fn}' پیدا نشد`);
  }
}

// ── ۷: pom.xml ──────────────────────────────────────────────────────
{
  const pom = readFileSync(join(JAVA_DIR, 'pom.xml'), 'utf8');
  checked++;
  for (const tag of ['project', 'dependencies', 'build', 'resources', 'testResources']) {
    const open = (pom.match(new RegExp(`<${tag}[ >]`, 'g')) || []).length;
    const close = (pom.match(new RegExp(`</${tag}>`, 'g')) || []).length;
    if (open !== close) err(`pom.xml: تگ <${tag}> متوازن نیست (${open} باز / ${close} بسته)`);
  }
  for (const need of ['paper-api', 'gson', 'junit-jupiter', 'shared/spec', 'testvectors.json', 'ir.novaedge']) {
    if (!pom.includes(need)) err(`pom.xml: '${need}' موجود نیست`);
  }
}

// ── ۸: پوشش vectorها در EngineParityTest ────────────────────────────
{
  const test = readFileSync(join(TEST, 'ir/novaedge/EngineParityTest.java'), 'utf8');
  const doc = JSON.parse(readFileSync(join(ROOT, 'shared/testvectors.json'), 'utf8'));
  checked++;
  const missing = [];
  for (const v of doc.vectors) {
    if (!test.includes(`"${v.group}/${v.fn}"`)) missing.push(`${v.group}/${v.fn}`);
  }
  if (missing.length) err(`EngineParityTest: ${missing.length} vector بدون case: ${missing.join(', ')}`);
  else console.log(`  ✓ پوشش vectorها: ${doc.vectors.length}/${doc.vectors.length} group/fn در تست case دارند`);
}

console.log(errors === 0
  ? `lint-java: OK — ${checked} بررسی، ۰ خطا (توجه: کامپایل واقعی با mvn روی ماشین صاحب‌کار انجام می‌شود)`
  : `lint-java: ${errors} خطا در ${checked} بررسی`);
process.exit(errors ? 1 : 0);
