import { Hono } from 'hono'
import { requireUser } from '../middleware/auth.js'
import { buildTestPayload, HOOK_EVENTS, isHookEventName } from '../services/hooks/index.js'
import { emitHook } from '../services/hooks/index.js'
import { listDeliveriesBySubscription } from '../services/hooks/deliveryRepo.js'
import {
  createSubscription,
  deleteSubscriptionOwnedBy,
  getSubscriptionOwnedBy,
  listSubscriptionsByOwner,
  updateSubscriptionOwnedBy,
} from '../services/hooks/subscriptionRepo.js'

const hooks = new Hono()

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

hooks.get('/events', requireUser, (c) => {
  return c.json({ events: HOOK_EVENTS.filter((e) => e.scope === 'user') })
})

hooks.get('/subscriptions', requireUser, (c) => {
  const user = c.get('user')
  const items = listSubscriptionsByOwner(user.id)
  return c.json({ items })
})

hooks.post('/subscriptions', requireUser, async (c) => {
  const user = c.get('user')
  const body = (await c.req.json().catch(() => null)) as CreateBody | null
  if (!body) return c.json({ error: 'invalid body' }, 400)

  const event = asTrimmedString(body.event)
  if (!event || !isHookEventName(event)) {
    return c.json({ error: 'invalid event' }, 400)
  }
  const meta = HOOK_EVENTS.find((x) => x.name === event)
  if (!meta || meta.scope !== 'user') {
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
    ownerUserId: user.id,
    event,
    targetUrl,
    secret,
    headersJson,
    filterJson: null,
  })
  return c.json({ ok: true, item: created }, 201)
})

hooks.patch('/subscriptions/:id', requireUser, async (c) => {
  const user = c.get('user')
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

  const updated = updateSubscriptionOwnedBy(id, user.id, patch)
  if (!updated) return c.json({ error: 'Not Found' }, 404)
  return c.json({ ok: true, item: updated })
})

hooks.delete('/subscriptions/:id', requireUser, (c) => {
  const user = c.get('user')
  const id = c.req.param('id')
  const ok = deleteSubscriptionOwnedBy(id, user.id)
  if (!ok) return c.json({ error: 'Not Found' }, 404)
  return c.json({ ok: true })
})

hooks.get('/subscriptions/:id/deliveries', requireUser, (c) => {
  const user = c.get('user')
  const id = c.req.param('id')
  const sub = getSubscriptionOwnedBy(id, user.id)
  if (!sub) return c.json({ error: 'Not Found' }, 404)
  const limit = Number(c.req.query('limit') ?? 50)
  const items = listDeliveriesBySubscription(sub.id, Number.isFinite(limit) ? limit : 50)
  return c.json({ items })
})

hooks.post('/subscriptions/:id/test', requireUser, (c) => {
  const user = c.get('user')
  const id = c.req.param('id')
  const sub = getSubscriptionOwnedBy(id, user.id)
  if (!sub) return c.json({ error: 'Not Found' }, 404)

  const payload = buildTestPayload(sub.event, user)
  emitHook(sub.event, payload)
  return c.json({ ok: true, queued: true, event: sub.event })
})

export default hooks
