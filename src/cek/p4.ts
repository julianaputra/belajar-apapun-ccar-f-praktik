import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LogEvent, Run } from '../lib/log.js';
import { bacaSumber } from '../mcp/riset.js';
import { gagal, manual, ok, requireRun, type Cek, type Hasil } from './types.js';

const FIELD_TEMUAN = ['claim', 'evidence_excerpt', 'source', 'date'] as const;
const FIELD_ERROR = ['failure_type', 'attempted_query', 'partial_results'] as const;
/** Nama tool pemanggil subagent: `Agent` di SDK terbaru, `Task` di versi lama dan di exam guide. */
const TOOL_SUBAGENT = new Set(['Agent', 'Task']);

type Blok = Record<string, unknown>;
const adalahRun = (x: Run | Hasil): x is Run => 'events' in x;
const adalahHasil = (x: unknown): x is Hasil => typeof x === 'object' && x !== null && 'status' in x && 'label' in x;

// ---------------------------------------------------------------------------
// Membaca log: pemanggilan subagent dan tool di dalamnya
// ---------------------------------------------------------------------------

const pesanSdk = (run: Run) => run.events.filter((e) => e.event === 'sdk_message');
const blok = (e: LogEvent): Blok[] => (Array.isArray(e.content) ? (e.content as Blok[]) : []);
const induk = (e: LogEvent): string | null => (typeof e.parent_tool_use_id === 'string' ? e.parent_tool_use_id : null);

/** Teks tool_result (string atau daftar blok teks). */
function teksHasil(b: Blok): string {
  const c = b.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return (c as Blok[]).map((x) => (typeof x?.text === 'string' ? x.text : '')).join('\n');
  return '';
}

type Subagent = { id: string; tipe: string; prompt: string; kunciPesan: string; tanpaMessageId: boolean };

/** Panggilan tool Agent/Task oleh coordinator (pesan tanpa parent_tool_use_id). */
function panggilanSubagent(run: Run): Subagent[] {
  const daftar: Subagent[] = [];
  pesanSdk(run).forEach((e, i) => {
    if (e.type !== 'assistant' || induk(e) !== null) return;
    for (const b of blok(e)) {
      if (b.type !== 'tool_use' || !TOOL_SUBAGENT.has(String(b.name))) continue;
      const input = (b.input ?? {}) as Blok;
      daftar.push({
        id: String(b.id),
        tipe: typeof input.subagent_type === 'string' ? input.subagent_type : 'general-purpose',
        prompt: typeof input.prompt === 'string' ? input.prompt : '',
        // SDK mengirim satu pesan per blok; blok dari respons yang sama berbagi message.id.
        kunciPesan: typeof e.message_id === 'string' ? e.message_id : `#${i}`,
        tanpaMessageId: typeof e.message_id !== 'string',
      });
    }
  });
  return daftar;
}

/** Tool yang dipakai di dalam setiap tipe subagent, lewat parent_tool_use_id → subagent_type. */
function toolPerSubagent(run: Run, subagent: Subagent[]): Map<string, string[]> {
  const tipe = new Map(subagent.map((s) => [s.id, s.tipe]));
  const peta = new Map<string, string[]>();
  for (const e of pesanSdk(run)) {
    const p = induk(e);
    if (e.type !== 'assistant' || p === null) continue;
    const t = tipe.get(p) ?? (typeof e.subagent_type === 'string' ? e.subagent_type : undefined);
    if (!t) continue;
    for (const b of blok(e)) if (b.type === 'tool_use') peta.set(t, [...(peta.get(t) ?? []), String(b.name)]);
  }
  return peta;
}

