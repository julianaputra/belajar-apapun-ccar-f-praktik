import type { Options } from '@anthropic-ai/claude-agent-sdk';

// P4: konfigurasi coordinator dan subagent (Claude Agent SDK).
// Dipanggil oleh `pnpm p4` sekali per run. Jangan ubah nama dan tanda tangan fungsi.
//
// Konfigurasi di bawah sudah jalan, tapi masih satu agent saja: tanpa subagent.
// Tool riset: mcp__riset__search_sources dan mcp__riset__read_source.
// Tool untuk memanggil subagent bernama `Agent` (di exam guide disebut "Task").
// Bentuk subagent: lihat tipe AgentDefinition di node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts.
// `model` boleh diisi. Kalau kosong, pipa memakai MODEL dari .env.
//
// Kontrak keluaran (dibaca pipa dan `pnpm cek`). Teks hasil akhir agent ditulis ke
// hasil/p4/<label>/laporan.md. Label: `riset` (pnpm p4) atau `riset-timeout` (pnpm p4 --timeout).
// Di dalam teks itu harus ada blok ```json:
//   ```json
//   {"dekomposisi": ["sub-bidang 1", "sub-bidang 2", ...]}
//   ```
//   ```json
//   {"temuan": [{"claim": "...", "evidence_excerpt": "...", "source": "<id sumber>", "date": "YYYY-MM-DD"}]}
//   ```
// Pipa menyalin isinya ke hasil/p4/<label>/dekomposisi.json dan temuan.json.
//
// TODO langkah 1: definisikan subagent `searcher` dan `analyst` di `agents`. Masing-masing punya
//   description, prompt, dan tools yang dibatasi sesuai perannya. Izinkan `Agent` di allowedTools.
// TODO langkah 2: coordinator memanggil beberapa subagent dalam satu respons, dan menulis temuan
//   searcher lengkap di prompt analyst. Perhatikan opsi `background` di AgentDefinition (dan
//   `run_in_background` di input tool Agent): apakah coordinator menunggu hasil subagent?
// TODO langkah 3: setiap temuan memakai format {claim, evidence_excerpt, source, date}.
// TODO langkah 4: tangani error searcher (`pnpm p4 --timeout`) dan angka yang bertentangan antar sumber.

export function coordinatorOptions(): Partial<Options> {
  return {
    systemPrompt:
      'Kamu peneliti pasar untuk toko kopi daring Kopi Nusantara. Jawab pertanyaan memakai sumber dari tool riset, lalu tulis laporan singkat.',
    allowedTools: ['mcp__riset__search_sources', 'mcp__riset__read_source'],
  };
}
