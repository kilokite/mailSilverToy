import { createHmac } from 'node:crypto'
import type { HookEventName } from './registry.js'

export type HookPayloadEnvelope = {
  event: HookEventName
  delivery_id: string
  occurred_at: string
  data: unknown
}

export function signHookBody(body: string, secret: string): string {
  const hex = createHmac('sha256', secret).update(body).digest('hex')
  return `sha256=${hex}`
}

export function buildHookHeaders(input: {
  event: HookEventName
  deliveryId: string
  body: string
  secret: string | null
  customHeaders?: Record<string, string>
}): HeadersInit {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-hook-event': input.event,
    'x-hook-delivery': input.deliveryId,
    ...input.customHeaders,
  }
  if (input.secret && input.secret.trim()) {
    headers['x-hook-signature'] = signHookBody(input.body, input.secret)
  }
  return headers
}
