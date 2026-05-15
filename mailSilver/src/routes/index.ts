import { Hono } from 'hono'
import webhook from './webhook.js'
import health from './health.js'
import email from './email.js'
import auth from './auth.js'

const api = new Hono()

api.route('/webhook', webhook)
api.route('/health', health)
api.route('/email', email)
api.route('/auth', auth)

export default api
