import { Hono } from 'hono';
import type { Store } from '../toko/store.js';

export function ordersRoutes(store: Store): Hono {
  const app = new Hono();

  app.get('/', (c) => {
    const status = c.req.query('status');
    const result = status ? store.orders.filter((o) => o.status === status) : store.orders;
    return c.json(result);
  });

  app.get('/:id', (c) => {
    const id = c.req.param('id');
    const order = store.orders.find((o) => o.id === id);
    if (!order) return c.json({ error: `Pesanan ${id} tidak ditemukan` }, 404);
    return c.json(order);
  });

  return app;
}
