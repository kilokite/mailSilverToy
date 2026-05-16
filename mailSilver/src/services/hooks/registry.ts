export interface HookEventMap {
  'email:new': {
    addresses: string[]
    emailId: string
    subject?: string
  }
  'user:registered': {
    userId: string
    username: string
    initialEmail: string
  }
  'user:email_added': {
    userId: string
    username: string
    address: string
  }
}

export type HookEventName = keyof HookEventMap

export type HookEventMeta = {
  name: HookEventName
  description: string
  scope: 'user' | 'global'
}

export const HOOK_EVENTS: ReadonlyArray<HookEventMeta> = [
  { name: 'email:new', description: '邮件入库且匹配到用户邮箱', scope: 'user' },
  { name: 'user:registered', description: '新用户注册成功', scope: 'global' },
  { name: 'user:email_added', description: '用户新增邮箱地址', scope: 'global' },
]

const EVENT_SET = new Set<HookEventName>(HOOK_EVENTS.map((x) => x.name))

export function isHookEventName(input: string): input is HookEventName {
  return EVENT_SET.has(input as HookEventName)
}

export function buildTestPayload(
  event: HookEventName,
  user: { id: string; username: string },
): HookEventMap[HookEventName] {
  switch (event) {
    case 'email:new':
      return {
        addresses: [],
        emailId: `test-${user.id}`,
        subject: `[TEST] webhook for ${user.username}`,
      }
    case 'user:registered':
      return {
        userId: user.id,
        username: user.username,
        initialEmail: `${user.username}@example.test`,
      }
    case 'user:email_added':
      return {
        userId: user.id,
        username: user.username,
        address: `${user.username}+extra@example.test`,
      }
  }
}
