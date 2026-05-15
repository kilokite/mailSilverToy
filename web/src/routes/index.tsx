import { createFileRoute, redirect } from "@tanstack/react-router"
import { MailApp } from "@/components/dashboard/MailApp"
import { useAuth } from "@/lib/auth"

export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => {
    if (context.auth.status !== "authenticated") {
      throw redirect({ to: "/login" })
    }
  },
  component: IndexRoute,
})

function IndexRoute() {
  const auth = useAuth()
  if (auth.status !== "authenticated") return null
  return <MailApp user={auth.user} />
}
