import { useEffect } from "react"
import { RouterProvider } from "@tanstack/react-router"
import { Loader2 } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { router } from "./router"

export function RouterShell() {
  const auth = useAuth()

  // auth 就绪后再同步 context 并 invalidate，避免 loading 阶段
  // 在尚无 RouterProvider 时用 undefined auth 跑 beforeLoad。
  useEffect(() => {
    if (auth.status === "loading") return
    router.update({ context: { auth } })
    void router.invalidate()
  }, [auth])

  if (auth.status === "loading") {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        正在恢复会话…
      </div>
    )
  }

  return <RouterProvider router={router} context={{ auth }} />
}
