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

/** 单条 Received 解析结果（前端由原始信头推导） */
export type ParsedReceivedHop = {
  raw: string
  fromHost?: string
  fromIp?: string
  byHost?: string
  byIp?: string
  withClause?: string
  tlsVersion?: string
  cipher?: string
  forAddr?: string
  id?: string
  date?: Date
  dateRaw?: string
  /** 粗略角色：中继 / 边界 / 防护 / 内部 */
  role: "relay" | "edge" | "protection" | "internal" | "unknown"
  /** 用于流程图的主展示名 */
  displayName: string
}

export type HopTimelineEntry = {
  index: number
  time: Date | null
  timeLabel: string
  label: string
  detail?: string
  deltaMs?: number
}

export type AuthMechanismSummary = {
  protocol: "SPF" | "DKIM" | "DMARC" | "ARC"
  result: string
  snippet?: string
}

export type ArcLayer = {
  instance: number
  domain?: string
  selector?: string
  cv?: string
  algo?: string
}

export type MimeTreeNode = {
  label: string
  children?: MimeTreeNode[]
}

export type AntispamScores = {
  scl?: number
  bcl?: number
  threatLabel?: string
  cip?: string
  ctry?: string
  lang?: string
}

export type IdentityRow = {
  role: string
  value: string
}

export type GraphicalEmailMeta = {
  receivedHops: ParsedReceivedHop[]
  hopTimeline: HopTimelineEntry[]
  authMechanisms: AuthMechanismSummary[]
  arcLayers: ArcLayer[]
  mimeTree: MimeTreeNode | null
  antispam: AntispamScores | null
  identityRows: IdentityRow[]
  tlsByHop: Array<{ hop: number; tls?: string; cipher?: string }>
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
  /^x-forefront-antispam-report$/i,
  /^x-microsoft-antispam$/i,
  /^x-ms-exchange-antispam/i,
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

/** 将 JSON 中信头值拆成多条（如多条 Received） */
function expandHeaderParts(value: unknown): unknown[] {
  if (value == null) return []
  if (Array.isArray(value)) return value.flatMap(expandHeaderParts)
  return [value]
}

function headerValueToString(part: unknown): string {
  if (typeof part === "string") return part.trim()
  return formatValue(part).trim()
}

/**
 * 按对象插入顺序展开信头（不排序），用于 Received / Authentication-Results 顺序敏感场景。
 */
function entriesInObjectOrder(
  headers: Record<string, unknown> | null | undefined,
): Array<{ name: string; value: string }> {
  if (!headers) return []
  const out: Array<{ name: string; value: string }> = []
  for (const [name, value] of Object.entries(headers)) {
    for (const part of expandHeaderParts(value)) {
      const v = headerValueToString(part)
      if (v) out.push({ name, value: v })
    }
  }
  return out
}

function collectHeaders(
  headers: Record<string, unknown> | null | undefined,
): Array<{ name: string; value: string }> {
  return entriesInObjectOrder(headers).sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  )
}

function collectReceivedInOrder(
  headers: Record<string, unknown> | null | undefined,
): string[] {
  return entriesInObjectOrder(headers)
    .filter((h) => h.name.toLowerCase() === "received")
    .map((h) => h.value)
}

function isPrivateOrLocalIp(ip: string): boolean {
  const s = ip.trim().toLowerCase()
  if (
    s.startsWith("10.") ||
    s.startsWith("192.168.") ||
    s.startsWith("127.") ||
    s === "::1"
  )
    return true
  if (s.startsWith("172.")) {
    const p = parseInt(s.split(".")[1] ?? "0", 10)
    return p >= 16 && p <= 31
  }
  if (s.startsWith("fc") || s.startsWith("fd")) return true // fc00::/7
  return false
}

