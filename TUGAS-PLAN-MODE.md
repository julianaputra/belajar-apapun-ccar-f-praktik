# Tugas Plan Mode (P2, langkah 5)

Tiga tugas kecil untuk latihan Plan Mode di Claude Code.

## Aturan

- Kerjakan semuanya di branch `latihan/plan-mode`.
- Jangan di-merge ke branch utama.
- Mulai dengan Plan Mode. Baca rencananya dulu, baru setujui.
- Jalankan `pnpm test` sebelum dan sesudah tiap tugas.

Jalankan API dulu: `pnpm dev`. Server jalan di port 3000.

## Tugas 1 · Bug kecil di filter status

Ada bug di `GET /orders?status=`. Tes yang ada tetap lulus, jadi bug ini tidak kelihatan dari tes.

Cara melihatnya:

```
curl 'localhost:3000/orders?status=diterima'
curl 'localhost:3000/orders?status=Diterima'
```

Dua perintah itu seharusnya memberi hasil yang sama. Ternyata tidak.

Yang diminta:

1. Cari penyebabnya lewat Plan Mode.
2. Tulis tes yang gagal lebih dulu.
3. Perbaiki sampai tes lulus.

## Tugas 2 · Refactor lintas file

Pindahkan logika filter dan pencarian pesanan dari route (`src/api/orders.ts`, `src/api/customers.ts`) ke modul baru `src/toko/order-service.ts`, lalu perbarui route dan test.

Yang diminta:

1. Minta Claude membuat rencana dulu. Rencananya harus menyebut semua file yang berubah.
2. Buat modul baru dan pindahkan logikanya. Perilaku API tidak boleh berubah.
3. Tambahkan tes untuk modul baru dan pastikan `pnpm test` tetap lulus.

Kerjakan di branch `latihan/plan-mode`, sama seperti dua tugas lainnya. Jangan di-merge ke branch utama.

## Tugas 3 · Fitur kode voucher

Tambahkan kode voucher pada pesanan.

Contoh aturan (boleh kamu ubah):

- Voucher punya kode, potongan, dan tanggal kedaluwarsa.
- Potongan tidak boleh membuat total di bawah 0.
- Kode yang tidak dikenal atau sudah kedaluwarsa ditolak dengan pesan jelas.

Yang diminta:

1. Buat rencana lewat Plan Mode. Sebutkan file mana saja yang berubah.
2. Tambahkan endpoint dan tesnya.
3. Pastikan `pnpm test` lulus.
