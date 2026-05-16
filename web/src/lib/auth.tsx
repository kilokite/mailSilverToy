import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import {
  getMe,
  login as loginApi,
  logout as logoutApi,
  register as registerApi,
  setUnauthorizedHandler,
  type AuthUser,
} from "@/lib/api"

type AuthState =
  | { status: "loading"; user: null; adminAccess: false }
  | { status: "anonymous"; user: null; adminAccess: false }
  | { status: "authenticated"; user: AuthUser; adminAccess: boolean }

export type AuthContextValue = AuthState & {
  domains: string[]
  login: (username: string, password: string) => Promise<void>
  register: (input: {
    username: string
    password: string
    initialEmail: string
  }) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    status: "loading",
    user: null,
    adminAccess: false,
  })
  const [domains, setDomains] = useState<string[]>([])

  const refresh = useCallback(async () => {
    try {
      const { user, admin_access, domains: configuredDomains } = await getMe()
      setDomains(configuredDomains)
      setState(
        user
          ? { status: "authenticated", user, adminAccess: admin_access }
          : { status: "anonymous", user: null, adminAccess: false },
      )
    } catch {
      setDomains([])
      setState({ status: "anonymous", user: null, adminAccess: false })
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // 业务接口收到 401 时，认为会话过期，切回匿名态；
  // 路由守卫会在 RouterShell 的 invalidate 后把用户带回 /login。
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setState((prev) =>
        prev.status === "anonymous"
          ? prev
          : { status: "anonymous", user: null, adminAccess: false },
      )
    })
    return () => setUnauthorizedHandler(null)
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const { user, admin_access } = await loginApi(username, password)
    setState({ status: "authenticated", user, adminAccess: admin_access })
  }, [])

  const register = useCallback(
    async (input: { username: string; password: string; initialEmail: string }) => {
      const { user, admin_access } = await registerApi(input)
      setState({ status: "authenticated", user, adminAccess: admin_access })
    },
    [],
  )

  const logout = useCallback(async () => {
    try {
      await logoutApi()
    } finally {
      setState({ status: "anonymous", user: null, adminAccess: false })
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, domains, login, register, logout, refresh }),
    [state, domains, login, register, logout, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
