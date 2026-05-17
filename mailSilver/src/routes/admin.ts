import { Hono } from 'hono'
import { requireUser } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/admin.js'
import {
  getUserById,
  listUsersWithEmailCounts,
  updateUserMaxEmails,
} from '../services/userRepo.js'
import {
  EmailQuotaExceededError,
  EmailTakenError,
  addEmailForUser,
  addressLooksValid,
  countEmailsOfUser,
  deleteEmailForUser,
  listAllUserEmails,
  listEmailsOfUser,
  normalizeAddressInput,
} from '../services/userEmailRepo.js'
import { buildTestPayload, emitHook, HOOK_EVENTS, isHookEventName } from '../services/hooks/index.js'
import { listDeliveriesBySubscription } from '../services/hooks/deliveryRepo.js'
import {
  createSubscription,
  deleteSystemSubscription,
  getSystemSubscription,
  listSystemSubscriptions,
  updateSystemSubscription,
} from '../services/hooks/subscriptionRepo.js'

const admin = new Hono()

type CreateBody = {
  event?: unknown
  target_url?: unknown
  secret?: unknown
  headers?: unknown
}

type PatchBody = {
  target_url?: unknown
  secret?: unknown
  active?: unknown
  headers?: unknown
}

function parseHeadersJson(input: unknown): string | null {
  if (input == null) return null
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input)) {
    if (!k.trim()) continue
    if (typeof v === 'string') out[k] = v
    else if (v != null) out[k] = String(v)
  }
  return JSON.stringify(out)
}

function asTrimmedString(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s ? s : null
}

function parseUrl(input: unknown): string | null {
  const s = asTrimmedString(input)
  if (!s) return null
  try {
    const u = new URL(s)
    if (!['http:', 'https:'].includes(u.protocol)) return null
    return u.toString()
  } catch {
    return null
  }
}

admin.get('/users', requireUser, requireAdmin, (c) => {
  const rows = listUsersWithEmailCounts()
  const emailsByUser = new Map<string, string[]>()
  for (const row of listAllUserEmails()) {
    const list = emailsByUser.get(row.user_id)
    if (list) list.push(row.address)
    else emailsByUser.set(row.user_id, [row.address])
  }
  return c.json({
    users: rows.map((u) => ({
      id: u.id,
      username: u.username,
      emails: emailsByUser.get(u.id) ?? [],
      created_at: u.created_at,
      last_login_at: u.last_login_at,
      max_emails: u.max_emails,
      owned_email_count: u.owned_email_count,
      email_count: u.email_count,
    })),
  })
})

admin.patch('/users/:id', requireUser, requireAdmin, async (c) => {
  const userId = c.req.param('id')
  const body = (await c.req.json().catch(() => null)) as { max_emails?: unknown } | null
  if (!body || typeof body.max_emails !== 'number' || !Number.isInteger(body.max_emails)) {
    return c.json({ error: 'invalid max_emails' }, 400)
  }
  const maxEmails = body.max_emails
  if (maxEmails < 1) {
    return c.json({ error: 'max_emails must be at least 1' }, 400)
  }
  if (!getUserById(userId)) {
    return c.json({ error: 'Not Found' }, 404)
  }
  const owned = countEmailsOfUser(userId)
  if (maxEmails < owned) {
    return c.json(
      {
        error: 'max_emails cannot be less than owned email count',
        owned_email_count: owned,
      },
      400,
    )
  }
  const updated = updateUserMaxEmails(userId, maxEmails)
  if (!updated) return c.json({ error: 'Not Found' }, 404)
  return c.json({
    ok: true,
    user: {
      id: updated.id,
      username: updated.username,
      max_emails: updated.max_emails,
    },
  })
})

admin.post('/users/:id/emails', requireUser, requireAdmin, async (c) => {
  const userId = c.req.param('id')
  const target = getUserById(userId)
  if (!target) return c.json({ error: 'Not Found' }, 404)

  const body = await c.req.json().catch(() => null)
  const address = normalizeAddressInput(body)
  if (!address || !addressLooksValid(address)) {
    return c.json({ error: '邮箱地址不合法或后缀不受支持' }, 400)
  }
  try {
    addEmailForUser(userId, address)
  } catch (e) {
    if (e instanceof EmailTakenError) {
      return c.json({ error: '该邮箱已被占用' }, 409)
    }
    if (e instanceof EmailQuotaExceededError) {
      return c.json(
        { error: '已达邮箱数量上限', max_emails: e.maxEmails },
        403,
      )
    }
    throw e
  }
  emitHook('user:email_added', {
    userId: target.id,
    username: target.username,
    address,
  })
  return c.json({ ok: true, emails: listEmailsOfUser(userId) })
})

