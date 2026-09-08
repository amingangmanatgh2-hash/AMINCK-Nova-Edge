// ═══════════════════════════════════════════════════════════════════
//  QR Code سفارشی — رنگ برندی + لوگو وسط + فریم شیک
//  خروجی: PNG خام (بدون هیچ وابستگی گرافیکی، مناسب Workers)
// ═══════════════════════════════════════════════════════════════════
import QR from 'qrcode';

// ─── CRC32 برای PNG ───
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const crcBuf = new Uint8Array(4 + data.length);
  for (let i = 0; i < 4; i++) crcBuf[i] = type.charCodeAt(i);
  crcBuf.set(data, 4);
  dv.setUint32(8 + data.length, crc32(crcBuf));
  return out;
}

async function deflateZlib(data) {
  const cs = new CompressionStream('deflate');
  const stream = new Blob([data]).stream().pipeThrough(cs);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

export async function encodePNG(width, height, rgba) {
  const SIG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0; // filter none
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), rowStart + 1);
  }
  const idat = await deflateZlib(raw);
  const parts = [SIG, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array(0))];
  const total = parts.reduce((s, p) => s + p.length, 0);
  const png = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    png.set(p, off);
    off += p.length;
  }
  return png;
}

// ─── رنگ‌های برند ───
const BRAND_DARK = [0x14, 0x2a, 0x4c, 0xff]; // سرمه‌ای عمیق
const BRAND_BG = [0xff, 0xff, 0xff, 0xff];
const GOLD = [0xf5, 0xb3, 0x1e, 0xff];
const GOLD_DARK = [0xc9, 0x8a, 0x0b, 0xff];

function fillRect(px, W, H, x, y, w, h, color) {
  for (let yy = Math.max(0, y); yy < Math.min(H, y + h); yy++)
    for (let xx = Math.max(0, x); xx < Math.min(W, x + w); xx++) {
      const i = (yy * W + xx) * 4;
      px[i] = color[0];
      px[i + 1] = color[1];
      px[i + 2] = color[2];
      px[i + 3] = color[3];
    }
}

function fillCircle(px, W, H, cx, cy, r, color) {
  const r2 = r * r;
  for (let yy = Math.floor(cy - r); yy <= Math.ceil(cy + r); yy++)
    for (let xx = Math.floor(cx - r); xx <= Math.ceil(cx + r); xx++) {
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const dx = xx - cx;
      const dy = yy - cy;
      if (dx * dx + dy * dy <= r2) {
        const i = (yy * W + xx) * 4;
        px[i] = color[0];
        px[i + 1] = color[1];
        px[i + 2] = color[2];
        px[i + 3] = color[3];
      }
    }
}

// لوگو: سکه طلایی با رعد
export function drawBrandLogo(px, W, H, cx, cy, size) {
  const r = size / 2;
  fillCircle(px, W, H, cx, cy, r, GOLD_DARK); // حلقه بیرونی
  fillCircle(px, W, H, cx, cy, r * 0.82, GOLD); // بدنه سکه
  // رعد سفید با چند مستطیل مورب‌شده (پیکسلی و خوانا در ابعاد کوچک)
  const u = size / 16;
  const rects = [
    [1.5, 1, 5.5, 3],
    [3.2, 3.6, 5, 2.6],
    [4.9, 5.9, 4.6, 2.6],
    [6.6, 8.2, 4.2, 2.6],
    [4.2, 10.6, 4.4, 2.4],
    [4.6, 12.8, 3.4, 2.2],
  ];
  for (const [gx, gy, gw, gh] of rects) {
    fillRect(px, W, Math.round(cx - r + gx * u), Math.round(cy - r + gy * u), Math.round(gw * u), Math.round(gh * u), [0xff, 0xff, 0xff, 0xff]);
  }
}

/**
 * ساخت QR سفارشی با رنگ برند و لوگو وسط
 * @returns {Promise<Uint8Array>} بایت‌های PNG
 */
export async function makeBrandQR(text, label) {
  const qr = QR.create(text, { errorCorrectionLevel: 'H' });
  const n = qr.modules.size;
  const scale = Math.max(8, Math.floor(640 / (n + 8)));
  const quiet = 4;
  const barH = label ? Math.round(scale * 2.4) : 0; // نوار برند زیر ناحیه QR (خارج از داده)
  const size = (n + quiet * 2) * scale;
  const H = size + barH;

  const px = new Uint8Array(size * H * 4).fill(255);
  fillRect(px, size, H, 0, 0, size, H, BRAND_BG);

  // فریم طلایی فقط دور ناحیه QR (خارج از quiet zone داده‌ای — امن)
  const frameW = Math.max(4, Math.round(scale / 2));
  const fr = Math.max(1, Math.round(scale / 3)); // فریم درون حاشیه سفید، به داده نزدیک نمی‌شود

  // ماژول‌های QR — مربع کامل (بدون فاصله؛ فاصله‌دار بودن اسکن را خراب می‌کند)
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!qr.modules.get(r, c)) continue;
      const x = (c + quiet) * scale;
      const y = (r + quiet) * scale;
      fillRect(px, size, H, x, y, scale, scale, BRAND_DARK);
    }
  }

  // لوگوی کوچک وسط (≤۱۸٪ عرض — در حد تحمل خطای سطح H)
  const logoSize = Math.round(size * 0.16);
  const pad = Math.round(logoSize * 0.15);
  const cx = Math.round(size / 2);
  const cy = Math.round(size / 2);
  fillRect(px, size, H, cx - logoSize / 2 - pad, cy - logoSize / 2 - pad, logoSize + pad * 2, logoSize + pad * 2, BRAND_BG);
  drawBrandLogo(px, size, H, cx, cy, logoSize);

  // فریم طلایی روی حاشیه سفید (بیرون از quiet zone داخلی)
  fillRect(px, size, H, 0, 0, size, fr, GOLD);
  fillRect(px, size, H, 0, size - fr, size, fr, GOLD);
  fillRect(px, size, H, 0, 0, fr, size, GOLD);
  fillRect(px, size, H, size - fr, 0, fr, size, GOLD);

  // نوار برند زیر ناحیه QR (روی داده اثر نمی‌گذارد)
  if (label && barH) {
    fillRect(px, size, H, 0, size, size, barH, BRAND_DARK);
    // نقطه طلایی کوچک برند روی نوار
    const dot = Math.round(barH * 0.4);
    fillRect(px, size, H, Math.round(size / 2 - dot / 2), size + Math.round((barH - dot) / 2), dot, dot, GOLD);
  }

  return encodePNG(size, H, px);
}
