import { describe, expect, it } from 'vitest';

import { MethodNotAllowedError, NotFoundError } from '../src/errors.js';
import { Router, splitPath } from '../src/router.js';
import { json } from '../src/response.js';

const ok = () => json(200, { ok: true });

describe('splitPath', () => {
  it('drops empty segments', () => {
    expect(splitPath('/a/b/')).toEqual(['a', 'b']);
    expect(splitPath('/')).toEqual([]);
    expect(splitPath('//a//b//')).toEqual(['a', 'b']);
  });
});

describe('Router', () => {
  it('matches a static route', () => {
    const router = new Router().get('/health', ok);
    expect(router.match('GET', '/health').pattern).toBe('/health');
  });

  it('matches the root route', () => {
    const router = new Router().get('/', ok);
    expect(router.match('GET', '/').pattern).toBe('/');
  });

  it('extracts named parameters', () => {
    const router = new Router().get('/api/nodes/:id', ok);
    expect(router.match('GET', '/api/nodes/nova-1').params).toEqual({ id: 'nova-1' });
  });

  it('extracts multiple parameters', () => {
    const router = new Router().get('/org/:org/repo/:repo', ok);
    expect(router.match('GET', '/org/arena/repo/edge').params).toEqual({
      org: 'arena',
      repo: 'edge',
    });
  });

  it('URL-decodes parameter values', () => {
    const router = new Router().get('/items/:name', ok);
    expect(router.match('GET', '/items/hello%20world').params).toEqual({ name: 'hello world' });
  });

  it('tolerates malformed percent-encoding', () => {
    const router = new Router().get('/items/:name', ok);
    expect(router.match('GET', '/items/100%').params).toEqual({ name: '100%' });
  });

  it('prefers static segments over parameters', () => {
    const router = new Router()
      .get('/api/:resource', () => json(200, { kind: 'dynamic' }))
      .get('/api/health', () => json(200, { kind: 'static' }));
    expect(router.match('GET', '/api/health').pattern).toBe('/api/health');
  });

  it('captures the remainder with a wildcard', () => {
    const router = new Router().get('/files/*rest', ok);
    expect(router.match('GET', '/files/a/b/c.txt').params).toEqual({ rest: 'a/b/c.txt' });
    expect(router.match('GET', '/files').params).toEqual({ rest: '' });
  });

  it('defaults the wildcard name to "wildcard"', () => {
    const router = new Router().get('/files/*', ok);
    expect(router.match('GET', '/files/x/y').params).toEqual({ wildcard: 'x/y' });
  });

  it('falls back from HEAD to GET', () => {
    const router = new Router().get('/health', ok);
    expect(router.match('HEAD', '/health').pattern).toBe('/health');
  });

  it('throws NotFoundError when nothing matches', () => {
    const router = new Router().get('/health', ok);
    expect(() => router.match('GET', '/missing')).toThrow(NotFoundError);
  });

  it('does not match a shorter path against a longer pattern', () => {
    const router = new Router().get('/a/b/c', ok);
    expect(() => router.match('GET', '/a/b')).toThrow(NotFoundError);
  });

  it('throws MethodNotAllowedError with an Allow list', () => {
    const router = new Router().get('/nodes', ok).post('/nodes', ok);
    try {
      router.match('DELETE', '/nodes');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(MethodNotAllowedError);
      const typed = error as MethodNotAllowedError;
      expect(typed.status).toBe(405);
      expect(typed.allow).toContain('GET');
      expect(typed.allow).toContain('POST');
      expect(typed.allow).toContain('HEAD');
    }
  });

  it('registers every verb helper', () => {
    const router = new Router()
      .get('/r', ok)
      .post('/r', ok)
      .put('/r', ok)
      .patch('/r', ok)
      .delete('/r', ok);
    expect(router.list()).toHaveLength(5);
    expect(router.match('PATCH', '/r').pattern).toBe('/r');
  });

  it('normalises trailing slashes when matching', () => {
    const router = new Router().get('/health', ok);
    expect(router.match('GET', '/health/').pattern).toBe('/health');
  });

  it('rejects duplicate registrations', () => {
    const router = new Router().get('/dup', ok);
    expect(() => router.get('/dup', ok)).toThrow(/Duplicate route/);
  });

  it('rejects patterns that do not start with a slash', () => {
    expect(() => new Router().get('health', ok)).toThrow(/must start with/);
  });

  it('rejects an unnamed parameter', () => {
    expect(() => new Router().get('/a/:', ok)).toThrow(/must have a name/);
  });

  it('rejects a non-final wildcard', () => {
    expect(() => new Router().get('/a/*rest/b', ok)).toThrow(/final segment/);
  });
});