/** Semua teks tool_result di dalam subagent tertentu dan hasil akhirnya ke coordinator. */
function teksSubagent(run: Run, ids: Set<string>): string {
  const teks: string[] = [];
  for (const e of pesanSdk(run)) {
    if (e.type !== 'user') continue;
    const p = induk(e);
    for (const b of blok(e)) {
      if (b.type !== 'tool_result') continue;
      if ((p !== null && ids.has(p)) || ids.has(String(b.tool_use_id))) teks.push(teksHasil(b));
    }
  }
  return teks.join('\n');
}

// ---------------------------------------------------------------------------
// Membaca berkas hasil
// ---------------------------------------------------------------------------

/** Setiap label run punya folder hasil sendiri: hasil/p4/riset/ dan hasil/p4/riset-timeout/. */
type Label = 'riset' | 'riset-timeout';
const PERINTAH: Record<Label, string> = { riset: 'pnpm p4', 'riset-timeout': 'pnpm p4 --timeout' };

function bacaJsonHasil(root: string, nama: 'dekomposisi' | 'temuan', run: Label = 'riset'): unknown[] | Hasil {
  const label = `hasil/p4/${run}/${nama}.json`;
  const path = join(root, 'hasil', 'p4', run, `${nama}.json`);
  if (!existsSync(path)) {
    return gagal(
      label,
      `Berkas belum ada. Jalankan \`${PERINTAH[run]}\` dulu. Pastikan laporan memuat blok \`\`\`json berisi {"${nama}": [...]} (lihat p4/agents.ts).`,
    );
  }
  let v: unknown;
  try {
    v = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return gagal(label, `Isi ${nama}.json bukan JSON yang valid. Jalankan \`${PERINTAH[run]}\` lagi.`);
  }
  if (v && typeof v === 'object' && !Array.isArray(v) && Array.isArray((v as Blok)[nama])) v = (v as Blok)[nama];
  return Array.isArray(v) ? v : gagal(label, `Isi ${nama}.json harus berupa daftar (array).`);
}

/** Isi laporan.md tanpa blok ```json, supaya id sumber hanya dihitung kalau disebut di teks laporan. */
function bacaLaporan(root: string, run: Label = 'riset'): string | Hasil {
  const path = join(root, 'hasil', 'p4', run, 'laporan.md');
  if (!existsSync(path)) return gagal(`hasil/p4/${run}/laporan.md`, `Berkas belum ada. Jalankan \`${PERINTAH[run]}\` dulu.`);
  return readFileSync(path, 'utf8').replace(/```json[^\n]*\n[\s\S]*?```/g, '');
}

function idSumber(root: string): string[] | Hasil {
  try {
    return bacaSumber(join(root, 'p4', 'sumber')).map((s) => s.id);
  } catch (err) {
    return gagal('p4/sumber/', `Sumber tidak bisa dibaca: ${(err as Error).message.split('\n')[0]}. Jalankan pnpm cek dari root starter.`);
  }
}

// ---------------------------------------------------------------------------
// p4-1: dekomposisi dan pembatasan tool subagent
// ---------------------------------------------------------------------------

