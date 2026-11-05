import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startRun } from '../lib/log.js';
import { cekP3 } from './p3.js';
import type { Hasil } from './types.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cek-p3-'));
  process.env.LOG_DIR = join(root, 'logs');
  tulis('p3/kunci.json', JSON.stringify({
    dokumenTanpaField: { doc: 'email-x', field: 'phone' },
    dokumenSelisihTotal: { doc: 'inv-selisih', total: 4210000, calculated_total: 4120000 },
    dokumenTakBisaDiperbaiki: 'inv-buntu',
  }));
});
afterEach(() => {
  delete process.env.LOG_DIR;
  rmSync(root, { recursive: true, force: true });
});

function tulis(rel: string, isi: string): void {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), isi);
}
const gagal = (hs: Hasil[]) => hs.filter((h) => h.status === 'gagal');
const manual = (hs: Hasil[]) => hs.filter((h) => h.status === 'manual');
const pesan = (hs: Hasil[]) => gagal(hs).map((h) => `${h.label} ${h.pesan}`).join(' ');

function req(run: ReturnType<typeof startRun>, fewShot = false, toolChoice: unknown = { type: 'tool', name: 'extract_dokumen' }) {
  run.log('request', { model: 'm', tool_choice: toolChoice, tools: ['extract_dokumen'], few_shot: fewShot });
}

describe('p3-1', () => {
  function satu(toolChoice: unknown, phone: unknown) {
    const run = startRun('p3', 'satu:email-x');
    req(run, false, toolChoice);
    run.log('hasil', { doc: 'email-x', data: { phone, party_name: 'Agus' } });
  }
  it('tanpa log: gagal dan menyuruh menjalankan perintah', async () => {
    const hs = await cekP3['p3-1'](root);
    expect(pesan(hs)).toContain('pnpm p3 satu email-x');
  });
  it('lulus: tool_choice tool dan phone null', async () => {
    satu({ type: 'tool', name: 'x' }, null);
    expect(gagal(await cekP3['p3-1'](root))).toEqual([]);
  });
  it('gagal tanpa tool_choice', async () => {
    satu(null, null);
    expect(pesan(await cekP3['p3-1'](root))).toContain('tool_choice');
  });
  it('gagal kalau tool_choice auto', async () => {
    satu({ type: 'auto' }, null);
    expect(pesan(await cekP3['p3-1'](root))).toContain('tool_choice');
  });
  it('gagal kalau field berisi nilai karangan', async () => {
    satu({ type: 'tool', name: 'x' }, '0812-0000-0000');
    expect(pesan(await cekP3['p3-1'](root))).toContain('phone');
  });
  it('gagal kalau field tidak ada di hasil', async () => {
    const run = startRun('p3', 'satu:email-x');
    req(run);
    run.log('hasil', { doc: 'email-x', data: { party_name: 'Agus' } });
    expect(pesan(await cekP3['p3-1'](root))).toContain('phone');
  });
  it('hanya menilai run terakhir', async () => {
    satu({ type: 'tool', name: 'x' }, null);
    satu(null, null);
    expect(pesan(await cekP3['p3-1'](root))).toContain('tool_choice');
  });
  it('gagal kalau run belum menghasilkan data', async () => {
    const run = startRun('p3', 'satu:email-x');
    req(run);
    expect(pesan(await cekP3['p3-1'](root))).toContain('hasil');
  });
});

