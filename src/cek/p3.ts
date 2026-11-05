import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readRuns, type LogEvent, type Run } from '../lib/log.js';
import { gagal, manual, ok, requireRun, type Cek, type Hasil } from './types.js';

type Kunci = {
  dokumenTanpaField: { doc: string; field: string };
  /** Dokumen yang total tertulisnya memang tidak sama dengan jumlah item. */
  dokumenSelisihTotal: { doc: string; total: number; calculated_total: number };
  dokumenTakBisaDiperbaiki: string;
};

function bacaKunci(root: string): Kunci | Hasil {
  const path = join(root, 'p3', 'kunci.json');
  if (!existsSync(path)) return gagal('p3/kunci.json', 'Berkas p3/kunci.json tidak ada. Jalankan pnpm cek dari root starter.');
  try {
    const kunci = JSON.parse(readFileSync(path, 'utf8')) as Kunci;
    if (!kunci.dokumenSelisihTotal) {
      return gagal('p3/kunci.json', 'p3/kunci.json versi lama. Perbarui berkas starter (lihat "Memperbarui starter" di README).');
    }
    return kunci;
  } catch {
    return gagal('p3/kunci.json', 'Isi p3/kunci.json bukan JSON yang valid.');
  }
}

const adalahHasil = (x: unknown): x is Hasil => typeof x === 'object' && x !== null && 'status' in x && 'label' in x;
const adalahRun = (x: Run | Hasil): x is Run => 'events' in x;

const p31: Cek = async (root) => {
  const kunci = bacaKunci(root);
  if (adalahHasil(kunci)) return [kunci];
  const { doc, field } = kunci.dokumenTanpaField;
  const run = requireRun('p3', `satu:${doc}`, `pnpm p3 satu ${doc}`);
  if (!adalahRun(run)) return [run];

  const hasil: Hasil[] = [];
  const requests = run.events.filter((e) => e.event === 'request');
  const forced = requests.length > 0 && requests.every((e) => (e.tool_choice as { type?: string } | undefined)?.type === 'tool');
  hasil.push(
    forced
      ? ok('Memakai tool_choice yang dipaksa')
      : gagal('Memakai tool_choice yang dipaksa', 'Request harus memakai tool_choice {type: "tool", name: ...}, supaya hasilnya selalu lewat tool.'),
  );

  const ev = run.events.find((e) => e.event === 'hasil');
  const data = ev?.data as Record<string, unknown> | undefined;
  if (!data) {
    hasil.push(gagal(`Field ${field} bernilai null`, `Run satu:${doc} belum mencatat event hasil. Pastikan extractOne berhasil dan run.ts dijalankan sampai selesai.`));
  } else if (!(field in data)) {
    hasil.push(gagal(`Field ${field} bernilai null`, `Hasil tidak punya field "${field}". Tambahkan di input_schema sebagai field nullable.`));
  } else if (data[field] !== null) {
    hasil.push(gagal(`Field ${field} bernilai null`, `Dokumen ${doc} tidak mencantumkan ${field}, tapi hasilnya ${JSON.stringify(data[field])}. Izinkan null dan larang model mengarang.`));
  } else {
    hasil.push(ok(`Field ${field} bernilai null untuk ${doc}`));
  }
  return hasil;
};

type PerDokumen = { attempts: number; hasil?: LogEvent };

/** Percobaan per dokumen = jumlah event request antara dokumen_mulai dan hasil. */
function perDokumen(run: Run): Map<string, PerDokumen> {
  const peta = new Map<string, PerDokumen>();
  let sekarang: PerDokumen | undefined;
  for (const e of run.events) {
    if (e.event === 'dokumen_mulai') {
      sekarang = { attempts: 0 };
      peta.set(String(e.doc), sekarang);
    } else if (e.event === 'request') {
      if (sekarang) sekarang.attempts++;
    } else if (e.event === 'hasil') {
      if (sekarang) sekarang.hasil = e;
      sekarang = undefined;
    }
  }
  return peta;
}

/**
 * Retry yang berhasil: dokumen mana pun (selain dokumen buntu) yang butuh lebih dari satu percobaan lalu lolos.
 * Model tidak selalu salah di percobaan pertama, jadi run tanpa retry sama sekali dinilai manual, bukan gagal.
 */
