import { randomUUID } from 'node:crypto'
import { getDb } from '../../db/sqlite.js'
import type { HookEventName } from './registry.js'

export type DeliveryStatus = 'pending' | 'success' | 'failed'

export type HookDeliveryRow = {
  id: string
  subscription_id: string
  event: HookEventName
  status: DeliveryStatus
  attempt: number
  http_status: number | null
  error: string | null
  request_body: string | null
  response_excerpt: string | null
  created_at: string
  finished_at: string | null
}

export function createDeliveryLog(input: {
  subscriptionId: string
  event: HookEventName
  attempt: number
  requestBody: string
}): HookDeliveryRow {
  const row: HookDeliveryRow = {
    id: randomUUID(),
    subscription_id: input.subscriptionId,
    event: input.event,
    status: 'pending',
    attempt: input.attempt,
    http_status: null,
    error: null,
    request_body: input.requestBody,
    response_excerpt: null,
    created_at: new Date().toISOString(),
    finished_at: null,
  }
  getDb()
    .prepare(
      `INSERT INTO hook_deliveries (
        id, subscription_id, event, status, attempt, http_status, error, request_body, response_excerpt, created_at, finished_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.id,
      row.subscription_id,
      row.event,
      row.status,
      row.attempt,
      row.http_status,
      row.error,
      row.request_body,
      row.response_excerpt,
      row.created_at,
      row.finished_at,
    )
  return row
}

export function finishDeliveryLog(
  id: string,
  patch: {
    status: Exclude<DeliveryStatus, 'pending'>
    httpStatus: number | null
    error: string | null
    responseExcerpt: string | null
  },
): void {
  getDb()
    .prepare(
      `UPDATE hook_deliveries
       SET status = ?, http_status = ?, error = ?, response_excerpt = ?, finished_at = ?
       WHERE id = ?`,
    )
    .run(
      patch.status,
      patch.httpStatus,
      patch.error,
      patch.responseExcerpt,
      new Date().toISOString(),
      id,
    )
}

export function listDeliveriesBySubscription(
  subscriptionId: string,
  limit = 100,
): HookDeliveryRow[] {
  const safeLimit = Math.min(Math.max(1, limit), 200)
  return getDb()
    .prepare(
      `SELECT id, subscription_id, event, status, attempt, http_status, error, request_body, response_excerpt, created_at, finished_at
       FROM hook_deliveries
       WHERE subscription_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(subscriptionId, safeLimit) as HookDeliveryRow[]
}

export function trimDeliveriesBySubscription(
  subscriptionId: string,
  keepLatest = 200,
): void {
  const keep = Math.max(1, keepLatest)
  getDb()
    .prepare(
      `DELETE FROM hook_deliveries
       WHERE subscription_id = ?
         AND id NOT IN (
           SELECT id
           FROM hook_deliveries
           WHERE subscription_id = ?
           ORDER BY created_at DESC
           LIMIT ?
         )`,
    )
    .run(subscriptionId, subscriptionId, keep)
}
