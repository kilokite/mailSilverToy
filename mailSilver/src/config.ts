import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  loadConfigFile,
  type MailDomainFileEntry,
} from './loadConfig.js'

export interface MailDomainConfig {
  /** 邮箱后缀，小写，形如 `@kt.sb` */
  suffix: string
  /** 该域名在 Resend 的 API Key；未配置则无法代发 */
  resendApiKey?: string
}

export interface AppConfig {
  port: number
  publicDir: string
  spaIndex: string
  email: {
    secret: string
    dbPath: string
    maxRawBytes: number
    domains: MailDomainConfig[]
    /** 默认邮箱后缀（domains[0].suffix） */
    defaultDomain: string
  }
  auth: {
    /** 会话有效期（毫秒），默认 30 天 */
    sessionTtlMs: number
    /** 在生产/HTTPS 部署下置为 true，开发同源走 vite 代理可保持 false */
    cookieSecure: boolean
    /** Cookie 名 */
    cookieName: string
    /** 可访问 /api/admin/* 的用户名（均为小写） */
    adminUsername: string[]
  }
}

const defaultMaxRaw = 25 * 1024 * 1024
const defaultSessionTtl = 30 * 24 * 3600 * 1000

const publicPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public')
const file = loadConfigFile()

function parseAdminUsernames(v: string[] | undefined): string[] {
  if (!Array.isArray(v)) return []
  const parsed = v
    .map((x) => String(x).trim().toLowerCase())
    .filter((x) => x.length > 0)
  return Array.from(new Set(parsed))
}

function parseMailDomainConfigs(
  v: MailDomainFileEntry[] | string | undefined,
): MailDomainConfig[] {
  const items: MailDomainFileEntry[] =
    typeof v === 'string'
      ? v.split(',')
      : Array.isArray(v)
        ? v
        : []
  const out: MailDomainConfig[] = []
  const seen = new Set<string>()
  for (const item of items) {
    let suffix: string
    let resendApiKey: string | undefined
    if (typeof item === 'string') {
      suffix = item.trim().toLowerCase()
    } else if (item && typeof item === 'object') {
      suffix = String(item.suffix ?? '').trim().toLowerCase()
      const key = item.resendApiKey
      resendApiKey =
        typeof key === 'string' && key.trim() ? key.trim() : undefined
    } else {
      continue
    }
    if (!suffix.startsWith('@') || suffix.length <= 1) continue
    if (seen.has(suffix)) continue
    seen.add(suffix)
    out.push({ suffix, resendApiKey })
  }
  return out.length > 0 ? out : [{ suffix: '@kt.sb' }]
}

const publicDir = file.publicDir ?? publicPath
const mailDomains = parseMailDomainConfigs(file.email?.domains)

export const config: AppConfig = {
  port: file.port ?? 23879,
  publicDir,
  spaIndex: file.spaIndex ?? path.join(publicDir, 'index.html'),
  email: {
    secret: file.email?.secret ?? '',
    dbPath: file.email?.dbPath ?? './data/mail.db',
    maxRawBytes: file.email?.maxRawBytes ?? defaultMaxRaw,
    domains: mailDomains,
    defaultDomain: mailDomains[0].suffix,
  },
  auth: {
    sessionTtlMs: file.auth?.sessionTtlMs ?? defaultSessionTtl,
    cookieSecure:
      file.auth?.cookieSecure ?? process.env.NODE_ENV === 'production',
    cookieName: file.auth?.cookieName ?? 'mail_session',
    adminUsername: parseAdminUsernames(file.auth?.adminUsername),
  },
}

export function listEmailDomainSuffixes(): string[] {
  return config.email.domains.map((d) => d.suffix)
}

export function getMailDomainConfig(
  suffix: string,
): MailDomainConfig | undefined {
  const normalized = suffix.trim().toLowerCase()
  return config.email.domains.find((d) => d.suffix === normalized)
}

export function getMailDomainConfigForAddress(
  address: string,
): MailDomainConfig | undefined {
  const lower = address.trim().toLowerCase()
  const at = lower.lastIndexOf('@')
  if (at <= 0) return undefined
  return getMailDomainConfig(lower.slice(at))
}

export const isDev = process.env.NODE_ENV === 'development'
