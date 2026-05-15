import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import { Sidebar, type Folder } from "@/components/dashboard/Sidebar"
import { MailList } from "@/components/dashboard/MailList"
import { MailView } from "@/components/dashboard/MailView"
import { AuthScreen } from "@/components/auth/AuthScreen"
import {
  getEmail,
  listEmails,
  openMailStream,
  type AuthUser,
  type EmailDetail,
  type EmailListItem,
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

function MailApp({ user }: { user: AuthUser }) {
  const { logout } = useAuth()
  const [folder, setFolder] = useState<Folder>("inbox")

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
      const { items: rows } = await listEmails({ limit: 50 })
      setItems(rows)
      setSelectedId((prev) => prev ?? rows[0]?.id ?? null)
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e))
    } finally {
      setListLoading(false)
    }
  }, [folder])

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
    setLiveStatus("connecting")
    const es = openMailStream({
      onReady: () => setLiveStatus("live"),
      onError: () => setLiveStatus("offline"),
      onMail: (item) => {
        setItems((prev) => {
          if (prev.some((m) => m.id === item.id)) return prev
          return [item, ...prev]
        })
        setSelectedId((prev) => prev ?? item.id)
      },
    })
    return () => es.close()
  }, [user.id])

  return (
    <div className="flex h-svh w-full overflow-hidden bg-background text-foreground">
      <Sidebar
        user={user}
        active={folder}
        liveStatus={liveStatus}
        inboxCount={items.length}
        onChange={(f) => {
          setFolder(f)
          setSelectedId(null)
          setDetail(null)
        }}
        onLogout={() => void logout()}
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

function App() {
  const auth = useAuth()
  if (auth.status === "loading") {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        正在恢复会话…
      </div>
    )
  }
  if (auth.status !== "authenticated") {
    return <AuthScreen />
  }
  return <MailApp user={auth.user} />
}

export default App
