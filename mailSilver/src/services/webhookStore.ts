export type WebhookInfo = Record<string, unknown>

let info: WebhookInfo = {}
let updatedAt: string | null = null

export function getInfo(): { info: WebhookInfo; updatedAt: string | null } {
  return { info, updatedAt }
}

/**
 * 用原始字符串 payload 更新 info；非法 JSON 会被忽略并返回 false
 */
export function setInfoFromPayload(raw: string | undefined | null): boolean {
  if (!raw) return false
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      info = parsed as WebhookInfo
      updatedAt = new Date().toISOString()
      return true
    }
    return false
  } catch {
    return false
  }
}
