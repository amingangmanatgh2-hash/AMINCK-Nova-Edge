import { describe, expect, it } from 'vitest';
import {
  GAME_CATALOG,
  gameDomainsFor,
  publicGameCatalog,
  sanitizeGameIds,
} from '../src/games';

describe('gaming catalogue', () => {
  it('contains a large, unique and selectable catalogue', () => {
    expect(GAME_CATALOG.length).toBeGreaterThanOrEqual(170);
    expect(new Set(GAME_CATALOG.map((game) => game.id)).size).toBe(GAME_CATALOG.length);
    expect(new Set(GAME_CATALOG.map((game) => game.title)).size).toBe(GAME_CATALOG.length);
    expect(GAME_CATALOG.some((game) => /Call of Duty/i.test(game.title))).toBe(true);
    expect(GAME_CATALOG.some((game) => /Minecraft/i.test(game.title))).toBe(true);
  });

  it('uses normalized ids and hostname suffixes rather than URLs or fake hosts', () => {
    for (const game of GAME_CATALOG) {
      expect(game.id).toMatch(/^[a-z0-9-]+$/);
      expect(game.title.trim().length).toBeGreaterThan(1);
      expect(game.publisher.trim().length).toBeGreaterThan(1);
      expect(game.domains.length).toBeGreaterThan(0);
      for (const domain of game.domains) {
        expect(domain).toBe(domain.toLowerCase());
        expect(domain).toMatch(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/);
        expect(domain).not.toContain('://');
        expect(domain).not.toContain('*');
      }
    }
  });

  it('sanitizes untrusted selections and deduplicates shared publisher domains', () => {
    expect(sanitizeGameIds(['cod-mobile', 'bogus', 'cod-mobile', 123])).toEqual(['cod-mobile']);
    expect(sanitizeGameIds('cod-mobile')).toEqual([]);
    const domains = gameDomainsFor(['cod-mobile', 'warzone', 'bogus']);
    expect(domains).toContain('callofduty.com');
    expect(domains).toContain('activision.com');
    expect(new Set(domains).size).toBe(domains.length);
  });

  it('keeps routing domains private while exposing safe picker metadata', () => {
    const publicRows = publicGameCatalog();
    expect(publicRows).toHaveLength(GAME_CATALOG.length);
    expect(publicRows[0]).not.toHaveProperty('domains');
  });
});
