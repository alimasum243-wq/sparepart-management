# Gudang Sales — Desain Implementasi

## Keputusan operasional
- Setoran sales fleksibel: satu sales boleh menyetor berkali-kali dan kapan saja.
- Semua transaksi sales diinput admin/pemilik. Sales tidak diberi akun login pada tahap ini.
- Tidak menggunakan pelanggan umum maupun data pelanggan per sales. Penjualan dicatat langsung atas sales, tanggal, dan item/qty; pelanggan bukan dimensi wajib transaksi.
- Setiap sales mempunyai lokasi stok sendiri (menggunakan pola lokasi DISTRIBUTOR yang sudah ada).
- Barang yang dititipkan ke lokasi sales tetap menjadi persediaan perusahaan; transfer gudang utama ke sales bukan penjualan dan tidak membentuk piutang.

## Alur transaksi
1. Pembelian pabrik -> stok masuk Gudang Utama, utang pemasok/jurnal pembelian tetap berjalan.
2. Transfer Gudang Utama -> Gudang Sales -> stok gudang utama turun, stok sales naik. Simpan HPP snapshot per item.
3. Penjualan sales -> admin memilih sales dan mencatat tanggal serta item/qty tanpa memilih atau membuat pelanggan. Sistem memvalidasi stok di gudang sales, mengurangi stok sales, membentuk pendapatan, HPP, dan saldo setoran.
4. Retur penjualan -> catat terhadap transaksi penjualan sales asal, tambah stok sales jika barang kembali layak jual, dan kurangi nilai penjualan/setoran terutang.
5. Retur barang tidak terjual ke gudang utama -> transfer balik, bukan retur penjualan dan bukan pengurang piutang.
6. Setoran sales -> admin mencatat kas/bank, tanggal fleksibel dan alokasi ke saldo sales. Setoran tidak boleh melebihi saldo belum disetor.
7. Rekonsiliasi -> saldo belum disetor = penjualan disetujui - retur penjualan - setoran terverifikasi. Nilai stok sales dihitung terpisah dari qty tersisa x HPP.

## Model data yang disarankan
Gunakan entitas distributor dan lokasi konsinyasi yang sudah ada sebagai identitas sales agar tidak menggandakan master data.
- Tambahkan tipe aktivitas/label SALES pada master distributor atau gunakan kolom partner_type dengan default DISTRIBUTOR setelah audit skema aktual.
- Gunakan consignment_deliveries dan consignment_delivery_items untuk transfer keluar gudang utama.
- Gunakan distributor_sales_reports dan item-nya untuk pencatatan penjualan admin. Jangan mewajibkan customer_id, membuat akun Pelanggan Umum, atau membuat master pelanggan untuk proses ini. Jika skema transaksi saat ini mewajibkan relasi pelanggan, audit dulu dan ubah menjadi opsional secara aman.
- Gunakan distributor_sales_returns untuk retur penjualan; jangan samakan dengan transfer barang tidak terjual kembali ke gudang.
- Gunakan distributor_payment_submissions/payment allocations atau tabel setoran sales khusus setelah audit skema; pembayaran harus tercatat ke cash_accounts dan jurnal.
- Semua perubahan stok menggunakan stock_movements; jangan update saldo stok langsung.

## Layar admin
1. Gudang Sales: daftar sales, stok per produk, total nilai HPP barang dibawa.
2. Transfer Barang: gudang asal, sales tujuan, tanggal, banyak item, validasi stok.
3. Input Penjualan Sales: pilih sales, tanggal, item/qty; tanpa pemilihan pelanggan; harga snapshot mengikuti harga distributor dan dapat diubah hanya dengan izin.
4. Retur Penjualan: pilih sales dan penjualan asal, item/qty, alasan.
5. Retur Stok ke Gudang: transfer barang tidak terjual dari sales ke gudang utama.
6. Setoran Sales: pilih sales, tanggal, metode, akun kas/bank, nominal; fleksibel dan dapat dicicil.
7. Rekonsiliasi: nilai barang yang dibawa, nilai penjualan, retur, setoran, dan saldo belum disetor.
8. Laporan Pembelian Pabrik vs Setoran: pembelian pabrik, penjualan sales, retur, setoran, stok di sales, saldo belum disetor.

## Rumus kontrol
- Stok sales (qty) = seluruh mutasi masuk lokasi sales - seluruh mutasi keluar lokasi sales.
- Nilai stok sales = SUM(stok qty per SKU x HPP tersimpan/biaya rata-rata yang konsisten).
- Penjualan bersih sales = penjualan disetujui - retur penjualan disetujui.
- Belum disetor = penjualan bersih - setoran terverifikasi.
- Total barang dalam penguasaan sales tidak sama dengan piutang setoran. Keduanya wajib ditampilkan terpisah.
- Setoran fleksibel boleh lebih dari satu kali, tetapi total alokasi tidak boleh melampaui saldo belum disetor.
- Barang rusak/hilang memerlukan transaksi penyesuaian khusus dan persetujuan pemilik; jangan dicatat sebagai penjualan.

## Tahapan pengerjaan
A. Audit skema database aktual dan endpoint konsinyasi/pembayaran yang ada.
B. Tambah API admin untuk ringkasan gudang sales, transfer balik, input penjualan admin, dan setoran langsung.
C. Tambah halaman Gudang Sales dan Rekonsiliasi pada React.
D. Tambah laporan per sales dan ringkasan pembelian pabrik vs setoran.
E. Build/typecheck, uji dengan data simulasi/transaction rollback; jangan menyentuh data produksi nyata.
F. Merge dan deployment setelah migrasi serta hasil pengujian disetujui.

## Batasan keselamatan
Jangan jalankan migrasi yang menebak kolom tabel produksi. Sebelum migration, cocokkan DESCRIBE untuk tabel terkait. Jangan pernah mengubah stok secara langsung tanpa stock_movements dan jurnal terkait.