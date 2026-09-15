// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — برندینگ هوشمند سرور (Workers AI)
//
//  بعد از اولین اجرای پنل ادمین، بر اساس *اسمی که خودتان گذاشته‌اید*:
//   ۱) مدل متنی، تم/پالت/موتیف بصری را از اسم استخراج می‌کند
//   ۲) مدل تصویری (Flux Schnell)، لوگو + بنر + اسپلش می‌سازد
//   ۳) نتیجه در mc_assets ذخیره و در /mc/brand/* سرو می‌شود
//  اگر AI در دسترس نبود، یک برند قطعی (SVG) از هش اسم ساخته می‌شود تا
//  سایت هرگز بدون لوگو نماند.
// ═══════════════════════════════════════════════════════════════════
import { mcGet, mcSet, pushAlert } from './db.js';
import { text, json } from '../util.js';
import { TEXT_MODELS } from '../ai.js';

const now = () => Math.floor(Date.now() / 1000);

export const IMAGE_MODELS = [
  '@cf/black-forest-labs/flux-1-schnell',
  '@cf/lykon/dreamshaper-8-lcm',
  '@cf/bytedance/stable-diffusion-xl-lightning',
];

/** پالت رنگ بر اساس هش اسم — برای برند جایگزین و UI */
export function paletteFromName(name) {
  const s = String(name || 'Nova Edge');
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const hue = h % 360;
  const hue2 = (hue + 40 + (h % 60)) % 360;
  return {
    primary: `hsl(${hue} 85% 58%)`,
    secondary: `hsl(${hue2} 80% 52%)`,
    dark: `hsl(${hue} 45% 8%)`,
    hue,
    hue2,
    hex: `#${((h >> 8) & 0xffffff).toString(16).padStart(6, '0')}`,
  };
}

/** استخراج تم از اسم با مدل متنی (بدون AI → heuristic) */
export async function themeFromName(env, db, name) {
  const cached = await mcGet(db, 'brand_theme', '');
  const cachedFor = await mcGet(db, 'brand_theme_name', '');
  if (cached && cachedFor === String(name)) return JSON.parse(cached);
  const heuristic = heuristicTheme(name);
  if (!env?.AI || typeof env.AI.run !== 'function') return heuristic;
  try {
    const messages = [
      {
        role: 'system',
        content:
          'You are an art director for Minecraft server branding. Reply ONLY with JSON: {"motif":"<main visual motif>","style":"<art style>","palette":["#rrggbb","#rrggbb","#rrggbb"],"mood":"<mood>","prompt":"<one detailed English text-to-image prompt for a Minecraft-style server logo, 60 words max, no text/letters in image>"}',
      },
      { role: 'user', content: `Server name: "${name}". Tagline: "${await mcGet(db, 'server_tagline', '')}". Style preference: "${await mcGet(db, 'brand_style', 'cartoon pixel-art minecraft')}".` },
    ];
    for (const model of TEXT_MODELS) {
      try {
        const res = await env.AI.run(model, { messages, max_tokens: 420, temperature: 0.7 });
        const raw = String(res?.response || res?.result?.response || '');
        const m = raw.match(/\{[\s\S]*\}/);
        if (!m) continue;
        const o = JSON.parse(m[0]);
        if (o?.prompt) {
          const theme = { ...heuristic, ...o, source: model, generated_at: now() };
          await mcSet(db, 'brand_theme', JSON.stringify(theme).slice(0, 2000));
          await mcSet(db, 'brand_theme_name', String(name));
          return theme;
        }
      } catch {
        /* مدل بعدی */
      }
    }
  } catch {}
  return heuristic;
}

