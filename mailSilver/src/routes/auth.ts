import { Hono, type Context } from 'hono'
import { deleteCookie, setCookie } from 'hono/cookie'
import { config } from '../config.js'
import {
  readSessionToken,
  requireUser,
  resolveUser,
} from '../middleware/auth.js'
import {
  createSession,
  deleteSession,
} from '../services/sessionRepo.js'
import { hashPassword, verifyPassword } from '../services/password.js'
import {
  PrefixTakenError,
  createUser,
  getUserByPrefix,
  isValidPassword,
  isValidPrefix,
  normalizePrefix,
  touchLastLogin,
} from '../services/userRepo.js'

const auth = new Hono()

type Body = { prefix?: unknown; password?: unknown }

function setSessionCookie(c: Context, token: string, expiresAt: string) {
  setCookie(c, config.auth.cookieName, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: config.auth.cookieSecure,
    path: '/',
    expires: new Date(expiresAt),
  })
}

function readBody(body: unknown): { prefix: string; password: string } | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Body
  if (typeof b.prefix !== 'string' || typeof b.password !== 'string') return null
  return { prefix: b.prefix, password: b.password }
}

function publicEmail(prefix: string): string {
  return `${prefix}${config.email.domain}`
}

function adminAccessForPrefix(prefix: string): boolean {
  const ap = config.auth.adminPrefix
  return Boolean(ap && prefix.toLowerCase() === ap)
}

auth.post('/register', async (c) => {
  const body = readBody(await c.req.json().catch(() => null))
  if (!body) return c.json({ error: 'invalid body' }, 400)

  const prefix = normalizePrefix(body.prefix)
  if (!isValidPrefix(prefix)) {
    return c.json(
      {
        error:
          '前缀仅支持小写字母 / 数字 / . _ -，首尾必须是字母数字，长度 1-32',
      },
      400,
    )
  }
  if (!isValidPassword(body.password)) {
    return c.json({ error: '密码长度需为 6-128 位' }, 400)
  }

  const { hash, salt } = await hashPassword(body.password)
  try {
    const user = createUser({ prefix, passwordHash: hash, passwordSalt: salt })
    const session = createSession(user.id)
    touchLastLogin(user.id)
    setSessionCookie(c, session.token, session.expires_at)
    return c.json({
      ok: true,
      user: {
        id: user.id,
        prefix: user.prefix,
        email: publicEmail(user.prefix),
      },
      admin_access: adminAccessForPrefix(user.prefix),
    })
  } catch (e) {
    if (e instanceof PrefixTakenError) {
      return c.json({ error: '该前缀已被注册' }, 409)
    }
    throw e
  }
})

auth.post('/login', async (c) => {
  const body = readBody(await c.req.json().catch(() => null))
  if (!body) return c.json({ error: 'invalid body' }, 400)

  const prefix = normalizePrefix(body.prefix)
  if (!isValidPrefix(prefix) || !isValidPassword(body.password)) {
    return c.json({ error: '账号或密码不正确' }, 401)
  }

  const user = getUserByPrefix(prefix)
  if (!user) {
    return c.json({ error: '账号或密码不正确' }, 401)
  }
  const ok = await verifyPassword(
    body.password,
    user.password_hash,
    user.password_salt,
  )
  if (!ok) {
    return c.json({ error: '账号或密码不正确' }, 401)
  }

  const session = createSession(user.id)
  touchLastLogin(user.id)
  setSessionCookie(c, session.token, session.expires_at)
  return c.json({
    ok: true,
    user: {
      id: user.id,
      prefix: user.prefix,
      email: publicEmail(user.prefix),
    },
    admin_access: adminAccessForPrefix(user.prefix),
  })
})

auth.post('/logout', (c) => {
  const token = readSessionToken(c)
  if (token) deleteSession(token)
  deleteCookie(c, config.auth.cookieName, { path: '/' })
  return c.json({ ok: true })
})

auth.get('/me', (c) => {
  const token = readSessionToken(c)
  const user = resolveUser(token)
  if (!user) return c.json({ user: null, admin_access: false })
  return c.json({
    user: {
      id: user.id,
      prefix: user.prefix,
      email: publicEmail(user.prefix),
    },
    admin_access: adminAccessForPrefix(user.prefix),
  })
})

/** 仅用于探测当前 cookie 是否有效 */
auth.get('/session', requireUser, (c) => {
  const user = c.get('user')
  return c.json({
    user: {
      id: user.id,
      prefix: user.prefix,
      email: publicEmail(user.prefix),
    },
    admin_access: adminAccessForPrefix(user.prefix),
  })
})

export default auth