describe('p3-2', () => {
  const dataSelisih = { total: 4210000, calculated_total: 4120000, conflict_detected: true };
  type Opsi = {
    retryAttempts?: number;
    retryOk?: boolean;
    selisihOk?: boolean;
    selisihData?: Record<string, unknown> | null;
    selisihAttempts?: number;
    buntuOk?: boolean;
    buntuErrors?: string[];
    buntuAttempts?: number;
    fewShot?: boolean;
  };
  function dok(run: ReturnType<typeof startRun>, doc: string, attempts: number, ok: boolean, fewShot: boolean, extra: Record<string, unknown> = {}) {
    run.log('dokumen_mulai', { doc });
    for (let i = 0; i < attempts; i++) req(run, fewShot);
    run.log('hasil', { doc, ok, errors: ok ? [] : ['x salah'], attempts, ...extra });
  }
  function semua(opts: Opsi = {}) {
    const {
      retryAttempts = 2, retryOk = true, selisihOk = true, selisihData = dataSelisih, selisihAttempts = 1,
      buntuOk = false, buntuErrors = ['total tidak ada'], buntuAttempts = 3, fewShot = true,
    } = opts;
    const run = startRun('p3', 'semua');
    dok(run, 'inv-biasa', 1, true, fewShot);
    dok(run, 'inv-retry', retryAttempts, retryOk, fewShot);
    dok(run, 'inv-selisih', selisihAttempts, selisihOk, fewShot, { data: selisihData });
    run.log('dokumen_mulai', { doc: 'inv-buntu' });
    for (let i = 0; i < buntuAttempts; i++) req(run, fewShot);
    run.log('hasil', { doc: 'inv-buntu', ok: buntuOk, errors: buntuErrors, attempts: buntuAttempts });
  }
  const label = (hs: Hasil[], awal: string) => hs.find((h) => h.label.startsWith(awal));

  it('tanpa log: gagal', async () => {
    expect(pesan(await cekP3['p3-2'](root))).toContain('pnpm p3 semua');
  });
  it('lulus dan menyisakan langkah manual', async () => {
    semua();
    const hs = await cekP3['p3-2'](root);
    expect(gagal(hs)).toEqual([]);
    expect(manual(hs)).toHaveLength(1);
    expect(label(hs, 'Retry')?.pesan).toContain('inv-retry');
  });
  it('kunci.json versi lama: gagal dengan petunjuk memperbarui starter', async () => {
    tulis('p3/kunci.json', JSON.stringify({ dokumenTanpaField: { doc: 'a', field: 'b' }, dokumenRetryBerhasil: 'x', dokumenTakBisaDiperbaiki: 'y' }));
    semua();
    expect(pesan(await cekP3['p3-2'](root))).toContain('Memperbarui starter');
  });
  it('tanpa retry sama sekali tapi semua lolos: retry dinilai manual, bukan gagal', async () => {
    semua({ retryAttempts: 1 });
    const hs = await cekP3['p3-2'](root);
    expect(gagal(hs)).toEqual([]);
    expect(label(hs, 'Retry')?.status).toBe('manual');
  });
  it('gagal kalau tidak ada retry sama sekali (dokumen buntu hanya 1 percobaan)', async () => {
    semua({ retryAttempts: 1, buntuAttempts: 1 });
    const hs = await cekP3['p3-2'](root);
    expect(label(hs, 'Retry')?.status).toBe('gagal');
    expect(label(hs, 'Retry')?.pesan).toContain('belum mengirim ulang');
  });
  it('retry yang berhasil boleh terjadi di dokumen selisih', async () => {
    semua({ retryAttempts: 1, selisihAttempts: 2 });
    const hs = await cekP3['p3-2'](root);
    expect(label(hs, 'Retry')?.status).toBe('ok');
    expect(label(hs, 'Retry')?.pesan).toContain('inv-selisih');
  });
  it('gagal kalau dokumen gagal validasi tapi tidak dicoba ulang', async () => {
    semua({ retryAttempts: 1, retryOk: false });
    expect(pesan(await cekP3['p3-2'](root))).toContain('tidak dicoba ulang');
  });
  it('gagal kalau dokumen sudah di-retry tapi akhirnya tidak ok', async () => {
    semua({ retryOk: false });
    expect(pesan(await cekP3['p3-2'](root))).toContain('tetap gagal');
  });
  it('menghitung percobaan dari event request, bukan dari field attempts', async () => {
    const run = startRun('p3', 'semua');
    run.log('dokumen_mulai', { doc: 'inv-retry' });
    req(run, true);
    run.log('hasil', { doc: 'inv-retry', ok: false, errors: ['x'], attempts: 2 });
    expect(pesan(await cekP3['p3-2'](root))).toContain('tidak dicoba ulang');
  });
  it('gagal kalau total tertulis diganti hasil hitungan (mengarang)', async () => {
    semua({ selisihData: { total: 4120000, calculated_total: 4120000, conflict_detected: false } });
    expect(pesan(await cekP3['p3-2'](root))).toContain('mengarang');
  });
  it('gagal kalau dokumen selisih digagalkan validasi', async () => {
    semua({ selisihOk: false, selisihAttempts: 3 });
    const hs = await cekP3['p3-2'](root);
    expect(pesan(hs)).toContain('conflict_detected');
    expect(label(hs, 'Retry')?.status).toBe('ok');
  });
  it('gagal kalau calculated_total salah atau konflik tidak ditandai', async () => {
    semua({ selisihData: { ...dataSelisih, calculated_total: 4210000 } });
    expect(pesan(await cekP3['p3-2'](root))).toContain('calculated_total');
    semua({ selisihData: { ...dataSelisih, conflict_detected: false } });
    expect(pesan(await cekP3['p3-2'](root))).toContain('conflict_detected');
  });
  it('gagal kalau data dokumen selisih tidak tercatat', async () => {
    semua({ selisihData: null });
    expect(pesan(await cekP3['p3-2'](root))).toContain('inv-selisih');
  });
  it('gagal kalau dokumen buntu justru lolos', async () => {
    semua({ buntuOk: true });
    expect(pesan(await cekP3['p3-2'](root))).toContain('inv-buntu');
  });
  it('gagal kalau dokumen buntu gagal tanpa alasan', async () => {
    semua({ buntuErrors: [] });
    expect(pesan(await cekP3['p3-2'](root))).toContain('inv-buntu');
  });
  it('gagal tanpa few-shot', async () => {
    semua({ fewShot: false });
    expect(pesan(await cekP3['p3-2'](root))).toContain('few-shot');
  });
  it('gagal kalau dokumen tidak ada di run', async () => {
    const run = startRun('p3', 'semua');
    run.log('dokumen_mulai', { doc: 'lain' });
    run.log('hasil', { doc: 'lain', ok: true, errors: [], attempts: 1 });
    const p = pesan(await cekP3['p3-2'](root));
    expect(p).toContain('inv-selisih');
    expect(p).toContain('inv-buntu');
  });
});

