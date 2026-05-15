import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { runMigrations } from './db/migrations.js'
import api from './routes/index.js'
import webhook from './routes/webhook.js'
import staticApp from './middleware/static.js'

export function createApp() {
  runMigrations()

  const app = new Hono()

  app.use('*', logger())

  app.route('/api', api)

  // 兼容旧路径：GitHub workflow 里历史配置的 /web_hook
  app.route('/web_hook', webhook)

  // 拦截未命中的 /api/*，避免被下方 SPA fallback 当作页面返回 index.html
  app.all('/api/*', (c) =>
    c.json({ error: 'Not Found', path: c.req.path }, 404),
  )

  app.route('/', staticApp)

  app.notFound((c) => c.text('Not Found', 404))

  app.onError((err, c) => {
    console.error('[error]', err)
    return c.json({ error: err.message ?? 'Internal Server Error' }, 500)
  })

  return app
}
