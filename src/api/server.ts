import { serve } from '@hono/node-server';
import { loadStore } from '../toko/store.js';
import { createApp } from './app.js';

const store = loadStore();
for (const w of store.warnings) console.warn(`Peringatan: ${w}`);

const port = 3000;
serve({ fetch: createApp(store).fetch, port }, () => {
  console.log(`API Kopi Nusantara jalan di http://localhost:${port}`);
});
