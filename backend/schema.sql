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
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
