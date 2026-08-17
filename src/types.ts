/**
 * EDGE PANEL — shared domain types.
 * The whole API, proxy and config builder operate on these contracts.
 */

// ---------------------------------------------------------------------------
// Roles & power levels
// ---------------------------------------------------------------------------

export type AdminRole = 'owner' | 'admin' | 'operator' | 'support';

export type Permission =
  | 'users:view'
  | 'users:create'
  | 'users:edit'
  | 'users:delete'
  | 'configs:build'
  | 'settings:manage'
  | 'endpoints:probe'
  | 'backup:export'
  | 'admins:manage'
  | 'audit:view';

export type PowerLevel = 'limited' | 'normal' | 'strong' | 'ultra';

export interface PowerSpec {
  /** Official label shown in the UI. */
  label: string;
  /** Hard backend cap for the number of routes/paths a config may contain. */
  maxPaths: number;
}

export const POWER_LEVELS: Record<PowerLevel, PowerSpec> = {
  limited: { label: 'Limited', maxPaths: 5 },
  normal: { label: 'Normal', maxPaths: 30 },
  strong: { label: 'Strong', maxPaths: 80 },
  ultra: { label: 'Ultra', maxPaths: 200 },
};

/** Maximum number of endpoints the scanner/settings accept. */
export const MAX_ENDPOINTS = 50;
/** Maximum number of paths a user subscription may hold. */
export const MAX_PATHS = 200;
/** Minimum accepted admin password length. */
export const MIN_PASSWORD_LENGTH = 10;
/** Hard minimum for password-protected accounts. */
export const MAX_AUDIT_EVENTS = 1000;

// ---------------------------------------------------------------------------
// Speed presets (all values are real knobs honoured by the generated configs)
// ---------------------------------------------------------------------------

export type SpeedPreset = 'stable' | 'balanced' | 'turbo' | 'god';

export interface SpeedSpec {
  label: string;
  /** Early Data size advertised to clients (bytes). */
  earlyData: number;
  /** Number of TCP connect attempts before giving up on a target. */
  tcpRetries: number;
  /** Clash health-check interval (seconds). */
  healthInterval: number;
  /** Clash url-test latency tolerance (ms). */
  tolerance: number;
  /** Whether generated Clash proxies use tcp-concurrent. */
  tcpConcurrent: boolean;
  /** Whether DNS-over-HTTPS failover across resolvers is enabled. */
  dnsFailover: boolean;
  /** probe timeout (ms) used by the scanner for this preset. */
  probeTimeoutMs: number;
  /** Bad-path detection: how many consecutive failures make a route "down". */
  downAfterFails: number;
}

export const SPEED_PRESETS: Record<SpeedPreset, SpeedSpec> = {
  stable: {
    label: 'Stable',
    earlyData: 1024,
    tcpRetries: 1,
    healthInterval: 120,
    tolerance: 250,
    tcpConcurrent: false,
    dnsFailover: false,
    probeTimeoutMs: 10000,
    downAfterFails: 3,
  },
  balanced: {
    label: 'Balanced',
    earlyData: 2048,
    tcpRetries: 2,
    healthInterval: 90,
    tolerance: 150,
    tcpConcurrent: false,
    dnsFailover: true,
    probeTimeoutMs: 8000,
    downAfterFails: 2,
  },
  turbo: {
    label: 'Turbo',
    earlyData: 3072,
    tcpRetries: 3,
    healthInterval: 60,
    tolerance: 100,
    tcpConcurrent: true,
    dnsFailover: true,
    probeTimeoutMs: 6000,
    downAfterFails: 2,
  },
  god: {
    label: 'GOD',
    earlyData: 4096,
    tcpRetries: 4,
    healthInterval: 50,
    tolerance: 50,
    tcpConcurrent: true,
    dnsFailover: true,
    probeTimeoutMs: 5000,
    downAfterFails: 1,
  },
};

// ---------------------------------------------------------------------------
// Profiles / endpoint management
// ---------------------------------------------------------------------------

/** Mechanism a subscription prefers when grouping multiple routes. */
export type ProfileMode = 'auto' | 'fallback' | 'balance';

export type Fingerprint = 'chrome' | 'firefox' | 'safari' | 'edge' | 'random';

export const FINGERPRINTS: Fingerprint[] = ['chrome', 'firefox', 'safari', 'edge', 'random'];

/** TLS ports Cloudflare accepts for HTTPS traffic (plus 8443 for Enterprise). */
export const CLOUDFLARE_TLS_PORTS = [443, 2053, 2083, 2087, 2096, 8443];

