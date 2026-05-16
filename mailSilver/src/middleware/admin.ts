import { createMiddleware } from 'hono/factory'
import { config } from '../config.js'

/** 须在 requireUser 之后使用 */
export const requireAdmin = createMiddleware(async (c, next) => {
  const adminUsername = config.auth.adminUsername
  if (!adminUsername) {
    return c.json({ error: 'Admin not configured (set ADMIN_USERNAME)' }, 503)
  }
  const user = c.get('user')
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  if (user.username.toLowerCase() !== adminUsername) {
    return c.json({ error: 'Forbidden' }, 403)
  }
  await next()
})
