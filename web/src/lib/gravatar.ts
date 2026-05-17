/** Normalize address for Gravatar (trim + lowercase). */
export function normalizeEmailForGravatar(email: string | null | undefined): string | null {
  const s = email?.trim().toLowerCase()
  if (!s || !s.includes("@")) return null
  return s
}

export function avatarInitials(name: string | null | undefined, fallback = "?"): string {
  const s = (name ?? "").trim()
  if (!s) return fallback
  return s.slice(0, 1).toUpperCase()
}
