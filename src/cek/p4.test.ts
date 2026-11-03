import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startRun, type RunLogger } from '../lib/log.js';
import { bacaSumber } from '../mcp/riset.js';
import { cekP4 } from './p4.js';
import type { Hasil } from './types.js';

const STARTER = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cek-p4-'));
  process.env.LOG_DIR = join(root, 'logs');
  cpSync(join(STARTER, 'p4', 'sumber'), join(root, 'p4', 'sumber'), { recursive: true });
  cpSync(join(STARTER, 'p4', 'konflik.json'), join(root, 'p4', 'konflik.json'));
});
afterEach(() => {
  delete process.env.LOG_DIR;
  rmSync(root, { recursive: true, force: true });
});

function tulis(rel: string, isi: string): void {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), isi);
}
const gagal = (hs: Hasil[]) => hs.filter((h) => h.status === 'gagal');
const manual = (hs: Hasil[]) => hs.filter((h) => h.status === 'manual');
const pesan = (hs: Hasil[]) => gagal(hs).map((h) => `${h.label} ${h.pesan}`).join(' ');

// ---------------------------------------------------------------------------
// Pembuat log palsu, bentuknya sama dengan event sdk_message dari p4/pipa.ts
// ---------------------------------------------------------------------------

type Blok = Record<string, unknown>;

function asisten(run: RunLogger, content: Blok[], opts: { parent?: string | null; id?: string | null } = {}) {
  const message_id = opts.id === undefined ? 'msg-x' : opts.id;
  run.log('sdk_message', { type: 'assistant', parent_tool_use_id: opts.parent ?? null, message_id, content });
}
function hasilTool(run: RunLogger, tool_use_id: string, teks: string, parent: string | null = null) {
  run.log('sdk_message', {
    type: 'user',
    parent_tool_use_id: parent,
    content: [{ type: 'tool_result', tool_use_id, content: [{ type: 'text', text: teks }] }],
  });
}
const panggilAgent = (id: string, subagent_type: string, prompt: string): Blok => ({
  type: 'tool_use',
  id,
  name: 'Agent',
  input: { description: `tugas ${subagent_type}`, prompt, subagent_type },
});
const pakaiTool = (id: string, name: string, input: Blok = {}): Blok => ({ type: 'tool_use', id, name, input });

type Opsi = {
  analystTools?: string[];
  searcherTools?: string[];
  paralel?: boolean;
  promptAnalyst?: string;
  tanpaAnalyst?: boolean;
};

/** Run riset "baik": dua searcher paralel, lalu analyst yang diberi id sumber dari searcher. */
function runRiset(label = 'riset', o: Opsi = {}): RunLogger {
  const run = startRun('p4', label);
  run.log('prompt_awal', { prompt: 'Perlu tidak Kopi Nusantara menjual biji kopi decaf?' });
  const s1 = panggilAgent('A1', 'searcher', 'Cari data permintaan pasar decaf.');
  const s2 = panggilAgent('A2', 'searcher', 'Cari harga pemasok decaf.');
  if (o.paralel === false) {
    asisten(run, [s1], { id: 'msg-1' });
    asisten(run, [s2], { id: 'msg-2' });
  } else {
    // SDK mengirim satu pesan per blok; blok satu respons berbagi message.id.
    asisten(run, [{ type: 'text', text: 'Saya bagi tugasnya.' }], { id: 'msg-1' });
    asisten(run, [s1], { id: 'msg-1' });
    asisten(run, [s2], { id: 'msg-1' });
  }
  for (const [i, nama] of (o.searcherTools ?? ['mcp__riset__search_sources', 'mcp__riset__read_source']).entries()) {
    asisten(run, [pakaiTool(`S${i}`, nama, { query: 'decaf' })], { parent: 'A1', id: `sub-${i}` });
    hasilTool(run, `S${i}`, 'id: survei-konsumen-2024', 'A1');
  }
  hasilTool(run, 'A1', '[{"claim":"18% tertarik decaf","source":"survei-konsumen-2024"}]');
  hasilTool(run, 'A2', '[{"claim":"Harga Rp 245.000/kg","source":"harga-pemasok-decaf"}]');
  if (!o.tanpaAnalyst) {
    asisten(run, [panggilAgent('A3', 'analyst', o.promptAnalyst ?? 'Temuan searcher: 18% (survei-konsumen-2024), Rp 245.000/kg (harga-pemasok-decaf).')], {
      id: 'msg-3',
    });
    for (const [i, nama] of (o.analystTools ?? ['mcp__riset__read_source']).entries()) {
      asisten(run, [pakaiTool(`N${i}`, nama, { id: 'survei-konsumen-2024' })], { parent: 'A3', id: `subn-${i}` });
      hasilTool(run, `N${i}`, 'isi sumber', 'A3');
    }
    hasilTool(run, 'A3', 'Analisis selesai.');
  }
  run.log('riset_selesai', { durasi_ms: 1000 });
  return run;
}

