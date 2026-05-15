import { createRootRouteWithContext, Outlet } from "@tanstack/react-router"
import type { AuthContextValue } from "@/lib/auth"

export type RouterContext = {
  auth: AuthContextValue
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
})

function RootLayout() {
  return <Outlet />
}
