import './loadEnv.js'
import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { config, isDev } from './config.js'

if (!config.email.secret.trim()) {
  if (isDev) {
    console.warn(
      '[config] EMAIL_SECRET 未设置：POST /api/email 将返回 503，直至配置密钥。',
    )
  } else {
    throw new Error('EMAIL_SECRET is required in non-development mode')
  }
}

const app = createApp()

serve({ fetch: app.fetch, port: config.port }, ({ port }) => {
  console.log(`Server is running on http://localhost:${port}`)
})
