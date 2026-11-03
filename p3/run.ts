import type Anthropic from '@anthropic-ai/sdk';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { batchResults, submitBatch, waitBatch } from '../src/lib/batch.js';
import { runMain, UserError } from '../src/lib/env.js';
import { readRuns, startRun, type Run, type RunLogger } from '../src/lib/log.js';
import type { Order, Supplier } from '../src/toko/schema.js';
import {
  buildBatchRequest,
  confidenceToReview,
  extractOne,
  extractWithRetry,
  pilihUlang,
  toStore,
  validate,
} from './extract.js';
import type { BatchOutcome, Doc, Extracted, ReviewItem } from './types.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const HASIL_DIR = join('hasil', 'p3');

const PAKAI = `Pemakaian:
  pnpm p3 satu <id-dokumen>   ekstrak satu dokumen
  pnpm p3 semua               ekstrak semua dokumen (dengan validasi dan retry)
  pnpm p3 batch [--ulang]     kirim lewat Message Batches API; --ulang hanya yang gagal`;

function bacaDokumen(): Doc[] {
  return readdirSync(join(HERE, 'dokumen'))
    .filter((f) => f.endsWith('.txt'))
    .sort()
    .map((f) => ({ id: basename(f, '.txt'), text: readFileSync(join(HERE, 'dokumen', f), 'utf8') }));
}

function tulisJson(nama: string, data: unknown): void {
  mkdirSync(HASIL_DIR, { recursive: true });
  writeFileSync(join(HASIL_DIR, nama), JSON.stringify(data, null, 2) + '\n');
}

function bacaJson<T>(nama: string, bawaan: T): T {
  try {
    return JSON.parse(readFileSync(join(HASIL_DIR, nama), 'utf8')) as T;
  } catch {
    return bawaan;
  }
}

/** Jumlah request sejak dokumen_mulai terakhir pada run ini. */
function hitungPercobaan(runId: string): number {
  const run = readRuns('p3', 'semua').find((r) => r.runId === runId);
  let n = 0;
  for (const e of run?.events ?? []) {
    if (e.event === 'dokumen_mulai') n = 0;
    else if (e.event === 'request') n++;
  }
  return n;
}

async function satu(id: string | undefined): Promise<void> {
  const docs = bacaDokumen();
  const doc = docs.find((d) => d.id === id);
  if (!doc) throw new UserError(`Dokumen "${id ?? ''}" tidak ada.\nPilihan: ${docs.map((d) => d.id).join(', ')}`);
  const run = startRun('p3', `satu:${doc.id}`);
  const data = await extractOne(run, doc);
  run.log('hasil', { doc: doc.id, data });
  console.log(JSON.stringify(data, null, 2));
}

async function semua(): Promise<void> {
  const run = startRun('p3', 'semua');
  const orders = new Map<string, Order>();
  const suppliers = new Map<string, Supplier>();
  let lulus = 0;
  const docs = bacaDokumen();
  for (const doc of docs) {
    run.log('dokumen_mulai', { doc: doc.id });
    const { data, errors } = await extractWithRetry(run, doc);
    const attempts = hitungPercobaan(run.runId);
    const ok = data !== null && errors.length === 0;
    run.log('hasil', { doc: doc.id, ok, errors, attempts });
    console.log(`${ok ? 'OK    ' : 'GAGAL '} ${doc.id} (${attempts} percobaan)${ok ? '' : ': ' + errors.join('; ')}`);
    if (ok && data) {
      lulus++;
      const s = toStore(data);
      for (const o of s.orders) orders.set(o.id, o);
      for (const p of s.suppliers) suppliers.set(p.id, p);
    }
  }
  tulisJson('orders.json', [...orders.values()]);
  tulisJson('suppliers.json', [...suppliers.values()]);
  console.log(`\n${lulus}/${docs.length} dokumen lolos. Ditulis ke ${HASIL_DIR}/orders.json dan suppliers.json`);
}

