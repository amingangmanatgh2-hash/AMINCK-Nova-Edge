/**
 * EDGE PANEL — subscription / config builder.
 * Pure module. Produces:
 *   - VLESS URI lines (raw + V2Ray base64)
 *   - Clash Meta YAML with NOVA-AUTO / NOVA-FALLBACK / NOVA-BALANCE / NOVA-SMART
 *   - sing-box JSON with TUN + Mixed + DoH + smart routing + fragment
 *
 * Transport tuning: random path padding, path jitter, operator-owned Host
 * aliases, optional multi-port and opt-in client-compatible TLS fragment hints.
 */
import type {
  AntiDetectSettings,
  BuiltConfig,
  ConfigFormat,
  Endpoint,
  Fingerprint,
  PanelSettings,
  ProfileMode,
  Route,
  SpeedPreset,
  SpeedSpec,
  User,
} from './types';
import {
  CLOUDFLARE_TLS_PORTS,
  DEFAULT_ANTI_DETECT,
  DEFAULT_HOST_ALIASES,
  FINGERPRINTS,
  SPEED_PRESETS,
} from './types';
import { base64Encode, clamp } from './utils';

export const APP_NAME = 'AMINNOVA';
export const BRAND = 'AMINCK GOD Edition';
export const DEFAULT_NAME_TEMPLATE = '{brand} AMINCK {profile} {index}';
export const DEFAULT_DOH = 'https://cloudflare-dns.com/dns-query';
export const DEFAULT_DOH_ALT = [
  'https://one.one.one.one/dns-query',
  'https://dns.google/dns-query',
];

// ---------------------------------------------------------------------------
// Naming
// ---------------------------------------------------------------------------

export function profileLabel(mode: ProfileMode): string {
  if (mode === 'fallback') return 'Fallback';
  if (mode === 'balance') return 'Balance';
  return 'Auto';
}

export interface NameVars {
  brand: string;
  app?: string;
  user?: string;
  profile?: ProfileMode;
  index?: number;
  endpoint?: string;
  port?: number;
}

/** Render a config-name template. Unknown variables stay untouched. */
export function renderConfigName(template: string, vars: NameVars): string {
  const app = vars.app ?? APP_NAME;
  const brand = vars.brand || BRAND;
  const profile = vars.profile ? profileLabel(vars.profile) : '';
  const endpoint = vars.endpoint ?? '';
  const port = vars.port ?? 443;
  return (template || DEFAULT_NAME_TEMPLATE)
    .replaceAll('{brand}', brand)
    .replaceAll('{app}', app)
    .replaceAll('{user}', vars.user ?? '')
    .replaceAll('{profile}', profile)
    .replaceAll('{index}', String(vars.index ?? ''))
    .replaceAll('{endpoint}', endpoint)
    .replaceAll('{port}', String(port))
    .replace(/\s+/g, ' ')
    .trim();
}

const ALLOWED_TEMPLATE_VARS = new Set(['brand', 'app', 'user', 'profile', 'index', 'endpoint', 'port']);

export function validateNameTemplate(
  template: string,
): { ok: true; value: string } | { ok: false; error: string } {
  if (template.length > 200) return { ok: false, error: 'قالب نام خیلی طولانی است (حداکثر ۲۰۰ کاراکتر)' };
  const re = /\{([a-zA-Z]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template)) !== null) {
    if (!ALLOWED_TEMPLATE_VARS.has(m[1]!)) {
      return { ok: false, error: `متغیر ناشناخته در قالب: ${m[1]}` };
    }
  }
  return { ok: true, value: template };
}

export function fingerprintName(fp: Fingerprint): string {
  return FINGERPRINTS.includes(fp) ? fp : 'chrome';
}

/** Validate a TLS port list for the settings page. */
export function validateTlsPorts(ports: number[]): { ok: true; value: number[] } | { ok: false; error: string } {
  if (ports.length === 0) return { ok: false, error: 'حداقل یک پورت TLS لازم است' };
  const uniq = [...new Set(ports)].sort((a, b) => a - b);
  for (const p of uniq) {
    if (!Number.isInteger(p) || p < 1 || p > 65535) return { ok: false, error: `پورت نامعتبر: ${p}` };
    if (!CLOUDFLARE_TLS_PORTS.includes(p)) {
      return { ok: false, error: `پورت ${p} جزو پورتهای TLS مجاز کلودفلر نیست` };
    }
  }
  return { ok: true, value: uniq };
}

