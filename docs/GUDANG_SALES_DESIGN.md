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



## Visibilitas stok sales per produk (kriteria wajib operasional)
- Dashboard pemilik/admin wajib menampilkan daftar stok yang sedang dikuasai setiap sales, bukan hanya satu angka total nilai stok.
- Untuk setiap sales, tampilkan per produk: SKU/kode, nama barang, satuan, kuantitas tersedia (pcs/unit), HPP per unit, dan total nilai stok (qty × HPP).
- Sales yang login wajib memiliki halaman "Stok Saya" yang hanya menampilkan stok pada lokasi titipan miliknya sendiri, dengan SKU/kode, nama barang, satuan, kuantitas tersedia, harga/nilai yang diizinkan, dan total nilai stok sesuai kebijakan akses.
- Sales dapat melihat barang apa yang tersedia dan jumlahnya tanpa dapat mengubah stok secara langsung. Perubahan hanya melalui dokumen penyerahan, penjualan, retur penjualan, retur stok ke gudang, dan penyesuaian yang disetujui admin.
- Sediakan riwayat pergerakan per produk: saldo awal, barang diterima, barang terjual, retur pelanggan, barang dikembalikan ke gudang, penyesuaian, dan saldo akhir.
- Pemilik dapat memilih satu sales untuk melihat rinciannya, atau melihat gabungan seluruh sales. Sediakan pencarian SKU/nama barang dan filter tanggal untuk riwayat.
- Kuantitas tersedia dihitung dari mutasi stok yang sah pada lokasi sales, bukan dari angka total nilai atau input saldo manual.
- Nilai stok menggunakan snapshot HPP/method biaya persediaan yang konsisten dengan sistem; jumlah stok dan nilai harus dapat direkonsiliasi ke stock_movements.
- Kriteria penerimaan: admin dapat melihat setiap produk dan qty di lokasi setiap sales; sales dapat melihat daftar dan qty stok miliknya sendiri; kedua tampilan menampilkan nilai sesuai hak akses; data satu sales tidak dapat dibaca sales lain.

## Nota penyerahan stok dan ekspor
- Setiap penyimpanan transfer ke sales otomatis menghasilkan nomor dokumen unik dan tampilan nota penyerahan barang yang rapi, bukan sekadar tabel stok.
- Nota dapat dibuka kembali dari riwayat transaksi, dicetak, atau diekspor sebagai PDF untuk dikirim kepada sales melalui WhatsApp.
- Nota PDF memuat identitas usaha, nomor dokumen, tanggal/jam, nama sales, asal dan tujuan gudang, daftar SKU/nama barang/satuan/qty, total kuantitas, catatan, serta kolom tanda tangan pihak yang menyerahkan dan menerima.
- Nota yang diberikan kepada sales berfungsi sebagai bukti jumlah barang yang diterima. Nilai HPP dan nilai persediaan tetap tersedia pada tampilan/ekspor internal admin, tetapi tidak wajib dicantumkan pada salinan sales.
- Sediakan ekspor CSV untuk kebutuhan administrasi/Excel. CSV internal memuat nomor dokumen, tanggal, sales, kode/nama barang, satuan, qty, HPP snapshot, dan total HPP per item.
- PDF adalah format utama untuk cetak/kirim ke sales; CSV adalah format data untuk pengolahan internal. Keduanya berasal dari dokumen transaksi yang sama agar tidak ada input ulang.
- Dokumen yang sudah disimpan tidak boleh berubah ketika harga/HPP master berubah. Reprint dan ekspor ulang harus memakai snapshot transaksi yang tersimpan.




## Identitas visual Sparepart Enzonic
- Gunakan logo horizontal (emblem + tulisan SPAREPART ENZONIC) pada header/sidebar desktop dan halaman portal distributor.
- Gunakan logo versi vertikal pada halaman login dan sampul laporan/nota PDF bila ruangnya sesuai.
- Gunakan ikon simplified sebagai favicon, ikon aplikasi, dan penanda kecil di navigasi; ikon app alternatif hanya digunakan bila terbaca jelas pada ukuran kecil.
- Hilangkan placeholder teks "HU" pada seluruh brand-mark dan ganti dengan aset logo resmi dari gambar referensi pemilik.
- Terapkan palet konsisten dari logo: navy gelap sebagai warna utama, oranye api sebagai aksen, putih/abu sangat muda sebagai latar; gunakan tipografi bersih dan jarak antarkomponen yang lebih lega.
- Perbarui tampilan login, sidebar, dashboard, halaman distributor, dan header laporan agar satu sistem visual. Pertahankan fungsi, alur, dan data transaksi yang sudah ada.
- Logo harus disediakan sebagai aset file di client/public/brand, bukan dipotong ulang dari screenshot saat aplikasi berjalan. Siapkan ukuran/format yang tajam dan transparan bila sumber aset memungkinkan.

