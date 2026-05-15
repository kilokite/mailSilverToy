import { createMiddleware } from 'hono/factory'
import { timingSafeEqual } from 'node:crypto'
import { config } from '../config.js'

const HEADER = 'x-webhook-secret'

/**
 * 校验 Worker 推送密钥。secret 为空时一律拒绝（避免空串 timingSafeEqual 误判）。
 */
export const requireWebhookSecret = createMiddleware(async (c, next) => {
  const expected = config.email.secret
  if (!expected.trim()) {
    return c.text('EMAIL_SECRET is not configured', 503)
  }
  const got = c.req.header(HEADER) ?? ''
  const a = Buffer.from(got, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return c.text('Unauthorized', 401)
  }
  await next()
})