const p41: Cek = async (root) => {
  const hasil: Hasil[] = [];
  const dekomposisi = bacaJsonHasil(root, 'dekomposisi');
  const labelDekomposisi = 'Dekomposisi mencakup minimal 4 sub-bidang';
  if (adalahHasil(dekomposisi)) hasil.push(dekomposisi);
  else if (dekomposisi.length < 4) {
    hasil.push(gagal(labelDekomposisi, `dekomposisi.json baru berisi ${dekomposisi.length} sub-bidang. Minta coordinator memecah pertanyaan menjadi minimal 4 sub-bidang.`));
  } else hasil.push(ok(labelDekomposisi, `${dekomposisi.length} sub-bidang`));

  const run = requireRun('p4', 'riset', 'pnpm p4');
  if (!adalahRun(run)) return [...hasil, run];
  const subagent = panggilanSubagent(run);
  const tipe = new Set(subagent.map((s) => s.tipe));
  const belum = ['searcher', 'analyst'].filter((t) => !tipe.has(t));
  if (belum.length > 0) {
    hasil.push(
      gagal(
        'Coordinator memanggil subagent searcher dan analyst',
        `Run riset terakhir belum memanggil subagent ${belum.join(' dan ')} lewat tool Agent. Definisikan \`agents\` di p4/agents.ts dan izinkan "Agent" di allowedTools.`,
      ),
    );
    return hasil;
  }
  hasil.push(ok('Coordinator memanggil subagent searcher dan analyst'));

  const tools = toolPerSubagent(run, subagent);
  const unik = (xs: string[] = []) => [...new Set(xs)];
  const luarRiset = unik(tools.get('searcher')).filter((t) => !t.startsWith('mcp__riset__'));
  hasil.push(
    luarRiset.length === 0
      ? ok('searcher hanya memakai tool mcp__riset__*')
      : gagal('searcher hanya memakai tool mcp__riset__*', `searcher memakai ${luarRiset.join(', ')}. Batasi \`tools\` searcher di AgentDefinition.`),
  );
  const cari = unik(tools.get('analyst')).filter((t) => t === 'mcp__riset__search_sources');
  hasil.push(
    cari.length === 0
      ? ok('analyst tidak memakai search_sources')
      : gagal('analyst tidak memakai search_sources', 'analyst memakai mcp__riset__search_sources. Analyst bekerja dari temuan searcher; hapus tool itu dari `tools` analyst.'),
  );
  return hasil;
};

// ---------------------------------------------------------------------------
// p4-2: subagent paralel dan konteks eksplisit
// ---------------------------------------------------------------------------

const p42: Cek = async (root) => {
  const run = requireRun('p4', 'riset', 'pnpm p4');
  if (!adalahRun(run)) return [run];
  const ids = idSumber(root);
  if (adalahHasil(ids)) return [ids];
  const hasil: Hasil[] = [];
  const subagent = panggilanSubagent(run);

  const perPesan = new Map<string, number>();
  for (const s of subagent) perPesan.set(s.kunciPesan, (perPesan.get(s.kunciPesan) ?? 0) + 1);
  const maks = Math.max(0, ...perPesan.values());
  const labelParalel = 'Beberapa subagent dipanggil dalam satu respons';
  if (maks >= 2) hasil.push(ok(labelParalel, `${maks} subagent sekaligus`));
  else if (subagent.some((s) => s.tanpaMessageId)) {
    hasil.push(
      gagal(labelParalel, 'Log tidak memuat message_id (message.id) untuk pesan coordinator, jadi pemanggilan paralel tidak bisa dikelompokkan. Jalankan `pnpm p4` lagi memakai pipa bawaan (p4/pipa.ts).'),
    );
  } else {
    hasil.push(gagal(labelParalel, `Setiap respons coordinator paling banyak memanggil ${maks} subagent. Minta coordinator memanggil beberapa subagent dalam satu respons.`));
  }

  const labelKonteks = 'Temuan searcher ditulis di prompt analyst';
  const searcher = new Set(subagent.filter((s) => s.tipe === 'searcher').map((s) => s.id));
  const analyst = subagent.filter((s) => s.tipe === 'analyst');
  const dariSearcher = ids.filter((id) => teksSubagent(run, searcher).includes(id));
  if (analyst.length === 0) {
    hasil.push(gagal(labelKonteks, 'Run riset terakhir belum memanggil subagent analyst.'));
  } else if (dariSearcher.length === 0) {
    hasil.push(gagal(labelKonteks, 'Hasil searcher tidak memuat id sumber. Minta searcher mencantumkan id sumber di setiap temuan.'));
  } else if (!analyst.some((a) => dariSearcher.some((id) => a.prompt.includes(id)))) {
    hasil.push(
      gagal(labelKonteks, `Tidak ada prompt analyst yang memuat id sumber dari searcher (${dariSearcher.join(', ')}). Subagent tidak mewarisi konteks coordinator; tulis temuan searcher lengkap di prompt analyst.`),
    );
  } else hasil.push(ok(labelKonteks));

  const durasi = run.events.find((e) => e.event === 'riset_selesai')?.durasi_ms;
  hasil.push(
    manual(
      'Perbandingan waktu paralel vs berurutan',
      `Tulis di catatan/p4-2.md${typeof durasi === 'number' ? ` (run terakhir: ${(durasi / 1000).toFixed(1)} detik, lihat durasi_ms di logs/p4.jsonl)` : ''}.`,
    ),
  );
  return hasil;
};

