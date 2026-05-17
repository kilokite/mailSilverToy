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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import {
  ApiError,
  createAdminHookSubscription,
  createHookSubscription,
  deleteAdminHookSubscription,
  deleteHookSubscription,
  getMyEmails,
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

function deliveryStatusBadge(status: HookDelivery["status"]) {
  if (status === "success") {
    return (
      <Badge
        variant="secondary"
        className="border-transparent bg-emerald-500/15 text-emerald-700"
      >
        {statusLabels[status]}
      </Badge>
    )
  }
  if (status === "failed") {
    return <Badge variant="destructive">{statusLabels[status]}</Badge>
  }
  return (
    <Badge variant="outline" className="border-amber-500/30 bg-amber-500/15 text-amber-700">
      {statusLabels[status]}
    </Badge>
  )
}

/** 从订阅 `filter_json` 解析指定监听地址；`null` 表示监听全部邮箱 */
function parseFilterAddresses(filterJson: string | null): string[] | null {
  if (!filterJson) return null
  try {
    const parsed = JSON.parse(filterJson) as { addresses?: unknown }
    if (!Array.isArray(parsed.addresses)) return null
    return parsed.addresses.filter((a): a is string => typeof a === "string")
  } catch {
    return null
  }
}

/** 列表展示的监听范围摘要 */
function formatFilterLabel(filterJson: string | null): string {
  const addrs = parseFilterAddresses(filterJson)
  if (!addrs) return "全部收件邮箱"
  if (addrs.length === 1) return addrs[0]
  return `${addrs.length} 个邮箱`
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
  const [myEmails, setMyEmails] = useState<string[]>([])
  const [createWatchAll, setCreateWatchAll] = useState(true)
  const [createFilterAddresses, setCreateFilterAddresses] = useState<string[]>([])

  const isAdminMode = mode === "admin"
  const isEmailNewEvent = createEvent === "email:new"

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
      if (!isAdminMode) {
        const { emails } = await getMyEmails()
        setMyEmails(emails)
      }
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
    if (
      !isAdminMode &&
      createEvent === "email:new" &&
      !createWatchAll &&
      createFilterAddresses.length === 0
    ) {
      setFormError("请至少选择一个监听邮箱，或选择监听全部")
      return
    }
    setCreateSubmitting(true)
    try {
      const createFn = isAdminMode ? createAdminHookSubscription : createHookSubscription
      const filter =
        !isAdminMode && createEvent === "email:new" && !createWatchAll
          ? { addresses: createFilterAddresses }
          : undefined
      await createFn({
        event: createEvent,
        target_url,
        secret: createSecret.trim() || null,
        ...(!isAdminMode && createEvent === "email:new" ? { filter: filter ?? null } : {}),
      })
      setCreateOpen(false)
      setCreateUrl("")
      setCreateSecret("")
      setCreateWatchAll(true)
      setCreateFilterAddresses([])
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
              setCreateWatchAll(true)
              setCreateFilterAddresses(myEmails.length === 1 ? [...myEmails] : [])
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
          <Card className="mb-3 gap-2 border-destructive/30 bg-destructive/5 py-3 shadow-none">
            <CardContent className="px-3 py-0 text-sm text-destructive">{formError}</CardContent>
          </Card>
        ) : null}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载中…
          </div>
        ) : error ? (
          <Card className="border-destructive/30 bg-destructive/5 py-8 shadow-none">
            <CardContent className="flex flex-col items-center gap-3 text-center">
              <AlertTriangle className="h-8 w-8 text-destructive" />
              <p className="text-sm text-destructive">{error}</p>
              <Button type="button" size="sm" variant="outline" onClick={() => void load()}>
                重试
              </Button>
            </CardContent>
          </Card>
        ) : items.length === 0 ? (
          <Card className="border-dashed py-10 shadow-none">
            <CardContent className="text-center">
            <p className="text-sm text-muted-foreground">还没有 Webhook 订阅</p>
              <CardDescription className="mt-1">
                例如将{" "}
                <span className="font-mono text-foreground/80">
                  {isAdminMode ? "user:registered" : "email:new"}
                </span>{" "}
                推送到 Discord 或自建服务
              </CardDescription>
            <Button
              type="button"
              size="sm"
              className="mt-4 gap-1.5"
              onClick={() => {
                setCreateWatchAll(true)
                setCreateFilterAddresses(myEmails.length === 1 ? [...myEmails] : [])
                setCreateOpen(true)
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              创建第一个订阅
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {items.map((sub) => {
              const expanded = expandedId === sub.id
              const busy = actionId === sub.id
              const rows = deliveries[sub.id] ?? []
              const filterAddrs = parseFilterAddresses(sub.filter_json)
              return (
                <Card key={sub.id} className="gap-0 overflow-hidden py-0 shadow-sm">
                  <CardContent className="flex flex-wrap items-start gap-3 p-4">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="mt-0.5 shrink-0 text-muted-foreground"
                      onClick={() => void toggleExpand(sub.id)}
                      aria-expanded={expanded}
                    >
                      {expanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </Button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {sub.event}
                        </Badge>
                        <Badge
                          variant="secondary"
                          className={cn(
                            "text-[10px]",
                            sub.active
                              ? "border-transparent bg-emerald-500/15 text-emerald-700"
                              : "text-muted-foreground",
                          )}
                        >
                          {sub.active ? "已启用" : "已停用"}
                        </Badge>
                        {sub.secret ? (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">
                            已配置签名密钥
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{eventLabel(sub.event)}</p>
                      {sub.event === "email:new" && !isAdminMode ? (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] text-muted-foreground">监听</span>
                          {filterAddrs ? (
                            filterAddrs.map((addr) => (
                              <Badge
                                key={addr}
                                variant="secondary"
                                className="font-mono text-[10px] font-normal"
                              >
                                {addr}
                              </Badge>
                            ))
                          ) : (
                            <Badge variant="secondary" className="text-[10px] font-normal">
                              {formatFilterLabel(sub.filter_json)}
                            </Badge>
                          )}
                        </div>
                      ) : null}
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
                  </CardContent>

                  {expanded ? (
                    <>
                      <Separator />
                      <CardContent className="bg-muted/30 py-3">
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
                                    {deliveryStatusBadge(d.status)}
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
                      </CardContent>
                    </>
                  ) : null}
                </Card>
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
          <DialogBody className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="hook-event" className="text-xs font-normal text-muted-foreground">
                事件类型
              </Label>
              <Select
                value={createEvent || events[0]?.name || ""}
                onValueChange={setCreateEvent}
              >
                <SelectTrigger id="hook-event" className="w-full">
                  <SelectValue placeholder="选择事件" />
                </SelectTrigger>
                <SelectContent>
                  {events.map((ev) => (
                    <SelectItem key={ev.name} value={ev.name}>
                      {ev.name} — {ev.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="hook-url" className="text-xs font-normal text-muted-foreground">
                目标 URL
              </Label>
              <Input
                id="hook-url"
                value={createUrl}
                onChange={(e) => setCreateUrl(e.target.value)}
                placeholder="https://example.com/webhook"
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hook-secret" className="text-xs font-normal text-muted-foreground">
                签名密钥（可选）
              </Label>
              <Input
                id="hook-secret"
                value={createSecret}
                onChange={(e) => setCreateSecret(e.target.value)}
                placeholder="留空则不发送签名头"
                className="font-mono text-xs"
                type="password"
                autoComplete="off"
              />
            </div>
            {!isAdminMode && isEmailNewEvent ? (
              <Card className="gap-3 py-3 shadow-none">
                <CardHeader className="px-3 pb-0">
                  <CardTitle className="text-xs font-medium text-muted-foreground">
                    监听邮箱
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 px-3">
                  <RadioGroup
                    value={createWatchAll ? "all" : "selected"}
                    onValueChange={(v) => {
                      const all = v === "all"
                      setCreateWatchAll(all)
                      if (!all && createFilterAddresses.length === 0 && myEmails.length > 0) {
                        setCreateFilterAddresses([myEmails[0]])
                      }
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="all" id="watch-all" />
                      <Label htmlFor="watch-all" className="font-normal">
                        全部收件邮箱
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="selected" id="watch-selected" />
                      <Label htmlFor="watch-selected" className="font-normal">
                        仅指定邮箱
                      </Label>
                    </div>
                  </RadioGroup>
                  {!createWatchAll ? (
                  <div className="ml-1 max-h-36 space-y-1.5 overflow-y-auto border-l pl-3">
                    {myEmails.length === 0 ? (
                      <p className="text-xs text-muted-foreground">暂无邮箱，请先在侧栏添加</p>
                    ) : (
                      myEmails.map((addr) => {
                        const checked = createFilterAddresses.includes(addr)
                        return (
                          <div key={addr} className="flex items-center gap-2">
                            <Checkbox
                              id={`watch-${addr}`}
                              checked={checked}
                              onCheckedChange={(v) => {
                                setCreateFilterAddresses((prev) =>
                                  v === true
                                    ? [...prev, addr]
                                    : prev.filter((a) => a !== addr),
                                )
                              }}
                            />
                            <Label
                              htmlFor={`watch-${addr}`}
                              className="font-mono text-xs font-normal"
                            >
                              {addr}
                            </Label>
                          </div>
                        )
                      })
                    )}
                  </div>
                ) : null}
                </CardContent>
              </Card>
            ) : null}
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
