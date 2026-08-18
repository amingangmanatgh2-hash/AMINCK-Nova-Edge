import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { UI_APP_CSS, UI_APP_JS, UI_SHELL_HTML } from '../src/ui';

describe('artifact checks (runtime smoke steps)', () => {
  it('browser JavaScript passes node --check', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nova-ui-check-'));
    const file = join(dir, 'app.js');
    writeFileSync(file, UI_APP_JS, 'utf8');
    try {
      execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('git diff --check is clean (no whitespace errors)', () => {
    const out = execFileSync('git', ['diff', '--check'], { encoding: 'utf8', cwd: process.cwd() });
    expect(out.trim()).toBe('');
  });

  it('public/ static assets match the embedded UI strings (single source of truth)', () => {
    const js = readFileSync('public/app.js', 'utf8');
    const css = readFileSync('public/app.css', 'utf8');
    const html = readFileSync('public/index.html', 'utf8');
    expect(js).toBe(UI_APP_JS);
    expect(css).toBe(UI_APP_CSS);
    expect(html).toContain(UI_SHELL_HTML.replace('{TITLE}', 'AMINCK GOD Edition'));
    // the committed assets are also valid JS
    execFileSync(process.execPath, ['--check', 'public/app.js'], { stdio: 'pipe', cwd: process.cwd() });
  });

  it('no secrets or .dev.vars are tracked in git', () => {
    const out = execFileSync('git', ['ls-files'], { encoding: 'utf8', cwd: process.cwd() });
    const tracked = out.split('\n');
    expect(tracked.filter((l) => l === '.dev.vars' || l === '.env').length).toBe(0);
    // the example file must exist in the working tree and be ignored-safe
    const example = readFileSync('.dev.vars.example', 'utf8');
    expect(example.length).toBeGreaterThan(0);
    expect(example).toContain('ADMIN_PASSWORD');
    expect(example).toContain('SESSION_SECRET');
    const gitignore = readFileSync('.gitignore', 'utf8');
    expect(gitignore).toContain('.dev.vars');
  });

  it('capability manifest satisfies the contract', async () => {
    const { CAPABILITIES, ownerCapabilitiesCount } = await import('../src/capabilities');
    expect(CAPABILITIES.length).toBeGreaterThanOrEqual(150);
    expect(ownerCapabilitiesCount()).toBeGreaterThanOrEqual(50);
  });
});
