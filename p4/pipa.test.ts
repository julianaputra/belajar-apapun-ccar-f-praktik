import type { McpSdkServerConfigWithInstance, Options, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cekP4 } from '../src/cek/p4.js';
import { readRuns } from '../src/lib/log.js';
import { ambilBlokJson, PERTANYAAN, runRiset } from './pipa.js';

// Tes pipa P4. query() Agent SDK diganti versi palsu, jadi API tidak dipanggil.

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'p4-pipa-'));
  process.env.LOG_DIR = join(root, 'logs');
  cpSync(new URL('./sumber', import.meta.url), join(root, 'p4', 'sumber'), { recursive: true });
});
afterEach(() => {
  delete process.env.LOG_DIR;
  rmSync(root, { recursive: true, force: true });
});

type Panggilan = { prompt: string; options: Options };
function queryPalsu(pesan: SDKMessage[], panggilan: Panggilan[]) {
  return ((params: Panggilan) => {
    panggilan.push(params);
    return (async function* () {
      for (const m of pesan) yield m;
    })();
  }) as never;
}

const LAPORAN = `# Laporan

Ringkasan singkat.

\`\`\`json
{"dekomposisi": ["permintaan", "harga", "ulasan", "kompetitor"]}
\`\`\`

\`\`\`json
{"temuan": [{"claim": "c", "evidence_excerpt": "e", "source": "survei-konsumen-2024", "date": "2024-03-12"}]}
\`\`\`
`;

const PESAN = [
  { type: 'system', subtype: 'init', tools: ['Agent'], mcp_servers: [{ name: 'riset', status: 'connected' }] },
  {
    type: 'assistant',
    parent_tool_use_id: null,
    message: { id: 'msg-1', content: [{ type: 'tool_use', id: 'A1', name: 'Agent', input: { subagent_type: 'searcher', prompt: 'cari' } }] },
  },
  {
    type: 'assistant',
    parent_tool_use_id: 'A1',
    subagent_type: 'searcher',
    message: { id: 'msg-2', content: [{ type: 'tool_use', id: 'S1', name: 'mcp__riset__search_sources', input: { query: 'decaf' } }] },
  },
  { type: 'user', parent_tool_use_id: 'A1', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'S1', content: '[]' }] } },
  { type: 'result', subtype: 'success', result: LAPORAN, is_error: false, num_turns: 3, total_cost_usd: 0.02, usage: {} },
] as unknown as SDKMessage[];

async function jalankan(o: { timeout?: boolean; config?: () => Partial<Options>; pesan?: SDKMessage[] } = {}) {
  const panggilan: Panggilan[] = [];
  const run = await runRiset({
    model: 'model-env',
    config: o.config ?? (() => ({ systemPrompt: 'Kamu peneliti.' })),
    timeout: o.timeout ?? false,
    root,
    query: queryPalsu(o.pesan ?? PESAN, panggilan),
    print: () => {},
  });
  return { run, panggilan };
}
const baca = (rel: string, label = 'riset') => readFileSync(join(root, 'hasil', 'p4', label, rel), 'utf8');

describe('ambilBlokJson', () => {
  it('mengambil blok json pertama yang berisi dekomposisi dan temuan', () => {
    const r = ambilBlokJson(`${LAPORAN}\n\`\`\`json\n{"dekomposisi": ["lain"]}\n\`\`\`\n`);
    expect(r.dekomposisi).toEqual(['permintaan', 'harga', 'ulasan', 'kompetitor']);
    expect(r.temuan).toHaveLength(1);
    expect(r.peringatan).toEqual([]);
  });
  it('satu blok boleh berisi keduanya; blok rusak jadi peringatan', () => {
    const r = ambilBlokJson('```json\n{rusak\n```\n```json\n{"dekomposisi": [1], "temuan": []}\n```');
    expect(r.dekomposisi).toEqual([1]);
    expect(r.temuan).toEqual([]);
    expect(r.peringatan.join(' ')).toMatch(/bukan JSON/);
  });
  it('tanpa blok: peringatan menyebut kontrak di p4/agents.ts', () => {
    const r = ambilBlokJson('Laporan tanpa JSON.');
    expect(r.dekomposisi).toBeUndefined();
    expect(r.peringatan.join(' ')).toContain('p4/agents.ts');
  });
});

