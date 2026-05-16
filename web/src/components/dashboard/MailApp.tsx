import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Sidebar, type Folder } from "@/components/dashboard/Sidebar"
import { MailList } from "@/components/dashboard/MailList"
import { MailView } from "@/components/dashboard/MailView"
import {
  getEmail,
  listEmails,
  openMailStream,
  type AuthUser,
  type EmailDetail,
  type EmailListItem,
  type MailboxFilter,
} from "@/lib/api"
import { useAuth } from "@/lib/auth"

const folderLabels: Record<Folder, string> = {
  inbox: "收件箱",
  starred: "星标",
  sent: "已发送",
  drafts: "草稿箱",
  trash: "回收站",
}

type LiveStatus = "connecting" | "live" | "offline"

export function MailApp({ user }: { user: AuthUser }) {
  const { logout, refresh } = useAuth()
  const navigate = useNavigate()
  const [localUser, setLocalUser] = useState<AuthUser>(user)
  const [folder, setFolder] = useState<Folder>("inbox")
  const [mailboxFilter, setMailboxFilter] = useState<MailboxFilter>("all")

  const [items, setItems] = useState<EmailListItem[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<EmailDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const [liveStatus, setLiveStatus] = useState<LiveStatus>("connecting")

  const detailCache = useRef<Map<string, EmailDetail>>(new Map())
  const detailReqId = useRef(0)

  const refreshList = useCallback(async () => {
    if (folder !== "inbox") {
      setItems([])
      setListError(null)
      setListLoading(false)
      setSelectedId(null)
      setDetail(null)
      return
    }
    setListLoading(true)
    setListError(null)
    try {
      const { items: rows } = await listEmails({
        limit: 50,
        address: mailboxFilter,
      })
      setItems(rows)
      setSelectedId((prev) => prev ?? rows[0]?.id ?? null)
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e))
    } finally {
      setListLoading(false)
    }
  }, [folder, mailboxFilter])

  useEffect(() => {
    void refreshList()
  }, [refreshList])

  useEffect(() => {
    if (!selectedId) {
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
  }, [selectedId])

  useEffect(() => {
    setLocalUser(user)
  }, [user])

  useEffect(() => {
    setLiveStatus("connecting")
    const es = openMailStream({
      onReady: () => setLiveStatus("live"),
      onError: () => setLiveStatus("offline"),
      onMail: (item, addresses) => {
        if (
          mailboxFilter !== "all" &&
          !addresses.map((a) => a.toLowerCase()).includes(mailboxFilter.toLowerCase())
        ) {
          return
        }
        setItems((prev) => {
          if (prev.some((m) => m.id === item.id)) return prev
          return [item, ...prev]
        })
        setSelectedId((prev) => prev ?? item.id)
      },
    })
    return () => es.close()
  }, [localUser.id, mailboxFilter])

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
      <MailList
        title={folderLabels[folder]}
        mails={items}
        selectedId={selectedId}
        onSelect={setSelectedId}
        loading={listLoading}
        error={listError}
        onRetry={() => void refreshList()}
      />
      <MailView mail={detail} loading={detailLoading} error={detailError} />
    </div>
  )
}
