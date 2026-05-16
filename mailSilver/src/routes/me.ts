import { Hono } from 'hono'
import { requireUser } from '../middleware/auth.js'
import {
  EmailTakenError,
  addEmailForUser,
  addressLooksValid,
  deleteEmailForUser,
  listEmailsOfUser,
  splitAddress,
} from '../services/userEmailRepo.js'
import { emitHook } from '../services/hooks/index.js'

const me = new Hono()

type AddBody = { address?: unknown; prefix?: unknown; domain?: unknown }

function normalizeAddressInput(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const b = body as AddBody
  if (typeof b.address === 'string') {
    return b.address.trim().toLowerCase()
  }
  if (typeof b.prefix === 'string' && typeof b.domain === 'string') {
    const local = b.prefix.trim().toLowerCase()
    const domain = b.domain.trim().toLowerCase()
    const address = `${local}${domain}`
    return splitAddress(address) ? address : null
  }
  return null
}

me.get('/emails', requireUser, (c) => {
  const user = c.get('user')
  return c.json({ emails: listEmailsOfUser(user.id) })
})

me.post('/emails', requireUser, (c) => {
  const user = c.get('user')
  return c.req
    .json()
    .then((body) => {
      const address = normalizeAddressInput(body)
      if (!address || !addressLooksValid(address)) {
        return c.json({ error: '邮箱地址不合法或后缀不受支持' }, 400)
      }
      try {
        addEmailForUser(user.id, address)
      } catch (e) {
        if (e instanceof EmailTakenError) {
          return c.json({ error: '该邮箱已被占用' }, 409)
        }
        throw e
      }
      emitHook('user:email_added', {
        userId: user.id,
        username: user.username,
        address,
      })
      return c.json({ ok: true, emails: listEmailsOfUser(user.id) })
    })
    .catch(() => c.json({ error: 'invalid body' }, 400))
})

me.delete('/emails/:address', requireUser, (c) => {
  const user = c.get('user')
  const address = decodeURIComponent(c.req.param('address')).trim().toLowerCase()
  if (!addressLooksValid(address)) {
    return c.json({ error: '邮箱地址不合法或后缀不受支持' }, 400)
  }
  const emails = listEmailsOfUser(user.id)
  if (!emails.includes(address)) {
    return c.json({ error: 'Not Found' }, 404)
  }
  if (emails.length <= 1) {
    return c.json({ error: '至少保留一个邮箱地址' }, 400)
  }
  deleteEmailForUser(user.id, address)
  return c.json({ ok: true, emails: listEmailsOfUser(user.id) })
})

export default me
