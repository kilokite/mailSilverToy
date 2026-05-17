import { useEffect, useMemo, useState } from "react"
import { Loader2, MailPlus, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import { Separator } from "@/components/ui/separator"
import {
  addAdminUserEmail,
  ApiError,
  deleteAdminUserEmail,
  patchAdminUserMaxEmails,
  type AdminUserRow,
} from "@/lib/api"
import { useAuth } from "@/lib/auth"

function formatIso(iso: string | null) {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  )
}

export function AdminUserDetailDialog({
  user,
  open,
  onOpenChange,
  onUserUpdated,
}: {
  user: AdminUserRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUserUpdated: (user: AdminUserRow) => void
}) {
  const { domains } = useAuth()
  const [local, setLocal] = useState<AdminUserRow | null>(user)
  const [maxEmailsInput, setMaxEmailsInput] = useState("")
  const [newLocal, setNewLocal] = useState("")
  const [newDomain, setNewDomain] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [savingQuota, setSavingQuota] = useState(false)
  const [addingEmail, setAddingEmail] = useState(false)
  const [deletingAddress, setDeletingAddress] = useState<string | null>(null)

  useEffect(() => {
    setLocal(user)
    setMaxEmailsInput(user ? String(user.max_emails) : "")
    setNewLocal("")
    setNewDomain("")
    setError(null)
  }, [user])

  const domainOptions = domains.length > 0 ? domains : ["@kt.sb"]
  const activeDomain = newDomain || domainOptions[0]
  const normalizedLocal = newLocal.trim().toLowerCase()
  const preview = useMemo(
    () =>
      normalizedLocal ? `${normalizedLocal}${activeDomain}` : `yourname${activeDomain}`,
    [normalizedLocal, activeDomain],
  )

  const atLimit = local ? local.emails.length >= local.max_emails : false

  async function saveQuota() {
    if (!local) return
    const parsed = Number.parseInt(maxEmailsInput, 10)
    if (!Number.isInteger(parsed) || parsed < 1) {
      setError("邮箱上限须为不小于 1 的整数")
      return
    }
    setSavingQuota(true)
    setError(null)
    try {
      const { user: updated } = await patchAdminUserMaxEmails(local.id, parsed)
      const next: AdminUserRow = { ...local, max_emails: updated.max_emails }
      setLocal(next)
      onUserUpdated(next)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    } finally {
      setSavingQuota(false)
    }
  }

  async function onAddEmail() {
    if (!local) return
    if (!normalizedLocal) {
      setError("请输入邮箱前缀")
      return
    }
    setAddingEmail(true)
    setError(null)
    try {
      const { emails } = await addAdminUserEmail(local.id, {
        prefix: normalizedLocal,
        domain: activeDomain,
      })
      const next: AdminUserRow = {
        ...local,
        emails,
        owned_email_count: emails.length,
      }
      setLocal(next)
      setNewLocal("")
      onUserUpdated(next)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    } finally {
      setAddingEmail(false)
    }
  }

  async function onDeleteEmail(address: string) {
    if (!local) return
    setDeletingAddress(address)
    setError(null)
    try {
      const { emails } = await deleteAdminUserEmail(local.id, address)
      const next: AdminUserRow = {
        ...local,
        emails,
        owned_email_count: emails.length,
      }
      setLocal(next)
      onUserUpdated(next)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    } finally {
      setDeletingAddress(null)
    }
  }

  if (!local) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2 pr-8">
            <DialogTitle className="font-mono">{local.username}</DialogTitle>
            <Badge variant="secondary">
              邮箱 {local.emails.length}/{local.max_emails}
            </Badge>
            <Badge variant="outline">收件 {local.email_count}</Badge>
          </div>
          <DialogDescription>管理该用户的邮箱配额与绑定地址</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="gap-4 py-4">
              <CardHeader className="px-4 pb-0">
                <CardTitle className="text-base">账户</CardTitle>
                <CardDescription>注册与登录信息</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 px-4">
                <div className="grid grid-cols-2 gap-3">
                  <MetaItem label="注册时间" value={formatIso(local.created_at)} />
                  <MetaItem label="最后登录" value={formatIso(local.last_login_at)} />
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label htmlFor="max-emails">邮箱上限</Label>
                  <div className="flex gap-2">
                    <Input
                      id="max-emails"
                      type="number"
                      min={1}
                      value={maxEmailsInput}
                      onChange={(e) => setMaxEmailsInput(e.target.value)}
                      className="tabular-nums"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={savingQuota}
                      onClick={() => void saveQuota()}
                    >
                      {savingQuota ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "保存"
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="flex max-h-[min(52vh,420px)] flex-col gap-0 py-0">
              <CardHeader className="border-b px-4 py-4">
                <CardTitle className="text-base">绑定邮箱</CardTitle>
                <CardDescription>
                  {atLimit ? "已达上限，请先提高配额或删除现有地址" : "可为该用户添加新地址"}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto px-4 py-3">
                {local.emails.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">暂无绑定邮箱</p>
                ) : (
                  <ul className="space-y-2">
                    {local.emails.map((address) => (
                      <li
                        key={address}
                        className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2"
                      >
                        <span className="min-w-0 flex-1 truncate font-mono text-sm">
                          {address}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive hover:text-destructive"
                          disabled={
                            local.emails.length <= 1 || deletingAddress === address
                          }
                          onClick={() => void onDeleteEmail(address)}
                        >
                          {deletingAddress === address ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
              <CardFooter className="mt-auto flex-col items-stretch gap-3 border-t px-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="email-prefix">新邮箱前缀</Label>
                  <div className="flex overflow-hidden rounded-md border bg-background shadow-xs">
                    <Input
                      id="email-prefix"
                      value={newLocal}
                      onChange={(e) => setNewLocal(e.target.value)}
                      placeholder="yourname"
                      disabled={atLimit || addingEmail}
                      className="rounded-none border-0 shadow-none focus-visible:ring-0"
                    />
                    <select
                      value={activeDomain}
                      onChange={(e) => setNewDomain(e.target.value)}
                      disabled={atLimit || addingEmail}
                      aria-label="域名后缀"
                      className="border-l bg-muted px-3 text-sm text-muted-foreground outline-none"
                    >
                      {domainOptions.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    预览 <span className="font-mono text-foreground">{preview}</span>
                  </p>
                </div>
                <Button
                  type="button"
                  className="w-full"
                  disabled={atLimit || addingEmail || !normalizedLocal}
                  onClick={() => void onAddEmail()}
                >
                  {addingEmail ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <MailPlus className="h-4 w-4" />
                  )}
                  {addingEmail ? "添加中…" : atLimit ? "已达上限" : "添加邮箱"}
                </Button>
              </CardFooter>
            </Card>
          </div>

          {error ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

