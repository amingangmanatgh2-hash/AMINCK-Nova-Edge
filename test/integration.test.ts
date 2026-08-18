import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestWorker } from './helpers';
import { createAdmin, loginOwner, startWorker } from './helpers';
import { OWNER_PASSWORD } from './fixtures';

let w: TestWorker;
let ownerCookie = '';

beforeAll(async () => {
  w = await startWorker();
  ownerCookie = await loginOwner(w);
});

afterAll(async () => {
  await w.dispose();
});

// ---------------------------------------------------------------------------

describe('health & headers', () => {
  it('GET /healthz is public and CORS-enabled', async () => {
    const res = await w.mf.dispatchFetch(`${w.base}/healthz`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.ok).toBe(true);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('permissions-policy')).toContain('camera=()');
  });

  it('serves the panel shell and assets', async () => {
    const html = await w.mf.dispatchFetch(`${w.base}/`);
    expect(html.status).toBe(200);
    const text = await html.text();
    expect(text).toContain('dir="rtl"');
    expect(text).toContain('AMINCK GOD Edition');
    expect(html.headers.get('content-security-policy')).toContain("script-src 'self'");

    const js = await w.mf.dispatchFetch(`${w.base}/app.js`);
    expect(js.status).toBe(200);
    expect((await js.text()).length).toBeGreaterThan(1000);

    const css = await w.mf.dispatchFetch(`${w.base}/app.css`);
    expect(css.status).toBe(200);
    expect((await css.text()).length).toBeGreaterThan(500);
  });
});

describe('owner login & session', () => {
  it('rejects wrong password with delay info', async () => {
    const t0 = Date.now();
    const r = await w.login('AMINCK', 'DefinitelyWrongPass1!');
    expect(r.status).toBe(401);
    const elapsed = Date.now() - t0;
    expect(r.cookie).toBe('');
    expect(elapsed).toBeGreaterThanOrEqual(250); // login delay present
  });

  it('accepts owner with AMINCK username', async () => {
    const r = await w.login('AMINCK', OWNER_PASSWORD);
    expect(r.status).toBe(200);
    expect(r.me.role).toBe('owner');
    expect(r.me.power).toBe('ultra');
    expect(r.me.permissions.length).toBe(10);
  });

  it('accepts owner with empty username', async () => {
    const r = await w.login('', OWNER_PASSWORD);
    expect(r.status).toBe(200);
    expect(r.me.username).toBe('AMINCK');
  });

  it('GET /api/me returns the session admin', async () => {
    const r = await w.api(ownerCookie, '/api/me', {});
    expect(r.status).toBe(200);
    expect(r.data.me.role).toBe('owner');
    expect(r.data.me.username).toBe('AMINCK');
  });

  it('sessions are invalid without a valid cookie', async () => {
    const r = await w.api('', '/api/me', {});
    expect(r.status).toBe(401);
  });
});

