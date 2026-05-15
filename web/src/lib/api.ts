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

class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: "application/json", ...init?.headers },
    ...init,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new ApiError(res.status, text || `HTTP ${res.status}`)
  }
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

export { ApiError }
