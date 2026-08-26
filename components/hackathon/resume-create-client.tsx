"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2, TriangleAlert } from "lucide-react"
import { EventImportRecovery } from "@/components/hackathon/event-import-editor"
import { Button } from "@/components/ui/button"
import {
  restoreAuthResumeTarget,
  type AuthResumeTarget,
} from "@/lib/auth/create-resume"

export function ResumeCreateClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [target, setTarget] = useState<AuthResumeTarget | "missing" | null>(null)

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const token = searchParams.get("token")
      const restored = token ? restoreAuthResumeTarget(token) : null
      if (!restored) {
        setTarget("missing")
        return
      }
      if (restored.kind === "redirect") {
        router.replace(restored.redirectUrl)
        return
      }
      setTarget(restored)
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [router, searchParams])

  if (target && target !== "missing" && target.kind === "import") {
    return (
      <EventImportRecovery
        sourceUrl={target.sourceUrl}
        storageKey={target.storageKey}
        submitPath="/api/dashboard/import/event"
        fallback={<ResumeMissing />}
      />
    )
  }

  if (target === "missing") return <ResumeMissing />

  return (
    <div className="flex min-h-[50vh] items-center justify-center gap-2">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Restoring your draft…</p>
    </div>
  )
}

function ResumeMissing() {
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <div className="flex flex-col items-center gap-4">
        <TriangleAlert className="size-10 text-muted-foreground" />
        <h1 className="text-lg font-semibold">We couldn&apos;t restore that draft</h1>
        <p className="text-sm text-muted-foreground">
          The saved return link expired or browser storage was cleared.
        </p>
        <Button asChild>
          <Link href="/create">Start a new event</Link>
        </Button>
      </div>
    </div>
  )
}
