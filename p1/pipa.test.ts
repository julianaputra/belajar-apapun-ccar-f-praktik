import type Anthropic from '@anthropic-ai/sdk';
import type { Options, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UserError } from '../src/lib/env.js';
import { readRuns, startRun } from '../src/lib/log.js';
import type { Toko } from '../src/lib/mcp-bridge.js';
import { runAgent, TOOL_TOKO, type Skenario } from './agent.js';
import { jalankanLoop } from './loop-pipa.js';
import { pilihTool, type Pertanyaan } from './pilih-tool.js';

// Tes pipa P1. Tidak ada yang memanggil API sungguhan: client Messages API dan
// query() Agent SDK diganti versi palsu.

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'p1-pipa-'));
  process.env.LOG_DIR = dir;
});
afterEach(() => {
  delete process.env.LOG_DIR;
  rmSync(dir, { recursive: true, force: true });
});

const bacaJson = <T>(nama: string): T => JSON.parse(readFileSync(new URL(nama, import.meta.url), 'utf8')) as T;
const TOOL_NAMES = ['get_customer', 'lookup_order', 'process_refund', 'escalate_to_human'];

function tokoPalsu(): Toko {
  return {
    tools: TOOL_NAMES.map((name) => ({ name, description: 'x', input_schema: { type: 'object' as const } })),
    call: async () => ({ content: '{}', isError: false }),
    close: async () => {},
  };
}

function message(content: Anthropic.ContentBlock[], stop_reason: Anthropic.StopReason): Anthropic.Message {
  return {
    id: 'msg',
    type: 'message',
    role: 'assistant',
    model: 'm',
    content,
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 } as Anthropic.Usage,
  } as Anthropic.Message;
}

describe('berkas skenario', () => {
  it('pertanyaan-ambigu.json: 6 pertanyaan, expected berupa nama tool toko', () => {
    const items = bacaJson<Pertanyaan[]>('./pertanyaan-ambigu.json');
    expect(items).toHaveLength(6);
    for (const it of items) {
      expect(it.q.length).toBeGreaterThan(10);
      expect(TOOL_NAMES).toContain(it.expected);
    }
    const jenis = new Set(items.map((i) => i.expected));
    expect(jenis.has('get_customer') && jenis.has('lookup_order')).toBe(true);
  });
  it('percakapan.json: 3 pesan', () => {
    const items = bacaJson<string[]>('./percakapan.json');
    expect(items).toHaveLength(3);
    for (const p of items) expect(typeof p).toBe('string');
  });
  it('skenario.json: empat skenario; hanya gangguan yang menyetel TOKO_GANGGUAN', () => {
    const sk = bacaJson<Record<string, Skenario>>('./skenario.json');
    expect(Object.keys(sk).sort()).toEqual(['gangguan', 'lewat-masa', 'multi-masalah', 'refund-besar']);
    expect(sk.gangguan!.env?.TOKO_GANGGUAN).toBe('1');
    for (const [nama, s] of Object.entries(sk)) {
      expect(s.prompt.length).toBeGreaterThan(20);
      if (nama !== 'gangguan') expect(s.env?.TOKO_GANGGUAN).toBeUndefined();
      // Prompt ditulis seperti pelanggan, tanpa petunjuk jawaban.
      expect(s.prompt).not.toMatch(/escalate|eskalasi|hook|errorCategory|case facts/i);
    }
  });
});

describe('pilihTool', () => {
  it('satu giliran per pertanyaan, mencatat pilihan dan menghitung yang benar', async () => {
    const jawaban = ['get_customer', 'get_customer', null];
    const params: Anthropic.MessageCreateParamsNonStreaming[] = [];
    let i = 0;
    const client = {
      messages: {
        create: async (p: Anthropic.MessageCreateParamsNonStreaming) => {
          params.push(p);
          const nama = jawaban[i++];
          return nama
            ? message([{ type: 'tool_use', id: `t${i}`, name: nama, input: {} } as Anthropic.ToolUseBlock], 'tool_use')
            : message([{ type: 'text', text: 'Boleh minta nomor pesanannya?', citations: null } as Anthropic.TextBlock], 'end_turn');
        },
      },
    } as unknown as Anthropic;
    const items: Pertanyaan[] = [
      { q: 'satu', expected: 'get_customer' },
      { q: 'dua', expected: 'lookup_order' },
      { q: 'tiga', expected: 'lookup_order' },
    ];
    const run = startRun('p1', 'pilih-tool');
    const benar = await pilihTool(run, tokoPalsu(), items, { model: 'model-x', client, print: () => {} });
    expect(benar).toBe(1);
    expect(params).toHaveLength(3);
    expect(params[0]!.model).toBe('model-x');
    expect(params[0]!.tools?.map((t) => ('name' in t ? t.name : ''))).toEqual(TOOL_NAMES);
    expect(params[0]!.messages).toEqual([{ role: 'user', content: 'satu' }]);
    const ev = readRuns('p1', 'pilih-tool')[0]!.events.filter((e) => e.event === 'pilihan');
    expect(ev.map((e) => [e.q, e.expected, e.chosen])).toEqual([
      ['satu', 'get_customer', 'get_customer'],
      ['dua', 'lookup_order', 'get_customer'],
      ['tiga', 'lookup_order', null],
    ]);
  });
});