function inferHopRole(
  fromHost: string | undefined,
  byHost: string | undefined,
  withClause: string | undefined,
  fromIp: string | undefined,
  byIp: string | undefined,
): ParsedReceivedHop["role"] {
  const blob = `${fromHost ?? ""} ${byHost ?? ""} ${withClause ?? ""}`.toLowerCase()
  if (blob.includes("protection") || blob.includes("antispam") || blob.includes("forefront"))
    return "protection"
  if (blob.includes("frontend")) return "edge"
  if (
    (fromIp && isPrivateOrLocalIp(fromIp)) ||
    (byIp && isPrivateOrLocalIp(byIp)) ||
    /(^|\.)outlook\.office365\.com$/i.test(byHost ?? "") ||
    /\.prod\.outlook\.com$/i.test(byHost ?? "")
  )
    return "internal"
  if (blob.includes("routing") || blob.includes("relay") || blob.includes("postfix"))
    return "relay"
  return "unknown"
}

function friendlyHopName(fromHost?: string, byHost?: string): string {
  const h = (fromHost || byHost || "").toLowerCase()
  if (h.includes("cloudflare")) return "Cloudflare Email Routing"
  if (h.includes("protection.outlook") || h.includes("mail.protection.outlook"))
    return "Outlook Protection"
  if (h.includes("outlook.com") || h.includes("outlook.office365"))
    return "Exchange Online"
  if (h.includes("accountprotection.microsoft.com")) return "Microsoft Account System"
  if (h.includes("google.com") || h.includes("gmail")) return "Google 邮件"
  if (byHost && byHost !== fromHost) return byHost.split(".")[0] ?? byHost
  return fromHost || byHost || "（未知节点）"
}

/** 将折行信头压成单行便于正则解析 */
function collapseFoldedHeader(raw: string): string {
  return raw.replace(/\r?\n[ \t]+/g, " ").trim()
}

export function parseReceivedHop(raw: string): ParsedReceivedHop {
  const line = collapseFoldedHeader(raw)
  const fromM = /\bfrom\s+([^\s(]+)(?:\s*\(([^)]+)\))?/i.exec(line)
  const byM = /\bby\s+([^\s(]+)(?:\s*\(([^)]+)\))?/i.exec(line)
  const forM = /\bfor\s+(?:<([^>]+)>|([^\s;]+))/i.exec(line)
  const idM = /\bid\s+([^\s;]+)/i.exec(line)
  const withM = /\bwith\s+([^;]+?)(?=\s+id\s+|\s+for\s+|;|\s*$)/i.exec(line)

  let tlsVersion: string | undefined
  let cipher: string | undefined
  const tlsVerM = /version\s*=\s*(TLS[\d._]+|SSL[\d._]+)/i.exec(line)
  if (tlsVerM) tlsVersion = tlsVerM[1].replace(/_/g, ".")
  const cipherM = /cipher\s*=\s*([^)\s;]+)/i.exec(line)
  if (cipherM) cipher = cipherM[1].replace(/_/g, "_")

  let dateRaw: string | undefined
  let date: Date | undefined
  const dateM =
    /;\s*((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s*\d{1,2}\s+\w+\s+\d{4}\s+[\d:+ ]+\w+)/i.exec(
      line,
    )
  if (dateM) {
    dateRaw = dateM[1].trim()
    const d = Date.parse(dateRaw)
    if (!Number.isNaN(d)) date = new Date(d)
  }

  const fromHost = fromM?.[1]
  const fromIp = fromM?.[2]
  const byHost = byM?.[1]
  const byIp = byM?.[2]
  const withClause = withM?.[1]?.trim()
  const forAddr = forM?.[1] ?? forM?.[2]
  const id = idM?.[1]

  const role = inferHopRole(fromHost, byHost, withClause, fromIp, byIp)
  const displayName = friendlyHopName(fromHost, byHost)

  return {
    raw: raw.trim(),
    fromHost,
    fromIp,
    byHost,
    byIp,
    withClause,
    tlsVersion,
    cipher,
    forAddr,
    id,
    date,
    dateRaw,
    role,
    displayName,
  }
}