describe('p3-3', () => {
  function batch(kirim: string[], hasil: Record<string, boolean>) {
    const run = startRun('p3', 'batch');
    run.log('batch_kirim', { batch_id: 'b', custom_ids: kirim });
    for (const [id, ok] of Object.entries(hasil)) {
      run.log('batch_hasil', { custom_id: id, type: 'succeeded' });
      run.log('batch_valid', { custom_id: id, ok, errors: ok ? [] : ['x'] });
    }
  }
  const siapkanBerkas = () => {
    tulis('hasil/p3/review-manusia.json', JSON.stringify([{ doc: 'a', field: 'total', confidence: 0.3 }]));
    tulis('catatan/p3-3.md', '| doc | akurasi |\n| --- | --- |\n| a | 1 |\n');
  };
  it('tanpa log: gagal', async () => {
    expect(pesan(await cekP3['p3-3'](root))).toContain('pnpm p3 batch');
  });
  it('gagal kalau baru satu run batch', async () => {
    batch(['a', 'b', 'c'], { a: true, b: false, c: true });
    siapkanBerkas();
    expect(pesan(await cekP3['p3-3'](root))).toContain('--ulang');
  });
  it('lulus: ulang hanya yang gagal', async () => {
    batch(['a', 'b', 'c'], { a: true, b: false, c: true });
    batch(['b'], { b: false });
    siapkanBerkas();
    const hs = await cekP3['p3-3'](root);
    expect(gagal(hs)).toEqual([]);
    expect(manual(hs)).toHaveLength(1);
  });
  it('gagal kalau ulang mengirim semua ID', async () => {
    batch(['a', 'b', 'c'], { a: true, b: false, c: true });
    batch(['a', 'b', 'c'], { a: true, b: false, c: true });
    siapkanBerkas();
    expect(pesan(await cekP3['p3-3'](root))).toContain('a, c');
  });
  it('gagal kalau ulang mengirim ID yang sebenarnya berhasil', async () => {
    batch(['a', 'b', 'c'], { a: true, b: false, c: true });
    batch(['a'], { a: true });
    siapkanBerkas();
    expect(pesan(await cekP3['p3-3'](root))).toContain('a');
  });
  it('type selain succeeded dihitung gagal', async () => {
    const run = startRun('p3', 'batch');
    run.log('batch_kirim', { batch_id: 'b', custom_ids: ['a', 'b'] });
    run.log('batch_hasil', { custom_id: 'a', type: 'succeeded' });
    run.log('batch_valid', { custom_id: 'a', ok: true, errors: [] });
    run.log('batch_hasil', { custom_id: 'b', type: 'errored' });
    batch(['b'], { b: true });
    siapkanBerkas();
    expect(gagal(await cekP3['p3-3'](root))).toEqual([]);
  });
  it('gagal kalau run sebelumnya tidak punya yang gagal', async () => {
    batch(['a', 'b'], { a: true, b: true });
    batch(['a'], { a: true });
    siapkanBerkas();
    expect(pesan(await cekP3['p3-3'](root))).toContain('tidak ada');
  });
  it('gagal tanpa review-manusia.json atau kosong', async () => {
    batch(['a', 'b'], { a: true, b: false });
    batch(['b'], { b: false });
    tulis('catatan/p3-3.md', '| a |\n');
    expect(pesan(await cekP3['p3-3'](root))).toContain('review-manusia.json');
    tulis('hasil/p3/review-manusia.json', '[]');
    expect(pesan(await cekP3['p3-3'](root))).toContain('review-manusia.json');
  });
  it('gagal tanpa tabel di catatan/p3-3.md', async () => {
    batch(['a', 'b'], { a: true, b: false });
    batch(['b'], { b: false });
    siapkanBerkas();
    expect(pesan(await cekP3['p3-3'](root))).not.toContain('catatan');
    tulis('catatan/p3-3.md', 'tidak ada tabel');
    expect(pesan(await cekP3['p3-3'](root))).toContain('catatan/p3-3.md');
  });
});
