import { useMemo, useState, type ReactNode } from "react"
import { Info, ChevronDown, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import type { EmailDetail } from "@/lib/api"
import {
  authResultColor,
  buildGraphicalEmailMeta,
  extractEmailMeta,
  formatAddrList,
  roleBadgeClass,
  roleLabel,
  type ArcLayer,
  type GraphicalEmailMeta,
  type HopTimelineEntry,
  type IdentityRow,
  type MimeTreeNode,
  type ParsedReceivedHop,
} from "@/lib/emailMeta"

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

function MetaSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string
  children: ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="border-b pb-4 last:border-b-0 last:pb-0">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 py-1 text-left text-sm font-medium hover:text-foreground/80"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        {title}
      </button>
      {open ? <div className="mt-2 space-y-2">{children}</div> : null}
    </section>
  )
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-all font-mono text-[11px] leading-relaxed">
        {value}
      </span>
    </div>
  )
}

function HeaderList({ items }: { items: Array<{ name: string; value: string }> }) {
  if (!items.length) {
    return <p className="text-xs text-muted-foreground">（无相关信头）</p>
  }
  return (
    <div className="space-y-2">
      {items.map((h, i) => (
        <div key={`${h.name}-${i}`} className="rounded-md bg-muted/50 p-2.5">
          <div className="text-[11px] font-medium text-muted-foreground">{h.name}</div>
          <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px] leading-relaxed">
            {h.value}
          </pre>
        </div>
      ))}
    </div>
  )
}

function FlowConnector() {
  return (
    <div className="flex flex-col items-center py-0.5 text-muted-foreground">
      <span className="font-mono text-[10px] leading-none">│</span>
      <span className="my-0.5 font-mono text-xs leading-none">▼</span>
    </div>
  )
}

function ReceivedPathFlow({ hops }: { hops: ParsedReceivedHop[] }) {
  if (!hops.length) return null
  const chain = [...hops].reverse()

  return (
    <div className="rounded-lg border bg-muted/20 px-3 py-3">
      <p className="mb-3 text-[11px] text-muted-foreground">
        按时间从发件侧到收件侧（由多条 <span className="font-mono">Received</span>{" "}
        自下而上堆叠的信头顺序推导；下图自上而下为「源头 → 你的邮箱」）。
      </p>
      <div className="flex flex-col items-center">
        {chain.map((hop, idx) => (
          <div key={idx} className="flex w-full max-w-md flex-col items-center">
            <div className="w-full rounded-md border bg-background px-3 py-2 shadow-sm">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-semibold">{hop.displayName}</span>
                <span
                  className={`rounded border px-1.5 py-0 text-[10px] font-medium ${roleBadgeClass(hop.role)}`}
                >
                  {roleLabel(hop.role)}
                </span>
              </div>
              <div className="mt-1 space-y-0.5 font-mono text-[10px] text-muted-foreground">
                {hop.fromHost ? (
                  <div>
                    <span className="text-muted-foreground/80">from </span>
                    {hop.fromHost}
                    {hop.fromIp ? ` (${hop.fromIp})` : null}
                  </div>
                ) : null}
                {hop.byHost ? (
                  <div>
                    <span className="text-muted-foreground/80">by </span>
                    {hop.byHost}
                    {hop.byIp ? ` (${hop.byIp})` : null}
                  </div>
                ) : null}
                {hop.tlsVersion ? (
                  <div className="text-emerald-700 dark:text-emerald-400">
                    TLS {hop.tlsVersion}
                    {hop.cipher ? ` · ${hop.cipher}` : null}
                  </div>
                ) : (
                  <div className="text-amber-700/90 dark:text-amber-300/90">（未解析到 TLS 版本）</div>
                )}
                {hop.dateRaw ? <div>时间 {hop.dateRaw}</div> : null}
              </div>
            </div>
            {idx < chain.length - 1 ? <FlowConnector /> : null}
          </div>
        ))}
        <FlowConnector />
        <div className="w-full max-w-md rounded-md border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-center text-xs font-medium text-primary">
          本邮件系统（收件侧）
        </div>
      </div>
    </div>
  )
}

