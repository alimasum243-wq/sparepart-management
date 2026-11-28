# Implementasi Login Distributor, Konsinyasi, Verifikasi, dan Laba-Rugi

## Isi perubahan

- Login akun dengan password hash scrypt dan token HMAC (masa sesi 12 jam) yang terikat pada sesi database; logout mencabut sesi dan perubahan status akun langsung membatalkan akses. Login/logout berhasil dicatat di audit log bersama sesi secara transactional. Owner dapat reset password distributor; semua sesi lama dicabut dan tindakan dicatat.
- Role `OWNER`/`ADMIN` dan `DISTRIBUTOR`.
- Setiap user distributor terikat pada satu `distributor_id`; endpoint portal mengambil ID tersebut dari token, bukan dari input browser.
- Pemilik membuat akun distributor dan lokasi stok titipannya.
- Pemilik mengirim barang sebagai konsinyasi. Pengiriman memindahkan lokasi stok dan tidak membukukan penjualan.
- Distributor melihat stok titipan sendiri, mengirim laporan penjualan, dan mengirim nominal/referensi bukti pembayaran.
- Laporan penjualan baru memengaruhi stok, piutang, pendapatan, HPP, dan jurnal setelah disetujui pemilik.
- Pembayaran baru mengurangi piutang dan menambah kas/bank setelah diverifikasi pemilik.
- Pembelian diposting sebagai persediaan terhadap utang pemasok; bukan dianggap lunas.
- Pengeluaran yang dicatat melalui endpoint pengeluaran membentuk jurnal beban terhadap kas/bank.
- Laba-rugi dihitung dari jurnal POSTED pada periode yang dipilih.
- Modul UI mobile-first untuk login, portal distributor, pengelolaan titipan/verifikasi, dan laba-rugi.
- Owner dashboard menampilkan nilai persediaan gudang dan titipan; navigasi menampilkan badge laporan penjualan menunggu approval serta pembayaran menunggu verifikasi.
- Neraca per tanggal (aset, kewajiban, ekuitas, laba berjalan kumulatif) dan cetak/PDF; laba berjalan belum ditutup ke akun laba ditahan.
- Kartu stok per produk/lokasi memiliki saldo awal, masuk/keluar, saldo berjalan, dan print-to-PDF.

## Penting sebelum digunakan

Ini adalah implementasi tahap integrasi awal, **belum dinyatakan siap produksi**. Instalasi dependency dan build belum dapat diverifikasi di lingkungan penyusunan paket ini karena unduhan npm tidak berhasil. Jalankan build pada komputer proyek sebelum dipakai. Jangan memasukkan transaksi riil sebelum uji penerimaan di bawah lulus.

Bukti pembayaran saat ini disimpan sebagai nomor referensi atau tautan, belum unggah file gambar langsung. Alur retur sudah tersedia tetapi retur pembelian/distributor yang melebihi saldo utang/piutang yang masih terbuka diblokir; refund untuk transaksi yang telah lunas belum tersedia. Backup terjadwal dan pemulihan akun masih tahap berikutnya.

## Urutan migrasi database

