#!/usr/bin/env node
/**
 * 交互式向本地邮件 webhook 推送测试邮件。
 * 用法：npm run push-mail
 */
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const fileConfig = loadConfigFile(resolve(root, 'config.json'))

const port = fileConfig.port ?? 23879
const secret = fileConfig.email?.secret ?? ''
const defaultTo = pickDefaultRecipient(fileConfig.email?.domains)

const rl = createInterface({ input, output })

try {
  const urlRaw = await rl.question(
    `Webhook 地址 [http://localhost:${port}/api/email]: `,
  )
  const countRaw = await rl.question('推送数量 [1]: ')
  const toRaw = await rl.question(`收件人 To [${defaultTo}]: `)

  const url = (urlRaw.trim() || `http://localhost:${port}/api/email`).replace(
    /\/+$/,
    '',
  )
  const count = parsePositiveInt(countRaw.trim() || '1')
  const to = toRaw.trim() || defaultTo

  if (!secret.trim()) {
    console.error('错误：未设置 email.secret（请在 config.json 中配置）')
    process.exit(1)
  }

  console.log(`\n将向 ${url} 推送 ${count} 封邮件，收件人 ${to}\n`)

  let ok = 0
  let fail = 0

  for (let i = 1; i <= count; i++) {
    const eml = buildEml({ index: i, to })
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'message/rfc822',
        'x-webhook-secret': secret,
      },
      body: eml,
    })
    const text = await res.text()
    let body
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }

    if (res.ok) {
      ok++
      const id = typeof body === 'object' && body?.id ? body.id : '—'
      const dup = body?.duplicated ? ' (重复)' : ''
      console.log(`[${i}/${count}] OK id=${id}${dup}`)
    } else {
      fail++
      console.error(`[${i}/${count}] ${res.status} ${text.slice(0, 200)}`)
    }
  }

  console.log(`\n完成：成功 ${ok}，失败 ${fail}`)
  process.exit(fail > 0 ? 1 : 0)
} finally {
  rl.close()
}

function loadConfigFile(path) {
  if (!existsSync(path)) return {}
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'))
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  } catch (err) {
    console.error(`错误：无法解析 ${path}: ${err.message}`)
    process.exit(1)
  }
}

function pickDefaultRecipient(domains) {
  const suffixes = domainSuffixesFromConfig(domains)
  const domain = suffixes[0] ?? '@kt.sb'
  return `test${domain}`
}

function domainSuffixesFromConfig(domains) {
  const items = Array.isArray(domains)
    ? domains
    : typeof domains === 'string'
      ? domains.split(',')
      : ['@kt.sb']
  return items
    .map((item) => {
      if (typeof item === 'string') return item.trim().toLowerCase()
      if (item && typeof item === 'object' && typeof item.suffix === 'string') {
        return item.suffix.trim().toLowerCase()
      }
      return ''
    })
    .filter((s) => s.startsWith('@'))
}

function parsePositiveInt(s) {
  const n = Number(s)
  if (!Number.isInteger(n) || n < 1) {
    console.error(`错误：无效数量 "${s}"，需要正整数`)
    process.exit(1)
  }
  return n
}

function buildEml({ index, to }) {
  const now = new Date()
  const id = `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 10)}`
  const subject = `测试邮件 #${index} (${now.toISOString()})`
  const body = [
    `这是一封自动推送的测试邮件。`,
    `序号: ${index}`,
    `时间: ${now.toISOString()}`,
    `随机: ${Math.random()}`,
  ].join('\n')

  return [
    `From: MailSilver Tester <tester@example.com>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Date: ${now.toUTCString()}`,
    `Message-ID: <${id}@push-emails.local>`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=utf-8`,
    ``,
    body,
    ``,
  ].join('\r\n')
}
