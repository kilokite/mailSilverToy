import { useMemo, useState } from "react"
import { Loader2, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/lib/auth"
import { cn } from "@/lib/utils"
import logoUrl from "@/assets/logo.png"

const MAIL_DOMAIN = "@kt.sb"

type Mode = "login" | "register"

const PREFIX_RE = /^[a-z0-9](?:[a-z0-9._-]{0,30}[a-z0-9])?$/

function validatePrefix(prefix: string): string | null {
  if (!prefix) return "请输入邮箱前缀"
  if (!PREFIX_RE.test(prefix)) {
    return "前缀仅支持小写字母 / 数字 / . _ -，长度 1-32，首尾必须是字母数字"
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
  const { login, register } = useAuth()
  const [mode, setMode] = useState<Mode>("login")
  const [prefix, setPrefix] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const normalized = prefix.trim().toLowerCase()
  const preview = useMemo(
    () => (normalized ? `${normalized}${MAIL_DOMAIN}` : `yourname${MAIL_DOMAIN}`),
    [normalized],
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

    const prefixError = validatePrefix(normalized)
    if (prefixError) return setError(prefixError)
    const pwError = validatePassword(password, mode)
    if (pwError) return setError(pwError)
    if (mode === "register" && password !== confirm) {
      return setError("两次输入的密码不一致")
    }

    setSubmitting(true)
    try {
      if (mode === "register") await register(normalized, password)
      else await login(normalized, password)
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
            {/* <p className="text-xs text-muted-foreground">
              专属临时邮箱 · 后缀固定为 <span className="font-mono">{MAIL_DOMAIN}</span>
            </p> */}
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
            <label className="text-xs font-medium text-muted-foreground" htmlFor="prefix">
              邮箱前缀
            </label>
            <div className="mt-1 flex items-stretch overflow-hidden rounded-md border focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
              <Input
                id="prefix"
                autoComplete="username"
                spellCheck={false}
                placeholder="yourname"
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
                className="rounded-none border-0 shadow-none focus-visible:border-0 focus-visible:ring-0"
              />
              <span className="flex items-center bg-muted px-3 font-mono text-sm text-muted-foreground">
                {MAIL_DOMAIN}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              你的邮箱地址：
              <span className="ml-1 font-mono text-foreground">{preview}</span>
            </p>
          </div>

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
