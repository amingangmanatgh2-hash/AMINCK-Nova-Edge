import { describe, expect, it } from 'vitest';
import {
  APP_NAME,
  BRAND,
  buildFormats,
  buildRoutes,
  buildIronPack,
  CLEAN_IP_CATALOG,
  expandRoutesMultiPort,
  expandTunnelFronts,
  isCloudflareIpv4Candidate,
  planRoutes,
  renderConfigName,
  rollingRouteWindow,
  validateNameTemplate,
  validateTlsPorts,
  vlessUriFor,
} from '../src/config';
import { CLOUDFLARE_TLS_PORTS, SPEED_PRESETS } from '../src/types';
import { base64Decode } from '../src/utils';
import { routesFor, settingsFixture, userFixture } from './fixtures';

function ctx(user = userFixture(), settings = settingsFixture()) {
  return {
    user,
    settings,
    speedPreset: user.speedPreset,
    fingerprint: settings.fingerprint,
    profileMode: user.profileMode,
    nameTemplate: user.configNameTemplate ?? settings.configNameTemplate,
    hostForSub: 'panel.example.workers.dev',
  };
}

describe('config builder — brand & naming', () => {
  it('uses the EDGE PANEL brand in default names', () => {
    const user = userFixture();
    const settings = settingsFixture({ configNameTemplate: '{brand} {index}' });
    const built = buildFormats(ctx(user, settings), ['raw']);
    const lines = built[0]!.payload.split('\n');
    expect(lines.length).toBe(user.routes.length);
    for (const line of lines) {
      expect(line.startsWith('vless://')).toBe(true);
      const frag = decodeURIComponent(line.split('#')[1] ?? '');
      expect(frag).toContain('AMINCK GOD Edition');
    }
  });

  it('supports every template variable', () => {
    const user = userFixture({ name: 'علی' });
    const settings = settingsFixture({
      configNameTemplate: '{brand}|{app}|{user}|{profile}|{index}|{endpoint}|{port}',
    });
    const c = ctx(user, settings);
    const built = buildFormats(c, ['raw']);
    const first = built[0]!.payload.split('\n')[0]!;
    const frag = decodeURIComponent(first.split('#')[1] ?? '');
    expect(frag).toContain(BRAND);
    expect(frag).toContain(APP_NAME);
    expect(frag).toContain('علی');
    expect(frag).toContain('Auto');
    expect(frag).toContain('1');
    expect(frag).toContain('edge-1.example.workers.dev:443');
    expect(frag).toContain('443');
  });

  it('rejects unknown template variables', () => {
    expect(validateNameTemplate('{fake} {index}').ok).toBe(false);
    expect(validateNameTemplate('{brand} {index}').ok).toBe(true);
    expect(validateNameTemplate('x'.repeat(300)).ok).toBe(false);
  });

  it('rejects non-Cloudflare TLS ports', () => {
    expect(validateTlsPorts([443, 8443]).ok).toBe(true);
    expect(validateTlsPorts([22]).ok).toBe(false);
    expect(validateTlsPorts([]).ok).toBe(false);
    expect(validateTlsPorts([443, 443, 2053]).ok).toBe(true);
  });
});

describe('config builder — 200 routes', () => {
  it('plans and builds 200 paths across endpoints', () => {
    const settings = settingsFixture();
    const plan = planRoutes(settings.endpoints, 200);
    expect(plan.length).toBe(200);
    const routes = buildRoutes('u'.repeat(24), plan, settings);
    expect(routes.length).toBe(200);
    const paths = new Set(routes.map((r) => r.path));
    expect(paths.size).toBe(200); // unique paths
    expect(routes[0]!.index).toBe(1);
    expect(routes[199]!.index).toBe(200);
    // round-robin across the 3 endpoints
    expect(routes[0]!.host).toBe('edge-1.example.workers.dev');
    expect(routes[1]!.host).toBe('edge-2.example.workers.dev');
    expect(routes[2]!.host).toBe('edge-3.example.workers.dev');
    expect(routes[3]!.host).toBe('edge-1.example.workers.dev');
  });

  it('builds all four formats for 200 routes', () => {
    const user = userFixture({ routes: routesFor('u'.repeat(24), undefined, 200) });
    const built = buildFormats(ctx(user), ['v2ray', 'raw', 'clash', 'singbox']);
    expect(built.length).toBe(4);
    const b64 = built.find((b) => b.format === 'v2ray')!;
    const decoded = new TextDecoder().decode(base64Decode(b64.payload));
    expect(decoded.split('\n').length).toBe(200);
    const raw = built.find((b) => b.format === 'raw')!;
    expect(raw.payload.split('\n').length).toBe(200);
  });
});

