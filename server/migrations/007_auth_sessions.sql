-- MIGRATION 007: Database-backed revocable login sessions.
-- Run after migrations 003 and 004. Additive only; no existing data is deleted.
CREATE TABLE IF NOT EXISTS auth_sessions (
  session_id CHAR(32) NOT NULL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_auth_sessions_user (user_id),
  KEY idx_auth_sessions_expiry (expires_at),
  KEY idx_auth_sessions_revoked (revoked_at)
);

-- Serialize first-owner initialization to prevent concurrent bootstrap accounts.
CREATE TABLE IF NOT EXISTS owner_setup_guard (
  id TINYINT NOT NULL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO owner_setup_guard (id)
SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM owner_setup_guard WHERE id=1);
