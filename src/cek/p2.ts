import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import picomatch from 'picomatch';
import { parse } from 'yaml';
import { scanSecrets } from './secrets.js';
import { gagal, manual, ok, type Cek, type Hasil } from './types.js';

type Frontmatter = Record<string, unknown>;

/** Frontmatter YAML di awal berkas Markdown; `{}` kalau tidak ada. Melempar kalau YAML-nya rusak. */
function bacaFrontmatter(teks: string): Frontmatter {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(teks);
  if (!m) return {};
  const data: unknown = parse(m[1]);
  return data && typeof data === 'object' ? (data as Frontmatter) : {};
}

/** Nilai string atau daftar → array string. "Read, Grep" dan [Read, Grep] sama saja. */
function daftar(nilai: unknown): string[] {
  if (Array.isArray(nilai)) return nilai.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof nilai === 'string') return nilai.split(/[,\s]+/).filter(Boolean);
  return [];
}

export function pathsCocok(pola: string[], path: string): boolean {
  return pola.length > 0 && picomatch(pola, { dot: true })(path);
}

function baca(root: string, rel: string): string | null {
  const p = join(root, rel);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

const p21: Cek = async (root) => {
  const teks = baca(root, 'CLAUDE.md');
  if (teks === null) return [gagal('CLAUDE.md', 'Berkas CLAUDE.md belum ada di root repo.')];
  const hasil: Hasil[] = [];
  const baris = teks.replace(/\n$/, '').split('\n').length;
  hasil.push(
    baris <= 60
      ? ok('CLAUDE.md ≤ 60 baris', `${baris} baris`)
      : gagal('CLAUDE.md ≤ 60 baris', `Sekarang ${baris} baris, batasnya 60. Pindahkan bagian panjang ke docs/.`),
  );
  if (!teks.includes('@docs/standards/api.md')) {
    hasil.push(gagal('CLAUDE.md mengimpor standar API', 'Tambahkan baris @docs/standards/api.md di CLAUDE.md.'));
  } else if (!existsSync(join(root, 'docs/standards/api.md'))) {
    hasil.push(gagal('CLAUDE.md mengimpor standar API', 'Berkas docs/standards/api.md belum ada.'));
  } else {
    hasil.push(ok('CLAUDE.md mengimpor docs/standards/api.md'));
  }
  hasil.push(manual('/memory menampilkan 3 sumber', 'Jalankan /memory: CLAUDE.md project, file import, CLAUDE.md user.'));
  return hasil;
};

const p22: Cek = async (root) => {
  const hasil: Hasil[] = [];
  const teks = baca(root, '.claude/rules/testing.md');
  if (teks === null) {
    hasil.push(gagal('Rule testing', 'Berkas .claude/rules/testing.md belum ada.'));
  } else {
    const paths = daftar(bacaFrontmatter(teks).paths);
    if (paths.length === 0) {
      hasil.push(gagal('Rule testing', 'testing.md belum punya frontmatter paths.'));
    } else if (!pathsCocok(paths, 'src/api/orders.test.ts')) {
      hasil.push(gagal('Rule testing', 'paths di testing.md tidak cocok dengan src/api/orders.test.ts.'));
    } else if (pathsCocok(paths, 'src/api/orders.ts')) {
      hasil.push(gagal('Rule testing', 'paths di testing.md juga cocok dengan src/api/orders.ts. Persempit ke file test.'));
    } else {
      hasil.push(ok('Rule testing hanya cocok dengan file test'));
    }
  }
  const dir = join(root, '.claude/rules');
  const lain = existsSync(dir)
    ? readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'testing.md')
    : [];
  const mencakupApi = lain.some((f) => {
    try {
      return pathsCocok(daftar(bacaFrontmatter(readFileSync(join(dir, f), 'utf8')).paths), 'src/api/orders.ts');
    } catch {
      return false;
    }
  });
  hasil.push(
    mencakupApi
      ? ok('Ada rule untuk src/api/')
      : gagal('Rule untuk src/api/', 'Buat satu rule lagi di .claude/rules/ dengan paths yang mencakup src/api/.'),
  );
  hasil.push(manual('Catatan percobaan', 'Catat prompt dan hasil edit file biasa vs file test.'));
  return hasil;
};