/**
 * Popular Iranian / national-net friendly domains used as WS Host camouflage
 * and optional clean-IP front hosts (Zooz/BPB-style). Connection still lands
 * on the real Worker endpoint; these only shape client-side SNI/Host noise.
 */
export const DEFAULT_FAKE_DOMAINS = [
  'snaap.ir',
  'www.digikala.com',
  'www.aparat.com',
  'www.varzesh3.com',
  'www.bankmellat.ir',
  'www.irna.ir',
  'www.isna.ir',
  'www.hamshahrionline.ir',
  'www.telewebion.com',
  'www.filimo.com',
];

export interface Endpoint {
  id: string;
  label: string;
  host: string;
  port: number;
  /** Injected later, never from a client. */
  createdAt?: number;
}

/** Anti-detection knobs honoured by the config builder. */
export interface AntiDetectSettings {
  /** Enable random path padding segments. */
  pathPadding: boolean;
  /** Enable path-length jitter (variable slug length). */
  pathJitter: boolean;
  /** Enable TLS/WS fragment hints in Clash Meta + sing-box. */
  fragment: boolean;
  /** Fragment packet length range (bytes), inclusive. */
  fragmentLength: [number, number];
  /** Fragment interval range (ms), inclusive. */
  fragmentInterval: [number, number];
  /** Rotate WS Host header across fakeDomains. */
  hostCamouflage: boolean;
  /** When true, emit one config line per selected TLS port (Zooz/BPB style). */
  multiPort: boolean;
}

export const DEFAULT_ANTI_DETECT: AntiDetectSettings = {
  pathPadding: true,
  pathJitter: true,
  fragment: true,
  fragmentLength: [100, 200],
  fragmentInterval: [10, 20],
  hostCamouflage: true,
  /** Off by default so path count stays exact; enable for Zooz/BPB multi-port. */
  multiPort: false,
};