/** Hasil run batch terakhir yang benar-benar terkirim, dalam bentuk yang dipahami pilihUlang. */
function hasilBatchSebelumnya(): BatchOutcome[] | null {
  const run: Run | undefined = readRuns('p3', 'batch')
    .filter((r) => r.events.some((e) => e.event === 'batch_kirim'))
    .at(-1);
  if (!run) return null;
  const dikirim = run.events
    .filter((e) => e.event === 'batch_kirim')
    .flatMap((e) => (Array.isArray(e.custom_ids) ? e.custom_ids.map(String) : []));
  return dikirim.map((id) => {
    const hasil = run.events.find((e) => e.event === 'batch_hasil' && e.custom_id === id);
    const valid = run.events.find((e) => e.event === 'batch_valid' && e.custom_id === id);
    return { custom_id: id, type: hasil ? String(hasil.type) : 'tidak-ada-hasil', ok: valid?.ok === true };
  });
}

function dataDariPesan(message: Anthropic.Message): unknown {
  const blok = message.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  return blok?.input;
}

async function batch(ulang: boolean): Promise<void> {
  let docs = bacaDokumen();
  if (ulang) {
    const sebelumnya = hasilBatchSebelumnya();
    if (!sebelumnya) throw new UserError('Belum ada run batch sebelumnya. Jalankan `pnpm p3 batch` dulu.');
    const ids = new Set(pilihUlang(sebelumnya));
    if (ids.size === 0) throw new UserError('Tidak ada dokumen yang gagal di run batch terakhir. Tidak ada yang dikirim ulang.');
    docs = docs.filter((d) => ids.has(d.id));
  }
  const run: RunLogger = startRun('p3', 'batch');
  const id = await submitBatch(run, docs.map(buildBatchRequest));
  console.log(`Batch ${id} terkirim (${docs.length} dokumen). Menunggu...`);
  await waitBatch(run, id);
  const hasil = await batchResults(run, id);

  const olahan: { doc: string; data: Extracted | null }[] = [];
  for (const doc of docs) {
    const entri = hasil.find((h) => h.custom_id === doc.id);
    let data: Extracted | null = null;
    let errors: string[];
    if (!entri) {
      errors = ['tidak ada hasil untuk custom_id ini'];
    } else if (entri.result.type !== 'succeeded') {
      errors = [`hasil batch bertipe ${entri.result.type}`];
    } else {
      const mentah = dataDariPesan(entri.result.message);
      if (mentah === undefined) {
        errors = ['tidak ada blok tool_use di respons'];
      } else {
        errors = validate(mentah as Extracted, doc);
        if (errors.length === 0) data = mentah as Extracted;
      }
    }
    run.log('batch_valid', { custom_id: doc.id, ok: errors.length === 0, errors });
    olahan.push({ doc: doc.id, data });
    console.log(`${errors.length === 0 ? 'OK    ' : 'GAGAL '} ${doc.id}${errors.length ? ': ' + errors.join('; ') : ''}`);
  }

  // Run ulang hanya mengganti entri dokumen yang dikirim ulang; entri dokumen lain dipertahankan.
  const dikirim = new Set(docs.map((d) => d.id));
  const lama = ulang ? bacaJson<ReviewItem[]>('review-manusia.json', []).filter((r) => !dikirim.has(r.doc)) : [];
  const review = [...lama, ...confidenceToReview(olahan)];
  tulisJson('review-manusia.json', review);
  console.log(`\n${review.length} entri masuk review manusia: ${HASIL_DIR}/review-manusia.json`);
}

runMain(async () => {
  const [perintah, ...sisa] = process.argv.slice(2);
  if (perintah === 'satu') return satu(sisa[0]);
  if (perintah === 'semua') return semua();
  if (perintah === 'batch') return batch(sisa.includes('--ulang'));
  throw new UserError(PAKAI);
});
