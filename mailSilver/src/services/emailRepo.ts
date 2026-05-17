import { createHash, randomUUID } from 'node:crypto'
import { getDb } from '../db/sqlite.js'
import { config, listEmailDomainSuffixes } from '../config.js'
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
  /** 已发送列表：首个收件人地址 */
  to_addr?: string | null
  starred: boolean
  trashed: boolean
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
  /** 仅返回已星标 */
  starred?: boolean | null
  /** true：仅回收站；默认排除回收站 */
  trashed?: boolean | null
  /** true：仅已发送（发件人为用户绑定地址） */
  sent?: boolean | null
}

const MAX_SEARCH_Q_LEN = 128

function escapeLikePattern(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

function rowToListItem(row: Record<string, unknown>): EmailListItem {
  return {
    id: row.id as string,
    received_at: row.received_at as string,
    parse_status: row.parse_status as ParseStatus,
    subject: (row.subject as string | null) ?? null,
    from_addr: (row.from_addr as string | null) ?? null,
    from_name: (row.from_name as string | null) ?? null,
    date: (row.date as string | null) ?? null,
    to_addr: (row.to_addr as string | null) ?? null,
    starred: !!(row.starred as number | boolean),
    trashed: !!(row.trashed as number | boolean),
  }
}

const LIST_SELECT = `e.id, e.received_at, e.parse_status, p.subject, p.from_addr, p.from_name, p.date,
         json_extract(p.to_json, '$[0].address') AS to_addr`

function listSelectWithUserState(): string {
  return `${LIST_SELECT},
         CASE WHEN s.email_id IS NOT NULL THEN 1 ELSE 0 END AS starred,
         CASE WHEN t.email_id IS NOT NULL THEN 1 ELSE 0 END AS trashed`
}

const USER_STATE_JOINS = `LEFT JOIN email_stars s ON s.email_id = e.id AND s.user_id = ?
          LEFT JOIN email_trash t ON t.email_id = e.id AND t.user_id = ?`

export function listEmails(params: ListEmailParams): EmailListItem[] {
  const limit = Math.min(Math.max(1, params.limit), 100)
  const before = params.before?.trim() || null
  const userId = params.userId?.trim() || null
  const recipientAddress = params.recipientAddress?.trim().toLowerCase() || null
  const qRaw = params.q?.trim().slice(0, MAX_SEARCH_Q_LEN) || null
  const q = qRaw ? qRaw.toLowerCase() : null
  const starredOnly = params.starred === true
  const trashedOnly = params.trashed === true
  const sentOnly = params.sent === true

  const where: string[] = []
  const args: unknown[] = []
  const joinArgs: unknown[] = []
  if (userId) {
    joinArgs.push(userId, userId)
    if (sentOnly) {
      where.push(
        `EXISTS (
          SELECT 1 FROM email_sent es
           WHERE es.email_id = e.id AND es.user_id = ?
           ${recipientAddress ? 'AND es.from_address = ? COLLATE NOCASE' : ''}
        )`,
      )
      args.push(userId)
      if (recipientAddress) args.push(recipientAddress)
    } else if (starredOnly) {
      where.push(
        `(
          EXISTS (
            SELECT 1
              FROM email_recipients r
              JOIN user_emails ue ON ue.address = r.address COLLATE NOCASE
             WHERE r.email_id = e.id AND ue.user_id = ?
             ${recipientAddress ? 'AND r.address = ? COLLATE NOCASE' : ''}
          )
          OR EXISTS (
            SELECT 1 FROM email_sent es
             WHERE es.email_id = e.id AND es.user_id = ?
             ${recipientAddress ? 'AND es.from_address = ? COLLATE NOCASE' : ''}
          )
        )`,
      )
      args.push(userId)
      if (recipientAddress) args.push(recipientAddress)
      args.push(userId)
      if (recipientAddress) args.push(recipientAddress)
    } else {
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
      where.push(
        `NOT EXISTS (
          SELECT 1 FROM email_sent es
           WHERE es.email_id = e.id AND es.user_id = ?
        )`,
      )
      args.push(userId)
    }
    if (trashedOnly) {
      where.push('t.email_id IS NOT NULL')
    } else {
      where.push('t.email_id IS NULL')
    }
    if (starredOnly) {
      where.push('s.email_id IS NOT NULL')
    }
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
  const userJoins = userId ? USER_STATE_JOINS : ''
  const selectSql = userId
    ? listSelectWithUserState()
    : `${LIST_SELECT}, 0 AS starred, 0 AS trashed`
  const sql = `SELECT ${selectSql}
                 FROM emails e
                 LEFT JOIN emails_parsed p ON p.email_id = e.id
                 ${userJoins}
                 ${whereSql}
                 ORDER BY e.received_at DESC
                 LIMIT ?`
  const allArgs = [...joinArgs, ...args, limit]
  const rows = getDb().prepare(sql).all(...allArgs) as Array<Record<string, unknown>>
  return rows.map(rowToListItem)
}

export function getEmailListItem(
  id: string,
  userId?: string | null,
): EmailListItem | null {
  const uid = userId?.trim() || null
  if (uid) {
    const row = getDb()
      .prepare(
        `SELECT ${listSelectWithUserState()}
           FROM emails e
           LEFT JOIN emails_parsed p ON p.email_id = e.id
           ${USER_STATE_JOINS}
          WHERE e.id = ?`,
      )
      .get(uid, uid, id) as Record<string, unknown> | undefined
    return row ? rowToListItem(row) : null
  }
  const row = getDb()
    .prepare(
      `SELECT ${LIST_SELECT}, 0 AS starred, 0 AS trashed
         FROM emails e
         LEFT JOIN emails_parsed p ON p.email_id = e.id
        WHERE e.id = ?`,
    )
    .get(id) as Record<string, unknown> | undefined
  return row ? rowToListItem(row) : null
}

export type EmailDetail = {
  id: string
  received_at: string
  size: number
  body_sha256: string
  parse_status: ParseStatus
  parse_error: string | null
  parsed: Record<string, unknown> | null
  starred: boolean
  trashed: boolean
}

function safeJson(s: string | null): unknown {
  if (!s) return null
  try {
    return JSON.parse(s) as unknown
  } catch {
    return null
  }
}

export function getEmailById(id: string, userId?: string | null): EmailDetail | null {
  const uid = userId?.trim() || null
  const stateSelect = uid
    ? `, CASE WHEN s.email_id IS NOT NULL THEN 1 ELSE 0 END AS starred,
           CASE WHEN t.email_id IS NOT NULL THEN 1 ELSE 0 END AS trashed`
    : `, 0 AS starred, 0 AS trashed`
  const stateJoin = uid ? USER_STATE_JOINS : ''
  const stateArgs = uid ? [uid, uid] : []
  const row = getDb()
    .prepare(
      `SELECT e.id, e.received_at, e.size, e.body_sha256, e.parse_status, e.parse_error,
              p.email_id AS parsed_email_id,
              p.message_id, p.subject, p.from_addr, p.from_name, p.to_json, p.cc_json, p.bcc_json,
              p.reply_to_json, p.date, p.text, p.html, p.headers_json, p.attachments_meta_json
              ${stateSelect}
       FROM emails e
       LEFT JOIN emails_parsed p ON p.email_id = e.id
       ${stateJoin}
       WHERE e.id = ?`,
    )
    .get(...stateArgs, id) as Record<string, unknown> | undefined
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
    starred: !!(row.starred as number | boolean),
    trashed: !!(row.trashed as number | boolean),
  }
}

export function setEmailTrashed(
  userId: string,
  emailId: string,
  trashed: boolean,
): void {
  const db = getDb()
  if (trashed) {
    db.prepare(
      `INSERT OR REPLACE INTO email_trash (user_id, email_id, trashed_at)
       VALUES (?, ?, ?)`,
    ).run(userId, emailId, new Date().toISOString())
  } else {
    db.prepare(
      `DELETE FROM email_trash WHERE user_id = ? AND email_id = ?`,
    ).run(userId, emailId)
  }
}

export function setEmailStarred(
  userId: string,
  emailId: string,
  starred: boolean,
): void {
  const db = getDb()
  if (starred) {
    db.prepare(
      `INSERT OR REPLACE INTO email_stars (user_id, email_id, starred_at)
       VALUES (?, ?, ?)`,
    ).run(userId, emailId, new Date().toISOString())
  } else {
    db.prepare(
      `DELETE FROM email_stars WHERE user_id = ? AND email_id = ?`,
    ).run(userId, emailId)
  }
}

export function getRawById(id: string): Buffer | null {
  const row = getDb()
    .prepare('SELECT raw FROM emails WHERE id = ?')
    .get(id) as { raw: Buffer } | undefined
  return row?.raw ?? null
}

/** 判断邮件是否属于指定用户（收件人或已发送） */
export function emailBelongsToUser(
  emailId: string,
  userId: string,
): boolean {
  const row = getDb()
    .prepare(
      `SELECT 1 AS hit
         WHERE EXISTS (
          SELECT 1
            FROM email_recipients r
            JOIN user_emails ue ON ue.address = r.address COLLATE NOCASE
           WHERE r.email_id = ? AND ue.user_id = ?
        )
           OR EXISTS (
          SELECT 1 FROM email_sent es
           WHERE es.email_id = ? AND es.user_id = ?
        )`,
    )
    .get(emailId, userId, emailId, userId) as { hit: number } | undefined
  return !!row
}

function addrsToJson(addrs: string[]): string {
  return JSON.stringify(addrs.map((address) => ({ address })))
}

function buildMinimalRaw(input: {
  from: string
  to: string[]
  cc: string[]
  bcc: string[]
  subject: string
  date: string
  text?: string
  html?: string
}): Buffer {
  const lines = [
    `From: ${input.from}`,
    `To: ${input.to.join(', ')}`,
  ]
  if (input.cc.length) lines.push(`Cc: ${input.cc.join(', ')}`)
  if (input.bcc.length) lines.push(`Bcc: ${input.bcc.join(', ')}`)
  lines.push(`Subject: ${input.subject}`)
  lines.push(`Date: ${input.date}`)
  lines.push('MIME-Version: 1.0')
  if (input.html?.trim()) {
    lines.push('Content-Type: text/html; charset=utf-8')
    lines.push('')
    lines.push(input.html)
  } else {
    lines.push('Content-Type: text/plain; charset=utf-8')
    lines.push('')
    lines.push(input.text ?? '')
  }
  return Buffer.from(lines.join('\r\n'), 'utf-8')
}

export type OutboundMailInput = {
  from: string
  to: string[]
  cc?: string[]
  bcc?: string[]
  replyTo?: string[]
  subject: string
  text?: string
  html?: string
  resendId: string
}

/** 发信成功后写入本地库，供「已发送」文件夹展示 */
export function insertOutboundEmail(
  userId: string,
  input: OutboundMailInput,
): { id: string } {
  const id = randomUUID()
  const sentAt = new Date().toISOString()
  const to = input.to.map((a) => a.trim().toLowerCase())
  const cc = (input.cc ?? []).map((a) => a.trim().toLowerCase())
  const bcc = (input.bcc ?? []).map((a) => a.trim().toLowerCase())
  const replyTo = (input.replyTo ?? []).map((a) => a.trim().toLowerCase())
  const from = input.from.trim().toLowerCase()
  const text = input.text?.trim() || null
  const html = input.html?.trim() || null
  const raw = buildMinimalRaw({
    from,
    to,
    cc,
    bcc,
    subject: input.subject,
    date: sentAt,
    text: text ?? undefined,
    html: html ?? undefined,
  })
  const bodySha256 = createHash('sha256')
    .update(
      `${input.resendId}\0${from}\0${input.subject}\0${html ?? text ?? ''}`,
      'utf-8',
    )
    .digest('hex')
  const headersJson = JSON.stringify({
    'X-Resend-Id': input.resendId,
    'X-MailSilver-Outbound': '1',
  })
  const db = getDb()

  const insertEmail = db.prepare(
    `INSERT INTO emails (id, received_at, size, body_sha256, raw, parse_status, parse_error)
     VALUES (?, ?, ?, ?, ?, 'ok', NULL)`,
  )
  const insertParsed = db.prepare(
    `INSERT INTO emails_parsed (
       email_id, message_id, subject, from_addr, from_name, to_json, cc_json, bcc_json,
       reply_to_json, date, text, html, headers_json, attachments_meta_json
     ) VALUES (?, NULL, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, '[]')`,
  )
  const insertRecipient = db.prepare(
    `INSERT OR IGNORE INTO email_recipients (email_id, address) VALUES (?, ?)`,
  )
  const insertSent = db.prepare(
    `INSERT INTO email_sent (user_id, email_id, from_address, sent_at, resend_id)
     VALUES (?, ?, ?, ?, ?)`,
  )

  const allRecipients = [...new Set([...to, ...cc, ...bcc])]

  const tx = db.transaction(() => {
    insertEmail.run(id, sentAt, raw.length, bodySha256, raw)
    insertParsed.run(
      id,
      input.subject,
      from,
      addrsToJson(to),
      addrsToJson(cc),
      addrsToJson(bcc),
      addrsToJson(replyTo),
      sentAt,
      text,
      html,
      headersJson,
    )
    for (const addr of allRecipients) {
      insertRecipient.run(id, addr)
    }
    insertSent.run(userId, id, from, sentAt, input.resendId)
  })

  tx()
  return { id }
}

/** 从 parsed row 的 to/cc/bcc JSON 列里抽取匹配本服务域名的收件人 */
export function extractDomainRecipients(
  parsedRow: ParsedEmailRow | null,
): Array<{ address: string }> {
  if (!parsedRow) return []
  const domains = listEmailDomainSuffixes()
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
