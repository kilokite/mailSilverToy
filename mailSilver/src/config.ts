import path from 'node:path'
import { fileURLToPath } from 'node:url'

export interface AppConfig {
  port: number
  publicDir: string
  spaIndex: string
  email: {
    secret: string
    dbPath: string
    maxRawBytes: number
    /** 支持的邮箱后缀列表（均为小写，形如 `@kt.sb`） */
    domains: string[]
    /** 默认邮箱后缀（domains[0]） */
    defaultDomain: string
  }
  auth: {
    /** 会话有效期（毫秒），默认 30 天 */
    sessionTtlMs: number
    /** 在生产/HTTPS 部署下置为 true，开发同源走 vite 代理可保持 false */
    cookieSecure: boolean
    /** Cookie 名 */
    cookieName: string
    /** 与该用户名（忽略大小写）一致的用户可访问 /api/admin/* */
    adminUsername: string | null
  }
}

const defaultMaxRaw = 25 * 1024 * 1024
const defaultSessionTtl = 30 * 24 * 3600 * 1000

const publicPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public')
const publicDir = process.env.PUBLIC_DIR ?? publicPath

function parseBool(v: string | undefined, fallback: boolean): boolean {
  if (v == null) return fallback
  const s = v.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(s)) return true
  if (['0', 'false', 'no', 'off'].includes(s)) return false
  return fallback
}

function parseMailDomains(v: string | undefined): string[] {
  const parsed = (v ?? '')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter((x) => x.startsWith('@') && x.length > 1)
  return parsed.length > 0 ? Array.from(new Set(parsed)) : ['@kt.sb']
}

const mailDomains = parseMailDomains(process.env.MAIL_DOMAINS)

export const config: AppConfig = {
  port: Number(process.env.PORT ?? 23879),
  publicDir,
  spaIndex: process.env.SPA_INDEX ?? path.join(publicDir, 'index.html'),
  email: {
    secret: process.env.EMAIL_SECRET ?? '',
    dbPath: process.env.DB_PATH ?? './data/mail.db',
    maxRawBytes: Number(process.env.MAX_RAW_BYTES ?? defaultMaxRaw),
    domains: mailDomains,
    defaultDomain: mailDomains[0],
  },
  auth: {
    sessionTtlMs: Number(process.env.SESSION_TTL_MS ?? defaultSessionTtl),
    cookieSecure: parseBool(process.env.COOKIE_SECURE, process.env.NODE_ENV === 'production'),
    cookieName: process.env.COOKIE_NAME ?? 'mail_session',
    adminUsername: (() => {
      const raw = process.env.ADMIN_USERNAME?.trim().toLowerCase()
      return raw ? raw : null
    })(),
  },
}

export const isDev = process.env.NODE_ENV === 'development'
