import { randomUUID } from 'node:crypto'
import {
  createDeliveryLog,
  finishDeliveryLog,
  trimDeliveriesBySubscription,
} from './deliveryRepo.js'
import { onHook } from './bus.js'
import { listActiveSubscriptionsByEvent } from './subscriptionRepo.js'
import type { HookEventMap, HookEventName } from './registry.js'
import { HOOK_EVENTS } from './registry.js'
import { buildHookHeaders, type HookPayloadEnvelope } from './signer.js'

const RETRY_DELAYS_MS = [1_000, 5_000, 30_000, 120_000, 600_000] as const
const REQUEST_TIMEOUT_MS = 10_000
const MAX_RESPONSE_EXCERPT = 2_000
const KEEP_DELIVERY_COUNT = 200

let started = false

function toText(input: unknown): string {
  if (typeof input === 'string') return input
  if (input == null) return ''
  return String(input)
}

function parseCustomHeaders(raw: string | null): Record<string, string> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (!k.trim()) continue
      out[k] = toText(v)
    }
    return out
  } catch {
    return {}
  }
}

async function deliverOnce<E extends HookEventName>(input: {
  subscription: {
    id: string
    event: E
    target_url: string
    secret: string | null
    headers_json: string | null
  }
  payload: HookPayloadEnvelope & { data: HookEventMap[E] }
  attempt: number
}): Promise<{ ok: boolean; status: number | null; error: string | null; responseExcerpt: string | null }> {
  const body = JSON.stringify(input.payload)
  const delivery = createDeliveryLog({
    subscriptionId: input.subscription.id,
    event: input.subscription.event,
    attempt: input.attempt,
    requestBody: body,
  })
  const headers = buildHookHeaders({
    event: input.subscription.event,
    deliveryId: delivery.id,
    body,
    secret: input.subscription.secret,
    customHeaders: parseCustomHeaders(input.subscription.headers_json),
  })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const resp = await fetch(input.subscription.target_url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    })
    const text = await resp.text().catch(() => '')
    const excerpt = text.slice(0, MAX_RESPONSE_EXCERPT)
    if (resp.ok) {
      finishDeliveryLog(delivery.id, {
        status: 'success',
        httpStatus: resp.status,
        error: null,
        responseExcerpt: excerpt || null,
      })
      trimDeliveriesBySubscription(input.subscription.id, KEEP_DELIVERY_COUNT)
      return { ok: true, status: resp.status, error: null, responseExcerpt: excerpt || null }
    }
    finishDeliveryLog(delivery.id, {
      status: 'failed',
      httpStatus: resp.status,
      error: `HTTP ${resp.status}`,
      responseExcerpt: excerpt || null,
    })
    trimDeliveriesBySubscription(input.subscription.id, KEEP_DELIVERY_COUNT)
    return { ok: false, status: resp.status, error: `HTTP ${resp.status}`, responseExcerpt: excerpt || null }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    finishDeliveryLog(delivery.id, {
      status: 'failed',
      httpStatus: null,
      error: message,
      responseExcerpt: null,
    })
    trimDeliveriesBySubscription(input.subscription.id, KEEP_DELIVERY_COUNT)
    return { ok: false, status: null, error: message, responseExcerpt: null }
  } finally {
    clearTimeout(timeout)
  }
}

function shouldRetry(attempt: number): boolean {
  return attempt <= RETRY_DELAYS_MS.length
}

function retryDelay(attempt: number): number {
  return RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]
}

async function deliverWithRetry<E extends HookEventName>(input: {
  subscription: {
    id: string
    event: E
    target_url: string
    secret: string | null
    headers_json: string | null
  }
  payload: HookPayloadEnvelope & { data: HookEventMap[E] }
  attempt?: number
}): Promise<void> {
  const attempt = input.attempt ?? 1
  const result = await deliverOnce({
    subscription: input.subscription,
    payload: input.payload,
    attempt,
  })
  if (result.ok) return
  if (!shouldRetry(attempt)) return

  const delayMs = retryDelay(attempt)
  setTimeout(() => {
    void deliverWithRetry({
      subscription: input.subscription,
      payload: input.payload,
      attempt: attempt + 1,
    })
  }, delayMs)
}

function registerEvent<E extends HookEventName>(event: E): void {
  onHook(event, (envelope) => {
    const subs = listActiveSubscriptionsByEvent(event)
    for (const sub of subs) {
      const payload: HookPayloadEnvelope & { data: HookEventMap[E] } = {
        event,
        delivery_id: randomUUID(),
        occurred_at: envelope.occurredAt,
        data: envelope.data,
      }
      void deliverWithRetry({
        subscription: {
          id: sub.id,
          event: event,
          target_url: sub.target_url,
          secret: sub.secret,
          headers_json: sub.headers_json,
        },
        payload,
      })
    }
  })
}

export function registerHookDispatcher(): void {
  if (started) return
  started = true
  for (const event of HOOK_EVENTS) {
    registerEvent(event.name)
  }
}
