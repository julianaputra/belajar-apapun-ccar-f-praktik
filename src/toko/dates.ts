// Tanggal di data toko punya tiga format: "2026-10-12", "12/10/2026", "12 Okt 2026".
// Helper ini hanya dipakai di dalam server (jendela refund). Keluaran tool tidak dinormalkan.

const DAY_MS = 86_400_000;

const BULAN: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, mei: 4, jun: 5,
  jul: 6, agu: 7, sep: 8, okt: 9, nov: 10, des: 11,
};

function utc(y: number, m: number, d: number): Date | undefined {
  const date = new Date(Date.UTC(y, m, d));
  // Tolak tanggal yang "meluap" (misalnya 31/02).
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m || date.getUTCDate() !== d) return undefined;
  return date;
}

/** Ubah string tanggal toko menjadi Date (UTC, tengah malam). Format tak dikenal → undefined. */
export function parseTanggal(text: string): Date | undefined {
  const s = text.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return utc(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return utc(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  m = /^(\d{1,2}) ([A-Za-z]{3}) (\d{4})$/.exec(s);
  if (m) {
    const bulan = BULAN[m[2]!.toLowerCase()];
    if (bulan !== undefined) return utc(Number(m[3]), bulan, Number(m[1]));
  }
  return undefined;
}

/** "Hari ini" toko: tetap 2026-11-02 supaya jendela 30 hari sama selama program. TOKO_HARI_INI=YYYY-MM-DD menggantikan. */
export function today(): Date {
  const override = process.env.TOKO_HARI_INI?.trim();
  return (override ? parseTanggal(override) : undefined) ?? new Date(Date.UTC(2026, 10, 2));
}

/** Jumlah hari dari tanggal itu sampai "hari ini". undefined kalau format tak dikenal. */
export function daysSince(text: string): number | undefined {
  const d = parseTanggal(text);
  if (!d) return undefined;
  return Math.round((today().getTime() - d.getTime()) / DAY_MS);
}