admin.delete('/users/:id/emails/:address', requireUser, requireAdmin, (c) => {
  const userId = c.req.param('id')
  if (!getUserById(userId)) return c.json({ error: 'Not Found' }, 404)

  const address = decodeURIComponent(c.req.param('address')).trim().toLowerCase()
  if (!addressLooksValid(address)) {
    return c.json({ error: '邮箱地址不合法或后缀不受支持' }, 400)
  }
  const emails = listEmailsOfUser(userId)
  if (!emails.includes(address)) {
    return c.json({ error: 'Not Found' }, 404)
  }
  if (emails.length <= 1) {
    return c.json({ error: '至少保留一个邮箱地址' }, 400)
  }
  deleteEmailForUser(userId, address)
  return c.json({ ok: true, emails: listEmailsOfUser(userId) })
})

admin.get('/hooks/events', requireUser, requireAdmin, (c) => {
  return c.json({ events: HOOK_EVENTS.filter((e) => e.scope === 'global') })
})

admin.get('/hooks/subscriptions', requireUser, requireAdmin, (c) => {
  return c.json({ items: listSystemSubscriptions() })
})

admin.post('/hooks/subscriptions', requireUser, requireAdmin, async (c) => {
  const body = (await c.req.json().catch(() => null)) as CreateBody | null
  if (!body) return c.json({ error: 'invalid body' }, 400)

  const event = asTrimmedString(body.event)
  if (!event || !isHookEventName(event)) {
    return c.json({ error: 'invalid event' }, 400)
  }
  const meta = HOOK_EVENTS.find((x) => x.name === event)
  if (!meta || meta.scope !== 'global') {
    return c.json({ error: 'forbidden event' }, 403)
  }
  const targetUrl = parseUrl(body.target_url)
  if (!targetUrl) {
    return c.json({ error: 'invalid target_url' }, 400)
  }
  const secretRaw = body.secret
  const secret =
    typeof secretRaw === 'string'
      ? secretRaw.trim() || null
      : secretRaw == null
        ? null
        : String(secretRaw)
  const headersJson = parseHeadersJson(body.headers)

  const created = createSubscription({
    ownerUserId: null,
    event,
    targetUrl,
    secret,
    headersJson,
    filterJson: null,
  })
  return c.json({ ok: true, item: created }, 201)
})

admin.patch('/hooks/subscriptions/:id', requireUser, requireAdmin, async (c) => {
  const id = c.req.param('id')
  const body = (await c.req.json().catch(() => null)) as PatchBody | null
  if (!body) return c.json({ error: 'invalid body' }, 400)

  const patch: {
    targetUrl?: string
    secret?: string | null
    active?: boolean
    headersJson?: string | null
  } = {}

  if (body.target_url !== undefined) {
    const targetUrl = parseUrl(body.target_url)
    if (!targetUrl) return c.json({ error: 'invalid target_url' }, 400)
    patch.targetUrl = targetUrl
  }
  if (body.secret !== undefined) {
    if (body.secret === null) patch.secret = null
    else if (typeof body.secret === 'string') patch.secret = body.secret.trim() || null
    else patch.secret = String(body.secret)
  }
  if (body.active !== undefined) {
    if (typeof body.active !== 'boolean') return c.json({ error: 'invalid active' }, 400)
    patch.active = body.active
  }
  if (body.headers !== undefined) {
    const headersJson = parseHeadersJson(body.headers)
    if (headersJson === null && body.headers !== null) {
      return c.json({ error: 'invalid headers' }, 400)
    }
    patch.headersJson = headersJson
  }

  const updated = updateSystemSubscription(id, patch)
  if (!updated) return c.json({ error: 'Not Found' }, 404)
  return c.json({ ok: true, item: updated })
})

admin.delete('/hooks/subscriptions/:id', requireUser, requireAdmin, (c) => {
  const id = c.req.param('id')
  const ok = deleteSystemSubscription(id)
  if (!ok) return c.json({ error: 'Not Found' }, 404)
  return c.json({ ok: true })
})

admin.get('/hooks/subscriptions/:id/deliveries', requireUser, requireAdmin, (c) => {
  const id = c.req.param('id')
  const sub = getSystemSubscription(id)
  if (!sub) return c.json({ error: 'Not Found' }, 404)
  const limit = Number(c.req.query('limit') ?? 50)
  const items = listDeliveriesBySubscription(sub.id, Number.isFinite(limit) ? limit : 50)
  return c.json({ items })
})

admin.post('/hooks/subscriptions/:id/test', requireUser, requireAdmin, (c) => {
  const id = c.req.param('id')
  const sub = getSystemSubscription(id)
  if (!sub) return c.json({ error: 'Not Found' }, 404)
  const actor = c.get('user')
  const payload = buildTestPayload(sub.event, actor)
  emitHook(sub.event, payload)
  return c.json({ ok: true, queued: true, event: sub.event })
})

export default admin
