import { createMiddleware } from 'hono/factory'
import { config } from '../config.js'

/** 须在 requireUser 之后使用 */
export const requireAdmin = createMiddleware(async (c, next) => {
  const adminPrefix = config.auth.adminPrefix
  if (!adminPrefix) {
    return c.json({ error: 'Admin not configured (set ADMIN_PREFIX)' }, 503)
  }
  const user = c.get('user')
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  if (user.prefix.toLowerCase() !== adminPrefix) {
    return c.json({ error: 'Forbidden' }, 403)
  }
  await next()
})
