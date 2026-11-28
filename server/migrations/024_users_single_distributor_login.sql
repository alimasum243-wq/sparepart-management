-- 024: enforce the current application invariant of one distributor login per distributor.
-- Check duplicate distributor_id values in users before applying; this unique index fails if duplicates exist.
-- NULL distributor_id remains allowed for owner/admin users.
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_single_distributor_login ON users (distributor_id);
