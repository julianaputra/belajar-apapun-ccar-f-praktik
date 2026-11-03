import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { startRun } from './log.js';
import { connectToko } from './mcp-bridge.js';

describe('connectToko', () => {
  it('menampilkan empat tool dan mencatat panggilan ke logs/mcp.jsonl', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'toko-'));
    process.env.LOG_DIR = dir;
    process.env.TOKO_RUN_ID = 'run-bridge-test';
    const toko = await connectToko(startRun('p1', 'bridge-test'));
    try {
      expect(toko.tools.map((t) => t.name).sort()).toEqual([
        'escalate_to_human',
        'get_customer',
        'lookup_order',
        'process_refund',
      ]);
      expect(toko.tools[0]!.input_schema.type).toBe('object');
      const r = await toko.call('lookup_order', { order_id: 'ORD-1002' });
      expect(r.isError).toBe(false);
      expect(r.content).toContain('ORD-1002');
      const lines = readFileSync(join(dir, 'mcp.jsonl'), 'utf8')
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l));
      const calls = lines.filter((l) => l.event === 'tool_call');
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({ name: 'lookup_order', isError: false, runId: 'run-bridge-test' });
    } finally {
      await toko.close();
      delete process.env.LOG_DIR;
      delete process.env.TOKO_RUN_ID;
    }
  }, 30_000);
});
