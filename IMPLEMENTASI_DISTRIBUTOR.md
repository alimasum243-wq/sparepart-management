# Implementasi Login Distributor, Konsinyasi, Verifikasi, dan Laba-Rugi

## Isi perubahan

- Login akun dengan password hash scrypt dan token bertanda tangan HMAC (masa sesi 12 jam).
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

Bukti pembayaran saat ini disimpan sebagai nomor referensi atau tautan, belum unggah file gambar langsung. Modul pengembalian barang, alokasi pembayaran ke faktur individual, pembayaran utang supplier, backup terjadwal, dan pemulihan akun masih tahap berikutnya.

## Urutan migrasi database

1. Backup database TiDB terlebih dahulu.
2. Pastikan `accounts`, `users`, `audit_logs`, `cash_accounts`, `journal_entries`, `journal_lines`, `opening_balances` dan tabel lama yang disebut di proyek memang tersedia.
3. Buka `server/migrations/003_distributor_accounting.sql`.
4. Jalankan **satu statement SQL setiap kali** di TiDB SQL Editor, dari atas ke bawah. Tunggu `Query OK` setiap kali. Jangan jalankan seluruh file sekaligus. Jika `ALTER TABLE users ADD COLUMN distributor_id` memberi pesan kolom sudah ada, hentikan dan periksa skema sebelum lanjut.
5. Jalankan `server/migrations/004_cost_columns.sql` satu statement setiap kali. CSV skema terakhir menunjukkan dua kolom biaya ini belum ada.
6. Verifikasi tabel `consignment_deliveries`, `consignment_delivery_items`, `distributor_sales_reports`, `distributor_sales_report_items`, `distributor_payment_submissions`, `distributor_payment_allocations` sudah ada; `users.distributor_id`, `products.last_purchase_cost`, dan `products.average_cost` juga sudah ada.
7. Pastikan akun 1100, 1110, 1200, 1300, 2100, 3100, 3200, 4100, 5100, 6100 tersedia. Migration hanya memasukkan kode yang belum ada.

Tidak ada perintah DROP, TRUNCATE, atau penghapusan master data pada migrasi ini.

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
- `GET /api/admin/sales-reports` dan `POST /api/admin/sales-reports/:id/approve`.
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