## Login, akun, dan keamanan akses (wajib sebelum rilis)
- Login memakai email atau nomor telepon terdaftar, bukan username. Minimal satu kontak harus terdaftar dan terverifikasi; satu email/nomor telepon hanya boleh terikat ke satu akun.
- Peran akun: OWNER/ADMIN untuk pengelolaan sistem dan DISTRIBUTOR untuk akses terbatas sesuai haknya. OWNER membuat dan mengelola akun distributor.
- Password disimpan sebagai hash scrypt; jangan pernah menyimpan atau menampilkan password asli.
- Sesi menggunakan token bertanda tangan HMAC dengan masa berlaku 12 jam. Sediakan endpoint untuk login, membaca identitas/sesi aktif (/api/auth/me), dan logout/pengakhiran sesi bila arsitektur mendukung.
- Seluruh endpoint operasional/admin wajib memeriksa autentikasi dan otorisasi. Token DISTRIBUTOR tidak boleh mengakses endpoint admin (balas 403) dan hanya boleh melihat data distributor_id miliknya sendiri; distributor_id harus diambil dari token/sesi, bukan dipercaya dari input klien.
- Data HPP/harga modal dan informasi keuangan internal hanya boleh diakses OWNER/ADMIN yang berwenang; jangan bocorkan melalui endpoint distributor, termasuk dalam respons detail, ekspor, atau laporan.
- Sediakan fitur ganti password untuk pengguna yang sudah login.
- Sediakan lupa password melalui OTP ke email atau nomor telepon yang terdaftar. OTP harus memiliki masa kedaluwarsa, hanya dapat dipakai sekali, memiliki pembatasan percobaan/pengiriman, disimpan dengan aman, dan tidak pernah ditulis ke log.
- Audit implementasi autentikasi backend, proteksi seluruh endpoint lama, pembatasan data per distributor, dan penyembunyian HPP. Jangan menganggap login selesai hanya karena halaman login tampil.
- Uji minimal: login benar/salah, akun nonaktif, sesi kedaluwarsa, akses tanpa token (401), DISTRIBUTOR ke endpoint admin (403), distributor mencoba membaca data distributor lain (ditolak), OWNER/ADMIN mengakses sesuai izin, ganti password, dan OTP kedaluwarsa/terpakai ulang/rate limit.
- Modul Gudang Sales tetap dioperasikan admin/pemilik; tidak perlu membuat akun sales terpisah untuk input transaksi penyerahan, penjualan, retur, atau setoran.

## Laporan cetak untuk pemodal
- Sediakan menu Laporan Pemodal yang dapat difilter berdasarkan periode tanggal dan diekspor ke PDF siap cetak/kirim; CSV juga tersedia untuk olah data.
- Laporan menampilkan ringkasan pembelian dari pabrik, nilai persediaan gudang utama, nilai persediaan yang masih dibawa sales (berdasarkan HPP), penjualan bersih, setoran terverifikasi, dan saldo penjualan yang belum disetor.
- Sertakan rincian per sales: stok awal, penyerahan barang, retur stok ke gudang, stok akhir, penjualan, retur penjualan, setoran, dan saldo belum disetor.
- Tampilkan rekonsiliasi total: stok awal + pembelian + retur dari sales - penyerahan ke sales - barang keluar lainnya = stok akhir, dengan penyesuaian yang dijelaskan; serta penjualan bersih - setoran terverifikasi = saldo belum disetor.
- Pisahkan dengan tegas nilai persediaan (aset/barang perusahaan) dari saldo penjualan belum disetor (tagihan/kewajiban setoran sales). Jangan menjumlahkan keduanya sebagai satu jenis piutang.
- Cantumkan periode laporan, waktu cetak, nomor halaman, identitas usaha, dan catatan sumber data. Sediakan kolom tanda tangan pengelola dan pemodal.
- Laporan hanya berisi transaksi berstatus disetujui/terverifikasi; transaksi draft atau dibatalkan tidak ikut dihitung. Koreksi setelah tutup periode harus terlihat sebagai penyesuaian, bukan mengubah laporan historis diam-diam.
- Data laporan diambil dari transaksi dan mutasi stok yang sama dengan operasional; jangan membuat angka laporan yang diinput ulang secara manual.

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