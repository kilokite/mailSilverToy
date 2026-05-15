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
  }
}

const defaultMaxRaw = 25 * 1024 * 1024

const publicPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public')
const publicDir = process.env.PUBLIC_DIR ?? publicPath

export const config: AppConfig = {
  port: Number(process.env.PORT ?? 23879),
  publicDir,
  spaIndex: process.env.SPA_INDEX ?? path.join(publicDir, 'index.html'),
  email: {
    secret: process.env.EMAIL_SECRET ?? '',
    dbPath: process.env.DB_PATH ?? './data/mail.db',
    maxRawBytes: Number(process.env.MAX_RAW_BYTES ?? defaultMaxRaw),
  },
}

export const isDev = process.env.NODE_ENV === 'development'
