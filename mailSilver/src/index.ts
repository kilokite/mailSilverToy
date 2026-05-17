import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { config, isDev } from './config.js'

if (!config.email.secret.trim()) {
  if (isDev) {
    console.warn(
      '[config] email.secret 未设置：POST /api/email 将返回 503，直至在 config.json 中配置。',
    )
  } else {
    throw new Error('email.secret is required in config.json for non-development mode')
  }
}

const app = createApp()

serve({ fetch: app.fetch, port: config.port }, ({ port }) => {
  console.log(`Server is running on http://localhost:${port}`)
})
