// Kontrak data untuk P3. Dipakai run.ts, extract.ts, dan pengecekan. Jangan diubah.

export type Doc = { id: string; text: string };

export type ExtractedItem = {
  sku: string | null;
  description: string;
  qty: number | null;
  unit_price: number | null;
};

/** Hasil ekstraksi satu dokumen (email pesanan pelanggan atau invoice pemasok). Uang dalam rupiah, bilangan bulat. */
export type Extracted = {
  doc_type: 'order_email' | 'supplier_invoice' | 'other';
  doc_type_detail: string | null;
  party_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  reference: string | null;
  date: string | null;
  items: ExtractedItem[];
  /** Total yang TERTULIS di dokumen (stated total), apa adanya. null kalau tidak tertulis. */
  total: number | null;
  /** Jumlah qty x unit_price semua item. null kalau ada qty atau unit_price yang null. */
  calculated_total: number | null;
  /** true kalau `total` dan `calculated_total` sama-sama ada tapi nilainya berbeda. */
  conflict_detected: boolean;
  /** Keyakinan model per field, 0 sampai 1. Kuncinya nama field di atas. */
  confidence: Record<string, number>;
};

/** Satu dokumen di run batch: `type` dari Batches API, `ok` = lolos validasi. */
export type BatchOutcome = { custom_id: string; type: string; ok: boolean };

export type ReviewItem = { doc: string; field: string; confidence: number };