export interface ProbeResult {
  endpointId: string;
  ok: boolean;
  /** TCP connect + TLS handshake time measured from the Cloudflare edge, ms. */
  latencyMs: number | null;
  error?: string;
  checkedAt: number;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export interface PanelSettings {
  /** Panel title shown in the header / browser tab. */
  title: string;
  /** Brand shown in the dashboard, subscription names and default config name. */
  brand: string;
  /** Support link shown in the panel and subscription headers. */
  supportUrl: string;
  /** Primary DNS-over-HTTPS resolver for target resolution + UDP DNS. */
  doh: string;
  /** Alternative DoH resolvers, used in order when the primary fails. */
  dohAlt: string[];
  /** Health-check URL emitted into Clash/sing-box configs. Empty = derive from first endpoint. */
  healthUrl: string;
  /** Config name template supporting {brand} {app} {user} {profile} {index} {endpoint} {port}. */
  configNameTemplate: string;
  /** Default number of paths for new users / auto builds. */
  defaultPaths: number;
  /** Subscription update interval in hours (profile-update-interval header). */
  updateIntervalHours: number;
  /** TLS fingerprint advertised in generated configs. */
  fingerprint: Fingerprint;
  /** Default profile mode for new users. */
  profileMode: ProfileMode;
  /** Default speed preset for new users. */
  speedPreset: SpeedPreset;
  /** Allowed outbound TLS ports (Zooz/BPB multi-port selection). */
  tlsPorts: number[];
  /** Camouflage / national-net domains (Host header rotation). */
  fakeDomains: string[];
  /** Anti-detection: padding, jitter, fragment, multi-port. */
  antiDetect: AntiDetectSettings;
  /** Monotonic panel config generation — bumped on one-click hot update. */
  configGeneration: number;
  /** Endpoints known to this deployment (max MAX_ENDPOINTS). */
  endpoints: Endpoint[];
  /** Probe results keyed by endpoint id (scanner page). */
  probeResults: Record<string, ProbeResult>;
  /** Last time the automatic 30-minute cron probe ran. */
  lastProbeAt: number;
}

// ---------------------------------------------------------------------------
// Routes & users
// ---------------------------------------------------------------------------

export interface Route {
  /** URL path segment the client connects to (e.g. `/e{slug}{userId}`). */
  path: string;
  /** Endpoint id this route belongs to. */
  endpointId: string;
  host: string;
  port: number;
  /** Route order inside the subscription (1-based). */
  index: number;
  /** Precomputed TLS SNI = the public host the client really reached. */
  sni?: string;
  /** Optional WS Host camouflage domain (anti-detect). */
  wsHost?: string;
  /** Optional padding query appended only in client configs (ignored by Worker). */
  padding?: string;
}

export interface User {
  id: string;
  name: string;
  /** VLESS UUID — auth material for the proxy, independent from the token. */
  uuid: string;
  /** Subscription token — only used to fetch /sub/ endpoints. */
  token: string;
  routes: Route[];
  /** 0 = unlimited. NEVER coerced to a default. */
  limitBytes: number;
  /** 0 = unlimited. */
  limitSeconds: number;
  /** 0 = unlimited. */
  maxConnections: number;
  active: boolean;
  speedPreset: SpeedPreset;
  profileMode: ProfileMode;
  fingerprint?: Fingerprint | null;
  /** Per-user config name template; falls back to settings.configNameTemplate. */
  configNameTemplate?: string | null;
  /** Internal note, only visible to admins. */
  note: string;
  createdAt: number;
  expiresAt: number; // timestamp; 0 = never
  /** Approximate total traffic (bytes) consumed through the proxy. */
  usageBytes: number;
  lastSeenAt: number;
  lastSubAt: number;
}

// ---------------------------------------------------------------------------
// Admins
// ---------------------------------------------------------------------------

export const ROLE_PERMISSIONS: Record<Exclude<AdminRole, 'owner'>, Permission[]> = {
  admin: [
    'users:view',
    'users:create',
    'users:edit',
    'users:delete',
    'configs:build',
    'endpoints:probe',
    'backup:export',
    'audit:view',
  ],
  operator: [
    'users:view',
    'users:create',
    'users:edit',
    'configs:build',
    'endpoints:probe',
    'backup:export',
    'audit:view',
  ],
  support: ['users:view', 'configs:build', 'audit:view'],
};

/**
 * Every permission, both for the actor check and for the capability manifest.
 */
export const ALL_PERMISSIONS: Permission[] = [
  'users:view',
  'users:create',
  'users:edit',
  'users:delete',
  'configs:build',
  'settings:manage',
  'endpoints:probe',
  'backup:export',
  'admins:manage',
  'audit:view',
];

export interface Admin {
  id: string;
  username: string;
  role: AdminRole;
  power: PowerLevel;
  active: boolean;
  /** PBKDF2-SHA256 parameters. NEVER exposed through the API. */
  salt: string;
  hash: string;
  iterations: number;
  createdAt: number;
  lastLoginAt: number | null;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export interface Session {
  id: string;
  adminId: string;
  createdAt: number;
  expiresAt: number;
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export type AuditAction =
  | 'admin.login'
  | 'admin.login_failed'
  | 'admin.logout'
  | 'admin.create'
  | 'admin.update'
  | 'admin.revoke'
  | 'admin.restore'
  | 'admin.delete'
  | 'admin.password'
  | 'user.create'
  | 'user.update'
  | 'user.delete'
  | 'user.toggle'
  | 'user.reset_usage'
  | 'user.reset_connections'
  | 'user.rotate_uuid'
  | 'user.rotate_token'
  | 'config.build'
  | 'config.auto_build'
  | 'config.sub_fetch'
  | 'settings.update'
  | 'endpoints.probe'
  | 'endpoints.update'
  | 'backup.export'
  | 'panel.hot_update';

export interface AuditEvent {
  id: string;
  ts: number;
  actor: string; // admin username
  action: AuditAction;
  target: string; // user / admin / settings
  details: string;
  ip: string;
}

// ---------------------------------------------------------------------------
// Config building
// ---------------------------------------------------------------------------

export type ConfigFormat = 'v2ray' | 'raw' | 'clash' | 'singbox';

export interface BuildRequest {
  paths: number; // clamped to [1, maxPathsForAdmin]
  profileMode?: ProfileMode;
  speedPreset?: SpeedPreset;
  fingerprint?: Fingerprint;
  configNameTemplate?: string;
  endpointIds?: string[]; // optional subset of endpoints to use
}

export interface BuiltConfig {
  format: ConfigFormat;
  /** Number of routes actually produced (after power-level clamps). */
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

// ---------------------------------------------------------------------------
// API envelope
// ---------------------------------------------------------------------------

export interface ApiErrorBody {
  error: string;
  message: string;
  details?: string;
}

export interface OwnerInfo {
  username: string;
  role: 'owner';
  power: 'ultra';
}

export interface MeInfo {
  authenticated: boolean;
  admin?: {
    id: string;
    username: string;
    role: AdminRole;
    power: PowerLevel;
    permissions: Permission[];
  };
}