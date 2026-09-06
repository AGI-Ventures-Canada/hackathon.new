"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useJudgingFormDraft } from "@/hooks/use-judging-form-draft"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { assertOkJson } from "@/lib/utils/fetch"
import type { JudgeBatchResult } from "@/lib/services/judging-invite-batch"

export function JudgingInviteComposer({
  hackathonId,
  prizes,
  rooms = [],
  onSaved,
}: {
  hackathonId: string
  prizes: Array<{ id: string; name: string }>
  rooms?: Array<{ id: string; name: string }>
  onSaved: () => void
}) {
  const router = useRouter()
  const [draft, setDraft, clearDraft] = useJudgingFormDraft(hackathonId, "judge-invitations", {
    emails: "",
    message: "",
    prizeIds: [] as string[],
    roomIds: [] as string[],
  })
  const { emails, message, prizeIds } = draft
  const roomIds = draft.roomIds ?? []
  const setEmails = (emails: string) => setDraft((current) => ({ ...current, emails }))
  const setMessage = (message: string) => setDraft((current) => ({ ...current, message }))
  const setPrizeIds = (update: (ids: string[]) => string[]) =>
    setDraft((current) => ({ ...current, prizeIds: update(current.prizeIds) }))
  const setRoomIds = (update: (ids: string[]) => string[]) =>
    setDraft((current) => ({ ...current, roomIds: update(current.roomIds ?? []) }))
  const [results, setResults] = useState<JudgeBatchResult[]>([])
  const [previewed, setPreviewed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [requestKeys, setRequestKeys] = useState<string[]>([])
  const emailCounts = new Map<string, number>()
  for (const email of emails.split(/[\n,;]/).map((email) => email.trim().toLowerCase()).filter(Boolean))
    emailCounts.set(email, (emailCounts.get(email) ?? 0) + 1)
  const addresses = [...emailCounts.keys()]
  const duplicates = [...emailCounts].filter(([, count]) => count > 1)
  function invalidate() {
    setPreviewed(false)
    setResults([])
    setRequestKeys([])
  }
  async function run(preview: boolean, retry = false) {
    if (busy) return
    if (addresses.length === 0 || addresses.length > 200) {
      setError("Add between 1 and 200 email addresses.")
      return
    }
    setBusy(true)
    setError(null)
    const targets = retry
      ? results
          .filter((result) => result.outcome === "failed" || result.delivery === "failed")
          .map((result) => result.email)
      : addresses
    const keys =
      retry || !requestKeys.length
        ? Array.from({ length: Math.ceil(targets.length / 20) }, () => crypto.randomUUID())
        : requestKeys
    if (!preview) setRequestKeys(keys)
    const next: JudgeBatchResult[] = []
    try {
      for (let start = 0; start < targets.length; start += 20) {
        const batch = await fetch(`/api/dashboard/hackathons/${hackathonId}/judging/judges/batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            emails: targets.slice(start, start + 20),
            preview,
            retryFailed: retry,
            message,
            prizeIds,
            roomIds,
            requestKey: keys[start / 20],
          }),
        }).then(assertOkJson<{ results: JudgeBatchResult[] }>)
        next.push(...batch.results)
        setResults(
          retry
            ? [...results.filter((result) => !targets.includes(result.email)), ...next]
            : [...next],
        )
      }
      setPreviewed(preview)
      if (!preview) {
        if (next.every((result) =>
          ["added", "invited", "already_judge", "already_invited", "reminded"].includes(result.outcome) && result.delivery !== "failed",
        ))
          clearDraft()
        router.refresh()
        onSaved()
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Couldn't send this batch. Your list is still here.",
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-4">
      <form
        autoComplete="off"
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          void run(!previewed)
        }}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault()
            void run(!previewed)
          }
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="judge-emails">Who&apos;s judging?</Label>
          <Textarea
            disabled={busy}
            id="judge-emails"
            autoFocus
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            data-form-type="other"
            value={emails}
            onChange={(event) => {
              setEmails(event.target.value)
              invalidate()
            }}
            placeholder="alex@example.com, sam@example.com"
            rows={5}
          />
          <p className="text-sm text-muted-foreground">
            Paste emails, one per line or separated by commas.
          </p>
          {duplicates.length > 0 && (
            <div role="status" className="text-sm text-muted-foreground">
              <p>Repeated emails will get only one invitation:</p>
              <ul className="list-inside list-disc">
                {duplicates.map(([email, count]) => (
                  <li key={email} className="break-all">{email} ({count} times)</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="judge-message">Personal message (optional)</Label>
          <Textarea
            disabled={busy}
            id="judge-message"
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            data-form-type="other"
            maxLength={1000}
            value={message}
            onChange={(event) => {
              setMessage(event.target.value)
              invalidate()
            }}
          />
        </div>
        {prizes.length > 0 && (
          <fieldset className="space-y-2">
            <legend className="font-medium">Which prizes can they judge?</legend>
            <p className="text-sm text-muted-foreground">Leave these unchecked for all prizes.</p>
            {prizes.map((prize) => (
              <label key={prize.id} className="flex items-center gap-2">
                <Checkbox
                  disabled={busy}
                  checked={prizeIds.includes(prize.id)}
                  onCheckedChange={(checked) => {
                    setPrizeIds((current) =>
                      checked ? [...current, prize.id] : current.filter((id) => id !== prize.id),
                    )
                    invalidate()
                  }}
                />
                {prize.name}
              </label>
            ))}
          </fieldset>
        )}
        {rooms.length > 0 && (
          <fieldset className="space-y-2">
            <legend className="font-medium">Which rooms should they join?</legend>
            <p className="text-sm text-muted-foreground">Leave these unchecked to choose rooms later.</p>
            {rooms.map((room) => (
              <label key={room.id} className="flex items-center gap-2">
                <Checkbox
                  disabled={busy}
                  checked={roomIds.includes(room.id)}
                  onCheckedChange={(checked) => {
                    setRoomIds((current) =>
                      checked ? [...current, room.id] : current.filter((id) => id !== room.id),
                    )
                    invalidate()
                  }}
                />
                {room.name}
              </label>
            ))}
          </fieldset>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? "Checking invitations…" : previewed ? "Send invitations" : "Preview invitations"}
        </Button>
      </form>
      {results.length > 0 && (
        <div aria-live="polite" className="space-y-3">
          {results.map((result) => (
            <div key={result.email} className="rounded-lg border p-3">
              <p className="break-all font-medium">{result.email}</p>
              <p className="text-sm text-muted-foreground">
                {result.delivery === "sent"
                    ? "Email accepted by the provider"
                    : result.message}
              </p>
            </div>
          ))}
          {!previewed &&
            results.some(
              (result) => result.outcome === "failed" || result.delivery === "failed",
            ) && (
              <Button variant="outline" disabled={busy} onClick={() => void run(false, true)}>
                Retry failed invitations
              </Button>
            )}
        </div>
      )}
    </div>
  )
}
