import { Hono } from 'hono'
import { serveStatic } from '@hono/node-server/serve-static'
import { config } from '../config.js'

/**
 * 静态资源 + SPA fallback。
 * 所有未命中的非 API 路径都回落到 index.html，由前端路由接管。
 */
const staticApp = new Hono()

staticApp.use('/*', serveStatic({ root: config.publicDir }))
staticApp.get('*', serveStatic({ path: config.spaIndex }))

export default staticApp
