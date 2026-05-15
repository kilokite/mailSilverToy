import { Hono } from 'hono'
import { createHash } from 'node:crypto'
import Database from 'better-sqlite3'
import { config } from '../config.js'
import { requireWebhookSecret } from '../middleware/auth.js'
import { parseEml } from '../services/emailParser.js'
import {
  getEmailById,
  getIdByBodySha256,
  getRawById,
  insertEmailTransaction,
  listEmails,
} from '../services/emailRepo.js'

const email = new Hono()

function sha256Hex(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

email.post('/', requireWebhookSecret, async (c) => {
  const max = config.email.maxRawBytes
  const buf = Buffer.from(await c.req.arrayBuffer())
  if (buf.length > max) {
    return c.text('Payload Too Large', 413)
  }
  if (buf.length === 0) {
    return c.json({ error: 'empty body' }, 400)
  }

  const hash = sha256Hex(buf)
  const existingId = getIdByBodySha256(hash)
  if (existingId) {
    return c.json({ ok: true, id: existingId, duplicated: true, parsed: null })
  }

  const parsedResult = await parseEml(buf)
  const parseOk = parsedResult.ok
  const parseError = parseOk ? null : parsedResult.error
  const parsedRow = parseOk ? parsedResult.row : null

  try {
    const { id } = insertEmailTransaction({
      raw: buf,
      bodySha256: hash,
      parseStatus: parseOk ? 'ok' : 'error',
      parseError,
      parsedRow,
    })
    return c.json({
      ok: true,
      id,
      duplicated: false,
      parsed: parseOk,
    })
  } catch (e) {
    if (e instanceof Database.SqliteError && e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      const id = getIdByBodySha256(hash)
      if (id) {
        return c.json({ ok: true, id, duplicated: true, parsed: null })
      }
    }
    throw e
  }
})

email.get('/', (c) => {
  const limit = Number(c.req.query('limit') ?? 20)
  const before = c.req.query('before') ?? null
  const items = listEmails({
    limit: Number.isFinite(limit) ? limit : 20,
    before,
  })
  return c.json({ items })
})

email.get('/:id/raw', (c) => {
  const id = c.req.param('id')
  const raw = getRawById(id)
  if (!raw) return c.json({ error: 'Not Found' }, 404)
  c.header('Content-Type', 'message/rfc822')
  c.header('Content-Disposition', `attachment; filename="${id}.eml"`)
  return c.body(new Uint8Array(raw))
})

email.get('/:id', (c) => {
  const id = c.req.param('id')
  const row = getEmailById(id)
  if (!row) return c.json({ error: 'Not Found' }, 404)
  return c.json(row)
})

export default email
