import { loadEnv, runMain, UserError } from '../src/lib/env.js';
import { coordinatorOptions } from './agents.js';
import { runRiset } from './pipa.js';

// Pipa P4. Jangan diubah. Yang dikerjakan peserta: p4/agents.ts.

const PAKAI = `Pemakaian:
  pnpm p4              jalankan riset multi-agent (label riset)
  pnpm p4 --timeout    sama, tapi search_sources pertama timeout (label riset-timeout)`;

runMain(async () => {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--timeout')) throw new UserError(PAKAI);
  const { model } = loadEnv();
  await runRiset({ model, config: coordinatorOptions, timeout: args[0] === '--timeout' });
});
