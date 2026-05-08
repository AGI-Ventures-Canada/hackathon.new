"use client"

import { useState } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { ChevronDown, ChevronUp } from "lucide-react"
import { MarkdownContent } from "@/components/ui/markdown-content"

interface TermsAcceptanceBlockProps {
  termsContent: string
  accepted: boolean
  onChange: (accepted: boolean) => void
  disabled?: boolean
}

export function TermsAcceptanceBlock({
  termsContent,
  accepted,
  onChange,
  disabled,
}: TermsAcceptanceBlockProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-medium">Terms and conditions</p>
          <p className="text-xs text-muted-foreground">
            Please read and agree to the organizer&apos;s terms before continuing.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? (
            <>
              <ChevronUp />
              <span>Hide</span>
            </>
          ) : (
            <>
              <ChevronDown />
              <span>Read</span>
            </>
          )}
        </Button>
      </div>

      {expanded && (
        <div className="max-h-72 overflow-y-auto rounded-md border bg-background p-3">
          <MarkdownContent>{termsContent}</MarkdownContent>
        </div>
      )}

      <div className="flex items-start gap-2">
        <Checkbox
          id="agree-terms"
          checked={accepted}
          onCheckedChange={(v) => onChange(v === true)}
          disabled={disabled}
          className="mt-0.5"
        />
        <Label htmlFor="agree-terms" className="text-sm font-normal leading-snug cursor-pointer">
          I agree to the terms and conditions.
        </Label>
      </div>
    </div>
  )
}
