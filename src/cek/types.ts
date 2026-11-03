import { latestRun, type Project, type Run } from '../lib/log.js';

export type Hasil = { label: string; status: 'ok' | 'gagal' | 'manual'; pesan?: string };

/** Satu cek menerima root repo (folder tempat `pnpm cek` dijalankan). */
export type Cek = (root: string) => Promise<Hasil[]>;

export const ok = (label: string, pesan?: string): Hasil => ({ label, status: 'ok', ...(pesan ? { pesan } : {}) });
export const gagal = (label: string, pesan: string): Hasil => ({ label, status: 'gagal', pesan });
export const manual = (label: string, pesan?: string): Hasil => ({
  label,
  status: 'manual',
  ...(pesan ? { pesan } : {}),
});

/**
 * Run terakhir untuk label itu, atau Hasil `gagal` yang menyuruh peserta menjalankan perintahnya dulu.
 * Dipakai cek P1/P3/P4 supaya `pnpm cek` tanpa folder `logs/` tidak crash.
 */
export function requireRun(project: Project, label: string, perintah: string): Run | Hasil {
  const run = latestRun(project, label);
  if (run) return run;
  return gagal(`Run "${label}" ada`, `Jalankan \`${perintah}\` dulu.`);
}
