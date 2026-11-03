import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

async function load() {
  vi.resetModules();
  return import('./tools.js');
}

beforeEach(() => {
  delete process.env.TOKO_GANGGUAN;
  delete process.env.TOKO_HARI_INI;
});
afterEach(() => {
  delete process.env.TOKO_GANGGUAN;
});

describe('tools', () => {
  it('punya empat tool dengan handler', async () => {
    const { toolDefs, handlers } = await load();
    const names = toolDefs.map((t) => t.name).sort();
    expect(names).toEqual(['escalate_to_human', 'get_customer', 'lookup_order', 'process_refund']);
    for (const n of names) expect(typeof handlers[n]).toBe('function');
  });

  it('get_customer mencari lewat id, email, atau nama', async () => {
    const { handlers } = await load();
    const all = JSON.parse(readFileSync('data/customers.json', 'utf8'));
    const c = all[0];
    for (const q of [c.id, c.email, c.name]) {
      const r = await handlers.get_customer!({ query: q });
      expect(r.isError).toBeFalsy();
      expect(r.content).toContain(c.id);
    }
    const none = await handlers.get_customer!({ query: 'tidak-ada-orang-ini' });
    expect(none.isError).toBe(true);
    expect(none.content).toMatch(/^Error:/);
  });

  it('lookup_order mengembalikan pesanan, error untuk id tak dikenal', async () => {
    const { handlers } = await load();
    const r = await handlers.lookup_order!({ order_id: 'ORD-1002' });
    expect(r.isError).toBeFalsy();
    expect(r.content).toContain('8400000');
    expect(r.content).toContain('20 Okt 2026');
    const bad = await handlers.lookup_order!({ order_id: 'ORD-0000' });
    expect(bad.isError).toBe(true);
  });

  it('process_refund menolak pesanan lewat 30 hari', async () => {
    const { handlers } = await load();
    const r = await handlers.process_refund!({ order_id: 'ORD-1003', amount: 100000, reason: 'rusak' });
    expect(r.isError).toBe(true);
    expect(r.content).toContain('30 hari');
  });

  it('process_refund tidak membatasi nominal untuk pesanan espresso', async () => {
    const { handlers } = await load();
    const r = await handlers.process_refund!({ order_id: 'ORD-1002', amount: 8_400_000, reason: 'rusak' });
    expect(r.isError).toBeFalsy();
    expect(r.content).toContain('8400000');
  });

  it('process_refund menolak pesanan yang belum diterima', async () => {
    const { handlers } = await load();
    const r = await handlers.process_refund!({ order_id: 'ORD-1005', amount: 1000, reason: 'x' });
    expect(r.isError).toBe(true);
  });

  it('escalate_to_human menerima ringkasan', async () => {
    const { handlers } = await load();
    const r = await handlers.escalate_to_human!({ summary: 'tolong' });
    expect(r.isError).toBeFalsy();
  });

  it('TOKO_GANGGUAN=1: lookup_order pertama gagal, kedua sukses', async () => {
    process.env.TOKO_GANGGUAN = '1';
    const { handlers } = await load();
    const first = await handlers.lookup_order!({ order_id: 'ORD-1002' });
    expect(first.isError).toBe(true);
    expect(first.content).toMatch(/timeout/i);
    const second = await handlers.lookup_order!({ order_id: 'ORD-1002' });
    expect(second.isError).toBeFalsy();
  });
});
