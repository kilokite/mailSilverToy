/**
 * 后端接入：
 * - dev：Vite 把 /api 代理到 VITE_DEV_BACKEND（默认 http://localhost:23879）
 * - prod：前端产物被 mailSilver 同源托管，相对路径 /api 直接命中
 * - 例外：可通过 VITE_API_BASE 覆盖（如把前端独立部署到别的域名）
 */
export const API_BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ?? ""

export type ParseStatus = "pending" | "ok" | "error"

export type EmailListItem = {
  id: string
  received_at: string
  parse_status: ParseStatus
  subject: string | null
  from_addr: string | null
  from_name: string | null
  date: string | null
  starred: boolean
  trashed: boolean
}

export type AddrLite = { name?: string; address?: string }

export type EmailParsed = {
  message_id: string | null
  subject: string | null
  from_addr: string | null
  from_name: string | null
  to: AddrLite[] | null
  cc: AddrLite[] | null
  bcc: AddrLite[] | null
  reply_to: AddrLite[] | null
  date: string | null
  text: string | null
  html: string | null
  headers: Record<string, unknown> | null
  attachments_meta:
    | Array<{ filename: string | null; contentType: string; size: number }>
    | null
}

export type EmailDetail = {
  id: string
  received_at: string
  size: number
  body_sha256: string
  parse_status: ParseStatus
  parse_error: string | null
  parsed: EmailParsed | null
  starred: boolean
  trashed: boolean
}

export type AuthUser = {
  id: string
  username: string
  emails: string[]
  max_emails: number
}

export type MeResponse = {
  user: AuthUser | null
  admin_access: boolean
  domains: string[]
}

export type AdminUserRow = {
  id: string
  username: string
  emails: string[]
  created_at: string
  last_login_at: string | null
  max_emails: number
  owned_email_count: number
  email_count: number
}

class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/**
 * 401 全局回调：由 AuthProvider 在挂载时注册，
 * 当除 auth 自身端点外的请求返回 401 时被触发，
 * 用于让会话过期的用户自动回到匿名态（被路由守卫踢回 /login）。
 */
let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn
}

// 这些是 auth 自身端点，401 由调用方自行处理（如登录失败显示错误），
// 不应触发"会话过期"的全局副作用。
const AUTH_PATH_PREFIXES = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/me",
  "/api/auth/logout",
]

function isAuthPath(path: string) {
  return AUTH_PATH_PREFIXES.some((p) => path.startsWith(p))
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (!headers.has("Accept")) headers.set("Accept", "application/json")
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...init,
    headers,
  })
  if (!res.ok) {
    if (res.status === 401 && !isAuthPath(path)) {
      onUnauthorized?.()
    }
    let message = `HTTP ${res.status}`
    const text = await res.text().catch(() => "")
    if (text) {
      try {
        const j = JSON.parse(text) as { error?: string }
        if (j?.error) message = j.error
        else message = text
      } catch {
        message = text
      }
    }
    throw new ApiError(res.status, message)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

/** 收件箱筛选：`all` 为全部邮箱聚合，否则为单个完整地址 */
export type MailboxFilter = "all" | (string & {})

export function listEmails(
  params: {
    limit?: number
    before?: string
    address?: MailboxFilter
    q?: string
    starred?: boolean
    trashed?: boolean
  } = {},
) {
  const q = new URLSearchParams()
  if (params.limit) q.set("limit", String(params.limit))
  if (params.before) q.set("before", params.before)
  const search = params.q?.trim()
  if (search) q.set("q", search)
  if (params.starred) q.set("starred", "1")
  if (params.trashed) q.set("trashed", "1")
  if (params.address && params.address !== "all") {
    q.set("address", params.address)
  }
  const qs = q.toString()
  return request<{ items: EmailListItem[] }>(
    `/api/email${qs ? `?${qs}` : ""}`,
  )
}

export function getEmail(id: string) {
  return request<EmailDetail>(`/api/email/${encodeURIComponent(id)}`)
}

export function setEmailStarred(id: string, starred: boolean) {
  return request<{ ok: true; starred: boolean }>(
    `/api/email/${encodeURIComponent(id)}/star`,
    { method: "PATCH", body: JSON.stringify({ starred }) },
  )
}

export function setEmailTrashed(id: string, trashed: boolean) {
  return request<{ ok: true; trashed: boolean }>(
    `/api/email/${encodeURIComponent(id)}/trash`,
    { method: "PATCH", body: JSON.stringify({ trashed }) },
  )
}

export function rawEmailUrl(id: string) {
  return `${API_BASE}/api/email/${encodeURIComponent(id)}/raw`
}

export function getMe() {
  return request<MeResponse>(`/api/auth/me`)
}

export function login(username: string, password: string) {
  return request<{ ok: true; user: AuthUser; admin_access: boolean }>(
    `/api/auth/login`,
    {
      method: "POST",
      body: JSON.stringify({ username, password }),
    },
  )
}

export function register(input: {
  username: string
  password: string
  initialEmail: string
}) {
  return request<{ ok: true; user: AuthUser; admin_access: boolean }>(
    `/api/auth/register`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  )
}

export function listAdminUsers() {
  return request<{ users: AdminUserRow[] }>(`/api/admin/users`)
}

export function patchAdminUserMaxEmails(userId: string, maxEmails: number) {
  return request<{
    ok: true
    user: { id: string; username: string; max_emails: number }
  }>(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: JSON.stringify({ max_emails: maxEmails }),
  })
}