function HopTimelineVisual({ entries }: { entries: HopTimelineEntry[] }) {
  if (!entries.length) return null
  return (
    <div className="relative rounded-lg border bg-muted/15 px-2 py-3 pl-6">
      <div className="absolute bottom-2 left-2.5 top-2 w-px bg-border" aria-hidden />
      <ul className="space-y-3">
        {entries.map((e) => (
          <li key={e.index} className="relative pl-4">
            <span className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
            <div className="font-mono text-[11px] font-medium text-foreground">{e.timeLabel}</div>
            <div className="text-xs font-semibold">{e.label}</div>
            {e.detail ? (
              <div className="text-[10px] text-muted-foreground">{e.detail}</div>
            ) : null}
            {e.deltaMs != null && e.deltaMs >= 0 ? (
              <div className="text-[10px] text-muted-foreground/90">
                Δ 相对上一跳{" "}
                <span className="font-mono text-amber-700 dark:text-amber-300">
                  {e.deltaMs < 1000 ? `${e.deltaMs} ms` : `${(e.deltaMs / 1000).toFixed(2)} s`}
                </span>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

function AuthBadge({ protocol, result }: { protocol: string; result: string }) {
  const ok = ["pass", "bestguesspass"].includes(result.toLowerCase())
  return (
    <div className="flex min-w-[5.5rem] flex-col items-center gap-1 rounded-lg border bg-background px-2 py-2 text-center shadow-sm">
      <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        {protocol}
      </span>
      <span className="text-lg leading-none">{ok ? "✅" : "⚠️"}</span>
      <span className={`text-[11px] font-semibold uppercase ${authResultColor(result)}`}>
        {result}
      </span>
    </div>
  )
}

function AuthTrustPanel({
  mechanisms,
  legacyChecks,
}: {
  mechanisms: GraphicalEmailMeta["authMechanisms"]
  legacyChecks: { protocol: string; result: string; detail?: string }[]
}) {
  const protocols = ["SPF", "DKIM", "DMARC", "ARC"] as const
  const byProto = new Map(mechanisms.map((m) => [m.protocol, m]))
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
        {protocols.map((p) => {
          const row = byProto.get(p)
          return <AuthBadge key={p} protocol={p} result={row?.result ?? "—"} />
        })}
      </div>
      {mechanisms.length ? (
        <div className="rounded-md border border-dashed bg-muted/20 p-2 text-[10px]">
          <div className="mb-1 font-medium text-muted-foreground">Authentication-Results 摘要</div>
          <ul className="space-y-1.5 font-mono text-[10px] leading-snug text-muted-foreground">
            {mechanisms.map((m, i) => (
              <li key={i} className="break-all">
                <span className="font-semibold text-foreground">{m.protocol}</span>={m.result}
                {m.snippet ? (
                  <pre className="mt-0.5 whitespace-pre-wrap pl-2 text-[9px] opacity-90">
                    {m.snippet}
                  </pre>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : legacyChecks.length ? (
        <p className="text-[11px] text-muted-foreground">以下为信头全文扫描结果（无结构化 Authentication-Results 时）。</p>
      ) : null}
    </div>
  )
}

function ArcChainVisual({ layers }: { layers: ArcLayer[] }) {
  if (!layers.length) return <p className="text-xs text-muted-foreground">未检测到 ARC-Seal。</p>
  return (
    <div className="rounded-lg border bg-muted/20 px-3 py-3">
      <p className="mb-2 text-[11px] text-muted-foreground">
        ARC 实例号越大越靠近收件侧；每层可重新封装上游的验证摘要。
      </p>
      <div className="flex flex-col items-center gap-0">
        {layers.map((layer, i) => (
          <div key={layer.instance} className="flex w-full max-w-md flex-col items-center">
            <div className="w-full rounded-md border bg-background px-3 py-2 text-xs shadow-sm">
              <div className="font-semibold">
                i={layer.instance}
                {layer.domain ? (
                  <span className="text-muted-foreground"> · {layer.domain}</span>
                ) : null}
              </div>
              <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                {layer.selector ? <div>selector: {layer.selector}</div> : null}
                {layer.cv ? <div>cv: {layer.cv}</div> : null}
                {layer.algo ? <div>algo: {layer.algo}</div> : null}
              </div>
            </div>
            {i < layers.length - 1 ? <FlowConnector /> : null}
          </div>
        ))}
      </div>
    </div>
  )
}

function MimeTreeNodeView({ node, depth = 0 }: { node: MimeTreeNode; depth?: number }) {
  const pad = depth * 12
  return (
    <div style={{ paddingLeft: pad }} className="font-mono text-[11px]">
      <div className="flex items-start gap-1 py-0.5">
        {depth > 0 ? <span className="shrink-0 text-muted-foreground">├──</span> : null}
        <span className="break-all text-foreground">{node.label}</span>
      </div>
      {node.children?.map((c, i) => (
        <MimeTreeNodeView key={i} node={c} depth={depth + 1} />
      ))}
    </div>
  )
}

function IdentityGraph({ rows }: { rows: IdentityRow[] }) {
  if (!rows.length) return null
  return (
    <div className="rounded-lg border bg-muted/15 p-3">
      <div className="relative flex flex-col gap-0">
        {rows.map((r, i) => (
          <div key={i} className="flex gap-2">
            <div className="flex w-28 shrink-0 flex-col items-center">
              <div className="rounded border bg-background px-1.5 py-1 text-center text-[9px] font-medium leading-tight text-muted-foreground">
                {r.role}
              </div>
              {i < rows.length - 1 ? (
                <div className="my-0.5 flex flex-col items-center text-muted-foreground">
                  <span className="font-mono text-[10px]">│</span>
                  <span className="font-mono text-xs">▼</span>
                </div>
              ) : null}
            </div>
            <div className="min-w-0 flex-1 pb-2">
              <div className="break-all rounded border bg-background px-2 py-1.5 font-mono text-[10px] leading-relaxed">
                {r.value}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TlsHopStrip({
  hops,
}: {
  hops: GraphicalEmailMeta["tlsByHop"]
}) {
  if (!hops.length) return null
  return (
    <div className="flex flex-wrap gap-2">
      {hops.map((t) => (
        <div
          key={t.hop}
          className="min-w-[8rem] flex-1 rounded-md border bg-background px-2 py-1.5 text-center shadow-sm"
        >
          <div className="text-[10px] font-medium text-muted-foreground">Hop {t.hop}</div>
          {t.tls ? (
            <div className="font-mono text-[11px] text-emerald-700 dark:text-emerald-400">
              {t.tls}
            </div>
          ) : (
            <div className="text-[10px] text-muted-foreground">—</div>
          )}
          {t.cipher ? (
            <div className="break-all font-mono text-[9px] text-muted-foreground">{t.cipher}</div>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function AntispamPanel({ g }: { g: GraphicalEmailMeta["antispam"] }) {
  if (!g || (g.scl == null && g.bcl == null && !g.cip && !g.ctry)) return null
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {g.scl != null ? (
        <div className="rounded-lg border bg-background p-2 shadow-sm">
          <div className="text-[10px] font-medium text-muted-foreground">SCL（垃圾倾向）</div>
          <div className="text-lg font-bold tabular-nums">{g.scl}</div>
          <div className="text-[10px] text-muted-foreground">常见范围约 −1 ~ 9</div>
        </div>
      ) : null}
      {g.bcl != null ? (
        <div className="rounded-lg border bg-background p-2 shadow-sm">
          <div className="text-[10px] font-medium text-muted-foreground">BCL（群发/批量）</div>
          <div className="text-lg font-bold tabular-nums">{g.bcl}</div>
          <div className="text-[10px] text-muted-foreground">常见范围约 0 ~ 9</div>
        </div>
      ) : null}
      {(g.threatLabel || g.ctry || g.cip || g.lang) && (
        <div className="sm:col-span-2 rounded-lg border border-dashed bg-muted/20 p-2 text-[11px]">
          {g.threatLabel ? (
            <div>
              <span className="text-muted-foreground">威胁粗分级：</span>
              <span className="font-medium">{g.threatLabel}</span>
            </div>
          ) : null}
          {g.ctry ? (
            <div className="mt-1 font-mono text-[10px]">
              CTRY: {g.ctry}
              {g.lang ? ` · LANG: ${g.lang}` : null}
            </div>
          ) : null}
          {g.cip ? (
            <div className="mt-1 break-all font-mono text-[10px]">CIP: {g.cip}</div>
          ) : null}
          <p className="mt-2 text-[10px] text-muted-foreground">
            以上来自 X-Forefront-Antispam-Report 等信头的解析；ASN / 精确地理需外部 IP 库，此处不调用外网。
          </p>
        </div>
      )}
    </div>
  )
}

export function EmailMetaDialog({ mail }: { mail: EmailDetail }) {
  const meta = useMemo(() => extractEmailMeta(mail), [mail])
  const visual = useMemo(() => buildGraphicalEmailMeta(mail), [mail])
  const parsed = mail.parsed

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5">
          <Info className="h-4 w-4" />
          解析信息
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[min(90vh,720px)] gap-0 overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>EML 解析信息</DialogTitle>
          <DialogDescription>
            后端提供原始解析 JSON；图形化展示由前端从信头字段推导（启发式，非取证级）。
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="max-h-[calc(min(90vh,720px)-8rem)] space-y-4 overflow-y-auto pr-1">
          <MetaSection title="概览">
            <Row label="Message-ID" value={parsed?.message_id ?? "—"} />
            <Row label="主题" value={parsed?.subject ?? "—"} />
            <Row label="日期" value={parsed?.date ?? mail.received_at} />
            <Row label="大小" value={formatBytes(mail.size)} />
            <Row label="SHA-256" value={mail.body_sha256} />
            <Row
              label="解析状态"
              value={
                mail.parse_status === "ok"
                  ? "成功"
                  : mail.parse_status === "error"
                    ? `失败${mail.parse_error ? `：${mail.parse_error}` : ""}`
                    : "待处理"
              }
            />
          </MetaSection>

          <MetaSection title="收发件人">
            <Row
              label="发件人"
              value={
                parsed?.from_name
                  ? `${parsed.from_name} <${parsed.from_addr}>`
                  : (parsed?.from_addr ?? "—")
              }
            />
            <Row label="收件人" value={formatAddrList(parsed?.to)} />
            <Row label="抄送" value={formatAddrList(parsed?.cc)} />
            <Row label="密送" value={formatAddrList(parsed?.bcc)} />
            <Row label="回复地址" value={formatAddrList(parsed?.reply_to)} />
          </MetaSection>

          {visual.receivedHops.length ? (
            <MetaSection title="传输路径（Received 流程图）">
              <ReceivedPathFlow hops={visual.receivedHops} />
            </MetaSection>
          ) : null}

          {visual.hopTimeline.length ? (
            <MetaSection title="SMTP 时间轴（按解析到的时间戳）" defaultOpen={false}>
              <HopTimelineVisual entries={visual.hopTimeline} />
            </MetaSection>
          ) : null}

          {visual.tlsByHop.some((t) => t.tls) ? (
            <MetaSection title="TLS 链（按 hop）" defaultOpen={false}>
              <TlsHopStrip hops={visual.tlsByHop} />
            </MetaSection>
          ) : null}

          <MetaSection title="信任验证（Authentication-Results）">
            <AuthTrustPanel mechanisms={visual.authMechanisms} legacyChecks={meta.authChecks} />
            {meta.authChecks.length > 0 && visual.authMechanisms.length === 0 ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {meta.authChecks.map((c, i) => (
                  <span
                    key={`${c.protocol}-${c.result}-${i}`}
                    className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs"
                    title={c.detail}
                  >
                    <span className="font-medium">{c.protocol}</span>
                    <span className={authResultColor(c.result)}>{c.result}</span>
                  </span>
                ))}
              </div>
            ) : null}
            <HeaderList items={meta.authHeaders} />
          </MetaSection>

          <MetaSection title="ARC 链" defaultOpen={false}>
            <ArcChainVisual layers={visual.arcLayers} />
          </MetaSection>

          {visual.antispam ? (
            <MetaSection title="反垃圾评分（信头解析）" defaultOpen={false}>
              <AntispamPanel g={visual.antispam} />
              <HeaderList items={meta.spamHeaders} />
            </MetaSection>
          ) : (
            <MetaSection title="反垃圾相关信头" defaultOpen={false}>
              <HeaderList items={meta.spamHeaders} />
            </MetaSection>
          )}

          {visual.identityRows.length ? (
            <MetaSection title="身份关系（From / RP / DKIM / HELO）" defaultOpen={false}>
              <IdentityGraph rows={visual.identityRows} />
            </MetaSection>
          ) : null}

          {visual.mimeTree ? (
            <MetaSection title="MIME 结构树（简化）" defaultOpen={false}>
              <p className="text-[11px] text-muted-foreground">
                根节点来自 Content-Type；HTML 下为标签频次摘要，非完整 DOM。
              </p>
              <div className="rounded-md border bg-muted/30 p-2">
                <MimeTreeNodeView node={visual.mimeTree} />
              </div>
            </MetaSection>
          ) : null}

          {parsed?.attachments_meta?.length ? (
            <MetaSection title="附件">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-1.5 pr-3 font-medium">文件名</th>
                      <th className="pb-1.5 pr-3 font-medium">类型</th>
                      <th className="pb-1.5 font-medium">大小</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.attachments_meta.map((a, i) => (
                      <tr key={i} className="border-b border-border/50 last:border-0">
                        <td className="py-1.5 pr-3 font-mono">
                          {a.filename ?? "(未命名)"}
                        </td>
                        <td className="py-1.5 pr-3 font-mono text-muted-foreground">
                          {a.contentType}
                        </td>
                        <td className="py-1.5 font-mono">{formatBytes(a.size)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </MetaSection>
          ) : null}

          {meta.receivedChain.length ? (
            <MetaSection title="原始 Received 文本" defaultOpen={false}>
              <div className="space-y-2">
                {meta.receivedChain.map((line, i) => (
                  <div
                    key={i}
                    className="rounded-md border-l-2 border-muted-foreground/30 bg-muted/30 py-1.5 pl-3"
                  >
                    <span className="text-[10px] font-medium text-muted-foreground">
                      hop {meta.receivedChain.length - i}
                    </span>
                    <pre className="mt-0.5 whitespace-pre-wrap font-mono text-[11px] leading-relaxed">
                      {line}
                    </pre>
                  </div>
                ))}
              </div>
            </MetaSection>
          ) : null}

          <MetaSection title="全部信头" defaultOpen={false}>
            <HeaderList items={meta.allHeaders} />
          </MetaSection>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