const DEKOMPOSISI = ['permintaan pasar', 'harga pemasok', 'ulasan pelanggan', 'kompetitor', 'tren kesehatan'];
const TEMUAN = [
  { claim: '18% tertarik decaf', evidence_excerpt: '18% responden tertarik', source: 'survei-konsumen-2024', date: '2024-03-12' },
  { claim: '31% tertarik decaf', evidence_excerpt: '31% responden tertarik', source: 'riset-pasar-decaf-2026', date: '2026-08-20' },
];
const LAPORAN = `# Laporan riset decaf

Rekomendasi: uji coba kecil. Sumber: survei-konsumen-2024, riset-pasar-decaf-2026.

## Temuan yang diperdebatkan

| Angka | Sumber | Tahun data |
| --- | --- | --- |
| 18% | survei-konsumen-2024 | 2023 |
| 31% | riset-pasar-decaf-2026 | 2026 |

## Celah cakupan

Tidak ada sumber tentang aturan label decaf.
`;

/** Berkas hasil satu label run: hasil/p4/<label>/. */
function hasilBerkas(o: { dekomposisi?: unknown; temuan?: unknown; laporan?: string } = {}, label = 'riset') {
  tulis(`hasil/p4/${label}/dekomposisi.json`, JSON.stringify(o.dekomposisi ?? DEKOMPOSISI));
  tulis(`hasil/p4/${label}/temuan.json`, JSON.stringify(o.temuan ?? TEMUAN));
  tulis(`hasil/p4/${label}/laporan.md`, o.laporan ?? LAPORAN);
}

// ---------------------------------------------------------------------------
// Berkas data P4
// ---------------------------------------------------------------------------

