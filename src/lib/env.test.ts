import { afterEach, describe, expect, it } from 'vitest';
import { loadEnv as loadEnvRaw, UserError } from './env.js';

// Hermetik: arahkan dotenv ke file yang tidak ada, supaya .env asli peserta tidak ikut terbaca.
const loadEnv = () => loadEnvRaw({ dotenvPath: '/nonexistent/.env' });

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe('loadEnv', () => {
  it('melempar UserError kalau key kosong', () => {
    process.env.ANTHROPIC_API_KEY = '';
    let err: unknown;
    try {
      loadEnv();
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(UserError);
    expect((err as Error).message).toContain('cp .env.example .env');
  });

  it('memakai model default tanpa MODEL', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    delete process.env.MODEL;
    expect(loadEnv()).toEqual({ apiKey: 'sk-test', model: 'claude-haiku-5-5' });
  });

  it('memakai MODEL dari env', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    process.env.MODEL = 'claude-sonnet-5-5';
    expect(loadEnv().model).toBe('claude-sonnet-5-5');
  });
});
