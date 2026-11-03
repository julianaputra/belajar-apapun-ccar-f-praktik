import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { startRun } from '../lib/log.js';
import { CEK, jalankan, requireRun } from './index.js';
import type { Hasil } from './types.js';

const KEY = 'sk-ant-' + 'api03-' + 'c'.repeat(30);
const asli = process.env.LOG_DIR;
afterEach(() => {
  if (asli === undefined) delete process.env.LOG_DIR;
  else process.env.LOG_DIR = asli;
});

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'cek-index-'));
}

describe('registry', () => {
  it('memuat p2-1 sampai p2-5', () => {
    for (const k of ['p2-1', 'p2-2', 'p2-3', 'p2-4', 'p2-5']) expect(CEK[k]).toBeTypeOf('function');
  });
  it('memuat p4-1 sampai p4-4', () => {
    for (const k of ['p4-1', 'p4-2', 'p4-3', 'p4-4']) expect(CEK[k]).toBeTypeOf('function');
  });
});

describe('jalankan', () => {
  it('kunci asal-asalan: kode 1 dan daftar kunci yang valid', async () => {
    const { code, lines } = await jalankan('asal-asalan', tmp(), {
      'p9-1': async () => [],
      'p9-2': async () => [],
    });
    expect(code).toBe(1);
    const teks = lines.join('\n');
    expect(teks).toContain('p9-1');
    expect(teks).toContain('p9-2');
  });

  it('tanpa kunci: kode 1 dan daftar kunci', async () => {
    const { code, lines } = await jalankan(undefined, tmp(), { 'p9-1': async () => [] });
    expect(code).toBe(1);
    expect(lines.join('\n')).toContain('p9-1');
  });

  it('exception di dalam cek menjadi satu baris gagal tanpa stack trace', async () => {
    const { code, lines } = await jalankan('x-1', tmp(), {
      'x-1': async () => {
        throw new Error('meledak');
      },
    });
    expect(code).toBe(1);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^❌ /);
    expect(lines[0]).toContain('meledak');
    expect(lines.join('\n')).not.toContain(' at ');
  });

  it('mencetak ✅ ❌ ⬜ dan kode 0 bila tidak ada gagal', async () => {
    const hasil: Hasil[] = [
      { label: 'satu', status: 'ok' },
      { label: 'dua', status: 'manual', pesan: 'cek sendiri' },
    ];
    const { code, lines } = await jalankan('x-1', tmp(), { 'x-1': async () => hasil });
    expect(code).toBe(0);
    expect(lines).toEqual(['✅ satu', '⬜ dua (cek sendiri)']);
  });

  it('pemindai secret yang error menjadi baris manual yang terlihat, bukan hilang', async () => {
    const { code, lines } = await jalankan(
      'x-1',
      tmp(),
      { 'x-1': async () => [{ label: 'satu', status: 'ok' }] },
      () => {
        throw new Error('git rusak');
      },
    );
    expect(code).toBe(0);
    expect(lines).toContain('⬜ Pemindaian secret gagal (git rusak)');
  });

  it('menambahkan baris gagal kalau ada secret, untuk cek apa pun', async () => {
    const d = tmp();
    writeFileSync(join(d, 'rahasia.txt'), KEY);
    const { code, lines } = await jalankan('x-1', d, { 'x-1': async () => [{ label: 'satu', status: 'ok' }] });
    expect(code).toBe(1);
    expect(lines.join('\n')).toContain('rahasia.txt');
  });
});

describe('requireRun', () => {
  it('tanpa folder logs/: Hasil gagal yang menyarankan perintah', () => {
    process.env.LOG_DIR = join(tmp(), 'tidak-ada');
    const r = requireRun('p1', 'a', 'pnpm p1 a');
    expect('status' in r && r.status).toBe('gagal');
    expect((r as Hasil).pesan).toBe('Jalankan `pnpm p1 a` dulu.');
  });

  it('mengembalikan run terakhir untuk label itu, bukan run lama', () => {
    process.env.LOG_DIR = tmp();
    startRun('p1', 'a', 'lama').log('x');
    startRun('p1', 'b', 'lain').log('x');
    startRun('p1', 'a', 'baru').log('x');
    const r = requireRun('p1', 'a', 'pnpm p1 a');
    expect('runId' in r && r.runId).toBe('baru');
  });
});