// ---------------------------------------------------------------------------
// p4-3: format temuan dan atribusi sumber
// ---------------------------------------------------------------------------

const kosong = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && !v.trim());

const p43: Cek = async (root) => {
  const temuan = bacaJsonHasil(root, 'temuan');
  if (adalahHasil(temuan)) return [temuan];
  if (temuan.length === 0) return [gagal('hasil/p4/temuan.json', 'temuan.json kosong. Laporan harus memuat daftar temuan.')];
  const ids = idSumber(root);
  if (adalahHasil(ids)) return [ids];
  const hasil: Hasil[] = [];

  const labelField = `Setiap temuan punya ${FIELD_TEMUAN.join(', ')}`;
  const kurang = temuan
    .map((t, i) => ({ i, f: FIELD_TEMUAN.filter((f) => kosong((t as Blok | null)?.[f])) }))
    .filter((x) => x.f.length > 0);
  hasil.push(
    kurang.length === 0
      ? ok(labelField, `${temuan.length} temuan`)
      : gagal(labelField, `Temuan tanpa field lengkap: ${kurang.slice(0, 5).map((x) => `#${x.i + 1} (${x.f.join(', ')})`).join('; ')}. Wajibkan format ini di prompt subagent.`),
  );

  const sumber = [...new Set(temuan.map((t) => (t as Blok | null)?.source).filter((s): s is string => typeof s === 'string' && !!s.trim()))];
  const asing = sumber.filter((s) => !ids.includes(s));
  hasil.push(
    asing.length === 0
      ? ok('Setiap source adalah id di p4/sumber/')
      : gagal('Setiap source adalah id di p4/sumber/', `source tidak dikenal: ${asing.join(', ')}. Pakai id persis dari search_sources, misalnya ${ids[0]}.`),
  );

  const laporan = bacaLaporan(root);
  if (adalahHasil(laporan)) hasil.push(laporan);
  else {
    const hilang = sumber.filter((s) => ids.includes(s) && !laporan.includes(s));
    hasil.push(
      hilang.length === 0
        ? ok('Setiap sumber temuan disebut di laporan.md')
        : gagal('Setiap sumber temuan disebut di laporan.md', `Id sumber ini ada di temuan, tapi tidak disebut di teks laporan (di luar blok json): ${hilang.join(', ')}. Sintesis tidak boleh menghilangkan source.`),
    );
  }
  return hasil;
};

// ---------------------------------------------------------------------------
// p4-4: error terstruktur dan data yang bertentangan
// ---------------------------------------------------------------------------

type Konflik = { angka: string[]; sumber: string[] };

function bacaKonflik(root: string): Konflik | Hasil {
  const path = join(root, 'p4', 'konflik.json');
  if (!existsSync(path)) return gagal('p4/konflik.json', 'Berkas p4/konflik.json tidak ada. Jalankan pnpm cek dari root starter.');
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Konflik;
  } catch {
    return gagal('p4/konflik.json', 'Isi p4/konflik.json bukan JSON yang valid.');
  }
}