// ---------------------------------------------------------------------------
// Anti-detect helpers
// ---------------------------------------------------------------------------

const SLUG_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function randomSlug(len = 8): string {
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  let out = '';
  for (let i = 0; i < len; i++) out += SLUG_ALPHABET[buf[i]! % SLUG_ALPHABET.length];
  return out;
}

/** Cryptographic random int in [lo, hi] inclusive. */
export function randomInt(lo: number, hi: number): number {
  if (hi <= lo) return lo;
  const span = hi - lo + 1;
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return lo + (buf[0]! % span);
}

export function randomPadding(len = 16): string {
  return randomSlug(clamp(len, 4, 48));
}

export function resolveAntiDetect(settings?: PanelSettings | null): AntiDetectSettings {
  const base = settings?.antiDetect;
  return {
    pathPadding: base?.pathPadding ?? DEFAULT_ANTI_DETECT.pathPadding,
    pathJitter: base?.pathJitter ?? DEFAULT_ANTI_DETECT.pathJitter,
    fragment: base?.fragment ?? DEFAULT_ANTI_DETECT.fragment,
    fragmentLength: base?.fragmentLength ?? DEFAULT_ANTI_DETECT.fragmentLength,
    fragmentInterval: base?.fragmentInterval ?? DEFAULT_ANTI_DETECT.fragmentInterval,
    hostCamouflage: base?.hostCamouflage ?? DEFAULT_ANTI_DETECT.hostCamouflage,
    multiPort: base?.multiPort ?? DEFAULT_ANTI_DETECT.multiPort,
  };
}

export function hostAliasList(settings?: PanelSettings | null): string[] {
  const endpointHosts = new Set((settings?.endpoints ?? []).map((e) => e.host.toLowerCase()));
  const list = settings?.hostAliases?.filter(
    (d) => typeof d === 'string' && d.length > 0 && endpointHosts.has(d.toLowerCase()),
  ) ?? [];
  return list.length > 0 ? [...new Set(list)] : [...DEFAULT_HOST_ALIASES];
}

export function pickHostAlias(settings: PanelSettings | null | undefined, index: number): string | undefined {
  const list = hostAliasList(settings);
  return list.length > 0 ? list[index % list.length] : undefined;
}

/**
 * URL path a client connects to: `/e<slug><userId-hex>`.
 * With jitter enabled the slug length varies (6–12) so DPI path fingerprints scatter.
 */
export function makeRoutePath(userId: string, slug: string): string {
  return `/e${slug}${userId.replace(/-/g, '')}`;
}

/** Build a fresh random path for a user, honouring anti-detect jitter. */
export function makeRandomRoutePath(userId: string, anti?: AntiDetectSettings, seq = 0): string {
  const a = anti ?? DEFAULT_ANTI_DETECT;
  const baseLen = 6 + (seq % 3);
  const len = a.pathJitter ? randomInt(6, 12) : baseLen;
  return makeRoutePath(userId, randomSlug(len));
}

// ---------------------------------------------------------------------------
// Route generation
// ---------------------------------------------------------------------------

export interface RoutePlan {
  endpoint: Endpoint;
  index: number;
  port?: number;
}

/** Distribute `paths` routes across the given endpoints (round-robin). */
export function planRoutes(endpoints: Endpoint[], paths: number): RoutePlan[] {
  const list: RoutePlan[] = [];
  const n = clamp(paths, 1, 200);
  if (endpoints.length === 0) return list;
  for (let i = 0; i < n; i++) {
    const ep = endpoints[i % endpoints.length]!;
    list.push({ endpoint: ep, index: i + 1 });
  }
  return list;
}

/**
 * Zooz/BPB-style multi-port plan: expand each logical path across selected
 * TLS ports (capped so total routes never exceed 200).
 */
