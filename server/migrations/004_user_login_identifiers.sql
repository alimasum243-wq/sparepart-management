-- MIGRATION 004: Identitas login username, email, atau nomor telepon.
-- Jalankan sekali pada database sparepart_db sebelum deploy versi aplikasi ini.
-- Tidak mengubah username/password lama dan tidak menghapus akun.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(190) NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50) NULL;

-- Identitas email/nomor telepon harus unik jika diisi.
-- Baris lama yang belum memiliki email/telepon tetap NULL dan tetap dapat login dengan username.
ALTER TABLE users ADD UNIQUE INDEX IF NOT EXISTS uq_users_email (email);
ALTER TABLE users ADD UNIQUE INDEX IF NOT EXISTS uq_users_phone (phone);
