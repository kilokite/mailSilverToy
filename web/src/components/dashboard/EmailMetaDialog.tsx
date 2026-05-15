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
  extractEmailMeta,
  formatAddrList,
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

export function EmailMetaDialog({ mail }: { mail: EmailDetail }) {
  const meta = useMemo(() => extractEmailMeta(mail), [mail])
  const parsed = mail.parsed

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5">
          <Info className="h-4 w-4" />
          解析信息
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>EML 解析信息</DialogTitle>
          <DialogDescription>
            从原始邮件解析出的元数据、认证结果与信头
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
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

          <MetaSection title="邮件认证">
            {meta.authChecks.length ? (
              <div className="flex flex-wrap gap-2">
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
            ) : (
              <p className="text-xs text-muted-foreground">
                未检测到 SPF / DKIM / DMARC 等认证结果信头
              </p>
            )}
            <HeaderList items={meta.authHeaders} />
          </MetaSection>

          <MetaSection title="垃圾邮件评分">
            <HeaderList items={meta.spamHeaders} />
          </MetaSection>

          {meta.receivedChain.length ? (
            <MetaSection title="投递路径 (Received)" defaultOpen={false}>
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

          <MetaSection title="全部信头" defaultOpen={false}>
            <HeaderList items={meta.allHeaders} />
          </MetaSection>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
