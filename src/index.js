// ═══════════════════════════════════════════════════════════════════
//  AMINCK Nova Edge — Minecraft God Server Worker
//  نسخهٔ تمیز MC-only: سایت، فروشگاه، پنل مالک، API عمومی و پل پلاگین‌ها.
//  مسیرهای قدیمی پروژهٔ قبلی عمداً حذف شده‌اند تا با محصول جدید قاطی نشوند.
// ═══════════════════════════════════════════════════════════════════
import { NovaStore, withStore } from './store.js';
import { json, text } from './util.js';
import { handleMc } from './mc/router.js';
import { initMcDb } from './mc/db.js';

const now = () => Math.floor(Date.now() / 1000);

export { NovaStore };

async function rememberOrigin(env, origin) {
  try {
    if (!(await env.KV.get('worker_origin'))) await env.KV.put('worker_origin', origin);
  } catch (e) {
    console.error('origin cache failed', e);
  }
}

function redirect(url, to, status = 302) {
  return Response.redirect(new URL(to, url).toString(), status);
}

export default {
  async fetch(request, envRaw, _ctx) {
    const env = withStore(envRaw);
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      await initMcDb(env.DB);
      await rememberOrigin(env, url.origin);

      if (path === '/health') return json({ ok: true, service: 'nova-edge-minecraft', ts: now() });

      // سازگاری با لینک‌های خیلی قدیمی فقط به شکل redirect، نه اجرای کد legacy.
      if (path === '/setup' || path === '/setup/') return redirect(url, '/mc/setup');
      if (path === '/panel' || path === '/panel/') return redirect(url, '/mc/admin');

      if (path === '/' || path === '/mc' || path.startsWith('/mc/') || path.startsWith('/api/mc')) {
        return await handleMc(env, request, url);
      }

      // مسیرهای قدیمی ربات تلگرام/فروش کانفیگ حذف شده‌اند.
      return text('Nova Edge Minecraft API: not found', 404);
    } catch (e) {
      console.error('worker error', e);
      return json({ ok: false, error: String(e) }, 500);
    }
  },

  async scheduled(_event, envRaw, ctx) {
    // job سبک: دیتابیس MC را گرم می‌کند و origin/kvهای منقضی‌شده DO خودکار تمیز می‌شوند.
    const env = withStore(envRaw);
    ctx.waitUntil(handleMc(env, new Request('https://worker.local/api/mc/status'), new URL('https://worker.local/api/mc/status')).catch((e) => console.error('scheduled failed', e)));
  },
};
