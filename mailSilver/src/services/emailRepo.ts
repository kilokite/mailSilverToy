import { randomUUID } from 'node:crypto'
import { getDb } from '../db/sqlite.js'
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
}

export function listEmails(params: {
  limit: number
  before?: string | null
}): EmailListItem[] {
  const limit = Math.min(Math.max(1, params.limit), 100)
  const before = params.before?.trim() || null
  const sql = before
    ? `SELECT e.id, e.received_at, e.parse_status, p.subject, p.from_addr, p.from_name
       FROM emails e
       LEFT JOIN emails_parsed p ON p.email_id = e.id
       WHERE e.received_at < ?
       ORDER BY e.received_at DESC
       LIMIT ?`
    : `SELECT e.id, e.received_at, e.parse_status, p.subject, p.from_addr, p.from_name
       FROM emails e
       LEFT JOIN emails_parsed p ON p.email_id = e.id
       ORDER BY e.received_at DESC
       LIMIT ?`
  const stmt = getDb().prepare(sql)
  const rows = before ? stmt.all(before, limit) : stmt.all(limit)
  return rows as EmailListItem[]
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

export function insertEmailTransaction(input: {
  raw: Buffer
  bodySha256: string
  parseStatus: ParseStatus
  parseError: string | null
  parsedRow: ParsedEmailRow | null
}): { id: string } {
  const id = randomUUID()
  const receivedAt = new Date().toISOString()
  const size = input.raw.length
  const db = getDb()

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
  })

  tx()
  return { id }
}
