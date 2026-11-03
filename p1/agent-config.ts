import type { Options } from '@anthropic-ai/claude-agent-sdk';
import type { CaseFacts } from './agent.js';

// P1 langkah 3–4: konfigurasi agent (Claude Agent SDK).
// Dipanggil oleh `pnpm p1 agent <skenario>` sekali per run. Jangan ubah nama dan tanda tangan fungsi.
//
// Konfigurasi di bawah sudah jalan, tapi masih polos: tanpa hook dan tanpa case facts.
// Nama tool di Agent SDK: mcp__toko__<nama>, misalnya mcp__toko__process_refund.
// Bentuk hook dan output-nya: lihat tipe HookCallbackMatcher, PreToolUseHookInput, PostToolUseHookInput,
// dan SyncHookJSONOutput di node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts.
//
// TODO langkah 3:
//  - hooks.PreToolUse: aturan refund (batas nominal dan pelanggan terverifikasi) ditegakkan di kode.
//    Saat menolak, beri alasan yang mengarahkan agent ke langkah berikutnya.
//  - hooks.PostToolUse: hasil tool memakai tiga format tanggal. Seragamkan sebelum dibaca model.
// TODO langkah 4:
//  - Simpan fakta kasus (ID, nominal, status) di blok berlabel "case facts" yang selalu ikut di prompt.
//    `caseFacts` berisi fakta awal dari p1/skenario.json.

export function agentConfig(_caseFacts: CaseFacts): Partial<Options> {
  return {
    systemPrompt: 'Kamu agent customer support toko kopi Kopi Nusantara. Bantu pelanggan memakai tool toko.',
    allowedTools: [
      'mcp__toko__get_customer',
      'mcp__toko__lookup_order',
      'mcp__toko__process_refund',
      'mcp__toko__escalate_to_human',
    ],
  };
}
