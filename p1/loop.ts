import { UserError } from '../src/lib/env.js';
import type { RunLogger } from '../src/lib/log.js';
import type { Toko } from '../src/lib/mcp-bridge.js';

// P1 langkah 2: agentic loop pertama, memakai Messages API langsung.
// Dipanggil oleh `pnpm p1 loop` untuk setiap pesan di p1/percakapan.json.
// Jangan ubah nama dan tanda tangan fungsi.
//
// Yang tersedia:
//  - toko.tools                 daftar tool dalam format Messages API
//  - toko.call(name, input)     jalankan tool di MCP server → { content, isError }
//  - createMessage(run, params) dari src/lib/claude.ts (request/response otomatis tercatat di log)
//  - loadEnv().model            dari src/lib/env.ts

/** hitLimit: true kalau loop berhenti karena batas iterasi, bukan karena model selesai. */
export type LoopResult = { hitLimit: boolean };

/**
 * Jalankan satu percakapan sampai model selesai.
 * TODO:
 *  - Ulangi selama model meminta tool. Tentukan kapan berhenti dari respons model.
 *  - Setiap hasil tool harus kembali ke model di putaran berikutnya.
 *  - Cetak stop_reason di setiap putaran.
 *  - Pasang batas iterasi hanya sebagai pengaman, lalu kembalikan { hitLimit }.
 */
export async function runConversation(_run: RunLogger, _toko: Toko, _userMessage: string): Promise<LoopResult> {
  throw new UserError('Belum dikerjakan: P1 langkah 2 (runConversation di p1/loop.ts)');
}