/** تم جایگزین بدون AI — از کلیدواژه‌های اسم */
export function heuristicTheme(name) {
  const s = String(name || '').toLowerCase();
  const pal = paletteFromName(name);
  const rules = [
    { rx: /dragon|اژدها|azhdah/, motif: 'a blocky pixel dragon coiled around a glowing cube', palette: ['#ff4d4d', '#1b1b2f', '#ffd166'] },
    { rx: /nova|star|queer|کهکشا|ستار/, motif: 'a pixel-art supernova bursting over cubic mountains', palette: ['#7c5cff', '#0b1026', '#43e7ff'] },
    { rx: /edge|لبه|تیز/, motif: 'a floating obsidian citadel on the edge of a shattered voxel cliff', palette: ['#22d3ee', '#0f172a', '#f97316'] },
    { rx: /god|خدا|ایزد|zeus/, motif: 'a golden crown of cubes above storm clouds with lightning', palette: ['#ffd700', '#111827', '#a855f7'] },
    { rx: /king|شاه|امپراتور|empire/, motif: 'a pixel king banner and castle towers at sunset', palette: ['#f59e0b', '#1e1b4b', '#ef4444'] },
    { rx: /persia|iran|ایران|پارس|cyrus|کوروش/, motif: 'Persepolis-style voxel columns with turquoise tile patterns', palette: ['#2dd4bf', '#0b1220', '#eab308'] },
    { rx: /nether|جهنم|lava|آتش/, motif: 'a nether fortress of cubes above a lava sea', palette: ['#f97316', '#2b0a0a', '#fbbf24'] },
    { rx: /end|ender|void|پوچی/, motif: 'an end-city island floating in a violet void with chorus plants', palette: ['#a78bfa', '#0a0a12', '#f0abfc'] },
    { rx: /frost|ice|یخ|زمستان/, motif: 'an ice-spire voxel castle under aurora lights', palette: ['#67e8f9', '#0c1b2a', '#ffffff'] },
    { rx: /jungle|warz|جنگل|forest/, motif: 'dense cubic jungle with a hidden temple and fireflies', palette: ['#22c55e', '#052e16', '#fde047'] },
  ];
  const hit = rules.find((r) => r.rx.test(s));
  const motif = hit ? hit.motif : 'a heroic voxel knight holding a glowing cube sword above a cubic horizon';
  const palette = hit ? hit.palette : [pal.hex, pal.dark, pal.secondary];
  const style = 'cartoon pixel-art, Minecraft-inspired isometric illustration, thick clean shapes, vibrant saturated colors, soft rim light, subtle voxel texture, centered composition, plain dark background';
  return {
    motif,
    style,
    palette,
    mood: 'epic, playful, competitive',
    prompt: `${motif}. Style: ${style}. No letters, no words, no watermark, no UI text.`,
    source: 'heuristic',
    generated_at: now(),
  };
}

/** تولید تصویر با Workers AI */
async function runImage(env, prompt, { width = 768, height = 768, steps = 4 } = {}) {
  if (!env?.AI || typeof env.AI.run !== 'function') return { ok: false, error: 'no_ai_binding' };
  const tried = [];
  for (const model of IMAGE_MODELS) {
    try {
      const res = await env.AI.run(model, { prompt, width, height, steps });
      const b64 = res?.response?.image || res?.result?.response?.image || res?.response || res?.image || res?.result?.image;
      if (typeof b64 === 'string' && b64.length > 1000) {
        const clean = b64.replace(/^data:[^;]+;base64,/, '');
        tried.push({ model, ok: true });
        return { ok: true, b64: clean, model, bytes: Math.round((clean.length * 3) / 4) };
      }
      tried.push({ model, ok: false });
    } catch (e) {
      tried.push({ model, ok: false, error: String(e).slice(0, 90) });
    }
  }
  return { ok: false, tried };
}

const storeAsset = async (db, key, b64, prompt, model, mime = 'image/png') => {
  const bytes = Math.round((b64.length * 3) / 4);
  await db
    .prepare('INSERT INTO mc_assets (key, mime, data_b64, bytes, prompt, model, generated_at, manual) VALUES (?,?,?,?,?,?,?,0) ON CONFLICT(key) DO UPDATE SET mime=excluded.mime, data_b64=excluded.data_b64, bytes=excluded.bytes, prompt=excluded.prompt, model=excluded.model, generated_at=excluded.generated_at')
    .bind(key, mime, b64, bytes, String(prompt).slice(0, 500), String(model).slice(0, 60), now())
    .run();
  return { key, bytes };
};

/**
 * ساخت کامل برند (لوگو + بنر + اسپلش)
 */
export async function generateBrand(env, db, opts = {}) {
  const name = opts.name || (await mcGet(db, 'server_name', 'Nova Edge'));
  const tagline = opts.tagline || (await mcGet(db, 'server_tagline', ''));
  const style = opts.style || (await mcGet(db, 'brand_style', 'cartoon pixel-art minecraft'));
  const theme = opts.prompt ? { ...heuristicTheme(name), prompt: opts.prompt, source: 'manual_prompt' } : await themeFromName(env, db, name);
  await mcSet(db, 'brand_theme', JSON.stringify(theme).slice(0, 2000));
  await mcSet(db, 'brand_theme_name', String(name));

  const logoPrompt = `${theme.prompt} Logo variant: single centered emblem, square 1:1, generous padding, flat dark navy background (#0b1020), crisp edges, no text. Style: ${style}.`;
  const bannerPrompt = `${theme.prompt} Wide banner 16:9 cinematic composition with space on the left for UI text, dramatic lighting, no text or letters. Style: ${style}.`;
  const splashPrompt = `${theme.prompt} Splash art: dynamic action scene with particles and depth, portrait 3:4, no text. Style: ${style}.`;

  const [logo, banner, splash] = await Promise.all([
    runImage(env, logoPrompt, { width: 768, height: 768, steps: 4 }),
    runImage(env, bannerPrompt, { width: 1024, height: 576, steps: 4 }),
    runImage(env, splashPrompt, { width: 768, height: 1024, steps: 4 }),
  ]);

  const saved = [];
  if (logo.ok) saved.push(await storeAsset(db, 'logo', logo.b64, logoPrompt, logo.model));
  if (banner.ok) saved.push(await storeAsset(db, 'banner', banner.b64, bannerPrompt, banner.model));
  if (splash.ok) saved.push(await storeAsset(db, 'splash', splash.b64, splashPrompt, splash.model));

  const ok = saved.length > 0;
  await mcSet(db, 'brand_done', ok ? '1' : '');
  await mcSet(db, 'brand_generated_at', String(now()));
  if (!ok) {
    await pushAlert(db, 'brand_failed', `تولید برند ناموفق: ${JSON.stringify(logo.tried || logo.error).slice(0, 200)}`, 2);
  }
  return {
    ok,
    name,
    theme,
    saved,
    failures: [!logo.ok && logo, !banner.ok && banner, !splash.ok && splash].filter(Boolean).map((f) => f.tried || f.error),
    fallback_svg: ok ? null : svgBrand(name, theme),
  };
}

