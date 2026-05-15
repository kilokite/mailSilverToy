import { createRootRouteWithContext, Outlet } from "@tanstack/react-router"
import { Loader2 } from "lucide-react"
import type { AuthContextValue } from "@/lib/auth"

export type RouterContext = {
  auth: AuthContextValue
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
})

function RootLayout() {
  const { auth } = Route.useRouteContext()
  if (auth.status === "loading") {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        正在恢复会话…
      </div>
    )
  }
  return <Outlet />
}
