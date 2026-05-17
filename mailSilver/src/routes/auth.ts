import { Hono, type Context } from 'hono'
import { deleteCookie, setCookie } from 'hono/cookie'
import { config } from '../config.js'
import { getDb } from '../db/sqlite.js'
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
  UsernameTakenError,
  createUser,
  getUserByUsername,
  isValidPassword,
  isValidUsername,
  normalizeUsername,
  touchLastLogin,
} from '../services/userRepo.js'
import {
  EmailQuotaExceededError,
  EmailTakenError,
  addEmailForUser,
  addressLooksValid,
  listEmailsOfUser,
} from '../services/userEmailRepo.js'
import { emitHook } from '../services/hooks/index.js'

const auth = new Hono()

type Body = { username?: unknown; password?: unknown; initialEmail?: unknown }

function setSessionCookie(c: Context, token: string, expiresAt: string) {
  setCookie(c, config.auth.cookieName, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: config.auth.cookieSecure,
    path: '/',
    expires: new Date(expiresAt),
  })
}

function readBody(
  body: unknown,
): { username: string; password: string; initialEmail?: string } | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Body
  if (typeof b.username !== 'string' || typeof b.password !== 'string') return null
  const out: { username: string; password: string; initialEmail?: string } = {
    username: b.username,
    password: b.password,
  }
  if (typeof b.initialEmail === 'string') out.initialEmail = b.initialEmail
  return out
}

function adminAccessForUsername(username: string): boolean {
  const au = config.auth.adminUsername
  return Boolean(au && username.toLowerCase() === au)
}

function buildUserPayload(user: { id: string; username: string; max_emails: number }) {
  return {
    id: user.id,
    username: user.username,
    emails: listEmailsOfUser(user.id),
    max_emails: user.max_emails,
  }
}

auth.post('/register', async (c) => {
  const body = readBody(await c.req.json().catch(() => null))
  if (!body) return c.json({ error: 'invalid body' }, 400)

  const username = normalizeUsername(body.username)
  const initialEmail = body.initialEmail?.trim().toLowerCase() ?? ''
  if (!isValidUsername(username)) {
    return c.json(
      {
        error:
          '用户名仅支持小写字母 / 数字 / . _ -，首尾必须是字母数字，长度 1-32',
      },
      400,
    )
  }
  if (!initialEmail || !addressLooksValid(initialEmail)) {
    return c.json({ error: '初始邮箱不合法或后缀不受支持' }, 400)
  }
  if (!isValidPassword(body.password)) {
    return c.json({ error: '密码长度需为 6-128 位' }, 400)
  }

  const { hash, salt } = await hashPassword(body.password)
  try {
    const tx = getDb().transaction(() => {
      const user = createUser({
        username,
        passwordHash: hash,
        passwordSalt: salt,
      })
      addEmailForUser(user.id, initialEmail)
      return user
    })
    const user = tx()
    const session = createSession(user.id)
    touchLastLogin(user.id)
    emitHook('user:registered', {
      userId: user.id,
      username: user.username,
      initialEmail,
    })
    setSessionCookie(c, session.token, session.expires_at)
    return c.json({
      ok: true,
      user: buildUserPayload(user),
      admin_access: adminAccessForUsername(user.username),
      domains: config.email.domains,
    })
  } catch (e) {
    if (e instanceof UsernameTakenError) {
      return c.json({ error: '该用户名已被注册' }, 409)
    }
    if (e instanceof EmailTakenError) {
      return c.json({ error: '该邮箱已被占用' }, 409)
    }
    if (e instanceof EmailQuotaExceededError) {
      return c.json(
        { error: '已达邮箱数量上限', max_emails: e.maxEmails },
        403,
      )
    }
    throw e
  }
})

auth.post('/login', async (c) => {
  const body = readBody(await c.req.json().catch(() => null))
  if (!body) return c.json({ error: 'invalid body' }, 400)

  const username = normalizeUsername(body.username)
  if (!isValidUsername(username) || !isValidPassword(body.password)) {
    return c.json({ error: '账号或密码不正确' }, 401)
  }

  const user = getUserByUsername(username)
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
    user: buildUserPayload(user),
    admin_access: adminAccessForUsername(user.username),
    domains: config.email.domains,
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
  if (!user) {
    return c.json({ user: null, admin_access: false, domains: config.email.domains })
  }
  return c.json({
    user: buildUserPayload(user),
    admin_access: adminAccessForUsername(user.username),
    domains: config.email.domains,
  })
})

/** 仅用于探测当前 cookie 是否有效 */
auth.get('/session', requireUser, (c) => {
  const user = c.get('user')
  return c.json({
    user: buildUserPayload(user),
    admin_access: adminAccessForUsername(user.username),
    domains: config.email.domains,
  })
})

export default auth
