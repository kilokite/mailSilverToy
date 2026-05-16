import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { listAdminUsers, type AdminUserRow, ApiError } from "@/lib/api"

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

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
        <div>
          <h1 className="text-sm font-semibold">注册用户</h1>
          <p className="text-xs text-muted-foreground">
            各用户作为收件人关联到的邮件数量（按注册时间倒序）
          </p>
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
        ) : rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">暂无注册用户</p>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2.5">用户名</th>
                  <th className="px-3 py-2.5">邮箱</th>
                  <th className="px-3 py-2.5">注册时间</th>
                  <th className="px-3 py-2.5">最后登录</th>
                  <th className="px-3 py-2.5 text-right">拥有邮箱数</th>
                  <th className="px-3 py-2.5 text-right">邮件数</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((u) => (
                  <tr key={u.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2 font-mono text-xs">{u.username}</td>
                    <td
                      className="max-w-[260px] truncate px-3 py-2 font-mono text-xs"
                      title={u.emails.join(", ")}
                    >
                      {u.emails.join(", ")}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                      {formatIso(u.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                      {formatIso(u.last_login_at)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {u.owned_email_count}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {u.email_count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
