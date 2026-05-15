import { useMemo } from "react"
import {
  Reply,
  ReplyAll,
  Forward,
  Archive,
  Trash2,
  Star,
  MoreHorizontal,
  Download,
  AlertTriangle,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { rawEmailUrl, type EmailDetail } from "@/lib/api"
import { EmailMetaDialog } from "@/components/dashboard/EmailMetaDialog"

function initials(name: string | null | undefined) {
  const s = (name ?? "").trim()
  if (!s) return "?"
  return s.slice(0, 1).toUpperCase()
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso ?? ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

function HtmlBody({ html }: { html: string }) {
  // sandbox 默认禁用脚本/表单/导航/弹窗，避免邮件 HTML 攻击宿主页
  return (
    <iframe
      title="email-html"
      className="h-full w-full rounded-md border bg-white"
      sandbox=""
      srcDoc={html}
    />
  )
}

export function MailView({
  mail,
  loading,
  error,
}: {
  mail: EmailDetail | null
  loading?: boolean
  error?: string | null
}) {
  const fromName = mail?.parsed?.from_name ?? null
  const fromAddr = mail?.parsed?.from_addr ?? null
  const subject = mail?.parsed?.subject ?? null
  const dateStr = useMemo(
    () => formatDateTime(mail?.parsed?.date ?? mail?.received_at ?? null),
    [mail],
  )

  const recipients = useMemo(() => {
    const list = mail?.parsed?.to ?? []
    if (!list.length) return ""
    return list
      .map((a) => a.name || a.address)
      .filter(Boolean)
      .join(", ")
  }, [mail])

  if (!mail && !loading && !error) {
    return (
      <section className="flex flex-1 items-center justify-center text-muted-foreground">
        <p className="text-sm">选择一封邮件以查看详情</p>
      </section>
    )
  }

  if (loading && !mail) {
    return (
      <section className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        正在加载邮件…
      </section>
    )
  }

  if (error && !mail) {
    return (
      <section className="flex flex-1 items-center justify-center text-sm text-destructive">
        <AlertTriangle className="mr-2 h-4 w-4" />
        加载失败：{error}
      </section>
    )
  }

  if (!mail) return null

  return (
    <section className="flex flex-1 flex-col">
      <div className="flex h-14 items-center gap-1 px-4">
        <Button variant="ghost" size="icon" title="归档">
          <Archive className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" title="删除">
          <Trash2 className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" title="星标">
          <Star className="h-4 w-4" />
        </Button>
        <a
          href={rawEmailUrl(mail.id)}
          download={`${mail.id}.eml`}
          className="ml-1"
        >
          <Button variant="ghost" size="icon" title="下载原始 .eml">
            <Download className="h-4 w-4" />
          </Button>
        </a>
        <EmailMetaDialog mail={mail} />
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" className="gap-1.5">
            <Reply className="h-4 w-4" />
            回复
          </Button>
          <Button variant="ghost" size="sm" className="gap-1.5">
            <ReplyAll className="h-4 w-4" />
            全部回复
          </Button>
          <Button variant="ghost" size="sm" className="gap-1.5">
            <Forward className="h-4 w-4" />
            转发
          </Button>
          <Button variant="ghost" size="icon">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <Separator />

      <div className="flex items-start gap-4 p-6">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-base font-medium">
          {initials(fromName || fromAddr)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-medium">{fromName || fromAddr || "(未知发件人)"}</span>
            {fromAddr && fromName ? (
              <span className="text-xs text-muted-foreground">&lt;{fromAddr}&gt;</span>
            ) : null}
            <span className="ml-auto text-xs text-muted-foreground">{dateStr}</span>
          </div>
          <h1 className="mt-2 text-lg font-semibold leading-snug">
            {subject || "(无主题)"}
          </h1>
          {recipients ? (
            <p className="mt-1 text-xs text-muted-foreground">发送给：{recipients}</p>
          ) : null}
          <p className="mt-1 text-[11px] text-muted-foreground">
            {formatBytes(mail.size)} · ID {mail.id.slice(0, 8)}
          </p>
        </div>
      </div>
      <Separator />

      <article className="flex flex-1 min-h-0 flex-col overflow-hidden px-6 py-6">
        {mail.parse_status === "error" ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4" />
              邮件解析失败
            </div>
            {mail.parse_error ? (
              <pre className="mt-2 whitespace-pre-wrap text-xs">{mail.parse_error}</pre>
            ) : null}
            <p className="mt-3 text-xs">
              你仍可以
              <a
                href={rawEmailUrl(mail.id)}
                className="ml-1 underline underline-offset-2"
              >
                下载原始 .eml
              </a>
              查看。
            </p>
          </div>
        ) : mail.parsed?.html ? (
          <div className="flex-1 min-h-0">
            <HtmlBody html={mail.parsed.html} />
          </div>
        ) : mail.parsed?.text ? (
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground/90">
{mail.parsed.text}
          </pre>
        ) : (
          <p className="text-sm text-muted-foreground">（邮件没有可显示的正文）</p>
        )}
      </article>
    </section>
  )
}
