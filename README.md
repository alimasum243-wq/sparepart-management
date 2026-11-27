# Sparepart Management System — MVP

Fondasi awal aplikasi web untuk usaha sparepart kompor Hj. Umiyati.

## Stack
- Frontend: React + TypeScript + Vite
- Backend: Node.js + Express + TypeScript
- Database driver: mysql2 (TiDB MySQL-compatible)
- Validasi input API: Zod

## Status
Ini adalah **fondasi aplikasi**, belum aplikasi transaksi siap produksi. Modul transaksi baru boleh diaktifkan setelah audit struktur database, migrasi terencana, autentikasi, backup, dan pengujian alur stok/HPP selesai.

## Persyaratan
- Node.js 20+
- npm
- Database TiDB Cloud yang dapat diakses dari lingkungan backend

## Menjalankan lokal

### 1. Backend
```bash
cd server
cp .env.example .env
npm install
npm run dev
```

Isi `.env` dengan kredensial TiDB dari TiDB Cloud. Jangan commit `.env`.

### 2. Frontend
Terminal baru:
```bash
cd client
npm install
npm run dev
```
Buka URL lokal yang ditampilkan Vite.

## Keamanan
- Jangan masukkan password, connection string, atau token ke source code.
- Jangan commit `.env`.
- Jangan membuka port database ke publik tanpa pembatasan IP/TLS.
- Gunakan secret manager pada hosting.
- Backup database sebelum menjalankan migrasi.
- Endpoint `/api/health/db` hanya mengembalikan status koneksi, tidak mengembalikan kredensial atau isi database.

## Tahap implementasi berikutnya
1. Audit `SHOW CREATE TABLE` untuk seluruh tabel yang sudah ada.
2. Buat migration SQL additive (tanpa DROP/RECREATE tabel yang ada).
3. Implementasikan login dan sesi aman.
4. Implementasikan master produk/supplier/distributor.
5. Implementasikan pembelian + moving weighted average.
6. Implementasikan perpindahan titipan dan laporan penjualan distributor.
7. Implementasikan retail, piutang/utang, pembayaran, kas, jurnal, dan laporan.
8. Uji seluruh alur sebelum dipakai untuk posting transaksi nyata.

## Catatan database
Nama database yang ditargetkan: `sparepart_db`.
Database yang ada tidak dimodifikasi oleh starter ini.

## Implementasi fitur distributor dan akuntansi

Baca `IMPLEMENTASI_DISTRIBUTOR.md` sebelum menerapkan migrasi. File tersebut menjelaskan skema tambahan, pengaturan secret login, setup akun pemilik pertama, endpoint, dan uji penerimaan. Jalankan migrasi satu statement per eksekusi dan backup database terlebih dahulu.
