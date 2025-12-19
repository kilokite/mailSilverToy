import { serve } from '@hono/node-server'
import { Hono } from 'hono'

const app = new Hono()

app.get('/', (c) => {
  return c.text('Hello Hono!')
})
let info = {};
app.get('/web_hook', (c) => {
  if(c.req.query('payload')){
    info = JSON.parse(c.req.query('payload') || '{}')
  }
  return c.text(JSON.stringify(info))
})

serve({
  fetch: app.fetch,
  port: 23879
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})
