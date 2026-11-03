import type Anthropic from '@anthropic-ai/sdk';
import { anthropic } from './claude.js';
import type { RunLogger } from './log.js';

export type BatchRequest = Anthropic.Messages.Batches.BatchCreateParams.Request;

/** Kirim batch. Mengembalikan id batch. Mencatat `batch_kirim {batch_id, custom_ids}`. */
export async function submitBatch(
  run: RunLogger,
  requests: BatchRequest[],
  client: Anthropic = anthropic(),
): Promise<string> {
  const batch = await client.messages.batches.create({ requests });
  run.log('batch_kirim', { batch_id: batch.id, custom_ids: requests.map((r) => r.custom_id) });
  return batch.id;
}

export type WaitOptions = {
  intervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  progress?: (baris: string) => void;
};

/** Tunggu sampai batch selesai (`processing_status === 'ended'`). Polling tiap ~10 detik. */
export async function waitBatch(
  run: RunLogger,
  id: string,
  client: Anthropic = anthropic(),
  opts: WaitOptions = {},
): Promise<Anthropic.Messages.Batches.MessageBatch> {
  const { intervalMs = 10_000, sleep = (ms) => new Promise<void>((r) => setTimeout(r, ms)) } = opts;
  const progress = opts.progress ?? ((baris: string) => console.error(baris));
  for (;;) {
    const batch = await client.messages.batches.retrieve(id);
    if (batch.processing_status === 'ended') {
      run.log('batch_selesai', { batch_id: id, request_counts: batch.request_counts });
      return batch;
    }
    const { processing } = batch.request_counts;
    progress(`Batch ${id}: ${processing} permintaan masih diproses. Cek lagi ${Math.round(intervalMs / 1000)} detik lagi.`);
    await sleep(intervalMs);
  }
}

export type BatchEntry = Anthropic.Messages.Batches.MessageBatchIndividualResponse;

/** Ambil semua hasil batch. Mencatat `batch_hasil {custom_id, type}` per entri. */
export async function batchResults(
  run: RunLogger,
  id: string,
  client: Anthropic = anthropic(),
): Promise<BatchEntry[]> {
  const out: BatchEntry[] = [];
  for await (const entry of await client.messages.batches.results(id)) {
    run.log('batch_hasil', { custom_id: entry.custom_id, type: entry.result.type });
    out.push(entry);
  }
  return out;
}
