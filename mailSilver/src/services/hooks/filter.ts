import { listEmailsOfUser } from '../userEmailRepo.js'
import type { HookSubscription } from './subscriptionRepo.js'

/** `email:new` 订阅的 filter_json 结构：仅监听列出的收件地址 */
export type EmailNewFilter = {
  /** 小写完整邮箱地址，须属于订阅所有者 */
  addresses: string[]
}

/**
 * 从数据库 `filter_json` 解析 `email:new` 过滤条件。
 * @param raw - `hook_subscriptions.filter_json`；空或非法时视为未配置
 * @returns 解析成功且含至少一个地址时返回过滤对象，否则 `null`
 */
export function parseEmailNewFilter(raw: string | null): EmailNewFilter | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const addresses = (parsed as { addresses?: unknown }).addresses
    if (!Array.isArray(addresses)) return null
    const out = addresses
      .filter((a): a is string => typeof a === 'string')
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean)
    if (out.length === 0) return null
    return { addresses: Array.from(new Set(out)) }
  } catch {
    return null
  }
}

/**
 * 将 `EmailNewFilter` 序列化为可写入 `filter_json` 的字符串。
 * @param filter - 过滤条件；无地址时返回 `null`（表示监听全部邮箱）
 */
export function serializeEmailNewFilter(filter: EmailNewFilter | null): string | null {
  if (!filter || filter.addresses.length === 0) return null
  return JSON.stringify({ addresses: filter.addresses })
}

/**
 * 计算订阅实际监听的收件地址集合。
 * @param ownerUserId - 订阅所属用户 ID
 * @param filterJson - 订阅的 `filter_json`；未配置时为该用户全部邮箱
 */
export function getWatchAddresses(
  ownerUserId: string,
  filterJson: string | null,
): string[] {
  const owned = listEmailsOfUser(ownerUserId).map((a) => a.toLowerCase())
  const filter = parseEmailNewFilter(filterJson)
  if (!filter) return owned
  const ownedSet = new Set(owned)
  return filter.addresses.filter((a) => ownedSet.has(a))
}

/**
 * 判断 `email:new` 事件是否命中该订阅，并返回命中的收件地址。
 * @param sub - 须含 `owner_user_id` 与 `filter_json`
 * @param eventAddresses - 事件载荷中的收件人地址（小写）
 * @returns 与监听集合交集的非空地址列表；不投递时返回 `[]`
 */
export function matchesEmailNewSubscription(
  sub: Pick<HookSubscription, 'owner_user_id' | 'filter_json'>,
  eventAddresses: string[],
): string[] {
  if (!sub.owner_user_id) return []
  const watch = getWatchAddresses(sub.owner_user_id, sub.filter_json)
  if (watch.length === 0) return []
  const watchSet = new Set(watch)
  const hits = eventAddresses
    .map((a) => a.toLowerCase())
    .filter((a) => watchSet.has(a))
  return Array.from(new Set(hits))
}

/**
 * 全局事件（如 `user:registered`）是否应投递到该订阅。
 * @param sub - 系统级订阅的 `owner_user_id` 为 `null`
 */
export function shouldDeliverGlobalEvent(
  sub: Pick<HookSubscription, 'owner_user_id'>,
): boolean {
  return sub.owner_user_id == null
}

/** 解析 API 请求体中 `filter` 字段的结果 */
export type ParseFilterResult =
  | { ok: true; filterJson: string | null }
  | { ok: false; error: string }

/**
 * 校验并规范化创建/更新订阅时的 `filter` 请求体。
 * @param input - `{ addresses: string[] }`、`null` 或 `undefined`（表示监听全部）
 * @param ownedAddresses - 当前用户拥有的收件地址，用于校验 `addresses` 子集
 */
export function parseEmailFilterInput(
  input: unknown,
  ownedAddresses: string[],
): ParseFilterResult {
  if (input === undefined) {
    return { ok: true, filterJson: null }
  }
  if (input === null) {
    return { ok: true, filterJson: null }
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'invalid filter' }
  }
  const addresses = (input as { addresses?: unknown }).addresses
  if (addresses === undefined) {
    return { ok: true, filterJson: null }
  }
  if (!Array.isArray(addresses)) {
    return { ok: false, error: 'invalid filter.addresses' }
  }
  if (addresses.length === 0) {
    return { ok: false, error: 'filter.addresses must not be empty' }
  }
  const ownedSet = new Set(ownedAddresses.map((a) => a.toLowerCase()))
  const normalized: string[] = []
  for (const item of addresses) {
    if (typeof item !== 'string') {
      return { ok: false, error: 'invalid filter.addresses' }
    }
    const addr = item.trim().toLowerCase()
    if (!addr) continue
    if (!ownedSet.has(addr)) {
      return { ok: false, error: `address not owned: ${addr}` }
    }
    if (!normalized.includes(addr)) normalized.push(addr)
  }
  if (normalized.length === 0) {
    return { ok: false, error: 'filter.addresses must not be empty' }
  }
  return { ok: true, filterJson: serializeEmailNewFilter({ addresses: normalized }) }
}
