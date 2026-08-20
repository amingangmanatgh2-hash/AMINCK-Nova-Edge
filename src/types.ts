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
/** Maximum subscriptions created by one automatic batch request. */
export const MAX_BATCH_SUBSCRIPTIONS = 10;
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
    // More retries increase time-to-first-byte when an endpoint is dead.
    // Two quick attempts are a better stability/latency trade-off at the edge.
    tcpRetries: 2,
    healthInterval: 30,
    tolerance: 50,
    tcpConcurrent: true,
    dnsFailover: true,
    probeTimeoutMs: 4000,
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

/** HTTPS listener ports supported by Cloudflare proxied hostnames. */
export const CLOUDFLARE_TLS_PORTS = [443, 2053, 2083, 2087, 2096, 8443];

/**
 * Conservative TCP destination allow-list for subscriber traffic. This is
 * intentionally separate from Worker listener ports: clients commonly need
 * HTTP/HTTPS while mail and arbitrary high-risk ports remain unavailable.
 */
export const OUTBOUND_TCP_PORTS = [80, 443, 2053, 2082, 2083, 2086, 2087, 2095, 2096, 8080, 8443];

/**
 * Host aliases are deliberately empty by default. An alias is only useful
 * when the operator owns it and has routed it to this same Worker. Pretending
 * to be an unrelated third-party domain is unreliable, can violate that
 * party's rights, and usually fails Cloudflare routing/TLS validation.
 */
export const DEFAULT_HOST_ALIASES: string[] = [];

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
  /** Rotate WS Host across operator-owned aliases routed to this Worker. */
  hostCamouflage: boolean;
  /** When true, emit one config line per selected TLS port (Zooz/BPB style). */
  multiPort: boolean;
}

export const DEFAULT_ANTI_DETECT: AntiDetectSettings = {
  pathPadding: true,
  pathJitter: true,
  // Off by default because fragment syntax differs between client forks.
  fragment: false,
  fragmentLength: [50, 120],
  fragmentInterval: [10, 20],
  hostCamouflage: false,
  /** Off by default; non-443 ports require a compatible proxied custom host. */
  multiPort: false,
};

export interface ProbeResult {
  endpointId: string;
  ok: boolean;
  /** HTTPS response-header latency measured from the Cloudflare edge, ms. */
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
  /** Operator-owned hostnames routed to this same Worker (optional Host rotation). */
  hostAliases: string[];
  /** Transport tuning: padding, jitter, optional client hints and multi-port. */
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
  /** Optional Cloudflare clean-IP front (client dials IP, SNI stays Worker host). */
  frontIp?: string;
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
  /** Maximum successful subscription fetches; 0 = unlimited. */
  limitRequests: number;
  /** Number of successful subscription fetches. */
  requestCount: number;
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
  | 'user.reset_requests'
  | 'user.rotate_uuid'
  | 'user.rotate_token'
  | 'config.build'
  | 'config.auto_build'
  | 'config.iron_build'
  | 'config.sub_fetch'
  | 'settings.update'
  | 'endpoints.probe'
  | 'endpoints.update'
  | 'backup.export'
  | 'backup.restore'
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
