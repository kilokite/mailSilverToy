import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { config } from '../config.js'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (db) return db
  mkdirSync(dirname(config.email.dbPath), { recursive: true })
  db = new Database(config.email.dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  return db
}
