import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startRun, type RunLogger } from '../lib/log.js';
import { cekP1 } from './p1.js';
import type { Hasil } from './types.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cek-p1-'));
  process.env.LOG_DIR = join(root, 'logs');
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
// p1-1
// ---------------------------------------------------------------------------

describe('p1-1', () => {
  const PILIHAN = [
    ['get_customer', 'get_customer'],
    ['lookup_order', 'lookup_order'],
    ['get_customer', 'get_customer'],
    ['lookup_order', 'lookup_order'],
    ['get_customer', 'get_customer'],
    ['lookup_order', 'get_customer'],
  ] as const;
  function pilihTool(benar: number) {
    const run = startRun('p1', 'pilih-tool');
    PILIHAN.forEach(([expected], i) => {
      run.log('pilihan', { q: `q${i}`, expected, chosen: i < benar ? expected : 'escalate_to_human' });
    });
  }
  const catatan = () => tulis('catatan/p1-1.md', '# P1-1\n\nSebelum: deskripsi samar.\nSesudah: 6/6 benar.\n');

  it('tanpa log: gagal dan menyuruh menjalankan perintah', async () => {
    expect(pesan(await cekP1['p1-1'](root))).toContain('pnpm p1 pilih-tool');
  });
  it('lulus: 5 dari 6 benar dan catatan sebelum/sesudah ada', async () => {
    pilihTool(5);
    catatan();
    expect(gagal(await cekP1['p1-1'](root))).toEqual([]);
  });
  it('gagal kalau hanya 4 dari 6 benar', async () => {
    pilihTool(4);
    catatan();
    expect(pesan(await cekP1['p1-1'](root))).toContain('4 dari 6');
  });
  it('gagal kalau run belum lengkap 6 pertanyaan', async () => {
    const run = startRun('p1', 'pilih-tool');
    run.log('pilihan', { q: 'q', expected: 'get_customer', chosen: 'get_customer' });
    catatan();
    expect(pesan(await cekP1['p1-1'](root))).toContain('6');
  });
  it('hanya menilai run terakhir', async () => {
    pilihTool(6);
    pilihTool(3);
    catatan();
    expect(pesan(await cekP1['p1-1'](root))).toContain('3 dari 6');
  });
  it('gagal tanpa catatan/p1-1.md', async () => {
    pilihTool(6);
    expect(pesan(await cekP1['p1-1'](root))).toContain('catatan/p1-1.md');
  });
  it('gagal kalau catatan tidak memuat "sebelum" dan "sesudah"', async () => {
    pilihTool(6);
    tulis('catatan/p1-1.md', 'Deskripsi diperbaiki.\n');
    expect(pesan(await cekP1['p1-1'](root))).toContain('sebelum');
  });
});

// ---------------------------------------------------------------------------
// p1-2
// ---------------------------------------------------------------------------

type Percakapan = string[]; // stop_reason berurutan
function loopRun(percakapan: Percakapan[], opts: { batas?: boolean } = {}) {
  const run = startRun('p1', 'loop');
  percakapan.forEach((stops, i) => {
    run.log('percakapan_mulai', { index: i, pesan: `pesan ${i}` });
    for (const s of stops) {
      run.log('request', { model: 'm', tools: ['get_customer'] });
      run.log('response', { stop_reason: s, tool_uses: s === 'tool_use' ? [{ name: 'get_customer', input: {} }] : [] });
    }
    if (opts.batas && i === 0) run.log('batas_iterasi', { index: i });
  });
}
const BAIK: Percakapan = ['tool_use', 'end_turn'];

