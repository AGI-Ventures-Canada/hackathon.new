"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogTrigger } from "@/components/ui/dialog"
import { MarkdownEditor } from "@/components/ui/markdown-editor"
import { AddressAutocomplete } from "@/components/ui/address-autocomplete"
import { OptimizedImage } from "@/components/ui/optimized-image"
import { SteppedDialogContent } from "@/components/ui/stepped-dialog-content"
import {
  SectionLayout,
  ShowcaseSection,
  ShowcaseStack,
} from "../_section-layout"

const SECTIONS = [
  { id: "markdown-editor", label: "Markdown editor" },
  { id: "address-autocomplete", label: "Address autocomplete" },
  { id: "optimized-image", label: "Optimized image" },
  { id: "stepped-dialog", label: "Stepped dialog" },
]

const SAMPLE = `## Hello

This is a **markdown editor**. Type something, then hit Preview.

- One
- Two
- Three
`

const STEPS = [
  { key: "one", label: "Name your event", complete: true },
  { key: "two", label: "Pick a date", complete: true },
  { key: "three", label: "Add prizes" },
  { key: "four", label: "Invite people" },
]

export function AdvancedShowcase() {
  const [md, setMd] = useState(SAMPLE)
  const [addr, setAddr] = useState("")
  const [step, setStep] = useState(2)

  return (
    <SectionLayout sections={SECTIONS}>
      <ShowcaseSection
        id="markdown-editor"
        title="Markdown editor"
        description="A textarea with formatting buttons and a preview tab."
      >
        <div className="max-w-2xl">
          <MarkdownEditor value={md} onChange={setMd} placeholder="Write something..." />
        </div>
      </ShowcaseSection>

      <ShowcaseSection
        id="address-autocomplete"
        title="Address autocomplete"
        description="Type an address and pick from suggestions."
      >
        <ShowcaseStack>
          <div className="max-w-md">
            <AddressAutocomplete value={addr} onChange={setAddr} />
          </div>
          <p className="text-xs text-muted-foreground">
            Typing here sends requests to Nominatim (OpenStreetMap) in real time.
          </p>
        </ShowcaseStack>
      </ShowcaseSection>

      <ShowcaseSection
        id="optimized-image"
        title="Optimized image"
        description="A wrapper around next/image that skips optimization for local dev URLs."
      >
        <div className="relative h-48 w-full max-w-md overflow-hidden rounded-none border">
          <OptimizedImage
            src="https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=640"
            alt="Office desk"
            fill
            sizes="(max-width: 768px) 100vw, 400px"
            className="object-cover"
          />
        </div>
      </ShowcaseSection>

      <ShowcaseSection
        id="stepped-dialog"
        title="Stepped dialog"
        description="A pop-up box with a step tracker at the top."
      >
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">Open stepped dialog</Button>
          </DialogTrigger>
          <SteppedDialogContent
            title="Create an event"
            description="A few quick steps to get set up."
            steps={STEPS}
            currentStep={step}
            onStepChange={setStep}
            stepColumns={4}
          >
            <div className="min-h-32 rounded-none border p-4 text-xs">
              Step body for <strong>{STEPS[step].label}</strong>.
            </div>
            <div className="flex justify-between">
              <Button
                variant="outline"
                disabled={step === 0}
                onClick={() => setStep((s) => Math.max(0, s - 1))}
              >
                Back
              </Button>
              <Button
                disabled={step === STEPS.length - 1}
                onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
              >
                Next
              </Button>
            </div>
          </SteppedDialogContent>
        </Dialog>
      </ShowcaseSection>
    </SectionLayout>
  )
}
