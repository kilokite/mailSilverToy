import { Hono } from 'hono'
import webhook from './webhook.js'
import health from './health.js'
import email from './email.js'
import auth from './auth.js'
import admin from './admin.js'
import me from './me.js'

const api = new Hono()

api.route('/webhook', webhook)
api.route('/health', health)
api.route('/email', email)
api.route('/auth', auth)
api.route('/me', me)
api.route('/admin', admin)

export default api
