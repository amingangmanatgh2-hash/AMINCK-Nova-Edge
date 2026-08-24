import { describe, expect, it } from 'vitest';
import {
  ARENA_SERVICES,
  arenaSummaryFromModel,
  deterministicArenaRun,
  sanitizeArenaContext,
  sanitizeArenaText,
} from '../src/arena';

describe('AMINNOVA Arena deterministic services', () => {
  it('runs all four services with constrained, honest outputs', () => {
    // Catalogue: four services, unique ids, only build-plan needs a prompt.
    expect(ARENA_SERVICES).toHaveLength(4);
    expect(ARENA_SERVICES.map((spec) => spec.id)).toEqual(['build-plan', 'profile-coach', 'endpoint-analyst', 'security-review']);
    expect(ARENA_SERVICES.filter((spec) => spec.needsPrompt)).toHaveLength(1);

    // build-plan mirrors the safe Persian plan engine and warns on short prompts.
    const plan = deterministicArenaRun('build-plan', { prompt: 'برای کالاف ۳۰ کانفیگ کمترین پینگ بساز' });
    expect(plan.plan!.usageMode).toBe('gaming');
    expect(plan.plan!.gameIds).toContain('cod-mobile');
    expect(plan.plan!.speedPreset).toBe('latency');
    expect(plan.metrics.paths).toBe(30);
    expect(plan.metrics.games).toBe(1);
    expect(plan.findings.join(' ')).toContain('Gaming');
    const short = deterministicArenaRun('build-plan', { prompt: '' });
    expect(short.warnings[0]).toContain('کوتاه');
    expect(short.plan).toBeDefined();

    // profile-coach: LOW PING for measured gaming, conservative without data.
    const coach = deterministicArenaRun('profile-coach', { context: { goal: 'gaming', latencies: [35, 48, 120] } });
    expect(coach.advice).toEqual({ speedPreset: 'latency', profileMode: 'auto' });
    expect(coach.metrics.endpoints).toBe(3);
    expect(coach.metrics.bestMs).toBe(35);
    const noData = deterministicArenaRun('profile-coach', { context: { goal: 'gaming', latencies: [] } });
    expect(noData.advice).toEqual({ speedPreset: 'stable', profileMode: 'fallback' });
    expect(noData.metrics.endpoints).toBe(0);
    expect(noData.warnings.length).toBeGreaterThan(0);
    const malformed = deterministicArenaRun('profile-coach', {
      context: { latencies: [Number.NaN, Number.POSITIVE_INFINITY, -5, 999_999, 42, 'junk'] as unknown as number[] },
    });
    expect(malformed.metrics.endpoints).toBe(2);
    expect(malformed.metrics.bestMs).toBe(42);

    // endpoint-analyst: health/stale counting, spread, all-down warning, record cap.
    const now = 1_000_000_000_000;
    const analyst = deterministicArenaRun('endpoint-analyst', {
      context: {
        now,
        results: {
          a: { ok: true, latencyMs: 40, error: '', checkedAt: now },
          b: { ok: true, latencyMs: 250, error: '', checkedAt: now },
          c: { ok: false, latencyMs: null, error: 'timeout', checkedAt: 0 },
          d: { ok: true, latencyMs: 90, error: '', checkedAt: now - 45 * 60_000 },
        },
      },
    });
    expect(analyst.metrics.total).toBe(4);
    expect(analyst.metrics.healthy).toBe(3);
    expect(analyst.metrics.failed).toBe(1);
    expect(analyst.metrics.stale).toBe(1);
    expect(analyst.metrics.bestMs).toBe(40);
    expect(analyst.metrics.spreadMs).toBe(210);
    const allDown = deterministicArenaRun('endpoint-analyst', {
      context: { results: { a: { ok: false, latencyMs: null, error: 'refused', checkedAt: 0 } } },
    });
    expect(allDown.metrics.healthy).toBe(0);
    expect(allDown.warnings.join(' ')).toContain('هیچ Endpoint سالمی');
    const huge: Record<string, { ok: boolean; latencyMs: number; error: string; checkedAt: number }> = {};
    for (let i = 0; i < 150; i++) huge[`ep-${i}`] = { ok: true, latencyMs: 50, error: '', checkedAt: 0 };
    expect(deterministicArenaRun('endpoint-analyst', { context: { results: huge } }).metrics.total).toBe(100);

    // security-review: risky settings lose points; clean settings stay at 100.
    const risky = deterministicArenaRun('security-review', {
      context: {
        workerHost: 'panel.example.workers.dev',
        settings: {
          doh: 'http://dns.example/resolver/a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
          healthUrl: 'https://panel.example.workers.dev/healthz',
          tlsPorts: [443, 999],
          hostAliases: ['third-party.example'],
          supportUrl: 'http://support.example',
          antiDetect: { fragment: true },
        },
      },
    });
    expect(risky.score!).toBeLessThan(70);
    expect(risky.score!).toBeGreaterThan(0);
    expect(JSON.stringify(risky)).not.toContain('a1b2c3d4e5f6');
    expect(JSON.stringify(risky)).not.toContain('third-party.example');
    const clean = deterministicArenaRun('security-review', {
      context: {
        workerHost: 'panel.example.workers.dev',
        settings: {
          doh: 'https://dns.google/dns-query',
          dohAlt: ['https://cloudflare-dns.com/dns-query'],
          healthUrl: '',
          tlsPorts: [443],
          hostAliases: [],
          supportUrl: 'https://t.me/example',
          brand: 'AMINCK GOD Edition',
          title: 'AMINNOVA',
          fingerprint: 'chrome',
          antiDetect: { pathPadding: true, pathJitter: true, fragment: false, hostCamouflage: false, multiPort: false },
        },
      },
    });
    expect(clean.score).toBe(100);
    expect(clean.metrics.deductions).toBe(0);
  });

  it('scrubs model output and whitelists Arena context fields', () => {
    // Long secrets, URLs, IPs and UUIDs never survive scrubbing.
    const dirty = 'نگاه کن به https://evil.example/x و 10.0.0.8 و 11111111-1111-4111-8111-111111111111 و ' + 'f'.repeat(64) + ' پایان';
    const cleaned = sanitizeArenaText(dirty, 120);
    expect(cleaned).not.toContain('http');
    expect(cleaned).not.toContain('10.0.0.8');
    expect(cleaned).not.toContain('11111111');
    expect(cleaned).not.toContain('f'.repeat(24));
    expect(cleaned.length).toBeLessThanOrEqual(120);
    expect(cleaned).toContain('پایان');
    expect(arenaSummaryFromModel({ response: 'کوتاه' })).toBeNull();
    expect(arenaSummaryFromModel({ response: 'این یک خلاصه فارسی معتبر و قابل قبول است.' })).toContain('خلاصه');

    // Context: only whitelisted keys, safe shapes, clamped numbers.
    const secret = 'z'.repeat(64);
    const context = sanitizeArenaContext({
      goal: 'gaming',
      workerHost: 'https://PANEL.example.workers.dev/path',
      latencies: [40, 'junk', -1, 70000],
      results: { 'ep-1': { ok: true, latencyMs: 44, extra: 'drop-me' } },
      settings: {
        doh: 'https://dns.google/dns-query',
        password: secret,
        token: secret,
        tlsPorts: [443, 'x'],
        antiDetect: { fragment: 1 },
      },
      evilNest: { token: secret },
    });
    expect(context.goal).toBe('gaming');
    expect(context.workerHost).toBe('panel.example.workers.dev');
    expect(context.latencies).toEqual([40, 60000]);
    expect((context.results as Record<string, { latencyMs: number }>)['ep-1']!.latencyMs).toBe(44);
    const settings = context.settings as Record<string, unknown>;
    expect(settings).not.toHaveProperty('password');
    expect(settings).not.toHaveProperty('token');
    expect(settings.tlsPorts).toEqual([443, 0]);
    expect((settings.antiDetect as Record<string, boolean>).fragment).toBe(false);
    expect(context).not.toHaveProperty('evilNest');
  });
});
