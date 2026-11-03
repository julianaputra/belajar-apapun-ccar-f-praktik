import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readRuns, type LogEvent, type Run } from '../lib/log.js';
import { gagal, manual, ok, requireRun, type Cek, type Hasil } from './types.js';

const BATAS_REFUND = 5_000_000;
const FIELD_HANDOFF = ['customer_id', 'root_cause', 'amount', 'recommended_action'] as const;
const POLA_TANGGAL = [/\d{2}\/\d{2}\/\d{4}/, /\d{1,2} (Jan|Feb|Mar|Apr|Mei|Jun|Jul|Agu|Sep|Okt|Nov|Des) \d{4}/];

const adalahRun = (x: Run | Hasil): x is Run => 'events' in x;

// ---------------------------------------------------------------------------
// p1-1: pemilihan tool
// ---------------------------------------------------------------------------

const p11: Cek = async (root) => {
  const run = requireRun('p1', 'pilih-tool', 'pnpm p1 pilih-tool');
  if (!adalahRun(run)) return [run];
  const hasil: Hasil[] = [];

  const pilihan = run.events.filter((e) => e.event === 'pilihan');
  const benar = pilihan.filter((e) => e.chosen === e.expected).length;
  const label = 'Tool yang dipilih benar (minimal 5 dari 6)';
  if (pilihan.length < 6) {
    hasil.push(gagal(label, `Run pilih-tool terakhir baru mencatat ${pilihan.length} dari 6 pertanyaan. Jalankan lagi sampai selesai.`));
  } else if (benar < 5) {
    const salah = pilihan
      .filter((e) => e.chosen !== e.expected)
      .map((e) => `"${String(e.q)}" → ${String(e.chosen ?? 'tidak memilih tool')} (harusnya ${String(e.expected)})`);
    hasil.push(gagal(label, `Baru ${benar} dari 6 benar. Perjelas deskripsi tool di src/mcp/tools.ts. Salah: ${salah.join('; ')}`));
  } else {
    hasil.push(ok(label, `${benar} dari 6`));
  }

  const catatan = join(root, 'catatan', 'p1-1.md');
  const labelCatatan = 'Catatan sebelum/sesudah';
  if (!existsSync(catatan)) {
    hasil.push(gagal(labelCatatan, 'Buat catatan/p1-1.md berisi hasil sebelum dan sesudah deskripsi diperbaiki.'));
  } else {
    const isi = readFileSync(catatan, 'utf8').toLowerCase();
    hasil.push(
      isi.includes('sebelum') && isi.includes('sesudah')
        ? ok('Catatan sebelum/sesudah ada di catatan/p1-1.md')
        : gagal(labelCatatan, 'catatan/p1-1.md harus memuat kata "sebelum" dan "sesudah".'),
    );
  }
  return hasil;
};

// ---------------------------------------------------------------------------
// p1-2: agentic loop
// ---------------------------------------------------------------------------

/** Pecah event run menjadi percakapan, mulai dari setiap event percakapan_mulai. */
function perPercakapan(run: Run): LogEvent[][] {
  const daftar: LogEvent[][] = [];
  for (const e of run.events) {
    if (e.event === 'percakapan_mulai') daftar.push([]);
    else daftar.at(-1)?.push(e);
  }
  return daftar;
}

const p12: Cek = async () => {
  const run = requireRun('p1', 'loop', 'pnpm p1 loop');
  if (!adalahRun(run)) return [run];
  const percakapan = perPercakapan(run);
  if (percakapan.length !== 3) {
    return [gagal('3 percakapan selesai', `Run loop terakhir punya ${percakapan.length} percakapan, harusnya 3 percakapan. Jalankan pnpm p1 loop sampai selesai.`)];
  }
  const hasil: Hasil[] = [];
  percakapan.forEach((events, i) => {
    const label = `Percakapan ${i + 1} berhenti karena end_turn`;
    const stops = events.filter((e) => e.event === 'response').map((e) => e.stop_reason);
    const terakhir = stops.at(-1);
    if (events.some((e) => e.event === 'batas_iterasi')) {
      hasil.push(gagal(label, 'Loop berhenti karena batas iterasi. Loop harus berhenti sendiri saat stop_reason "end_turn".'));
    } else if (terakhir !== 'end_turn') {
      hasil.push(gagal(label, `stop_reason terakhir ${JSON.stringify(terakhir ?? null)}, harusnya "end_turn". Lanjutkan loop selama stop_reason "tool_use".`));
    } else if (!stops.slice(0, -1).includes('tool_use')) {
      hasil.push(gagal(label, 'Tidak ada response "tool_use" sebelum end_turn. Kirim daftar tool dan jalankan tool yang diminta.'));
    } else {
      hasil.push(ok(label, `${stops.length} putaran`));
    }
  });
  return hasil;
};

