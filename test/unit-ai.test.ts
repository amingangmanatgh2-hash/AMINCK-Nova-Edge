import { describe, expect, it } from 'vitest';
import {
  deterministicAiBuildPlan,
  gameIdsMentioned,
  parseAiBuildPlan,
} from '../src/ai';
import { GAME_CATALOG } from '../src/games';

describe('natural-language AI builder', () => {
  it('understands Persian low-ping Gaming requests and Persian digits', () => {
    const plan = deterministicAiBuildPlan('برای کالاف ۳۰ کانفیگ کمترین پینگ بساز، ۳ ساب آهنین و نت ملی مستقیم بماند');
    expect(plan.usageMode).toBe('gaming');
    expect(plan.gameIds).toContain('cod-mobile');
    expect(plan.paths).toBe(30);
    expect(plan.subscriptionCount).toBe(3);
    expect(plan.ironMode).toBe(true);
    expect(plan.speedPreset).toBe('latency');
    expect(plan.profileMode).toBe('auto');
    expect(plan.domesticDirect).toBe(true);
    expect(plan.ready).toBe(true);
  });

  it('recognizes common game aliases and the explicit all-games request', () => {
    expect(gameIdsMentioned('ماینکرفت و وارزون')).toEqual(expect.arrayContaining(['minecraft-java', 'warzone']));
    expect(gameIdsMentioned('همه بازی ها را انتخاب کن')).toHaveLength(GAME_CATALOG.length);
  });

  it('asks for a game instead of inventing one for a generic Gaming request', () => {
    const plan = deterministicAiBuildPlan('یک کانفیگ گیمینگ کم پینگ بساز');
    expect(plan.usageMode).toBe('gaming');
    expect(plan.gameIds).toEqual([]);
    expect(plan.ready).toBe(false);
    expect(plan.warnings[0]).toContain('حداقل یک بازی');
  });

  it('can explicitly turn Domestic Direct off', () => {
    const plan = deterministicAiBuildPlan('۱۰ کانفیگ معمولی بدون نت ملی مستقیم بساز');
    expect(plan.usageMode).toBe('normal');
    expect(plan.paths).toBe(10);
    expect(plan.domesticDirect).toBe(false);
  });

  it('honors explicit stability over the implicit Gaming low-ping default', () => {
    const plan = deterministicAiBuildPlan('برای وارزون یک کانفیگ پایدار با fallback بساز');
    expect(plan.usageMode).toBe('gaming');
    expect(plan.gameIds).toContain('warzone');
    expect(plan.speedPreset).toBe('stable');
    expect(plan.profileMode).toBe('fallback');
  });

  it('constrains model JSON to valid enums, limits and catalogue ids', () => {
    const fallback = deterministicAiBuildPlan('برای ماینکرفت 20 کانفیگ کم پینگ بساز');
    const parsed = parseAiBuildPlan({ response: JSON.stringify({
      paths: 999999,
      subscriptionCount: 99,
      usageMode: 'gaming',
      gameIds: ['minecraft-java', 'fake-game'],
      speedPreset: 'unsafe-fast',
      profileMode: 'unsafe-mode',
      ironMode: true,
      ironCount: 99,
      domesticDirect: true,
      dynamicPool: true,
      rotationMinutes: -8,
      useCleanCatalog: false,
      arbitraryHost: 'third-party.example',
    }) }, fallback);
    expect(parsed).not.toBeNull();
    expect(parsed!.paths).toBe(2000);
    expect(parsed!.subscriptionCount).toBe(10);
    expect(parsed!.gameIds).toEqual(['minecraft-java']);
    expect(parsed!.speedPreset).toBe('latency');
    expect(parsed!.profileMode).toBe('auto');
    expect(parsed!.ironCount).toBe(5);
    expect(parsed).not.toHaveProperty('arbitraryHost');
  });
});
