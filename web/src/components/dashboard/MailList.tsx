import { useEffect, useRef } from "react"
import { Search, AlertTriangle, Clock, Zap, Star } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import type { EmailListItem } from "@/lib/api"
import { EmailAvatar } from "@/components/dashboard/EmailAvatar"

function displayFrom(m: EmailListItem) {
  return m.from_name?.trim() || m.from_addr?.trim() || "(未知发件人)"
}

function displayTo(m: EmailListItem) {
  return m.to_addr?.trim() || "(无收件人)"
}

function displaySubject(m: EmailListItem) {
  return m.subject?.trim() || "(无主题)"
}

function formatTime(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (sameDay) {
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
  }
  return `${d.getMonth() + 1}-${d.getDate()}`
}

const FAST_THRESHOLD_SEC = 7

function fastDeliveryDelta(date: string | null, receivedAt: string): number | null {
  if (!date) return null
  const sent = new Date(date).getTime()
  const received = new Date(receivedAt).getTime()
  if (Number.isNaN(sent) || Number.isNaN(received)) return null
  const diffSec = Math.abs(received - sent) / 1000
  return diffSec < FAST_THRESHOLD_SEC ? diffSec : null
}

function formatDeltaSec(sec: number) {
  return Number.isInteger(sec) ? `${sec}s` : `${sec.toFixed(1)}s`
}

export function MailList({
  mails,
  selectedId,
  onSelect,
  title = "收件箱",
  variant = "inbox",
  loading,
  error,
  onRetry,
  query,
  onQueryChange,
  hasMore,
  loadingMore,
  onLoadMore,
  onToggleStar,
}: {
  mails: EmailListItem[]
  selectedId: string | null
  onSelect: (id: string) => void
  title?: string
  variant?: "inbox" | "sent"
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  query: string
  onQueryChange: (value: string) => void
  hasMore: boolean
  loadingMore: boolean
  onLoadMore: () => void
  onToggleStar?: (id: string, starred: boolean) => void
}) {
  const isSent = variant === "sent"
  const sentinelRef = useRef<HTMLLIElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    const root = listRef.current
    const sentinel = sentinelRef.current
    if (!root || !sentinel || !hasMore || loading || loadingMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onLoadMore()
      },
      { root, rootMargin: "120px", threshold: 0 },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, loading, loadingMore, onLoadMore, mails.length])

  const searching = query.trim().length > 0

  return (
    <section className="flex w-full max-w-md shrink-0 flex-col border-r md:w-[380px]">
      <div className="flex h-14 items-center justify-between px-4">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold">{title}</h2>
          <span className="text-xs text-muted-foreground">
            {loading ? "加载中…" : `${mails.length} 封`}
          </span>
        </div>
      </div>
      <div className="px-3 pb-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="搜索邮件…"
            className="pl-8"
          />
        </div>
      </div>
      <Separator />
      <ul ref={listRef} className="flex-1 overflow-y-auto">
        {error ? (
          <li className="p-8 text-center text-sm text-destructive">
            <AlertTriangle className="mx-auto mb-2 h-5 w-5" />
            <p>加载失败：{error}</p>
            {onRetry ? (
              <button
                className="mt-3 text-xs text-primary underline-offset-4 hover:underline"
                onClick={onRetry}
              >
                重试
              </button>
            ) : null}
          </li>
        ) : loading && mails.length === 0 ? (
          <li className="p-8 text-center text-sm text-muted-foreground">加载中…</li>
        ) : mails.length === 0 ? (
          <li className="p-8 text-center text-sm text-muted-foreground">
            {searching ? "没有匹配的邮件" : "暂无邮件"}
          </li>
        ) : (
          <>
            {mails.map((m) => {
              const active = m.id === selectedId
              const isError = m.parse_status === "error"
              const isPending = m.parse_status === "pending"
              const fastDelta =
                isSent ? null : fastDeliveryDelta(m.date, m.received_at)
              const primaryLabel = isSent ? displayTo(m) : displayFrom(m)
              const secondaryAddr = isSent ? m.to_addr : m.from_addr
              const avatarEmail = isSent ? m.to_addr : m.from_addr
              const avatarName = isSent ? displayTo(m) : displayFrom(m)
              return (
                <li
                  key={m.id}
                  className={cn(
                    "flex w-full items-start gap-1 border-b px-2 py-3 transition-colors",
                    active ? "bg-accent" : "hover:bg-accent/50",
                  )}
                >
                  {onToggleStar ? (
                    <button
                      type="button"
                      title={m.starred ? "取消星标" : "加星标"}
                      className="mt-1 shrink-0 rounded p-1 text-muted-foreground hover:text-amber-500"
                      onClick={() => onToggleStar(m.id, !m.starred)}
                    >
                      <Star
                        className={cn(
                          "h-4 w-4",
                          m.starred && "fill-current text-amber-500",
                        )}
                      />
                    </button>
                  ) : (
                    <span className="w-6 shrink-0" />
                  )}
                  <button
                    type="button"
                    onClick={() => onSelect(m.id)}
                    className="flex min-w-0 flex-1 items-start gap-3 text-left"
                  >
                    <EmailAvatar
                      className="mt-0.5"
                      email={avatarEmail}
                      name={avatarName}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-foreground">
                          {primaryLabel}
                        </span>
                        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                          {formatTime(m.received_at)}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-sm text-foreground/80">
                        {displaySubject(m)}
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        {secondaryAddr ? (
                          <span className="truncate">
                            {isSent ? `发送至 ${secondaryAddr}` : secondaryAddr}
                          </span>
                        ) : null}
                        {isError ? (
                          <span className="ml-auto inline-flex items-center gap-1 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                            <AlertTriangle className="h-3 w-3" />
                            解析失败
                          </span>
                        ) : null}
                        {isPending ? (
                          <span className="ml-auto inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px]">
                            <Clock className="h-3 w-3" />
                            解析中
                          </span>
                        ) : null}
                        {fastDelta != null ? (
                          <span className="ml-auto inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600">
                            <Zap className="h-3 w-3" />
                            {formatDeltaSec(fastDelta)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </button>
                </li>
              )
            })}
            {hasMore || loadingMore ? (
              <li ref={sentinelRef} className="p-4 text-center text-xs text-muted-foreground">
                {loadingMore ? "加载更多…" : null}
              </li>
            ) : mails.length > 0 ? (
              <li className="p-4 text-center text-xs text-muted-foreground">没有更多了</li>
            ) : null}
          </>
        )}
      </ul>
    </section>
  )
}
