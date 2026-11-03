import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const POLA = /sk-ant-[A-Za-z0-9_-]{20,}/;
const LEWATI = new Set(['node_modules', '.git', 'logs', 'hasil', '.env']);
const MAKS_BYTE = 1_000_000;

function daftarGit(root: string): string[] | null {
  try {
    const out = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.split('\0').filter(Boolean);
  } catch {
    return null;
  }
}

function daftarSemua(root: string, dir = ''): string[] {
  const hasil: string[] = [];
  for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
    if (LEWATI.has(e.name)) continue;
    const rel = join(dir, e.name);
    if (e.isDirectory()) hasil.push(...daftarSemua(root, rel));
    else if (e.isFile()) hasil.push(rel);
  }
  return hasil;
}

/**
 * Path (relatif ke root) berkas yang memuat pola API key Anthropic.
 * Di repo git: berkas yang di-track plus yang belum di-track tapi tidak di-ignore
 * (supaya secret ketahuan sebelum `git add`). Di luar git: semua berkas kecuali node_modules, logs, hasil, .env.
 */
export function scanSecrets(root: string): string[] {
  const files = daftarGit(root) ?? daftarSemua(root);
  const temuan: string[] = [];
  for (const rel of files) {
    try {
      const p = join(root, rel);
      const st = statSync(p);
      if (!st.isFile() || st.size > MAKS_BYTE) continue;
      if (POLA.test(readFileSync(p, 'utf8'))) temuan.push(rel);
    } catch {
      // berkas hilang atau tidak terbaca: lewati
    }
  }
  return temuan.sort();
}
