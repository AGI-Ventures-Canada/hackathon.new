"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import type { JudgingSetup } from "@/lib/judging/setup"
import type { JudgeBatchResult } from "@/lib/services/judging-invite-batch"
import { formatJudgingTime } from "@/lib/utils/judging-datetime"
import { assertOkJson } from "@/lib/utils/fetch"

export function JudgingInvitationStatus({
  setup,
  failedOnly = false,
  onSaved,
}: {
  setup: JudgingSetup
  failedOnly?: boolean
  onSaved: () => void
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const invitations = setup.invitations.filter(
    (invite) => !failedOnly || invite.delivery === "failed",
  )
  async function send(email: string, retry: boolean) {
    if (busy) return
    setBusy(email)
    setError(null)
    setNotice(null)
    try {
      const data = await fetch(
        `/api/dashboard/hackathons/${setup.id}/judging/judges/${retry ? "batch" : "remind"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            emails: [email],
            requestKey: crypto.randomUUID(),
            ...(retry ? { retryFailed: true, preview: false } : {}),
          }),
        },
      ).then(assertOkJson<{ results: JudgeBatchResult[] }>)
      setNotice(
        data.results
          .map((result) =>
            result.delivery === "sent"
              ? `${result.email}: Email accepted by the provider.`
              : result.message,
          )
          .join(" "),
      )
      router.refresh()
      onSaved()
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Couldn't update this invitation. Try again.",
      )
    } finally {
      setBusy(null)
    }
  }
  if (!invitations.length) return null
  return (
    <div className="space-y-3">
      {failedOnly && <h3 className="font-semibold">Invitations that need another try</h3>}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      {invitations.map((invite) => (
        <Card key={invite.id}>
          <CardContent className="pt-4 space-y-2">
            <div className="flex flex-wrap justify-between gap-3">
              <p className="break-all font-medium">{invite.email}</p>
              <Badge variant="outline">Invited</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {invite.delivery === "sent"
                ? "Email accepted by the provider"
                : invite.delivery === "failed"
                  ? "Email couldn't be sent"
                  : invite.delivery === "queued"
                    ? "Will send when the event is live"
                    : "Waiting for the email provider"}
            </p>
            {invite.delivery === "failed" && (
              <>
                {invite.deliveryError && <p className="text-sm">{invite.deliveryError}</p>}
                {invite.nextAttemptAt && (
                  <p className="text-sm text-muted-foreground">
                    Next automatic try:{" "}
                    {formatJudgingTime(invite.nextAttemptAt, setup.settings.timezone)}
                  </p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!!busy || !invite.canRetry}
                  onClick={() => void send(invite.email, true)}
                >
                  {busy === invite.email ? "Retrying…" : "Retry invitation"}
                </Button>
              </>
            )}
            {invite.delivery === "sent" && (
              <>
                {invite.nextReminderAt && !invite.canRemind && (
                  <p className="text-sm text-muted-foreground">
                    You can remind them again after{" "}
                    {formatJudgingTime(invite.nextReminderAt, setup.settings.timezone)}
                  </p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!!busy || !invite.canRemind}
                  onClick={() => void send(invite.email, false)}
                >
                  {busy === invite.email ? "Sending…" : "Remind judge"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
