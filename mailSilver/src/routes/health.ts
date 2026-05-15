import { Hono } from 'hono'

const health = new Hono()

health.get('/', (c) =>
  c.json({
    ok: true,
    uptime: process.uptime(),
    now: new Date().toISOString(),
  }),
)

export default health
