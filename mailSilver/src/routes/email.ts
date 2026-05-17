import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { createHash } from 'node:crypto'
import Database from 'better-sqlite3'
import { config } from '../config.js'
import { requireUser, requireWebhookSecret } from '../middleware/auth.js'
import { parseEml } from '../services/emailParser.js'
import {
  emailBelongsToUser,
  getEmailById,
  getEmailListItem,
  getIdByBodySha256,
  getRawById,
  insertEmailTransaction,
  insertOutboundEmail,
  listEmails,
  setEmailStarred,
  setEmailTrashed,
} from '../services/emailRepo.js'
import { emitEmailNew, subscribeEmailNew } from '../services/emailBus.js'
import { listEmailsOfUser } from '../services/userEmailRepo.js'
import {
  parseAddressList,
  parseOptionalAddressList,
} from '../services/parseRecipients.js'
import { sendMail } from '../services/sendMail.js'

const email = new Hono()

function sha256Hex(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

function parseTruthyQuery(v: string | undefined): boolean {
  if (!v) return false
  const s = v.trim().toLowerCase()
  return s === '1' || s === 'true' || s === 'yes'
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
    const { id, recipients } = insertEmailTransaction({
      raw: buf,
      bodySha256: hash,
      parseStatus: parseOk ? 'ok' : 'error',
      parseError,
      parsedRow,
    })

    const item = getEmailListItem(id)
    if (item && recipients.length > 0) {
      emitEmailNew({
        addresses: Array.from(new Set(recipients.map((r) => r.address))),
        item,
      })
    }

    return c.json({
      ok: true,
      id,
      duplicated: false,
      parsed: parseOk,
      recipients: recipients.map((r) => r.address),
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

email.post('/send', requireUser, async (c) => {
  const user = c.get('user')
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid json' }, 400)
  }
  if (!body || typeof body !== 'object') {
    return c.json({ error: 'invalid body' }, 400)
  }
  const b = body as Record<string, unknown>
  const from =
    typeof b.from === 'string' ? b.from.trim().toLowerCase() : ''
  const subject =
    typeof b.subject === 'string' ? b.subject.trim() : ''
  const to = parseAddressList(b.to)
  const cc = parseOptionalAddressList(b.cc)
  const bcc = parseOptionalAddressList(b.bcc)
  const replyTo = parseOptionalAddressList(b.replyTo)

  if (!from) return c.json({ error: 'from required' }, 400)
  if (!subject) return c.json({ error: 'subject required' }, 400)
  if (subject.length > 998) return c.json({ error: 'subject too long' }, 400)
  if (!to) return c.json({ error: 'invalid to' }, 400)
  if (cc === null) return c.json({ error: 'invalid cc' }, 400)
  if (bcc === null) return c.json({ error: 'invalid bcc' }, 400)
  if (replyTo === null) return c.json({ error: 'invalid replyTo' }, 400)

  const owned = new Set(listEmailsOfUser(user.id).map((x) => x.toLowerCase()))
  if (!owned.has(from)) {
    return c.json({ error: '无权使用该发件地址' }, 403)
  }

  const text = typeof b.text === 'string' ? b.text : undefined
  const html = typeof b.html === 'string' ? b.html : undefined
  if (!text?.trim() && !html?.trim()) {
    return c.json({ error: 'text or html required' }, 400)
  }

  const result = await sendMail({
    from,
    to,
    subject,
    text,
    html,
    cc: cc.length > 0 ? cc : undefined,
    bcc: bcc.length > 0 ? bcc : undefined,
    replyTo: replyTo.length > 0 ? replyTo : undefined,
  })

  if (!result.ok) {
    const status =
      result.code === 'resend_not_configured'
        ? 503
        : result.code === 'send_failed'
          ? 502
          : 400
    return c.json({ error: result.message, code: result.code }, status)
  }

  const { id: localId } = insertOutboundEmail(user.id, {
    from,
    to,
    cc,
    bcc,
    replyTo,
    subject,
    text,
    html,
    resendId: result.id,
  })

  return c.json({ ok: true, id: localId, resendId: result.id })
})

email.get('/', requireUser, (c) => {
  const user = c.get('user')
  const limit = Number(c.req.query('limit') ?? 20)
  const before = c.req.query('before') ?? null
  const addressRaw = c.req.query('address')?.trim().toLowerCase() || null
  const qRaw = c.req.query('q')?.trim() || null
  const q = qRaw ? qRaw.slice(0, 128) : null
  const owned = listEmailsOfUser(user.id).map((x) => x.toLowerCase())
  if (addressRaw && !owned.includes(addressRaw)) {
    return c.json({ error: 'invalid address' }, 400)
  }
  const starred = parseTruthyQuery(c.req.query('starred'))
  const trashed = parseTruthyQuery(c.req.query('trashed'))
  const sent = parseTruthyQuery(c.req.query('sent'))
  const items = listEmails({
    limit: Number.isFinite(limit) ? limit : 20,
    before,
    userId: user.id,
    recipientAddress: addressRaw,
    q,
    starred: starred || null,
    trashed: trashed || null,
    sent: sent || null,
  })
  return c.json({ items })
})

/** SSE 实时推送：登录后订阅，自动按当前用户拥有地址过滤 */
email.get('/stream', requireUser, (c) => {
  const user = c.get('user')
  const ownedSet = new Set(listEmailsOfUser(user.id).map((x) => x.toLowerCase()))

  return streamSSE(c, async (stream) => {
    const queue: Array<{
      item: NonNullable<ReturnType<typeof getEmailListItem>>
      addresses: string[]
    }> = []
    let wake: (() => void) | null = null

    const unsubscribe = subscribeEmailNew((e) => {
      if (!e.addresses.some((addr) => ownedSet.has(addr))) return
      queue.push({ item: e.item, addresses: e.addresses })
      const fn = wake
      wake = null
      fn?.()
    })
    stream.onAbort(() => unsubscribe())

    try {
      await stream.writeSSE({
        event: 'ready',
        data: JSON.stringify({ ok: true, ts: Date.now() }),
      })
    } catch {
      unsubscribe()
      return
    }

    const HEARTBEAT_MS = 25_000
    let lastBeat = Date.now()

    while (!stream.aborted) {
      try {
        while (queue.length > 0 && !stream.aborted) {
          const entry = queue.shift()
          if (!entry) continue
          await stream.writeSSE({
            event: 'mail',
            id: entry.item.id,
            data: JSON.stringify({
              item: entry.item,
              addresses: entry.addresses,
            }),
          })
        }
        if (stream.aborted) break
        if (Date.now() - lastBeat >= HEARTBEAT_MS) {
          await stream.writeSSE({ event: 'ping', data: String(Date.now()) })
          lastBeat = Date.now()
        }
      } catch {
        break
      }

      if (queue.length === 0 && !stream.aborted) {
        await new Promise<void>((resolve) => {
          wake = resolve
          setTimeout(resolve, 5000)
        })
        wake = null
      }
    }
  })
})

email.patch('/:id/trash', requireUser, async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')
  if (!emailBelongsToUser(id, user.id)) {
    return c.json({ error: 'Not Found' }, 404)
  }
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid json' }, 400)
  }
  if (!body || typeof body !== 'object' || !('trashed' in body)) {
    return c.json({ error: 'trashed required' }, 400)
  }
  const trashed = (body as { trashed: unknown }).trashed
  if (typeof trashed !== 'boolean') {
    return c.json({ error: 'trashed must be boolean' }, 400)
  }
  setEmailTrashed(user.id, id, trashed)
  return c.json({ ok: true, trashed })
})

email.patch('/:id/star', requireUser, async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')
  if (!emailBelongsToUser(id, user.id)) {
    return c.json({ error: 'Not Found' }, 404)
  }
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid json' }, 400)
  }
  if (!body || typeof body !== 'object' || !('starred' in body)) {
    return c.json({ error: 'starred required' }, 400)
  }
  const starred = (body as { starred: unknown }).starred
  if (typeof starred !== 'boolean') {
    return c.json({ error: 'starred must be boolean' }, 400)
  }
  setEmailStarred(user.id, id, starred)
  return c.json({ ok: true, starred })
})

email.get('/:id/raw', requireUser, (c) => {
  const user = c.get('user')
  const id = c.req.param('id')
  if (!emailBelongsToUser(id, user.id)) {
    return c.json({ error: 'Not Found' }, 404)
  }
  const raw = getRawById(id)
  if (!raw) return c.json({ error: 'Not Found' }, 404)
  c.header('Content-Type', 'message/rfc822')
  c.header('Content-Disposition', `attachment; filename="${id}.eml"`)
  return c.body(new Uint8Array(raw))
})

email.get('/:id', requireUser, (c) => {
  const user = c.get('user')
  const id = c.req.param('id')
  if (!emailBelongsToUser(id, user.id)) {
    return c.json({ error: 'Not Found' }, 404)
  }
  const row = getEmailById(id, user.id)
  if (!row) return c.json({ error: 'Not Found' }, 404)
  return c.json(row)
})

export default email
