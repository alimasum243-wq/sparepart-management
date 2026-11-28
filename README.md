# Sparepart Management System

Fondasi aplikasi manajemen usaha sparepart: React + TypeScript + Vite, Express + TypeScript, dan TiDB/MySQL.

## Status saat ini

**Belum siap dipakai untuk transaksi riil.** Audit dan hardening sedang berlangsung di branch `prelaunch/hardening-and-audit`; perubahan disimpan dalam draft PR, bukan di `main`.

Yang sudah tersedia pada kode: master produk/supplier, pembelian dan HPP rata-rata, retail, konsinyasi/distributor, approval laporan penjualan dan pembayaran, pembayaran supplier, pengeluaran, retur, stock opname/opening/adjustment, kas-modal-prive-transfer, COA/jurnal manual, penguncian periode, neraca saldo, neraca, dashboard inventory/profit, aging piutang, histori harga, kartu stok per lokasi dengan print/PDF, badge pending approval, reset password distributor, audit log, CSV aging.

Yang masih belum disertifikasi: CI pada commit terbaru sedang berjalan; skema TiDB aktual belum dibandingkan penuh; integration/concurrency/acceptance tests belum dilakukan; cash drawer/shift physical reconciliation dan investor report drill-down belum lengkap; backup/restore dan deployment belum disiapkan. Jangan posting transaksi riil.

## Teknologi

- Frontend: React + TypeScript + Vite
- Backend: Node.js + Express + TypeScript
- Database: TiDB Cloud (MySQL-compatible), driver mysql2
- Validasi API: Zod

## Persyaratan lokal

- Node.js 20+
- npm
- TiDB Cloud dengan akses TLS pada environment production

## Menjalankan development

1. Backend: `cd server`, salin `.env.example` ke `.env`, isi kredensial database dan secret, lalu `npm install` dan `npm run dev`.
2. Frontend: `cd client`, `npm install`, `npm run dev`.
3. Jangan commit `.env`, password, connection string, atau token.

## Migrasi database

Periksa dan backup DB terlebih dahulu. Belum menjalankan migrasi apa pun. Sebelum SQL dieksekusi, gunakan `docs/TIDB_PREFLIGHT_AUDIT.sql` (read-only), audit urutan/duplikasi prefix di `docs/TIDB_MIGRATION_ORDER_REVIEW.md`, dan handoff gate `docs/TIDB_MIGRATION_AUDIT_HANDOFF.md`. SQL final harus dibuat conditional terhadap schema aktual.

## Keamanan

- Login menggunakan password hash scrypt, token HMAC, sesi database yang dapat dicabut, dan pemeriksaan status akun pada request terautentikasi.
- Login dan setup owner memiliki throttling dasar per-process; production multi-instance masih perlu edge/WAF rate limit.
- Production mewajibkan `DB_SSL=true`, `AUTH_TOKEN_SECRET` minimal 32 karakter, dan `OWNER_SETUP_KEY` minimal 32 karakter saat setup owner aktif. Setelah owner dibuat, set `OWNER_SETUP_ENABLED=false` lalu hapus `OWNER_SETUP_KEY`.
- Batasi akses database berdasarkan IP dan gunakan backup yang dapat diuji restore.

## Gate sebelum penggunaan

1. Skema DB dan migrasi diverifikasi; backup tersedia.
2. Build/typecheck/lint dan tes regresi lulus.
3. Acceptance tests stok, HPP, retur, piutang/utang, kas, jurnal, role, dan sesi lulus.
4. Backup/restore, deployment secrets, monitoring, dan rollback plan diuji.
5. Review PR selesai; merge/deploy hanya setelah seluruh gate terpenuhi.

PR hardening: https://github.com/alimasum243-wq/sparepart-management/pull/3
