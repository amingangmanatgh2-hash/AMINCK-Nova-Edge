import type { PanelSettings, Route, User } from '../src/types';
import { defaultSettings } from '../src/store';
import { buildRoutes, planRoutes } from '../src/config';

/** Endpoint fixture. */
export function epFixture(id: string, host: string, port = 443) {
  return { id, label: `${host}:${port}`, host, port, createdAt: Date.now() };
}

export const FIXTURE_ENDPOINTS = [
  epFixture('ep-1', 'edge-1.example.workers.dev', 443),
  epFixture('ep-2', 'edge-2.example.workers.dev', 443),
  epFixture('ep-3', 'edge-3.example.workers.dev', 8443),
];

export function settingsFixture(overrides: Partial<PanelSettings> = {}): PanelSettings {
  const s = defaultSettings();
  s.endpoints = [...FIXTURE_ENDPOINTS];
  s.probeResults = {
    'ep-1': { endpointId: 'ep-1', ok: true, latencyMs: 40, checkedAt: Date.now() },
    'ep-2': { endpointId: 'ep-2', ok: true, latencyMs: 90, checkedAt: Date.now() },
    'ep-3': { endpointId: 'ep-3', ok: false, latencyMs: null, error: 'timeout', checkedAt: Date.now() },
  };
  return { ...s, ...overrides };
}

export function userFixture(overrides: Partial<User> = {}): User {
  const base: User = {
    id: 'user-fixture-0001',
    name: 'مشترک تست',
    uuid: '11111111-1111-4111-8111-111111111111',
    token: 'f'.repeat(64),
    routes: [],
    limitBytes: 0,
    limitSeconds: 0,
    maxConnections: 0,
    active: true,
    speedPreset: 'balanced',
    profileMode: 'auto',
    fingerprint: null,
    configNameTemplate: null,
    note: '',
    createdAt: Date.now(),
    expiresAt: 0,
    usageBytes: 0,
    lastSeenAt: 0,
    lastSubAt: 0,
  };
  const user = { ...base, ...overrides };
  if (user.routes.length === 0) {
    const plan = planRoutes(FIXTURE_ENDPOINTS, 3);
    user.routes = buildRoutes(user.id, plan, settingsFixture());
  }
  return user;
}

export function routesFor(userId: string, endpoints = FIXTURE_ENDPOINTS, count = 3): Route[] {
  return buildRoutes(userId, planRoutes(endpoints, count), settingsFixture());
}

export const OWNER_PASSWORD = 'OwnerPass123!';
export const SESSION_SECRET = 'test-session-secret-0123456789abcdef';
