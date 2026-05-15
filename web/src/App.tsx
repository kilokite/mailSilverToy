import { useCallback, useEffect, useRef, useState } from "react"
import { Sidebar, type Folder } from "@/components/dashboard/Sidebar"
import { MailList } from "@/components/dashboard/MailList"
import { MailView } from "@/components/dashboard/MailView"
import {
  getEmail,
  listEmails,
  type EmailDetail,
  type EmailListItem,
} from "@/lib/api"

const folderLabels: Record<Folder, string> = {
  inbox: "收件箱",
  starred: "星标",
  sent: "已发送",
  drafts: "草稿箱",
  trash: "回收站",
}

function App() {
  const [folder, setFolder] = useState<Folder>("inbox")

  const [items, setItems] = useState<EmailListItem[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<EmailDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const detailCache = useRef<Map<string, EmailDetail>>(new Map())
  const detailReqId = useRef(0)

  const refreshList = useCallback(async () => {
    if (folder !== "inbox") {
      // 后端目前只暴露统一的邮件列表（≈ 收件箱），其它文件夹暂无对应数据
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

  return (
    <div className="flex h-svh w-full overflow-hidden bg-background text-foreground">
      <Sidebar
        active={folder}
        onChange={(f) => {
          setFolder(f)
          setSelectedId(null)
          setDetail(null)
        }}
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

export default App
