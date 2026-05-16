import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { getDb } from '../db/sqlite.js'

export type UserRow = {
  id: string
  username: string
  password_hash: string
  password_salt: string
  created_at: string
  last_login_at: string | null
}

/** 仅允许小写字母/数字/`.`/`_`/`-`，首尾必须是字母数字，长度 1–32 */
const USERNAME_RE = /^[a-z0-9](?:[a-z0-9._-]{0,30}[a-z0-9])?$/

export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase()
}

export function isValidUsername(username: string): boolean {
  return USERNAME_RE.test(username)
}

export function isValidPassword(password: string): boolean {
  return typeof password === 'string' && password.length >= 6 && password.length <= 128
}

export function getUserByUsername(username: string): UserRow | null {
  const row = getDb()
    .prepare(
      `SELECT id, username, password_hash, password_salt, created_at, last_login_at
       FROM users WHERE username = ? COLLATE NOCASE`,
    )
    .get(username) as UserRow | undefined
  return row ?? null
}

export function getUserById(id: string): UserRow | null {
  const row = getDb()
    .prepare(
      `SELECT id, username, password_hash, password_salt, created_at, last_login_at
       FROM users WHERE id = ?`,
    )
    .get(id) as UserRow | undefined
  return row ?? null
}

export class UsernameTakenError extends Error {
  constructor(username: string) {
    super(`username already taken: ${username}`)
  }
}

export function createUser(input: {
  username: string
  passwordHash: string
  passwordSalt: string
}): UserRow {
  const id = randomUUID()
  const createdAt = new Date().toISOString()
  try {
    getDb()
      .prepare(
        `INSERT INTO users (id, username, password_hash, password_salt, created_at, last_login_at)
         VALUES (?, ?, ?, ?, ?, NULL)`,
      )
      .run(id, input.username, input.passwordHash, input.passwordSalt, createdAt)
  } catch (e) {
    if (
      e instanceof Database.SqliteError &&
      e.code === 'SQLITE_CONSTRAINT_UNIQUE'
    ) {
      throw new UsernameTakenError(input.username)
    }
    throw e
  }
  return {
    id,
    username: input.username,
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
  username: string
  created_at: string
  last_login_at: string | null
  owned_email_count: number
  email_count: number
}

/** 列出所有注册用户及作为收件人关联到的邮件数量（按注册时间倒序） */
export function listUsersWithEmailCounts(): UserWithEmailCount[] {
  const rows = getDb()
    .prepare(
      `SELECT u.id, u.username, u.created_at, u.last_login_at,
              (SELECT COUNT(*) FROM user_emails ue WHERE ue.user_id = u.id) AS owned_email_count,
              (SELECT COUNT(DISTINCT r.email_id)
                 FROM email_recipients r
                 JOIN user_emails ue2 ON ue2.address = r.address COLLATE NOCASE
                WHERE ue2.user_id = u.id) AS email_count
         FROM users u
        ORDER BY u.created_at DESC`,
    )
    .all() as Array<
    Omit<UserWithEmailCount, 'owned_email_count' | 'email_count'> & {
      owned_email_count: number | bigint
      email_count: number | bigint
    }
  >
  return rows.map((r) => ({
    ...r,
    owned_email_count: Number(r.owned_email_count),
    email_count: Number(r.email_count),
  }))
}
