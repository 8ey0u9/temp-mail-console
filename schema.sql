CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT NOT NULL,
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  subject TEXT NOT NULL,
  extracted_json TEXT NOT NULL,
  text_preview TEXT NOT NULL DEFAULT '',
  received_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_emails_received_at ON emails (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_emails_message_id ON emails (message_id);

CREATE TABLE IF NOT EXISTS email_contents (
  email_id INTEGER PRIMARY KEY,
  text_body TEXT NOT NULL DEFAULT '',
  html_body TEXT NOT NULL DEFAULT '',
  raw_eml TEXT NOT NULL DEFAULT '',
  raw_size INTEGER NOT NULL DEFAULT 0,
  truncated INTEGER NOT NULL DEFAULT 0,
  received_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contents_received_at ON email_contents (received_at);

CREATE TABLE IF NOT EXISTS email_recipients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email_id INTEGER NOT NULL,
  recipient TEXT NOT NULL,
  received_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recipients_lookup ON email_recipients (recipient, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_recipients_email_id ON email_recipients (email_id);
CREATE INDEX IF NOT EXISTS idx_recipients_received_at ON email_recipients (received_at);

CREATE TABLE IF NOT EXISTS rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  remark TEXT,
  sender_filter TEXT,
  pattern TEXT NOT NULL,
  match_target TEXT NOT NULL DEFAULT 'body',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS whitelist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_pattern TEXT NOT NULL,
  remark TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
