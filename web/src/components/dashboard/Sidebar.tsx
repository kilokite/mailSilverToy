import {
  Inbox,
  Send,
  FileText,
  Star,
  Trash2,
  Mail,
  PenSquare,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

export type Folder = "inbox" | "sent" | "drafts" | "starred" | "trash"

const folders: { key: Folder; label: string; icon: React.ElementType; count?: number }[] = [
  { key: "inbox", label: "收件箱", icon: Inbox, count: 8 },
  { key: "starred", label: "星标", icon: Star, count: 1 },
  { key: "sent", label: "已发送", icon: Send },
  { key: "drafts", label: "草稿箱", icon: FileText, count: 3 },
  { key: "trash", label: "回收站", icon: Trash2 },
]

export function Sidebar({
  active,
  onChange,
}: {
  active: Folder
  onChange: (f: Folder) => void
}) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex h-14 items-center gap-2 px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Mail className="h-4 w-4" />
        </div>
        <span className="text-sm font-semibold">mailSilver</span>
      </div>
      <Separator />

      <div className="px-3 pt-3">
        <Button className="w-full justify-start gap-2" size="sm">
          <PenSquare className="h-4 w-4" />
          写邮件
        </Button>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {folders.map((f) => {
          const Icon = f.icon
          const isActive = f.key === active
          return (
            <button
              key={f.key}
              onClick={() => onChange(f.key)}
              className={cn(
                "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-accent font-medium text-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1 text-left">{f.label}</span>
              {f.count ? (
                <span className="text-xs text-muted-foreground">{f.count}</span>
              ) : null}
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
