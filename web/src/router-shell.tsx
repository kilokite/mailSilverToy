import { RouterProvider } from "@tanstack/react-router"
import { useAuth } from "@/lib/auth"
import { router } from "./router"

export function RouterShell() {
  const auth = useAuth()
  return <RouterProvider router={router} context={{ auth }} />
}
