#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
//  lint-php — lint سینتکس همهٔ فایل‌های PHP پلاگین Bedrock
//  چگونه؟ PHP واقعی ۸.۴ داخل wasm؛ token_get_all(..., TOKEN_PARSE)
//  فایل را «کامپایل» می‌کند بدون اجرا → خطای سینتکس = ParseError.
//  اجرا: node scripts/lint-php.mjs   (PHPWASM_DIR پیش‌فرض /tmp/phpwasm)
// ═══════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createRequire } from 'node:module';

const ROOT = new URL('..', import.meta.url).pathname;
const PHPWASM_DIR = process.env.PHPWASM_DIR || '/tmp/phpwasm';

const walk = (dir, out = []) => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (e.endsWith('.php')) out.push(p);
  }
  return out;
};

const files = walk(join(ROOT, 'server/bedrock'));
let require_;
try {
  require_ = createRequire(join(PHPWASM_DIR, 'noop.js'));
} catch {
  console.log('⏭️  skip lint-php: php-wasm پیدا نشد در', PHPWASM_DIR);
  process.exit(0);
}
let PhpNode;
try {
  ({ PhpNode } = require_('php-wasm/PhpNode'));
} catch (e) {
  console.log('⏭️  skip lint-php:', String(e.message || e).split('\n')[0]);
  process.exit(0);
}

const php = new PhpNode();
await php.startup;
let out = '';
php.addEventListener('output', (e) => { out += e.detail ?? ''; });

const LINT = `<?php
$f = $argv[1] ?? '';
$src = file_get_contents($f);
try {
  token_get_all($src, TOKEN_PARSE);
  echo "OK\\n";
} catch (ParseError $e) {
  echo 'PARSEERROR ' . $e->getMessage() . ' @line ' . $e->getLine() . "\\n";
}
`;
await php.mkdir('/lint');
await php.writeFile('/lint/lint.php', LINT);

let bad = 0;
for (const f of files) {
  const rel = relative(ROOT, f);
  await php.writeFile('/lint/target.php', new Uint8Array(readFileSync(f)));
  out = '';
  await php.run(`<?php
    $_SERVER['argv'] = ['lint.php', '/lint/target.php'];
    $argv = $_SERVER['argv'];
    require '/lint/lint.php';
  `);
  const line = out.trim().split('\n')[0] || '(no output)';
  if (line.startsWith('OK')) {
    console.log(`  ✅ ${rel}`);
  } else {
    bad++;
    console.log(`  ❌ ${rel} — ${line}`);
  }
}
console.log(bad ? `\n❌ ${bad} فایل دارای خطای سینتکس` : `\n✅ همهٔ ${files.length} فایل PHP سینتکس درست دارند (PHP 8.4 wasm)`);
process.exit(bad ? 1 : 0);
