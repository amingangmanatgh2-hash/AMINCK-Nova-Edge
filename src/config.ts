/**
 * AMINCK Nova Edge — subscription / config builder.
 * Pure module. Produces:
 *   - VLESS URI lines (raw + V2Ray base64)
 *   - Clash Meta YAML with NOVA-AUTO / NOVA-FALLBACK / NOVA-BALANCE / NOVA-SMART
 *   - sing-box JSON with TUN + Mixed + DoH + smart routing
 */
import type {
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
import { CLOUDFLARE_TLS_PORTS, FINGERPRINTS, SPEED_PRESETS } from './types';
import { base64Encode, clamp } from './utils';

export const APP_NAME = 'AMINCK Nova Edge';
export const BRAND = 'AMINCK';
export const DEFAULT_NAME_TEMPLATE = '{brand} {profile} {index}';
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
// Route generation
// ---------------------------------------------------------------------------

const SLUG_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function randomSlug(len = 8): string {
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  let out = '';
  for (let i = 0; i < len; i++) out += SLUG_ALPHABET[buf[i]! % SLUG_ALPHABET.length];
  return out;
}

/** URL path a client connects to: `/e<slug><userId-hex>` — unique per route. */
export function makeRoutePath(userId: string, slug: string): string {
  return `/e${slug}${userId.replace(/-/g, '')}`;
}

export interface RoutePlan {
  endpoint: Endpoint;
  index: number;
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

/** Create Route objects from a plan (each call gets fresh random paths). */
export function buildRoutes(userId: string, plan: RoutePlan[]): Route[] {
  let seq = 0;
  return plan.map((p) => {
    seq += 1;
    const port = p.endpoint.port > 0 ? p.endpoint.port : 443;
    return {
      path: makeRoutePath(userId, randomSlug(6 + (seq % 3))),
      endpointId: p.endpoint.id,
      host: p.endpoint.host,
      port,
      index: p.index,
      sni: p.endpoint.host,
    };
  });
}

// ---------------------------------------------------------------------------
// VLESS URI
// ---------------------------------------------------------------------------

export function vlessUriFor(user: User, route: Route, o: UriOptions): string {
  const params = [
    ['encryption', 'none'],
    ['security', 'tls'],
    ['sni', route.host],
    ['fp', fingerprintName(o.fingerprint)],
    ['type', 'ws'],
    ['host', route.host],
    ['path', encodeURIComponent(route.path)],
  ];
  params.push(['ed', String(o.earlyData)]);
  params.push(['allowInsecure', '0']);
  const query = params.map(([k, v]) => `${k}=${v}`).join('&');
  const frag = encodeURIComponent(o.name).replace(/%20/g, ' ');
  return `vless://${user.uuid}@${route.host}:${route.port}?${query}#${frag}`;
}

export interface UriOptions {
  fingerprint: Fingerprint;
  earlyData: number;
  name: string;
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
  const names = ctx.user.routes.map((r) =>
    renderConfigName(ctx.nameTemplate, {
      brand: ctx.settings.brand,
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
  const lines = ctx.user.routes.map((r, i) =>
    vlessUriFor(ctx.user, r, {
      fingerprint: ctx.fingerprint,
      earlyData: speed.earlyData,
      name: names[i]!,
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
  const lines: string[] = [];
  lines.push(
    'mixed-port: 7890',
    'allow-lan: false',
    'mode: rule',
    'log-level: info',
    'ipv6: false',
    'unified-delay: true',
    'find-process-mode: off',
    'cache-file: "nova-cache.db"',
    'profile:',
    '  store-selected: true',
    '  store-fake-ip: false',
    '',
    'proxies:',
  );
  ctx.user.routes.forEach((r, i) => {
    lines.push(
      `  - name: ${yamlStr(names[i]!)}`,
      '    type: vless',
      `    server: ${yamlStr(r.host)}`,
      `    port: ${r.port}`,
      `    uuid: ${yamlStr(ctx.user.uuid)}`,
      '    network: ws',
      '    tls: true',
      `    servername: ${yamlStr(r.host)}`,
      '    udp: true',
      `    client-fingerprint: ${fp}`,
      '    ws-opts:',
      `      path: ${yamlStr(r.path)}`,
      '      headers:',
      `        Host: ${yamlStr(r.host)}`,
    );
    if (speed.tcpConcurrent) lines.push('    tcp-concurrent: true');
    if (speed.earlyData > 0) {
      lines.push(`    max-early-data: ${speed.earlyData}`, '    early-data-header-name: Sec-WebSocket-Protocol');
    }
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
    '    strategy: least-ping',
    `    proxies: ${yamlList(names)}`,
    '  - name: NOVA-SMART',
    '    type: select',
    `    proxies: ${yamlList(['NOVA-AUTO', 'NOVA-FALLBACK', 'NOVA-BALANCE', ...names])}`,
    '',
    'rules:',
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
  const outbounds: Record<string, unknown>[] = ctx.user.routes.map((r, i) => ({
    type: 'vless',
    tag: names[i]!,
    server: r.host,
    server_port: r.port,
    uuid: ctx.user.uuid,
    flow: '',
    tls: {
      enabled: true,
      server_name: r.host,
      insecure: false,
      utls: { enabled: true, fingerprint: fp === 'random' ? 'random' : fp },
    },
    transport: {
      type: 'ws',
      path: r.path,
      headers: { Host: r.host },
      max_early_data: speed.earlyData,
      early_data_header_name: 'Sec-WebSocket-Protocol',
    },
  }));
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
        interface_name: 'NovaTun',
        address: ['172.19.0.1/30', 'fd00::1/126'],
        mtu: 1500,
        auto_route: true,
        strict_route: true,
        stack: 'system',
      },
      { type: 'mixed', tag: 'mixed-in', listen: '127.0.0.1', listen_port: 2080 },
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