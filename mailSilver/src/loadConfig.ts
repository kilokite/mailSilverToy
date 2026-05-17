import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export type MailDomainFileEntry =
  | string
  | {
      suffix: string
      resendApiKey?: string
    }

/** `config.json` 文件结构（字段均可选，缺省由 config.ts 补全） */
export interface ConfigFile {
  port?: number
  publicDir?: string
  spaIndex?: string
  email?: {
    secret?: string
    dbPath?: string
    maxRawBytes?: number
    /** 字符串后缀或带可选 resendApiKey 的对象 */
    domains?: MailDomainFileEntry[] | string
  }
  auth?: {
    sessionTtlMs?: number
    cookieSecure?: boolean
    cookieName?: string
    /** 可访问 /api/admin/* 的用户名（忽略大小写） */
    adminUsername?: string[]
  }
}

const packageRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

function resolveConfigPath(): string | null {
  for (const p of [
    path.join(process.cwd(), 'config.json'),
    path.join(packageRoot, 'config.json'),
  ]) {
    if (existsSync(p)) return p
  }
  return null
}

export function loadConfigFile(): ConfigFile {
  const configPath = resolveConfigPath()
  if (!configPath) {
    console.warn('[config] 未找到 config.json，使用默认值')
    return {}
  }
  try {
    const raw = JSON.parse(readFileSync(configPath, 'utf8')) as unknown
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('根节点须为 JSON 对象')
    }
    return raw as ConfigFile
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`无法解析配置文件 ${configPath}: ${msg}`)
  }
}
