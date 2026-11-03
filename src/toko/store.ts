import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ZodType } from 'zod';
import { Customer, Order, Product, Supplier } from './schema.js';

export interface Store {
  customers: Customer[];
  orders: Order[];
  products: Product[];
  suppliers: Supplier[];
  warnings: string[];
}

/** Baca file JSON berisi array. Kalau gagal, kembalikan [] dan catat peringatan. */
function readArray(path: string, label: string, warnings: string[]): unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    warnings.push(`${label}: bukan JSON yang valid (${(err as Error).message}). File dilewati.`);
    return [];
  }
  if (!Array.isArray(parsed)) {
    warnings.push(`${label}: isinya bukan array. File dilewati.`);
    return [];
  }
  return parsed;
}

/** Validasi tiap entri. Yang tidak lolos dilewati dan jumlahnya dicatat. */
function parseEntries<T>(
  raw: unknown[],
  schema: ZodType<T>,
  label: string,
  warnings: string[],
  defaults: Record<string, unknown>,
): T[] {
  const ok: T[] = [];
  let skipped = 0;
  for (const entry of raw) {
    const candidate =
      entry && typeof entry === 'object' && !Array.isArray(entry) ? { ...entry, ...defaults } : entry;
    const result = schema.safeParse(candidate);
    if (result.success) ok.push(result.data);
    else skipped++;
  }
  if (skipped > 0) {
    warnings.push(`${label}: ${skipped} entri dilewati karena tidak sesuai kontrak.`);
  }
  return ok;
}

function loadFile<T>(
  path: string,
  label: string,
  schema: ZodType<T>,
  source: 'toko' | 'p3' | null,
  warnings: string[],
): T[] {
  if (!existsSync(path)) return [];
  const raw = readArray(path, label, warnings);
  return parseEntries(raw, schema, label, warnings, source ? { source } : {});
}

/**
 * Muat data toko dari `<dir>/data/*.json`, ditambah `<dir>/hasil/p3/{orders,suppliers}.json`
 * kalau ada. `dir` adalah root starter (default: folder kerja).
 */
export function loadStore(dir: string = process.cwd()): Store {
  const warnings: string[] = [];
  const data = (name: string) => join(dir, 'data', `${name}.json`);
  const p3 = (name: string) => join(dir, 'hasil', 'p3', `${name}.json`);

  const customers = loadFile(data('customers'), 'data/customers.json', Customer, null, warnings);
  const products = loadFile(data('products'), 'data/products.json', Product, null, warnings);
  const orders = [
    ...loadFile(data('orders'), 'data/orders.json', Order, 'toko', warnings),
    ...loadFile(p3('orders'), 'hasil/p3/orders.json', Order, 'p3', warnings),
  ];
  const suppliers = [
    ...loadFile(data('suppliers'), 'data/suppliers.json', Supplier, 'toko', warnings),
    ...loadFile(p3('suppliers'), 'hasil/p3/suppliers.json', Supplier, 'p3', warnings),
  ];
  return { customers, orders, products, suppliers, warnings };
}
