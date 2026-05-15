import { useEffect } from "react"
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { AuthScreen } from "@/components/auth/AuthScreen"

export const Route = createFileRoute("/login")({
  beforeLoad: ({ context }) => {
    if (context.auth.status === "authenticated") {
      throw redirect({ to: "/" })
    }
  },
  component: LoginRoute,
})

function LoginRoute() {
  const { auth } = Route.useRouteContext()
  const navigate = useNavigate()

  useEffect(() => {
    if (auth.status === "authenticated") {
      void navigate({ to: "/", replace: true })
    }
  }, [auth.status, navigate])

  return <AuthScreen />
}
