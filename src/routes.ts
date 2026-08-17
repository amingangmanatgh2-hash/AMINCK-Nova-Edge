/**
 * HTTP surface of the service. Handlers stay small and pure: they read from the
 * request, touch injected state, and return an {@link EdgeResponse}.
 */

import type { TtlCache } from './cache.js';
import { BadRequestError, NotFoundError } from './errors.js';
import type { RateLimiter } from './rate-limit.js';
import { json, text } from './response.js';
import type { Router } from './router.js';
import type { AppConfig, EdgeResponse, JsonValue } from './types.js';

export interface RouteContext {
  readonly router: Router;
  readonly cache: TtlCache<EdgeResponse>;
  readonly limiter: RateLimiter;
  readonly config: AppConfig;
  readonly startedAt: number;
  readonly now: () => number;
}

/** In-memory demo store so the API has something real to operate on. */
export interface EdgeNode {
  readonly id: string;
  readonly region: string;
  readonly status: 'online' | 'degraded' | 'offline';
  readonly latencyMs: number;
}

const SEED_NODES: readonly EdgeNode[] = [
  { id: 'nova-iad-1', region: 'us-east', status: 'online', latencyMs: 12 },
  { id: 'nova-sfo-1', region: 'us-west', status: 'online', latencyMs: 24 },
  { id: 'nova-fra-1', region: 'eu-central', status: 'degraded', latencyMs: 88 },
  { id: 'nova-thr-1', region: 'me-central', status: 'online', latencyMs: 41 },
];

function nodeToJson(node: EdgeNode): JsonValue {
  return { id: node.id, region: node.region, status: node.status, latencyMs: node.latencyMs };
}

/** Validate and normalise the JSON body of a node-creation request. */
export function parseNodeInput(raw: string): EdgeNode {
  if (raw.trim() === '') {
    throw new BadRequestError('Request body is required');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BadRequestError('Request body must be valid JSON');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new BadRequestError('Request body must be a JSON object');
  }

  const record = parsed as Record<string, unknown>;
  const id = record['id'];
  const region = record['region'];
  const status = record['status'] ?? 'online';
  const latencyMs = record['latencyMs'] ?? 0;

  const issues: string[] = [];
  if (typeof id !== 'string' || id.trim() === '') {
    issues.push('id must be a non-empty string');
  }
  if (typeof region !== 'string' || region.trim() === '') {
    issues.push('region must be a non-empty string');
  }
  if (status !== 'online' && status !== 'degraded' && status !== 'offline') {
    issues.push('status must be one of online, degraded, offline');
  }
  if (typeof latencyMs !== 'number' || !Number.isFinite(latencyMs) || latencyMs < 0) {
    issues.push('latencyMs must be a non-negative number');
  }

  if (issues.length > 0) {
    throw new BadRequestError('Validation failed', { issues });
  }

  return {
    id: (id as string).trim(),
    region: (region as string).trim(),
    status: status as EdgeNode['status'],
    latencyMs: latencyMs as number,
  };
}

/** Register every route on the provided router. */
export function registerRoutes(ctx: RouteContext): Router {
  const { router, cache, limiter, config, startedAt, now } = ctx;
  const nodes = new Map<string, EdgeNode>(SEED_NODES.map((node) => [node.id, node]));

  router.get('/', () =>
    json(200, {
      name: 'AMINCK Nova Edge',
      version: '1.0.0',
      status: 'ok',
      endpoints: router.list().map((route) => `${route.method} ${route.pattern}`),
    }),
  );

  router.get('/health', () => json(200, { status: 'ok', uptimeMs: now() - startedAt }));

  router.get('/readyz', () => text(200, 'ready'));

  router.get('/metrics', () => {
    const stats = cache.stats();
    return json(200, {
      uptimeMs: now() - startedAt,
      cache: { ...stats },
      rateLimit: { trackedKeys: limiter.size, capacity: config.rateLimitCapacity },
      nodes: nodes.size,
    });
  });

  router.get('/api/nodes', (req) => {
    const region = req.query.get('region');
    const status = req.query.get('status');
    let items = [...nodes.values()];
    if (region !== null && region !== '') {
      items = items.filter((node) => node.region === region);
    }
    if (status !== null && status !== '') {
      items = items.filter((node) => node.status === status);
    }
    items.sort((a, b) => a.id.localeCompare(b.id));
    return json(200, { count: items.length, items: items.map(nodeToJson) });
  });

  router.get('/api/nodes/:id', (req) => {
    const id = req.params['id'];
    const node = id === undefined ? undefined : nodes.get(id);
    if (node === undefined) {
      throw new NotFoundError(`No node with id "${id ?? ''}"`);
    }
    return json(200, nodeToJson(node));
  });

  router.post('/api/nodes', (req) => {
    const node = parseNodeInput(req.body);
    const created = !nodes.has(node.id);
    nodes.set(node.id, node);
    return json(created ? 201 : 200, nodeToJson(node), {
      location: `/api/nodes/${encodeURIComponent(node.id)}`,
    });
  });

  router.delete('/api/nodes/:id', (req) => {
    const id = req.params['id'];
    if (id === undefined || !nodes.delete(id)) {
      throw new NotFoundError(`No node with id "${id ?? ''}"`);
    }
    return json(200, { deleted: id });
  });

  router.get('/api/echo/*rest', (req) =>
    json(200, {
      path: req.params['rest'] ?? '',
      query: Object.fromEntries(req.query.entries()),
      requestId: req.requestId,
    }),
  );

  return router;
}
