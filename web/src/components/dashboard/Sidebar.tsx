import {
  Inbox,
  Send,
  FileText,
  Star,
  Trash2,
  PenSquare,
  LogOut,
  Wifi,
  WifiOff,
  Copy,
  Check,
  LayoutDashboard,
  MailPlus,
  Trash2Icon,
  Settings2,
  Webhook,
} from "lucide-react"
import { useMemo, useState } from "react"
import { Link } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { AuthUser } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { addMyEmail, deleteMyEmail } from "@/lib/api"
import type { MailboxFilter } from "@/lib/api"
import logoUrl from "@/assets/logo.png"

export type Folder = "inbox" | "sent" | "drafts" | "starred" | "trash" | "hooks"

const folders: { key: Folder; label: string; icon: React.ElementType }[] = [
  { key: "inbox", label: "收件箱", icon: Inbox },
  { key: "starred", label: "星标", icon: Star },
  { key: "sent", label: "已发送", icon: Send },
  { key: "drafts", label: "草稿箱", icon: FileText },
  { key: "trash", label: "回收站", icon: Trash2 },
]

type LiveStatus = "connecting" | "live" | "offline"

const liveLabels: Record<LiveStatus, string> = {
  connecting: "连接中…",
  live: "Live",
  offline: "离线",
}

