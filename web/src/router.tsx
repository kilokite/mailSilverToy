import { createRouter } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen"
import type { RouterContext } from "./routes/__root"

/** 占位 context，避免 beforeLoad 读到 undefined；真实值由 RouterShell 注入 */
const pendingAuth: RouterContext["auth"] = {
  status: "loading",
  user: null,
  adminAccess: false,
  domains: [],
  login: async () => {},
  register: async () => {},
  logout: async () => {},
  refresh: async () => {},
}

export const router = createRouter({
  routeTree,
  context: { auth: pendingAuth },
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
