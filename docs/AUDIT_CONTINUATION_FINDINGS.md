# Audit Lanjutan — Status Temuan dan Gap

Tanggal audit: 2026-11-28
Branch: `prelaunch/hardening-and-audit`
Database: `sparepart_db` (tidak diakses oleh auditor; status migrasi mengikuti konfirmasi pemilik)
Status gate: **BLOCKED — belum layak transaksi riil**

## Bukti dan batas pemeriksaan
- Pemeriksaan dilakukan secara statis terhadap source pada branch kerja; bukan runtime/deployment.
- File backend yang ditinjau: `server/src/index.ts`, `server/src/distributor.ts`, `server/src/db.ts`, `server/src/validation.ts`, dan test unit validation.
- Build/CI terdahulu dilaporkan lulus; status CI pada HEAD audit ini harus diperiksa ulang.
- Tidak ada transaksi online, rollback database, concurrency, atau akses lintas akun yang dijalankan. Tidak boleh dicatat sebagai PASS.
- Pemilik memilih melewati backup manual untuk tahap tes awal; restore tetap wajib sebelum produksi.

## Kontrol yang terlihat di source (static review)
- Parameter SQL untuk sebagian besar query memakai placeholder.
- Owner bootstrap dilindungi secret, rate limit dan guard transaksi database; akun hanya dibuat jika belum ada akun ber-password.
- Login memiliki rate limit, sesi database, cookie HttpOnly/SameSite, HMAC token, logout revoke, dan pemeriksaan ulang role/status akun.
- Distributor route memiliki pemeriksaan role dan banyak query dibatasi berdasarkan distributor ID dari identitas sesi.
- Operasi transaksi memakai transaksi SQL dan lock pada beberapa alur; kontrol ini belum membuktikan hasil benar di runtime/concurrency.

## Gap fitur yang diketahui — belum dianggap selesai
1. **Rekonsiliasi bank eksternal:** belum ditemukan endpoint/workflow dedicated untuk import statement, matching, unmatched items, dan selisih bank.
2. **Klaim kekurangan stok distributor:** belum ditemukan workflow formal klaim/inspeksi kekurangan, bukti, keputusan owner, serta posting penyesuaian yang traceable.
3. **Drill-down investor:** laporan kontribusi channel/analitik tersedia sebagian; belum terbukti ada satu laporan investor yang drill-down dari angka agregat ke transaksi, biaya alokasi, HPP historis, dan jurnal.
4. **Opening balance:** perlu runtime test untuk memastikan guard duplikasi, tanggal/sumber, pengelompokan per lokasi, dan rekonsiliasi ke neraca saldo.
5. **Print/PDF dan reprint:** sebagian history/print audit tersedia; perlu audit coverage seluruh tipe nota, tata letak mobile/desktop, total, status, dan audit reprint.
6. **Cash drawer/shift:** sesi kas ada di source; perlu tes penutupan, hitung fisik, variance, cancellation, dan sumber transaksi.
7. **Security runtime:** IDOR, role matrix, CSRF/cookie behavior, rate limit lintas instance, dan akses data distributor lain belum diuji.
8. **Transaction integrity:** atomicity, duplicate approvals, retry, concurrency, moving-average cost, return cost, dan rounding belum diuji dengan database.
9. **Backup/recovery:** backup dan restore isolated belum dibuktikan.

## Next steps
- Re-check CI/build/typecheck/test on exact branch head.
- Close code gaps 1–3 by designing migrations/API/UI and tests; do not invent DB schema or claim SQL is ready before schema review.
- Conduct runtime tests only with clearly synthetic records, owner approval, and read-only reconciliation. No destructive cleanup.
- Any code changes must remain in the audit branch and PR; no merge/deploy without explicit approval.

## Evidence ledger (current)
| Area | Status |
|---|---|
| Static review of auth/session patterns | REVIEWED; runtime NOT RUN |
| SQL parameterization | REVIEWED PARTIALLY; not full route-by-route certification |
| Distributor isolation | REVIEWED PARTIALLY; IDOR runtime NOT RUN |
| Transaction rollback | NOT RUN |
| Duplicate posting/idempotency | NOT RUN |
| Concurrency/oversell | NOT RUN |
| Bank reconciliation | GAP |
| Shortage claim/inspection workflow | GAP |
| Investor report drill-down | GAP |
| Backup restore | NOT RUN (user elected skip for initial testing) |
| Production approval | BLOCKED |
