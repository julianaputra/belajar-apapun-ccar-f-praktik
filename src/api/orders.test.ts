import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadStore } from '../toko/store.js';
import { createApp } from './app.js';

const store = loadStore(join(import.meta.dirname, '..', '..'));
const app = createApp(store);
const espresso = store.orders.find((o) => o.total === 8_400_000);

describe('GET /orders/:id', () => {
  it('mengembalikan pesanan espresso', async () => {
    expect(espresso).toBeDefined();
    const res = await app.request(`/orders/${espresso?.id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { total: number };
    expect(body.total).toBe(8_400_000);
  });

  it('404 untuk ID yang tidak ada', async () => {
    const res = await app.request('/orders/ORD-TIDAK-ADA');
    expect(res.status).toBe(404);
    expect(await res.json()).toHaveProperty('error');
  });
});

describe('GET /orders?status=', () => {
  it('menyaring berdasarkan status', async () => {
    const res = await app.request('/orders?status=diterima');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string }[];
    expect(body.length).toBeGreaterThan(0);
    expect(body.every((o) => o.status === 'diterima')).toBe(true);
  });
});