export function planRoutesMultiPort(
  endpoints: Endpoint[],
  paths: number,
  ports: number[],
): RoutePlan[] {
  const validPorts = (ports.length > 0 ? ports : [443]).filter((p) =>
    CLOUDFLARE_TLS_PORTS.includes(p),
  );
  const portList = validPorts.length > 0 ? validPorts : [443];
  const base = planRoutes(endpoints, paths);
  if (portList.length <= 1) {
    return base.map((p) => ({ ...p, port: portList[0] ?? p.endpoint.port }));
  }
  const out: RoutePlan[] = [];
  let idx = 0;
  for (const plan of base) {
    for (const port of portList) {
      if (out.length >= 200) return out;
      idx += 1;
      out.push({ endpoint: plan.endpoint, index: idx, port });
    }
  }
  return out;
}

/**
 * Expand stored routes across selected TLS ports for subscription output
 * (Zooz/BPB style). Cap at 200 emitted proxies. Does NOT mutate storage.
 */
export function expandRoutesMultiPort(routes: Route[], ports: number[]): Route[] {
  const valid = (ports.length > 0 ? ports : [443]).filter((p) => CLOUDFLARE_TLS_PORTS.includes(p));
  const portList = valid.length > 0 ? valid : [443];
  if (portList.length <= 1) {
    return routes.map((r) => ({ ...r, port: portList[0] ?? r.port }));
  }
  const out: Route[] = [];
  let idx = 0;
  for (const r of routes) {
    for (const port of portList) {
      if (out.length >= 200) return out;
      idx += 1;
      out.push({ ...r, port, index: idx });
    }
  }
  return out;
}

/** Create Route objects from a plan (each call gets fresh random paths). */
export function buildRoutes(
  userId: string,
  plan: RoutePlan[],
  settings?: PanelSettings | null,
): Route[] {
  const anti = resolveAntiDetect(settings);
  const fakes = hostAliasList(settings);
  let seq = 0;
  return plan.map((p) => {
    seq += 1;
    const port = p.port && p.port > 0 ? p.port : p.endpoint.port > 0 ? p.endpoint.port : 443;
    const path = makeRandomRoutePath(userId, anti, seq);
    const wsHost = anti.hostCamouflage && fakes.length > 0 ? fakes[(seq - 1) % fakes.length]! : p.endpoint.host;
    const padding = anti.pathPadding ? randomPadding(randomInt(8, 20)) : undefined;
    return {
      path,
      endpointId: p.endpoint.id,
      host: p.endpoint.host,
      port,
      index: p.index,
      sni: p.endpoint.host,
      wsHost,
      padding,
    };
  });
}

// ---------------------------------------------------------------------------
// VLESS URI
// ---------------------------------------------------------------------------

export function vlessUriFor(user: User, route: Route, o: UriOptions): string {
  const wsHost = route.wsHost || route.host;
  const addr = route.frontIp || route.host;
  const sni = route.sni || route.host;
  const pathWithPad =
    o.padding && route.padding
      ? `${route.path}?ed=${o.earlyData}&pad=${route.padding}`
      : route.path;
  const params = [
    ['encryption', 'none'],
    ['security', 'tls'],
    ['sni', sni],
    ['fp', fingerprintName(o.fingerprint)],
    ['type', 'ws'],
    ['host', wsHost],
    ['path', encodeURIComponent(pathWithPad)],
    ['alpn', encodeURIComponent('http/1.1')],
  ];
  params.push(['ed', String(o.earlyData)]);
  params.push(['allowInsecure', '0']);
  if (o.fragment) {
    const fl = o.fragmentLength ?? [50, 120];
    const fi = o.fragmentInterval ?? [10, 20];
    params.push(['fragment', `${fl[0]}-${fl[1]},${fi[0]}-${fi[1]},tlshello`]);
  }
  const query = params.map(([k, v]) => `${k}=${v}`).join('&');
  const frag = encodeURIComponent(o.name).replace(/%20/g, ' ');
  return `vless://${user.uuid}@${addr}:${route.port}?${query}#${frag}`;
}

