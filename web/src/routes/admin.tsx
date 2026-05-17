import { createFileRoute, redirect } from "@tanstack/react-router"
import { AdminShell } from "@/components/admin/AdminShell"

export const Route = createFileRoute("/admin")({
  beforeLoad: ({ context }) => {
    const { auth } = context
    if (!auth || auth.status === "loading") return
    if (auth.status !== "authenticated") {
      throw redirect({ to: "/login" })
    }
    if (!auth.adminAccess) {
      throw redirect({ to: "/" })
    }
  },
  component: AdminShellRoute,
})

function AdminShellRoute() {
  return <AdminShell />
}
