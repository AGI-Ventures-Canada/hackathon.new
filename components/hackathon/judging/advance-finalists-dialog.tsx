"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Loader2 } from "lucide-react"

interface AdvanceFinalistsDialogProps {
  hackathonId: string
  fromRound: { id: string; name: string }
  toRound: { id: string; name: string }
  topN: number
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function AdvanceFinalistsDialog({
  hackathonId,
  fromRound,
  toRound,
  topN,
  open,
  onOpenChange,
  onSuccess,
}: AdvanceFinalistsDialogProps) {
  const router = useRouter()
  const [advancing, setAdvancing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAdvance() {
    setAdvancing(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/dashboard/hackathons/${hackathonId}/rounds/${fromRound.id}/advance`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ auto: true, toRoundId: toRound.id }),
        }
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to advance submissions")
      }
      router.refresh()
      onSuccess?.()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setAdvancing(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Advance top {topN} to {toRound.name}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            The highest-scored submissions from {fromRound.name} will move into {toRound.name}.
            Judges for {toRound.name} will only see those finalists. You can re-run this if more
            scores come in.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={advancing}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleAdvance} disabled={advancing}>
            {advancing && <Loader2 className="mr-2 size-4 animate-spin" />}
            Advance finalists
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
