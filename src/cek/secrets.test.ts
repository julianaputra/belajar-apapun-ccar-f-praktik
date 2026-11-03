import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanSecrets } from './secrets.js';

// Dirangkai supaya berkas tes ini sendiri tidak terdeteksi pemindai.
const KEY = 'sk-ant-' + 'api03-' + 'a'.repeat(30);

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'cek-secrets-'));
}

describe('scanSecrets', () => {
  it('mendeteksi key di berkas biasa (bukan repo git)', () => {
    const d = tmp();
    writeFileSync(join(d, '.mcp.json'), `{"env":{"K":"${KEY}"}}`);
    expect(scanSecrets(d)).toEqual(['.mcp.json']);
  });

  it('tidak menandai .env.example yang kosong', () => {
    const d = tmp();
    writeFileSync(join(d, '.env.example'), 'ANTHROPIC_API_KEY=\n');
    expect(scanSecrets(d)).toEqual([]);
  });

  it('di repo git: memeriksa berkas yang di-track atau belum di-track, melewati yang di-ignore', () => {
    const d = tmp();
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: d });
    writeFileSync(join(d, '.gitignore'), '.env\n');
    writeFileSync(join(d, '.env'), `ANTHROPIC_API_KEY=${KEY}\n`);
    mkdirSync(join(d, 'docs'));
    writeFileSync(join(d, 'docs', 'catatan.md'), KEY);
    expect(scanSecrets(d)).toEqual([join('docs', 'catatan.md')]);
  });

  it('melewati node_modules saat fallback', () => {
    const d = tmp();
    mkdirSync(join(d, 'node_modules'));
    writeFileSync(join(d, 'node_modules', 'x.js'), KEY);
    expect(scanSecrets(d)).toEqual([]);
  });
});
