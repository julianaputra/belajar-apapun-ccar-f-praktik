import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';

// MCP server `riset` untuk P4: pencarian lokal atas p4/sumber/*.md.
// Berjalan di dalam proses pipa (createSdkMcpServer), jadi tool-nya bernama mcp__riset__<nama>.
// Jangan diubah: yang dikerjakan peserta adalah p4/agents.ts.

export type Sumber = { id: string; judul: string; penerbit: string; tanggal: string; isi: string };

/** Semua sumber di folder, urut nama berkas. Frontmatter wajib: id, judul, penerbit, tanggal. */
export function bacaSumber(dir: string): Sumber[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => {
      const raw = readFileSync(join(dir, f), 'utf8');
      const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw);
      if (!m) throw new Error(`${f}: frontmatter tidak ditemukan.`);
      const fm = parse(m[1]!) as Record<string, unknown>;
      const ambil = (k: string) => {
        const v = fm[k];
        if (v === undefined || v === null || v === '') throw new Error(`${f}: frontmatter "${k}" kosong.`);
        return v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
      };
      return { id: ambil('id'), judul: ambil('judul'), penerbit: ambil('penerbit'), tanggal: ambil('tanggal'), isi: m[2]!.trim() };
    });
}

type Opsi = {
  dir: string;
  /** Panggilan search_sources pertama melempar timeout. Bawaan: env RISET_TIMEOUT=1. */
  timeout?: boolean;
  log?: (event: string, data: Record<string, unknown>) => void;
};

const teks = (text: string, isError = false) => ({ content: [{ type: 'text' as const, text }], ...(isError ? { isError } : {}) });

function cuplikan(isi: string, kata: string[]): string {
  const bawah = isi.toLowerCase();
  const posisi = kata.map((k) => bawah.indexOf(k)).filter((i) => i >= 0);
  const pos = posisi.length > 0 ? Math.min(...posisi) : 0;
  const awal = Math.max(0, pos - 60);
  return `${awal > 0 ? '…' : ''}${isi.slice(awal, awal + 240).replace(/\s+/g, ' ').trim()}…`;
}

export function risetTools(opts: Opsi) {
  const sumber = bacaSumber(opts.dir);
  let sisaTimeout = (opts.timeout ?? process.env.RISET_TIMEOUT === '1') ? 1 : 0;
  const log = opts.log ?? (() => {});

  const search = tool(
    'search_sources',
    'Cari sumber riset lokal dengan kata kunci. Mengembalikan daftar {id, judul, penerbit, tanggal, cuplikan}, paling cocok di atas. Daftar kosong berarti tidak ada sumber yang cocok. Baca isi lengkap dengan read_source.',
    { query: z.string().describe('Kata kunci, misalnya "harga biji decaf"') },
    async ({ query }) => {
      if (sisaTimeout > 0) {
        // Simulasi untuk P4 langkah 4: layanan pencarian tidak menjawab.
        sisaTimeout--;
        log('tool_call', { name: 'search_sources', input: { query }, isError: true });
        throw new Error(`Timeout: layanan pencarian tidak menjawab dalam 30 detik (query: "${query}").`);
      }
      const kata = query.toLowerCase().split(/[^\p{L}\p{N}%]+/u).filter((k) => k.length >= 3);
      const hasil = sumber
        .map((s) => {
          const isi = `${s.judul}\n${s.isi}`.toLowerCase();
          const skor = kata.reduce((n, k) => n + isi.split(k).length - 1, 0);
          return { s, skor };
        })
        .filter((x) => x.skor > 0)
        .sort((a, b) => b.skor - a.skor)
        .slice(0, 5)
        .map(({ s }) => ({ id: s.id, judul: s.judul, penerbit: s.penerbit, tanggal: s.tanggal, cuplikan: cuplikan(s.isi, kata) }));
      log('tool_call', { name: 'search_sources', input: { query }, isError: false, jumlah: hasil.length });
      return teks(JSON.stringify(hasil));
    },
  );

  const read = tool(
    'read_source',
    'Baca isi lengkap satu sumber berdasarkan id dari search_sources. Hasilnya diawali id, judul, penerbit, dan tanggal.',
    { id: z.string().describe('Id sumber, misalnya "survei-konsumen-2024"') },
    async ({ id }) => {
      const s = sumber.find((x) => x.id === id);
      log('tool_call', { name: 'read_source', input: { id }, isError: !s });
      if (!s) return teks(`Sumber "${id}" tidak ada. Id yang ada: ${sumber.map((x) => x.id).join(', ')}`, true);
      return teks(`id: ${s.id}\njudul: ${s.judul}\npenerbit: ${s.penerbit}\ntanggal: ${s.tanggal}\n\n${s.isi}`);
    },
  );

  return [search, read];
}

export function createRisetServer(opts: Opsi) {
  return createSdkMcpServer({ name: 'riset', version: '1.0.0', tools: risetTools(opts) });
}
