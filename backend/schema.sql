CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('visit','heartbeat','task_created','task_updated','task_deleted','task_completed','task_reopened','task_auto_deleted','folder_created','folder_deleted')),
  browser TEXT NOT NULL,
  os TEXT NOT NULL,
  device TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS events_time ON events(created_at DESC);
CREATE INDEX IF NOT EXISTS events_session_time ON events(session_id, created_at DESC);
CREATE TABLE IF NOT EXISTS devices (
  device_no INTEGER PRIMARY KEY AUTOINCREMENT,
  visitor_id TEXT NOT NULL UNIQUE
);
INSERT OR IGNORE INTO devices(visitor_id)
SELECT visitor_id FROM events GROUP BY visitor_id ORDER BY MIN(created_at), visitor_id;
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS device_alerts (
  id TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS device_alerts_visitor ON device_alerts(visitor_id, created_at DESC);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS user_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS user_sessions_expiry ON user_sessions(expires_at);
CREATE TABLE IF NOT EXISTS user_data (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  data TEXT NOT NULL DEFAULT '{"tasks":[],"folders":[]}',
  version INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS account_devices (
  visitor_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  last_seen INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS event_accounts (
  event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id)
);
