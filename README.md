# Kopi Nusantara: praktik CCAR-F

Repo latihan untuk persiapan ujian CCAR-F. Ceritanya: toko kopi fiktif "Kopi Nusantara". Kamu mengerjakan empat proyek kecil (P1 sampai P4) di TypeScript.

Setiap peserta memakai API key Anthropic sendiri. Tidak ada key bersama.

## Prasyarat

- Node 22.12 atau lebih baru (`node -v`).
- pnpm (`pnpm -v`).
- Claude Code, sudah login (dipakai di P2).
- Akun Anthropic API dengan sedikit saldo (dipakai di P1, P3, P4).

## Mulai

1. Klik **Use this template** di halaman GitHub repo ini, lalu buat repo milikmu (boleh private).
2. Clone repo barumu, lalu masuk ke foldernya.
3. Pasang dependency:

   ```
   pnpm install
   ```

4. Buat file `.env`:

   ```
   cp .env.example .env
   ```

5. Isi `ANTHROPIC_API_KEY=` di `.env` dengan key milikmu.
6. Cek semuanya jalan: `pnpm test`.

### Cara mendapat API key

1. Buka console.anthropic.com dan login.
2. Buka **Settings** lalu **API Keys**.
3. Buat key baru, salin, dan tempel ke `.env`.

**Jangan commit `.env`.** File ini sudah ada di `.gitignore`. Jangan tempel key di berkas lain, di chat, atau di issue. Kalau key bocor, hapus di console dan buat yang baru.

### Model

Model default adalah `claude-haiku-5-5`. Kamu bisa menggantinya lewat `MODEL=` di `.env`.

Catatan penting soal `tool_choice`: pengaturan paksa `tool_choice {type: "tool"}` menghasilkan error 400 di Sonnet 5.5, Opus 5.5, dan Fable 5.1. Di Haiku 5.5 pengaturan ini jalan. Kalau terkena, kode akan menampilkan pesan yang jelas. Solusinya: pakai `MODEL=claude-haiku-5-5`, atau pakai `tool_choice` `auto`.

Untuk P4, coordinator disarankan memakai `claude-sonnet-5-5`. Subagent boleh memakai model yang lebih kecil.

## Peta folder

| Proyek | Yang kamu kerjakan | Kode dan data |
| --- | --- | --- |
| P1 Support agent | `src/mcp/tools.ts`, `p1/loop.ts`, `p1/agent-config.ts` | `p1/`, `src/mcp/` |
| P2 Konfigurasi Claude Code | Berkas baru di root repo: `CLAUDE.md`, `.claude/`, `.mcp.json`, `docs/` | `TUGAS-PLAN-MODE.md`, `src/api/` |
| P3 Ekstraksi | `p3/extract.ts` | `p3/dokumen/`, `p3/kunci.json` |
| P4 Riset multi-agent | `p4/agents.ts` | `p4/sumber/` |

Folder lain:

- `src/toko/` dan `data/`: data toko dan aturan bisnis. Tidak perlu diubah.
- `src/cek/`: pemeriksa (`pnpm cek`). Jangan diubah.
- Berkas pipa dan data latihan: jangan diubah. Daftarnya ada di "Berkas yang jangan diedit" di bawah.
- `catatan/`: tempat catatan hasil percobaanmu (Markdown).
- `logs/` dan `hasil/`: dibuat otomatis saat proyek dijalankan. Tidak di-commit.

Setiap berkas yang harus kamu isi punya komentar `TODO` di dalamnya. Jangan ubah nama dan tanda tangan fungsi yang diminta.

## Perintah

| Perintah | Fungsi |
| --- | --- |
| `pnpm test` | Jalankan semua test |
| `pnpm dev` | Jalankan API toko (port 3000) |
| `pnpm --silent mcp` | Jalankan MCP server `toko`. Pakai `--silent` (juga di `.mcp.json`), supaya pnpm tidak mencetak judul ke stdout server |
| `pnpm cek <kunci>` | Periksa hasil kerjamu |
| `pnpm p1 pilih-tool` | P1 langkah 1: 6 pertanyaan ambigu, catat tool yang dipilih |
| `pnpm p1 loop` | P1 langkah 2: agentic loop di `p1/loop.ts` |
| `pnpm p1 agent <skenario>` | P1 langkah 3 dan 4: agent Claude Agent SDK. Skenario: `refund-besar`, `gangguan`, `lewat-masa`, `multi-masalah` |
| `pnpm p3 satu <id-dokumen>` | P3: ekstrak satu dokumen |
| `pnpm p3 semua` | P3: ekstrak semua dokumen (dengan validasi dan retry) |
| `pnpm p3 batch` | P3: kirim lewat Message Batches API |
| `pnpm p3 batch --ulang` | P3: kirim ulang hanya dokumen yang gagal |
| `pnpm p4` | P4: riset multi-agent (hasil di `hasil/p4/riset/`) |
| `pnpm p4 --timeout` | P4: sama, tapi pencarian pertama timeout (hasil di `hasil/p4/riset-timeout/`) |

Perintah P1, P3, dan P4 memanggil API Anthropic dan memakai saldo. Jalankan seperlunya.

### P2

P2 tidak punya perintah sendiri. Kamu membuat konfigurasi Claude Code, lalu mengerjakan `TUGAS-PLAN-MODE.md` di branch `latihan/plan-mode` (jangan di-merge).

## Memeriksa hasil: `pnpm cek`

