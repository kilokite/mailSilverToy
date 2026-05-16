import { randomUUID } from 'node:crypto'
import { getDb } from '../../db/sqlite.js'
import type { HookEventName } from './registry.js'

export type HookSubscriptionRow = {
  id: string
  owner_user_id: string | null
  event: HookEventName
  target_url: string
  secret: string | null
  active: number
  filter_json: string | null
  headers_json: string | null
  created_at: string
}

export type HookSubscription = Omit<HookSubscriptionRow, 'active'> & {
  active: boolean
}

export type CreateSubscriptionInput = {
  ownerUserId: string | null
  event: HookEventName
  targetUrl: string
  secret: string | null
  headersJson: string | null
  filterJson: string | null
}

export type UpdateSubscriptionInput = {
  targetUrl?: string
  secret?: string | null
  active?: boolean
  headersJson?: string | null
  filterJson?: string | null
}

function toModel(row: HookSubscriptionRow): HookSubscription {
  return {
    ...row,
    active: row.active === 1,
  }
}

export function createSubscription(input: CreateSubscriptionInput): HookSubscription {
  const row: HookSubscriptionRow = {
    id: randomUUID(),
    owner_user_id: input.ownerUserId,
    event: input.event,
    target_url: input.targetUrl,
    secret: input.secret,
    active: 1,
    filter_json: input.filterJson,
    headers_json: input.headersJson,
    created_at: new Date().toISOString(),
  }
  getDb()
    .prepare(
      `INSERT INTO hook_subscriptions (
        id, owner_user_id, event, target_url, secret, active, filter_json, headers_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.id,
      row.owner_user_id,
      row.event,
      row.target_url,
      row.secret,
      row.active,
      row.filter_json,
      row.headers_json,
      row.created_at,
    )
  return toModel(row)
}

export function listSubscriptionsByOwner(ownerUserId: string): HookSubscription[] {
  const rows = getDb()
    .prepare(
      `SELECT id, owner_user_id, event, target_url, secret, active, filter_json, headers_json, created_at
       FROM hook_subscriptions
       WHERE owner_user_id = ?
       ORDER BY created_at DESC`,
    )
    .all(ownerUserId) as HookSubscriptionRow[]
  return rows.map(toModel)
}

export function getSubscriptionOwnedBy(
  subscriptionId: string,
  ownerUserId: string,
): HookSubscription | null {
  const row = getDb()
    .prepare(
      `SELECT id, owner_user_id, event, target_url, secret, active, filter_json, headers_json, created_at
       FROM hook_subscriptions
       WHERE id = ? AND owner_user_id = ?`,
    )
    .get(subscriptionId, ownerUserId) as HookSubscriptionRow | undefined
  return row ? toModel(row) : null
}

export function deleteSubscriptionOwnedBy(
  subscriptionId: string,
  ownerUserId: string,
): boolean {
  const info = getDb()
    .prepare(`DELETE FROM hook_subscriptions WHERE id = ? AND owner_user_id = ?`)
    .run(subscriptionId, ownerUserId)
  return info.changes > 0
}

export function updateSubscriptionOwnedBy(
  subscriptionId: string,
  ownerUserId: string,
  patch: UpdateSubscriptionInput,
): HookSubscription | null {
  const sets: string[] = []
  const args: unknown[] = []
  if (patch.targetUrl !== undefined) {
    sets.push('target_url = ?')
    args.push(patch.targetUrl)
  }
  if (patch.secret !== undefined) {
    sets.push('secret = ?')
    args.push(patch.secret)
  }
  if (patch.active !== undefined) {
    sets.push('active = ?')
    args.push(patch.active ? 1 : 0)
  }
  if (patch.headersJson !== undefined) {
    sets.push('headers_json = ?')
    args.push(patch.headersJson)
  }
  if (patch.filterJson !== undefined) {
    sets.push('filter_json = ?')
    args.push(patch.filterJson)
  }
  if (sets.length === 0) return getSubscriptionOwnedBy(subscriptionId, ownerUserId)

  args.push(subscriptionId, ownerUserId)
  getDb()
    .prepare(
      `UPDATE hook_subscriptions
       SET ${sets.join(', ')}
       WHERE id = ? AND owner_user_id = ?`,
    )
    .run(...args)

  return getSubscriptionOwnedBy(subscriptionId, ownerUserId)
}

export function listActiveSubscriptionsByEvent(
  event: HookEventName,
): HookSubscription[] {
  const rows = getDb()
    .prepare(
      `SELECT id, owner_user_id, event, target_url, secret, active, filter_json, headers_json, created_at
       FROM hook_subscriptions
       WHERE event = ? AND active = 1`,
    )
    .all(event) as HookSubscriptionRow[]
  return rows.map(toModel)
}

export function listSystemSubscriptions(): HookSubscription[] {
  const rows = getDb()
    .prepare(
      `SELECT id, owner_user_id, event, target_url, secret, active, filter_json, headers_json, created_at
       FROM hook_subscriptions
       WHERE owner_user_id IS NULL
       ORDER BY created_at DESC`,
    )
    .all() as HookSubscriptionRow[]
  return rows.map(toModel)
}

export function getSystemSubscription(subscriptionId: string): HookSubscription | null {
  const row = getDb()
    .prepare(
      `SELECT id, owner_user_id, event, target_url, secret, active, filter_json, headers_json, created_at
       FROM hook_subscriptions
       WHERE id = ? AND owner_user_id IS NULL`,
    )
    .get(subscriptionId) as HookSubscriptionRow | undefined
  return row ? toModel(row) : null
}

export function deleteSystemSubscription(subscriptionId: string): boolean {
  const info = getDb()
    .prepare(`DELETE FROM hook_subscriptions WHERE id = ? AND owner_user_id IS NULL`)
    .run(subscriptionId)
  return info.changes > 0
}

export function updateSystemSubscription(
  subscriptionId: string,
  patch: UpdateSubscriptionInput,
): HookSubscription | null {
  const sets: string[] = []
  const args: unknown[] = []
  if (patch.targetUrl !== undefined) {
    sets.push('target_url = ?')
    args.push(patch.targetUrl)
  }
  if (patch.secret !== undefined) {
    sets.push('secret = ?')
    args.push(patch.secret)
  }
  if (patch.active !== undefined) {
    sets.push('active = ?')
    args.push(patch.active ? 1 : 0)
  }
  if (patch.headersJson !== undefined) {
    sets.push('headers_json = ?')
    args.push(patch.headersJson)
  }
  if (patch.filterJson !== undefined) {
    sets.push('filter_json = ?')
    args.push(patch.filterJson)
  }
  if (sets.length === 0) return getSystemSubscription(subscriptionId)

  args.push(subscriptionId)
  getDb()
    .prepare(
      `UPDATE hook_subscriptions
       SET ${sets.join(', ')}
       WHERE id = ? AND owner_user_id IS NULL`,
    )
    .run(...args)

  return getSystemSubscription(subscriptionId)
}
