import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cekP2, pathsCocok } from './p2.js';
import type { Hasil } from './types.js';

const KEY = 'sk-ant-' + 'api03-' + 'b'.repeat(30);

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'cek-p2-'));
}
function tulis(root: string, rel: string, isi: string): void {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), isi);
}
/** Konfigurasi P2 sekecil mungkin yang meloloskan p2-1 sampai p2-4. */
function tulisKonfigLengkap(d: string): void {
  tulis(d, 'CLAUDE.md', '@docs/standards/api.md\n');
  tulis(d, 'docs/standards/api.md', 'x\n');
  tulis(d, '.claude/rules/testing.md', '---\npaths:\n  - "**/*.test.*"\n---\nx\n');
  tulis(d, '.claude/rules/api.md', '---\npaths:\n  - "src/api/**/*"\n---\nx\n');
  tulis(
    d,
    '.claude/skills/ringkas-modul/SKILL.md',
    '---\ncontext: fork\nallowed-tools: Read, Grep, Glob\ndisallowed-tools: Write, Edit\nargument-hint: <p>\n---\nx\n',
  );
  tulis(d, '.mcp.json', '{"mcpServers":{"toko":{"command":"x","env":{"A":"${A}"}}}}');
}
function salinLengkap(): string {
  const d = tmp();
  tulisKonfigLengkap(d);
  return d;
}
function git(cwd: string, ...args: string[]): string {
  return execFileSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args],
    { cwd, encoding: 'utf8' },
  );
}
function repo(branchUtama = 'main'): string {
  const d = tmp();
  git(d, 'init', '-q', '-b', branchUtama);
  tulis(d, 'a.txt', 'a');
  git(d, 'add', '.');
  git(d, 'commit', '-q', '-m', 'awal');
  return d;
}
function branchBaru(d: string): void {
  git(d, 'switch', '-q', '-c', 'latihan/plan-mode');
  tulis(d, 'b.txt', 'b');
  git(d, 'add', '.');
  git(d, 'commit', '-q', '-m', 'plan');
}
const gagal = (hs: Hasil[]) => hs.filter((h) => h.status === 'gagal');
const manual = (hs: Hasil[]) => hs.filter((h) => h.status === 'manual');
const pesanGagal = (hs: Hasil[]) => gagal(hs).map((h) => h.pesan).join(' ');

describe('pathsCocok', () => {
  it('**/*.test.* cocok dengan orders.test.ts, bukan orders.ts', () => {
    expect(pathsCocok(['**/*.test.*'], 'src/api/orders.test.ts')).toBe(true);
    expect(pathsCocok(['**/*.test.*'], 'src/api/orders.ts')).toBe(false);
  });
});

describe('p2-1', () => {
  it('fixture lengkap lulus dan menyisakan satu langkah manual', async () => {
    const hs = await cekP2['p2-1'](salinLengkap());
    expect(gagal(hs)).toEqual([]);
    expect(manual(hs)).toHaveLength(1);
  });
  it('folder kosong gagal dan menyebut CLAUDE.md', async () => {
    expect(pesanGagal(await cekP2['p2-1'](tmp()))).toContain('CLAUDE.md');
  });
  it('gagal kalau lebih dari 60 baris', async () => {
    const d = salinLengkap();
    tulis(d, 'CLAUDE.md', '@docs/standards/api.md\n' + 'x\n'.repeat(70));
    expect(pesanGagal(await cekP2['p2-1'](d))).toContain('60');
  });
  it('gagal kalau tidak mengimpor api.md', async () => {
    const d = salinLengkap();
    tulis(d, 'CLAUDE.md', '# saja\n');
    expect(pesanGagal(await cekP2['p2-1'](d))).toContain('@docs/standards/api.md');
  });
  it('gagal kalau docs/standards/api.md tidak ada', async () => {
    const d = salinLengkap();
    rmSync(join(d, 'docs/standards/api.md'));
    expect(pesanGagal(await cekP2['p2-1'](d))).toContain('docs/standards/api.md');
  });
});

describe('p2-2', () => {
  it('fixture lengkap lulus', async () => {
    const hs = await cekP2['p2-2'](salinLengkap());
    expect(gagal(hs)).toEqual([]);
    expect(manual(hs)).toHaveLength(1);
  });
  it('folder kosong gagal dan menyebut testing.md', async () => {
    expect(pesanGagal(await cekP2['p2-2'](tmp()))).toContain('.claude/rules/testing.md');
  });
  it('gagal kalau paths testing ikut mencocokkan file biasa', async () => {
    const d = salinLengkap();
    tulis(d, '.claude/rules/testing.md', '---\npaths:\n  - "src/**/*"\n---\nx\n');
    expect(pesanGagal(await cekP2['p2-2'](d))).toContain('orders.ts');
  });
  it('gagal kalau testing.md tanpa paths', async () => {
    const d = salinLengkap();
    tulis(d, '.claude/rules/testing.md', 'tanpa frontmatter\n');
    expect(pesanGagal(await cekP2['p2-2'](d))).toContain('paths');
  });
  it('gagal kalau tidak ada rule lain untuk src/api/', async () => {
    const d = salinLengkap();
    rmSync(join(d, '.claude/rules/api.md'));
    expect(pesanGagal(await cekP2['p2-2'](d))).toContain('src/api/');
  });
});

