import { describe, expect, it } from 'vitest';
import {
  CAPABILITIES,
  capabilitiesByCategory,
  ownerCapabilitiesCount,
  totalCapabilities,
} from '../src/capabilities';

describe('capability manifest', () => {
  it('contains at least 150 real capabilities', () => {
    expect(totalCapabilities()).toBeGreaterThanOrEqual(150);
    expect(CAPABILITIES.length).toBeGreaterThanOrEqual(150);
  });

  it('contains at least 50 owner/administrator management capabilities', () => {
    expect(ownerCapabilitiesCount()).toBeGreaterThanOrEqual(50);
  });

  it('has unique ids and titles', () => {
    const ids = CAPABILITIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    const titles = CAPABILITIES.map((c) => c.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('has no empty descriptions or titles', () => {
    for (const c of CAPABILITIES) {
      expect(c.title.trim().length).toBeGreaterThanOrEqual(3);
      expect(c.description.trim().length).toBeGreaterThan(10);
      expect(c.id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('covers the required feature areas', () => {
    const cats = capabilitiesByCategory();
    for (const cat of ['protocol', 'traffic', 'config', 'sub', 'scanner', 'security', 'owner', 'ui', 'deploy', 'settings']) {
      expect((cats[cat] ?? 0)).toBeGreaterThan(0);
    }
  });

  it('does not contain placeholder or advertising text', () => {
    const text = CAPABILITIES.map((c) => c.title + c.description).join(' ');
    for (const bad of ['TBD', 'TODO', 'placeholder', 'بزودی', 'زودتر از همه', 'سریع‌ترین']) {
      expect(text.toLowerCase()).not.toContain(bad);
    }
  });
});
