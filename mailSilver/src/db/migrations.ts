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
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  last_login_at TEXT,
  max_emails    INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS user_emails (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  address    TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_emails_user ON user_emails(user_id);

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
  PRIMARY KEY (email_id, address)
);
CREATE INDEX IF NOT EXISTS idx_recipients_address ON email_recipients(address COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS hook_subscriptions (
  id            TEXT PRIMARY KEY,
  owner_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  event         TEXT NOT NULL,
  target_url    TEXT NOT NULL,
  secret        TEXT,
  active        INTEGER NOT NULL DEFAULT 1,
  filter_json   TEXT,
  headers_json  TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hook_sub_event ON hook_subscriptions(event, active);
CREATE INDEX IF NOT EXISTS idx_hook_sub_owner ON hook_subscriptions(owner_user_id);

CREATE TABLE IF NOT EXISTS hook_deliveries (
  id               TEXT PRIMARY KEY,
  subscription_id  TEXT NOT NULL REFERENCES hook_subscriptions(id) ON DELETE CASCADE,
  event            TEXT NOT NULL,
  status           TEXT NOT NULL,
  attempt          INTEGER NOT NULL,
  http_status      INTEGER,
  error            TEXT,
  request_body     TEXT,
  response_excerpt TEXT,
  created_at       TEXT NOT NULL,
  finished_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_hook_deliv_sub ON hook_deliveries(subscription_id, created_at DESC);
`

const dropLegacySql = `
DROP TABLE IF EXISTS email_recipients;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS user_emails;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS emails_parsed;
DROP TABLE IF EXISTS emails;
`

function hasLegacySchema(): boolean {
  const db = getDb()
  const users = db
    .prepare(`PRAGMA table_info(users)`)
    .all() as Array<{ name?: unknown }>
  const recipients = db
    .prepare(`PRAGMA table_info(email_recipients)`)
    .all() as Array<{ name?: unknown }>
  const userCols = new Set(
    users.map((c) => (typeof c.name === 'string' ? c.name : '')).filter(Boolean),
  )
  const recipientCols = new Set(
    recipients
      .map((c) => (typeof c.name === 'string' ? c.name : ''))
      .filter(Boolean),
  )
  return userCols.has('prefix') || recipientCols.has('prefix')
}

function usersTableHasColumn(name: string): boolean {
  const db = getDb()
  const cols = db
    .prepare(`PRAGMA table_info(users)`)
    .all() as Array<{ name?: unknown }>
  return cols.some((c) => c.name === name)
}

function migrateMaxEmailsColumn(): void {
  if (usersTableHasColumn('max_emails')) return
  const db = getDb()
  db.exec(`ALTER TABLE users ADD COLUMN max_emails INTEGER NOT NULL DEFAULT 1`)
  db.exec(
    `UPDATE users
        SET max_emails = MAX(
          1,
          (SELECT COUNT(*) FROM user_emails ue WHERE ue.user_id = users.id)
        )`,
  )
}

export function runMigrations(): void {
  const db = getDb()
  if (hasLegacySchema()) {
    console.warn('[migrate] legacy schema detected, recreating database tables')
    db.exec(dropLegacySql)
  }
  db.exec(sql)
  migrateMaxEmailsColumn()
}
