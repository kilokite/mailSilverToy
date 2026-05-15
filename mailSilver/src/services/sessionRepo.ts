import { randomBytes } from 'node:crypto'
import { getDb } from '../db/sqlite.js'
import { config } from '../config.js'
import type { UserRow } from './userRepo.js'

export type SessionRow = {
  token: string
  user_id: string
  created_at: string
  expires_at: string
}

function generateToken(): string {
  return randomBytes(32).toString('base64url')
}

export function createSession(userId: string): SessionRow {
  const token = generateToken()
  const now = new Date()
  const expires = new Date(now.getTime() + config.auth.sessionTtlMs)
  const row: SessionRow = {
    token,
    user_id: userId,
    created_at: now.toISOString(),
    expires_at: expires.toISOString(),
  }
  getDb()
    .prepare(
      `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`,
    )
    .run(row.token, row.user_id, row.created_at, row.expires_at)
  return row
}

export function deleteSession(token: string): void {
  getDb().prepare(`DELETE FROM sessions WHERE token = ?`).run(token)
}

/** 返回 session 关联的 user；过期则一并清理并返回 null */
export function getUserFromSession(token: string): UserRow | null {
  const db = getDb()
  const row = db
    .prepare(
      `SELECT s.token AS token, s.expires_at AS expires_at,
              u.id AS id, u.prefix AS prefix,
              u.password_hash AS password_hash, u.password_salt AS password_salt,
              u.created_at AS created_at, u.last_login_at AS last_login_at
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.token = ?`,
    )
    .get(token) as
    | (UserRow & { token: string; expires_at: string })
    | undefined
  if (!row) return null
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token)
    return null
  }
  return {
    id: row.id,
    prefix: row.prefix,
    password_hash: row.password_hash,
    password_salt: row.password_salt,
    created_at: row.created_at,
    last_login_at: row.last_login_at,
  }
}

export function purgeExpiredSessions(): void {
  getDb()
    .prepare(`DELETE FROM sessions WHERE expires_at <= ?`)
    .run(new Date().toISOString())
}
