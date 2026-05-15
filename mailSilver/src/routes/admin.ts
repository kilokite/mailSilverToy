import { Hono } from 'hono'
import { requireUser } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/admin.js'
import { listUsersWithEmailCounts } from '../services/userRepo.js'
import { config } from '../config.js'

const admin = new Hono()

function publicEmail(prefix: string): string {
  return `${prefix}${config.email.domain}`
}

admin.get('/users', requireUser, requireAdmin, (c) => {
  const rows = listUsersWithEmailCounts()
  return c.json({
    users: rows.map((u) => ({
      id: u.id,
      prefix: u.prefix,
      email: publicEmail(u.prefix),
      created_at: u.created_at,
      last_login_at: u.last_login_at,
      email_count: u.email_count,
    })),
  })
})

export default admin
