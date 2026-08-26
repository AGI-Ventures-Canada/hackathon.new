"use client"

import { Input } from "@/components/ui/input"

interface StepNameProps {
  value: string
  onChange: (value: string) => void
}

export function StepName({ value, onChange }: StepNameProps) {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h1 className="text-3xl font-medium tracking-tight sm:text-5xl">
          What&apos;s your hackathon called?
        </h1>
        <p className="text-muted-foreground">
          Pick a name that excites participants. You can always change it later.
        </p>
      </div>
      <Input
        type="text"
        placeholder="My Awesome Hackathon"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={120}
        className="h-14 text-lg"
        autoFocus
        autoComplete="off"
        data-1p-ignore
        data-lpignore="true"
        data-form-type="other"
      />
    </div>
  )
}