1. Backup database TiDB terlebih dahulu.
2. Periksa skema tabel yang sudah ada (`SHOW CREATE TABLE`): `users`, `products`, `suppliers`, `stock_locations`, `stock_movements`, `supplier_payments`, dan tabel lain. Jangan menghapus atau membangun ulang tabel/data.
3. Jalankan `server/migrations/001_application_foundation.sql` satu statement per eksekusi. Ini menyiapkan tabel fondasi yang belum ada dan menambahkan kolom stock movement yang diperlukan. Tabel lama tidak dibangun ulang; cocokkan strukturnya. Preflight faktur supplier: `SELECT supplier_id,LOWER(TRIM(supplier_invoice_no)),COUNT(*) FROM purchases WHERE supplier_invoice_no IS NOT NULL GROUP BY supplier_id,LOWER(TRIM(supplier_invoice_no)) HAVING COUNT(*)>1;` Tinjau hasil dan duplikat string kosong sebelum lanjut.
4. Jalankan `server/migrations/003_distributor_accounting.sql` satu statement setiap kali. Periksa `SHOW CREATE TABLE` sebelum menjalankan ALTER yang mungkin sudah terpasang.
5. Jalankan `server/migrations/004_user_login_identifiers.sql`; periksa duplikat username/email/phone sebelum unique indexes. Preflight: `SELECT LOWER(TRIM(username)),COUNT(*) FROM users WHERE username IS NOT NULL GROUP BY LOWER(TRIM(username)) HAVING COUNT(*)>1;` dan query duplikat email serta phone pada bagian ini. Jangan lanjut jika ada duplikat.
6. Jalankan `server/migrations/004_cost_columns.sql`.
7. Jalankan `server/migrations/005_supplier_payment_allocations.sql`.
8. Jalankan `server/migrations/006_returns_history_reports.sql` satu statement setiap kali. Periksa tabel/indeks yang sudah ada sebelum menjalankan indeks unique.
9. Jalankan `server/migrations/007_auth_sessions.sql` (tabel sesi database dan guard bootstrap pemilik).
10. Jalankan `server/migrations/008_inventory_adjustments.sql` (lokasi barang rusak, penyesuaian persediaan, akun 4900/6500).
11. Jalankan `server/migrations/009_cash_management.sql` (subledger kas/bank, cash transaction, dan kolom akun kas untuk transaksi).
12. Jalankan `server/migrations/010_receivables_price_history_periods.sql` (due date invoice, uang belum dialokasikan, histori harga, dan periode akuntansi). Sebelum unique index invoice, periksa duplikat: `SELECT invoice_code,COUNT(*) FROM distributor_sales_reports WHERE invoice_code IS NOT NULL GROUP BY invoice_code HAVING COUNT(*)>1;`
13. Jalankan `server/migrations/011_seed_products_min_stock.sql` (16 seed produk, supplier, minimum stok; SKU seed sementara dan retail price 0).
14. Jalankan `server/migrations/012_sales_audit_data_capture.sql` dan `013_audit_rule_settings.sql` (label area transparan dan ambang audit).\n15. Jalankan `server/migrations/014_retail_price_floor_audit.sql`; verifikasi kolom `retail_sale_items.retail_price_snapshot` dan `price_override_reason`.\n16. Verifikasi 16 seed products, supplier INDORAYA/UD ADI JUWANA, minimum stock. Owner finalisasi SKU/unit/retail price/min_stock. Verifikasi tabel `product_price_history`, `accounting_periods`, kolom `invoice_code`, `due_date`, `unapplied_amount`, tabel `accounting_period_guard`, dan akun 2200 serta akun COA yang dibutuhkan. Jalankan migration hanya setelah backup dan pemeriksaan struktur/duplikat.

Migration bersifat tambahan (additive); tidak dimaksudkan untuk menghapus transaksi/master. Jangan menjalankan semua statement sekaligus jika TiDB SQL editor menolak multi-statement. Bila error, berhenti dan kirim pesan error persisnya; jangan lanjut migration berikutnya.

## Konfigurasi server

Production: `AUTH_TOKEN_SECRET` wajib minimal 32 karakter, `DB_SSL=true`; saat bootstrap owner aktif, `OWNER_SETUP_KEY` wajib minimal 32 karakter. Setelah akun pemilik dibuat, set `OWNER_SETUP_ENABLED=false` dan hapus `OWNER_SETUP_KEY` agar endpoint bootstrap dinonaktifkan. Restart server setelah perubahan environment.


Tambahkan ke `server/.env` (jangan kirim file `.env` atau password ke siapa pun):

- `AUTH_TOKEN_SECRET`: secret acak minimal 64 karakter.
- `OWNER_SETUP_KEY`: kunci acak sementara untuk setup akun pemilik pertama.
- `CLIENT_ORIGIN`: origin frontend, misalnya `http://localhost:5173`. Untuk HP yang mengakses melalui Wi-Fi, tambahkan origin IP LAN komputer, dipisah koma.

