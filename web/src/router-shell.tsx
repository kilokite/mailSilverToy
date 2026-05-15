import { RouterProvider } from "@tanstack/react-router"
import { Loader2 } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { router } from "./router"

export function RouterShell() {
  const auth = useAuth()

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
