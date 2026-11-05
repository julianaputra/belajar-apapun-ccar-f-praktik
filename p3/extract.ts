import type Anthropic from '@anthropic-ai/sdk';
import type { RunLogger } from '../src/lib/log.js';
import { UserError } from '../src/lib/env.js';
import type { Order, Supplier } from '../src/toko/schema.js';
import type { BatchOutcome, Doc, Extracted, ReviewItem } from './types.js';

// Kerjakan langkah demi langkah. Baca README proyek P3 dan kartu topik D4 dulu.
// Bentuk data yang harus dihasilkan sudah ditetapkan di ./types.ts (tipe `Extracted`).
// Setiap fungsi di bawah dipanggil oleh run.ts. Jangan ubah nama dan tanda tangannya.

// ---------------------------------------------------------------------------
// Langkah 1: ekstraksi satu dokumen
// ---------------------------------------------------------------------------

/**
 * Definisi tool untuk ekstraksi.
 * TODO: lengkapi input_schema supaya cocok dengan tipe `Extracted`:
 *  - field yang selalu ada vs field yang boleh tidak ada di dokumen (nullable)
 *  - kategori tertutup (enum) yang punya jalan keluar untuk kasus di luar daftar
 *  - confidence per field (dipakai langkah 3)
 *  - `total` (yang tertulis) dan `calculated_total` (hasil hitungan) adalah dua field berbeda
 * Pikirkan: apa yang terjadi kalau field yang sering kosong dibuat wajib dan tidak nullable?
 */
export const extractTool: Anthropic.Tool = {
  name: 'extract_dokumen',
  description: 'TODO: jelaskan kapan tool ini dipakai dan apa yang harus diisi.',
  input_schema: { type: 'object', properties: {} },
};

/**
 * Panggil Claude dengan tool_choice yang dipaksa ke `extractTool`, lalu kembalikan `input` dari blok tool_use.
 * Gunakan `createMessage` dari src/lib/claude.ts supaya request tercatat di log.
 * Model dibaca dari `loadEnv().model`.
 */
export async function extractOne(_run: RunLogger, _doc: Doc): Promise<Extracted> {
  throw new UserError('Belum dikerjakan: P3 langkah 1 (extractOne di p3/extract.ts)');
}

// ---------------------------------------------------------------------------
// Langkah 2: validasi dan retry
// ---------------------------------------------------------------------------

/**
 * Kembalikan daftar pesan error (array kosong kalau valid).
 * TODO: cek bentuk datanya (Zod boleh dipakai), ditambah minimal satu aturan semantik
 * yang tidak bisa diperiksa oleh JSON Schema sendiri.
 * Pesan harus spesifik supaya model tahu apa yang harus diperbaiki.
 * Pikirkan: error mana yang bisa diperbaiki model dari dokumen, dan mana yang tidak?
 * Dokumen yang isinya memang tidak konsisten bukan kesalahan ekstraksi.
 */
export function validate(_data: Extracted, _doc: Doc): string[] {
  throw new UserError('Belum dikerjakan: P3 langkah 2 (validate di p3/extract.ts)');
}

/**
 * Ekstrak, validasi, dan kalau gagal coba lagi (maksimal 2 retry).
 * Pada retry, model harus melihat dokumen asli, hasilnya yang gagal, dan error yang spesifik.
 * Kembalikan `data: null` kalau tetap gagal setelah semua percobaan.
 * Tambahkan juga 2-3 contoh few-shot dalam blok <contoh> ... </contoh> di prompt.
 */
export async function extractWithRetry(
  _run: RunLogger,
  _doc: Doc,
): Promise<{ data: Extracted | null; errors: string[] }> {
  throw new UserError('Belum dikerjakan: P3 langkah 2 (extractWithRetry di p3/extract.ts)');
}

/**
 * Ubah hasil ekstraksi menjadi kontrak toko (lihat src/toko/schema.ts).
 * Email pesanan menjadi Order, invoice pemasok menjadi Supplier.
 * Petunjuk: data/customers.json dan data/products.json bisa dipakai untuk memetakan email ke customer_id.
 */
export function toStore(_data: Extracted): { orders: Order[]; suppliers: Supplier[] } {
  throw new UserError('Belum dikerjakan: P3 langkah 2 (toStore di p3/extract.ts)');
}

// ---------------------------------------------------------------------------
// Langkah 3: batch dan review manusia
// ---------------------------------------------------------------------------

/**
 * Bangun satu request untuk Message Batches API. `custom_id` harus bisa dipetakan kembali ke dokumen.
 * Perhatikan: batch tidak punya loop retry, jadi tool_choice dan prompt harus sudah tepat dari awal.
 */
export function buildBatchRequest(_doc: Doc): Anthropic.Messages.Batches.BatchCreateParams.Request {
  throw new UserError('Belum dikerjakan: P3 langkah 3 (buildBatchRequest di p3/extract.ts)');
}

/**
 * Dari hasil run batch sebelumnya, pilih custom_id yang perlu dikirim ulang (hanya yang gagal).
 * `type` dari Batches API bukan satu-satunya tanda gagal: lihat juga `ok`.
 */
export function pilihUlang(_prevResults: BatchOutcome[]): string[] {
  throw new UserError('Belum dikerjakan: P3 langkah 3 (pilihUlang di p3/extract.ts)');
}

/**
 * Pilih field yang keyakinannya rendah untuk diperiksa manusia.
 * `data: null` berarti dokumen gagal total.
 * TODO: tentukan ambang confidence dan alasannya.
 */
export function confidenceToReview(_results: { doc: string; data: Extracted | null }[]): ReviewItem[] {
  throw new UserError('Belum dikerjakan: P3 langkah 3 (confidenceToReview di p3/extract.ts)');
}
