/** 可选收件人：未传、空字符串、空数组视为 []；格式错误返回 null */
export function parseOptionalAddressList(v: unknown): string[] | null {
  if (v == null) return []
  if (typeof v === 'string' && !v.trim()) return []
  if (Array.isArray(v) && v.length === 0) return []
  return parseAddressList(v)
}

/** 解析收件人：字符串按逗号/分号拆分，或字符串数组 */
export function parseAddressList(v: unknown): string[] | null {
  let parts: string[]
  if (typeof v === 'string') {
    parts = v
      .split(/[,;]/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  } else if (Array.isArray(v)) {
    parts = v
      .map((x) => String(x).trim().toLowerCase())
      .filter((x) => x.length > 0)
  } else {
    return null
  }
  if (parts.length === 0) return null
  for (const addr of parts) {
    if (!addr.includes('@') || addr.startsWith('@')) return null
  }
  return parts
}