// ---------------------------------------------------------------------------
// p1-3 dan p1-4: run agent, digabung dengan logs/mcp.jsonl lewat runId
// ---------------------------------------------------------------------------

type ToolCall = { name: string; input: Record<string, unknown>; isError: boolean; content: string; error?: Record<string, unknown> };

/** Isi error terstruktur kalau konten tool berupa JSON, selain itu undefined. */
function errorTerstruktur(content: string): Record<string, unknown> | undefined {
  try {
    const v: unknown = JSON.parse(content);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/** Panggilan tool di MCP server selama run agent ini (server memakai TOKO_RUN_ID sebagai label). */
function panggilanTool(run: Run): ToolCall[] {
  return readRuns('mcp', run.runId)
    .flatMap((r) => r.events)
    .filter((e) => e.event === 'tool_call')
    .map((e) => {
      const content = typeof e.content === 'string' ? e.content : JSON.stringify(e.content ?? '');
      return {
        name: String(e.name),
        input: (e.input ?? {}) as Record<string, unknown>,
        isError: e.isError === true,
        content,
        error: e.isError === true ? errorTerstruktur(content) : undefined,
      };
    });
}

function runAgent(skenario: string): { run: Run; calls: ToolCall[] } | Hasil {
  const run = requireRun('p1', `agent:${skenario}`, `pnpm p1 agent ${skenario}`);
  if (!adalahRun(run)) return run;
  const calls = panggilanTool(run);
  if (calls.length === 0) {
    return gagal(
      `Panggilan tool skenario ${skenario}`,
      `Tidak ada panggilan tool di logs/mcp.jsonl untuk run agent:${skenario} terakhir. Pastikan agent memanggil tool toko, lalu jalankan pnpm p1 agent ${skenario} lagi.`,
    );
  }
  return { run, calls };
}

/** Teks semua blok tool_result di pesan SDK (yang dikirim ke model). */
function teksToolResult(run: Run): string[] {
  const teks: string[] = [];
  for (const e of run.events) {
    if (e.event !== 'sdk_message' || e.type !== 'user' || !Array.isArray(e.content)) continue;
    for (const blok of e.content as { type?: string; content?: unknown }[]) {
      if (blok?.type !== 'tool_result') continue;
      const c = blok.content;
      if (typeof c === 'string') teks.push(c);
      else if (Array.isArray(c)) for (const b of c as { text?: unknown }[]) if (typeof b?.text === 'string') teks.push(b.text);
    }
  }
  return teks;
}

function cekRefundBesar(calls: ToolCall[]): Hasil[] {
  const besar = calls.filter((c) => c.name === 'process_refund' && !c.isError && Number(c.input.amount) > BATAS_REFUND);
  return [
    besar.length > 0
      ? gagal(
          'Refund di atas 5.000.000 tidak diproses',
          `process_refund sukses dengan amount ${besar.map((c) => String(c.input.amount)).join(', ')}. Blokir lewat hook PreToolUse, jangan hanya lewat prompt.`,
        )
      : ok('Refund di atas 5.000.000 tidak diproses'),
    calls.some((c) => c.name === 'escalate_to_human')
      ? ok('Refund besar dieskalasi ke manusia')
      : gagal('Refund besar dieskalasi ke manusia', 'Tidak ada panggilan escalate_to_human. Pesan penolakan dari hook harus mengarahkan agent ke eskalasi.'),
  ];
}

function cekGangguan(calls: ToolCall[]): Hasil {
  const label = 'Error transient dicoba ulang';
  const lookups = calls.filter((c) => c.name === 'lookup_order');
  const iTransient = lookups.findIndex((c) => c.isError && c.error?.errorCategory === 'transient');
  if (iTransient < 0) {
    return gagal(label, 'Tidak ada lookup_order yang gagal dengan errorCategory "transient". Kembalikan error terstruktur (JSON) dari tools.ts.');
  }
  return lookups.slice(iTransient + 1).some((c) => !c.isError)
    ? ok(label)
    : gagal(label, 'Setelah error transient, tidak ada lookup_order yang sukses. Error transient (isRetryable: true) harus dicoba ulang.');
}

function cekLewatMasa(calls: ToolCall[]): Hasil {
  const label = 'Error bisnis tidak dicoba ulang';
  const i = calls.findIndex((c) => c.isError && c.error?.errorCategory === 'business');
  if (i < 0) {
    return gagal(label, 'Tidak ada tool yang mengembalikan errorCategory "business". Pesanan yang lewat 30 hari harus jadi error bisnis yang terstruktur.');
  }
  const orderId = calls[i]!.input.order_id;
  const ulang = calls.slice(i + 1).filter((c) => c.name === 'process_refund' && c.input.order_id === orderId);
  return ulang.length > 0
    ? gagal(label, `process_refund untuk ${String(orderId)} dipanggil lagi ${ulang.length}× setelah error bisnis. Jelaskan ke pelanggan, jangan retry.`)
    : ok(label);
}

function cekTanggal(runs: Run[]): Hasil {
  const label = 'Tanggal di hasil tool seragam (ISO)';
  for (const run of runs) {
    for (const teks of teksToolResult(run)) {
      for (const pola of POLA_TANGGAL) {
        const m = pola.exec(teks);
        if (m) {
          return gagal(label, `Run ${run.label}: hasil tool masih memuat "${m[0]}". Ubah ke YYYY-MM-DD lewat hook PostToolUse.`);
        }
      }
    }
  }
  return ok(label);
}

const p13: Cek = async () => {
  const hasil: Hasil[] = [];
  const runs: Run[] = [];
  const pakai = (skenario: string, nilai: (calls: ToolCall[]) => Hasil | Hasil[]) => {
    const r = runAgent(skenario);
    if ('status' in r) {
      hasil.push(r);
      return;
    }
    runs.push(r.run);
    hasil.push(...[nilai(r.calls)].flat());
  };
  pakai('refund-besar', cekRefundBesar);
  pakai('gangguan', cekGangguan);
  pakai('lewat-masa', cekLewatMasa);
  if (runs.length > 0) hasil.push(cekTanggal(runs));
  return hasil;
};

const p14: Cek = async () => {
  const r = runAgent('multi-masalah');
  if ('status' in r) return [r];
  const { run, calls } = r;
  const hasil: Hasil[] = [];

  const jenis = new Set(calls.map((c) => c.name));
  hasil.push(
    jenis.size >= 2
      ? ok('Memakai lebih dari satu tool', [...jenis].join(', '))
      : gagal('Memakai lebih dari satu tool', `Hanya ${jenis.size} tool berbeda yang dipanggil (${[...jenis].join(', ')}). Pecah pesan menjadi beberapa masalah dan tangani satu per satu.`),
  );

  const eskalasi = calls.filter((c) => c.name === 'escalate_to_human');
  const labelHandoff = 'Handoff eskalasi terstruktur';
  if (eskalasi.length === 0) {
    hasil.push(gagal(labelHandoff, 'Tidak ada panggilan escalate_to_human. Masalah yang tidak bisa diselesaikan agent harus dieskalasi.'));
  } else {
    const kurang = (c: ToolCall) => FIELD_HANDOFF.filter((f) => c.input[f] === undefined || c.input[f] === null || c.input[f] === '');
    const lengkap = eskalasi.find((c) => kurang(c).length === 0);
    hasil.push(
      lengkap
        ? ok(labelHandoff)
        : gagal(labelHandoff, `Input escalate_to_human belum memuat: ${kurang(eskalasi.at(-1)!).join(', ')}. Ubah skema tool di src/mcp/tools.ts.`),
    );
  }

  const awal = run.events.find((e) => e.event === 'prompt_awal');
  const teks = awal ? JSON.stringify([awal.prompt, awal.systemPrompt]) : '';
  hasil.push(
    /case facts/i.test(teks)
      ? ok('Blok case facts ada di prompt')
      : gagal('Blok case facts ada di prompt', 'systemPrompt belum memuat blok berlabel "case facts". Tambahkan di p1/agent-config.ts.'),
  );
  hasil.push(manual('Uji handoff ke rekan setim', 'Minta rekan membaca input escalate_to_human saja, tanpa transkrip. Apakah mereka tahu harus berbuat apa?'));
  return hasil;
};

export const cekP1: Record<string, Cek> = {
  'p1-1': p11,
  'p1-2': p12,
  'p1-3': p13,
  'p1-4': p14,
};
