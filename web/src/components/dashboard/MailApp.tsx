import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Sidebar, type Folder } from "@/components/dashboard/Sidebar"
import { HooksPage } from "@/components/dashboard/HooksPage"
import { MailList } from "@/components/dashboard/MailList"
import { MailView } from "@/components/dashboard/MailView"
import { ComposePage } from "@/components/dashboard/ComposePage"
import {
  getEmail,
  listEmails,
  openMailStream,
  setEmailStarred,
  setEmailTrashed,
  type AuthUser,
  type EmailDetail,
  type EmailListItem,
  type MailboxFilter,
} from "@/lib/api"
import { useAuth } from "@/lib/auth"

const folderLabels: Record<Exclude<Folder, "hooks" | "compose">, string> = {
  inbox: "收件箱",
  starred: "星标",
  sent: "已发送",
  drafts: "草稿箱",
  trash: "回收站",
}

const PAGE_SIZE = 50
const SEARCH_DEBOUNCE_MS = 300

type LiveStatus = "connecting" | "live" | "offline"

function isMailListFolder(
  folder: Folder,
): folder is "inbox" | "starred" | "trash" | "sent" {
  return (
    folder === "inbox" ||
    folder === "starred" ||
    folder === "trash" ||
    folder === "sent"
  )
}

function matchesListItemSearch(item: EmailListItem, kw: string): boolean {
  const lower = kw.toLowerCase()
  const from = (item.from_name?.trim() || item.from_addr?.trim() || "").toLowerCase()
  const subject = (item.subject?.trim() || "").toLowerCase()
  const addr = (item.from_addr ?? "").toLowerCase()
  const to = (item.to_addr ?? "").toLowerCase()
  return (
    from.includes(lower) ||
    subject.includes(lower) ||
    addr.includes(lower) ||
    to.includes(lower)
  )
}