describe('p1-2', () => {
  it('tanpa log: gagal', async () => {
    expect(pesan(await cekP1['p1-2'](root))).toContain('pnpm p1 loop');
  });
  it('lulus: 3 percakapan, tool_use lalu end_turn', async () => {
    loopRun([BAIK, ['tool_use', 'tool_use', 'end_turn'], BAIK]);
    expect(gagal(await cekP1['p1-2'](root))).toEqual([]);
  });
  it('gagal kalau hanya 2 percakapan', async () => {
    loopRun([BAIK, BAIK]);
    expect(pesan(await cekP1['p1-2'](root))).toContain('3 percakapan');
  });
  it('gagal kalau response terakhir bukan end_turn', async () => {
    loopRun([BAIK, ['tool_use', 'tool_use'], BAIK]);
    expect(pesan(await cekP1['p1-2'](root))).toContain('end_turn');
  });
  it('gagal kalau tidak ada tool_use sebelum end_turn', async () => {
    loopRun([BAIK, ['end_turn'], BAIK]);
    expect(pesan(await cekP1['p1-2'](root))).toContain('tool_use');
  });
  it('gagal kalau loop berhenti karena batas iterasi', async () => {
    loopRun([BAIK, BAIK, BAIK], { batas: true });
    expect(pesan(await cekP1['p1-2'](root))).toContain('batas iterasi');
  });
  it('run lama lulus, run baru gagal: hasilnya gagal', async () => {
    loopRun([BAIK, BAIK, BAIK]);
    loopRun([BAIK, ['tool_use'], BAIK]);
    expect(gagal(await cekP1['p1-2'](root)).length).toBeGreaterThan(0);
  });
  it('run lama gagal, run baru lulus: hasilnya lulus', async () => {
    loopRun([BAIK, ['tool_use'], BAIK]);
    loopRun([BAIK, BAIK, BAIK]);
    expect(gagal(await cekP1['p1-2'](root))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// p1-3 dan p1-4: run agent + log MCP yang dicocokkan lewat runId
// ---------------------------------------------------------------------------

type ToolCall = { name: string; input: Record<string, unknown>; isError?: boolean; content: string };
type AgentOpts = {
  calls?: ToolCall[];
  toolResults?: string[];
  prompt?: string;
  systemPrompt?: unknown;
  mcpRunId?: string;
};

const err = (errorCategory: string, message = 'x') =>
  JSON.stringify({ isError: true, errorCategory, isRetryable: errorCategory === 'transient', message });
const okJson = (v: unknown) => JSON.stringify(v);

function agentRun(skenario: string, opts: AgentOpts = {}): RunLogger {
  const run = startRun('p1', `agent:${skenario}`);
  run.log('prompt_awal', { prompt: opts.prompt ?? 'tolong', systemPrompt: opts.systemPrompt ?? 'Kamu agent CS.' });
  for (const text of opts.toolResults ?? ['{"id":"ORD-1004","delivered_date":"2026-10-27"}']) {
    run.log('sdk_message', {
      type: 'user',
      content: [{ type: 'tool_result', tool_use_id: 't1', content: [{ type: 'text', text }] }],
    });
  }
  run.log('sdk_message', { type: 'result', subtype: 'success', content: { result: 'selesai' } });
  const mcpId = opts.mcpRunId ?? run.runId;
  const mcp = startRun('mcp', mcpId, mcpId);
  for (const c of opts.calls ?? []) {
    mcp.log('tool_call', { name: c.name, input: c.input, isError: c.isError ?? false, content: c.content });
  }
  return run;
}

const CUSTOMER: ToolCall = { name: 'get_customer', input: { query: 'C-002' }, content: okJson({ id: 'C-002', verified: true }) };
const ESKALASI: ToolCall = {
  name: 'escalate_to_human',
  input: { customer_id: 'C-002', root_cause: 'mesin rusak', amount: 8_400_000, recommended_action: 'setujui refund' },
  content: okJson({ ticket_id: 'ESC-0001' }),
};

function refundBesar(extra: Partial<AgentOpts> = {}) {
  return agentRun('refund-besar', { calls: [CUSTOMER, ESKALASI], ...extra });
}
function gangguan(extra: Partial<AgentOpts> = {}) {
  return agentRun('gangguan', {
    calls: [
      { name: 'lookup_order', input: { order_id: 'ORD-1010' }, isError: true, content: err('transient') },
      { name: 'lookup_order', input: { order_id: 'ORD-1010' }, content: okJson({ id: 'ORD-1010' }) },
    ],
    ...extra,
  });
}
function lewatMasa(extra: Partial<AgentOpts> = {}) {
  return agentRun('lewat-masa', {
    calls: [
      CUSTOMER,
      { name: 'process_refund', input: { order_id: 'ORD-1003', amount: 2_450_000 }, isError: true, content: err('business') },
    ],
    ...extra,
  });
}

describe('p1-3', () => {
  it('tanpa log: gagal dan menyebut perintah agent', async () => {
    expect(pesan(await cekP1['p1-3'](root))).toContain('pnpm p1 agent refund-besar');
  });
  it('lulus: ketiga skenario sesuai', async () => {
    refundBesar();
    gangguan();
    lewatMasa();
    expect(gagal(await cekP1['p1-3'](root))).toEqual([]);
  });

  it('refund-besar: gagal kalau refund > 5.000.000 sukses diproses', async () => {
    refundBesar({
      calls: [
        CUSTOMER,
        { name: 'process_refund', input: { order_id: 'ORD-1002', amount: 8_400_000 }, content: okJson({ refund_id: 'RF-ORD-1002' }) },
        ESKALASI,
      ],
    });
    gangguan();
    lewatMasa();
    expect(pesan(await cekP1['p1-3'](root))).toContain('8400000');
  });
  it('refund-besar: refund besar yang ditolak server tidak dihitung', async () => {
    refundBesar({
      calls: [
        CUSTOMER,
        { name: 'process_refund', input: { order_id: 'ORD-1002', amount: 8_400_000 }, isError: true, content: err('business') },
        ESKALASI,
      ],
    });
    gangguan();
    lewatMasa();
    expect(gagal(await cekP1['p1-3'](root))).toEqual([]);
  });
  it('refund-besar: gagal tanpa escalate_to_human', async () => {
    refundBesar({ calls: [CUSTOMER] });
    gangguan();
    lewatMasa();
    expect(pesan(await cekP1['p1-3'](root))).toContain('escalate_to_human');
  });
  it('refund-besar: gagal kalau log MCP untuk run itu tidak ada', async () => {
    refundBesar({ mcpRunId: 'run-lain' });
    gangguan();
    lewatMasa();
    expect(pesan(await cekP1['p1-3'](root))).toContain('logs/mcp.jsonl');
  });
  it('refund-besar: hanya menilai run terakhir', async () => {
    refundBesar();
    refundBesar({ calls: [CUSTOMER] });
    gangguan();
    lewatMasa();
    expect(pesan(await cekP1['p1-3'](root))).toContain('escalate_to_human');
  });

  it('gangguan: gagal kalau error transient tidak dicoba ulang', async () => {
    refundBesar();
    gangguan({
      calls: [{ name: 'lookup_order', input: { order_id: 'ORD-1010' }, isError: true, content: err('transient') }],
    });
    lewatMasa();
    expect(pesan(await cekP1['p1-3'](root))).toContain('transient');
  });
  it('gangguan: gagal kalau error masih teks polos (tanpa errorCategory)', async () => {
    refundBesar();
    gangguan({
      calls: [
        { name: 'lookup_order', input: { order_id: 'ORD-1010' }, isError: true, content: 'Error: timeout' },
        { name: 'lookup_order', input: { order_id: 'ORD-1010' }, content: okJson({ id: 'ORD-1010' }) },
      ],
    });
    lewatMasa();
    expect(pesan(await cekP1['p1-3'](root))).toContain('errorCategory');
  });

  it('lewat-masa: gagal kalau refund dicoba ulang setelah error bisnis', async () => {
    refundBesar();
    gangguan();
    lewatMasa({
      calls: [
        CUSTOMER,
        { name: 'process_refund', input: { order_id: 'ORD-1003', amount: 2_450_000 }, isError: true, content: err('business') },
        { name: 'process_refund', input: { order_id: 'ORD-1003', amount: 1_000_000 }, isError: true, content: err('business') },
      ],
    });
    expect(pesan(await cekP1['p1-3'](root))).toContain('ORD-1003');
  });
  it('lewat-masa: gagal tanpa error business', async () => {
    refundBesar();
    gangguan();
    lewatMasa({
      calls: [
        CUSTOMER,
        { name: 'process_refund', input: { order_id: 'ORD-1003', amount: 2_450_000 }, isError: true, content: 'Error: lewat 30 hari' },
      ],
    });
    expect(pesan(await cekP1['p1-3'](root))).toContain('business');
  });

  it('tanggal: gagal kalau tool_result masih memuat format DD/MM/YYYY', async () => {
    refundBesar({ toolResults: ['{"order_date":"14/10/2026"}'] });
    gangguan();
    lewatMasa();
    expect(pesan(await cekP1['p1-3'](root))).toContain('14/10/2026');
  });
  it('tanggal: gagal kalau tool_result masih memuat format "20 Okt 2026"', async () => {
    refundBesar();
    gangguan({ toolResults: ['{"delivered_date":"20 Okt 2026"}'] });
    lewatMasa();
    expect(pesan(await cekP1['p1-3'](root))).toContain('20 Okt 2026');
  });
  it('tanggal: manual (bukan lulus) kalau ada panggilan MCP tapi tidak ada teks tool_result', async () => {
    refundBesar({ toolResults: [] });
    gangguan();
    lewatMasa();
    const hs = await cekP1['p1-3'](root);
    const tanggal = hs.find((h) => h.label.startsWith('Tanggal'));
    expect(tanggal?.status).toBe('manual');
    expect(tanggal?.pesan).toContain('agent:refund-besar');
    expect(gagal(hs)).toEqual([]);
  });
  it('tanggal: tetap gagal kalau run lain memuat tanggal non-ISO meski satu run tanpa teks', async () => {
    refundBesar({ toolResults: [] });
    gangguan({ toolResults: ['{"delivered_date":"20 Okt 2026"}'] });
    lewatMasa();
    expect(pesan(await cekP1['p1-3'](root))).toContain('20 Okt 2026');
  });
  it('tanggal: lulus kalau semua run punya teks tool_result dengan tanggal ISO', async () => {
    refundBesar();
    gangguan();
    lewatMasa();
    const tanggal = (await cekP1['p1-3'](root)).find((h) => h.label.startsWith('Tanggal'));
    expect(tanggal?.status).toBe('ok');
  });
  it('tanggal: tool_result berupa string juga diperiksa', async () => {
    refundBesar();
    gangguan();
    const run = lewatMasa();
    run.log('sdk_message', { type: 'user', content: [{ type: 'tool_result', tool_use_id: 't9', content: 'kirim 1 Nov 2026' }] });
    expect(pesan(await cekP1['p1-3'](root))).toContain('1 Nov 2026');
  });
});

describe('p1-4', () => {
  const MULTI: ToolCall[] = [
    { name: 'get_customer', input: { query: 'agus.wijaya@example.test' }, content: okJson({ id: 'C-004', verified: true }) },
    { name: 'lookup_order', input: { order_id: 'ORD-1004' }, content: okJson({ id: 'ORD-1004' }) },
    {
      name: 'escalate_to_human',
      input: { customer_id: 'C-004', root_cause: 'alamat salah', amount: 0, recommended_action: 'ubah alamat' },
      content: okJson({ ticket_id: 'ESC-0001' }),
    },
  ];
  const FAKTA = '## case facts\n- customer_id: C-004';

  it('tanpa log: gagal', async () => {
    expect(pesan(await cekP1['p1-4'](root))).toContain('pnpm p1 agent multi-masalah');
  });
  it('lulus, dan uji ke rekan setim tetap manual', async () => {
    agentRun('multi-masalah', { calls: MULTI, systemPrompt: FAKTA });
    const hs = await cekP1['p1-4'](root);
    expect(gagal(hs)).toEqual([]);
    expect(manual(hs)).toHaveLength(1);
  });
  it('blok case facts boleh ada di prompt, dan systemPrompt boleh berupa objek', async () => {
    agentRun('multi-masalah', {
      calls: MULTI,
      prompt: `Case Facts:\n- email: x`,
      systemPrompt: { type: 'preset', preset: 'claude_code', append: 'Bantu pelanggan.' },
    });
    expect(gagal(await cekP1['p1-4'](root))).toEqual([]);
  });
  it('gagal kalau hanya satu jenis tool dipanggil', async () => {
    agentRun('multi-masalah', { calls: [MULTI[2]!], systemPrompt: FAKTA });
    expect(pesan(await cekP1['p1-4'](root))).toContain('tool berbeda');
  });
  it('gagal kalau handoff masih {summary} saja', async () => {
    agentRun('multi-masalah', {
      calls: [MULTI[0]!, MULTI[1]!, { name: 'escalate_to_human', input: { summary: 'tolong bantu' }, content: okJson({}) }],
      systemPrompt: FAKTA,
    });
    const p = pesan(await cekP1['p1-4'](root));
    expect(p).toContain('root_cause');
    expect(p).toContain('recommended_action');
  });
  it('gagal kalau tidak ada eskalasi', async () => {
    agentRun('multi-masalah', { calls: MULTI.slice(0, 2), systemPrompt: FAKTA });
    expect(pesan(await cekP1['p1-4'](root))).toContain('escalate_to_human');
  });
  it('gagal tanpa blok case facts', async () => {
    agentRun('multi-masalah', { calls: MULTI, systemPrompt: 'Kamu agent CS.' });
    expect(pesan(await cekP1['p1-4'](root))).toContain('case facts');
  });
});
