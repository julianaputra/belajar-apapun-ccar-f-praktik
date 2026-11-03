import type Anthropic from '@anthropic-ai/sdk';
import { createMessage } from '../src/lib/claude.js';
import type { RunLogger } from '../src/lib/log.js';
import type { Toko } from '../src/lib/mcp-bridge.js';

// Pipa P1 langkah 1. Jangan diubah: yang diperbaiki adalah deskripsi tool di src/mcp/tools.ts.

export type Pertanyaan = { q: string; expected: string };

const SYSTEM = 'Kamu agent customer support toko kopi Kopi Nusantara. Jawab pertanyaan pelanggan dengan memakai tool yang tersedia.';

/**
 * Kirim setiap pertanyaan sebagai percakapan baru (satu giliran) dan catat tool pertama yang dipilih model.
 * Tool tidak dijalankan. Mengembalikan jumlah pilihan yang benar.
 */
export async function pilihTool(
  run: RunLogger,
  toko: Pick<Toko, 'tools'>,
  items: Pertanyaan[],
  opts: { model: string; client?: Anthropic; print?: (s: string) => void },
): Promise<number> {
  const print = opts.print ?? console.log;
  let benar = 0;
  for (const { q, expected } of items) {
    const message = await createMessage(
      run,
      {
        model: opts.model,
        max_tokens: 1024,
        system: SYSTEM,
        tools: toko.tools,
        messages: [{ role: 'user', content: q }],
      },
      ...(opts.client ? [opts.client] : []),
    );
    const chosen = message.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')?.name ?? null;
    run.log('pilihan', { q, expected, chosen });
    const cocok = chosen === expected;
    if (cocok) benar++;
    print(`${cocok ? '✅' : '❌'} ${q}\n   dipilih: ${chosen ?? '(tidak memilih tool)'}, harusnya: ${expected}`);
  }
  print(`\n${benar} dari ${items.length} benar.`);
  return benar;
}