export function MailApp({ user }: { user: AuthUser }) {
  const { logout, refresh } = useAuth()
  const navigate = useNavigate()
  const [localUser, setLocalUser] = useState<AuthUser>(user)
  const [folder, setFolder] = useState<Folder>("inbox")
  const [mailboxFilter, setMailboxFilter] = useState<MailboxFilter>("all")

  const [items, setItems] = useState<EmailListItem[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<EmailDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const [liveStatus, setLiveStatus] = useState<LiveStatus>("connecting")
  const detailCache = useRef<Map<string, EmailDetail>>(new Map())
  const detailReqId = useRef(0)
  const debouncedQueryRef = useRef(debouncedQuery)

  useEffect(() => {
    debouncedQueryRef.current = debouncedQuery
  }, [debouncedQuery])

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [query])

  const listFetchParams = useCallback(
    () => ({
      limit: PAGE_SIZE,
      address: mailboxFilter,
      q: debouncedQuery.trim() || undefined,
      starred: folder === "starred" ? true : undefined,
      trashed: folder === "trash" ? true : undefined,
      sent: folder === "sent" ? true : undefined,
    }),
    [folder, mailboxFilter, debouncedQuery],
  )

  const handleMailSent = useCallback((id: string) => {
    setFolder("sent")
    setSelectedId(id)
    setDetail(null)
    detailCache.current.delete(id)
  }, [])

  const refreshList = useCallback(async () => {
    if (!isMailListFolder(folder)) {
      setItems([])
      setListError(null)
      setListLoading(false)
      setHasMore(false)
      setLoadingMore(false)
      setSelectedId(null)
      setDetail(null)
      return
    }
    setListLoading(true)
    setListError(null)
    try {
      const { items: rows } = await listEmails(listFetchParams())
      setItems(rows)
      setHasMore(rows.length === PAGE_SIZE)
      setSelectedId((prev) => {
        if (prev && rows.some((r) => r.id === prev)) return prev
        return rows[0]?.id ?? null
      })
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e))
      setHasMore(false)
    } finally {
      setListLoading(false)
    }
  }, [folder, listFetchParams])

  const loadMore = useCallback(async () => {
    if (!isMailListFolder(folder) || listLoading || loadingMore || !hasMore) return
    const last = items[items.length - 1]
    if (!last) return
    setLoadingMore(true)
    setListError(null)
    try {
      const { items: rows } = await listEmails({
        ...listFetchParams(),
        before: last.received_at,
      })
      setItems((prev) => {
        const seen = new Set(prev.map((m) => m.id))
        const merged = [...prev]
        for (const row of rows) {
          if (!seen.has(row.id)) merged.push(row)
        }
        return merged
      })
      setHasMore(rows.length === PAGE_SIZE)
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoadingMore(false)
    }
  }, [folder, hasMore, items, listFetchParams, listLoading, loadingMore])

  const toggleStar = useCallback(
    async (id: string, starred: boolean) => {
      const prevItems = items
      const prevDetail = detail
      setItems((prev) => {
        if ((folder === "starred" || folder === "sent") && !starred) {
          return prev.filter((m) => m.id !== id)
        }
        return prev.map((m) => (m.id === id ? { ...m, starred } : m))
      })
      if (detail?.id === id) {
        setDetail((d) => (d ? { ...d, starred } : d))
        const cached = detailCache.current.get(id)
        if (cached) detailCache.current.set(id, { ...cached, starred })
      }
      try {
        await setEmailStarred(id, starred)
      } catch (e) {
        setItems(prevItems)
        if (prevDetail?.id === id) setDetail(prevDetail)
        setListError(e instanceof Error ? e.message : String(e))
      }
    },
    [detail, folder, items],
  )

  const toggleTrash = useCallback(
    async (id: string, trashed: boolean) => {
      const prevItems = items
      const prevDetail = detail
      const removeFromList =
        (folder === "trash" && !trashed) ||
        ((folder === "inbox" || folder === "starred" || folder === "sent") &&
          trashed)
      setItems((prev) => {
        if (removeFromList) return prev.filter((m) => m.id !== id)
        return prev.map((m) => (m.id === id ? { ...m, trashed } : m))
      })
      if (detail?.id === id) {
        setDetail((d) => (d ? { ...d, trashed } : d))
        const cached = detailCache.current.get(id)
        if (cached) detailCache.current.set(id, { ...cached, trashed })
      }
      if (removeFromList && selectedId === id) {
        const next = prevItems.filter((m) => m.id !== id)
        setSelectedId(next[0]?.id ?? null)
        if (folder === "trash" && !trashed) {
          setDetail(null)
        }
      }
      try {
        await setEmailTrashed(id, trashed)
      } catch (e) {
        setItems(prevItems)
        if (prevDetail?.id === id) setDetail(prevDetail)
        setListError(e instanceof Error ? e.message : String(e))
      }
    },
    [detail, folder, items, selectedId],
  )

  useEffect(() => {
    void refreshList()
  }, [refreshList])

  useEffect(() => {
    if (folder === "hooks" || folder === "compose" || !selectedId) {
      setDetail(null)
      setDetailError(null)
      return
    }
    const cached = detailCache.current.get(selectedId)
    if (cached) {
      setDetail(cached)
      setDetailError(null)
      setDetailLoading(false)
      return
    }
    const reqId = ++detailReqId.current
    setDetailLoading(true)
    setDetailError(null)
    getEmail(selectedId)
      .then((d) => {
        if (reqId !== detailReqId.current) return
        detailCache.current.set(d.id, d)
        setDetail(d)
      })
      .catch((e: unknown) => {
        if (reqId !== detailReqId.current) return
        setDetail(null)
        setDetailError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (reqId !== detailReqId.current) return
        setDetailLoading(false)
      })
  }, [folder, selectedId])

  useEffect(() => {
    setLocalUser(user)
  }, [user])

  useEffect(() => {
    setLiveStatus("connecting")
    const es = openMailStream({
      onReady: () => setLiveStatus("live"),
      onError: () => setLiveStatus("offline"),
      onMail: (item, addresses) => {
        if (folder !== "inbox") return
        if (
          mailboxFilter !== "all" &&
          !addresses.map((a) => a.toLowerCase()).includes(mailboxFilter.toLowerCase())
        ) {
          return
        }
        const kw = debouncedQueryRef.current.trim()
        if (kw && !matchesListItemSearch(item, kw)) return
        const row: EmailListItem = {
          ...item,
          starred: item.starred ?? false,
          trashed: item.trashed ?? false,
        }
        setItems((prev) => {
          if (prev.some((m) => m.id === row.id)) return prev
          return [row, ...prev]
        })
        setSelectedId((prev) => prev ?? row.id)
      },
    })
    return () => es.close()
  }, [folder, localUser.id, mailboxFilter])

  return (
    <div className="flex h-svh w-full overflow-hidden bg-background text-foreground">
      <Sidebar
        user={localUser}
        active={folder}
        liveStatus={liveStatus}
        inboxCount={items.length}
        mailboxFilter={mailboxFilter}
        onMailboxFilterChange={(v) => {
          setMailboxFilter(v)
          setSelectedId(null)
          setDetail(null)
        }}
        onUserUpdated={(emails) => {
          setLocalUser((prev) => ({ ...prev, emails }))
          if (
            mailboxFilter !== "all" &&
            !emails.map((e) => e.toLowerCase()).includes(mailboxFilter.toLowerCase())
          ) {
            setMailboxFilter("all")
          }
          void refresh()
        }}
        onChange={(f) => {
          setFolder(f)
          setSelectedId(null)
          setDetail(null)
        }}
        onLogout={() =>
          void (async () => {
            await logout()
            void navigate({ to: "/login", replace: true })
          })()
        }
      />
      {folder === "compose" ? (
        <ComposePage
          key={mailboxFilter}
          user={localUser}
          defaultFrom={
            mailboxFilter !== "all" ? mailboxFilter : undefined
          }
          onSent={handleMailSent}
        />
      ) : folder === "hooks" ? (
        <HooksPage />
      ) : (
        <>
          <MailList
            title={folderLabels[folder]}
            variant={folder === "sent" ? "sent" : "inbox"}
            mails={items}
            selectedId={selectedId}
            onSelect={setSelectedId}
            loading={listLoading}
            error={listError}
            onRetry={() => void refreshList()}
            query={query}
            onQueryChange={setQuery}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadMore={() => void loadMore()}
            onToggleStar={(id, starred) => void toggleStar(id, starred)}
          />
          <MailView
            mail={detail}
            loading={detailLoading}
            error={detailError}
            onToggleStar={(starred) => {
              if (!selectedId) return
              void toggleStar(selectedId, starred)
            }}
            onToggleTrash={(trashed) => {
              if (!selectedId) return
              void toggleTrash(selectedId, trashed)
            }}
          />
        </>
      )}
    </div>
  )
}
