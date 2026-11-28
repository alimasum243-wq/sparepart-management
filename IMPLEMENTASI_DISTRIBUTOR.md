# Implementasi Login Distributor, Konsinyasi, Verifikasi, dan Laba-Rugi

## Isi perubahan

- Login akun dengan password hash scrypt dan token HMAC (masa sesi 12 jam) yang terikat pada sesi database; logout mencabut sesi dan perubahan status akun langsung membatalkan akses.
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

## Penting sebelum digunakan

Ini adalah implementasi tahap integrasi awal, **belum dinyatakan siap produksi**. Instalasi dependency dan build belum dapat diverifikasi di lingkungan penyusunan paket ini karena unduhan npm tidak berhasil. Jalankan build pada komputer proyek sebelum dipakai. Jangan memasukkan transaksi riil sebelum uji penerimaan di bawah lulus.

Bukti pembayaran saat ini disimpan sebagai nomor referensi atau tautan, belum unggah file gambar langsung. Alur retur sudah tersedia tetapi retur pembelian/distributor yang melebihi saldo utang/piutang yang masih terbuka diblokir; refund untuk transaksi yang telah lunas belum tersedia. Backup terjadwal dan pemulihan akun masih tahap berikutnya.

## Urutan migrasi database

1. Backup database TiDB terlebih dahulu.
2. Periksa skema semua tabel yang sudah ada (`SHOW CREATE TABLE`): `suppliers`, `distributors`, `products`, `stock_locations`, `stock_movements`, `supplier_payments`, dan tabel lain jika sudah dibuat sebelumnya. Jangan menebak dan jangan menghapus/membangun ulang tabel yang sudah ada.
3. Jalankan `server/migrations/001_application_foundation.sql` satu statement per eksekusi. Migration membuat tabel fondasi yang belum ada dan menambahkan kolom `stock_movements.created_by_user_id` yang diperlukan backend. Tabel yang sudah ada tidak akan dibangun ulang; cocokkan strukturnya sebelum lanjut.
   Preflight faktur: `SELECT supplier_id,supplier_invoice_no,COUNT(*) FROM purchases WHERE supplier_invoice_no IS NOT NULL GROUP BY supplier_id,supplier_invoice_no HAVING COUNT(*)>1;` (termasuk string kosong). Jika hasil ada, jangan lanjut sampai duplikat ditinjau.
4. Jalankan `server/migrations/003_distributor_accounting.sql` satu statement setiap kali. Periksa skema sebelum menjalankan ALTER yang mungkin sudah ada.
5. Jalankan `server/migrations/004_user_login_identifiers.sql`; sebelum unique index, periksa username/email/phone duplikat. Preflight: `SELECT username,COUNT(*) FROM users WHERE username IS NOT NULL GROUP BY username HAVING COUNT(*)>1;`, `SELECT LOWER(TRIM(email)),COUNT(*) FROM users WHERE email IS NOT NULL AND TRIM(email)<>'' GROUP BY LOWER(TRIM(email)) HAVING COUNT(*)>1;`, dan `SELECT TRIM(phone),COUNT(*) FROM users WHERE phone IS NOT NULL AND TRIM(phone)<>'' GROUP BY TRIM(phone) HAVING COUNT(*)>1;`. Jika ada hasil, jangan lanjut sampai ditangani.
6. Jalankan `server/migrations/004_cost_columns.sql`; kini memakai `ADD COLUMN IF NOT EXISTS`.
7. Jalankan `server/migrations/005_supplier_payment_allocations.sql`; menambahkan `supplier_payments.posted_at` dan memastikan tabel alokasi tersedia.
8. Jalankan `server/migrations/006_returns_history_reports.sql` satu statement setiap kali.
9. Jalankan `server/migrations/007_auth_sessions.sql` satu statement (sesi login dapat dicabut dan guard setup owner dibuat).
10. Verifikasi tabel `users`, `purchases`, `purchase_items`, `retail_sales`, `retail_sale_items`, `expenses`, `accounts`, `cash_accounts`, `journal_entries`, `journal_lines`, `opening_balances`, `auth_sessions`, `owner_setup_guard`, `consignment_deliveries`, `consignment_delivery_items`, `distributor_sales_reports`, `distributor_sales_report_items`, `distributor_payment_submissions`, `distributor_payment_allocations`, `supplier_payment_allocations`, `purchase_returns`, `purchase_return_items`, `retail_sale_returns`, `retail_sale_return_items`, `distributor_sales_returns`, dan `distributor_sales_return_items`; serta kolom `users.distributor_id`, `users.email`, `users.phone`, `products.last_purchase_cost`, `products.average_cost`, dan `stock_movements.created_by_user_id`.
11. Pastikan akun 1100, 1110, 1200, 1300, 2100, 3100, 3200, 4100, 5100, 6100 tersedia. Migration hanya menambahkan kode yang belum ada.

Tidak ada perintah DROP, TRUNCATE, atau penghapusan master data. Jangan menjalankan migrasi sebelum struktur DB aktual diperiksa dan backup tersedia. Karena tabel fondasi yang sudah ada tidak diubah oleh `CREATE TABLE IF NOT EXISTS`, struktur aktual tetap harus diverifikasi agar kompatibel dengan kode.

## Konfigurasi server

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

1. Login pemilik berhasil; password salah ditolak.
2. Buat dua distributor dengan dua akun berbeda.
3. Login Distributor A tidak dapat melihat stok atau laporan Distributor B.
4. Pemilik mengirim stok ke A; stok gudang turun dan stok titipan A naik. Tidak ada penjualan/piutang saat pengiriman.
5. A mengirim laporan penjualan; status SUBMITTED dan belum ada jurnal.
6. Pemilik menyetujui laporan; stok titipan turun dan jurnal Dr Piutang / Cr Penjualan serta Dr HPP / Cr Persediaan seimbang.
7. A mengirim pembayaran; status PENDING dan belum ada jurnal/kas masuk.
8. Pemilik memverifikasi; jurnal Dr Kas/Bank / Cr Piutang terbentuk.
9. Laba-rugi periode menampilkan pendapatan dan HPP dari jurnal penjualan yang disetujui serta beban yang dicatat.
10. Coba akses endpoint admin menggunakan token distributor; harus ditolak 403.

Catatan akuntansi: laporan laba-rugi hanya mencerminkan transaksi yang sudah dibukukan ke jurnal. Pastikan seluruh beban operasional dicatat dan pembelian yang belum dibayar tetap dianggap utang pemasok. Jangan mengartikan nominal pembayaran yang baru dilaporkan distributor sebagai kas masuk sebelum diverifikasi.

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