export interface UriOptions {
  fingerprint: Fingerprint;
  earlyData: number;
  name: string;
  padding?: boolean;
  fragment?: boolean;
  fragmentLength?: [number, number];
  fragmentInterval?: [number, number];
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function yamlStr(s: string): string {
  return JSON.stringify(s);
}

function yamlList(items: string[]): string {
  return `[${items.map((n) => yamlStr(n)).join(', ')}]`;
}

const PRIVATE_V4_CIDRS = [
  '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16',
  '172.16.0.0/12', '192.168.0.0/16', '192.0.0.0/24', '192.0.2.0/24',
  '198.18.0.0/15', '198.51.100.0/24', '203.0.113.0/24',
];
const PRIVATE_V6_CIDRS = ['::1/128', 'fc00::/7', 'fe80::/10', 'ff00::/8', '2001:db8::/32'];

export function privateCidrs(): { v4: string[]; v6: string[] } {
  return { v4: [...PRIVATE_V4_CIDRS], v6: [...PRIVATE_V6_CIDRS] };
}

function healthUrlFor(settings: PanelSettings, firstRoute?: Route): string {
  if (settings.healthUrl && settings.healthUrl.length > 0) return settings.healthUrl;
  if (firstRoute) return `https://${firstRoute.host}/healthz`;
  return 'https://www.gstatic.com/generate_204';
}

export function subUrlFor(token: string, host: string): string {
  return `https://${host}/sub/${token}`;
}

// ---------------------------------------------------------------------------
// Build context
// ---------------------------------------------------------------------------

export interface BuildContext {
  user: User;
  settings: PanelSettings;
  speedPreset: SpeedPreset;
  fingerprint: Fingerprint;
  profileMode: ProfileMode;
  nameTemplate: string;
  hostForSub: string;
}

interface RouteNames {
  names: string[];
  health: string;
}

function routeNames(ctx: BuildContext): RouteNames {
  const brand = ctx.settings.brand || BRAND;
  const names = ctx.user.routes.map((r) =>
    renderConfigName(ctx.nameTemplate, {
      brand,
      app: APP_NAME,
      user: ctx.user.name,
      profile: ctx.profileMode,
      index: r.index,
      endpoint: `${r.host}:${r.port}`,
      port: r.port,
    }),
  );
  return { names, health: healthOrDefault(ctx.settings, ctx.user.routes[0]) };
}

function buildVlessLines(ctx: BuildContext, speed: SpeedSpec): {
  lines: string[];
  names: string[];
} {
  const { names } = routeNames(ctx);
  const anti = resolveAntiDetect(ctx.settings);
  const lines = ctx.user.routes.map((r, i) =>
    vlessUriFor(ctx.user, r, {
      fingerprint: ctx.fingerprint,
      earlyData: speed.earlyData,
      name: names[i]!,
      padding: anti.pathPadding,
      fragment: anti.fragment,
      fragmentLength: anti.fragmentLength,
      fragmentInterval: anti.fragmentInterval,
    }),
  );
  return { lines, names };
}

// ---------------------------------------------------------------------------
// Clash Meta YAML
// ---------------------------------------------------------------------------

export function buildClashYaml(ctx: BuildContext): string {
  const speed = SPEED_PRESETS[ctx.speedPreset];
  const { names, health } = routeNames(ctx);
  const fp = fingerprintName(ctx.fingerprint);
  const anti = resolveAntiDetect(ctx.settings);
  const lines: string[] = [];
  lines.push(
    'mixed-port: 7890',
    'socks-port: 10808',
    'port: 10809',
    'allow-lan: false',
    'mode: rule',
    'log-level: info',
    'ipv6: false',
    'unified-delay: true',
    'find-process-mode: off',
    'cache-file: "edge-cache.db"',
    'profile:',
    '  store-selected: true',
    '  store-fake-ip: false',
    '',
    'proxies:',
  );
  ctx.user.routes.forEach((r, i) => {
    const wsHost = r.wsHost || r.host;
    const server = r.frontIp || r.host;
    const sni = r.sni || r.host;
    const wsPath =
      anti.pathPadding && r.padding
        ? `${r.path}?ed=${speed.earlyData}&pad=${r.padding}`
        : r.path;
    lines.push(
      `  - name: ${yamlStr(names[i]!)}`,
      '    type: vless',
      `    server: ${yamlStr(server)}`,
      `    port: ${r.port}`,
      `    uuid: ${yamlStr(ctx.user.uuid)}`,
      '    network: ws',
      '    tls: true',
      `    servername: ${yamlStr(sni)}`,
      '    alpn: [http/1.1]',
      '    udp: true',
      `    client-fingerprint: ${fp}`,
      '    ws-opts:',
      `      path: ${yamlStr(wsPath)}`,
      '      headers:',
      `        Host: ${yamlStr(wsHost)}`,
      '        User-Agent: "Mozilla/5.0"',
    );
    if (speed.tcpConcurrent) lines.push('    tcp-concurrent: true');
    if (speed.earlyData > 0) {
      lines.push(`    max-early-data: ${speed.earlyData}`, '    early-data-header-name: Sec-WebSocket-Protocol');
    }
    // Mihomo has no portable VLESS TLS-fragment field. Do not emit fork-only
    // keys that make otherwise valid subscriptions fail to import.
    lines.push('');
  });

  lines.push(
    'proxy-groups:',
    '  - name: NOVA-AUTO',
    '    type: url-test',
    `    url: ${yamlStr(health)}`,
    `    interval: ${speed.healthInterval}`,
    `    tolerance: ${speed.tolerance}`,
    `    proxies: ${yamlList(names)}`,
    '  - name: NOVA-FALLBACK',
    '    type: fallback',
    `    url: ${yamlStr(health)}`,
    `    interval: ${speed.healthInterval}`,
    `    proxies: ${yamlList(['NOVA-AUTO', ...names])}`,
    '  - name: NOVA-BALANCE',
    '    type: load-balance',
    `    url: ${yamlStr(health)}`,
    `    interval: ${speed.healthInterval}`,
    '    strategy: consistent-hashing',
    `    proxies: ${yamlList(names)}`,
    '  - name: NOVA-SMART',
    '    type: select',
    `    proxies: ${yamlList(['NOVA-AUTO', 'NOVA-FALLBACK', 'NOVA-BALANCE', 'AMINCK-MULTI', ...names])}`,
    '  - name: AMINCK-MULTI',
    '    type: load-balance',
    `    url: ${yamlStr(health)}`,
    `    interval: ${speed.healthInterval}`,
    '    strategy: consistent-hashing',
    `    proxies: ${yamlList(names)}`,
    '  - name: AMINCK-YOUTUBE',
    '    type: url-test',
    `    url: ${yamlStr(health)}`,
    `    interval: ${speed.healthInterval}`,
    `    tolerance: ${speed.tolerance}`,
    `    proxies: ${yamlList(names)}`,
    '  - name: AMINCK-INSTA',
    '    type: url-test',
    `    url: ${yamlStr(health)}`,
    `    interval: ${speed.healthInterval}`,
    `    tolerance: ${speed.tolerance}`,
    `    proxies: ${yamlList(names)}`,
    '  - name: AMINCK-TIKTOK',
    '    type: url-test',
    `    url: ${yamlStr(health)}`,
    `    interval: ${speed.healthInterval}`,
    `    tolerance: ${speed.tolerance}`,
    `    proxies: ${yamlList(names)}`,
    '  - name: AMINCK-TUNNEL',
    '    type: fallback',
    `    url: ${yamlStr(health)}`,
    `    interval: ${speed.healthInterval}`,
    `    proxies: ${yamlList(['NOVA-AUTO', 'NOVA-FALLBACK', ...names])}`,
    '',
    'rules:',
    '  - DOMAIN-SUFFIX,youtube.com,AMINCK-YOUTUBE',
    '  - DOMAIN-SUFFIX,googlevideo.com,AMINCK-YOUTUBE',
    '  - DOMAIN-SUFFIX,instagram.com,AMINCK-INSTA',
    '  - DOMAIN-SUFFIX,cdninstagram.com,AMINCK-INSTA',
    '  - DOMAIN-SUFFIX,tiktok.com,AMINCK-TIKTOK',
    '  - DOMAIN-SUFFIX,tiktokcdn.com,AMINCK-TIKTOK',
    '  - MATCH,NOVA-SMART',
    '',
  );
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// sing-box JSON
// ---------------------------------------------------------------------------

export function buildSingBoxJson(ctx: BuildContext): string {
  const speed = SPEED_PRESETS[ctx.speedPreset];
  const { names } = routeNames(ctx);
  const fp = fingerprintName(ctx.fingerprint);
  const anti = resolveAntiDetect(ctx.settings);
  const outbounds: Record<string, unknown>[] = ctx.user.routes.map((r, i) => {
    const wsHost = r.wsHost || r.host;
    const wsPath =
      anti.pathPadding && r.padding
        ? `${r.path}?ed=${speed.earlyData}&pad=${r.padding}`
        : r.path;
    const ob: Record<string, unknown> = {
      type: 'vless',
      tag: names[i]!,
      server: r.frontIp || r.host,
      server_port: r.port,
      uuid: ctx.user.uuid,
      flow: '',
      tls: {
        enabled: true,
        server_name: r.sni || r.host,
        insecure: false,
        alpn: ['http/1.1'],
        utls: { enabled: true, fingerprint: fp === 'random' ? 'random' : fp },
      },
      transport: {
        type: 'ws',
        path: wsPath,
        headers: {
          Host: wsHost,
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        },
        max_early_data: speed.earlyData,
        early_data_header_name: 'Sec-WebSocket-Protocol',
      },
    };
    if (anti.fragment) {
      // Official sing-box outbound TLS fields. Kept opt-in because older mobile
      // clients may not know these keys.
      ob.tls = {
        ...(ob.tls as object),
        fragment: true,
        fragment_fallback_delay: `${anti.fragmentInterval[0]}ms`,
        record_fragment: true,
      };
      ob.multiplex = { enabled: false };
    }
    return ob;
  });
  outbounds.push(
    {
      type: 'urltest',
      tag: 'NOVA-AUTO',
      outbounds: names,
      url: healthOrDefault(ctx.settings, ctx.user.routes[0]),
      interval: `${speed.healthInterval}s`,
      tolerance: speed.tolerance,
    },
    {
      type: 'selector',
      tag: 'NOVA-SMART',
      outbounds: ['NOVA-AUTO', ...names, 'direct'],
      default: 'NOVA-AUTO',
    },
    { type: 'direct', tag: 'direct' },
    { type: 'block', tag: 'block' },
  );
  const dohServers: Array<Record<string, unknown>> = [
    { tag: 'doh-main', address: ctx.settings.doh || DEFAULT_DOH, detour: 'NOVA-SMART' },
  ];
  for (const alt of ctx.settings.dohAlt ?? []) {
    dohServers.push({ tag: `doh-alt-${dohServers.length}`, address: alt, detour: 'NOVA-SMART' });
  }
  const doc: Record<string, unknown> = {
    log: { level: 'warn', timestamp: true },
    dns: {
      servers: dohServers,
      strategy: 'prefer_ipv4',
      disable_cache: false,
    },
    inbounds: [
      {
        type: 'tun',
        tag: 'tun-in',
        interface_name: 'EdgeTun',
        address: ['172.19.0.1/30', 'fd00::1/126'],
        mtu: 1500,
        auto_route: true,
        strict_route: true,
        stack: 'system',
      },
      { type: 'mixed', tag: 'mixed-in', listen: '127.0.0.1', listen_port: 2080 },
      { type: 'socks', tag: 'aminck-in', listen: '127.0.0.1', listen_port: 10808, udp: true },
    ],
    outbounds,
    route: {
      final: 'NOVA-SMART',
      rules: [
        { ip_cidr: PRIVATE_V4_CIDRS, outbound: 'direct' },
        { ip_cidr: PRIVATE_V6_CIDRS, outbound: 'direct' },
        { domain_suffix: ['local', 'lan', 'localhost'], outbound: 'direct' },
      ],
    },
  };
  return JSON.stringify(doc, null, 2);
}

// ---------------------------------------------------------------------------
// V2Ray / raw / public entry
// ---------------------------------------------------------------------------

function buildV2ray(ctx: BuildContext): { b64: string; raw: string } {
  const speed = SPEED_PRESETS[ctx.speedPreset];
  const { lines } = buildVlessLines(ctx, speed);
  return { b64: base64Encode(lines.join('\n')), raw: lines.join('\n') };
}

export function subPayloads(
  ctx: BuildContext,
): Record<'v2ray' | 'raw' | 'clash' | 'singbox', string> {
  return {
    v2ray: buildV2ray(ctx).b64,
    raw: buildV2ray(ctx).raw,
    clash: buildClashYaml(ctx),
    singbox: buildSingBoxJson(ctx),
  };
}

export function buildFormats(
  ctx: BuildContext,
  formats: ConfigFormat[],
): BuiltConfig[] {
  const all = subPayloads(ctx);
  return formats.map((format) => ({
    format,
    paths: ctx.user.routes.length,
    requestedPaths: ctx.user.routes.length,
    truncated: false,
    payload: all[format],
    user: {
      id: ctx.user.id,
      name: ctx.user.name,
      uuid: ctx.user.uuid,
      token: ctx.user.token,
      subUrl: subUrlFor(ctx.user.token, ctx.hostForSub),
      profileMode: ctx.profileMode,
      speedPreset: ctx.speedPreset,
      fingerprint: ctx.fingerprint,
    },
  }));
}

export function buildOne(ctx: BuildContext, format: ConfigFormat): BuiltConfig {
  return buildFormats(ctx, [format])[0]!;
}

/**
 * Cloudflare anycast front candidates. They are never auto-injected: reachability
 * is ISP/location-specific and a static list cannot honestly be called clean.
 * Operators should test candidates from the actual client network first.
 */
export const CLEAN_IP_CATALOG: Array<{ ip: string; label: string; region: string }> = [
  { ip: '162.159.36.1', label: 'CF anycast A', region: 'anycast' },
  { ip: '162.159.46.1', label: 'CF anycast B', region: 'anycast' },
  { ip: '162.159.137.4', label: 'CF anycast C', region: 'anycast' },
  { ip: '162.159.152.4', label: 'CF anycast D', region: 'anycast' },
  { ip: '172.67.68.93', label: 'CF edge 67a', region: 'anycast' },
  { ip: '172.67.74.226', label: 'CF edge 67b', region: 'anycast' },
  { ip: '104.16.132.229', label: 'CF 104-16a', region: 'anycast' },
  { ip: '104.16.133.229', label: 'CF 104-16b', region: 'anycast' },
  { ip: '104.17.148.22', label: 'CF 104-17a', region: 'anycast' },
  { ip: '104.17.149.22', label: 'CF 104-17b', region: 'anycast' },
  { ip: '104.18.2.2', label: 'CF 104-18a', region: 'anycast' },
  { ip: '104.18.32.7', label: 'CF 104-18b', region: 'anycast' },
  { ip: '104.21.45.12', label: 'CF 104-21', region: 'anycast' },
  { ip: '104.24.0.5', label: 'CF 104-24', region: 'anycast' },
  { ip: '188.114.96.2', label: 'CF 188-96', region: 'anycast' },
  { ip: '188.114.97.2', label: 'CF 188-97', region: 'anycast' },
  { ip: '190.93.244.59', label: 'CF 190', region: 'anycast' },
  { ip: '197.234.240.1', label: 'CF 197', region: 'anycast' },
];

/** Front a copy of each route through clean IPs (SNI stays Worker host). */
export function expandTunnelFronts(routes: Route[], ips: string[], cap = 200): Route[] {
  const clean = ips.map((x) => x.trim()).filter((x) => /^\d+\.\d+\.\d+\.\d+$/.test(x));
  if (clean.length === 0) return routes;
  const out: Route[] = [...routes];
  let idx = routes.length;
  for (const r of routes) {
    for (const ip of clean) {
      if (out.length >= cap) return out;
      idx += 1;
      out.push({ ...r, frontIp: ip, index: idx, sni: r.sni || r.host });
    }
  }
  return out;
}

/** Xray / V2RayNG / MahsaNG / NapsternetV compatible outbound JSON. */
export function buildXrayJson(ctx: BuildContext): string {
  const speed = SPEED_PRESETS[ctx.speedPreset];
  const { names } = routeNames(ctx);
  const fp = fingerprintName(ctx.fingerprint);
  const anti = resolveAntiDetect(ctx.settings);
  const outbounds = ctx.user.routes.map((r, i) => {
    const wsHost = r.wsHost || r.host;
    const wsPath =
      anti.pathPadding && r.padding
        ? `${r.path}?ed=${speed.earlyData}&pad=${r.padding}`
        : r.path;
    return {
      tag: names[i]!,
      protocol: 'vless',
      settings: {
        vnext: [
          {
            address: r.frontIp || r.host,
            port: r.port,
            users: [{ id: ctx.user.uuid, encryption: 'none', flow: '' }],
          },
        ],
      },
      streamSettings: {
        network: 'ws',
        security: 'tls',
        tlsSettings: { serverName: r.host, fingerprint: fp, allowInsecure: false },
        wsSettings: {
          path: wsPath,
          headers: { Host: wsHost },
          maxEarlyData: speed.earlyData,
          earlyDataHeaderName: 'Sec-WebSocket-Protocol',
        },
      },
    };
  });
  const doc = {
    remarks: `${ctx.settings.brand || BRAND} IRON`,
    log: { loglevel: 'warning' },
    inbounds: [{ port: 10808, listen: '127.0.0.1', protocol: 'socks', settings: { udp: true } }],
    outbounds: [
      ...outbounds,
      { tag: 'direct', protocol: 'freedom' },
      { tag: 'block', protocol: 'blackhole' },
    ],
    routing: {
      domainStrategy: 'IPIfNonMatch',
      rules: [
        { type: 'field', ip: ['geoip:private'], outboundTag: 'direct' },
        { type: 'field', network: 'tcp,udp', outboundTag: names[0] || 'direct' },
      ],
    },
  };
  return JSON.stringify(doc, null, 2);
}

/**
 * Iron pack: 1–5 standalone JSON profiles (Xray + sing-box) for V2Box,
 * V2RayNG, MahsaNG, NapsternetV. Each profile uses a different speed/port mix.
 */
export function buildIronPack(ctx: BuildContext, count: number): Array<{
  index: number;
  name: string;
  client: string;
  json: string;
}> {
  const n = clamp(Math.floor(count) || 1, 1, 5);
  const presets: SpeedPreset[] = ['god', 'turbo', 'balanced', 'god', 'turbo'];
  const clients = ['xray', 'singbox', 'xray', 'singbox', 'xray'];
  const pack: Array<{ index: number; name: string; client: string; json: string }> = [];
  for (let i = 0; i < n; i++) {
    const sliceRoutes = ctx.user.routes.slice(0, Math.max(1, Math.min(ctx.user.routes.length, i + 1)));
    const view: User = { ...ctx.user, routes: sliceRoutes, speedPreset: presets[i]! };
    const sub: BuildContext = { ...ctx, user: view, speedPreset: presets[i]! };
    const name = `${ctx.settings.brand || BRAND} IRON ${i + 1}`;
    const json = clients[i] === 'singbox' ? buildSingBoxJson(sub) : buildXrayJson(sub);
    pack.push({ index: i + 1, name, client: clients[i]!, json });
  }
  return pack;
}

export function healthOrDefault(settings: PanelSettings, firstRoute?: Route): string {
  return healthUrlFor(settings, firstRoute);
}

export interface BuiltPayload {
  format: ConfigFormat;
  paths: number;
  requestedPaths: number;
  truncated: boolean;
  payload: string;
  user: {
    id: string;
    name: string;
    uuid: string;
    token: string;
    subUrl: string;
    profileMode: ProfileMode;
    speedPreset: SpeedPreset;
    fingerprint: Fingerprint;
  };
}