Ada 16 kunci. Jalankan satu per satu, misalnya `pnpm cek p2-1`.

| Proyek | Kunci |
| --- | --- |
| P2 | `p2-1`, `p2-2`, `p2-3`, `p2-4`, `p2-5` |
| P3 | `p3-1`, `p3-2`, `p3-3` |
| P1 | `p1-1`, `p1-2`, `p1-3`, `p1-4` |
| P4 | `p4-1`, `p4-2`, `p4-3`, `p4-4` |

Arti tanda:

- ✅ Lulus.
- ❌ Belum lulus. Pesan di sebelahnya memberi petunjuk apa yang kurang. Kalau pesannya "Jalankan `pnpm ...` dulu", jalankan perintah itu, lalu cek lagi.
- ⬜ Pemeriksaan manual. Komputer tidak bisa menilainya. Lakukan sendiri, misalnya menulis catatan di `catatan/` atau mencoba `/memory` di Claude Code.

Satu kunci lulus kalau tidak ada ❌. ⬜ tidak menghalangi.

`pnpm cek` juga memindai berkas repo mencari API key. Kalau ada key tertulis di berkas, kunci itu ❌.

## Kontrak keluaran P4

`pnpm p4` menulis teks hasil akhir agent ke `hasil/p4/<label>/laporan.md`. Label: `riset` (`pnpm p4`) atau `riset-timeout` (`pnpm p4 --timeout`). Di dalam teks itu harus ada dua blok ```json:

```json
{"dekomposisi": ["sub-bidang 1", "sub-bidang 2"]}
```

```json
{"temuan": [{"claim": "...", "evidence_excerpt": "...", "source": "<id sumber>", "date": "YYYY-MM-DD"}]}
```

Pipa menyalin isinya ke `dekomposisi.json` dan `temuan.json` di folder yang sama.

## Aturan main

- Kerjakan sendiri dulu, baru bertanya ke rekan.
- Jangan ubah berkas di daftar "Berkas yang jangan diedit" di bawah.
- Jangan commit `.env`, `logs/`, atau `hasil/`.

### Berkas yang jangan diedit

Berkas ini milik starter. Kalau starter diperbarui, berkas ini ditimpa (lihat "Memperbarui starter").

| Bagian | Berkas |
| --- | --- |
| Pemeriksa dan pustaka | `src/cek/`, `src/lib/` |
| Data dan aturan toko | `src/toko/`, `data/` |
| MCP server | `src/mcp/server.ts`, `src/mcp/riset.ts`, `src/mcp/riset.test.ts` |
| P1 | `p1/agent.ts`, `p1/run.ts`, `p1/loop-pipa.ts`, `p1/pilih-tool.ts`, `p1/pipa.test.ts`, `p1/skenario.json`, `p1/percakapan.json`, `p1/pertanyaan-ambigu.json` |
| P3 | `p3/run.ts`, `p3/types.ts`, `p3/kunci.json`, `p3/dokumen/` |
| P4 | `p4/riset.ts`, `p4/pipa.ts`, `p4/pipa.test.ts`, `p4/konflik.json`, `p4/sumber/` |
| Konfigurasi | `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `vitest.config.ts` |

Yang boleh kamu ubah: `src/mcp/tools.ts`, `src/mcp/tools.test.ts`, `p1/loop.ts`, `p1/agent-config.ts`, `p3/extract.ts`, `p4/agents.ts`, `catatan/`, berkas P2 di root repo, dan `src/api/` (latihan plan mode).

## Memperbarui starter

Kadang starter diperbaiki setelah kamu membuat repo. Repo milikmu dibuat dari template, jadi riwayat git-nya tidak tersambung dengan starter. Karena itu, jangan `git merge` atau `git pull` dari starter. Ambil hanya berkas yang jangan diedit.

1. Pastikan semua perubahanmu sudah di-commit (`git status` bersih).
2. Tambahkan starter sebagai remote (cukup sekali):

   ```
   git remote add starter https://github.com/julianaputra/belajar-apapun-ccar-f-praktik.git
   ```

3. Ambil versi terbaru, lalu timpa berkas yang jangan diedit:

   ```
   git fetch starter
   git checkout starter/main -- src/cek src/lib src/toko data src/mcp/server.ts src/mcp/riset.ts src/mcp/riset.test.ts p1/agent.ts p1/run.ts p1/loop-pipa.ts p1/pilih-tool.ts p1/pipa.test.ts p1/skenario.json p1/percakapan.json p1/pertanyaan-ambigu.json p3/run.ts p3/types.ts p3/kunci.json p3/dokumen p4/riset.ts p4/pipa.ts p4/pipa.test.ts p4/konflik.json p4/sumber package.json pnpm-lock.yaml tsconfig.json vitest.config.ts
   ```

4. Pasang ulang dependency, lalu cek: `pnpm install`, lalu `pnpm test`.
5. Commit hasilnya: `git commit -m "chore: perbarui berkas starter"`.

Berkas yang kamu kerjakan tidak ikut ditimpa. Kalau pembaruan mengubah tipe yang kamu pakai (misalnya `p3/types.ts`), jalankan `pnpm tsc --noEmit` untuk melihat bagian yang perlu disesuaikan. `tsc` tidak menangkap semuanya, jadi baca ulang juga langkah proyek yang sedang kamu kerjakan di situs. Untuk melihat apa yang berubah, baca riwayat commit di halaman GitHub starter.
