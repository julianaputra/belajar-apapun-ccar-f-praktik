import dotenv from 'dotenv';

export const DEFAULT_MODEL = 'claude-haiku-5-5';

/** Error untuk pengguna: pesan dicetak apa adanya, tanpa stack trace. */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserError';
  }
}

/** `dotenvPath` hanya untuk tes: arahkan ke file lain supaya `.env` asli tidak ikut terbaca. */
export function loadEnv(opts: { dotenvPath?: string } = {}): { apiKey: string; model: string } {
  dotenv.config({ quiet: true, ...(opts.dotenvPath ? { path: opts.dotenvPath } : {}) });
  const apiKey = (process.env.ANTHROPIC_API_KEY ?? '').trim();
  if (!apiKey) {
    throw new UserError(
      'ANTHROPIC_API_KEY kosong.\nJalankan: cp .env.example .env\nLalu isi ANTHROPIC_API_KEY di file .env.',
    );
  }
  const model = (process.env.MODEL ?? '').trim() || DEFAULT_MODEL;
  return { apiKey, model };
}

/** Jalankan fungsi utama. UserError dicetak singkat, lalu keluar dengan kode 1. */
export function runMain(fn: () => Promise<void>): void {
  fn().catch((err: unknown) => {
    if (err instanceof UserError) {
      console.error(err.message);
    } else {
      console.error(err);
    }
    process.exit(1);
  });
}
