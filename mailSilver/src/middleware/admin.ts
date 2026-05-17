import { createMiddleware } from 'hono/factory'
import { config } from '../config.js'

/** 须在 requireUser 之后使用 */
export const requireAdmin = createMiddleware(async (c, next) => {
  if (config.auth.adminUsername.length === 0) {
    return c.json({ error: 'Admin not configured (set auth.adminUsername in config.json)' }, 503)
  }
  const user = c.get('user')
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  if (!config.auth.adminUsername.includes(user.username.toLowerCase())) {
    return c.json({ error: 'Forbidden' }, 403)
  }
  await next()
})
