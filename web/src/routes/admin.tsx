import { createFileRoute, redirect } from "@tanstack/react-router"
import { AdminShell } from "@/components/admin/AdminShell"

export const Route = createFileRoute("/admin")({
  beforeLoad: ({ context }) => {
    if (context.auth.status !== "authenticated") {
      throw redirect({ to: "/login" })
    }
    if (!context.auth.adminAccess) {
      throw redirect({ to: "/" })
    }
  },
  component: AdminShellRoute,
})

function AdminShellRoute() {
  return <AdminShell />
}