export function addAdminUserEmail(
  userId: string,
  payload: { address?: string; prefix?: string; domain?: string },
) {
  return request<{ ok: true; emails: string[] }>(
    `/api/admin/users/${encodeURIComponent(userId)}/emails`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  )
}

export function deleteAdminUserEmail(userId: string, address: string) {
  return request<{ ok: true; emails: string[] }>(
    `/api/admin/users/${encodeURIComponent(userId)}/emails/${encodeURIComponent(address)}`,
    { method: "DELETE" },
  )
}

export function getMyEmails() {
  return request<{ emails: string[] }>(`/api/me/emails`)
}

export type SendCapability = { address: string; can_send: boolean }

export function getSendCapabilities() {
  return request<{ items: SendCapability[] }>(`/api/me/send-capabilities`)
}

export function sendOutboundMail(input: {
  from: string
  to: string
  subject: string
  text?: string
  html?: string
  cc?: string
  bcc?: string
  replyTo?: string
}) {
  const body: Record<string, string> = {
    from: input.from,
    to: input.to,
    subject: input.subject,
  }
  if (input.text) body.text = input.text
  if (input.html) body.html = input.html
  if (input.cc?.trim()) body.cc = input.cc.trim()
  if (input.bcc?.trim()) body.bcc = input.bcc.trim()
  if (input.replyTo?.trim()) body.replyTo = input.replyTo.trim()
  return request<{ ok: true; id: string }>(`/api/email/send`, {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export function addMyEmail(payload: { address?: string; prefix?: string; domain?: string }) {
  return request<{ ok: true; emails: string[] }>(`/api/me/emails`, {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export function deleteMyEmail(address: string) {
  return request<{ ok: true; emails: string[] }>(
    `/api/me/emails/${encodeURIComponent(address)}`,
    { method: "DELETE" },
  )
}

export function logout() {
  return request<{ ok: true }>(`/api/auth/logout`, { method: "POST" })
}

export type HookEventMeta = {
  name: string
  description: string
  scope: "user" | "global"
}

export type HookSubscription = {
  id: string
  owner_user_id: string | null
  event: string
  target_url: string
  secret: string | null
  active: boolean
  /** `email:new` 的 `filter_json` 字符串，结构同 {@link HookEmailFilter} */
  filter_json: string | null
  headers_json: string | null
  created_at: string
}

export type HookDelivery = {
  id: string
  subscription_id: string
  event: string
  status: "pending" | "success" | "failed"
  attempt: number
  http_status: number | null
  error: string | null
  request_body: string | null
  response_excerpt: string | null
  created_at: string
  finished_at: string | null
}

export function listHookEvents() {
  return request<{ events: HookEventMeta[] }>(`/api/hooks/events`)
}

export function listHookSubscriptions() {
  return request<{ items: HookSubscription[] }>(`/api/hooks/subscriptions`)
}

/**
 * `email:new` 订阅的监听范围。
 * - `null`：该用户全部收件邮箱
 * - `{ addresses }`：仅列出的地址（须为当前用户已拥有）
 */
export type HookEmailFilter = { addresses: string[] } | null

export function createHookSubscription(input: {
  event: string
  target_url: string
  secret?: string | null
  headers?: Record<string, string> | null
  /** 仅 `email:new` 有效 */
  filter?: HookEmailFilter
}) {
  return request<{ ok: true; item: HookSubscription }>(`/api/hooks/subscriptions`, {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function updateHookSubscription(
  id: string,
  patch: {
    target_url?: string
    secret?: string | null
    active?: boolean
    headers?: Record<string, string> | null
    /** 仅 `email:new` 有效 */
    filter?: HookEmailFilter
  },
) {
  return request<{ ok: true; item: HookSubscription }>(
    `/api/hooks/subscriptions/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    },
  )
}

export function deleteHookSubscription(id: string) {
  return request<{ ok: true }>(
    `/api/hooks/subscriptions/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  )
}

export function listHookDeliveries(subscriptionId: string, limit = 50) {
  const q = new URLSearchParams({ limit: String(limit) })
  return request<{ items: HookDelivery[] }>(
    `/api/hooks/subscriptions/${encodeURIComponent(subscriptionId)}/deliveries?${q}`,
  )
}

export function testHookSubscription(id: string) {
  return request<{ ok: true; queued: boolean; event: string }>(
    `/api/hooks/subscriptions/${encodeURIComponent(id)}/test`,
    { method: "POST" },
  )
}

export function listAdminHookEvents() {
  return request<{ events: HookEventMeta[] }>(`/api/admin/hooks/events`)
}

export function listAdminHookSubscriptions() {
  return request<{ items: HookSubscription[] }>(`/api/admin/hooks/subscriptions`)
}

export function createAdminHookSubscription(input: {
  event: string
  target_url: string
  secret?: string | null
  headers?: Record<string, string> | null
}) {
  return request<{ ok: true; item: HookSubscription }>(`/api/admin/hooks/subscriptions`, {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function updateAdminHookSubscription(
  id: string,
  patch: {
    target_url?: string
    secret?: string | null
    active?: boolean
    headers?: Record<string, string> | null
  },
) {
  return request<{ ok: true; item: HookSubscription }>(
    `/api/admin/hooks/subscriptions/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    },
  )
}

export function deleteAdminHookSubscription(id: string) {
  return request<{ ok: true }>(
    `/api/admin/hooks/subscriptions/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  )
}

export function listAdminHookDeliveries(subscriptionId: string, limit = 50) {
  const q = new URLSearchParams({ limit: String(limit) })
  return request<{ items: HookDelivery[] }>(
    `/api/admin/hooks/subscriptions/${encodeURIComponent(subscriptionId)}/deliveries?${q}`,
  )
}

export function testAdminHookSubscription(id: string) {
  return request<{ ok: true; queued: boolean; event: string }>(
    `/api/admin/hooks/subscriptions/${encodeURIComponent(id)}/test`,
    { method: "POST" },
  )
}

/** 创建 EventSource 订阅新邮件，同源走 cookie；返回连接对象供调用方关闭 */
export function openMailStream(handlers: {
  onMail: (item: EmailListItem, addresses: string[]) => void
  onReady?: () => void
  onError?: (e: Event) => void
}): EventSource {
  const es = new EventSource(`${API_BASE}/api/email/stream`, {
    withCredentials: true,
  })
  es.addEventListener("ready", () => handlers.onReady?.())
  es.addEventListener("mail", (e) => {
    try {
      const raw = JSON.parse((e as MessageEvent).data) as
        | EmailListItem
        | { item: EmailListItem; addresses?: string[] }
      if (raw && typeof raw === "object" && "item" in raw) {
        handlers.onMail(raw.item, raw.addresses ?? [])
        return
      }
      handlers.onMail(raw as EmailListItem, [])
    } catch {
      /* ignore malformed */
    }
  })
  if (handlers.onError) es.onerror = handlers.onError
  return es
}

export { ApiError }
