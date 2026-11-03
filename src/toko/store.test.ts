import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadStore } from './store.js';

const ROOT = join(import.meta.dirname, '..', '..');
const BASE_FILES = ['customers', 'products', 'orders', 'suppliers'];

function readBase(name: string): string {
  return readFileSync(join(ROOT, 'data', `${name}.json`), 'utf8');
}

/** Folder sementara berisi data dasar. `p3` = isi hasil/p3 (kosong = tanpa folder itu). */
function tempDir(p3: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'toko-'));
  mkdirSync(join(dir, 'data'));
  for (const f of BASE_FILES) {
    writeFileSync(join(dir, 'data', `${f}.json`), readBase(f));
  }
  if (Object.keys(p3).length > 0) {
    mkdirSync(join(dir, 'hasil', 'p3'), { recursive: true });
    for (const [name, text] of Object.entries(p3)) {
      writeFileSync(join(dir, 'hasil', 'p3', name), text);
    }
  }
  return dir;
}

const validP3Order = {
  id: 'ORD-P3-1',
  customer_id: 'C-001',
  items: [{ sku: 'KOPI-ARB-250', qty: 1, price: 85000 }],
  total: 85000,
  shipping_address: 'Jl. Dago Asri No. 12, Bandung 40135',
  status: 'diterima',
  order_date: '2026-10-01',
  delivered_date: '2026-10-05',
};

describe('loadStore', () => {
  it('memuat data dasar tanpa peringatan', () => {
    const s = loadStore(ROOT);
    expect(s.orders.length).toBeGreaterThanOrEqual(15);
    expect(s.customers.length).toBeGreaterThanOrEqual(8);
    expect(s.customers.some((c) => !c.verified)).toBe(true);
    expect(s.warnings).toEqual([]);
    expect(s.orders.every((o) => o.source === 'toko')).toBe(true);
  });

  it('punya pesanan espresso senilai 8_400_000', () => {
    const s = loadStore(ROOT);
    expect(s.orders.some((o) => o.total === 8_400_000)).toBe(true);
  });

  it('setiap pesanan punya shipping_address', () => {
    const s = loadStore(ROOT);
    expect(s.orders.every((o) => o.shipping_address.trim().length > 0)).toBe(true);
    const beda = s.orders.filter(
      (o) => o.shipping_address !== s.customers.find((c) => c.id === o.customer_id)?.address,
    );
    expect(beda.length).toBeGreaterThanOrEqual(1);
  });

  it('menambah entri valid dari hasil/p3 dan melewati yang rusak', () => {
    const base = loadStore(ROOT).orders.length;
    const s = loadStore(
      tempDir({ 'orders.json': JSON.stringify([validP3Order, { id: 'rusak' }]) }),
    );
    expect(s.orders.length).toBe(base + 1);
    expect(s.orders.find((o) => o.id === 'ORD-P3-1')?.source).toBe('p3');
    expect(s.warnings[0]).toContain('1');
  });

  it('tetap jalan kalau hasil/p3/orders.json bukan JSON', () => {
    const base = loadStore(ROOT).orders.length;
    const s = loadStore(tempDir({ 'orders.json': '{ini bukan json' }));
    expect(s.orders.length).toBe(base);
    expect(s.warnings.length).toBe(1);
    expect(s.warnings[0]).toContain('orders.json');
  });

  it('tetap jalan kalau isi hasil/p3/suppliers.json bukan array', () => {
    const s = loadStore(tempDir({ 'suppliers.json': '{"a":1}' }));
    expect(s.suppliers.length).toBeGreaterThan(0);
    expect(s.warnings.length).toBe(1);
  });

  it('tanpa folder hasil/p3 tidak ada peringatan', () => {
    expect(loadStore(tempDir()).warnings).toEqual([]);
  });
});