/** برند جایگزین قطعی (SVG) — همیشه کار می‌کند */
export function svgBrand(name, theme) {
  const pal = paletteFromName(name);
  const p = theme?.palette?.length >= 3 ? theme.palette : [pal.primary, pal.dark, pal.secondary];
  const initials = String(name || 'NE')
    .split(/\s+/)
    .map((w) => w[0] || '')
    .join('')
    .slice(0, 3)
    .toUpperCase();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p[0]}"/><stop offset="1" stop-color="${p[2] || p[0]}"/></linearGradient></defs>
<rect width="256" height="256" rx="42" fill="#0b1020"/>
<g fill="url(#g)">
<rect x="44" y="44" width="52" height="52" rx="6"/>
<rect x="108" y="44" width="52" height="52" rx="6" opacity=".82"/>
<rect x="160" y="96" width="52" height="52" rx="6" opacity=".68"/>
<rect x="44" y="108" width="52" height="52" rx="6" opacity=".55"/>
<rect x="108" y="160" width="104" height="52" rx="6" opacity=".42"/>
</g>
<text x="128" y="146" font-family="Verdana,Geneva,sans-serif" font-size="58" font-weight="bold" fill="#ffffff" text-anchor="middle" opacity=".95">${initials}</text>
</svg>`;
}

/** سرو کردن asset به‌صورت باینری (با fallback SVG) */
export async function serveAsset(db, key, name) {
  const row = await db.prepare('SELECT * FROM mc_assets WHERE key=?').bind(String(key)).first();
  if (row?.data_b64) {
    return new Response(Uint8Array.from(atob(row.data_b64), (c) => c.charCodeAt(0)), {
      headers: { 'Content-Type': row.mime || 'image/png', 'Cache-Control': 'public, max-age=86400', 'X-Nova-Brand': 'ai' },
    });
  }
  const theme = safeTheme(await mcGet(db, 'brand_theme', ''));
  const svg = svgBrand(name || (await mcGet(db, 'server_name', 'Nova Edge')), theme);
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600', 'X-Nova-Brand': 'fallback' } });
}

const safeTheme = (s) => {
  try {
    return JSON.parse(s || '');
  } catch {
    return {};
  }
};

/** آپلود دستی (اگر ادمین خواست عکس خودش را بگذارد) */
export async function uploadAsset(db, key, b64, mime = 'image/png') {
  const clean = String(b64).replace(/^data:[^;]+;base64,/, '');
  if (clean.length < 500) return { ok: false, error: 'دادهٔ تصویر نامعتبر' };
  if (clean.length > 8 * 1024 * 1024) return { ok: false, error: 'حجم تصویر بیش از حد' };
  await db
    .prepare('INSERT INTO mc_assets (key, mime, data_b64, bytes, prompt, model, generated_at, manual) VALUES (?,?,?,?,?,?,?,1) ON CONFLICT(key) DO UPDATE SET mime=excluded.mime, data_b64=excluded.data_b64, bytes=excluded.bytes, manual=1, generated_at=excluded.generated_at')
    .bind(String(key).slice(0, 24), mime, clean, Math.round((clean.length * 3) / 4), 'manual-upload', '', now())
    .run();
  return { ok: true, key, bytes: Math.round((clean.length * 3) / 4) };
}

export async function brandInfo(db) {
  const rows = await db.prepare('SELECT key, mime, bytes, model, prompt, manual, generated_at FROM mc_assets ORDER BY key').all();
  return {
    server_name: await mcGet(db, 'server_name', 'Nova Edge'),
    theme: safeTheme(await mcGet(db, 'brand_theme', '')),
    generated_at: Number(await mcGet(db, 'brand_generated_at', '0')) || 0,
    assets: (rows.results || []).map((r) => ({ ...r, url: `/mc/brand/${r.key}.png` })),
  };
}
