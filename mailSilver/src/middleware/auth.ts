import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import { getCookie } from 'hono/cookie'
import { timingSafeEqual } from 'node:crypto'
import { config } from '../config.js'
import { getUserFromSession } from '../services/sessionRepo.js'
import type { UserRow } from '../services/userRepo.js'

const HEADER = 'x-webhook-secret'

/**
 * 校验 Worker 推送密钥。secret 为空时一律拒绝（避免空串 timingSafeEqual 误判）。
 */
export const requireWebhookSecret = createMiddleware(async (c, next) => {
  const expected = config.email.secret
  if (!expected.trim()) {
    return c.text('email.secret is not configured', 503)
  }
  const got = c.req.header(HEADER) ?? ''
  const a = Buffer.from(got, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return c.text('Unauthorized', 401)
  }
  await next()
})

export type SessionUser = Pick<
  UserRow,
  'id' | 'username' | 'created_at' | 'last_login_at' | 'max_emails'
>

type AuthVars = {
  user: SessionUser
  sessionToken: string
}

declare module 'hono' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface ContextVariableMap extends AuthVars {}
}

/** 从 cookie 中读取 session token */
export function readSessionToken(c: Context): string | null {
  const t = getCookie(c, config.auth.cookieName)
  return t && t.trim() ? t : null
}

/** 解析 cookie -> 用户；失败则返回 null（不写响应） */
export function resolveUser(token: string | null): SessionUser | null {
  if (!token) return null
  const u = getUserFromSession(token)
  if (!u) return null
  return {
    id: u.id,
    username: u.username,
    created_at: u.created_at,
    last_login_at: u.last_login_at,
    max_emails: u.max_emails,
  }
}

/** 强校验：未登录返回 401 */
export const requireUser = createMiddleware(async (c, next) => {
  const token = readSessionToken(c)
  const user = resolveUser(token)
  if (!user || !token) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  c.set('user', user)
  c.set('sessionToken', token)
  await next()
})
