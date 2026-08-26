"use client"

import { MarkdownEditor } from "@/components/ui/markdown-editor"

interface StepDescriptionProps {
  value: string | null
  onChange: (value: string | null) => void
}

export function StepDescription({ value, onChange }: StepDescriptionProps) {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h1 className="text-3xl font-medium tracking-tight sm:text-5xl">
          Tell people what it&apos;s about
        </h1>
        <p className="text-muted-foreground">
          A short description so participants know what to expect. Markdown supported.
        </p>
      </div>
      <MarkdownEditor
        value={value ?? ""}
        onChange={(val) => onChange(val || null)}
        placeholder="What will participants build? What's the theme?"
        rows={8}
        maxLength={5_000}
      />
    </div>
  )
}
