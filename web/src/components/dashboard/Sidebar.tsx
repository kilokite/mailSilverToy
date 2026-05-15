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
} from "lucide-react"
import { useState } from "react"
import { Link } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import type { AuthUser } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import logoUrl from "@/assets/logo.png"

export type Folder = "inbox" | "sent" | "drafts" | "starred" | "trash"

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
  live: "实时",
  offline: "离线",
}

export function Sidebar({
  active,
  onChange,
  user,
  liveStatus,
  inboxCount,
  onLogout,
}: {
  active: Folder
  onChange: (f: Folder) => void
  user: AuthUser
  liveStatus: LiveStatus
  inboxCount: number
  onLogout: () => void
}) {
  const { adminAccess } = useAuth()
  const [copied, setCopied] = useState(false)

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(user.email)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex h-14 items-center gap-2 px-4">
        <img
          src={logoUrl}
          alt="mailSilver"
          className="h-8 w-8 shrink-0 object-contain"
          style={{ imageRendering: "pixelated" }}
        />
        <span className="text-sm font-semibold">mailSilver</span>
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

      <div className="space-y-2 px-3 py-3">
        <div className="rounded-md border bg-background/60 p-2.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            你的邮箱地址
          </p>
          <button
            type="button"
            onClick={copyEmail}
            className="mt-1 flex w-full items-center justify-between gap-2 rounded text-left text-sm font-medium hover:text-primary"
            title="点击复制"
          >
            <span className="truncate font-mono">{user.email}</span>
            {copied ? (
              <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
            ) : (
              <Copy className="h-3.5 w-3.5 shrink-0 opacity-60" />
            )}
          </button>
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
        {adminAccess ? (
          <div className="px-1 pt-3">
            <p className="mb-1 px-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              管理
            </p>
            <Link
              to="/admin"
              className={cn(
                "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              <LayoutDashboard className="h-4 w-4" />
              <span>后台管理</span>
            </Link>
          </div>
        ) : null}
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
  )
}
