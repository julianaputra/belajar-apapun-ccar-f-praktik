import { appendFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { latestRun, readRuns, startRun } from './log.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kopi-log-'));
  process.env.LOG_DIR = dir;
});
afterEach(() => {
  delete process.env.LOG_DIR;
  rmSync(dir, { recursive: true, force: true });
});

describe('log', () => {
  it('file belum ada -> []', () => {
    expect(readRuns('p1', 'loop')).toEqual([]);
    expect(latestRun('p1', 'loop')).toBeUndefined();
  });

  it('dua run -> dua Run, latestRun = yang kedua', () => {
    const a = startRun('p1', 'loop');
    a.log('request', { model: 'm' });
    const b = startRun('p1', 'loop');
    b.log('response', { stop_reason: 'end_turn' });
    b.log('request');
    const runs = readRuns('p1', 'loop');
    expect(runs.length).toBe(2);
    expect(runs[0].runId).toBe(a.runId);
    expect(runs[1].events.length).toBe(2);
    expect(runs[0].events[0]).toMatchObject({ event: 'request', model: 'm', label: 'loop' });
    expect(latestRun('p1', 'loop')?.runId).toBe(b.runId);
  });

  it('label menyaring; tanpa label mengembalikan semua', () => {
    startRun('p3', 'a').log('x');
    startRun('p3', 'b').log('x');
    expect(readRuns('p3', 'a').length).toBe(1);
    expect(readRuns('p3').length).toBe(2);
    expect(latestRun('p3', 'zzz')).toBeUndefined();
  });

  it('melewati baris rusak', () => {
    const r = startRun('p4', 'l');
    r.log('x');
    appendFileSync(join(dir, 'p4.jsonl'), 'bukan json\n');
    expect(readRuns('p4', 'l').length).toBe(1);
  });
});
