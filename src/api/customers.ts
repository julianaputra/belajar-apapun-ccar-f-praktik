import { Hono } from 'hono';
import type { Store } from '../toko/store.js';

export function customersRoutes(store: Store): Hono {
  const app = new Hono();

  app.get('/:id/orders', (c) => {
    const id = c.req.param('id');
    if (!store.customers.some((cu) => cu.id === id)) {
      return c.json({ error: `Pelanggan ${id} tidak ditemukan` }, 404);
    }
    return c.json(store.orders.filter((o) => o.customer_id === id));
  });

  return app;
}
