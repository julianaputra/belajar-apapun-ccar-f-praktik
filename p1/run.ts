import { readFileSync } from 'node:fs';
import { loadEnv, runMain, UserError } from '../src/lib/env.js';
import { startRun } from '../src/lib/log.js';
import { connectToko } from '../src/lib/mcp-bridge.js';
import { runAgent, type Skenario } from './agent.js';
import { agentConfig } from './agent-config.js';
import { runConversation } from './loop.js';
import { jalankanLoop } from './loop-pipa.js';
import { pilihTool, type Pertanyaan } from './pilih-tool.js';

// Pipa P1. Jangan diubah. Yang dikerjakan peserta: src/mcp/tools.ts, p1/loop.ts, p1/agent-config.ts.

const PAKAI = `Pemakaian:
  pnpm p1 pilih-tool            langkah 1: 6 pertanyaan ambigu, catat tool yang dipilih
  pnpm p1 loop                  langkah 2: 3 percakapan lewat runConversation (p1/loop.ts)
  pnpm p1 agent <skenario>      langkah 3–4: agent Claude Agent SDK
                                skenario: refund-besar, gangguan, lewat-masa, multi-masalah`;

const bacaJson = <T>(nama: string): T => JSON.parse(readFileSync(new URL(nama, import.meta.url), 'utf8')) as T;

async function langkahPilihTool(): Promise<void> {
  const { model } = loadEnv();
  const run = startRun('p1', 'pilih-tool');
  const toko = await connectToko(run);
  try {
    await pilihTool(run, toko, bacaJson<Pertanyaan[]>('./pertanyaan-ambigu.json'), { model });
  } finally {
    await toko.close();
  }
}

async function langkahLoop(): Promise<void> {
  loadEnv();
  const run = startRun('p1', 'loop');
  const toko = await connectToko(run);
  try {
    await jalankanLoop(run, toko, bacaJson<string[]>('./percakapan.json'), runConversation);
  } finally {
    await toko.close();
  }
}

async function langkahAgent(nama: string | undefined): Promise<void> {
  const skenario = bacaJson<Record<string, Skenario>>('./skenario.json');
  if (!nama || !Object.hasOwn(skenario, nama)) {
    throw new UserError(`${nama ? `Skenario "${nama}" tidak ada.` : 'Sebutkan skenario.'}\n${PAKAI}`);
  }
  const { model } = loadEnv();
  await runAgent(nama, { skenario, model, config: agentConfig });
}

runMain(async () => {
  const [perintah, ...sisa] = process.argv.slice(2);
  if (perintah === 'pilih-tool') return langkahPilihTool();
  if (perintah === 'loop') return langkahLoop();
  if (perintah === 'agent') return langkahAgent(sisa[0]);
  throw new UserError(PAKAI);
});
