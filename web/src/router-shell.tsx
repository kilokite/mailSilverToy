import { useEffect } from "react"
import { RouterProvider } from "@tanstack/react-router"
import { Loader2 } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { router } from "./router"

export function RouterShell() {
  const auth = useAuth()

  // auth 变化后，主动让当前匹配重新跑 beforeLoad，
  // 这样登录/注册成功能立即被 / 路由的守卫接管并跳转，
  // 登出/会话过期也能被踢回 /login。
  useEffect(() => {
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