/** Isi bagian bertajuk `judul` sampai heading berikutnya yang setingkat atau lebih tinggi. */
function bagian(md: string, judul: RegExp): string | undefined {
  const baris = md.split('\n');
  const i = baris.findIndex((b) => /^#{1,6}\s/.test(b) && judul.test(b));
  if (i < 0) return undefined;
  const level = /^#+/.exec(baris[i]!)![0].length;
  const akhir = baris.findIndex((b, j) => j > i && new RegExp(`^#{1,${level}}\\s`).test(b));
  return baris.slice(i + 1, akhir < 0 ? undefined : akhir).join('\n');
}

const p44: Cek = async (root) => {
  const konflik = bacaKonflik(root);
  if (adalahHasil(konflik)) return [konflik];
  const hasil: Hasil[] = [];

  const run = requireRun('p4', 'riset-timeout', 'pnpm p4 --timeout');
  const labelError = 'Error searcher terstruktur';
  if (!adalahRun(run)) hasil.push(run);
  else {
    const teks: string[] = [];
    for (const e of pesanSdk(run)) {
      for (const b of blok(e)) {
        if (b.type === 'tool_result') teks.push(teksHasil(b));
        if (b.type === 'text' && typeof b.text === 'string') teks.push(b.text);
      }
      const r = e.content as { result?: unknown } | undefined;
      if (e.type === 'result' && typeof r?.result === 'string') teks.push(r.result);
    }
    const lengkap = teks.some((t) => FIELD_ERROR.every((f) => t.includes(f)));
    const belum = FIELD_ERROR.filter((f) => !teks.some((t) => t.includes(f)));
    const rinci =
      belum.length === FIELD_ERROR.length ? '' : belum.length > 0 ? ` (belum muncul: ${belum.join(', ')})` : ' (ketiganya muncul, tapi tidak di satu hasil yang sama)';
    hasil.push(
      lengkap
        ? ok(labelError)
        : gagal(
            labelError,
            `Di run riset-timeout terakhir, tidak ada hasil subagent yang memuat ${FIELD_ERROR.join(', ')} sekaligus${rinci}. Minta searcher melaporkan error terstruktur saat tool gagal, bukan daftar kosong.`,
          ),
    );
  }

  // Celah cakupan dinilai dari laporan run timeout (searcher gagal di run itu).
  const laporanTimeout = bacaLaporan(root, 'riset-timeout');
  if (adalahHasil(laporanTimeout)) hasil.push(laporanTimeout);
  else {
    hasil.push(
      /celah cakupan/i.test(laporanTimeout)
        ? ok('Laporan run riset-timeout memberi anotasi celah cakupan')
        : gagal(
            'Laporan run riset-timeout memberi anotasi celah cakupan',
            'hasil/p4/riset-timeout/laporan.md tidak memuat "celah cakupan". Coordinator harus menulis bagian yang tidak tercakup karena searcher gagal.',
          ),
    );
  }

  // Konflik dinilai dari laporan run biasa: di run timeout, salah satu sumber bisa wajar terlewat.
  const laporan = bacaLaporan(root, 'riset');
  if (adalahHasil(laporan)) return [...hasil, laporan];
  const labelKonflik = 'Bagian "Temuan yang diperdebatkan" memuat kedua angka dan sumbernya';
  const isi = bagian(laporan, /temuan yang diperdebatkan/i);
  if (isi === undefined) {
    hasil.push(gagal(labelKonflik, 'hasil/p4/riset/laporan.md belum punya heading "Temuan yang diperdebatkan". Tulis angka yang bertentangan di bagian itu.'));
  } else {
    const hilang = [...konflik.angka, ...konflik.sumber].filter((x) => !isi.includes(x));
    hasil.push(
      hilang.length === 0
        ? ok(labelKonflik)
        : gagal(labelKonflik, `Bagian itu belum memuat: ${hilang.join(', ')}. Cantumkan kedua angka beserta id sumbernya, jangan pilih salah satu.`),
    );
  }
  return hasil;
};

export const cekP4: Record<string, Cek> = {
  'p4-1': p41,
  'p4-2': p42,
  'p4-3': p43,
  'p4-4': p44,
};