const p23: Cek = async (root) => {
  const rel = '.claude/skills/ringkas-modul/SKILL.md';
  const teks = baca(root, rel);
  if (teks === null) return [gagal('Skill ringkas-modul', `Berkas ${rel} belum ada.`)];
  const fm = bacaFrontmatter(teks);
  const hasil: Hasil[] = [];
  const periksa = (label: string, lulus: boolean, pesanGagal: string) =>
    hasil.push(lulus ? ok(label) : gagal(label, pesanGagal));
  periksa('context: fork', fm.context === 'fork', 'Tambahkan context: fork di frontmatter SKILL.md.');
  const allowed = daftar(fm['allowed-tools']);
  const kurang = ['Read', 'Grep', 'Glob'].filter((t) => !allowed.includes(t));
  periksa('allowed-tools', kurang.length === 0, `allowed-tools belum memuat: ${kurang.join(', ')}.`);
  const disallowed = daftar(fm['disallowed-tools']);
  const kurangD = ['Write', 'Edit'].filter((t) => !disallowed.includes(t));
  periksa('disallowed-tools', kurangD.length === 0, `disallowed-tools belum memuat: ${kurangD.join(', ')}.`);
  periksa('argument-hint', daftar(fm['argument-hint']).length > 0, 'Tambahkan argument-hint, misalnya <path-folder>.');
  hasil.push(manual('Uji fork', 'Panggil /ringkas-modul src/ dan minta menyimpan ke file. Harus ditolak.'));
  return hasil;
};

const ENV_REF = /^\$\{[A-Za-z_][A-Za-z0-9_]*(:-[^}]*)?\}$/;

/** Hasil pemindaian secret, dipakai p2-4 dan runner. */
export function hasilSecret(root: string): Hasil {
  const temuan = scanSecrets(root);
  return temuan.length === 0
    ? ok('Tidak ada API key di berkas repo')
    : gagal('API key ditemukan di berkas repo', `Hapus dari: ${temuan.join(', ')}. Pakai \${NAMA_ENV}.`);
}

const p24: Cek = async (root) => {
  const hasil: Hasil[] = [];
  const teks = baca(root, '.mcp.json');
  if (teks === null) {
    hasil.push(gagal('.mcp.json', 'Berkas .mcp.json belum ada di root repo.'));
  } else {
    let data: { mcpServers?: Record<string, { env?: Record<string, unknown> }> } | null = null;
    try {
      data = JSON.parse(teks);
    } catch {
      hasil.push(gagal('.mcp.json', 'Isi .mcp.json bukan JSON yang valid.'));
    }
    if (data) {
      const toko = data.mcpServers?.toko;
      if (!toko) {
        hasil.push(gagal('Server toko', 'Tambahkan server bernama "toko" di mcpServers pada .mcp.json.'));
      } else {
        hasil.push(ok('Server toko ada'));
        const buruk = Object.entries(toko.env ?? {})
          .filter(([, v]) => typeof v !== 'string' || !ENV_REF.test(v))
          .map(([k]) => k);
        hasil.push(
          buruk.length === 0
            ? ok('Nilai env memakai ${...}')
            : gagal('Nilai env memakai ${...}', `Env ini ditulis langsung: ${buruk.join(', ')}. Ganti jadi \${NAMA_ENV}.`),
        );
      }
    }
  }
  hasil.push(hasilSecret(root));
  hasil.push(manual('/mcp menampilkan dua server', 'Server toko (project) dan satu server pribadi (scope user).'));
  return hasil;
};

const BRANCH = 'latihan/plan-mode';

function git(root: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

const p25: Cek = async (root) => {
  try {
    git(root, 'rev-parse', '--git-dir');
  } catch {
    return [gagal('Branch latihan', 'Folder ini bukan repo git. Jalankan dari root repo.')];
  }
  const hasil: Hasil[] = [];
  const ada = (ref: string) => {
    try {
      git(root, 'rev-parse', '--verify', '--quiet', `refs/heads/${ref}`);
      return true;
    } catch {
      return false;
    }
  };
  const utama = ada('main') ? 'main' : ada('master') ? 'master' : null;
  if (!ada(BRANCH)) {
    hasil.push(gagal(`Branch ${BRANCH}`, `Branch ${BRANCH} belum ada. Buat dengan: git switch -c ${BRANCH}`));
  } else if (!utama) {
    hasil.push(gagal(`Branch ${BRANCH}`, 'Branch main (atau master) tidak ditemukan sebagai pembanding.'));
  } else {
    const gabung = (() => {
      try {
        git(root, 'merge-base', '--is-ancestor', BRANCH, utama);
        return true;
      } catch {
        return false;
      }
    })();
    const baru = Number(git(root, 'rev-list', '--count', `${utama}..${BRANCH}`));
    if (gabung) {
      hasil.push(gagal(`Branch ${BRANCH}`, `Branch sudah di-merge ke ${utama} (atau belum punya commit sendiri). Commit hasil plan mode di branch itu, jangan di-merge.`));
    } else if (baru < 1) {
      hasil.push(gagal(`Branch ${BRANCH}`, `Belum ada commit baru di branch ini yang tidak ada di ${utama}.`));
    } else {
      hasil.push(ok(`Branch ${BRANCH} punya ${baru} commit yang belum ada di ${utama}`));
    }
  }
  hasil.push(manual('Tabel tiga tugas di spreadsheet', 'Tempel tabel (tugas, mode, revisi, catatan) di kolom Link hasil.'));
  return hasil;
};

export const cekP2: Record<string, Cek> = {
  'p2-1': p21,
  'p2-2': p22,
  'p2-3': p23,
  'p2-4': p24,
  'p2-5': p25,
};