describe('config builder — output formats', () => {
  it('emits vless URI with the expected parameters (workers.dev default port 443)', () => {
    const user = userFixture();
    const route = user.routes[0]!;
    const uri = vlessUriFor(user, route, { fingerprint: 'chrome', earlyData: 2048, name: 'AMINCK GOD Edition' });
    expect(uri.startsWith('vless://')).toBe(true);
    expect(uri).toContain(`@${route.host}:443`);
    expect(uri).toContain('security=tls');
    expect(uri).toContain('type=ws');
    expect(uri).toContain('fp=chrome');
    expect(uri).toContain('ed=2048');
    expect(uri).toContain(`sni=${encodeURIComponent(route.host)}`);
    expect(uri).toContain('encryption=none');
    expect(uri.endsWith('#AMINCK GOD Edition')).toBe(true);
  });

  it('keeps direct routes conservative while tuning only optional Anycast copies', () => {
    const routes = routesFor('u'.repeat(24), undefined, 3).map((route, index) => ({
      ...route,
      padding: 'padvalue',
      frontIp: index === 0 ? undefined : `104.16.0.${index}`,
    }));
    const user = userFixture({ routes, speedPreset: 'god' });
    const raw = buildFormats(ctx(user), ['raw'])[0]!.payload.split('\n');
    expect(raw[0]).toContain('ed=0');
    expect(raw[0]).toContain('DIRECT SAFE');
    expect(raw[0]).not.toContain('pad%3D');
    expect(raw[1]).toContain('ed=4096');

    const clash = buildFormats(ctx(user), ['clash'])[0]!.payload;
    expect((clash.match(/max-early-data:/g) ?? [])).toHaveLength(2);
    const singbox = JSON.parse(buildFormats(ctx(user), ['singbox'])[0]!.payload);
    const vless = singbox.outbounds.filter((outbound: { type: string }) => outbound.type === 'vless');
    expect(vless[0].transport.max_early_data).toBeUndefined();
    expect(vless[1].transport.max_early_data).toBe(4096);
  });

  it('emits every hostname-direct route without early data or padding', () => {
    const user = userFixture({
      routes: routesFor('u'.repeat(24), undefined, 3).map((route) => ({ ...route, padding: 'padvalue' })),
      speedPreset: 'god',
    });
    const raw = buildFormats(ctx(user), ['raw'])[0]!.payload.split('\n');
    expect(raw.every((line) => line.includes('ed=0') && line.includes('DIRECT SAFE'))).toBe(true);
    expect(raw.every((line) => !line.includes('pad%3D'))).toBe(true);
    const clash = buildFormats(ctx(user), ['clash'])[0]!.payload;
    expect(clash).not.toContain('max-early-data:');
  });

  it('clash yaml contains NOVA groups, unified-delay and store-selected', () => {
    const user = userFixture();
    const clash = buildFormats(ctx(user), ['clash'])[0]!.payload;
    expect(clash).toContain('unified-delay: true');
    expect(clash).toContain('cache-file:');
    expect(clash).toContain('store-selected: true');
    expect(clash).toContain('name: NOVA-AUTO');
    expect(clash).toContain('type: url-test');
    expect(clash).toContain('name: NOVA-FALLBACK');
    expect(clash).toContain('type: fallback');
    expect(clash).toContain('name: NOVA-BALANCE');
    expect(clash).toContain('type: load-balance');
    expect(clash).toContain('name: NOVA-SMART');
    expect(clash).toContain('name: AMINCK-MULTI');
    expect(clash).toContain('name: AMINCK-YOUTUBE');
    expect(clash).toContain('name: AMINCK-TUNNEL');
    expect(clash).toContain('socks-port: 10808');
    expect(clash).toContain('type: select');
    expect(clash).toContain('MATCH,NOVA-SMART');
    expect(clash).toContain('client-fingerprint: chrome');
    expect(clash).toContain('udp: true');
    expect(clash).not.toContain('max-early-data:');
  });

  it('god preset enables tcp-concurrent, stable does not', () => {
    const user = userFixture({ speedPreset: 'god' });
    const clashGod = buildFormats(ctx(user), ['clash'])[0]!.payload;
    expect(clashGod).toContain('tcp-concurrent: true');
    const stable = userFixture({ speedPreset: 'stable' });
    const clashStable = buildFormats(ctx(stable), ['clash'])[0]!.payload;
    expect(clashStable).not.toContain('tcp-concurrent:');
    // GOD has larger early data + EDGE PANEL GOD knobs
    expect(SPEED_PRESETS.god.earlyData).toBe(4096);
    expect(SPEED_PRESETS.god.healthInterval).toBe(30);
    expect(SPEED_PRESETS.god.tolerance).toBe(50);
    expect(SPEED_PRESETS.god.tcpRetries).toBe(2);
    expect(SPEED_PRESETS.stable.earlyData).toBe(1024);
  });

  it('sing-box json has TUN, Mixed, DoH, URLTest, Selector, Direct and private routing', () => {
    const json = JSON.parse(buildFormats(ctx(userFixture()), ['singbox'])[0]!.payload);
    const types = json.outbounds.map((o: { type: string }) => o.type);
    expect(types).toContain('vless');
    expect(types).toContain('urltest');
    expect(types).toContain('selector');
    expect(types).toContain('direct');
    const tags = json.outbounds.map((o: { tag: string }) => o.tag);
    expect(tags).toContain('NOVA-AUTO');
    expect(tags).toContain('NOVA-SMART');
    expect(json.inbounds.some((i: { type: string }) => i.type === 'tun')).toBe(true);
    expect(json.inbounds.some((i: { type: string }) => i.type === 'mixed')).toBe(true);
    expect(json.inbounds.some((i: { tag?: string }) => i.tag === 'aminck-in')).toBe(true);
    expect(json.dns.servers.some((s: { address: string }) => String(s.address).startsWith('https://'))).toBe(true);
    expect(json.route.rules.some((r: { ip_cidr: string[] }) => Array.isArray(r.ip_cidr))).toBe(true);
    expect(json.route.rules.some((r: { ip_cidr: string[] }) => r.ip_cidr?.includes('10.0.0.0/8'))).toBe(true);
    expect(json.route.final).toBe('NOVA-SMART');
  });

  it('health URL uses a non-Worker target to avoid Cloudflare TCP loops', () => {
    const settings = settingsFixture({ healthUrl: '' });
    const clash = buildFormats(ctx(userFixture(), settings), ['clash'])[0]!.payload;
    expect(clash).toContain('https://www.gstatic.com/generate_204');
    expect(clash).not.toContain('https://edge-1.example.workers.dev/healthz');
  });

  it('rejects a custom health URL that loops back through the first Worker route', () => {
    const settings = settingsFixture({ healthUrl: 'https://edge-1.example.workers.dev/healthz' });
    const clash = buildFormats(ctx(userFixture(), settings), ['clash'])[0]!.payload;
    expect(clash).toContain('https://www.gstatic.com/generate_204');
  });

  it('custom health URL is respected', () => {
    const settings = settingsFixture({ healthUrl: 'https://health.example.com/check' });
    const clash = buildFormats(ctx(userFixture(), settings), ['clash'])[0]!.payload;
    expect(clash).toContain('https://health.example.com/check');
  });

  it('auto / fallback / balance profile modes produce valid configs', () => {
    for (const mode of ['auto', 'fallback', 'balance'] as const) {
      const user = userFixture({ profileMode: mode });
      const clash = buildFormats(ctx(user), ['clash'])[0]!.payload;
      expect(clash).toContain('NOVA-SMART');
    }
  });

  it('every generated proxy name is unique (200 routes)', () => {
    const user = userFixture({ routes: routesFor('u'.repeat(24), undefined, 200) });
    const clash = buildFormats(ctx(user), ['clash'])[0]!.payload;
    const names = [...clash.matchAll(/^  - name: "([^"]+)"/gm)].map((m) => m[1]);
    expect(names.length).toBeGreaterThanOrEqual(200);
    expect(new Set(names).size).toBe(names.length);
  });

  it('unlimited values are never coerced (0 stays 0 in sub headers path)', () => {
    const user = userFixture({ limitBytes: 0, limitSeconds: 0, maxConnections: 0 });
    expect(user.limitBytes).toBe(0);
    const built = buildFormats(ctx(user), ['raw']);
    expect(built[0]!.paths).toBe(3);
  });

  it('buildVlessUri encodes path and name fragment', () => {
    const user = userFixture();
    const route = user.routes[0]!;
    const uri = vlessUriFor(user, route, { fingerprint: 'edge', earlyData: 1024, name: 'AMINCK GOD Edition 1' });
    expect(uri).toContain('path=');
    expect(uri).toContain(encodeURIComponent(route.path));
    expect(uri.endsWith('#AMINCK GOD Edition 1')).toBe(true);
  });
});

