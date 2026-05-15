import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { getDb } from '../db/sqlite.js'

export type UserRow = {
  id: string
  prefix: string
  password_hash: string
  password_salt: string
  created_at: string
  last_login_at: string | null
}

/** 仅允许小写字母/数字/`.`/`_`/`-`，首尾必须是字母数字，长度 1–32 */
const PREFIX_RE = /^[a-z0-9](?:[a-z0-9._-]{0,30}[a-z0-9])?$/

export function normalizePrefix(input: string): string {
  return input.trim().toLowerCase()
}

export function isValidPrefix(prefix: string): boolean {
  return PREFIX_RE.test(prefix)
}

export function isValidPassword(password: string): boolean {
  return typeof password === 'string' && password.length >= 6 && password.length <= 128
}

export function getUserByPrefix(prefix: string): UserRow | null {
  const row = getDb()
    .prepare(
      `SELECT id, prefix, password_hash, password_salt, created_at, last_login_at
       FROM users WHERE prefix = ? COLLATE NOCASE`,
    )
    .get(prefix) as UserRow | undefined
  return row ?? null
}

export function getUserById(id: string): UserRow | null {
  const row = getDb()
    .prepare(
      `SELECT id, prefix, password_hash, password_salt, created_at, last_login_at
       FROM users WHERE id = ?`,
    )
    .get(id) as UserRow | undefined
  return row ?? null
}

export class PrefixTakenError extends Error {
  constructor(prefix: string) {
    super(`prefix already taken: ${prefix}`)
  }
}

export function createUser(input: {
  prefix: string
  passwordHash: string
  passwordSalt: string
}): UserRow {
  const id = randomUUID()
  const createdAt = new Date().toISOString()
  try {
    getDb()
      .prepare(
        `INSERT INTO users (id, prefix, password_hash, password_salt, created_at, last_login_at)
         VALUES (?, ?, ?, ?, ?, NULL)`,
      )
      .run(id, input.prefix, input.passwordHash, input.passwordSalt, createdAt)
  } catch (e) {
    if (
      e instanceof Database.SqliteError &&
      e.code === 'SQLITE_CONSTRAINT_UNIQUE'
    ) {
      throw new PrefixTakenError(input.prefix)
    }
    throw e
  }
  return {
    id,
    prefix: input.prefix,
    password_hash: input.passwordHash,
    password_salt: input.passwordSalt,
    created_at: createdAt,
    last_login_at: null,
  }
}

export function touchLastLogin(userId: string): void {
  getDb()
    .prepare(`UPDATE users SET last_login_at = ? WHERE id = ?`)
    .run(new Date().toISOString(), userId)
}

export type UserWithEmailCount = {
  id: string
  prefix: string
  created_at: string
  last_login_at: string | null
  email_count: number
}

/** 列出所有注册用户及作为收件人关联到的邮件数量（按注册时间倒序） */
export function listUsersWithEmailCounts(): UserWithEmailCount[] {
  const rows = getDb()
    .prepare(
      `SELECT u.id, u.prefix, u.created_at, u.last_login_at,
              COUNT(DISTINCT r.email_id) AS email_count
         FROM users u
         LEFT JOIN email_recipients r ON r.prefix = LOWER(u.prefix)
        GROUP BY u.id, u.prefix, u.created_at, u.last_login_at
        ORDER BY u.created_at DESC`,
    )
    .all() as Array<
    Omit<UserWithEmailCount, 'email_count'> & { email_count: number | bigint }
  >
  return rows.map((r) => ({
    ...r,
    email_count: Number(r.email_count),
  }))
}
