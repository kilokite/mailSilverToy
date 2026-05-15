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
  | { status: "loading"; user: null }
  | { status: "anonymous"; user: null }
  | { status: "authenticated"; user: AuthUser }

type AuthContextValue = AuthState & {
  login: (prefix: string, password: string) => Promise<void>
  register: (prefix: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading", user: null })

  const refresh = useCallback(async () => {
    try {
      const { user } = await getMe()
      setState(
        user
          ? { status: "authenticated", user }
          : { status: "anonymous", user: null },
      )
    } catch {
      setState({ status: "anonymous", user: null })
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const login = useCallback(async (prefix: string, password: string) => {
    const { user } = await loginApi(prefix, password)
    setState({ status: "authenticated", user })
  }, [])

  const register = useCallback(async (prefix: string, password: string) => {
    const { user } = await registerApi(prefix, password)
    setState({ status: "authenticated", user })
  }, [])

  const logout = useCallback(async () => {
    try {
      await logoutApi()
    } finally {
      setState({ status: "anonymous", user: null })
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