function cekRetry(docs: Map<string, PerDokumen>, buntu: string, selisih: string): Hasil {
  const label = 'Retry yang berhasil';
  const lain = [...docs].filter(([id, d]) => id !== buntu && d.hasil);
  const berhasil = lain.filter(([, d]) => d.attempts > 1 && d.hasil?.ok === true);
  if (berhasil.length > 0) {
    return ok(label, berhasil.map(([id, d]) => `${id}: ${d.attempts} percobaan`).join(', '));
  }
  // Dokumen selisih dinilai sendiri oleh cekSelisih.
  const gagalRetry = lain.filter(([id, d]) => id !== selisih && d.attempts > 1 && d.hasil?.ok !== true);
  if (gagalRetry.length > 0) {
    const [id, d] = gagalRetry[0];
    return gagal(label, `${id}: sudah ${d.attempts} percobaan tapi tetap gagal: ${JSON.stringify(d.hasil?.errors)}. Pastikan retry mengirim dokumen asli, hasil yang gagal, dan error yang spesifik.`);
  }
  const tanpaRetry = lain.filter(([id, d]) => id !== selisih && d.hasil?.ok !== true);
  if (tanpaRetry.length > 0) {
    const [id, d] = tanpaRetry[0];
    return gagal(label, `${id} gagal validasi tapi tidak dicoba ulang: ${JSON.stringify(d.hasil?.errors)}. Kirim ulang dengan error yang spesifik (maksimal 2 retry).`);
  }
  // Dokumen buntu selalu gagal validasi, jadi di sanalah loop retry pasti terlihat.
  const dBuntu = docs.get(buntu);
  if (dBuntu?.hasil && dBuntu.attempts < 2) {
    return gagal(label, `extractWithRetry belum mengirim ulang: ${buntu} gagal validasi tapi hanya ${dBuntu.attempts} percobaan. Kirim ulang dengan error yang spesifik (maksimal 2 retry).`);
  }
  return manual(label, 'Semua dokumen lolos di percobaan pertama, jadi retry belum teruji di run ini. Jalankan `pnpm p3 semua` lagi, lalu cek lagi.');
}

/** Dokumen yang memang tidak konsisten: total tertulis dipertahankan, hasil hitungan dicatat, konflik ditandai. */
function cekSelisih(docs: Map<string, PerDokumen>, k: Kunci['dokumenSelisihTotal']): Hasil {
  const label = `Selisih total ditandai (${k.doc})`;
  const d = docs.get(k.doc)?.hasil;
  if (!d) return gagal(label, `Dokumen ${k.doc} tidak ada di run semua terakhir.`);
  if (d.ok !== true) {
    return gagal(label, `Dokumen ${k.doc} gagal: ${JSON.stringify(d.errors)}. Total di dokumen ini memang tidak sama dengan jumlah item. Itu bukan kesalahan yang bisa diperbaiki retry. Jangan gagalkan validasi karena selisih ini; tandai dengan conflict_detected.`);
  }
  const data = d.data as Record<string, unknown> | null | undefined;
  if (!data) return gagal(label, `Run semua tidak mencatat data untuk ${k.doc}. Pastikan extractWithRetry mengembalikan data.`);
  if (data.total === k.calculated_total) {
    return gagal(label, `total diisi ${k.calculated_total} (hasil hitungan), padahal dokumen menulis ${k.total}. Itu mengarang. total harus angka yang tertulis; hasil hitungan masuk calculated_total.`);
  }
  if (data.total !== k.total) return gagal(label, `total ${JSON.stringify(data.total)}, padahal dokumen menulis ${k.total}.`);
  if (data.calculated_total !== k.calculated_total) {
    return gagal(label, `calculated_total ${JSON.stringify(data.calculated_total)}, seharusnya jumlah qty x unit_price semua item (${k.calculated_total}).`);
  }
  if (data.conflict_detected !== true) return gagal(label, 'total dan calculated_total berbeda, tapi conflict_detected bukan true.');
  return ok(label, `total ${k.total}, calculated_total ${k.calculated_total}, conflict_detected true`);
}

const p32: Cek = async (root) => {
  const kunci = bacaKunci(root);
  if (adalahHasil(kunci)) return [kunci];
  const run = requireRun('p3', 'semua', 'pnpm p3 semua');
  if (!adalahRun(run)) return [run];
  const docs = perDokumen(run);
  const hasil: Hasil[] = [];

  hasil.push(cekRetry(docs, kunci.dokumenTakBisaDiperbaiki, kunci.dokumenSelisihTotal.doc));
  hasil.push(cekSelisih(docs, kunci.dokumenSelisihTotal));

  const buntu = docs.get(kunci.dokumenTakBisaDiperbaiki);
  const labelBuntu = `Gagal dengan alasan (${kunci.dokumenTakBisaDiperbaiki})`;
  const errors = buntu?.hasil?.errors;
  if (!buntu?.hasil) {
    hasil.push(gagal(labelBuntu, `Dokumen ${kunci.dokumenTakBisaDiperbaiki} tidak ada di run semua terakhir.`));
  } else if (buntu.hasil.ok !== false) {
    hasil.push(gagal(labelBuntu, 'Dokumen ini datanya memang tidak ada, jadi tidak boleh lolos. Jangan biarkan model mengarang total atau harga.'));
  } else if (!Array.isArray(errors) || errors.length === 0) {
    hasil.push(gagal(labelBuntu, 'Gagal, tapi daftar errors kosong. Catat alasannya.'));
  } else {
    hasil.push(ok(labelBuntu, `${buntu.attempts} percobaan, ${errors.length} error`));
  }

  hasil.push(
    run.events.some((e) => e.event === 'request' && e.few_shot === true)
      ? ok('Ada contoh few-shot di request')
      : gagal('Ada contoh few-shot di request', 'Tidak ada request dengan contoh few-shot (blok <contoh>). Tambahkan 2-3 contoh di prompt.'),
  );
  hasil.push(manual('Catatan error', 'Catat error mana yang berhasil diperbaiki retry dan mana yang tidak, beserta alasannya.'));
  return hasil;
};

