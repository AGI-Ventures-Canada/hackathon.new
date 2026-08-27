"use client"

import { useState } from "react"
import { Copy, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface CopyButtonProps {
  value: string | object
  className?: string
  showLabel?: boolean
  size?: "sm" | "default" | "icon"
}

export function CopyButton({
  value,
  className,
  showLabel = true,
  size = "sm",
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    const text = typeof value === "string" ? value : JSON.stringify(value, null, 2)
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (size === "icon") {
    return (
      <Button
        variant="ghost"
        size="icon"
        className={cn("size-8 shrink-0", className)}
        onClick={handleCopy}
        aria-label={copied ? "Copied" : "Copy"}
      >
        {copied ? (
          <Check className="size-4" />
        ) : (
          <Copy className="size-4" />
        )}
      </Button>
    )
  }

  return (
    <Button
      variant="ghost"
      size={size}
      className={cn(
        "gap-1.5 text-muted-foreground",
        size === "sm" && "h-7",
        className
      )}
      onClick={handleCopy}
    >
      {copied ? (
        <>
          <Check className="size-3.5" />
          {showLabel && "Copied"}
        </>
      ) : (
        <>
          <Copy className="size-3.5" />
          {showLabel && "Copy"}
        </>
      )}
    </Button>
  )
}
