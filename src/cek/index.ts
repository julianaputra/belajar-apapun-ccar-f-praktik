import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cekP1 } from './p1.js';
import { cekP2, hasilSecret } from './p2.js';
import { cekP3 } from './p3.js';
import { cekP4 } from './p4.js';
import { gagal, manual, type Cek, type Hasil } from './types.js';

export { requireRun } from './types.js';
export type { Cek, Hasil } from './types.js';

/** Registry kunci → cek. Task berikutnya cukup menambah `...cekP3`, dst. */
export const CEK: Record<string, Cek> = {
  ...cekP1,
  ...cekP2,
  ...cekP3,
  ...cekP4,
};

const IKON = { ok: '✅', gagal: '❌', manual: '⬜' } as const;

function baris(h: Hasil): string {
  return `${IKON[h.status]} ${h.label}${h.pesan ? ` (${h.pesan})` : ''}`;
}

/** Menjalankan satu kunci. Mengembalikan baris keluaran dan kode keluar; tidak mencetak apa pun. */
export async function jalankan(
  kunci: string | undefined,
  root: string,
  registry: Record<string, Cek> = CEK,
  pindai: (root: string) => Hasil = hasilSecret,
): Promise<{ code: number; lines: string[] }> {
  const cek = kunci !== undefined && Object.hasOwn(registry, kunci) ? registry[kunci] : undefined;
  if (!cek) {
    const valid = Object.keys(registry).sort();
    return {
      code: 1,
      lines: [
        kunci ? `Kunci "${kunci}" tidak dikenal.` : 'Sebutkan kunci cek, misalnya: pnpm cek p2-1',
        `Kunci yang valid: ${valid.join(', ')}`,
      ],
    };
  }
  let hasil: Hasil[];
  try {
    hasil = await cek(root);
  } catch (err) {
    const pesan = (err instanceof Error ? err.message : String(err)).split('\n')[0];
    hasil = [gagal(`Cek ${kunci} error`, pesan)];
  }
  try {
    const rahasia = pindai(root);
    if (rahasia.status === 'gagal' && !hasil.some((h) => h.label === rahasia.label)) hasil.push(rahasia);
  } catch (err) {
    const pesan = (err instanceof Error ? err.message : String(err)).split('\n')[0];
    hasil.push(manual('Pemindaian secret gagal', pesan));
  }
  return { code: hasil.some((h) => h.status === 'gagal') ? 1 : 0, lines: hasil.map(baris) };
}

const dijalankanLangsung = (() => {
  try {
    return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (dijalankanLangsung) {
  jalankan(process.argv[2], process.cwd()).then(({ code, lines }) => {
    console.log(lines.join('\n'));
    process.exit(code);
  });
}