describe('config builder — ports', () => {
  it('Cloudflare TLS ports include the workers.dev default 443', () => {
    expect(CLOUDFLARE_TLS_PORTS).toContain(443);
  });
});

describe('renderConfigName edge cases', () => {
  it('falls back to the default template', () => {
    const name = renderConfigName('', { brand: 'AMINCK GOD Edition' });
    expect(name).toContain('AMINCK GOD Edition');
  });
});

describe('config builder — anti-detect & multi-port', () => {
  it('emits random path lengths within jitter range', () => {
    const settings = settingsFixture();
    const plan = planRoutes(settings.endpoints, 20);
    const userId = 'a'.repeat(24); // 24 hex chars like real newId()
    const routes = buildRoutes(userId, plan, settings);
    for (const r of routes) {
      const m = r.path.match(/^\/e([a-z0-9]+)([0-9a-f]{24})$/i);
      expect(m).toBeTruthy();
      expect(m![1]!.length).toBeGreaterThanOrEqual(6);
      expect(m![1]!.length).toBeLessThanOrEqual(12);
      expect(m![2]).toBe(userId);
    }
  });

  it('uses only real endpoints or operator-owned endpoint aliases as wsHost', () => {
    const base = settingsFixture();
    const settings = settingsFixture({
      hostAliases: [base.endpoints[1]!.host, 'unrelated.example'],
      antiDetect: { ...base.antiDetect, hostCamouflage: true },
    });
    const routes = buildRoutes('u'.repeat(24), planRoutes(settings.endpoints, 5), settings);
    expect(routes.some((r) => r.wsHost === base.endpoints[1]!.host)).toBe(true);
    expect(routes.every((r) => r.wsHost !== 'unrelated.example')).toBe(true);
  });

  it('vless URI includes fragment and padding when anti-detect is on', () => {
    const user = userFixture();
    const route = { ...user.routes[0]!, padding: 'abcd1234', wsHost: 'edge-1.example.workers.dev' };
    const uri = vlessUriFor(user, route, {
      fingerprint: 'chrome',
      earlyData: 4096,
      name: 'AMINCK GOD Edition',
      padding: true,
      fragment: true,
      fragmentLength: [100, 200],
      fragmentInterval: [10, 20],
    });
    expect(uri).toContain('fragment=');
    expect(uri).toContain('host=edge-1.example.workers.dev');
    expect(uri.includes('pad=') || uri.includes('pad%3D')).toBe(true);
  });

  it('expandTunnelFronts keeps SNI on worker host', () => {
    const user = userFixture();
    const out = expandTunnelFronts(user.routes, ['1.2.3.4', '5.6.7.8'], 50);
    expect(out.length).toBeGreaterThan(user.routes.length);
    expect(out.some((r) => r.frontIp === '1.2.3.4')).toBe(true);
    expect(out.every((r) => (r.sni || r.host).includes('example.workers.dev') || !r.frontIp)).toBe(true);

    const route = out.find((r) => r.frontIp === '1.2.3.4')!;
    const fronted = { ...user, routes: [route] };
    const formats = buildFormats(ctx(fronted), ['raw', 'clash', 'singbox']);
    expect(formats[0]!.payload).toContain('@1.2.3.4:');
    expect(formats[0]!.payload).toContain('sni=edge-1.example.workers.dev');
    expect(formats[0]!.payload).toContain('host=edge-1.example.workers.dev');
    expect(formats[1]!.payload).toContain('server: "1.2.3.4"');
    expect(formats[1]!.payload).toContain('servername: "edge-1.example.workers.dev"');
    const singbox = JSON.parse(formats[2]!.payload);
    const singboxRoute = singbox.outbounds.find((item: any) => item.type === 'vless');
    expect(singboxRoute.server).toBe('1.2.3.4');
    expect(singboxRoute.tls.server_name).toBe('edge-1.example.workers.dev');
    expect(singboxRoute.transport.headers.Host).toBe('edge-1.example.workers.dev');

    const iron = buildIronPack(ctx(fronted), 2);
    const xray = JSON.parse(iron.find((profile) => profile.client === 'xray')!.json);
    const xrayRoute = xray.outbounds.find((item: any) => item.protocol === 'vless');
    expect(xrayRoute.settings.vnext[0].address).toBe('1.2.3.4');
    expect(xrayRoute.streamSettings.tlsSettings.serverName).toBe('edge-1.example.workers.dev');
    const ironSingBox = JSON.parse(iron.find((profile) => profile.client === 'singbox')!.json);
    const ironRoute = ironSingBox.outbounds.find((item: any) => item.type === 'vless');
    expect(ironRoute.server).toBe('1.2.3.4');
    expect(ironRoute.tls.server_name).toBe('edge-1.example.workers.dev');
    expect(CLEAN_IP_CATALOG.length).toBeGreaterThan(10);
    expect(CLEAN_IP_CATALOG.every((item) => isCloudflareIpv4Candidate(item.ip))).toBe(true);
    expect(isCloudflareIpv4Candidate('8.8.8.8')).toBe(false);
  });

  it('rotates a client-safe Anycast window without invalidating stored paths', () => {
    const user = userFixture({
      routes: routesFor('u'.repeat(24), undefined, 20),
      dynamicPool: true,
      rotationMinutes: 1,
      poolCleanIps: ['162.159.36.1', '104.16.132.229', '8.8.8.8'],
    });
    const first = rollingRouteWindow(user, 120_000);
    const second = rollingRouteWindow(user, 180_000);
    expect(first.enabled).toBe(true);
    expect(first.routes).toHaveLength(20);
    expect(first.routes[0]!.frontIp).toBeUndefined();
    expect(first.routes[10]!.frontIp).toBeUndefined();
    expect(first.routes.filter((route) => route.frontIp).length).toBeGreaterThan(15);
    expect(first.routes.every((route) => user.routes.some((stored) => stored.path === route.path))).toBe(true);
    expect(first.routes.map((route) => route.path)).not.toEqual(second.routes.map((route) => route.path));
    expect(first.routes.some((route) => route.frontIp === '8.8.8.8')).toBe(false);
    expect(first.nextRotationAt).toBe(180_000);
  });

  it('keeps fixed subscriptions unchanged by rolling-window logic', () => {
    const user = userFixture({ dynamicPool: false, rotationMinutes: 1 });
    const window = rollingRouteWindow(user, 120_000);
    expect(window.enabled).toBe(false);
    expect(window.routes).toEqual(user.routes);
  });

  it('iron pack puts every route into each aggregate JSON profile', () => {
    const user = userFixture();
    const pack = buildIronPack(ctx(user), 5);
    expect(pack.length).toBe(5);
    expect(CLEAN_IP_CATALOG.length).toBeGreaterThan(3);
    for (const p of pack) {
      expect(p.json.length).toBeGreaterThan(20);
      const doc = JSON.parse(p.json);
      if (p.client === 'xray') {
        expect(doc.outbounds.filter((x: any) => x.protocol === 'vless')).toHaveLength(user.routes.length);
        expect(doc.routing.balancers[0].strategy.type).toBe('leastPing');
        expect(doc.routing.balancers[0].selector).toHaveLength(user.routes.length);
        expect(doc.observatory.subjectSelector).toHaveLength(user.routes.length);
      } else {
        expect(doc.outbounds.filter((x: any) => x.type === 'vless')).toHaveLength(user.routes.length);
        expect(doc.outbounds.find((x: any) => x.type === 'urltest').outbounds).toHaveLength(user.routes.length);
      }
    }
  });

  it('builds one Xray IRON aggregate with 200 selectable routes', () => {
    const user = userFixture({
      id: 'a'.repeat(24),
      routes: routesFor('a'.repeat(24), undefined, 200),
      speedPreset: 'god',
    });
    const iron = buildIronPack(ctx(user), 1)[0]!;
    expect(iron.client).toBe('xray');
    expect(iron.name).toContain('200 ROUTES');
    const doc = JSON.parse(iron.json);
    expect(doc.outbounds.filter((x: any) => x.protocol === 'vless')).toHaveLength(200);
    expect(doc.routing.balancers[0].selector).toHaveLength(200);
    expect(doc.routing.rules.at(-1).balancerTag).toBe('AMINCK-IRON-AUTO');
  });

  it('expandRoutesMultiPort multiplies ports Zooz/BPB style', () => {
    const user = userFixture();
    const expanded = expandRoutesMultiPort(user.routes, [443, 2053, 2083]);
    expect(expanded.length).toBe(user.routes.length * 3);
    expect(new Set(expanded.map((r) => r.port)).size).toBe(3);
  });
});
