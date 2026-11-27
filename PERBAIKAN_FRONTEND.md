# Perbaikan Frontend Integrasi Distributor

Perbaikan ini mengganti `client/src/App.tsx` agar sesuai dengan endpoint autentikasi dan distributor yang tersedia di backend paket.

## Yang diperbaiki
- Login pemilik/distributor dan pemulihan sesi token.
- Portal distributor: stok titipan, laporan penjualan, dan laporan pembayaran.
- Panel pemilik: pembuatan akun distributor, pencatatan titipan, persetujuan laporan penjualan, verifikasi/penolakan pembayaran.
- Form pengeluaran dan laporan laba-rugi.
- Form pembelian lama dipertahankan dan menggunakan token pemilik.
- Penyesuaian CSS untuk login dan tampilan portal distributor.

## Pemasangan aman
1. Tutup proses Vite yang sedang berjalan.
2. Cadangkan folder proyek saat ini.
3. Ekstrak paket ini ke folder baru, jangan menimpa proyek asli dulu.
4. Pertahankan `server/.env` milik proyek lama; jangan menyalin `.env.example` sebagai pengganti.
5. Jangan jalankan SQL migrasi sebelum struktur database diperiksa dan backup tersedia.
6. Di folder `client`, jalankan `npm ci`, lalu `npm run build`.
7. Di folder `server`, jalankan `npm ci`, lalu `npm run build`.
8. Jika kedua build berhasil, baru lakukan uji koneksi dan uji login dengan data percobaan.

## Batasan yang masih ada
- Bukti pembayaran masih berupa referensi/tautan teks, belum unggah foto.
- Modul pengembalian barang, pembayaran utang pemasok, cetak nota, backup terjadwal, dan alokasi pembayaran per faktur belum tersedia.
- Laba-rugi hanya mencakup transaksi yang sudah masuk jurnal.

Build penuh belum dapat diverifikasi di lingkungan penyusunan karena instalasi npm mengalami timeout jaringan. Sintaks TSX sudah diperiksa melalui transpile TypeScript tanpa diagnostik sintaks; tetap wajib jalankan `npm run build` pada komputer sebelum dipakai.