export function Sidebar({
  active,
  onChange,
  user,
  liveStatus,
  inboxCount,
  mailboxFilter,
  onMailboxFilterChange,
  onLogout,
  onUserUpdated,
}: {
  active: Folder
  onChange: (f: Folder) => void
  user: AuthUser
  liveStatus: LiveStatus
  inboxCount: number
  mailboxFilter: MailboxFilter
  onMailboxFilterChange: (filter: MailboxFilter) => void
  onLogout: () => void
  onUserUpdated: (emails: string[]) => void
}) {
  const { adminAccess, domains, refresh } = useAuth()
  const [copied, setCopied] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [manageDialogOpen, setManageDialogOpen] = useState(false)
  const [newLocal, setNewLocal] = useState("")
  const [newDomain, setNewDomain] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const domainOptions = domains.length > 0 ? domains : ["@kt.sb"]
  const activeDomain = newDomain || domainOptions[0]
  const normalizedLocal = newLocal.trim().toLowerCase()
  const preview = useMemo(
    () => (normalizedLocal ? `${normalizedLocal}${activeDomain}` : `yourname${activeDomain}`),
    [normalizedLocal, activeDomain],
  )

  const copyText = useMemo(() => {
    if (mailboxFilter === "all") return user.emails.join("\n")
    return mailboxFilter
  }, [mailboxFilter, user.emails])

  async function copySelection() {
    if (!copyText) return
    try {
      await navigator.clipboard.writeText(copyText)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }

  async function onAddEmail() {
    setEmailError(null)
    if (!normalizedLocal) {
      setEmailError("请输入邮箱前缀")
      return
    }
    setSubmitting(true)
    try {
      const { emails } = await addMyEmail({ prefix: normalizedLocal, domain: activeDomain })
      onUserUpdated(emails)
      await refresh()
      setAddDialogOpen(false)
      setNewLocal("")
    } catch (e) {
      setEmailError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  async function onDeleteEmail(address: string) {
    setEmailError(null)
    try {
      const { emails } = await deleteMyEmail(address)
      onUserUpdated(emails)
      await refresh()
    } catch (e) {
      setEmailError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <>
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex">
        <SidebarHeader liveStatus={liveStatus} />

        <div className="space-y-2 px-3 py-3">
          <div className="rounded-md border bg-background/60 p-2.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              收件邮箱
            </p>
            <div className="mt-1.5 flex items-stretch gap-1">
              <select
                value={mailboxFilter}
                onChange={(e) => onMailboxFilterChange(e.target.value as MailboxFilter)}
                className="min-w-0 flex-1 truncate rounded-md border bg-background px-2 py-1.5 font-mono text-xs outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
                title={mailboxFilter === "all" ? "全部邮箱" : mailboxFilter}
              >
                <option value="all">全部邮箱（聚合）</option>
                {user.emails.map((address) => (
                  <option key={address} value={address}>
                    {address}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 shrink-0 px-2"
                title={mailboxFilter === "all" ? "复制全部地址" : "复制地址"}
                disabled={user.emails.length === 0}
                onClick={() => void copySelection()}
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
            <div className="mt-2 flex gap-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 flex-1 justify-center gap-1 text-xs"
                onClick={() => setAddDialogOpen(true)}
              >
                <MailPlus className="h-3.5 w-3.5" />
                添加
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 shrink-0 px-2"
                title="管理邮箱"
                onClick={() => setManageDialogOpen(true)}
              >
                <Settings2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            {emailError ? (
              <p className="mt-1 text-[11px] text-destructive">{emailError}</p>
            ) : null}
          </div>

          <Button className="w-full justify-start gap-2" size="sm" disabled>
            <PenSquare className="h-4 w-4" />
            写邮件
          </Button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3 pt-0">
          {folders.map((f) => {
            const Icon = f.icon
            const isActive = f.key === active
            const count = f.key === "inbox" ? inboxCount : 0
            return (
              <button
                key={f.key}
                onClick={() => onChange(f.key)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-accent font-medium text-foreground"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1 text-left">{f.label}</span>
                {count > 0 ? (
                  <span className="text-xs text-muted-foreground">{count}</span>
                ) : null}
              </button>
            )
          })}
          <div className="px-1 pt-3">
            <p className="mb-1 px-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              工具
            </p>
            <button
              type="button"
              onClick={() => onChange("hooks")}
              className={cn(
                "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active === "hooks"
                  ? "bg-accent font-medium text-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              <Webhook className="h-4 w-4" />
              <span className="flex-1 text-left">Webhook</span>
            </button>
            {adminAccess ? (
              <Link
                to="/admin"
                className={cn(
                  "mt-0.5 flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                <LayoutDashboard className="h-4 w-4" />
                <span>后台管理</span>
              </Link>
            ) : null}
          </div>
        </nav>

        <Separator />
        <div className="p-3">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
            onClick={onLogout}
          >
            <LogOut className="h-4 w-4" />
            退出登录
          </Button>
        </div>
      </aside>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>添加邮箱</DialogTitle>
            <DialogDescription>后缀来自服务器配置的 MAIL_DOMAINS。</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">邮箱前缀</label>
              <div className="mt-1 flex items-stretch overflow-hidden rounded-md border">
                <Input
                  value={newLocal}
                  onChange={(e) => setNewLocal(e.target.value)}
                  placeholder="yourname"
                  className="rounded-none border-0 shadow-none focus-visible:ring-0"
                />
                <select
                  value={activeDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  className="bg-muted px-2 text-sm text-muted-foreground outline-none"
                >
                  {domainOptions.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                预览：<span className="font-mono text-foreground">{preview}</span>
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)}>
                取消
              </Button>
              <Button type="button" disabled={submitting} onClick={() => void onAddEmail()}>
                {submitting ? "添加中…" : "添加"}
              </Button>
            </div>
          </DialogBody>
        </DialogContent>
      </Dialog>

      <Dialog open={manageDialogOpen} onOpenChange={setManageDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>管理邮箱</DialogTitle>
            <DialogDescription>至少保留一个邮箱地址。</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-2">
            {user.emails.map((address) => (
              <div
                key={address}
                className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5"
              >
                <span className="truncate font-mono text-xs">{address}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-destructive hover:text-destructive"
                  disabled={user.emails.length <= 1}
                  onClick={() => void onDeleteEmail(address)}
                >
                  <Trash2Icon className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  )
}

function SidebarHeader({ liveStatus }: { liveStatus: LiveStatus }) {
  return (
    <>
      <div className="flex h-14 items-center gap-2 px-4">
        <img
          src={logoUrl}
          alt="irisMail"
          className="h-8 w-8 shrink-0 object-contain"
          style={{ imageRendering: "pixelated" }}
        />
        <span className="text-sm font-semibold">irisMail</span>
        <span
          className={cn(
            "ml-auto inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
            liveStatus === "live"
              ? "bg-emerald-500/15 text-emerald-600"
              : liveStatus === "connecting"
                ? "bg-amber-500/15 text-amber-600"
                : "bg-muted text-muted-foreground",
          )}
          title={liveLabels[liveStatus]}
        >
          {liveStatus === "offline" ? (
            <WifiOff className="h-3 w-3" />
          ) : (
            <Wifi className="h-3 w-3" />
          )}
          {liveLabels[liveStatus]}
        </span>
      </div>
      <Separator />
    </>
  )
}