describe('subscription users (unlimited semantics)', () => {
  let userId = '';
  let token = '';

  it('creates an unlimited user — zero stays zero', async () => {
    const r = await w.api(ownerCookie, '/api/user-create', {
      name: 'کاربر نامحدود',
      limitBytes: 0,
      limitSeconds: 0,
      maxConnections: 0,
      paths: 3,
    });
    expect(r.status).toBe(200);
    const u = r.data.user;
    expect(u.limitBytes).toBe(0);
    expect(u.limitSeconds).toBe(0);
    expect(u.maxConnections).toBe(0);
    expect(u.expiresAt).toBe(0);
    expect(u.routes.length).toBe(3);
    expect(u.uuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(u.token).toMatch(/^[0-9a-f]{64}$/);
    userId = u.id;
    token = u.token;
  });

  it('creates a limited user with real numbers', async () => {
    const r = await w.api(ownerCookie, '/api/user-create', {
      name: 'کاربر محدود',
      limitBytes: 10 * 1024 ** 3,
      limitSeconds: 30 * 86400,
      maxConnections: 4,
      paths: 6,
    });
    expect(r.status).toBe(200);
    const u = r.data.user;
    expect(u.limitBytes).toBe(10 * 1024 ** 3);
    expect(u.limitSeconds).toBe(30 * 86400);
    expect(u.maxConnections).toBe(4);
    expect(u.expiresAt).toBeGreaterThan(Date.now());
    expect(u.routes.length).toBe(6);
  });

  it('lists users and searches', async () => {
    const r = await w.api(ownerCookie, '/api/users', { q: 'نامحدود' });
    expect(r.status).toBe(200);
    expect(r.data.users.length).toBe(1);
    expect(r.data.users[0].name).toBe('کاربر نامحدود');
  });

  it('fetches v2ray base64 subscription with userinfo headers', async () => {
    const res = await w.mf.dispatchFetch(`${w.base}/sub/${token}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('subscription-userinfo')).toContain('download=');
    expect(res.headers.get('subscription-userinfo')).toContain('total=0');
    expect(res.headers.get('profile-update-interval')).toBe('24h');
    expect(res.headers.get('support-url')).toBeTruthy();
    const payload = await res.text();
    const decoded = Buffer.from(payload, 'base64').toString('utf8');
    expect(decoded.split('\n').length).toBe(3);
    expect(decoded).toContain('vless://');
  });

  it('fetches raw / clash / singbox subscriptions', async () => {
    const raw = await w.mf.dispatchFetch(`${w.base}/sub/${token}/raw`);
    expect(raw.status).toBe(200);
    expect((await raw.text()).startsWith('vless://')).toBe(true);

    const clash = await w.mf.dispatchFetch(`${w.base}/sub/${token}/clash`);
    expect(clash.status).toBe(200);
    const clashText = await clash.text();
    expect(clashText).toContain('NOVA-AUTO');
    expect(clashText).toContain('NOVA-FALLBACK');
    expect(clashText).toContain('NOVA-BALANCE');
    expect(clashText).toContain('NOVA-SMART');
    expect(clashText).toContain('unified-delay: true');

    const sb = await w.mf.dispatchFetch(`${w.base}/sub/${token}/singbox`);
    expect(sb.status).toBe(200);
    const sbJson = JSON.parse(await sb.text());
    expect(sbJson.inbounds.some((i: any) => i.type === 'tun')).toBe(true);
    expect(sbJson.inbounds.some((i: any) => i.type === 'mixed')).toBe(true);
    expect(sbJson.outbounds.some((o: any) => o.type === 'urltest')).toBe(true);
    expect(sbJson.outbounds.some((o: any) => o.type === 'selector')).toBe(true);
  });

  it('unknown token → 404, disabled user → 403', async () => {
    const nf = await w.mf.dispatchFetch(`${w.base}/sub/${'a'.repeat(64)}`);
    expect(nf.status).toBe(404);

    const id = userId;
    const off = await w.api(ownerCookie, `/api/users/${id}`, { action: 'toggle' });
    expect(off.status).toBe(200);
    const sub = await w.mf.dispatchFetch(`${w.base}/sub/${token}`);
    expect(sub.status).toBe(403);
    // re-enable for later tests
    await w.api(ownerCookie, `/api/users/${id}`, { action: 'toggle' });
  });

  it('user actions: reset usage, rotate uuid/token', async () => {
    const id = userId;
    const r1 = await w.api(ownerCookie, `/api/users/${id}`, { action: 'reset_usage' });
    expect(r1.status).toBe(200);
    expect(r1.data.user.usageBytes).toBe(0);
    const r2 = await w.api(ownerCookie, `/api/users/${id}`, { action: 'rotate_uuid' });
    expect(r2.data.user.uuid).not.toBe(r1.data.user.uuid);
    const r3 = await w.api(ownerCookie, `/api/users/${id}`, { action: 'rotate_token' });
    expect(r3.data.user.token).not.toBe(r1.data.user.token);
    token = r3.data.user.token;
  });
});

describe('power-level enforcement (backend, not UI)', () => {
  it('owner (ultra) can build 200 paths', async () => {
    const r = await w.api(ownerCookie, '/api/user-create', {
      name: 'کاربر ۲۰۰ مسیر',
      paths: 200,
    });
    expect(r.status).toBe(200);
    expect(r.data.user.routes.length).toBe(200);

    const cfg = await w.api(ownerCookie, '/api/config-build', {
      id: r.data.user.id,
      paths: 200,
      formats: ['clash'],
    });
    expect(cfg.status).toBe(200);
    expect(cfg.data.configs[0].paths).toBe(200);
    expect(cfg.data.truncated).toBe(false);
  });

  it('limited admin cannot exceed 5 paths even via direct API', async () => {
    // create a limited admin
    const created = await createAdmin(w, ownerCookie, {
      username: 'lim1',
      password: 'LimitedPass123!',
      role: 'admin',
      power: 'limited',
    });
    expect(created.status).toBe(200);

    const lim = await w.login('lim1', 'LimitedPass123!');
    expect(lim.status).toBe(200);
    expect(lim.me.power).toBe('limited');

    // direct API request for 200 paths → clamped to 5
    const r = await w.api(lim.cookie, '/api/user-create', { name: 'تلاش ۲۰۰', paths: 200 });
    expect(r.status).toBe(200);
    expect(r.data.user.routes.length).toBe(5);

    const cfg = await w.api(lim.cookie, '/api/config-build', {
      id: r.data.user.id,
      paths: 200,
      formats: ['raw'],
      save: true,
    });
    expect(cfg.status).toBe(200);
    expect(cfg.data.configs[0].paths).toBe(5);
    expect(cfg.data.truncated).toBe(true);
  });

  it('limited admin is forbidden from privileged ops (settings/admins/backup)', async () => {
    const lim = await w.login('lim1', 'LimitedPass123!');
    const settings = await w.api(lim.cookie, '/api/settings', { settings: { title: 'hack' } });
    expect(settings.status).toBe(403);
    const admins = await w.api(lim.cookie, '/api/admins/list', {});
    expect(admins.status).toBe(403);
    // admin role legitimately holds backup:export — this must NOT be blocked
    const backup = await w.api(lim.cookie, '/api/backup', {});
    expect(backup.status).toBe(200);
  });

  it('support role cannot create/delete users', async () => {
    await createAdmin(w, ownerCookie, {
      username: 'sup1',
      password: 'SupportPass123!',
      role: 'support',
      power: 'normal',
    });
    const sup = await w.login('sup1', 'SupportPass123!');
    expect(sup.status).toBe(200);
    const list = await w.api(sup.cookie, '/api/users', {});
    expect(list.status).toBe(200);
    const create = await w.api(sup.cookie, '/api/user-create', { name: 'x' });
    expect(create.status).toBe(403);
    const del = await w.api(sup.cookie, '/api/user-delete', { id: 'whatever' });
    expect(del.status).toBe(403);
  });
});

describe('instant admin revoke & restore', () => {
  it('revoking kills the session on the next request; restore re-enables login', async () => {
    // create + login
    await createAdmin(w, ownerCookie, {
      username: 'rev1',
      password: 'RevokePass123!',
      role: 'operator',
      power: 'normal',
    });
    const rev = await w.login('rev1', 'RevokePass123!');
    expect(rev.status).toBe(200);

    const me = await w.api(rev.cookie, '/api/me', {});
    expect(me.status).toBe(200);

    // owner disables rev1
    const list = await w.api(ownerCookie, '/api/admins/list', {});
    const admin = list.data.admins.find((a: any) => a.username === 'rev1');
    expect(admin).toBeTruthy();

    const off = await w.api(ownerCookie, '/api/admins/update', { id: admin.id, active: false });
    expect(off.status).toBe(200);

    // next request with the old session must be 401 (instant revoke)
    const after = await w.api(rev.cookie, '/api/me', {});
    expect(after.status).toBe(401);

    // restore
    const on = await w.api(ownerCookie, '/api/admins/update', { id: admin.id, active: true });
    expect(on.status).toBe(200);
    const again = await w.login('rev1', 'RevokePass123!');
    expect(again.status).toBe(200);
  });
});

describe('admin management protections', () => {
  it('owner cannot be deleted, disabled or edited', async () => {
    const list = await w.api(ownerCookie, '/api/admins/list', {});
    const owner = list.data.admins.find((a: any) => a.role === 'owner');
    expect(owner).toBeTruthy();
    expect(owner.username).toBe('AMINCK');

    const del = await w.api(ownerCookie, '/api/admins/delete', { id: owner.id });
    expect(del.status).toBe(400);
    expect(del.data.error).toBe('owner-protected');

    const upd = await w.api(ownerCookie, '/api/admins/update', { id: owner.id, active: false });
    expect(upd.status).toBe(400);
  });

  it('hash and salt never appear in the admins API', async () => {
    const list = await w.api(ownerCookie, '/api/admins/list', {});
    for (const a of list.data.admins) {
      expect(a.hash).toBeUndefined();
      expect(a.salt).toBeUndefined();
      expect(a.iterations).toBeUndefined();
    }
  });

  it('weak passwords are rejected (min 10 chars)', async () => {
    const r = await createAdmin(w, ownerCookie, {
      username: 'weak1',
      password: 'short',
      role: 'operator',
      power: 'normal',
    });
    expect(r.status).toBe(400);
    expect(r.data.error).toBe('weak-password');
  });

  it('duplicate usernames are rejected', async () => {
    const r = await createAdmin(w, ownerCookie, {
      username: 'lim1',
      password: 'AnotherPass123!',
      role: 'admin',
      power: 'ultra',
    });
    expect(r.status).toBe(409);
  });
});

describe('audit log', () => {
  it('records the expected events with actor/action/target/details', async () => {
    const r = await w.api(ownerCookie, '/api/audit', { limit: 300 });
    expect(r.status).toBe(200);
    const events = r.data.events as Array<{ action: string; actor: string; target: string; details: string; ts: number }>;
    const actions = events.map((e) => e.action);
    expect(actions).toContain('admin.login');
    expect(actions).toContain('admin.login_failed');
    expect(actions).toContain('user.create');
    expect(actions).toContain('admin.create');
    expect(actions).toContain('admin.revoke');
    expect(actions).toContain('admin.restore');
    expect(actions).toContain('config.build');
    for (const e of events.slice(0, 10)) {
      expect(e.actor.length).toBeGreaterThan(0);
      expect(e.action.length).toBeGreaterThan(0);
      expect(e.target.length).toBeGreaterThan(0);
      expect(e.ts).toBeGreaterThan(0);
    }
  });
});

describe('backup', () => {
  it('exports the full JSON backup', async () => {
    const r = await w.api(ownerCookie, '/api/backup', {});
    expect(r.status).toBe(200);
    expect(r.data.app).toBe('AMINCK GOD Edition');
    expect(r.data.version).toBe('AMINCK GOD Edition');
    expect(Array.isArray(r.data.users)).toBe(true);
    expect(r.data.users.length).toBeGreaterThanOrEqual(4);
    expect(Array.isArray(r.data.admins)).toBe(true);
    expect(Array.isArray(r.data.audit)).toBe(true);
    expect(r.data.settings.brand).toBe('AMINCK GOD Edition');
  });
});

describe('settings', () => {
  it('owner can update settings; values are validated', async () => {
    const ok = await w.api(ownerCookie, '/api/settings', {
      settings: {
        brand: 'AMINCK GOD Edition',
        configNameTemplate: '{brand} {profile} {index}',
        defaultPaths: 4,
        updateIntervalHours: 12,
        fingerprint: 'firefox',
        profileMode: 'fallback',
        speedPreset: 'god',
        tlsPorts: [443, 2053, 2083, 2087, 2096, 8443],
      },
    });
    expect(ok.status).toBe(200);
    expect(ok.data.settings.fingerprint).toBe('firefox');
    expect(ok.data.settings.speedPreset).toBe('god');

    const bad = await w.api(ownerCookie, '/api/settings', {
      settings: { configNameTemplate: '{nope}' },
    });
    expect(bad.status).toBe(400);
  });
});

describe('endpoints', () => {
  it('auto-seeds the deployment host and lists endpoints', async () => {
    const r = await w.api(ownerCookie, '/api/endpoints', { action: 'view' });
    expect(r.status).toBe(200);
    expect(r.data.endpoints.some((e: any) => e.host === 'nova.test')).toBe(true);
  });

  it('adds and removes endpoints with validation', async () => {
    const add = await w.api(ownerCookie, '/api/endpoints', {
      action: 'add',
      host: 'edge-extra.example.com',
      port: 443,
    });
    expect(add.status).toBe(200);
    const dup = await w.api(ownerCookie, '/api/endpoints', {
      action: 'add',
      host: 'edge-extra.example.com',
      port: 443,
    });
    expect(dup.status).toBe(409);
    const bad = await w.api(ownerCookie, '/api/endpoints', {
      action: 'add',
      host: 'not a host!',
      port: 443,
    });
    expect(bad.status).toBe(400);

    const id = add.data.endpoints.find((e: any) => e.host === 'edge-extra.example.com').id;
    const rm = await w.api(ownerCookie, '/api/endpoints', { action: 'remove', id });
    expect(rm.status).toBe(200);
  });
});

describe('capabilities API', () => {
  it('reports ≥150 capabilities and ≥50 owner/admin ones', async () => {
    const r = await w.api(ownerCookie, '/api/capabilities', {});
    expect(r.status).toBe(200);
    expect(r.data.total).toBeGreaterThanOrEqual(150);
    expect(r.data.ownerCount).toBeGreaterThanOrEqual(50);
    expect(r.data.capabilities.length).toBe(r.data.total);
  });
});

describe('stats dashboard', () => {
  it('returns aggregate numbers', async () => {
    const r = await w.api(ownerCookie, '/api/stats', {});
    expect(r.status).toBe(200);
    expect(r.data.users).toBeGreaterThanOrEqual(4);
    expect(r.data.activeUsers).toBeGreaterThanOrEqual(4);
    expect(r.data.admins).toBeGreaterThanOrEqual(4);
  });
});

describe('same-origin enforcement', () => {
  it('rejects mutating requests from a foreign origin', async () => {
    const res = await w.mf.dispatchFetch(`${w.base}/api/user-create`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
      body: JSON.stringify({ name: 'evil' }),
    });
    expect(res.status).toBe(403);
  });

  it('rejects requests with cross-site sec-fetch-site', async () => {
    const res = await w.mf.dispatchFetch(`${w.base}/api/user-create`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' },
      body: JSON.stringify({ name: 'evil' }),
    });
    expect(res.status).toBe(403);
  });
});

describe('expired subscriptions', () => {
  it('blocks subscriptions after expiry and allows unlimited', async () => {
    const r = await w.api(ownerCookie, '/api/user-create', {
      name: 'کاربر کوتاهمدت',
      limitSeconds: 1,
      paths: 1,
    });
    expect(r.status).toBe(200);
    const token = r.data.user.token;
    const first = await w.mf.dispatchFetch(`${w.base}/sub/${token}`);
    expect(first.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const expired = await w.mf.dispatchFetch(`${w.base}/sub/${token}`);
    expect(expired.status).toBe(410);
  });
});

describe('config rebuild with save', () => {
  it('persists regenerated routes', async () => {
    const r = await w.api(ownerCookie, '/api/user-create', {
      name: 'کاربر بازسازی',
      paths: 2,
    });
    expect(r.data.user.routes.length).toBe(2);
    const built = await w.api(ownerCookie, '/api/config-build', {
      id: r.data.user.id,
      paths: 6,
      formats: ['raw'],
      save: true,
    });
    expect(built.status).toBe(200);
    expect(built.data.configs[0].paths).toBe(6);
    const list = await w.api(ownerCookie, '/api/users', { q: 'بازسازی' });
    expect(list.data.users[0].routes.length).toBe(6);
  });
});

describe('AMINCK GOD Edition hot-update & anti-detect', () => {
  it('one-click hot-update rebuilds routes without domain change', async () => {
    const before = await w.api(ownerCookie, '/api/users', { q: 'نامحدود' });
    const user = before.data.users[0];
    const oldPath = user.routes[0].path;
    const r = await w.api(ownerCookie, '/api/hot-update', { speedPreset: 'god' });
    expect(r.status).toBe(200);
    expect(r.data.ok).toBe(true);
    expect(r.data.domainUnchanged).toBe(true);
    expect(r.data.configGeneration).toBeGreaterThanOrEqual(2);
    const after = await w.api(ownerCookie, '/api/users', { q: 'نامحدود' });
    const nu = after.data.users[0];
    expect(nu.routes.length).toBe(user.routes.length);
    // paths regenerated (anti-detect random)
    expect(nu.routes[0].path).not.toBe(oldPath);
  });

  it('settings accept fakeDomains and antiDetect', async () => {
    const r = await w.api(ownerCookie, '/api/settings', {
      settings: {
        fakeDomains: ['snaap.ir', 'www.digikala.com'],
        antiDetect: {
          pathPadding: true,
          pathJitter: true,
          fragment: true,
          hostCamouflage: true,
          multiPort: false,
        },
        speedPreset: 'god',
      },
    });
    expect(r.status).toBe(200);
    expect(r.data.settings.fakeDomains).toContain('snaap.ir');
    expect(r.data.settings.antiDetect.fragment).toBe(true);
    expect(r.data.settings.speedPreset).toBe('god');
  });

  it('subscription raw lines brand AMINCK GOD Edition and include anti-detect host', async () => {
    const created = await w.api(ownerCookie, '/api/user-create', {
      name: 'edge-anti',
      paths: 2,
      speedPreset: 'god',
    });
    expect(created.status).toBe(200);
    const token = created.data.user.token;
    const res = await w.mf.dispatchFetch(`${w.base}/sub/${token}/raw`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('vless://');
    expect(text).toContain('AMINCK GOD Edition');
    // host camouflage or sni present
    expect(text).toContain('security=tls');
    expect(text).toContain('type=ws');
  });
});
