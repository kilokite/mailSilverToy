import { useEffect, useMemo, useState } from "react"
import md5 from "blueimp-md5"
import { cn } from "@/lib/utils"
import { avatarInitials, normalizeEmailForGravatar } from "@/lib/gravatar"

const SIZE_PX = { sm: 36, md: 44 } as const

function gravatarImageUrl(email: string, sizePx: number): string {
  const hash = md5(email)
  const s = Math.min(2048, Math.max(1, Math.round(sizePx)))
  return `https://www.gravatar.com/avatar/${hash}?s=${s}&d=404`
}

export function EmailAvatar({
  email,
  name,
  size = "sm",
  className,
}: {
  email: string | null | undefined
  name?: string | null
  size?: keyof typeof SIZE_PX
  className?: string
}) {
  const [imgFailed, setImgFailed] = useState(false)
  const normalizedEmail = useMemo(() => normalizeEmailForGravatar(email), [email])

  useEffect(() => {
    setImgFailed(false)
  }, [normalizedEmail])
  const url = useMemo(
    () => (normalizedEmail ? gravatarImageUrl(normalizedEmail, SIZE_PX[size] * 2) : null),
    [normalizedEmail, size],
  )
  const letter = avatarInitials(name || email)
  const sizeClass =
    size === "sm" ? "h-9 w-9 text-sm font-medium" : "h-11 w-11 text-base font-medium"

  if (!url || imgFailed) {
    return (
      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full bg-muted text-foreground",
          sizeClass,
          className,
        )}
        aria-hidden
      >
        {letter}
      </div>
    )
  }

  return (
    <img
      src={url}
      alt=""
      width={SIZE_PX[size]}
      height={SIZE_PX[size]}
      className={cn("shrink-0 rounded-full object-cover", sizeClass, className)}
      onError={() => setImgFailed(true)}
    />
  )
}
