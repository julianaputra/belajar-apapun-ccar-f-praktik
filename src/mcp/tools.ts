import { z } from 'zod';
import { daysSince } from '../toko/dates.js';
import { loadStore, type Store } from '../toko/store.js';

// Berkas ini sengaja "belum baik": deskripsi tool samar dan error berupa teks polos.
// Peserta memperbaikinya di P1.

export type ToolOutput = { content: string; isError?: boolean };

export type ToolDef = {
  name: string;
  description: string;
  inputSchema: z.ZodRawShape;
};

export const toolDefs: ToolDef[] = [
  {
    name: 'get_customer',
    description: 'Get info.',
    inputSchema: { query: z.string() },
  },
  {
    name: 'lookup_order',
    description: 'Get info.',
    inputSchema: { order_id: z.string() },
  },
  {
    name: 'process_refund',
    description: 'Refund.',
    inputSchema: { order_id: z.string(), amount: z.number(), reason: z.string() },
  },
  {
    name: 'escalate_to_human',
    description: 'Escalate.',
    inputSchema: { summary: z.string() },
  },
];

let store: Store | undefined;
/** Muat data sekali per proses. Peringatan dicetak server saat start (lewat stderr). */
export function getStore(): Store {
  store ??= loadStore();
  return store;
}

let lookupCalls = 0;

function error(message: string): ToolOutput {
  return { content: `Error: ${message}`, isError: true };
}

function ok(value: unknown): ToolOutput {
  return { content: typeof value === 'string' ? value : JSON.stringify(value) };
}

const REFUND_WINDOW_DAYS = 30;

export const handlers: Record<string, (input: any) => Promise<ToolOutput>> = {
  async get_customer({ query }: { query: string }) {
    const q = query.trim().toLowerCase();
    const found = getStore().customers.find(
      (c) => c.id.toLowerCase() === q || c.email.toLowerCase() === q || c.name.toLowerCase() === q,
    );
    return found ? ok(found) : error('pelanggan tidak ditemukan.');
  },

  async lookup_order({ order_id }: { order_id: string }) {
    lookupCalls++;
    if (process.env.TOKO_GANGGUAN === '1' && lookupCalls === 1) {
      return error('timeout saat menghubungi database pesanan.');
    }
    const order = getStore().orders.find((o) => o.id === order_id.trim());
    return order ? ok(order) : error('pesanan tidak ditemukan.');
  },

  async process_refund({ order_id, amount, reason }: { order_id: string; amount: number; reason: string }) {
    const order = getStore().orders.find((o) => o.id === order_id.trim());
    if (!order) return error('pesanan tidak ditemukan.');
    if (order.status !== 'diterima' || !order.delivered_date) {
      return error('pesanan ini belum diterima.');
    }
    const days = daysSince(order.delivered_date);
    if (days === undefined) return error('tanggal terima pesanan tidak bisa dibaca.');
    if (days > REFUND_WINDOW_DAYS) return error('pesanan ini sudah lewat 30 hari sejak diterima.');
    // Nominal sengaja tidak dibatasi di sini. Batas dipasang peserta lewat hook.
    return ok({ refund_id: `RF-${order.id}`, order_id: order.id, amount, reason, status: 'diproses' });
  },

  async escalate_to_human({ summary }: { summary: string }) {
    return ok({ ticket_id: 'ESC-0001', summary, status: 'diteruskan ke staf' });
  },
};
