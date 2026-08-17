import { describe, expect, it } from 'vitest';
import type { VlessTarget } from '../src/protocol';
import { classifyTarget, resolvePublicTarget } from '../src/proxy';
import { CMD_TCP, CMD_UDP } from '../src/protocol';
import {
  BLOCKED_SMTP_PORTS,
  hashPassword,
  hmacSha256,
  isPrivateLiteral,
  isSmtpPort,
  isUnlimited,
  signSessionId,
  verifyPassword,
  verifySessionId,
} from '../src/utils';
import { constantTimeEq, maxPathsFor, permissionsFor, sanitizeLimits } from '../src/store';
import { POWER_LEVELS } from '../src/types';

const TLS_PORTS = [443, 2053, 2083, 2087, 2096, 8443];

function target(partial: Partial<VlessTarget> = {}): VlessTarget {
  return {
    command: CMD_TCP,
    port: 443,
    addressType: 2,
    address: 'example.com',
    ...partial,
  };
}

describe('private IP literal blocking', () => {
  const privateIps = [
    '10.0.0.1', '10.255.255.255', '172.16.0.1', '172.31.255.255', '192.168.1.1',
    '169.254.169.254', '127.0.0.1', '127.8.8.8', '0.0.0.0', '100.64.0.1', '100.127.255.254',
    '192.0.2.1', '198.51.100.5', '203.0.113.7', '198.18.0.1', '240.0.0.1', '255.255.255.255',
    '224.0.0.1', '::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1', '2001:db8::1',
    '::ffff:10.0.0.1', '::ffff:192.168.1.1', '::ffff:127.0.0.1',
  ];
  for (const ip of privateIps) {
    it(`blocks ${ip}`, () => {
      expect(isPrivateLiteral(ip)).toBe(true);
    });
  }

  const publicIps = ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111', '2001:4860:4860::8888'];
  for (const ip of publicIps) {
    it(`allows ${ip}`, () => {
      expect(isPrivateLiteral(ip)).toBe(false);
    });
  }

  it('does not mistake domains for IPs', () => {
    expect(isPrivateLiteral('example.com')).toBe(false);
  });
});

describe('classifyTarget', () => {
  it('allows normal TLS TCP traffic', () => {
    expect(classifyTarget(target(), TLS_PORTS).allowed).toBe(true);
  });

  it('blocks private IP literals', () => {
    for (const ip of ['10.0.0.5', '192.168.0.1', '169.254.169.254']) {
      const r = classifyTarget(target({ addressType: 1, address: ip }), TLS_PORTS);
      expect(r).toEqual({ allowed: false, reason: 'private-ip' });
    }
  });

  it('blocks SMTP ports', () => {
    for (const port of BLOCKED_SMTP_PORTS) {
      const r = classifyTarget(target({ port }), TLS_PORTS);
      expect(r).toEqual({ allowed: false, reason: 'smtp-port' });
    }
  });

  it('blocks UDP except DNS (53)', () => {
    const udp53 = classifyTarget(target({ command: CMD_UDP, port: 53 }), TLS_PORTS);
    expect(udp53.allowed).toBe(true);
    const udpOther = classifyTarget(target({ command: CMD_UDP, port: 443 }), TLS_PORTS);
    expect(udpOther).toEqual({ allowed: false, reason: 'udp-not-dns' });
  });

  it('blocks non-TLS ports for TCP', () => {
    const r = classifyTarget(target({ port: 8080 }), TLS_PORTS);
    expect(r).toEqual({ allowed: false, reason: 'port-not-allowed' });
  });

  it('blocks IPv6 literal private', () => {
    const r = classifyTarget(target({ addressType: 3, address: 'fd00::1' }), TLS_PORTS);
    expect(r).toEqual({ allowed: false, reason: 'private-ip' });
  });
});

describe('resolvePublicTarget + DNS failover', () => {
  const okResolver = async () => ['93.184.216.34'];
  const privateResolver = async () => ['10.0.0.1', '192.168.1.1'];
  const deadResolver = async () => {
    throw new Error('boom');
  };
  const emptyResolver = async () => [];

  it('returns the first public IP', async () => {
    const r = await resolvePublicTarget('example.com', okResolver, ['https://doh1', 'https://doh2']);
    expect(r).toEqual({ ok: true, target: { ip: '93.184.216.34' } });
  });

  it('blocks targets whose only answers are private', async () => {
    const r = await resolvePublicTarget('metadata.internal', privateResolver, ['https://doh1']);
    expect(r).toEqual({ ok: false, reason: 'private-ip' });
  });

  it('fails over to the next resolver (DNS failover)', async () => {
    let calls = 0;
    const fetcher = async (doh: string) => {
      calls++;
      if (doh === 'https://doh1') throw new Error('down');
      return ['93.184.216.34'];
    };
    const r = await resolvePublicTarget('example.com', fetcher, ['https://doh1', 'https://doh2']);
    expect(calls).toBe(2);
    expect(r).toEqual({ ok: true, target: { ip: '93.184.216.34' } });
  });

  it('skips empty answers and keeps trying', async () => {
    const r = await resolvePublicTarget('x.com', emptyResolver, ['https://doh1', 'https://doh2']);
    expect(r).toEqual({ ok: false, reason: 'dns-unresolvable' });
  });

  it('does not even try dead resolver results beyond the list', async () => {
    const r = await resolvePublicTarget('x.com', deadResolver, ['https://doh1']);
    expect(r).toEqual({ ok: false, reason: 'dns-unresolvable' });
  });
});

