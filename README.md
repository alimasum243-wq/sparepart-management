# Sparepart Management System

Fondasi aplikasi manajemen usaha sparepart: React + TypeScript + Vite, Express + TypeScript, dan TiDB/MySQL.

## Status saat ini

**BELUM SIAP untuk transaksi riil.** Audit dan hardening berlangsung di branch `prelaunch/hardening-and-audit`; perubahan berada dalam draft PR, belum merge/deploy.

### Status kesiapan
- Database dan migrasi 019–024: **user melaporkan 100% selesai**. Assistant tidak terkoneksi langsung ke database dan belum memverifikasi hasil secara independen.
- Audit kode kritis dan hardening: ditinjau/diimplementasikan di branch; respons error database/internal disanitasi pada route transaksi yang diaudit, dan indikator koneksi UI memeriksa API serta database.
- CI/build/typecheck: ada bukti lulus pada commit sebelumnya; status commit terbaru harus dikonfirmasi kembali.
- Integration/concurrency/security E2E, rekonsiliasi transaksi/GL, backup-restore, dan UAT: belum dibuktikan.
- Cashier/drawer/shift attribution, investor report drill-down terpadu, beberapa slip PDF/print, dan fitur rekonsiliasi bank eksternal masih memiliki gap.

Jangan posting transaksi riil sampai seluruh gate pada `docs/PRODUCTION_READINESS_EXECUTION_PLAN.md` selesai dan disetujui.

Yang sudah tersedia pada kode: master produk/supplier, pembelian dan HPP rata-rata, retail, konsinyasi/distributor, approval laporan penjualan dan pembayaran, pembayaran supplier, pengeluaran, retur, stock opname/opening/adjustment, kas-modal-prive-transfer, sesi rekonsiliasi kas/bank fisik (expected vs counted, selisih tanpa auto-jurnal), COA/jurnal manual, penguncian periode, neraca saldo, neraca, dashboard inventory/profit, aging piutang, histori harga, kartu stok per lokasi dengan print/PDF, badge pending approval, reset password distributor, audit log, dan beberapa CSV/PDF/print.

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
2. Frontend: `cd client`, `npm install`, lalu `npm run dev`.
3. Jangan commit `.env`, password, connection string, atau token.

## Migrasi database
Migrasi 019–024 telah dijalankan menurut laporan pengguna. Jangan menjalankan ulang migrasi tanpa meninjau sifat rerun/duplikasi dan schema aktual. Audit SQL selanjutnya bersifat pemeriksaan/read-only dan disusun dalam `docs/TIDB_MIGRATION_AUDIT_HANDOFF.md`, `docs/TIDB_PREFLIGHT_AUDIT.sql`, `docs/TIDB_MIGRATION_ORDER_REVIEW.md`, dan `docs/TIDB_MIGRATION_STATEMENT_REVIEW.md`. Assistant tidak mengakses atau mengubah database.

## Keamanan
- Login menggunakan password hash scrypt, token HMAC, sesi database yang dapat dicabut, dan pemeriksaan status akun pada request terautentikasi.
- Login/setup owner memiliki throttling dasar per-process; production multi-instance masih perlu edge/WAF rate limit.
- Production mewajibkan `DB_SSL=true`, `AUTH_TOKEN_SECRET` minimal 32 karakter, dan `OWNER_SETUP_KEY` minimal 32 karakter saat setup owner aktif. Setelah owner dibuat, set `OWNER_SETUP_ENABLED=false` lalu hapus `OWNER_SETUP_KEY`.
- Batasi akses database berdasarkan IP dan gunakan backup yang dapat diuji restore.

## Gate sebelum penggunaan
1. CI lulus pada commit final yang tepat.
2. Integration/concurrency tests lulus pada TiDB test environment terisolasi.
3. Transaksi, stok, subledger, GL, laporan, dan ekspor direkonsiliasi.
4. Security/IDOR, backup-restore, deployment secrets, monitoring, TLS/CORS/cookies, dan rollback diuji.
5. Owner dan distributor UAT pada desktop/mobile selesai dan bukti disimpan.
6. Gap fitur kritis ditutup atau risiko diterima secara tertulis.
7. Review PR selesai; merge/deploy hanya setelah seluruh gate terpenuhi.

PR hardening: https://github.com/alimasum243-wq/sparepart-management/pull/3
