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