describe('p2-3', () => {
  const skill = '.claude/skills/ringkas-modul/SKILL.md';
  it('fixture lengkap lulus', async () => {
    const hs = await cekP2['p2-3'](salinLengkap());
    expect(gagal(hs)).toEqual([]);
    expect(manual(hs)).toHaveLength(1);
  });
  it('folder kosong gagal dan menyebut SKILL.md', async () => {
    expect(pesanGagal(await cekP2['p2-3'](tmp()))).toContain('SKILL.md');
  });
  it('gagal kalau disallowed-tools tidak memuat Edit', async () => {
    const d = salinLengkap();
    tulis(d, skill, readFileSync(join(d, skill), 'utf8').replace('Write, Edit', 'Write'));
    expect(pesanGagal(await cekP2['p2-3'](d))).toContain('Edit');
  });
  it('menerima daftar YAML, menolak tanpa context: fork', async () => {
    const d = salinLengkap();
    tulis(
      d,
      skill,
      '---\nname: r\nallowed-tools: [Read, Grep, Glob]\ndisallowed-tools: [Write, Edit]\nargument-hint: <p>\n---\nx\n',
    );
    const pesan = pesanGagal(await cekP2['p2-3'](d));
    expect(pesan).toContain('context: fork');
    expect(pesan).not.toContain('allowed-tools');
  });
});

describe('p2-4', () => {
  it('fixture lengkap lulus', async () => {
    const hs = await cekP2['p2-4'](salinLengkap());
    expect(gagal(hs)).toEqual([]);
    expect(manual(hs)).toHaveLength(1);
  });
  it('folder kosong gagal dan menyebut .mcp.json', async () => {
    expect(pesanGagal(await cekP2['p2-4'](tmp()))).toContain('.mcp.json');
  });
  it('gagal kalau server toko tidak ada', async () => {
    const d = salinLengkap();
    tulis(d, '.mcp.json', '{"mcpServers":{"lain":{"command":"x"}}}');
    expect(pesanGagal(await cekP2['p2-4'](d))).toContain('toko');
  });
  it('gagal kalau nilai env ditulis langsung', async () => {
    const d = salinLengkap();
    tulis(d, '.mcp.json', '{"mcpServers":{"toko":{"command":"x","env":{"TOKEN":"abc123"}}}}');
    expect(pesanGagal(await cekP2['p2-4'](d))).toContain('TOKEN');
  });
  it('gagal kalau ada API key di berkas', async () => {
    const d = salinLengkap();
    tulis(d, 'catatan.md', KEY);
    expect(pesanGagal(await cekP2['p2-4'](d))).toContain('catatan.md');
  });
  it('gagal dengan pesan jelas kalau JSON rusak', async () => {
    const d = salinLengkap();
    tulis(d, '.mcp.json', '{rusak');
    expect(pesanGagal(await cekP2['p2-4'](d))).toContain('JSON');
  });
});

describe('p2-5', () => {
  it('lulus: branch punya commit yang belum ada di main', async () => {
    const d = repo();
    branchBaru(d);
    git(d, 'switch', '-q', 'main');
    const hs = await cekP2['p2-5'](d);
    expect(gagal(hs)).toEqual([]);
    expect(manual(hs)).toHaveLength(1);
  });
  it('lulus di repo dengan branch master', async () => {
    const d = repo('master');
    branchBaru(d);
    expect(gagal(await cekP2['p2-5'](d))).toEqual([]);
  });
  it('gagal kalau branch tidak ada', async () => {
    expect(pesanGagal(await cekP2['p2-5'](repo()))).toContain('latihan/plan-mode');
  });
  it('gagal kalau branch belum punya commit baru', async () => {
    const d = repo();
    git(d, 'branch', 'latihan/plan-mode');
    expect(gagal(await cekP2['p2-5'](d))).toHaveLength(1);
  });
  it('gagal kalau sudah di-merge ke main', async () => {
    const d = repo();
    branchBaru(d);
    git(d, 'switch', '-q', 'main');
    git(d, 'merge', '-q', 'latihan/plan-mode');
    expect(pesanGagal(await cekP2['p2-5'](d))).toContain('merge');
  });
  it('gagal kalau bukan repo git', async () => {
    expect(pesanGagal(await cekP2['p2-5'](tmp()))).toContain('git');
  });
});
