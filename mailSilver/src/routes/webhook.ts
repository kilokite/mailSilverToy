import { Hono } from 'hono'
import { getInfo, setInfoFromPayload } from '../services/webhookStore.js'

const webhook = new Hono()

/**
 * 触发 webhook：
 * - GET  /         （兼容 GitHub workflow 的 curl -X GET）
 * - POST /         body 为 JSON 字符串，或 query ?payload=...
 * 返回最新的 info 状态。
 */
webhook.on(['GET', 'POST'], '/', async (c) => {
  let updated = setInfoFromPayload(c.req.query('payload'))

  if (!updated && c.req.method === 'POST') {
    const body = await c.req.text()
    updated = setInfoFromPayload(body)
  }

  return c.json({ ok: true, updated, ...getInfo() })
})

/** 仅查询：GET /info */
webhook.get('/info', (c) => c.json(getInfo()))

export default webhook
