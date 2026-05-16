import { useCallback, useEffect, useState } from "react"
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react"
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
import { cn } from "@/lib/utils"
import {
  ApiError,
  createAdminHookSubscription,
  createHookSubscription,
  deleteAdminHookSubscription,
  deleteHookSubscription,
  listAdminHookDeliveries,
  listAdminHookEvents,
  listAdminHookSubscriptions,
  listHookDeliveries,
  listHookEvents,
  listHookSubscriptions,
  testAdminHookSubscription,
  testHookSubscription,
  updateAdminHookSubscription,
  updateHookSubscription,
  type HookDelivery,
  type HookEventMeta,
  type HookSubscription,
} from "@/lib/api"

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
    second: "2-digit",
  })
}

const statusLabels: Record<HookDelivery["status"], string> = {
  pending: "进行中",
  success: "成功",
  failed: "失败",
}

function statusClass(status: HookDelivery["status"]) {
  if (status === "success") return "bg-emerald-500/15 text-emerald-700"
  if (status === "failed") return "bg-destructive/15 text-destructive"
  return "bg-amber-500/15 text-amber-700"
}

export function HooksPage({ mode = "user" }: { mode?: "user" | "admin" }) {
  const [events, setEvents] = useState<HookEventMeta[]>([])
  const [items, setItems] = useState<HookSubscription[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [deliveries, setDeliveries] = useState<Record<string, HookDelivery[]>>({})
  const [deliveriesLoading, setDeliveriesLoading] = useState<string | null>(null)
  const [actionId, setActionId] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [createEvent, setCreateEvent] = useState("")
  const [createUrl, setCreateUrl] = useState("")
  const [createSecret, setCreateSecret] = useState("")
  const [createSubmitting, setCreateSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const isAdminMode = mode === "admin"

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [{ events: ev }, { items: subs }] = await Promise.all([
        isAdminMode ? listAdminHookEvents() : listHookEvents(),
        isAdminMode ? listAdminHookSubscriptions() : listHookSubscriptions(),
      ])
      setEvents(ev)
      setItems(subs)
      setCreateEvent((prev) => prev || ev[0]?.name || "")
    } catch (e) {
      setItems([])
      setError(e instanceof ApiError ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [isAdminMode])

  useEffect(() => {
    void load()
  }, [load])

  async function loadDeliveries(subId: string) {
    setDeliveriesLoading(subId)
    try {
      const { items: rows } = isAdminMode
        ? await listAdminHookDeliveries(subId, 30)
        : await listHookDeliveries(subId, 30)
      setDeliveries((prev) => ({ ...prev, [subId]: rows }))
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : String(e))
    } finally {
      setDeliveriesLoading(null)
    }
  }

  async function toggleExpand(subId: string) {
    if (expandedId === subId) {
      setExpandedId(null)
      return
    }
    setExpandedId(subId)
    if (!deliveries[subId]) await loadDeliveries(subId)
  }

  async function onCreate() {
    setFormError(null)
    const target_url = createUrl.trim()
    if (!createEvent || !target_url) {
      setFormError("请填写事件类型与目标 URL")
      return
    }
    setCreateSubmitting(true)
    try {
      const createFn = isAdminMode ? createAdminHookSubscription : createHookSubscription
      await createFn({
        event: createEvent,
        target_url,
        secret: createSecret.trim() || null,
      })
      setCreateOpen(false)
      setCreateUrl("")
      setCreateSecret("")
      await load()
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : String(e))
    } finally {
      setCreateSubmitting(false)
    }
  }

  async function onToggleActive(sub: HookSubscription) {
    setActionId(sub.id)
    setFormError(null)
    try {
      const updateFn = isAdminMode ? updateAdminHookSubscription : updateHookSubscription
      await updateFn(sub.id, { active: !sub.active })
      await load()
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : String(e))
    } finally {
      setActionId(null)
    }
  }

  async function onDelete(sub: HookSubscription) {
    if (!window.confirm(`确定删除该 Webhook 订阅？\n${sub.target_url}`)) return
    setActionId(sub.id)
    setFormError(null)
    try {
      const deleteFn = isAdminMode ? deleteAdminHookSubscription : deleteHookSubscription
      await deleteFn(sub.id)
      if (expandedId === sub.id) setExpandedId(null)
      await load()
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : String(e))
    } finally {
      setActionId(null)
    }
  }

  async function onTest(sub: HookSubscription) {
    setActionId(sub.id)
    setFormError(null)
    try {
      const testFn = isAdminMode ? testAdminHookSubscription : testHookSubscription
      await testFn(sub.id)
      setExpandedId(sub.id)
      await loadDeliveries(sub.id)
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : String(e))
    } finally {
      setActionId(null)
    }
  }

  const eventLabel = (name: string) =>
    events.find((e) => e.name === name)?.description ?? name

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h1 className="text-sm font-semibold">
            {isAdminMode ? "系统 Webhook" : "Webhook 管理"}
          </h1>
          <p className="text-xs text-muted-foreground">
            {isAdminMode
              ? "管理员可订阅系统级事件，向你的 URL 发送带签名的 JSON 通知"
              : "订阅应用事件，向你的 URL 发送带签名的 JSON 通知"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={loading}
            onClick={() => void load()}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            刷新
          </Button>
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              setFormError(null)
              setCreateOpen(true)
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            新建订阅
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {formError && !createOpen ? (
          <p className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {formError}
          </p>
        ) : null}

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
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center">
            <p className="text-sm text-muted-foreground">还没有 Webhook 订阅</p>
            <p className="mt-1 text-xs text-muted-foreground">
              例如将{" "}
              <span className="font-mono">
                {isAdminMode ? "user:registered" : "email:new"}
              </span>{" "}
              推送到 Discord 或自建服务
            </p>
            <Button
              type="button"
              size="sm"
              className="mt-4 gap-1.5"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              创建第一个订阅
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((sub) => {
              const expanded = expandedId === sub.id
              const busy = actionId === sub.id
              const rows = deliveries[sub.id] ?? []
              return (
                <article
                  key={sub.id}
                  className="overflow-hidden rounded-lg border bg-card text-card-foreground"
                >
                  <div className="flex flex-wrap items-start gap-3 p-4">
                    <button
                      type="button"
                      className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
                      onClick={() => void toggleExpand(sub.id)}
                      aria-expanded={expanded}
                    >
                      {expanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-medium">{sub.event}</span>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-medium",
                            sub.active
                              ? "bg-emerald-500/15 text-emerald-700"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {sub.active ? "已启用" : "已停用"}
                        </span>
                        {sub.secret ? (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                            已配置签名密钥
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{eventLabel(sub.event)}</p>
                      <p
                        className="mt-2 break-all font-mono text-xs text-foreground"
                        title={sub.target_url}
                      >
                        {sub.target_url}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        创建于 {formatIso(sub.created_at)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1 px-2 text-xs"
                        disabled={busy}
                        onClick={() => void onTest(sub)}
                      >
                        {busy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                        测试
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 px-2 text-xs"
                        disabled={busy}
                        onClick={() => void onToggleActive(sub)}
                      >
                        {sub.active ? "停用" : "启用"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2 text-destructive hover:text-destructive"
                        disabled={busy}
                        onClick={() => void onDelete(sub)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {expanded ? (
                    <div className="border-t bg-muted/30 px-4 py-3">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-xs font-medium text-muted-foreground">最近投递</p>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 gap-1 px-2 text-xs"
                          disabled={deliveriesLoading === sub.id}
                          onClick={() => void loadDeliveries(sub.id)}
                        >
                          <RefreshCw
                            className={cn(
                              "h-3 w-3",
                              deliveriesLoading === sub.id && "animate-spin",
                            )}
                          />
                          刷新记录
                        </Button>
                      </div>
                      {deliveriesLoading === sub.id && rows.length === 0 ? (
                        <p className="py-4 text-center text-xs text-muted-foreground">加载中…</p>
                      ) : rows.length === 0 ? (
                        <p className="py-4 text-center text-xs text-muted-foreground">
                          暂无投递记录
                        </p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[520px] text-left text-xs">
                            <thead>
                              <tr className="border-b text-muted-foreground">
                                <th className="py-2 pr-3 font-medium">时间</th>
                                <th className="py-2 pr-3 font-medium">状态</th>
                                <th className="py-2 pr-3 font-medium">次数</th>
                                <th className="py-2 pr-3 font-medium">HTTP</th>
                                <th className="py-2 font-medium">说明</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((d) => (
                                <tr key={d.id} className="border-b border-border/60 last:border-0">
                                  <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">
                                    {formatIso(d.created_at)}
                                  </td>
                                  <td className="py-2 pr-3">
                                    <span
                                      className={cn(
                                        "inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium",
                                        statusClass(d.status),
                                      )}
                                    >
                                      {statusLabels[d.status]}
                                    </span>
                                  </td>
                                  <td className="py-2 pr-3 font-mono">{d.attempt}</td>
                                  <td className="py-2 pr-3 font-mono">
                                    {d.http_status ?? "—"}
                                  </td>
                                  <td className="max-w-xs truncate py-2 text-muted-foreground">
                                    {d.error ?? d.response_excerpt ?? "—"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>新建 Webhook 订阅</DialogTitle>
            <DialogDescription>
              目标 URL 需可公网访问；可选密钥用于校验 X-Hook-Signature 头。
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">事件类型</label>
              <select
                value={createEvent || events[0]?.name || ""}
                onChange={(e) => setCreateEvent(e.target.value)}
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
              >
                {events.map((ev) => (
                  <option key={ev.name} value={ev.name}>
                    {ev.name} — {ev.description}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">目标 URL</label>
              <Input
                value={createUrl}
                onChange={(e) => setCreateUrl(e.target.value)}
                placeholder="https://example.com/webhook"
                className="mt-1 font-mono text-xs"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">签名密钥（可选）</label>
              <Input
                value={createSecret}
                onChange={(e) => setCreateSecret(e.target.value)}
                placeholder="留空则不发送签名头"
                className="mt-1 font-mono text-xs"
                type="password"
                autoComplete="off"
              />
            </div>
            {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                取消
              </Button>
              <Button type="button" disabled={createSubmitting} onClick={() => void onCreate()}>
                {createSubmitting ? "创建中…" : "创建"}
              </Button>
            </div>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  )
}