Contoh membuat dua nilai acak di PowerShell:

```powershell
[guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
```

Gunakan hasil berbeda untuk kedua secret.

## Membuat akun pemilik pertama

Setelah server hidup, jalankan dari PowerShell (ganti URL jika port berbeda dan isi kunci yang sama dengan `OWNER_SETUP_KEY` di `.env`):

```powershell
$body = @{
  setup_key = 'ISI_KUNCI_SETUP'
  username = 'pemilik'
  full_name = 'Pemilik Usaha'
  password = 'GANTI_PASSWORD_MINIMAL_10_KARAKTER'
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'http://localhost:4000/api/auth/owner-setup' -ContentType 'application/json' -Body $body
```

Endpoint setup hanya berhasil bila belum ada akun login dengan password. Setelah akun pemilik berhasil dibuat, hapus `OWNER_SETUP_KEY` dari `.env` atau ganti nilainya dan restart server. Jangan membagikan password pemilik.

## Endpoint inti

- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/admin/distributors` — pemilik membuat distributor dan user login.
- `POST /api/admin/consignments` — pemilik mengirim barang titipan.
- `GET /api/distributor/stock` — stok milik distributor yang sedang login.
- `POST /api/distributor/sales-reports` — distributor mengirim laporan.
- `GET /api/admin/sales-reports`, `POST /api/admin/sales-reports/:id/approve`, dan `POST /api/admin/sales-reports/:id/reject` (alasan penolakan wajib diisi).
- `POST /api/distributor/payments` — kirim laporan pembayaran.
- `GET /api/admin/payments`, `POST /api/admin/payments/:id/verify`, `POST /api/admin/payments/:id/reject`.
- `GET /api/admin/reports/profit-loss?from=YYYY-MM-DD&to=YYYY-MM-DD`.
- `POST /api/expenses` — pengeluaran usaha dengan jurnal.

Semua endpoint operasional lama (termasuk pembelian) kini memerlukan token pemilik. Portal distributor tidak menerima parameter distributor_id dari browser untuk menentukan cakupan datanya.

## Uji penerimaan wajib

1. API bisnis tanpa token harus 401; token distributor pada endpoint owner harus 403; owner pada endpoint distributor harus ditolak.
2. Login pemilik berhasil; password salah ditolak; username/email/phone login diuji; login/setup throttling diuji.
3. Logout mencabut sesi; token yang sama tidak bisa dipakai lagi. Akun nonaktif/role berubah harus langsung ditolak.
4. Owner setup hanya berhasil sekali, termasuk dua request bootstrap bersamaan.
5. Buat dua distributor dengan dua akun berbeda.
6. Login Distributor A tidak dapat melihat stok, laporan, atau pembayaran Distributor B.
7. Pemilik mengirim stok ke A; stok gudang turun dan stok titipan A naik. Tidak ada penjualan/piutang saat pengiriman.
8. A mengirim laporan penjualan; status SUBMITTED dan belum ada jurnal. Laporan reservasi stok; laporan kedua tidak dapat menjual stok yang sama.
9. Pemilik membuka rincian barang sebelum menyetujui. Approval mengurangi stok titipan dan membuat jurnal Dr Piutang / Cr Penjualan serta Dr HPP / Cr Persediaan seimbang.
10. A mengirim pembayaran; status PENDING dan belum ada jurnal/kas masuk. Pending payment mengurangi batas laporan pembayaran berikutnya.
11. Pemilik memverifikasi; jurnal Dr Kas/Bank / Cr Piutang terbentuk. Pembayaran ditolak harus menyimpan alasan dan audit log.
12. Pembelian, retail, supplier payment, pengeluaran, retur diuji; cek stok, HPP, utang/piutang, jurnal debit=credit, audit log, dan rollback jika gagal. Retail: harga master otomatis terisi, harga transaksi di bawah harga retail tanpa alasan >=10 karakter harus ditolak server, dan override dengan alasan tersimpan pada snapshot serta audit log.
13. Retur pembelian/distributor yang melebihi saldo terbuka harus ditolak (refund transaksi lunas belum tersedia). Retur retail mengembalikan kas, stok, dan HPP.
14. Kirim request transaksi bersamaan untuk produk/supplier/distributor yang sama; tidak boleh saldo/stock oversold, double payment, atau negative balance.
15. Laba-rugi periode menampilkan transaksi jurnal. Bandingkan dengan jurnal detail dan rekonsiliasi kas/bank. Balance sheet/manual journal/rekonsiliasi otomatis masih harus diverifikasi di aplikasi dan diuji.
16. Stock opname, loss, damage, write-off dibuat draft; posting owner, stok tidak minus, movement dan jurnal loss/gain seimbang; cancel draft tidak mengubah saldo.
17. Setoran modal, prive, dan transfer kas/bank diuji: modal Dr Kas/Bank Cr Modal; prive Dr Prive Cr Kas/Bank; transfer antar akun tidak masuk P&L dan tidak membuat saldo negatif. Pembelian tunai/bank, pengeluaran, supplier payment, retail sale, dan pembayaran distributor memakai akun kas/bank yang dipilih.
18. Invoice due date, aging, unapplied receipt, price history, dan periode akuntansi diuji; transaksi tanggal periode tertutup harus ditolak.
19. Migration 001/003/004/005/006/007/008/009/010/011/012/013/014 diuji pada salinan DB; ulangi migration idempotent yang memang dirancang repeatable, verifikasi tanpa kehilangan data.

Catatan: Laporan laba-rugi hanya mencerminkan transaksi yang sudah dibukukan ke jurnal. Pastikan seluruh beban operasional dicatat dan pembelian yang belum dibayar tetap dianggap utang pemasok. Jangan mengartikan pembayaran distributor yang baru dilaporkan sebagai kas masuk sebelum diverifikasi.

## Standar transaksi, pembulatan, dan koreksi
- Mata uang sistem: IDR (Rupiah).
- Nilai uang: DECIMAL, bukan FLOAT/DOUBLE; batas transaksi 2 desimal.
- Kuantitas: DECIMAL(15,3).
- Total transaksi berasal dari detail; jangan memakai angka tampilan frontend sebagai sumber kebenaran.
- POSTED tidak boleh diedit/hapus langsung. Gunakan retur/reversal/koreksi dan catat transaksi asal, alasan, pengguna, dan waktu.

## Build dan deployment gate
Wajib lulus sebelum staging/production:
```text
npm run lint
npm run typecheck
npm run build
```
Root build menjalankan install dependency, quality gate, TypeScript check, backend tsc, dan Vite build. Script lint saat ini adalah static type gate (ESLint belum dipasang).
Production wajib `DB_SSL=true`. Jangan commit `server/.env`; simpan password dan secret di environment/secret manager.


## Login dengan username, email, atau nomor telepon

- Form login menerima satu identitas: username, email, atau nomor telepon, beserta password.
- Email dicocokkan tanpa membedakan huruf besar/kecil; nomor telepon dicocokkan sesuai format yang tersimpan.
- Akun lama tetap dapat masuk menggunakan username. Email dan nomor telepon bersifat opsional sampai diisi pada tabel `users`.
- Jalankan `server/migrations/004_user_login_identifiers.sql` satu kali pada TiDB sebelum deploy versi ini. Migration menambahkan kolom email/phone nullable dan indeks unik agar identitas tidak dipakai dua akun.
- Saat membuat akun distributor baru, nomor telepon dan email (jika disediakan) disalin ke akun login.
- Jangan mengisi email/nomor telepon yang sama pada dua akun.
- Logo final belum dipasang; tampilan teks SPAREPART ENZONIC dipertahankan sementara menunggu file logo resmi dari pemilik.
