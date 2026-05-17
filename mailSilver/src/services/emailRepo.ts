import { randomUUID } from 'node:crypto'
import { getDb } from '../db/sqlite.js'
import { config } from '../config.js'
import type { ParsedEmailRow } from './emailParser.js'

export type ParseStatus = 'pending' | 'ok' | 'error'

export function getIdByBodySha256(sha256: string): string | null {
  const row = getDb()
    .prepare('SELECT id FROM emails WHERE body_sha256 = ?')
    .get(sha256) as { id: string } | undefined
  return row?.id ?? null
}

export type EmailListItem = {
  id: string
  received_at: string
  parse_status: ParseStatus
  subject: string | null
  from_addr: string | null
  from_name: string | null
  date: string | null
}

export type ListEmailParams = {
  limit: number
  before?: string | null
  /** 仅返回该用户拥有地址作为收件人的邮件 */
  userId?: string | null
  /** 仅返回发往该完整地址的邮件（须属于该用户） */
  recipientAddress?: string | null
  /** 模糊搜索：主题、发件人、正文、收件人地址 */
  q?: string | null
}

const MAX_SEARCH_Q_LEN = 128

function escapeLikePattern(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

export function listEmails(params: ListEmailParams): EmailListItem[] {
  const limit = Math.min(Math.max(1, params.limit), 100)
  const before = params.before?.trim() || null
  const userId = params.userId?.trim() || null
  const recipientAddress = params.recipientAddress?.trim().toLowerCase() || null
  const qRaw = params.q?.trim().slice(0, MAX_SEARCH_Q_LEN) || null
  const q = qRaw ? qRaw.toLowerCase() : null

  const where: string[] = []
  const args: unknown[] = []
  if (userId) {
    where.push(
      `EXISTS (
        SELECT 1
          FROM email_recipients r
          JOIN user_emails ue ON ue.address = r.address COLLATE NOCASE
         WHERE r.email_id = e.id AND ue.user_id = ?
         ${recipientAddress ? 'AND r.address = ? COLLATE NOCASE' : ''}
      )`,
    )
    args.push(userId)
    if (recipientAddress) args.push(recipientAddress)
  }
  if (q) {
    const pattern = `%${escapeLikePattern(q)}%`
    where.push(
      `(
        LOWER(p.subject) LIKE ? ESCAPE '\\' OR
        LOWER(p.from_addr) LIKE ? ESCAPE '\\' OR
        LOWER(p.from_name) LIKE ? ESCAPE '\\' OR
        LOWER(p.text) LIKE ? ESCAPE '\\' OR
        EXISTS (
          SELECT 1 FROM email_recipients r2
           WHERE r2.email_id = e.id
             AND LOWER(r2.address) LIKE ? ESCAPE '\\'
        )
      )`,
    )
    for (let i = 0; i < 5; i++) args.push(pattern)
  }
  if (before) {
    where.push(`e.received_at < ?`)
    args.push(before)
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const sql = `SELECT e.id, e.received_at, e.parse_status, p.subject, p.from_addr, p.from_name, p.date
                 FROM emails e
                 LEFT JOIN emails_parsed p ON p.email_id = e.id
                 ${whereSql}
                 ORDER BY e.received_at DESC
                 LIMIT ?`
  args.push(limit)
  return getDb().prepare(sql).all(...args) as EmailListItem[]
}

export function getEmailListItem(id: string): EmailListItem | null {
  const row = getDb()
    .prepare(
      `SELECT e.id, e.received_at, e.parse_status, p.subject, p.from_addr, p.from_name, p.date
         FROM emails e
         LEFT JOIN emails_parsed p ON p.email_id = e.id
        WHERE e.id = ?`,
    )
    .get(id) as EmailListItem | undefined
  return row ?? null
}

export type EmailDetail = {
  id: string
  received_at: string
  size: number
  body_sha256: string
  parse_status: ParseStatus
  parse_error: string | null
  parsed: Record<string, unknown> | null
}

function safeJson(s: string | null): unknown {
  if (!s) return null
  try {
    return JSON.parse(s) as unknown
  } catch {
    return null
  }
}

export function getEmailById(id: string): EmailDetail | null {
  const row = getDb()
    .prepare(
      `SELECT e.id, e.received_at, e.size, e.body_sha256, e.parse_status, e.parse_error,
              p.email_id AS parsed_email_id,
              p.message_id, p.subject, p.from_addr, p.from_name, p.to_json, p.cc_json, p.bcc_json,
              p.reply_to_json, p.date, p.text, p.html, p.headers_json, p.attachments_meta_json
       FROM emails e
       LEFT JOIN emails_parsed p ON p.email_id = e.id
       WHERE e.id = ?`,
    )
    .get(id) as Record<string, unknown> | undefined
  if (!row) return null

  const hasParsedRow = row.parsed_email_id != null

  const parsed = hasParsedRow
    ? {
        message_id: row.message_id ?? null,
        subject: row.subject ?? null,
        from_addr: row.from_addr ?? null,
        from_name: row.from_name ?? null,
        to: safeJson(row.to_json as string | null),
        cc: safeJson(row.cc_json as string | null),
        bcc: safeJson(row.bcc_json as string | null),
        reply_to: safeJson(row.reply_to_json as string | null),
        date: row.date ?? null,
        text: row.text ?? null,
        html: row.html ?? null,
        headers: safeJson(row.headers_json as string | null),
        attachments_meta: safeJson(row.attachments_meta_json as string | null),
      }
    : null

  return {
    id: row.id as string,
    received_at: row.received_at as string,
    size: row.size as number,
    body_sha256: row.body_sha256 as string,
    parse_status: row.parse_status as ParseStatus,
    parse_error: (row.parse_error as string | null) ?? null,
    parsed,
  }
}

export function getRawById(id: string): Buffer | null {
  const row = getDb()
    .prepare('SELECT raw FROM emails WHERE id = ?')
    .get(id) as { raw: Buffer } | undefined
  return row?.raw ?? null
}

/** 判断邮件是否属于指定用户（按完整地址匹配） */
export function emailBelongsToUser(
  emailId: string,
  userId: string,
): boolean {
  const row = getDb()
    .prepare(
      `SELECT 1 AS hit
         FROM email_recipients r
         JOIN user_emails ue ON ue.address = r.address COLLATE NOCASE
        WHERE r.email_id = ? AND ue.user_id = ?
        LIMIT 1`,
    )
    .get(emailId, userId) as { hit: number } | undefined
  return !!row
}

/** 从 parsed row 的 to/cc/bcc JSON 列里抽取匹配本服务域名的收件人 */
export function extractDomainRecipients(
  parsedRow: ParsedEmailRow | null,
): Array<{ address: string }> {
  if (!parsedRow) return []
  const domains = config.email.domains
  const fields = [parsedRow.to_json, parsedRow.cc_json, parsedRow.bcc_json]
  const out = new Map<string, { address: string }>()
  for (const field of fields) {
    if (!field) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(field)
    } catch {
      continue
    }
    if (!Array.isArray(parsed)) continue
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue
      const addr = (item as { address?: unknown }).address
      if (typeof addr !== 'string') continue
      const lower = addr.trim().toLowerCase()
      if (!domains.some((d) => lower.endsWith(d))) continue
      if (!out.has(lower)) out.set(lower, { address: lower })
    }
  }
  return Array.from(out.values())
}

