import type { AddrLite, EmailDetail } from "@/lib/api"

export type AuthCheck = {
  protocol: string
  result: string
  detail?: string
}

export type EmailMetaSections = {
  authChecks: AuthCheck[]
  authHeaders: Array<{ name: string; value: string }>
  spamHeaders: Array<{ name: string; value: string }>
  receivedChain: string[]
  otherNotable: Array<{ name: string; value: string }>
  allHeaders: Array<{ name: string; value: string }>
}

const AUTH_HEADER_KEYS = new Set([
  "authentication-results",
  "arc-authentication-results",
  "received-spf",
  "dkim-signature",
  "arc-seal",
  "arc-message-signature",
])

const SPAM_HEADER_PATTERNS = [
  /^x-spam-/i,
  /^spam-/i,
  /^x-ms-exchange-organization-scl$/i,
  /^x-proofpoint-/i,
  /^x-gm-spam$/i,
  /^x-gm-phishy$/i,
  /^x-yahoo-newman-/i,
  /^x-icloud-hme$/i,
]

const NOTABLE_HEADER_KEYS = new Set([
  "return-path",
  "delivered-to",
  "x-original-to",
  "envelope-to",
  "x-mailer",
  "user-agent",
  "mime-version",
  "content-type",
  "list-unsubscribe",
  "precedence",
  "x-priority",
  "importance",
])

function headerKeyMatches(name: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(name))
}

function formatValue(v: unknown): string {
  if (v == null) return ""
  if (typeof v === "string") return v
  if (typeof v === "number" || typeof v === "boolean") return String(v)
  if (Array.isArray(v)) return v.map(formatValue).filter(Boolean).join("\n")
  if (typeof v === "object") {
    const o = v as Record<string, unknown>
    if (typeof o.value === "string" && o.params && typeof o.params === "object") {
      const params = Object.entries(o.params as Record<string, string>)
        .map(([k, val]) => `${k}=${val}`)
        .join("; ")
      return params ? `${o.value}; ${params}` : o.value
    }
    if (Array.isArray(o.value)) {
      const addrs = (o.value as AddrLite[])
        .map((a) => (a.name ? `${a.name} <${a.address}>` : a.address))
        .filter(Boolean)
      if (addrs.length) return addrs.join(", ")
    }
    if (typeof o.text === "string") return o.text
    try {
      return JSON.stringify(v, null, 2)
    } catch {
      return String(v)
    }
  }
  return String(v)
}

function collectHeaders(
  headers: Record<string, unknown> | null | undefined,
): Array<{ name: string; value: string }> {
  if (!headers) return []
  return Object.entries(headers)
    .map(([name, value]) => ({ name, value: formatValue(value) }))
    .filter((h) => h.value.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
}

function parseAuthChecks(texts: string[]): AuthCheck[] {
  const checks: AuthCheck[] = []
  const seen = new Set<string>()

  for (const text of texts) {
    const re =
      /\b(spf|dkim|dmarc|arc|dkim-adsp|dkim-atps|dkim-pra)\s*=\s*([a-z][a-z0-9_-]*)/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const protocol = m[1].toLowerCase()
      const result = m[2].toLowerCase()
      const key = `${protocol}:${result}`
      if (seen.has(key)) continue
      seen.add(key)
      const tail = text.slice(m.index + m[0].length).split(";")[0]?.trim()
      checks.push({
        protocol: protocol.toUpperCase(),
        result,
        detail: tail || undefined,
      })
    }
  }
  return checks
}

export function extractEmailMeta(mail: EmailDetail): EmailMetaSections {
  const allHeaders = collectHeaders(mail.parsed?.headers)
  const lowerMap = new Map(allHeaders.map((h) => [h.name.toLowerCase(), h]))

  const authHeaders = allHeaders.filter((h) =>
    AUTH_HEADER_KEYS.has(h.name.toLowerCase()),
  )
  const spamHeaders = allHeaders.filter((h) =>
    headerKeyMatches(h.name, SPAM_HEADER_PATTERNS),
  )
  const receivedChain = allHeaders
    .filter((h) => h.name.toLowerCase() === "received")
    .map((h) => h.value)

  const notableKeys = new Set([
    ...AUTH_HEADER_KEYS,
    ...NOTABLE_HEADER_KEYS,
    "received",
  ])
  const otherNotable = allHeaders.filter((h) => {
    const lower = h.name.toLowerCase()
    if (notableKeys.has(lower)) return false
    if (headerKeyMatches(h.name, SPAM_HEADER_PATTERNS)) return false
    return NOTABLE_HEADER_KEYS.has(lower)
  })

  const authTexts = [
    ...authHeaders.map((h) => h.value),
    lowerMap.get("authentication-results")?.value ?? "",
    lowerMap.get("arc-authentication-results")?.value ?? "",
    lowerMap.get("received-spf")?.value ?? "",
  ].filter(Boolean)

  return {
    authChecks: parseAuthChecks(authTexts),
    authHeaders,
    spamHeaders,
    receivedChain,
    otherNotable,
    allHeaders,
  }
}

export function formatAddrList(list: AddrLite[] | null | undefined): string {
  if (!list?.length) return "—"
  return list
    .map((a) => (a.name ? `${a.name} <${a.address}>` : a.address))
    .filter(Boolean)
    .join(", ")
}

export function authResultColor(result: string): string {
  const r = result.toLowerCase()
  if (["pass", "bestguesspass", "neutral", "none"].includes(r)) {
    return "text-emerald-600 dark:text-emerald-400"
  }
  if (["fail", "hardfail", "softfail", "permerror", "temperror"].includes(r)) {
    return "text-destructive"
  }
  return "text-muted-foreground"
}