describe('HMAC session signing', () => {
  it('signs and verifies a session id', async () => {
    const signed = await signSessionId('secret', 'abc123');
    expect(signed).toMatch(/^abc123\.[0-9a-f]{64}$/);
    expect(await verifySessionId('secret', signed)).toBe('abc123');
  });

  it('rejects tampered signatures', async () => {
    const signed = await signSessionId('secret', 'abc123');
    const tampered = signed.slice(0, -1) + (signed.endsWith('0') ? '1' : '0');
    expect(await verifySessionId('secret', tampered)).toBeNull();
    expect(await verifySessionId('secret', 'abc123.bad')).toBeNull();
    expect(await verifySessionId('other', signed)).toBeNull();
    expect(await verifySessionId('secret', '')).toBeNull();
    expect(await verifySessionId('secret', null)).toBeNull();
  });

  it('hmacSha256 is deterministic', async () => {
    expect(await hmacSha256('k', 'm')).toBe(await hmacSha256('k', 'm'));
    expect(await hmacSha256('k', 'm')).not.toBe(await hmacSha256('k', 'n'));
  });
});

describe('PBKDF2-SHA256 passwords', () => {
  it('hashes and verifies', async () => {
    const stored = await hashPassword('SuperSecretPass123!');
    expect(stored.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.salt).toMatch(/^[0-9a-f]{32}$/);
    expect(stored.iterations).toBeGreaterThan(0);
    expect(await verifyPassword('SuperSecretPass123!', stored)).toBe(true);
    expect(await verifyPassword('wrong-password', stored)).toBe(false);
  });

  it('produces unique salts per hash', async () => {
    const a = await hashPassword('SamePass123!');
    const b = await hashPassword('SamePass123!');
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
    expect(await verifyPassword('SamePass123!', a)).toBe(true);
    expect(await verifyPassword('SamePass123!', b)).toBe(true);
  });

  it('constantTimeEq works and is length-safe', () => {
    expect(constantTimeEq('abc', 'abc')).toBe(true);
    expect(constantTimeEq('abc', 'abd')).toBe(false);
    expect(constantTimeEq('a', 'longer')).toBe(false);
  });
});

describe('limits & power (zero means unlimited)', () => {
  it('sanitizeLimits never converts zero to a default', () => {
    const r = sanitizeLimits({ limitBytes: 0, limitSeconds: 0, maxConnections: 0 });
    expect(r.limitBytes).toBe(0);
    expect(r.limitSeconds).toBe(0);
    expect(r.maxConnections).toBe(0);
  });

  it('sanitizeLimits handles garbage as unlimited', () => {
    const r = sanitizeLimits({ limitBytes: 'abc', limitSeconds: -5, maxConnections: NaN });
    expect(r.limitBytes).toBe(0);
    expect(r.limitSeconds).toBe(0);
    expect(r.maxConnections).toBe(0);
  });

  it('sanitizeLimits keeps real numbers', () => {
    const r = sanitizeLimits({ limitBytes: 5 * 1024 ** 3, limitSeconds: 86400, maxConnections: 3 });
    expect(r.limitBytes).toBe(5 * 1024 ** 3);
    expect(r.limitSeconds).toBe(86400);
    expect(r.maxConnections).toBe(3);
  });

  it('isUnlimited reflects zero-only semantics', () => {
    expect(isUnlimited(0)).toBe(true);
    expect(isUnlimited(1)).toBe(false);
  });

  it('power levels cap paths (backend constants)', () => {
    expect(POWER_LEVELS.limited.maxPaths).toBe(5);
    expect(POWER_LEVELS.normal.maxPaths).toBe(30);
    expect(POWER_LEVELS.strong.maxPaths).toBe(80);
    expect(POWER_LEVELS.ultra.maxPaths).toBe(200);
    expect(maxPathsFor('limited')).toBe(5);
    expect(maxPathsFor('ultra')).toBe(200);
  });
});

describe('permissions & roles', () => {
  it('owner holds all ten permissions', () => {
    const perms = permissionsFor('owner');
    expect(perms).toContain('users:view');
    expect(perms).toContain('users:create');
    expect(perms).toContain('users:edit');
    expect(perms).toContain('users:delete');
    expect(perms).toContain('configs:build');
    expect(perms).toContain('settings:manage');
    expect(perms).toContain('endpoints:probe');
    expect(perms).toContain('backup:export');
    expect(perms).toContain('admins:manage');
    expect(perms).toContain('audit:view');
    expect(perms.length).toBe(10);
  });

  it('admin/operator/support have strictly smaller sets', () => {
    expect(permissionsFor('admin')).not.toContain('settings:manage');
    expect(permissionsFor('admin')).not.toContain('admins:manage');
    expect(permissionsFor('admin')).toContain('users:delete');
    expect(permissionsFor('operator')).not.toContain('users:delete');
    expect(permissionsFor('operator')).not.toContain('settings:manage');
    expect(permissionsFor('support')).toEqual(['users:view', 'configs:build', 'audit:view']);
  });
});

describe('SMTP port blocking list', () => {
  it('covers the standard SMTP ports', () => {
    for (const p of [25, 465, 587, 2525]) {
      expect(isSmtpPort(p)).toBe(true);
      expect(BLOCKED_SMTP_PORTS).toContain(p);
    }
    expect(isSmtpPort(443)).toBe(false);
    expect(isSmtpPort(53)).toBe(false);
  });
});
