-- MIGRATION 004: Identitas login username, email, atau nomor telepon.
-- Jalankan sekali pada database sparepart_db sebelum deploy versi aplikasi ini.
-- Tidak mengubah username/password lama dan tidak menghapus akun.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(190) NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50) NULL;

-- TiDB mendukung CREATE UNIQUE INDEX IF NOT EXISTS.
-- Nilai NULL pada akun lama tetap diperbolehkan; nilai terisi wajib unik.
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email ON users (email);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_phone ON users (phone);