describe('berkas data P4', () => {
  it('konflik.json: dua angka di dua sumber dengan tahun data berbeda', () => {
    const konflik = JSON.parse(readFileSync(join(STARTER, 'p4', 'konflik.json'), 'utf8')) as { angka: string[]; sumber: string[] };
    const sumber = bacaSumber(join(STARTER, 'p4', 'sumber'));
    expect(sumber).toHaveLength(8);
    const [a, b] = konflik.sumber.map((id) => sumber.find((s) => s.id === id)!);
    expect(a!.isi).toContain(konflik.angka[0]);
    expect(b!.isi).toContain(konflik.angka[1]);
    expect(a!.tanggal.slice(0, 4)).not.toBe(b!.tanggal.slice(0, 4));
    // Setiap angka hanya muncul di sumbernya sendiri: konfliknya tepat satu.
    for (const angka of konflik.angka) expect(sumber.filter((s) => s.isi.includes(angka))).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// p4-1
// ---------------------------------------------------------------------------

describe('p4-1', () => {
  it('tanpa log dan hasil: gagal dan menyuruh menjalankan pnpm p4', async () => {
    const hs = await cekP4['p4-1'](root);
    expect(gagal(hs).length).toBeGreaterThan(0);
    expect(pesan(hs)).toContain('pnpm p4');
  });
  it('lulus: ≥4 sub-bidang dan setiap subagent memakai tool perannya', async () => {
    runRiset();
    hasilBerkas();
    expect(gagal(await cekP4['p4-1'](root))).toEqual([]);
  });
  it('gagal kalau dekomposisi kurang dari 4', async () => {
    runRiset();
    hasilBerkas({ dekomposisi: ['pasar', 'harga', 'kompetitor'] });
    expect(pesan(await cekP4['p4-1'](root))).toContain('3');
  });
  it('gagal kalau analyst memakai search_sources', async () => {
    runRiset('riset', { analystTools: ['mcp__riset__read_source', 'mcp__riset__search_sources'] });
    hasilBerkas();
    expect(pesan(await cekP4['p4-1'](root))).toContain('analyst');
    expect(pesan(await cekP4['p4-1'](root))).toContain('mcp__riset__search_sources');
  });
  it('gagal kalau searcher memakai tool di luar mcp__riset__*', async () => {
    runRiset('riset', { searcherTools: ['mcp__riset__search_sources', 'WebSearch'] });
    hasilBerkas();
    expect(pesan(await cekP4['p4-1'](root))).toContain('WebSearch');
  });
  it('starter tanpa subagent: gagal dengan pesan yang menyebut p4/agents.ts', async () => {
    const run = startRun('p4', 'riset');
    asisten(run, [pakaiTool('T1', 'mcp__riset__search_sources', { query: 'decaf' })]);
    hasilTool(run, 'T1', 'hasil');
    hasilBerkas();
    const p = pesan(await cekP4['p4-1'](root));
    expect(p).toContain('searcher');
    expect(p).toContain('p4/agents.ts');
  });
  it('subagent dikenali juga lewat tool bernama Task', async () => {
    const run = startRun('p4', 'riset');
    asisten(run, [{ type: 'tool_use', id: 'A1', name: 'Task', input: { prompt: 'x', subagent_type: 'searcher' } }]);
    asisten(run, [{ type: 'tool_use', id: 'A2', name: 'Task', input: { prompt: 'x', subagent_type: 'analyst' } }]);
    asisten(run, [pakaiTool('N1', 'mcp__riset__search_sources')], { parent: 'A2' });
    hasilBerkas();
    expect(pesan(await cekP4['p4-1'](root))).toContain('mcp__riset__search_sources');
  });
  it('hanya menilai run riset terakhir', async () => {
    runRiset('riset', { analystTools: ['mcp__riset__search_sources'] });
    runRiset();
    hasilBerkas();
    expect(gagal(await cekP4['p4-1'](root))).toEqual([]);
  });
  it('dekomposisi.json rusak: gagal tanpa crash', async () => {
    runRiset();
    hasilBerkas();
    tulis('hasil/p4/riset/dekomposisi.json', '{rusak');
    expect(pesan(await cekP4['p4-1'](root))).toContain('dekomposisi.json');
  });
});

// ---------------------------------------------------------------------------
// p4-2
// ---------------------------------------------------------------------------

describe('p4-2', () => {
  it('tanpa log: gagal dan menyuruh menjalankan pnpm p4', async () => {
    expect(pesan(await cekP4['p4-2'](root))).toContain('pnpm p4');
  });
  it('lulus: dua subagent dalam satu respons dan prompt analyst memuat id sumber; perbandingan waktu ⬜', async () => {
    runRiset();
    const hs = await cekP4['p4-2'](root);
    expect(gagal(hs)).toEqual([]);
    expect(manual(hs).map((h) => h.pesan).join(' ')).toContain('catatan/p4-2.md');
  });
  it('gagal kalau subagent dipanggil satu per satu', async () => {
    runRiset('riset', { paralel: false });
    expect(pesan(await cekP4['p4-2'](root))).toMatch(/satu respons/);
  });
  it('gagal kalau prompt analyst tidak memuat id sumber dari searcher', async () => {
    runRiset('riset', { promptAnalyst: 'Analisis hasil pencarian tadi.' });
    expect(pesan(await cekP4['p4-2'](root))).toContain('prompt analyst');
  });
  it('gagal kalau analyst tidak dipanggil', async () => {
    runRiset('riset', { tanpaAnalyst: true });
    expect(pesan(await cekP4['p4-2'](root))).toContain('analyst');
  });
  it('gagal dengan pesan khusus kalau log tidak memuat message_id', async () => {
    const run = startRun('p4', 'riset');
    asisten(run, [panggilAgent('A1', 'searcher', 'x')], { id: null });
    asisten(run, [panggilAgent('A2', 'searcher', 'y')], { id: null });
    expect(pesan(await cekP4['p4-2'](root))).toContain('tidak memuat message_id');
  });
});

// ---------------------------------------------------------------------------
// p4-3
// ---------------------------------------------------------------------------

describe('p4-3', () => {
  it('tanpa hasil: gagal dan menyuruh menjalankan pnpm p4', async () => {
    expect(pesan(await cekP4['p4-3'](root))).toContain('pnpm p4');
  });
  it('lulus: setiap temuan lengkap, sumbernya ada, dan disebut di laporan', async () => {
    hasilBerkas();
    expect(gagal(await cekP4['p4-3'](root))).toEqual([]);
  });
  it('gagal kalau temuan kehilangan date', async () => {
    hasilBerkas({ temuan: [{ ...TEMUAN[0], date: '' }, TEMUAN[1]] });
    expect(pesan(await cekP4['p4-3'](root))).toContain('date');
  });
  it('gagal kalau source bukan id di p4/sumber/', async () => {
    hasilBerkas({ temuan: [{ ...TEMUAN[0], source: 'survei-karangan.md' }] });
    expect(pesan(await cekP4['p4-3'](root))).toContain('survei-karangan.md');
  });
  it('gagal kalau id sumber tidak disebut di laporan', async () => {
    hasilBerkas({ laporan: '# Laporan\n\nHanya survei-konsumen-2024.\n' });
    expect(pesan(await cekP4['p4-3'](root))).toContain('riset-pasar-decaf-2026');
  });
  it('id yang hanya ada di blok json laporan tidak dihitung', async () => {
    const json = '```json\n' + JSON.stringify({ temuan: TEMUAN }) + '\n```\n';
    hasilBerkas({ laporan: `# Laporan\n\nHanya survei-konsumen-2024.\n\n${json}` });
    expect(pesan(await cekP4['p4-3'](root))).toContain('riset-pasar-decaf-2026');
  });
  it('gagal kalau temuan.json kosong', async () => {
    hasilBerkas({ temuan: [] });
    expect(pesan(await cekP4['p4-3'](root))).toContain('temuan.json');
  });
  it('hanya membaca hasil run riset, bukan riset-timeout', async () => {
    hasilBerkas({ temuan: [] }, 'riset-timeout');
    expect(pesan(await cekP4['p4-3'](root))).toContain('pnpm p4');
    hasilBerkas();
    expect(gagal(await cekP4['p4-3'](root))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// p4-4
// ---------------------------------------------------------------------------

const ERROR_TERSTRUKTUR = JSON.stringify({ failure_type: 'timeout', attempted_query: 'minat decaf', partial_results: [] });

describe('p4-4', () => {
  /** Run riset-timeout dengan error terstruktur, plus berkas hasil kedua label. */
  function siapkan(o: { timeout?: string; riset?: string; error?: string } = {}) {
    const run = runRiset('riset-timeout');
    hasilTool(run, 'A9', o.error ?? ERROR_TERSTRUKTUR);
    hasilBerkas({ laporan: o.timeout ?? LAPORAN }, 'riset-timeout');
    hasilBerkas({ laporan: o.riset ?? LAPORAN });
  }

  it('tanpa log: gagal dan menyuruh menjalankan pnpm p4 --timeout', async () => {
    expect(pesan(await cekP4['p4-4'](root))).toContain('pnpm p4 --timeout');
  });
  it('lulus: hasil subagent memuat error terstruktur, laporan memuat celah dan konflik', async () => {
    siapkan();
    expect(gagal(await cekP4['p4-4'](root))).toEqual([]);
  });
  it('error terstruktur boleh berupa teks asisten', async () => {
    const run = runRiset('riset-timeout');
    asisten(run, [{ type: 'text', text: `Searcher gagal: ${ERROR_TERSTRUKTUR}` }]);
    hasilBerkas({}, 'riset-timeout');
    hasilBerkas();
    expect(gagal(await cekP4['p4-4'](root))).toEqual([]);
  });
  it('gagal kalau error tidak memuat ketiga field', async () => {
    siapkan({ error: JSON.stringify({ failure_type: 'timeout' }) });
    expect(pesan(await cekP4['p4-4'](root))).toContain('attempted_query');
  });
  it('error di run riset biasa tidak dihitung', async () => {
    runRiset('riset-timeout');
    const lain = runRiset('riset');
    hasilTool(lain, 'A9', ERROR_TERSTRUKTUR);
    hasilBerkas({}, 'riset-timeout');
    hasilBerkas();
    expect(pesan(await cekP4['p4-4'](root))).toContain('failure_type');
  });
  it('gagal kalau laporan run riset-timeout tidak memuat celah cakupan', async () => {
    // Laporan run riset menyebut celah cakupan, tapi yang dinilai laporan run timeout.
    siapkan({ timeout: LAPORAN.replace('## Celah cakupan', '## Lain-lain') });
    const p = pesan(await cekP4['p4-4'](root));
    expect(p).toMatch(/celah cakupan/i);
    expect(p).toContain('riset-timeout/laporan.md');
  });
  it('gagal kalau laporan run riset-timeout belum ada', async () => {
    const run = runRiset('riset-timeout');
    hasilTool(run, 'A9', ERROR_TERSTRUKTUR);
    hasilBerkas();
    expect(pesan(await cekP4['p4-4'](root))).toContain('hasil/p4/riset-timeout/laporan.md');
  });
  it('konflik dinilai dari laporan run riset: run timeout boleh melewatkan satu sumber', async () => {
    const tanpa31 = LAPORAN.replace('| 31% | riset-pasar-decaf-2026 | 2026 |\n', '');
    siapkan({ timeout: tanpa31 });
    expect(gagal(await cekP4['p4-4'](root))).toEqual([]);
  });
  it('gagal kalau bagian Temuan yang diperdebatkan (run riset) tidak memuat kedua angka dan sumber', async () => {
    // 31% disebut di luar bagian itu saja.
    const riset = LAPORAN.replace('| 31% | riset-pasar-decaf-2026 | 2026 |\n', '') + '\nAngka lain: 31% (riset-pasar-decaf-2026).\n';
    siapkan({ riset });
    const p = pesan(await cekP4['p4-4'](root));
    expect(p).toContain('31%');
    expect(p).toContain('riset-pasar-decaf-2026');
  });
  it('gagal kalau bagian Temuan yang diperdebatkan tidak ada', async () => {
    siapkan({ riset: LAPORAN.replace('## Temuan yang diperdebatkan', '## Angka') });
    expect(pesan(await cekP4['p4-4'](root))).toContain('Temuan yang diperdebatkan');
  });
});
