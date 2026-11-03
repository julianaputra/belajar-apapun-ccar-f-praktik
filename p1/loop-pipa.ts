import type { RunLogger } from '../src/lib/log.js';
import type { Toko } from '../src/lib/mcp-bridge.js';
import type { LoopResult } from './loop.js';

// Pipa P1 langkah 2. Jangan diubah: yang dikerjakan adalah runConversation di p1/loop.ts.

export type RunConversation = (run: RunLogger, toko: Toko, userMessage: string) => Promise<LoopResult | void>;

/** Jalankan setiap pesan sebagai percakapan terpisah. Dicatat: percakapan_mulai, dan batas_iterasi kalau hitLimit. */
export async function jalankanLoop(
  run: RunLogger,
  toko: Toko,
  daftar: string[],
  runConversation: RunConversation,
  print: (s: string) => void = console.log,
): Promise<void> {
  for (const [index, pesan] of daftar.entries()) {
    print(`\n=== Percakapan ${index + 1}: ${pesan}`);
    run.log('percakapan_mulai', { index, pesan });
    const hasil = await runConversation(run, toko, pesan);
    if (hasil?.hitLimit) {
      run.log('batas_iterasi', { index });
      print('(berhenti karena batas iterasi)');
    }
  }
}
