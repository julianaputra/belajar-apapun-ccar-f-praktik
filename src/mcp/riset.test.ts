import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it } from 'vitest';
import { bacaSumber, createRisetServer, risetTools } from './riset.js';

/** Sambungkan client MCP ke instance server SDK tanpa proses dan tanpa API. */
async function sambung(server: ReturnType<typeof createRisetServer>) {
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.instance.connect(a);
  const client = new Client({ name: 'tes', version: '1.0.0' });
  await client.connect(b);
  return { client, close: () => client.close() };
}

// Tool riset diuji lewat handler-nya langsung. Agent SDK tidak dijalankan.

const SUMBER = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'p4', 'sumber');

type Hasil = { content: { type: string; text: string }[]; isError?: boolean };

function siapkan(opts: { timeout?: boolean } = {}) {
  const log: { event: string; data: Record<string, unknown> }[] = [];
  const tools = risetTools({ dir: SUMBER, ...opts, log: (event, data) => log.push({ event, data }) });
  const panggil = (nama: string, args: Record<string, unknown>) =>
    tools.find((t) => t.name === nama)!.handler(args as never, {}) as Promise<Hasil>;
  return { tools, log, panggil, teks: (h: Hasil) => h.content.map((c) => c.text).join('\n') };
}

afterEach(() => {
  delete process.env.RISET_TIMEOUT;
});

describe('bacaSumber', () => {
  it('membaca frontmatter id, judul, penerbit, tanggal dari 8 sumber', () => {
    const s = bacaSumber(SUMBER);
    expect(s).toHaveLength(8);
    for (const x of s) {
      expect(x.id).toMatch(/^[a-z0-9-]+$/);
      expect(x.judul.length).toBeGreaterThan(5);
      expect(x.penerbit.length).toBeGreaterThan(3);
      expect(x.tanggal).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(x.isi).not.toContain('penerbit:');
    }
    expect(new Set(s.map((x) => x.id)).size).toBe(8);
  });
});

describe('risetTools', () => {
  it('server bernama riset dengan tool search_sources dan read_source', () => {
    const { tools } = siapkan();
    expect(tools.map((t) => t.name).sort()).toEqual(['read_source', 'search_sources']);
    const server = createRisetServer({ dir: SUMBER });
    expect(server.type).toBe('sdk');
    expect(server.name).toBe('riset');
  });

  it('search_sources mengembalikan id, judul, tanggal, dan cuplikan sumber yang cocok', async () => {
    const { panggil, teks, log } = siapkan();
    const h = await panggil('search_sources', { query: 'harga biji hijau decaf' });
    expect(h.isError).toBeFalsy();
    const hasil = JSON.parse(teks(h)) as { id: string; tanggal: string; cuplikan: string }[];
    expect(hasil[0]!.id).toBe('harga-pemasok-decaf');
    expect(hasil[0]!.tanggal).toBe('2026-09-05');
    expect(hasil[0]!.cuplikan.length).toBeGreaterThan(20);
    expect(log[0]).toMatchObject({ event: 'tool_call', data: { name: 'search_sources', isError: false } });
  });

  it('search_sources tanpa hasil: daftar kosong (bukan error)', async () => {
    const { panggil, teks } = siapkan();
    const h = await panggil('search_sources', { query: 'zzzz qqqq' });
    expect(h.isError).toBeFalsy();
    expect(JSON.parse(teks(h))).toEqual([]);
  });

  it('read_source mengembalikan isi lengkap beserta tanggal; id tak dikenal jadi error dengan daftar id', async () => {
    const { panggil, teks } = siapkan();
    const ok = await panggil('read_source', { id: 'survei-konsumen-2024' });
    expect(teks(ok)).toContain('18%');
    expect(teks(ok)).toContain('2024-03-12');
    const salah = await panggil('read_source', { id: 'tidak-ada' });
    expect(salah.isError).toBe(true);
    expect(teks(salah)).toContain('riset-pasar-decaf-2026');
  });

  it('timeout: hanya panggilan search_sources pertama yang melempar timeout', async () => {
    const { panggil, log } = siapkan({ timeout: true });
    await expect(panggil('search_sources', { query: 'decaf' })).rejects.toThrow(/timeout/i);
    const kedua = await panggil('search_sources', { query: 'decaf' });
    expect(kedua.isError).toBeFalsy();
    expect(log[0]).toMatchObject({ data: { name: 'search_sources', isError: true } });
  });

  it('RISET_TIMEOUT=1 menyalakan timeout kalau opsi tidak diberikan', async () => {
    process.env.RISET_TIMEOUT = '1';
    const { panggil } = siapkan();
    await expect(panggil('search_sources', { query: 'decaf' })).rejects.toThrow(/timeout/i);
  });
});

describe('createRisetServer lewat protokol MCP (in-memory)', () => {
  it('daftar tool, timeout jadi tool_result isError, lalu pencarian berikutnya berhasil', async () => {
    const { client, close } = await sambung(createRisetServer({ dir: SUMBER, timeout: true }));
    try {
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name).sort()).toEqual(['read_source', 'search_sources']);
      const pertama = (await client.callTool({ name: 'search_sources', arguments: { query: 'decaf' } })) as Hasil;
      expect(pertama.isError).toBe(true);
      expect(pertama.content[0]!.text).toMatch(/timeout/i);
      const kedua = (await client.callTool({ name: 'search_sources', arguments: { query: 'decaf' } })) as Hasil;
      expect(kedua.isError).toBeFalsy();
      expect(JSON.parse(kedua.content[0]!.text).length).toBeGreaterThan(0);
    } finally {
      await close();
    }
  });
});
