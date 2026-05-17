import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertTriangle, Loader2, RefreshCw, Search, Settings2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { listAdminUsers, type AdminUserRow, ApiError } from "@/lib/api"
import { AdminUserDetailDialog } from "@/components/admin/AdminUserDetailDialog"

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

export function AdminUsersPage() {
  const [rows, setRows] = useState<AdminUserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<AdminUserRow | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { users } = await listAdminUsers()
      setRows(users)
    } catch (e) {
      setRows([])
      setError(e instanceof ApiError ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((u) => u.username.toLowerCase().includes(q))
  }, [rows, search])

  function openDetail(user: AdminUserRow) {
    setSelected(user)
    setDetailOpen(true)
  }

  function handleUserUpdated(updated: AdminUserRow) {
    setRows((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))
    setSelected(updated)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
        <div>
          <h1 className="text-sm font-semibold">注册用户</h1>
          <p className="text-xs text-muted-foreground">搜索用户，通过「管理」调整配额与邮箱</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索用户名…"
              className="h-8 w-40 pl-7 text-xs md:w-52"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={loading}
            onClick={() => void load()}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            刷新
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载中…
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
            <Button type="button" size="sm" variant="outline" onClick={() => void load()}>
              重试
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {rows.length === 0 ? "暂无注册用户" : "无匹配用户"}
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2.5">用户名</th>
                  <th className="px-3 py-2.5">邮箱</th>
                  <th className="px-3 py-2.5">注册时间</th>
                  <th className="px-3 py-2.5">最后登录</th>
                  <th className="px-3 py-2.5 text-right">配额</th>
                  <th className="px-3 py-2.5 text-right">邮件数</th>
                  <th className="px-3 py-2.5 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2 font-mono text-xs">{u.username}</td>
                    <td
                      className="max-w-[200px] truncate px-3 py-2 font-mono text-xs"
                      title={u.emails.join(", ")}
                    >
                      {u.emails.length > 0 ? (
                        <>
                          {u.emails[0]}
                          {u.emails.length > 1 ? (
                            <span className="text-muted-foreground"> +{u.emails.length - 1}</span>
                          ) : null}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                      {formatIso(u.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                      {formatIso(u.last_login_at)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Badge variant="secondary" className="tabular-nums">
                        {u.owned_email_count}/{u.max_emails}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {u.email_count}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        onClick={() => openDetail(u)}
                      >
                        <Settings2 className="h-3.5 w-3.5" />
                        管理
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AdminUserDetailDialog
        user={selected}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onUserUpdated={handleUserUpdated}
      />
    </div>
  )
}

