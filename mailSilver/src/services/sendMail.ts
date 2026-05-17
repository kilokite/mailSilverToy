import { Resend } from 'resend'
import { getMailDomainConfig } from '../config.js'
import { splitAddress } from './userEmailRepo.js'

const resendClients = new Map<string, Resend>()

function getResendClient(apiKey: string): Resend {
  let client = resendClients.get(apiKey)
  if (!client) {
    client = new Resend(apiKey)
    resendClients.set(apiKey, client)
  }
  return client
}

export type SendMailInput = {
  from: string
  to: string | string[]
  subject: string
  html?: string
  text?: string
  replyTo?: string | string[]
  cc?: string | string[]
  bcc?: string | string[]
}

export type SendMailErrorCode =
  | 'invalid_from'
  | 'unknown_domain'
  | 'resend_not_configured'
  | 'missing_body'
  | 'send_failed'

export type SendMailResult =
  | { ok: true; id: string }
  | { ok: false; code: SendMailErrorCode; message: string }

/** 按发件人域名选用对应 Resend Key 发信 */
export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  const from = input.from.trim()
  const parsed = splitAddress(from)
  if (!parsed) {
    return {
      ok: false,
      code: 'invalid_from',
      message: '发件地址无效或不在已配置域名内',
    }
  }

  const domainCfg = getMailDomainConfig(parsed.domain)
  if (!domainCfg) {
    return {
      ok: false,
      code: 'unknown_domain',
      message: `未配置域名 ${parsed.domain}`,
    }
  }

  const apiKey = domainCfg.resendApiKey?.trim()
  if (!apiKey) {
    return {
      ok: false,
      code: 'resend_not_configured',
      message: `域名 ${parsed.domain} 未配置 Resend API Key`,
    }
  }

  const html = input.html?.trim()
  const text = input.text?.trim()
  if (!html && !text) {
    return {
      ok: false,
      code: 'missing_body',
      message: '需提供 html 或 text 正文',
    }
  }

  const client = getResendClient(apiKey)
  const base = {
    from,
    to: input.to,
    subject: input.subject,
    replyTo: input.replyTo,
    cc: input.cc,
    bcc: input.bcc,
  }
  const { data, error } = html
    ? await client.emails.send({ ...base, html })
    : await client.emails.send({ ...base, text: text! })

  if (error) {
    return {
      ok: false,
      code: 'send_failed',
      message: error.message,
    }
  }
  if (!data?.id) {
    return {
      ok: false,
      code: 'send_failed',
      message: 'Resend 未返回邮件 id',
    }
  }

  return { ok: true, id: data.id }
}