function formatTimeMs(d: Date): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, "0")
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)}`
}

export function buildHopTimeline(hops: ParsedReceivedHop[]): HopTimelineEntry[] {
  // 信头顺序：index 0 = 离收件人最近；时间轴按时间升序（从源头到邮箱）展示
  const chronological = [...hops].reverse()
  const out: HopTimelineEntry[] = []
  let prev: Date | null = null
  chronological.forEach((h, i) => {
    const time = h.date ?? null
    const timeLabel = time ? formatTimeMs(time) : "—"
    let deltaMs: number | undefined
    if (time && prev) deltaMs = time.getTime() - prev.getTime()
    if (time) prev = time
    const detail = [h.fromHost && `from ${h.fromHost}`, h.byHost && `by ${h.byHost}`]
      .filter(Boolean)
      .join(" · ")
    out.push({
      index: i + 1,
      time,
      timeLabel,
      label: h.displayName,
      detail: detail || undefined,
      deltaMs,
    })
  })
  return out
}

function parseAuthMechanismsFromText(text: string): AuthMechanismSummary[] {
  const out: AuthMechanismSummary[] = []
  const collapsed = collapseFoldedHeader(text)
  const re = /\b(spf|dkim|dmarc|arc)\s*=\s*([a-z][a-z0-9_-]*)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(collapsed)) !== null) {
    const proto = m[1].toUpperCase() as AuthMechanismSummary["protocol"]
    if (!["SPF", "DKIM", "DMARC", "ARC"].includes(proto)) continue
    const result = m[2].toLowerCase()
    const rest = collapsed.slice(m.index + m[0].length)
    const nextIdx = rest.search(/\b(?:spf|dkim|dmarc|arc)\s*=/i)
    const chunk =
      nextIdx === -1 ? collapsed.slice(m.index) : collapsed.slice(m.index, m.index + m[0].length + nextIdx)
    const snippet = chunk.length > 140 ? `${chunk.slice(0, 137)}…` : chunk.trim()
    out.push({ protocol: proto, result, snippet })
  }
  return out
}

/** 同一条 Authentication-Results 内去重，保留首次出现的机制结论 */
function dedupeAuthMechanisms(rows: AuthMechanismSummary[]): AuthMechanismSummary[] {
  const out: AuthMechanismSummary[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const k = `${row.protocol}:${row.result}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push(row)
  }
  return out
}

function parseArcSeals(headers: Array<{ name: string; value: string }>): ArcLayer[] {
  const seals = headers.filter((h) => h.name.toLowerCase() === "arc-seal")
  const layers: ArcLayer[] = []
  for (const s of seals) {
    const line = collapseFoldedHeader(s.value)
    const iM = /\bi\s*=\s*(\d+)/i.exec(line)
    const dM = /\bd\s*=\s*([^;\s]+)/i.exec(line)
    const sM = /\bs\s*=\s*([^;\s]+)/i.exec(line)
    const cvM = /\bcv\s*=\s*([^;\s]+)/i.exec(line)
    const aM = /\ba\s*=\s*([^;\s]+)/i.exec(line)
    layers.push({
      instance: iM ? parseInt(iM[1], 10) : layers.length + 1,
      domain: dM?.[1],
      selector: sM?.[1],
      cv: cvM?.[1],
      algo: aM?.[1],
    })
  }
  return layers.sort((a, b) => a.instance - b.instance)
}

function parseContentTypeTree(contentType: string | null | undefined): MimeTreeNode | null {
  if (!contentType) return null
  const main = contentType.split(";")[0]?.trim().toLowerCase() ?? ""
  if (!main) return null

  if (main.startsWith("multipart/")) {
    return {
      label: main,
      children: [
        { label: "text/plain（若存在正文部分）" },
        { label: "text/html（若存在 HTML 部分）" },
        { label: "… 其他 MIME 子部分（见附件表）" },
      ],
    }
  }
  return { label: main }
}

