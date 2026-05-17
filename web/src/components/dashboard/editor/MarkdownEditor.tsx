import { useMemo } from "react"
import { mdToHtml } from "@/lib/markdown"
import { cn } from "@/lib/utils"

export function MarkdownEditor({
  value,
  onChange,
  disabled,
}: {
  value: string
  onChange: (md: string) => void
  disabled?: boolean
}) {
  const previewHtml = useMemo(() => mdToHtml(value), [value])

  return (
    <div className="grid h-full min-h-0 flex-1 grid-cols-1 gap-0 overflow-hidden rounded-md border md:grid-cols-2">
      <div className="flex min-h-0 flex-1 flex-col border-b md:border-r md:border-b-0">
        <div className="shrink-0 border-b bg-muted/30 px-3 py-1.5 text-xs font-medium text-muted-foreground">
          Markdown
        </div>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="支持 GFM：标题、列表、链接、代码块等"
          className={cn(
            "min-h-0 flex-1 resize-none border-0 bg-transparent px-3 py-2 font-mono text-sm outline-none",
            "placeholder:text-muted-foreground disabled:opacity-50",
            "focus-visible:ring-0",
          )}
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 border-b bg-muted/30 px-3 py-1.5 text-xs font-medium text-muted-foreground">
          预览
        </div>
        <div
          className={cn(
            "prose-compose min-h-0 flex-1 overflow-auto px-3 py-2 text-sm",
            !previewHtml && "text-muted-foreground",
          )}
        >
          {previewHtml ? (
            <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
          ) : (
            <p className="text-muted-foreground">预览将显示在这里</p>
          )}
        </div>
      </div>
    </div>
  )
}
