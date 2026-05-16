import { EventEmitter } from 'node:events'
import type { HookEventMap, HookEventName } from './registry.js'

type HookEnvelope<E extends HookEventName> = {
  event: E
  occurredAt: string
  data: HookEventMap[E]
}

type AnyEnvelope = {
  [E in HookEventName]: HookEnvelope<E>
}[HookEventName]

class HookBus extends EventEmitter {}

const bus = new HookBus()
bus.setMaxListeners(0)

export function emitHook<E extends HookEventName>(
  event: E,
  data: HookEventMap[E],
): void {
  const envelope: HookEnvelope<E> = {
    event,
    occurredAt: new Date().toISOString(),
    data,
  }
  bus.emit(event, envelope)
}

export function onHook<E extends HookEventName>(
  event: E,
  handler: (envelope: HookEnvelope<E>) => void | Promise<void>,
): () => void {
  const wrapped = (envelope: AnyEnvelope) => {
    void handler(envelope as HookEnvelope<E>)
  }
  bus.on(event, wrapped)
  return () => bus.off(event, wrapped)
}