function roughHtmlOutline(html: string | null | undefined): MimeTreeNode[] {
  if (!html || html.length < 10) return []
  const tags = new Set(["table", "head", "body", "style", "div", "a", "img", "script"])
  const found: MimeTreeNode[] = []
  const re = /<\s*([a-zA-Z][a-zA-Z0-9:-]*)\b/gi
  let m: RegExpExecArray | null
  const counts = new Map<string, number>()
  while ((m = re.exec(html)) !== null) {
    const name = m[1].toLowerCase()
    if (!tags.has(name)) continue
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  for (const [tag, n] of counts) {
    found.push({ label: n > 1 ? `${tag} ×${n}` : tag })
  }
  return found.length ? [{ label: "html 结构摘要", children: found }] : []
}

function parseForefrontAntispam(value: string): AntispamScores | null {
  if (!value) return null
  const line = collapseFoldedHeader(value)
  const sclM = /\bSCL\s*:\s*(-?\d+)/i.exec(line)
  const bclM = /\bBCL\s*:\s*(-?\d+)/i.exec(line)
  const cipM = /\bCIP\s*:\s*([^;]+)/i.exec(line)
  const ctryM = /\bCTRY\s*:\s*([^;]+)/i.exec(line)
  const langM = /\bLANG\s*:\s*([^;]+)/i.exec(line)
  const scl = sclM ? parseInt(sclM[1], 10) : undefined
  const bcl = bclM ? parseInt(bclM[1], 10) : undefined
  if (scl == null && bcl == null && !cipM && !ctryM) return null

  let threatLabel = "—"
  if (scl != null) {
    if (scl <= 0) threatLabel = "低 / 正常"
    else if (scl <= 4) threatLabel = "低–中"
    else if (scl <= 7) threatLabel = "可疑"
    else threatLabel = "高（类垃圾）"
  }

  return {
    scl,
    bcl,
    threatLabel,
    cip: cipM?.[1]?.trim(),
    ctry: ctryM?.[1]?.trim(),
    lang: langM?.[1]?.trim(),
  }
}

function parseMicrosoftAntispamLine(value: string): Partial<AntispamScores> {
  const line = collapseFoldedHeader(value)
  const bclM = /\bBCL\s*:\s*(-?\d+)/i.exec(line)
  const bcl = bclM ? parseInt(bclM[1], 10) : undefined
  return bcl != null ? { bcl } : {}
}

function extractDkimDomain(headers: Array<{ name: string; value: string }>): string | undefined {
  const dkim = headers.find((h) => h.name.toLowerCase() === "dkim-signature")
  if (!dkim) return undefined
  const dm = /\bd\s*=\s*([^;\s]+)/i.exec(collapseFoldedHeader(dkim.value))
  return dm?.[1]
}

function extractFromDomain(fromAddr: string | null | undefined): string | undefined {
  if (!fromAddr) return undefined
  const at = fromAddr.lastIndexOf("@")
  if (at === -1) return undefined
  return fromAddr.slice(at + 1).trim().toLowerCase() || undefined
}

function buildIdentityRows(
  mail: EmailDetail,
  ordered: Array<{ name: string; value: string }>,
): IdentityRow[] {
  const rows: IdentityRow[] = []
  const parsed = mail.parsed
  const fromAddr = parsed?.from_addr ?? undefined
  if (fromAddr) rows.push({ role: "From（信封头 / 展示）", value: fromAddr })

  const rp = ordered.find((h) => h.name.toLowerCase() === "return-path")
  if (rp) rows.push({ role: "Return-Path（MAIL FROM）", value: collapseFoldedHeader(rp.value) })

  const dkimD = extractDkimDomain(ordered)
  if (dkimD) rows.push({ role: "DKIM d=", value: dkimD })

  const fromDom = extractFromDomain(fromAddr)
  if (fromDom) rows.push({ role: "From 域（对齐参考）", value: fromDom })

  const helo = ordered
    .filter((h) => h.name.toLowerCase() === "received")
    .map((h) => {
      const m = /\bfrom\s+([^\s(]+)/i.exec(collapseFoldedHeader(h.value))
      return m?.[1]
    })
    .filter(Boolean)
  if (helo.length) rows.push({ role: "首跳 HELO / from 主机", value: helo[helo.length - 1]! })

  return rows
}

export function buildGraphicalEmailMeta(mail: EmailDetail): GraphicalEmailMeta {
  const headers = mail.parsed?.headers
  const ordered = entriesInObjectOrder(headers)
  const receivedRaw = collectReceivedInOrder(headers)
  const receivedHops = receivedRaw.map(parseReceivedHop)
  const hopTimeline = buildHopTimeline(receivedHops)

  const authResultBlocks = ordered.filter(
    (h) => h.name.toLowerCase() === "authentication-results",
  )
  const primaryAuth =
    authResultBlocks[authResultBlocks.length - 1]?.value ??
    authResultBlocks[0]?.value ??
    ""
  const authMechanisms = dedupeAuthMechanisms(
    parseAuthMechanismsFromText(collapseFoldedHeader(primaryAuth)),
  )

  const arcLayers = parseArcSeals(ordered)

  const ct = ordered.find((h) => h.name.toLowerCase() === "content-type")?.value
  const mimeRoot = parseContentTypeTree(ct ?? null)
  const htmlOutline = roughHtmlOutline(mail.parsed?.html ?? null)
  const mimeTree: MimeTreeNode | null = mimeRoot
    ? htmlOutline.length
      ? { ...mimeRoot, children: [...(mimeRoot.children ?? []), ...htmlOutline] }
      : mimeRoot
    : null

  let antispam: AntispamScores | null = null
  const ff = ordered.find((h) => h.name.toLowerCase() === "x-forefront-antispam-report")
  if (ff) antispam = parseForefrontAntispam(ff.value)
  const ms = ordered.find((h) => h.name.toLowerCase() === "x-microsoft-antispam")
  if (ms) {
    const extra = parseMicrosoftAntispamLine(ms.value)
    antispam = { ...(antispam ?? {}), ...extra }
  }

  const identityRows = buildIdentityRows(mail, ordered)

  const tlsByHop = receivedHops.map((h, i) => ({
    hop: receivedHops.length - i,
    tls: h.tlsVersion,
    cipher: h.cipher,
  }))

  return {
    receivedHops,
    hopTimeline,
    authMechanisms,
    arcLayers,
    mimeTree,
    antispam,
    identityRows,
    tlsByHop,
  }
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
  const headers = mail.parsed?.headers
  const allHeaders = collectHeaders(headers)
  const lowerMap = new Map(allHeaders.map((h) => [h.name.toLowerCase(), h]))

  const authHeaders = allHeaders.filter((h) =>
    AUTH_HEADER_KEYS.has(h.name.toLowerCase()),
  )
  const spamHeaders = allHeaders.filter((h) =>
    headerKeyMatches(h.name, SPAM_HEADER_PATTERNS),
  )
  const receivedChain = collectReceivedInOrder(headers)

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

export function roleBadgeClass(role: ParsedReceivedHop["role"]): string {
  switch (role) {
    case "protection":
      return "bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-500/30"
    case "edge":
      return "bg-sky-500/15 text-sky-900 dark:text-sky-100 border-sky-500/30"
    case "relay":
      return "bg-violet-500/15 text-violet-900 dark:text-violet-100 border-violet-500/30"
    case "internal":
      return "bg-zinc-500/15 text-zinc-700 dark:text-zinc-200 border-zinc-500/30"
    default:
      return "bg-muted text-muted-foreground border-border"
  }
}

export function roleLabel(role: ParsedReceivedHop["role"]): string {
  switch (role) {
    case "protection":
      return "反垃圾 / 防护"
    case "edge":
      return "边界 / 前端"
    case "relay":
      return "中继"
    case "internal":
      return "内部路由"
    default:
      return "未知"
  }
}