/** custom_id yang gagal di satu run batch: bukan succeeded, atau gagal validasi. */
function idGagal(run: Run): Set<string> {
  const g = new Set<string>();
  for (const e of run.events) {
    if (e.event === 'batch_hasil' && e.type !== 'succeeded') g.add(String(e.custom_id));
    if (e.event === 'batch_valid' && e.ok === false) g.add(String(e.custom_id));
  }
  return g;
}
const idKirim = (run: Run): string[] =>
  run.events.filter((e) => e.event === 'batch_kirim').flatMap((e) => (Array.isArray(e.custom_ids) ? e.custom_ids.map(String) : []));

const p33: Cek = async (root) => {
  const awal = requireRun('p3', 'batch', 'pnpm p3 batch');
  if (!adalahRun(awal)) return [awal];
  const hasil: Hasil[] = [];
  const runs = readRuns('p3', 'batch').filter((r) => r.events.some((e) => e.event === 'batch_kirim'));

  if (runs.length < 2) {
    hasil.push(gagal('Batch kirim ulang', `Baru ${runs.length} run batch yang terkirim. Jalankan pnpm p3 batch --ulang setelah run pertama.`));
  } else {
    const terakhir = runs[runs.length - 1];
    const sebelum = runs[runs.length - 2];
    const dikirimSebelum = idKirim(sebelum);
    const dikirim = idKirim(terakhir);
    const gagalSebelum = idGagal(sebelum);
    const berhasilLagi = dikirim.filter((id) => !gagalSebelum.has(id));
    if (gagalSebelum.size === 0) {
      hasil.push(gagal('Batch kirim ulang', 'Run batch sebelumnya tidak ada dokumen yang gagal, jadi tidak ada yang perlu dikirim ulang.'));
    } else if (berhasilLagi.length > 0) {
      hasil.push(gagal('Batch kirim ulang', `Run terakhir mengirim ulang dokumen yang sudah berhasil: ${berhasilLagi.join(', ')}. Kirim hanya yang gagal.`));
    } else if (dikirim.length >= dikirimSebelum.length) {
      hasil.push(gagal('Batch kirim ulang', `Run terakhir mengirim ${dikirim.length} dokumen, run sebelumnya ${dikirimSebelum.length}. Harus lebih sedikit.`));
    } else {
      hasil.push(ok('Batch kirim ulang hanya yang gagal', `${dikirim.length} dari ${dikirimSebelum.length} dokumen`));
    }
  }

  const review = join(root, 'hasil', 'p3', 'review-manusia.json');
  let isi = 0;
  try {
    const data: unknown = JSON.parse(readFileSync(review, 'utf8'));
    isi = Array.isArray(data) ? data.length : 0;
  } catch {
    isi = 0;
  }
  hasil.push(
    isi > 0
      ? ok('Daftar review manusia terisi', `${isi} entri`)
      : gagal('Daftar review manusia', 'hasil/p3/review-manusia.json tidak ada atau kosong. Jalankan pnpm p3 batch sampai selesai.'),
  );

  const catatan = join(root, 'catatan', 'p3-3.md');
  if (!existsSync(catatan)) {
    hasil.push(gagal('Tabel akurasi', 'Buat catatan/p3-3.md berisi tabel akurasi per field.'));
  } else if (!readFileSync(catatan, 'utf8').split('\n').some((l) => l.trimStart().startsWith('|'))) {
    hasil.push(gagal('Tabel akurasi', 'catatan/p3-3.md belum berisi tabel Markdown (baris berawalan |).'));
  } else {
    hasil.push(ok('Tabel akurasi ada di catatan/p3-3.md'));
  }

  hasil.push(manual('Penjelasan batch', 'Tulis kenapa pipeline batch tidak cocok untuk pengecekan yang memblokir.'));
  return hasil;
};

export const cekP3: Record<string, Cek> = {
  'p3-1': p31,
  'p3-2': p32,
  'p3-3': p33,
};
