import { Hono } from 'hono';
import type { Store } from '../toko/store.js';
import { customersRoutes } from './customers.js';
import { ordersRoutes } from './orders.js';

export function createApp(store: Store): Hono {
  const app = new Hono();
  app.route('/orders', ordersRoutes(store));
  app.route('/customers', customersRoutes(store));
  return app;
}
