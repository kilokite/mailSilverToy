import { getDb } from './sqlite.js'

const sql = `
CREATE TABLE IF NOT EXISTS emails (
  id           TEXT PRIMARY KEY,
  received_at  TEXT NOT NULL,
  size         INTEGER NOT NULL,
  body_sha256  TEXT NOT NULL UNIQUE,
  raw          BLOB NOT NULL,
  parse_status TEXT NOT NULL DEFAULT 'pending',
  parse_error  TEXT
);
CREATE INDEX IF NOT EXISTS idx_emails_received_at ON emails(received_at DESC);

CREATE TABLE IF NOT EXISTS emails_parsed (
  email_id              TEXT PRIMARY KEY REFERENCES emails(id) ON DELETE CASCADE,
  message_id            TEXT,
  subject               TEXT,
  from_addr             TEXT,
  from_name             TEXT,
  to_json               TEXT,
  cc_json               TEXT,
  bcc_json              TEXT,
  reply_to_json         TEXT,
  date                  TEXT,
  text                  TEXT,
  html                  TEXT,
  headers_json          TEXT,
  attachments_meta_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_parsed_message_id ON emails_parsed(message_id);

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  prefix        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS email_recipients (
  email_id  TEXT NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  address   TEXT NOT NULL,
  prefix    TEXT NOT NULL,
  PRIMARY KEY (email_id, address)
);
CREATE INDEX IF NOT EXISTS idx_recipients_prefix ON email_recipients(prefix);
`

export function runMigrations(): void {
  getDb().exec(sql)
}