describe('jalankanLoop', () => {
  it('mencatat percakapan_mulai per pesan dan batas_iterasi bila hitLimit', async () => {
    const run = startRun('p1', 'loop');
    const dipanggil: string[] = [];
    await jalankanLoop(run, tokoPalsu(), ['a', 'b', 'c'], async (_r, _t, pesan) => {
      dipanggil.push(pesan);
      return pesan === 'b' ? { hitLimit: true } : undefined;
    });
    expect(dipanggil).toEqual(['a', 'b', 'c']);
    const ev = readRuns('p1', 'loop')[0]!.events;
    expect(ev.filter((e) => e.event === 'percakapan_mulai').map((e) => e.pesan)).toEqual(['a', 'b', 'c']);
    expect(ev.filter((e) => e.event === 'batas_iterasi').map((e) => e.index)).toEqual([1]);
  });
  it('UserError dari runConversation diteruskan apa adanya', async () => {
    const run = startRun('p1', 'loop');
    await expect(
      jalankanLoop(run, tokoPalsu(), ['a'], async () => {
        throw new UserError('Belum dikerjakan');
      }),
    ).rejects.toThrow('Belum dikerjakan');
  });
});

describe('runAgent', () => {
  type Panggilan = { prompt: string; options: Options };
  function queryPalsu(pesan: SDKMessage[], panggilan: Panggilan[]) {
    return ((params: Panggilan) => {
      panggilan.push(params);
      return (async function* () {
        for (const m of pesan) yield m;
      })();
    }) as never;
  }
  const SK: Record<string, Skenario> = {
    'refund-besar': { prompt: 'Mesin espresso saya rusak, tolong refund.', fakta: { email_login: 'budi@example.test' } },
    gangguan: { prompt: 'Pesanan saya di mana?', env: { TOKO_GANGGUAN: '1' } },
  };
  const PESAN = [
    { type: 'system', subtype: 'init', tools: ['mcp__toko__get_customer'], mcp_servers: [{ name: 'toko', status: 'connected' }] },
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'mcp__toko__get_customer', input: {} }] } },
    { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] } },
    { type: 'result', subtype: 'success', result: 'Selesai.', is_error: false, num_turns: 2, total_cost_usd: 0.01, usage: {} },
  ] as unknown as SDKMessage[];

  it('skenario tak dikenal: UserError dengan daftar pilihan', async () => {
    await expect(runAgent('asal', { skenario: SK, model: 'm', config: () => ({}), query: queryPalsu([], []) })).rejects.toThrow(
      /refund-besar.*gangguan|gangguan.*refund-besar/s,
    );
  });

  it('meneruskan TOKO_RUN_ID ke server toko, mengisolasi agent, dan mencatat pesan SDK', async () => {
    const panggilan: Panggilan[] = [];
    let faktaDiterima: unknown;
    const run = await runAgent('refund-besar', {
      skenario: SK,
      model: 'model-x',
      config: (fakta) => {
        faktaDiterima = fakta;
        return { systemPrompt: 'Kamu agent CS.', allowedTools: ['mcp__toko__get_customer'], settingSources: ['user'], tools: ['Bash'] };
      },
      query: queryPalsu(PESAN, panggilan),
      print: () => {},
    });
    expect(run.label).toBe('agent:refund-besar');
    expect(faktaDiterima).toEqual({ email_login: 'budi@example.test' });
    expect(panggilan).toHaveLength(1);
    const { prompt, options } = panggilan[0]!;
    expect(prompt).toBe(SK['refund-besar']!.prompt);
    const toko = options.mcpServers?.toko as { command: string; args: string[]; env: Record<string, string> };
    expect(toko.command).toBe(process.execPath);
    expect(toko.args).toEqual(['--import', 'tsx', 'src/mcp/server.ts']);
    expect(toko.env.TOKO_RUN_ID).toBe(run.runId);
    expect(toko.env.TOKO_GANGGUAN).toBe('0');
    expect(options.model).toBe('model-x');
    expect(options.systemPrompt).toBe('Kamu agent CS.');
    expect(options.allowedTools).toEqual(['mcp__toko__get_customer']);
    // Pipa menang atas konfigurasi peserta untuk isolasi.
    expect(options.settingSources).toEqual([]);
    expect(options.tools).toEqual([]);
    expect(options.strictMcpConfig).toBe(true);
    expect(options.permissionMode).toBe('dontAsk');

    const ev = readRuns('p1', 'agent:refund-besar')[0]!.events;
    const awal = ev.find((e) => e.event === 'prompt_awal')!;
    expect(awal.prompt).toBe(SK['refund-besar']!.prompt);
    expect(awal.systemPrompt).toBe('Kamu agent CS.');
    const sdk = ev.filter((e) => e.event === 'sdk_message');
    expect(sdk.map((e) => e.type)).toEqual(['system', 'assistant', 'user', 'result']);
    expect(sdk[0]!.subtype).toBe('init');
    expect(sdk[2]!.content).toEqual([{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }]);
    expect((sdk[3]!.content as { result: string }).result).toBe('Selesai.');
  });

  it('allowedTools bawaan = empat tool toko; skenario gangguan menyetel TOKO_GANGGUAN=1', async () => {
    const panggilan: Panggilan[] = [];
    await runAgent('gangguan', { skenario: SK, model: 'm', config: () => ({}), query: queryPalsu(PESAN, panggilan), print: () => {} });
    const { options } = panggilan[0]!;
    expect(options.allowedTools).toEqual(TOOL_TOKO);
    expect(TOOL_TOKO).toEqual(TOOL_NAMES.map((n) => `mcp__toko__${n}`));
    const toko = options.mcpServers?.toko as { env: Record<string, string> };
    expect(toko.env.TOKO_GANGGUAN).toBe('1');
  });
});
