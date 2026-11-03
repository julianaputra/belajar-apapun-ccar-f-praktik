import { query as sdkQuery, type Options } from '@anthropic-ai/claude-agent-sdk';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startRun, type RunLogger } from '../src/lib/log.js';
import { cetakPesan, isiPesan } from '../src/lib/sdk-pesan.js';
import { createRisetServer } from '../src/mcp/riset.js';

// Pipa P4 (Claude Agent SDK). Jangan diubah: yang dikerjakan adalah p4/agents.ts.
//
// Pipa ini:
//  - memasang MCP server `riset` di dalam proses (tool mcp__riset__search_sources dan mcp__riset__read_source);
//  - mengisolasi agent dari konfigurasi Claude Code milikmu (tanpa settings; tool bawaan hanya `Agent`);
//  - mencatat setiap pesan SDK sebagai event `sdk_message`, termasuk parent_tool_use_id
//    (pesan dari dalam subagent) dan message_id (blok dari respons yang sama);
//  - menulis teks hasil akhir ke hasil/p4/<label>/laporan.md, lalu menyalin blok ```json berisi
//    "dekomposisi" dan "temuan" ke hasil/p4/<label>/dekomposisi.json dan temuan.json.
//    Label `riset` (pnpm p4) dan `riset-timeout` (pnpm p4 --timeout) punya folder sendiri,
//    jadi urutan menjalankan keduanya tidak berpengaruh.

export const PERTANYAAN = 'Perlu tidak Kopi Nusantara menjual biji kopi decaf?';
export const TOOL_RISET = ['mcp__riset__search_sources', 'mcp__riset__read_source'];
const BERKAS_HASIL = ['laporan.md', 'dekomposisi.json', 'temuan.json'];

type Deps = {
  model: string;
  config: () => Partial<Options>;
  timeout: boolean;
  /** Root starter. Bawaan: process.cwd(). */
  root?: string;
  /** Hanya untuk tes: pengganti query() supaya Agent SDK tidak dipanggil. */
  query?: typeof sdkQuery;
  print?: (s: string) => void;
};

/** Blok ```json pertama yang berisi "dekomposisi", dan yang pertama berisi "temuan". */
export function ambilBlokJson(teks: string): { dekomposisi?: unknown; temuan?: unknown; peringatan: string[] } {
  const out: { dekomposisi?: unknown; temuan?: unknown; peringatan: string[] } = { peringatan: [] };
  for (const [, isi] of teks.matchAll(/```json[^\n]*\n([\s\S]*?)```/g)) {
    let v: unknown;
    try {
      v = JSON.parse(isi!);
    } catch {
      out.peringatan.push(`Ada blok \`\`\`json yang bukan JSON valid: ${isi!.trim().slice(0, 60)}…`);
      continue;
    }
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
    const o = v as Record<string, unknown>;
    if (out.dekomposisi === undefined && 'dekomposisi' in o) out.dekomposisi = o.dekomposisi;
    if (out.temuan === undefined && 'temuan' in o) out.temuan = o.temuan;
  }
  for (const k of ['dekomposisi', 'temuan'] as const) {
    if (out[k] === undefined) {
      out.peringatan.push(`Laporan tidak memuat blok \`\`\`json berisi {"${k}": [...]}. Lihat kontrak keluaran di p4/agents.ts.`);
    }
  }
  return out;
}

export async function runRiset(deps: Deps): Promise<RunLogger> {
  const root = deps.root ?? process.cwd();
  const print = deps.print ?? console.log;
  const query = deps.query ?? sdkQuery;
  const run = startRun('p4', deps.timeout ? 'riset-timeout' : 'riset');
  const dirHasil = join(root, 'hasil', 'p4', run.label);
  mkdirSync(dirHasil, { recursive: true });
  for (const f of BERKAS_HASIL) rmSync(join(dirHasil, f), { force: true });

  const cfg = deps.config();
  const options: Options = {
    ...cfg,
    allowedTools: cfg.allowedTools ?? TOOL_RISET,
    model: cfg.model ?? deps.model,
    mcpServers: {
      riset: createRisetServer({ dir: join(root, 'p4', 'sumber'), timeout: deps.timeout, log: run.log }),
    },
    cwd: root,
    settingSources: [],
    strictMcpConfig: true,
    tools: ['Agent'],
    permissionMode: 'dontAsk',
    maxTurns: cfg.maxTurns ?? 40,
  };

  run.log('prompt_awal', {
    prompt: PERTANYAAN,
    model: options.model,
    systemPrompt: options.systemPrompt ?? null,
    allowedTools: options.allowedTools,
    agents: Object.fromEntries(Object.entries(options.agents ?? {}).map(([k, a]) => [k, { tools: a.tools ?? null, model: a.model ?? null }])),
  });
  print(`[pipa] ${run.label}, run ${run.runId}\npertanyaan: ${PERTANYAAN}\n`);

  const mulai = Date.now();
  let hasil: { result?: string; is_error?: boolean; num_turns?: number; total_cost_usd?: number; subtype?: string } = {};
  for await (const m of query({ prompt: PERTANYAAN, options })) {
    const r = m as unknown as Record<string, unknown>;
    run.log('sdk_message', {
      type: m.type,
      ...(typeof r.subtype === 'string' ? { subtype: r.subtype } : {}),
      ...('parent_tool_use_id' in r ? { parent_tool_use_id: r.parent_tool_use_id ?? null } : {}),
      ...(m.type === 'assistant' ? { message_id: (r.message as { id?: string } | undefined)?.id ?? null } : {}),
      ...(typeof r.subagent_type === 'string' ? { subagent_type: r.subagent_type } : {}),
      content: isiPesan(m),
    });
    cetakPesan(m, print, { utama: 'coordinator', batas: 200 });
    if (m.type === 'result') hasil = { ...(isiPesan(m) as typeof hasil), subtype: String(r.subtype) };
  }
  const durasi_ms = Date.now() - mulai;
  run.log('riset_selesai', { durasi_ms, is_error: hasil.is_error ?? null });
  print(`\n=== Selesai dalam ${(durasi_ms / 1000).toFixed(1)} detik (${hasil.num_turns ?? '?'} giliran, ~$${(hasil.total_cost_usd ?? 0).toFixed(4)})`);

  if (typeof hasil.result !== 'string' || !hasil.result.trim()) {
    print(`[pipa] Agent tidak mengembalikan teks hasil akhir (${hasil.subtype ?? 'tanpa pesan result'}). Laporan tidak ditulis.`);
    return run;
  }
  writeFileSync(join(dirHasil, 'laporan.md'), hasil.result);
  const blok = ambilBlokJson(hasil.result);
  for (const k of ['dekomposisi', 'temuan'] as const) {
    if (blok[k] !== undefined) writeFileSync(join(dirHasil, `${k}.json`), JSON.stringify(blok[k], null, 2) + '\n');
  }
  for (const p of blok.peringatan) print(`[pipa] ${p}`);
  print(`[pipa] Laporan ditulis ke hasil/p4/${run.label}/laporan.md`);
  return run;
}
