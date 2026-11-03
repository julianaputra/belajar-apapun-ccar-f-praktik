import Anthropic from '@anthropic-ai/sdk';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMessage } from './claude.js';
import { UserError } from './env.js';
import { latestRun, startRun } from './log.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kopi-claude-'));
  process.env.LOG_DIR = dir;
  process.env.ANTHROPIC_API_KEY = 'sk-test';
});
afterEach(() => {
  delete process.env.LOG_DIR;
  rmSync(dir, { recursive: true, force: true });
});

const fakeClient = (impl: () => Promise<unknown>) =>
  ({ messages: { create: impl } }) as unknown as Anthropic;

const base = {
  model: 'claude-haiku-5-5',
  max_tokens: 100,
  messages: [{ role: 'user' as const, content: 'halo' }],
};

describe('createMessage', () => {
  it('mencatat request lalu response', async () => {
    const msg = {
      stop_reason: 'tool_use',
      usage: { input_tokens: 12, output_tokens: 3 },
      content: [
        { type: 'text', text: 'ok' },
        { type: 'tool_use', id: 't1', name: 'get_customer', input: { id: 'C1' } },
      ],
    };
    const run = startRun('p1', 'loop');
    const out = await createMessage(
      run,
      {
        ...base,
        tool_choice: { type: 'auto' },
        tools: [{ name: 'get_customer', description: 'd', input_schema: { type: 'object' } }],
      },
      fakeClient(async () => msg),
    );
    expect(out).toBe(msg);
    const events = latestRun('p1', 'loop')!.events;
    expect(events.map((e) => e.event)).toEqual(['request', 'response']);
    expect(events[0]).toMatchObject({
      model: 'claude-haiku-5-5',
      tool_choice: { type: 'auto' },
      tools: ['get_customer'],
      few_shot: false,
    });
    expect(events[1]).toMatchObject({
      stop_reason: 'tool_use',
      tool_uses: [{ name: 'get_customer', input: { id: 'C1' } }],
      usage: { input_tokens: 12, output_tokens: 3 },
    });
  });

  it('few_shot true kalau ada <contoh> di system atau pesan', async () => {
    const client = fakeClient(async () => ({ stop_reason: 'end_turn', content: [] }));
    await createMessage(startRun('p3', 'a'), { ...base, system: 'x <contoh>y</contoh>' }, client);
    await createMessage(
      startRun('p3', 'b'),
      { ...base, messages: [{ role: 'user', content: [{ type: 'text', text: '<contoh>' }] }] },
      client,
    );
    expect(latestRun('p3', 'a')!.events[0].few_shot).toBe(true);
    expect(latestRun('p3', 'b')!.events[0].few_shot).toBe(true);
  });

  it('400 soal tool_choice -> UserError menyebut claude-haiku-5-5', async () => {
    const client = fakeClient(async () => {
      throw new Anthropic.BadRequestError(
        400,
        { error: { message: 'tool_choice is not supported' } },
        'tool_choice is not supported',
        new Headers(),
      );
    });
    const params = {
      ...base,
      model: 'claude-sonnet-5-5',
      tool_choice: { type: 'tool' as const, name: 'a' },
    };
    await expect(createMessage(startRun('p1', 'x'), params, client)).rejects.toThrow(UserError);
    await expect(createMessage(startRun('p1', 'x'), params, client)).rejects.toThrow(
      /claude-haiku-5-5/,
    );
  });

  it('error lain dilempar apa adanya', async () => {
    const client = fakeClient(async () => {
      throw new Error('boom');
    });
    await expect(createMessage(startRun('p1', 'x'), base, client)).rejects.toThrow('boom');
  });
});
