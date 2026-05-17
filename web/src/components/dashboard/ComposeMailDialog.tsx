import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react"
import { Loader2, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  getSendCapabilities,
  sendOutboundMail,
  type AuthUser,
} from "@/lib/api"
import { cn } from "@/lib/utils"

export function ComposeMailDialog({
  open,
  onOpenChange,
  user,
  defaultFrom,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: AuthUser
  /** 侧栏当前选中的邮箱，用于默认发件人 */
  defaultFrom?: string
}) {
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [cc, setCc] = useState("")
  const [bcc, setBcc] = useState("")
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [showExtras, setShowExtras] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [canSendMap, setCanSendMap] = useState<Map<string, boolean>>(new Map())
  const [capsLoading, setCapsLoading] = useState(false)

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

  useEffect(() => {
    if (!open) return
    setFrom(defaultFromResolved)
    setError(null)
    setSuccess(null)
    setCapsLoading(true)
    void getSendCapabilities()
      .then(({ items }) => {
        setCanSendMap(new Map(items.map((i) => [i.address, i.can_send])))
      })
      .catch(() => setCanSendMap(new Map()))
      .finally(() => setCapsLoading(false))
  }, [open, defaultFromResolved])

  const fromCanSend = from ? (canSendMap.get(from) ?? false) : false
  const noEmails = fromOptions.length === 0

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
    if (!body.trim()) {
      setError("请填写正文")
      return
    }
    if (!fromCanSend) {
      setError("该发件域名未配置 Resend，无法发送")
      return
    }

    setSubmitting(true)
    try {
      const { id } = await sendOutboundMail({
        from: from.trim(),
        to: to.trim(),
        subject: subject.trim(),
        text: body,
        cc: cc.trim() || undefined,
        bcc: bcc.trim() || undefined,
      })
      setSuccess(`已发送（Resend id: ${id}）`)
      setTo("")
      setCc("")
      setBcc("")
      setSubject("")
      setBody("")
      setShowExtras(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>写邮件</DialogTitle>
          <DialogDescription>
            通过 Resend 代发；发件地址须为你已绑定的邮箱。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void onSubmit(e)}>
          <DialogBody className="space-y-3">
            {noEmails ? (
              <p className="text-sm text-destructive">
                你还没有可用邮箱，请先在侧栏添加。
              </p>
            ) : null}

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
              <p className="mt-1 text-xs text-muted-foreground">
                多个地址用逗号或分号分隔
              </p>
            </Field>

            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => setShowExtras((v) => !v)}
            >
              {showExtras ? "隐藏" : "显示"} 抄送 / 密送
            </button>

            {showExtras ? (
              <>
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
              </>
            ) : null}

            <Field label="主题">
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                disabled={submitting}
              />
            </Field>

            <Field label="正文">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                disabled={submitting}
                rows={10}
                className={cn(
                  "w-full min-h-[160px] resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none",
                  "focus-visible:border-ring focus-visible:ring-[3px] focus:ring-ring/50",
                  "placeholder:text-muted-foreground disabled:opacity-50",
                )}
                placeholder="纯文本正文"
              />
            </Field>

            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : null}
            {success ? (
              <p className="text-sm text-emerald-600 dark:text-emerald-500">
                {success}
              </p>
            ) : null}
          </DialogBody>

          <div className="flex justify-end gap-2 border-t px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              {success ? "关闭" : "取消"}
            </Button>
            <Button
              type="submit"
              disabled={
                submitting || noEmails || !fromCanSend || capsLoading
              }
              className="gap-2"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              发送
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}
