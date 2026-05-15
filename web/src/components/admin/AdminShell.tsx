import { Link, useNavigate } from "@tanstack/react-router"
import { LayoutDashboard, Mail, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth"
import { AdminUsersPage } from "@/components/admin/AdminUsersPage"

export function AdminShell() {
  const { logout } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="flex h-svh w-full overflow-hidden bg-background text-foreground">
      <aside className="hidden w-56 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex h-14 items-center gap-2 px-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <LayoutDashboard className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold">后台管理</span>
        </div>
        <Separator />
        <nav className="flex-1 space-y-0.5 p-3">
          <div
            className={cn(
              "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm",
              "bg-accent font-medium text-foreground",
            )}
          >
            <Users className="h-4 w-4" />
            <span>用户与邮件</span>
          </div>
        </nav>
        <Separator />
        <div className="space-y-1 p-3">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
            asChild
          >
            <Link to="/">
              <Mail className="h-4 w-4" />
              返回邮箱
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
            onClick={() =>
              void (async () => {
                await logout()
                void navigate({ to: "/login", replace: true })
              })()
            }
          >
            退出登录
          </Button>
        </div>
      </aside>
      <AdminUsersPage />
    </div>
  )
}
