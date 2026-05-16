import { EventEmitter } from 'node:events'
import type { EmailListItem } from './emailRepo.js'
import { emitHook } from './hooks/index.js'

export type EmailNewEvent = {
  /** 命中的收件人完整地址（lowercase） */
  addresses: string[]
  item: EmailListItem
}

class EmailBus extends EventEmitter {}

const bus = new EmailBus()
bus.setMaxListeners(0)

export function emitEmailNew(payload: EmailNewEvent): void {
  bus.emit('email:new', payload)
  emitHook('email:new', {
    addresses: payload.addresses,
    emailId: payload.item.id,
    subject: payload.item.subject ?? undefined,
  })
}

export function subscribeEmailNew(
  handler: (e: EmailNewEvent) => void,
): () => void {
  bus.on('email:new', handler)
  return () => bus.off('email:new', handler)
}