export type InsertResult = {
  id: string
  recipients: Array<{ address: string }>
}

export function insertEmailTransaction(input: {
  raw: Buffer
  bodySha256: string
  parseStatus: ParseStatus
  parseError: string | null
  parsedRow: ParsedEmailRow | null
}): InsertResult {
  const id = randomUUID()
  const receivedAt = new Date().toISOString()
  const size = input.raw.length
  const db = getDb()
  const recipients = extractDomainRecipients(input.parsedRow)

  const insertEmail = db.prepare(
    `INSERT INTO emails (id, received_at, size, body_sha256, raw, parse_status, parse_error)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
  const insertParsed = db.prepare(
    `INSERT INTO emails_parsed (
       email_id, message_id, subject, from_addr, from_name, to_json, cc_json, bcc_json,
       reply_to_json, date, text, html, headers_json, attachments_meta_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const insertRecipient = db.prepare(
    `INSERT OR IGNORE INTO email_recipients (email_id, address) VALUES (?, ?)`,
  )

  const tx = db.transaction(() => {
    insertEmail.run(
      id,
      receivedAt,
      size,
      input.bodySha256,
      input.raw,
      input.parseStatus,
      input.parseError,
    )
    if (input.parsedRow) {
      const r = input.parsedRow
      insertParsed.run(
        id,
        r.message_id,
        r.subject,
        r.from_addr,
        r.from_name,
        r.to_json,
        r.cc_json,
        r.bcc_json,
        r.reply_to_json,
        r.date,
        r.text,
        r.html,
        r.headers_json,
        r.attachments_meta_json,
      )
    }
    for (const rec of recipients) {
      insertRecipient.run(id, rec.address)
    }
  })

  tx()
  return { id, recipients }
}
