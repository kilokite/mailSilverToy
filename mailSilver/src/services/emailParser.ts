import { simpleParser } from 'mailparser'
import type {
  AddressObject,
  EmailAddress,
  HeaderValue,
  Headers,
  ParsedMail,
} from 'mailparser'

export type ParsedEmailRow = {
  message_id: string | null
  subject: string | null
  from_addr: string | null
  from_name: string | null
  to_json: string
  cc_json: string
  bcc_json: string
  reply_to_json: string
  date: string | null
  text: string | null
  html: string | null
  headers_json: string
  attachments_meta_json: string
}

type AddrLite = { name?: string; address?: string }

function addrListFromObject(obj: AddressObject | undefined): AddrLite[] {
  if (!obj?.value?.length) return []
  return obj.value.flatMap((e: EmailAddress) => {
    if (e.group?.length) {
      return e.group.map((g) => ({
        name: g.name || undefined,
        address: g.address,
      }))
    }
    return [{ name: e.name || undefined, address: e.address }]
  })
}

function addrListFromMulti(
  v: AddressObject | AddressObject[] | undefined,
): AddrLite[] {
  if (!v) return []
  const arr = Array.isArray(v) ? v : [v]
  return arr.flatMap((o) => addrListFromObject(o))
}

function serializeHeaderValue(v: HeaderValue): unknown {
  if (v instanceof Date) return v.toISOString()
  if (Array.isArray(v)) return v.map(serializeHeaderValue)
  if (typeof v === 'string') return v
  if (v && typeof v === 'object') {
    if ('value' in v && 'params' in v && typeof (v as { value: unknown }).value === 'string') {
      return v
    }
    if ('value' in v && Array.isArray((v as AddressObject).value)) {
      const ao = v as AddressObject
      return { text: ao.text, html: ao.html, value: addrListFromObject(ao) }
    }
  }
  return v
}

function headersToJson(headers: Headers): string {
  const out: Record<string, unknown> = {}
  for (const [key, val] of headers) {
    out[key] = serializeHeaderValue(val)
  }
  return JSON.stringify(out)
}

function attachmentMeta(mail: ParsedMail): string {
  const meta = (mail.attachments ?? []).map((a) => ({
    filename: a.filename ?? null,
    contentType: a.contentType,
    size: a.size,
  }))
  return JSON.stringify(meta)
}

function mailToRow(mail: ParsedMail): ParsedEmailRow {
  const fromList = addrListFromObject(mail.from)
  const from0 = fromList[0]
  const html =
    typeof mail.html === 'string' && mail.html.length > 0 ? mail.html : null

  return {
    message_id: mail.messageId ?? null,
    subject: mail.subject ?? null,
    from_addr: from0?.address ?? null,
    from_name: from0?.name ?? null,
    to_json: JSON.stringify(addrListFromMulti(mail.to)),
    cc_json: JSON.stringify(addrListFromMulti(mail.cc)),
    bcc_json: JSON.stringify(addrListFromMulti(mail.bcc)),
    reply_to_json: JSON.stringify(addrListFromObject(mail.replyTo)),
    date: mail.date ? mail.date.toISOString() : null,
    text: mail.text ?? null,
    html,
    headers_json: headersToJson(mail.headers),
    attachments_meta_json: attachmentMeta(mail),
  }
}

export async function parseEml(
  raw: Buffer,
): Promise<{ ok: true; row: ParsedEmailRow } | { ok: false; error: string }> {
  try {
    const mail = await simpleParser(raw)
    return { ok: true, row: mailToRow(mail) }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }
}
