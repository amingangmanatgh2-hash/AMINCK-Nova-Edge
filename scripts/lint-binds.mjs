#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
//  lint-binds — بررسی همخوانی تعداد `?` در SQL با آرگومان‌های `.bind()`
//  این کلاس باگ (Wrong number of parameter bindings) در DO SQLite
//  در زمان اجرا خودش را نشان می‌دهد، نه در build. پس اینجا ساکن می‌گیریمش.
//
//  اجرا: node scripts/lint-binds.mjs [--fix-report]
// ═══════════════════════════════════════════════════════════════════
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const TARGETS = ['src', 'shared'];

const walk = (dir, out = []) => {
  for (const e of readdirSync(dir)) {
    if (['node_modules', '.git', 'dist', 'build'].includes(e)) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (e.endsWith('.js') || e.endsWith('.mjs')) out.push(p);
  }
  return out;
};

/** شمارش `?` بیرون از رشته‌های تک‌کوتیش درون SQL */
const placeholders = (sql) => {
  let n = 0;
  let inStr = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (inStr) { if (c === "'") inStr = false; continue; }
    if (c === "'") { inStr = true; continue; }
    if (c === '?') n++;
  }
  return n;
};

/** شمارش آرگومان‌های سطح-بالای یک فراخوانی (با احترام به پرانتز/براکت/رشته) */
function countArgs(src, start) {
  let depth = 0;
  let args = 0;
  let i = start;
  let inStr = null;
  let sawContent = false;
  for (; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; sawContent = true; continue; }
    if (c === '(' || c === '[' || c === '{') { depth++; sawContent = true; continue; }
    if (c === ')' || c === ']' || c === '}') {
      if (depth === 0) break;
      depth--;
      continue;
    }
    if (depth === 0) {
      if (c === ',') { args++; continue; }
      if (c === '?' && !sawContent) continue;
      if (!/\s/.test(c)) sawContent = true;
    }
  }
  return { args: sawContent && /\S/.test(src.slice(start, i)) ? args + 1 : 0, end: i };
}

/** پیدا کردن بسته شدن رشتهٔ template/quoted از موقعیت شروع */
function readString(src, i) {
  const q = src[i];
  if (q === '`') {
    // تا backtick بسته‌شونده (با احترام به ${})
    let depth = 0;
    let j = i + 1;
    for (; j < src.length; j++) {
      const c = src[j];
      if (c === '\\') { j++; continue; }
      if (depth === 0 && c === '`') break;
      if (c === '$' && src[j + 1] === '{') { depth++; j++; continue; }
      if (depth > 0 && c === '{') depth++;
      if (depth > 0 && c === '}') depth--;
    }
    return { text: src.slice(i + 1, j), end: j + 1 };
  }
  let j = i + 1;
  for (; j < src.length; j++) {
    const c = src[j];
    if (c === '\\') { j++; continue; }
    if (c === q) break;
  }
  return { text: src.slice(i + 1, j), end: j + 1 };
}

const problems = [];
let scanned = 0;
let dynamic = 0;
let spread = 0;

for (const t of TARGETS) {
  for (const file of walk(join(ROOT, t))) {
    const src = readFileSync(file, 'utf8');
    const rel = relative(ROOT, file);
    const re = /\.prepare\(\s*(['"`])/g;
    let m;
    while ((m = re.exec(src))) {
      const qStart = m.index + m[0].length - 1;
      const s = readString(src, qStart);
      re.lastIndex = s.end;
      // دنبالهٔ زنجیرهٔ همین عبارت: فقط تا اولین پایان‌دهنده (.run/.all/.first)
      const tailRaw = src.slice(s.end, s.end + 800);
      const endIdx = Math.min(...['.run(', '.all(', '.first(', '.raw('].map((t) => { const i = tailRaw.indexOf(t); return i === -1 ? Infinity : i; }));
      const tail = tailRaw.slice(0, endIdx === Infinity ? tailRaw.length : endIdx);
      const bIdx = tail.indexOf('.bind(');
      if (bIdx === -1) continue;
      // SQL پویا (template با ${...}) یا bind با spread → قابل شمارش ساکن نیست
      if (s.text.includes('${')) { dynamic++; continue; }
      // اگر بین رشته و .bind چیز عجیبی بود (مثلاً .all())، باز هم bind همان عبارت است
      const argStart = s.end + bIdx + '.bind('.length;
      const bindSrc = src.slice(argStart, argStart + 400);
      if (/\.\.\./.test(bindSrc.split(')')[0])) { spread++; continue; }
      const { args } = countArgs(src, argStart);
      const want = placeholders(s.text);
      scanned++;
      if (args !== want) {
        const line = src.slice(0, m.index).split('\n').length;
        problems.push({ file: rel, line, want, got: args, sql: s.text.replace(/\s+/g, ' ').slice(0, 110) });
      }
    }
  }
}

console.log(`بررسی ${scanned} فراخوانی prepare→bind در ${TARGETS.join(', ')} (پویا: ${dynamic}، spread: ${spread} — از شمارش ساکن خارج)`);
if (!problems.length) {
  console.log('✅ همهٔ bindها با تعداد ? همخوان‌اند.');
  process.exit(0);
}
console.log(`❌ ${problems.length} ناهمخوانی:\n`);
for (const p of problems) console.log(`  ${p.file}:${p.line}  ?=${p.want} bind=${p.got}\n     ${p.sql}`);
process.exit(1);
