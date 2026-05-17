import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { config } from '../config.js'
import { getDb } from '../db/sqlite.js'
import { getUserById } from './userRepo.js'

/** 仅允许小写字母/数字/`.`/`_`/`-`，首尾必须是字母数字，长度 1–32 */
const LOCAL_RE = /^[a-z0-9](?:[a-z0-9._-]{0,30}[a-z0-9])?$/

function normalizeAddress(addr: string): string {
  return addr.trim().toLowerCase()
}

export function splitAddress(address: string): { local: string; domain: string } | null {
  const lower = normalizeAddress(address)
  const at = lower.indexOf('@')
  if (at <= 0 || at !== lower.lastIndexOf('@')) return null
  const local = lower.slice(0, at)
  const domain = lower.slice(at)
  if (!LOCAL_RE.test(local)) return null
  if (!config.email.domains.includes(domain)) return null
  return { local, domain }
}

export function addressLooksValid(address: string): boolean {
  return splitAddress(address) != null
}

type AddEmailBody = { address?: unknown; prefix?: unknown; domain?: unknown }

export function normalizeAddressInput(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const b = body as AddEmailBody
  if (typeof b.address === 'string') {
    return b.address.trim().toLowerCase()
  }
  if (typeof b.prefix === 'string' && typeof b.domain === 'string') {
    const local = b.prefix.trim().toLowerCase()
    const domain = b.domain.trim().toLowerCase()
    const address = `${local}${domain}`
    return splitAddress(address) ? address : null
  }
  return null
}

export class EmailTakenError extends Error {
  constructor(address: string) {
    super(`email already taken: ${address}`)
  }
}

export class EmailQuotaExceededError extends Error {
  readonly maxEmails: number

  constructor(maxEmails: number) {
    super(`email quota exceeded: max ${maxEmails}`)
    this.maxEmails = maxEmails
  }
}

export function listEmailsOfUser(userId: string): string[] {
  const rows = getDb()
    .prepare(
      `SELECT address
         FROM user_emails
        WHERE user_id = ?
        ORDER BY created_at ASC`,
    )
    .all(userId) as Array<{ address: string }>
  return rows.map((r) => r.address)
}

export function listAllUserEmails(): Array<{ user_id: string; address: string }> {
  return getDb()
    .prepare(
      `SELECT user_id, address
         FROM user_emails
        ORDER BY created_at ASC`,
    )
    .all() as Array<{ user_id: string; address: string }>
}

export function countEmailsOfUser(userId: string): number {
  const row = getDb()
    .prepare(`SELECT COUNT(*) AS n FROM user_emails WHERE user_id = ?`)
    .get(userId) as { n: number | bigint }
  return Number(row.n)
}

export function addEmailForUser(userId: string, address: string): string {
  const normalized = normalizeAddress(address)
  if (!addressLooksValid(normalized)) {
    throw new Error('invalid email address')
  }
  const user = getUserById(userId)
  if (!user) throw new Error('user not found')
  const owned = countEmailsOfUser(userId)
  if (owned >= user.max_emails) {
    throw new EmailQuotaExceededError(user.max_emails)
  }
  try {
    getDb()
      .prepare(
        `INSERT INTO user_emails (id, user_id, address, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(randomUUID(), userId, normalized, new Date().toISOString())
  } catch (e) {
    if (e instanceof Database.SqliteError && e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new EmailTakenError(normalized)
    }
    throw e
  }
  return normalized
}

export function deleteEmailForUser(userId: string, address: string): boolean {
  const normalized = normalizeAddress(address)
  const r = getDb()
    .prepare(`DELETE FROM user_emails WHERE user_id = ? AND address = ? COLLATE NOCASE`)
    .run(userId, normalized)
  return r.changes > 0
}

export function getUserIdByEmail(address: string): string | null {
  const normalized = normalizeAddress(address)
  const row = getDb()
    .prepare(`SELECT user_id FROM user_emails WHERE address = ? COLLATE NOCASE`)
    .get(normalized) as { user_id: string } | undefined
  return row?.user_id ?? null
}
