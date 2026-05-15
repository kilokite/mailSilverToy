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
}

export type AuthUser = {
  id: string
  prefix: string
  email: string
}

class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
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

export function listEmails(params: { limit?: number; before?: string } = {}) {
  const q = new URLSearchParams()
  if (params.limit) q.set("limit", String(params.limit))
  if (params.before) q.set("before", params.before)
  const qs = q.toString()
  return request<{ items: EmailListItem[] }>(
    `/api/email${qs ? `?${qs}` : ""}`,
  )
}

export function getEmail(id: string) {
  return request<EmailDetail>(`/api/email/${encodeURIComponent(id)}`)
}

export function rawEmailUrl(id: string) {
  return `${API_BASE}/api/email/${encodeURIComponent(id)}/raw`
}

export function getMe() {
  return request<{ user: AuthUser | null }>(`/api/auth/me`)
}

export function login(prefix: string, password: string) {
  return request<{ ok: true; user: AuthUser }>(`/api/auth/login`, {
    method: "POST",
    body: JSON.stringify({ prefix, password }),
  })
}

export function register(prefix: string, password: string) {
  return request<{ ok: true; user: AuthUser }>(`/api/auth/register`, {
    method: "POST",
    body: JSON.stringify({ prefix, password }),
  })
}

export function logout() {
  return request<{ ok: true }>(`/api/auth/logout`, { method: "POST" })
}

/** 创建 EventSource 订阅新邮件，同源走 cookie；返回连接对象供调用方关闭 */
export function openMailStream(handlers: {
  onMail: (item: EmailListItem) => void
  onReady?: () => void
  onError?: (e: Event) => void
}): EventSource {
  const es = new EventSource(`${API_BASE}/api/email/stream`, {
    withCredentials: true,
  })
  es.addEventListener("ready", () => handlers.onReady?.())
  es.addEventListener("mail", (e) => {
    try {
      const data = JSON.parse((e as MessageEvent).data) as EmailListItem
      handlers.onMail(data)
    } catch {
      /* ignore malformed */
    }
  })
  if (handlers.onError) es.onerror = handlers.onError
  return es
}

export { ApiError }
