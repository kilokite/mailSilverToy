import { useMemo, useState } from "react"
import { Loader2, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/lib/auth"
import { cn } from "@/lib/utils"
import logoUrl from "@/assets/logo.png"

type Mode = "login" | "register"

const USERNAME_RE = /^[a-z0-9](?:[a-z0-9._-]{0,30}[a-z0-9])?$/
const LOCAL_RE = /^[a-z0-9](?:[a-z0-9._-]{0,30}[a-z0-9])?$/

function validateUsername(username: string): string | null {
  if (!username) return "请输入用户名"
  if (!USERNAME_RE.test(username)) {
    return "用户名仅支持小写字母 / 数字 / . _ -，长度 1-32，首尾必须是字母数字"
  }
  return null
}

function validateLocal(local: string): string | null {
  if (!local) return "请输入邮箱前缀"
  if (!LOCAL_RE.test(local)) {
    return "邮箱前缀仅支持小写字母 / 数字 / . _ -，长度 1-32，首尾必须是字母数字"
  }
  return null
}

function validatePassword(password: string, mode: Mode): string | null {
  if (mode === "register") {
    if (password.length < 6) return "密码至少 6 位"
    if (password.length > 128) return "密码最多 128 位"
  } else {
    if (!password) return "请输入密码"
  }
  return null
}

export function AuthScreen() {
  const { login, register, domains } = useAuth()
  const [mode, setMode] = useState<Mode>("login")
  const [username, setUsername] = useState("")
  const [initialLocal, setInitialLocal] = useState("")
  const [selectedDomain, setSelectedDomain] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const normalizedUsername = username.trim().toLowerCase()
  const normalizedLocal = initialLocal.trim().toLowerCase()
  const domainOptions = domains.length > 0 ? domains : ["@kt.sb"]
  const activeDomain = selectedDomain || domainOptions[0]
  const preview = useMemo(
    () =>
      mode === "register"
        ? normalizedLocal
          ? `${normalizedLocal}${activeDomain}`
          : `yourname${activeDomain}`
        : "",
    [mode, normalizedLocal, activeDomain],
  )

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setPassword("")
    setConfirm("")
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const usernameError = validateUsername(normalizedUsername)
    if (usernameError) return setError(usernameError)
    if (mode === "register") {
      const localError = validateLocal(normalizedLocal)
      if (localError) return setError(localError)
      if (!activeDomain) return setError("暂无可用后缀，请联系管理员")
    }
    const pwError = validatePassword(password, mode)
    if (pwError) return setError(pwError)
    if (mode === "register" && password !== confirm) {
      return setError("两次输入的密码不一致")
    }

    setSubmitting(true)
    try {
      if (mode === "register") {
        await register({
          username: normalizedUsername,
          password,
          initialEmail: `${normalizedLocal}${activeDomain}`,
        })
      } else {
        await login(normalizedUsername, password)
      }
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : String(e2))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-sm">
        <div className="flex items-center gap-3">
          <img
            src={logoUrl}
            alt="mailSilver"
            className="h-10 w-10 shrink-0 object-contain"
            style={{ imageRendering: "pixelated" }}
          />
          <div>
            <h1 className="text-base font-semibold leading-tight">mailSilver</h1>
          </div>
        </div>

        <div className="mt-6 inline-flex rounded-md border bg-background p-1">
          {(["login", "register"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              className={cn(
                "rounded-sm px-3 py-1.5 text-sm transition-colors",
                mode === m
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m === "login" ? "登录" : "注册"}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="mt-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground" htmlFor="username">
              用户名
            </label>
            <Input
              id="username"
              autoComplete="username"
              spellCheck={false}
              placeholder="yourname"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1"
            />
          </div>

          {mode === "register" ? (
            <div>
              <label className="text-xs font-medium text-muted-foreground" htmlFor="initial-local">
                初始邮箱
              </label>
              <div className="mt-1 flex items-stretch overflow-hidden rounded-md border focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
                <Input
                  id="initial-local"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="yourname"
                  value={initialLocal}
                  onChange={(e) => setInitialLocal(e.target.value)}
                  className="rounded-none border-0 shadow-none focus-visible:border-0 focus-visible:ring-0"
                />
                <select
                  value={activeDomain}
                  onChange={(e) => setSelectedDomain(e.target.value)}
                  className="bg-muted px-2 text-sm text-muted-foreground outline-none"
                >
                  {domainOptions.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                你的邮箱地址：
                <span className="ml-1 font-mono text-foreground">{preview}</span>
              </p>
            </div>
          ) : null}

          <div>
            <label className="text-xs font-medium text-muted-foreground" htmlFor="password">
              密码
            </label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder={mode === "register" ? "至少 6 位" : "请输入密码"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1"
            />
          </div>

          {mode === "register" ? (
            <div>
              <label className="text-xs font-medium text-muted-foreground" htmlFor="confirm">
                确认密码
              </label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                placeholder="再次输入"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="mt-1"
              />
            </div>
          ) : null}

          {error ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                处理中…
              </>
            ) : mode === "login" ? (
              "登录"
            ) : (
              "创建账号"
            )}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            {mode === "login" ? (
              <>
                还没有账号？
                <button
                  type="button"
                  className="ml-1 text-primary underline-offset-4 hover:underline"
                  onClick={() => switchMode("register")}
                >
                  立即注册
                </button>
              </>
            ) : (
              <>
                已有账号？
                <button
                  type="button"
                  className="ml-1 text-primary underline-offset-4 hover:underline"
                  onClick={() => switchMode("login")}
                >
                  去登录
                </button>
              </>
            )}
          </p>
        </form>
      </div>
    </div>
  )
}
