import { EventEmitter } from 'node:events'
import type { EmailListItem } from './emailRepo.js'

export type EmailNewEvent = {
  /** 命中的收件人前缀（lowercase，仅匹配本服务域名） */
  prefixes: string[]
  item: EmailListItem
}

class EmailBus extends EventEmitter {}

const bus = new EmailBus()
bus.setMaxListeners(0)

export function emitEmailNew(payload: EmailNewEvent): void {
  bus.emit('email:new', payload)
}

export function subscribeEmailNew(
  handler: (e: EmailNewEvent) => void,
): () => void {
  bus.on('email:new', handler)
  return () => bus.off('email:new', handler)
}
