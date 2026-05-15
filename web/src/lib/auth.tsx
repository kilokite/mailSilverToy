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
  type AuthUser,
} from "@/lib/api"

type AuthState =
  | { status: "loading"; user: null; adminAccess: false }
  | { status: "anonymous"; user: null; adminAccess: false }
  | { status: "authenticated"; user: AuthUser; adminAccess: boolean }

export type AuthContextValue = AuthState & {
  login: (prefix: string, password: string) => Promise<void>
  register: (prefix: string, password: string) => Promise<void>
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

  const refresh = useCallback(async () => {
    try {
      const { user, admin_access } = await getMe()
      setState(
        user
          ? { status: "authenticated", user, adminAccess: admin_access }
          : { status: "anonymous", user: null, adminAccess: false },
      )
    } catch {
      setState({ status: "anonymous", user: null, adminAccess: false })
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const login = useCallback(async (prefix: string, password: string) => {
    const { user, admin_access } = await loginApi(prefix, password)
    setState({ status: "authenticated", user, adminAccess: admin_access })
  }, [])

  const register = useCallback(async (prefix: string, password: string) => {
    const { user, admin_access } = await registerApi(prefix, password)
    setState({ status: "authenticated", user, adminAccess: admin_access })
  }, [])

  const logout = useCallback(async () => {
    try {
      await logoutApi()
    } finally {
      setState({ status: "anonymous", user: null, adminAccess: false })
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, register, logout, refresh }),
    [state, login, register, logout, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