describe('runRiset', () => {
  it('mengisolasi agent, memasang server riset, dan meneruskan opsi coordinator', async () => {
    const agents = { searcher: { description: 'd', prompt: 'p', tools: ['mcp__riset__search_sources'] } };
    const { run, panggilan } = await jalankan({
      config: () => ({ systemPrompt: 'Koordinator.', allowedTools: ['Agent'], agents, settingSources: ['user'], tools: ['Bash'] }),
    });
    expect(run.label).toBe('riset');
    expect(panggilan).toHaveLength(1);
    const { prompt, options } = panggilan[0]!;
    expect(prompt).toBe(PERTANYAAN);
    expect(options.systemPrompt).toBe('Koordinator.');
    expect(options.allowedTools).toEqual(['Agent']);
    expect(options.agents).toEqual(agents);
    expect(options.model).toBe('model-env');
    // Pipa menang atas konfigurasi peserta untuk isolasi.
    expect(options.settingSources).toEqual([]);
    expect(options.tools).toEqual(['Agent']);
    expect(options.strictMcpConfig).toBe(true);
    expect(options.permissionMode).toBe('dontAsk');
    expect(Object.keys(options.mcpServers ?? {})).toEqual(['riset']);
    expect((options.mcpServers!.riset as McpSdkServerConfigWithInstance).type).toBe('sdk');
  });

  it('model dari agents.ts menang atas MODEL; allowedTools bawaan = tool riset', async () => {
    const { panggilan } = await jalankan({ config: () => ({ model: 'claude-sonnet-5-5' }) });
    expect(panggilan[0]!.options.model).toBe('claude-sonnet-5-5');
    expect(panggilan[0]!.options.allowedTools).toEqual(['mcp__riset__search_sources', 'mcp__riset__read_source']);
  });

  it('mencatat pesan SDK beserta parent_tool_use_id, message_id, dan durasi_ms', async () => {
    const { run } = await jalankan();
    const ev = readRuns('p4', 'riset').find((r) => r.runId === run.runId)!.events;
    expect(ev[0]!.event).toBe('prompt_awal');
    const sdk = ev.filter((e) => e.event === 'sdk_message');
    expect(sdk.map((e) => e.type)).toEqual(['system', 'assistant', 'assistant', 'user', 'result']);
    expect(sdk[1]).toMatchObject({ parent_tool_use_id: null, message_id: 'msg-1' });
    expect(sdk[2]).toMatchObject({ parent_tool_use_id: 'A1', subagent_type: 'searcher' });
    expect(sdk[3]!.content).toEqual([{ type: 'tool_result', tool_use_id: 'S1', content: '[]' }]);
    const selesai = ev.find((e) => e.event === 'riset_selesai')!;
    expect(typeof selesai.durasi_ms).toBe('number');
  });

  it('menulis laporan.md, dekomposisi.json, dan temuan.json', async () => {
    await jalankan();
    expect(baca('laporan.md')).toBe(LAPORAN);
    expect(JSON.parse(baca('dekomposisi.json'))).toHaveLength(4);
    expect(JSON.parse(baca('temuan.json'))[0].source).toBe('survei-konsumen-2024');
  });

  it('hasil lama label yang sama dihapus; folder label lain tidak disentuh', async () => {
    for (const label of ['riset', 'riset-timeout']) {
      mkdirSync(join(root, 'hasil', 'p4', label), { recursive: true });
      writeFileSync(join(root, 'hasil', 'p4', label, 'temuan.json'), '[]');
    }
    const tanpaJson = PESAN.map((m) => (m.type === 'result' ? { ...m, result: 'Laporan tanpa JSON.' } : m)) as SDKMessage[];
    await jalankan({ pesan: tanpaJson });
    expect(baca('laporan.md')).toBe('Laporan tanpa JSON.');
    expect(existsSync(join(root, 'hasil', 'p4', 'riset', 'temuan.json'))).toBe(false);
    expect(existsSync(join(root, 'hasil', 'p4', 'riset', 'dekomposisi.json'))).toBe(false);
    expect(baca('temuan.json', 'riset-timeout')).toBe('[]');
  });

  it('--timeout menulis ke hasil/p4/riset-timeout/', async () => {
    await jalankan({ timeout: true });
    expect(baca('laporan.md', 'riset-timeout')).toBe(LAPORAN);
    expect(existsSync(join(root, 'hasil', 'p4', 'riset'))).toBe(false);
  });

  it('menghasilkan log dan berkas yang lulus pnpm cek p4-1 sampai p4-4', async () => {
    cpSync(new URL('./konflik.json', import.meta.url), join(root, 'p4', 'konflik.json'));
    const temuan = [
      { claim: '18% tertarik (data 2023)', evidence_excerpt: '18% responden', source: 'survei-konsumen-2024', date: '2024-03-12' },
      { claim: '31% tertarik (data 2026)', evidence_excerpt: '31% responden', source: 'riset-pasar-decaf-2026', date: '2026-08-20' },
    ];
    const laporan = (konflik: string) => [
      '# Decaf',
      'Minat naik: survei-konsumen-2024 dan riset-pasar-decaf-2026.',
      '## Temuan yang diperdebatkan',
      konflik,
      '## Celah cakupan',
      'Searcher kompetitor timeout.',
      '```json',
      JSON.stringify({ dekomposisi: ['pasar', 'harga', 'ulasan', 'kompetitor', 'kesehatan'] }),
      '```',
      '```json',
      JSON.stringify({ temuan }),
      '```',
    ].join('\n');
    const agent = (id: string, tipe: string, prompt: string) => ({ type: 'tool_use', id, name: 'Agent', input: { subagent_type: tipe, prompt } });
    const asisten = (parent: string | null, id: string, b: unknown) => ({ type: 'assistant', parent_tool_use_id: parent, message: { id, content: [b] } });
    const hasilTool = (parent: string | null, id: string, text: string) => ({
      type: 'user',
      parent_tool_use_id: parent,
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: [{ type: 'text', text }] }] },
    });
    const pesan = (teks: string) => [
      asisten(null, 'm1', agent('A1', 'searcher', 'Sub-bidang: permintaan pasar.')),
      asisten(null, 'm1', agent('A2', 'searcher', 'Sub-bidang: kompetitor.')),
      asisten('A1', 's1', { type: 'tool_use', id: 'S1', name: 'mcp__riset__read_source', input: { id: 'survei-konsumen-2024' } }),
      hasilTool('A1', 'S1', 'id: survei-konsumen-2024'),
      asisten('A2', 's2', { type: 'tool_use', id: 'S2', name: 'mcp__riset__search_sources', input: { query: 'kompetitor' } }),
      hasilTool('A2', 'S2', 'Timeout'),
      hasilTool(null, 'A1', JSON.stringify({ temuan: [temuan[0]] })),
      hasilTool(null, 'A2', JSON.stringify({ error: { failure_type: 'timeout', attempted_query: 'kompetitor', partial_results: [] } })),
      asisten(null, 'm2', agent('A3', 'analyst', `Temuan searcher: ${JSON.stringify(temuan[0])}`)),
      asisten('A3', 'n1', { type: 'tool_use', id: 'N1', name: 'mcp__riset__read_source', input: { id: 'survei-konsumen-2024' } }),
      hasilTool(null, 'A3', 'Analisis.'),
      { type: 'result', subtype: 'success', result: teks, is_error: false, num_turns: 4, total_cost_usd: 0, usage: {} },
    ] as unknown as SDKMessage[];
    // Run riset dulu, lalu timeout: urutan tidak berpengaruh karena hasilnya di folder per label.
    // Laporan run timeout wajar melewatkan satu sumber; konflik dinilai dari laporan run riset.
    await jalankan({ pesan: pesan(laporan('18% (survei-konsumen-2024, data 2023) vs 31% (riset-pasar-decaf-2026, data 2026).')) });
    await jalankan({ timeout: true, pesan: pesan(laporan('Hanya 18% (survei-konsumen-2024); sumber lain tidak terbaca.')) });
    for (const k of ['p4-1', 'p4-2', 'p4-3', 'p4-4']) {
      const gagal = (await cekP4[k]!(root)).filter((h) => h.status === 'gagal');
      expect(gagal, k).toEqual([]);
    }
  });

  it('--timeout: label riset-timeout dan search_sources pertama timeout', async () => {
    const { run, panggilan } = await jalankan({ timeout: true });
    expect(run.label).toBe('riset-timeout');
    const server = panggilan[0]!.options.mcpServers!.riset as McpSdkServerConfigWithInstance;
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.instance.connect(a);
    const client = new Client({ name: 'tes', version: '1.0.0' });
    await client.connect(b);
    try {
      const r = (await client.callTool({ name: 'search_sources', arguments: { query: 'decaf' } })) as { isError?: boolean };
      expect(r.isError).toBe(true);
    } finally {
      await client.close();
    }
    const call = readRuns('p4', 'riset-timeout')[0]!.events.find((e) => e.event === 'tool_call')!;
    expect(call).toMatchObject({ name: 'search_sources', isError: true });
  });
});
