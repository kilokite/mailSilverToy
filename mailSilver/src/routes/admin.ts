import { Hono } from 'hono'
import { requireUser } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/admin.js'
import { listUsersWithEmailCounts } from '../services/userRepo.js'
import { listAllUserEmails } from '../services/userEmailRepo.js'

const admin = new Hono()

admin.get('/users', requireUser, requireAdmin, (c) => {
  const rows = listUsersWithEmailCounts()
  const emailsByUser = new Map<string, string[]>()
  for (const row of listAllUserEmails()) {
    const list = emailsByUser.get(row.user_id)
    if (list) list.push(row.address)
    else emailsByUser.set(row.user_id, [row.address])
  }
  return c.json({
    users: rows.map((u) => ({
      id: u.id,
      username: u.username,
      emails: emailsByUser.get(u.id) ?? [],
      created_at: u.created_at,
      last_login_at: u.last_login_at,
      owned_email_count: u.owned_email_count,
      email_count: u.email_count,
    })),
  })
})

export default admin
