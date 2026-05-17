import logoUrl from "@/assets/logo.png"
import type { EmailListItem } from "@/lib/api"

export async function ensureMailNotifyPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false
  if (Notification.permission === "granted") return true
  if (Notification.permission === "denied") return false
  return (await Notification.requestPermission()) === "granted"
}

export function notifyNewMail(item: EmailListItem): void {
  if (!("Notification" in window) || Notification.permission !== "granted") return
  if (!document.hidden) return

  const from =
    item.from_name?.trim() || item.from_addr?.trim() || "未知发件人"
  const subject = item.subject?.trim() || "(无主题)"

  const n = new Notification(from, {
    body: subject,
    icon: logoUrl,
    tag: item.id,
  })
  n.onclick = () => {
    window.focus()
    n.close()
  }
}
