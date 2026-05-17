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
  listEmails,
} from '../services/emailRepo.js'
import { emitEmailNew, subscribeEmailNew } from '../services/emailBus.js'
import { listEmailsOfUser } from '../services/userEmailRepo.js'

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
  const items = listEmails({
    limit: Number.isFinite(limit) ? limit : 20,
    before,
    userId: user.id,
    recipientAddress: addressRaw,
    q,
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
  const row = getEmailById(id)
  if (!row) return c.json({ error: 'Not Found' }, 404)
  return c.json(row)
})

export default email
