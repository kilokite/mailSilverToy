import { useEffect } from "react"
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { AuthScreen } from "@/components/auth/AuthScreen"
import { useAuth } from "@/lib/auth"

export const Route = createFileRoute("/login")({
  beforeLoad: ({ context }) => {
    if (context.auth.status === "authenticated") {
      throw redirect({ to: "/" })
    }
  },
  component: LoginRoute,
})

function LoginRoute() {
  const auth = useAuth()
  const navigate = useNavigate()

  // 兜底：若 invalidate 还未来得及触发 beforeLoad，
  // 这里也能把已认证用户带回首页。
  useEffect(() => {
    if (auth.status === "authenticated") {
      void navigate({ to: "/", replace: true })
    }
  }, [auth.status, navigate])

  return <AuthScreen />
}
