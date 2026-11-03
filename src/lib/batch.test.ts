import type Anthropic from '@anthropic-ai/sdk';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { batchResults, submitBatch, waitBatch } from './batch.js';
import { latestRun, startRun } from './log.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kopi-batch-'));
  process.env.LOG_DIR = dir;
});
afterEach(() => {
  delete process.env.LOG_DIR;
  rmSync(dir, { recursive: true, force: true });
});

const fake = (batches: object) => ({ messages: { batches } }) as unknown as Anthropic;

describe('submitBatch', () => {
  it('mengirim requests dan mencatat custom_ids', async () => {
    const run = startRun('p3', 'batch');
    let dikirim: unknown;
    const client = fake({
      create: async (body: unknown) => {
        dikirim = body;
        return { id: 'msgbatch_1' };
      },
    });
    const reqs = [{ custom_id: 'a' }, { custom_id: 'b' }] as never;
    expect(await submitBatch(run, reqs, client)).toBe('msgbatch_1');
    expect(dikirim).toEqual({ requests: reqs });
    const ev = latestRun('p3', 'batch')!.events.find((e) => e.event === 'batch_kirim')!;
    expect(ev.custom_ids).toEqual(['a', 'b']);
    expect(ev.batch_id).toBe('msgbatch_1');
  });
});

describe('waitBatch', () => {
  it('polling sampai ended', async () => {
    const run = startRun('p3', 'batch');
    const status = ['in_progress', 'in_progress', 'ended'];
    let panggilan = 0;
    const client = fake({
      retrieve: async () => ({ processing_status: status[panggilan++], request_counts: { processing: 2 } }),
    });
    const baris: string[] = [];
    const tidur: number[] = [];
    const b = await waitBatch(run, 'x', client, {
      intervalMs: 5,
      sleep: async (ms) => void tidur.push(ms),
      progress: (l) => baris.push(l),
    });
    expect(b.processing_status).toBe('ended');
    expect(panggilan).toBe(3);
    expect(tidur).toEqual([5, 5]);
    expect(baris).toHaveLength(2);
  });
});

describe('batchResults', () => {
  it('mengumpulkan hasil dan mencatat type per custom_id', async () => {
    const run = startRun('p3', 'batch');
    const client = fake({
      results: async () =>
        (async function* () {
          yield { custom_id: 'a', result: { type: 'succeeded', message: {} } };
          yield { custom_id: 'b', result: { type: 'errored', error: {} } };
        })(),
    });
    const out = await batchResults(run, 'x', client);
    expect(out.map((e) => e.custom_id)).toEqual(['a', 'b']);
    const evs = latestRun('p3', 'batch')!.events.filter((e) => e.event === 'batch_hasil');
    expect(evs.map((e) => [e.custom_id, e.type])).toEqual([
      ['a', 'succeeded'],
      ['b', 'errored'],
    ]);
  });
});
