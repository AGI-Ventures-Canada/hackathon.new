"use client"

import { useRef, useState, useCallback } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { MarkdownContent } from "@/components/ui/markdown-content"
import {
  Bold,
  Italic,
  Heading2,
  List,
  ListOrdered,
  Link,
  Code,
} from "lucide-react"

interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
  id?: string
  maxLength?: number
}

type FormatAction =
  | { type: "wrap"; before: string; after: string }
  | { type: "line-prefix"; prefix: string }
  | { type: "link" }

const TOOLBAR_ITEMS: { icon: typeof Bold; label: string; action: FormatAction }[] = [
  { icon: Bold, label: "Bold", action: { type: "wrap", before: "**", after: "**" } },
  { icon: Italic, label: "Italic", action: { type: "wrap", before: "_", after: "_" } },
  { icon: Heading2, label: "Heading", action: { type: "line-prefix", prefix: "## " } },
  { icon: List, label: "Bullet list", action: { type: "line-prefix", prefix: "- " } },
  { icon: ListOrdered, label: "Numbered list", action: { type: "line-prefix", prefix: "1. " } },
  { icon: Link, label: "Link", action: { type: "link" } },
  { icon: Code, label: "Code", action: { type: "wrap", before: "`", after: "`" } },
]

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  rows = 8,
  id,
  maxLength,
}: MarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [activeTab, setActiveTab] = useState("write")
  const pendingAction = useRef<FormatAction | null>(null)

  const applyFormat = useCallback(
    (action: FormatAction) => {
      if (activeTab !== "write") {
        pendingAction.current = action
        setActiveTab("write")
        return
      }

      const textarea = textareaRef.current
      if (!textarea) return

      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const selected = value.slice(start, end)

      let newValue: string
      let cursorPos: number

      switch (action.type) {
        case "wrap": {
          const leadingWs = selected.match(/^\s*/)?.[0] ?? ""
          const trailingWs = selected.match(/\s*$/)?.[0] ?? ""
          const trimmed = selected.trim()
          newValue =
            value.slice(0, start) +
            leadingWs +
            action.before +
            trimmed +
            action.after +
            trailingWs +
            value.slice(end)
          cursorPos = trimmed
            ? start + leadingWs.length + action.before.length + trimmed.length + action.after.length
            : start + leadingWs.length + action.before.length
          break
        }
        case "line-prefix": {
          const lineStart = value.lastIndexOf("\n", start - 1) + 1
          newValue =
            value.slice(0, lineStart) + action.prefix + value.slice(lineStart)
          cursorPos = end + action.prefix.length
          break
        }
        case "link": {
          const linkText = selected || "link text"
          const insertion = `[${linkText}](url)`
          newValue = value.slice(0, start) + insertion + value.slice(end)
          cursorPos = start + linkText.length + 3
          break
        }
      }

      onChange(newValue)

      requestAnimationFrame(() => {
        textarea.focus()
        textarea.setSelectionRange(cursorPos, cursorPos)
      })
    },
    [value, onChange, activeTab]
  )

  const handleTabChange = useCallback(
    (tab: string) => {
      setActiveTab(tab)
      if (tab === "write" && pendingAction.current) {
        const action = pendingAction.current
        pendingAction.current = null
        requestAnimationFrame(() => {
          const textarea = textareaRef.current
          if (!textarea) return
          const end = value.length
          textarea.setSelectionRange(end, end)
          applyFormat(action)
        })
      }
    },
    [value, applyFormat]
  )

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange}>
      <div className="flex items-center justify-between">
        <TabsList variant="line">
          <TabsTrigger value="write">Write</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>

        <div className="flex items-center gap-0.5">
          {TOOLBAR_ITEMS.map((item) => (
            <Tooltip key={item.label}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyFormat(item.action)}
                  tabIndex={-1}
                >
                  <item.icon />
                  <span className="sr-only">{item.label}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{item.label}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>

      <TabsContent value="write" className="mt-0">
        <textarea
          ref={textareaRef}
          id={id}
          rows={rows}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={maxLength}
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          data-form-type="other"
          className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex min-h-16 w-full border bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 rounded-none field-sizing-content"
        />
      </TabsContent>

      <TabsContent value="preview" className="mt-0">
        <div className="min-h-16 w-full border px-3 py-2 rounded-none">
          {value ? (
            <MarkdownContent>{value}</MarkdownContent>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing to preview</p>
          )}
        </div>
      </TabsContent>
    </Tabs>
  )
}
