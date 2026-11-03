import { query as sdkQuery, type Options, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { UserError } from '../src/lib/env.js';
import { startRun, type RunLogger } from '../src/lib/log.js';
import { cetakPesan, isiPesan } from '../src/lib/sdk-pesan.js';

// Pipa P1 langkah 3–4 (Claude Agent SDK). Jangan diubah: yang dikerjakan adalah p1/agent-config.ts.
//
// Pipa ini:
//  - menjalankan MCP server toko sebagai proses anak, dengan TOKO_RUN_ID = runId agent ini,
//    supaya `pnpm cek` bisa mencocokkan logs/p1.jsonl dengan logs/mcp.jsonl;
//  - mengisolasi agent dari konfigurasi Claude Code milikmu (tanpa settings, tanpa tool bawaan,
//    hanya MCP server toko);
//  - mencatat setiap pesan SDK sebagai event `sdk_message`.

/** Fakta kasus awal dari p1/skenario.json. agentConfig boleh menambah isinya selama run. */
export type CaseFacts = Record<string, unknown>;

export type Skenario = { prompt: string; fakta?: CaseFacts; env?: Record<string, string> };

export const TOOL_TOKO = ['get_customer', 'lookup_order', 'process_refund', 'escalate_to_human'].map((n) => `mcp__toko__${n}`);

type Deps = {
  skenario: Record<string, Skenario>;
  model: string;
  config: (caseFacts: CaseFacts) => Partial<Options>;
  /** Hanya untuk tes: pengganti query() supaya Agent SDK tidak dipanggil. */
  query?: typeof sdkQuery;
  print?: (s: string) => void;
};

function envString(extra: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
  return { ...env, ...extra };
}

function cetak(m: SDKMessage, print: (s: string) => void): void {
  cetakPesan(m, print, { utama: 'agent', batas: 300 });
  if (m.type === 'result') {
    const r = isiPesan(m) as { result?: string; total_cost_usd?: number; num_turns?: number };
    print(`\n=== Selesai (${r.num_turns ?? '?'} giliran, ~$${(r.total_cost_usd ?? 0).toFixed(4)})`);
    if (r.result) print(r.result);
  }
}

export async function runAgent(nama: string, deps: Deps): Promise<RunLogger> {
  const sk = Object.hasOwn(deps.skenario, nama) ? deps.skenario[nama] : undefined;
  if (!sk) {
    throw new UserError(`Skenario "${nama}" tidak ada.\nPilihan: ${Object.keys(deps.skenario).join(', ')}`);
  }
  const print = deps.print ?? console.log;
  const query = deps.query ?? sdkQuery;
  const run = startRun('p1', `agent:${nama}`);

  const caseFacts: CaseFacts = structuredClone(sk.fakta ?? {});
  const cfg = deps.config(caseFacts);
  const options: Options = {
    ...cfg,
    allowedTools: cfg.allowedTools ?? TOOL_TOKO,
    model: deps.model,
    mcpServers: {
      toko: {
        type: 'stdio',
        command: process.execPath,
        args: ['--import', 'tsx', 'src/mcp/server.ts'],
        env: envString({ TOKO_RUN_ID: run.runId, TOKO_GANGGUAN: '0', ...sk.env }),
      },
    },
    cwd: process.cwd(),
    settingSources: [],
    strictMcpConfig: true,
    tools: [],
    permissionMode: 'dontAsk',
    maxTurns: 30,
  };

  run.log('prompt_awal', {
    prompt: sk.prompt,
    systemPrompt: options.systemPrompt ?? null,
    allowedTools: options.allowedTools,
    hooks: Object.keys(options.hooks ?? {}),
  });
  print(`[pipa] skenario ${nama}, run ${run.runId}\npelanggan: ${sk.prompt}\n`);

  for await (const m of query({ prompt: sk.prompt, options })) {
    const r = m as unknown as Record<string, unknown>;
    run.log('sdk_message', {
      type: m.type,
      ...(typeof r.subtype === 'string' ? { subtype: r.subtype } : {}),
      content: isiPesan(m),
    });
    cetak(m, print);
  }
  run.log('agent_selesai', {});
  return run;
}
