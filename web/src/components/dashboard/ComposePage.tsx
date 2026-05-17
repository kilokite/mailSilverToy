import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react"
import { Loader2, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RichTextEditor } from "@/components/dashboard/editor/RichTextEditor"
import { MarkdownEditor } from "@/components/dashboard/editor/MarkdownEditor"
import {
  getSendCapabilities,
  sendOutboundMail,
  type AuthUser,
} from "@/lib/api"
import { htmlToPlainText, mdToHtml, sanitizeHtml } from "@/lib/markdown"

type BodyMode = "rich" | "markdown"

function isEmptyHtml(html: string): boolean {
  const t = html.trim()
  return !t || t === "<p></p>" || t === "<p><br></p>"
}

export function ComposePage({
  user,
  defaultFrom,
  onSent,
}: {
  user: AuthUser
  defaultFrom?: string
  onSent?: (localId: string) => void
}) {
  const fromOptions = user.emails

  const defaultFromResolved = useMemo(() => {
    if (
      defaultFrom &&
      defaultFrom !== "all" &&
      fromOptions.includes(defaultFrom)
    ) {
      return defaultFrom
    }
    return fromOptions[0] ?? ""
  }, [defaultFrom, fromOptions])

  const [from, setFrom] = useState(defaultFromResolved)
  const [to, setTo] = useState("")
  const [cc, setCc] = useState("")
  const [bcc, setBcc] = useState("")
  const [subject, setSubject] = useState("")
  const [bodyMode, setBodyMode] = useState<BodyMode>("rich")
  const [htmlBody, setHtmlBody] = useState("")
  const [mdBody, setMdBody] = useState("")
  const [showExtras, setShowExtras] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [canSendMap, setCanSendMap] = useState<Map<string, boolean>>(new Map())
  const [capsLoading, setCapsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void getSendCapabilities()
      .then(({ items }) => {
        if (cancelled) return
        setCanSendMap(new Map(items.map((i) => [i.address, i.can_send])))
      })
      .catch(() => {
        if (!cancelled) setCanSendMap(new Map())
      })
      .finally(() => {
        if (!cancelled) setCapsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const fromCanSend = from ? (canSendMap.get(from) ?? false) : false
  const noEmails = fromOptions.length === 0

  function bodyIsEmpty(): boolean {
    if (bodyMode === "rich") return isEmptyHtml(htmlBody)
    return !mdBody.trim()
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    if (!from.trim()) {
      setError("请选择发件地址")
      return
    }
    if (!to.trim()) {
      setError("请填写收件人")
      return
    }
    if (!subject.trim()) {
      setError("请填写主题")
      return
    }
    if (bodyIsEmpty()) {
      setError("请填写正文")
      return
    }
    if (!fromCanSend) {
      setError("该发件域名未配置 Resend，无法发送")
      return
    }

    let text: string | undefined
    let html: string | undefined

    if (bodyMode === "rich") {
      html = sanitizeHtml(htmlBody)
      if (!html) {
        setError("请填写正文")
        return
      }
      text = htmlToPlainText(html) || undefined
    } else {
      const md = mdBody.trim()
      html = sanitizeHtml(mdToHtml(md))
      if (!html) {
        setError("请填写正文")
        return
      }
      text = md
    }

    setSubmitting(true)
    try {
      const { id, resendId } = await sendOutboundMail({
        from: from.trim(),
        to: to.trim(),
        subject: subject.trim(),
        html,
        text,
        cc: cc.trim() || undefined,
        bcc: bcc.trim() || undefined,
      })
      setSuccess(`已发送（Resend id: ${resendId}）`)
      setTo("")
      setCc("")
      setBcc("")
      setSubject("")
      setHtmlBody("")
      setMdBody("")
      setShowExtras(false)
      onSent?.(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <form
        id="compose-form"
        onSubmit={(e) => void onSubmit(e)}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <div className="flex h-14 shrink-0 items-center gap-1 px-4">
          <span className="text-sm font-medium">写邮件</span>
          <div className="ml-auto flex items-center gap-2">
            {success ? (
              <span className="hidden text-xs text-emerald-600 sm:inline dark:text-emerald-500">
                {success}
              </span>
            ) : null}
            <Button
              type="submit"
              size="sm"
              disabled={
                submitting || noEmails || !fromCanSend || capsLoading
              }
              className="gap-1.5"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              发送
            </Button>
          </div>
        </div>
        <Separator />

        <div className="shrink-0 space-y-3 px-6 py-4">
          {noEmails ? (
            <p className="text-sm text-destructive">
              你还没有可用邮箱，请先在侧栏添加。
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="发件人">
              <select
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                disabled={noEmails || submitting}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
              >
                {fromOptions.map((addr) => (
                  <option key={addr} value={addr}>
                    {addr}
                    {canSendMap.has(addr) && !canSendMap.get(addr)
                      ? "（不可发）"
                      : ""}
                  </option>
                ))}
              </select>
              {!capsLoading && from && !fromCanSend ? (
                <p className="mt-1 text-xs text-amber-600 dark:text-amber-500">
                  该域名未配置 Resend API Key，无法从此地址发信。
                </p>
              ) : null}
            </Field>

            <Field label="收件人">
              <Input
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="a@example.com, b@example.com"
                disabled={submitting}
                autoComplete="off"
              />
            </Field>
          </div>

          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => setShowExtras((v) => !v)}
          >
            {showExtras ? "隐藏" : "显示"} 抄送 / 密送
          </button>

          {showExtras ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="抄送 (Cc)">
                <Input
                  value={cc}
                  onChange={(e) => setCc(e.target.value)}
                  placeholder="可选"
                  disabled={submitting}
                  autoComplete="off"
                />
              </Field>
              <Field label="密送 (Bcc)">
                <Input
                  value={bcc}
                  onChange={(e) => setBcc(e.target.value)}
                  placeholder="可选"
                  disabled={submitting}
                  autoComplete="off"
                />
              </Field>
            </div>
          ) : null}

          <Field label="主题">
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={submitting}
              className="text-base font-medium"
            />
          </Field>

          <p className="text-xs text-muted-foreground">
            多个收件地址用逗号或分号分隔 · 通过 Resend 代发
          </p>

          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}
          {success ? (
            <p className="text-sm text-emerald-600 sm:hidden dark:text-emerald-500">
              {success}
            </p>
          ) : null}
        </div>

        <Separator />

        <article className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 py-4">
          <Tabs
            value={bodyMode}
            onValueChange={(v) => setBodyMode(v as BodyMode)}
            className="flex min-h-0 flex-1 flex-col gap-2"
          >
            <div className="flex shrink-0 items-center gap-3">
              <Label className="text-sm text-muted-foreground">正文</Label>
              <TabsList className="ml-auto">
                <TabsTrigger value="rich">富文本</TabsTrigger>
                <TabsTrigger value="markdown">Markdown</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent
              value="rich"
              className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden outline-none"
            >
              <RichTextEditor
                value={htmlBody}
                onChange={setHtmlBody}
                disabled={submitting}
              />
            </TabsContent>
            <TabsContent
              value="markdown"
              className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden outline-none"
            >
              <MarkdownEditor
                value={mdBody}
                onChange={setMdBody}
                disabled={submitting}
              />
            </TabsContent>
          </Tabs>
        </article>
      </form>
    </section>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}
