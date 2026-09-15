#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
//  build-assets — نرمال‌سازی و تولید مشتقات تصاویر گیم‌مود/رنک/آیتم
//
//  ورودی:  public/mc/img/raw/*.png|jpg   (خروجی مدل تصویر، ابعاد بزرگ)
//  خروجی:  public/mc/img/<name>.jpg       بنر وب      640×360
//          public/mc/img/<name>-icon.jpg  آیکون مربع  320×320
//          public/mc/img/<name>-lobby.jpg پس‌زمینهٔ لابی 1600×900
//          public/mc/img/manifest.json    فهرست + ابعاد + هش
//
//  اگر ImageMagick نباشد، با پیام روشن رد می‌شود (تست‌ها را نمی‌شکند).
//  اجرا: npm run build:assets
// ═══════════════════════════════════════════════════════════════════
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const IMG = join(ROOT, 'public/mc/img');
const RAW = join(IMG, 'raw');

const sha = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 16);

const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });

const magick = () => {
  for (const c of ['convert', 'magick']) {
    try {
      run(c, ['-version']);
      return c;
    } catch {}
  }
  return null;
};

const M = magick();
if (!M) {
  console.log('⚠️ ImageMagick پیدا نشد — تولید مشتقات تصویر رد شد (تصاویر خام دست‌نخورده می‌مانند).');
  process.exit(0);
}

if (!existsSync(RAW)) {
  // حالت بدون پوشهٔ raw: فایل‌های موجود را درجا نرمال می‌کنیم (بنرهای تولیدشدهٔ مستقیم)
  console.log('پوشهٔ raw نیست — فایل‌های موجودِ public/mc/img به‌صورت درجا نرمال می‌شوند.');
}

const srcDir = existsSync(RAW) ? RAW : IMG;
const isDerived = (base) => /(-icon|-lobby)$/.test(base) || base === 'manifest';
const files = readdirSync(srcDir).filter((f) => {
  if (!/\.(png|jpe?g|webp)$/i.test(f)) return false;
  const base = f.replace(/\.(png|jpe?g|webp)$/i, '');
  // در حالت درجا، فقط منبع‌ها (بنرها، hero، شیت‌ها، آیکون‌های بریده‌شده) پردازش می‌شوند
  if (srcDir === IMG && isDerived(base)) return false;
  return true;
});

if (!files.length) {
  console.log('⚠️ هیچ تصویری برای پردازش پیدا نشد.');
  process.exit(0);
}

const manifest = { generated_at: new Date().toISOString(), images: [] };
const manifestSeen = new Set();
let made = 0;

for (const f of files) {
  const src = join(srcDir, f);
  const base = f.replace(/\.(png|jpe?g|webp)$/i, '');
  try {
    const targets = [];
    const stem = base.replace(/-banner$/, '');
    if (/-banner$/.test(base) || srcDir === RAW) {
      targets.push(['banner', join(IMG, `${stem}-banner.jpg`), '640x360']);
      targets.push(['icon', join(IMG, `${stem}-icon.jpg`), '320x320']);
      targets.push(['lobby', join(IMG, `${stem}-lobby.jpg`), '1600x900']);
    } else if (base === 'hero') {
      targets.push(['hero', join(IMG, 'hero.jpg'), '1600x900']);
    } else if (/^rank-|^cosmetic-|bundle-|gems-pack|season-pass|config-special/.test(base)) {
      const ext = f.match(/\.(png|jpe?g|webp)$/i)?.[1].toLowerCase().replace('jpeg', 'jpg') || 'jpg';
      const outExt = ext === 'webp' ? 'jpg' : ext;
      const size = base.startsWith('rank-') || base.startsWith('cosmetic-') ? '320x320' : '640x360';
      targets.push(['icon', join(IMG, `${base}.${outExt}`), size]);
    } else {
      targets.push(['art', join(IMG, `${base}.jpg`), '640x360']);
    }

    for (const [kind, out, size] of targets) {
      const [w, h] = size.split('x').map(Number);
      run(M, [src, '-resize', `${size}^`, '-gravity', 'center', '-extent', size, '-quality', '82', out]);
      const rel = out.replace(IMG + '/', '');
      const key = `${kind}:${rel}`;
      if (!manifestSeen.has(key)) {
        manifestSeen.add(key);
        manifest.images.push({ kind, file: rel, size: `${w}x${h}`, sha: sha(readFileSync(out)) });
      }
      made++;
    }
  } catch (e) {
    console.log(`⚠️ خطا در پردازش ${f}: ${String(e.message || e).split('\n')[0]}`);
  }
}

writeFileSync(join(IMG, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`✅ ${made} تصویر تولید/نرمال شد. فهرست: public/mc/img/manifest.json`);
console.log('   تعداد فایل‌های تصویری نهایی:', readdirSync(IMG).filter((f) => /\.(png|jpe?g)$/i.test(f)).length);
