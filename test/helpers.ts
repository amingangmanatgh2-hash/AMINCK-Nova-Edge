import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { OWNER_PASSWORD, SESSION_SECRET } from './fixtures';

export interface TestWorker {
  mf: Miniflare;
  base: string;
  login(username: string, password: string): Promise<{ cookie: string; me: any; status: number }>;
  api(cookie: string, path: string, body?: Record<string, unknown>, init?: Record<string, unknown>): Promise<{ status: number; data: any; headers: any }>;
  dispose(): Promise<void>;
}

export async function startWorker(): Promise<TestWorker> {
  const dir = join(process.cwd(), '.nova-test-workdir');
  const outfile = join(dir, 'worker.mjs');
  await build({
    entryPoints: [join(process.cwd(), 'src/index.ts')],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    outfile,
    external: ['cloudflare:sockets'],
    sourcemap: false,
    logLevel: 'error',
  });

  const mf = new Miniflare({
    modules: true,
    scriptPath: outfile,
    compatibilityDate: '2025-06-01',
    bindings: {
      ADMIN_PASSWORD: OWNER_PASSWORD,
      SESSION_SECRET,
    },
    durableObjects: {
      AMINCK_STORE: { className: 'AMINCKStore', useSQLite: true },
    },
  });

  const base = 'http://nova.test';

  return {
    mf,
    base,
    async login(username, password) {
      const res: any = await mf.dispatchFetch(`${base}/api/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: base },
        body: JSON.stringify({ username, password }),
      });
      const data = (await res.json()) as any;
      const setCookie = (res.headers.get('set-cookie') as string) ?? '';
      const m = setCookie.match(/nova_session=([^;]+)/);
      return { cookie: m ? (m[1] as string) : '', me: data.me, status: res.status as number };
    },
    async api(cookie, path, body, init = {}) {
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        origin: base,
        cookie: cookie ? `nova_session=${cookie}` : '',
        ...((init.headers as Record<string, string>) ?? {}),
      };
      const res: any = await mf.dispatchFetch(`${base}${path}`, {
        method: 'POST',
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        ...init,
      });
      const data = await res.json().catch(() => null);
      return { status: res.status as number, data, headers: res.headers };
    },
    async dispose() {
      await mf.dispose();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export async function loginOwner(w: TestWorker): Promise<string> {
  const r = await w.login('AMINCK', OWNER_PASSWORD);
  if (r.status !== 200 || !r.cookie) throw new Error('owner login failed');
  return r.cookie;
}

export async function createAdmin(
  w: TestWorker,
  ownerCookie: string,
  opts: { username: string; password: string; role: string; power: string },
) {
  return w.api(ownerCookie, '/api/admins/create', {
    username: opts.username,
    password: opts.password,
    role: opts.role,
    power: opts.power,
  });
}
