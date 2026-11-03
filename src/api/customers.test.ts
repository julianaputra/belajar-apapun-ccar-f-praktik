import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadStore } from '../toko/store.js';
import { createApp } from './app.js';

const store = loadStore(join(import.meta.dirname, '..', '..'));
const app = createApp(store);

describe('GET /customers/:id/orders', () => {
  it('mengembalikan pesanan milik pelanggan', async () => {
    const id = store.orders[0]!.customer_id;
    const res = await app.request(`/customers/${id}/orders`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { customer_id: string }[];
    expect(body.length).toBeGreaterThan(0);
    expect(body.every((o) => o.customer_id === id)).toBe(true);
  });

  it('404 untuk pelanggan yang tidak ada', async () => {
    const res = await app.request('/customers/C-999/orders');
    expect(res.status).toBe(404);
    expect(await res.json()).toHaveProperty('error');
  });
});
