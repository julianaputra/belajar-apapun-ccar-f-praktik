import { describe, expect, it } from 'vitest';
import { daysSince, parseTanggal, today } from './dates.js';

describe('parseTanggal', () => {
  it('membaca tiga format', () => {
    const want = Date.UTC(2026, 9, 12);
    expect(parseTanggal('2026-10-12')?.getTime()).toBe(want);
    expect(parseTanggal('12/10/2026')?.getTime()).toBe(want);
    expect(parseTanggal('12 Okt 2026')?.getTime()).toBe(want);
  });
  it('mengenali nama bulan Indonesia', () => {
    expect(parseTanggal('1 Agu 2026')?.getTime()).toBe(Date.UTC(2026, 7, 1));
    expect(parseTanggal('3 Des 2026')?.getTime()).toBe(Date.UTC(2026, 11, 3));
  });
  it('mengembalikan undefined untuk format tak dikenal', () => {
    expect(parseTanggal('kemarin')).toBeUndefined();
    expect(parseTanggal('31/02/2026')).toBeUndefined();
  });
});

describe('today / daysSince', () => {
  it('default 2026-11-02, bisa diganti TOKO_HARI_INI', () => {
    const old = process.env.TOKO_HARI_INI;
    delete process.env.TOKO_HARI_INI;
    expect(today().getTime()).toBe(Date.UTC(2026, 10, 2));
    process.env.TOKO_HARI_INI = '2026-12-01';
    expect(today().getTime()).toBe(Date.UTC(2026, 11, 1));
    if (old === undefined) delete process.env.TOKO_HARI_INI;
    else process.env.TOKO_HARI_INI = old;
  });
  it('menghitung selisih hari', () => {
    delete process.env.TOKO_HARI_INI;
    expect(daysSince('20 Okt 2026')).toBe(13);
    expect(daysSince('15/09/2026')).toBe(48);
  });
});
