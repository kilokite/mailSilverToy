#!/usr/bin/env node
// 把 mailSilver/public 复制到 mailSilver/dist/public，让 dist 自包含
import { cpSync, rmSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const src = resolve(root, 'public')
const dst = resolve(root, 'dist/public')

if (!existsSync(src)) {
  console.warn(`[copy-public] 跳过：源目录不存在 ${src}`)
  process.exit(0)
}

if (existsSync(dst)) rmSync(dst, { recursive: true, force: true })
cpSync(src, dst, { recursive: true })
console.log(`[copy-public] 已复制 ${src} -> ${dst}`)
