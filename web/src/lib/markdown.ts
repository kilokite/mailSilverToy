import { marked } from "marked"
import DOMPurify from "dompurify"

marked.setOptions({ gfm: true, breaks: true })

export function mdToHtml(src: string): string {
  if (!src.trim()) return ""
  const raw = marked.parse(src, { async: false }) as string
  return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } })
}

export function sanitizeHtml(html: string): string {
  if (!html.trim()) return ""
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })
}

/** 富文本 HTML 转纯文本，用作 text 回退 */
export function htmlToPlainText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html")
  return (doc.body.textContent ?? "").trim()
}
