// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — موتور مشترک: RNG با seed
//  همهٔ سه ران‌تایم (JS ورکر / Java پیپر / PHP پاکت‌ماین) از همین
//  الگوریتم استفاده می‌کنند تا رفتار بات‌ها قابل بازتولید و تست باشد.
//  الگوریتم: mulberry32 + xoshiro برای تنوع؛ خروجی یکسان در هر زبان.
// ═══════════════════════════════════════════════════════════════════

/** mulberry32 — کوچک، سریع، یکسان در Java/PHP/JS */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed = 1) {
    this.seed = (Number(seed) || 1) >>> 0;
    this._next = mulberry32(this.seed);
  }

  /** عدد اعشاری [0,1) */
  float() {
    return this._next();
  }

  /** عدد صحیح [min,max] شامل هر دو */
  int(min, max) {
    const lo = Math.ceil(Number(min) || 0);
    const hi = Math.floor(Number(max) || 0);
    if (hi <= lo) return lo;
    return lo + Math.floor(this._next() * (hi - lo + 1));
  }

  /** شانس وقوع با احتمال p */
  chance(p) {
    return this._next() < Number(p || 0);
  }

  /** انتخاب تصادفی از آرایه */
  pick(arr) {
    if (!arr || !arr.length) return null;
    return arr[Math.floor(this._next() * arr.length) % arr.length];
  }

  /** وزن‌دار: items=[{w:number,...}] */
  weighted(items, weightKey = 'w') {
    if (!items || !items.length) return null;
    let total = 0;
    for (const it of items) total += Math.max(0, Number(it[weightKey]) || 0);
    if (total <= 0) return items[0];
    let r = this._next() * total;
    for (const it of items) {
      r -= Math.max(0, Number(it[weightKey]) || 0);
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  }

  /** گاوسی تقریبی (میانگین ۰، انحراف ۱) — برای خطای انسانی بات */
  gauss() {
    let u = 0;
    let v = 0;
    while (u === 0) u = this._next();
    while (v === 0) v = this._next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** نرمال با میانگین و انحراف دلخواه */
  normal(mean, sd) {
    return Number(mean || 0) + this.gauss() * Number(sd || 1);
  }

  shuffle(arr) {
    const a = Array.isArray(arr) ? arr.slice() : [];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this._next() * (i + 1));
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }
}

/** هش رشته → عدد ۳۲ بیتی (برای seed بات از روی نام مچ) */
export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0 || 1;
}

export const clamp = (n, min, max) => Math.max(Number(min), Math.min(Number(max), Number(n) || 0));
export const round = (n, digits = 0) => {
  const f = Math.pow(10, digits);
  return Math.round((Number(n) || 0) * f) / f;
};
