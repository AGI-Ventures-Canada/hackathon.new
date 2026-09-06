"use client"

import Link from "next/link"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { assertOkJson } from "@/lib/utils/fetch"
import type { JudgingSetup, JudgingDestination, JudgingEditor } from "@/lib/judging/setup"
import { judgingHref } from "@/lib/judging/setup"
import { formatJudgingTime } from "@/lib/utils/judging-datetime"
import { JudgingEditorContent, JUDGING_EDITOR_LABELS } from "./judging-setup-editors"
import { JudgingInbox } from "./judging-inbox"
import { JudgingInvitationStatus } from "./judging-invitation-status"
import { JudgingSetupWebMcpTools } from "./judging-setup-webmcp-tools"

const steps: JudgingEditor[] = ["prizes", "scorecard", "judges", "schedule", "assignments"]

export function JudgingOrganizerWorkspace({
  initialSetup,
  destination,
  initialEditor,
}: {
  initialSetup: JudgingSetup
  destination: JudgingDestination
  initialEditor?: JudgingEditor
}) {
  const router = useRouter()
  const [loadedSetup, setSetup] = useState({ source: initialSetup, value: initialSetup })
  const setup = loadedSetup.source === initialSetup ? loadedSetup.value : initialSetup
  const [editor, setEditor] = useState<JudgingEditor | null>(
    initialEditor ?? (destination === "judges" ? "judges" : null),
  )
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const total = setup.progress.totalAssignments
  const finished = setup.progress.completedAssignments
  const current = editor ? steps.indexOf(editor) : -1
  const next = setup.readiness.issues[0]?.editor
  async function reload() {
    try {
      const data = await fetch(`/api/dashboard/hackathons/${setup.id}/judging/setup`).then(
        assertOkJson<{ setup: JudgingSetup }>,
      )
      setSetup({ source: initialSetup, value: data.setup })
      setNotice("Saved. Choose your next task below.")
      window.dispatchEvent(new Event("judging-progress-changed"))
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't refresh judging.")
    }
  }
  return (
    <div className="space-y-6" data-webmcp-section={`judging_${destination}`}>
      <h1 className="break-words text-2xl font-semibold">{setup.name}</h1>
      <JudgingSetupWebMcpTools hackathonId={setup.id} slug={setup.slug} />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}
      {destination === "overview" && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Judges</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{setup.judges.length}</p>
                <p className="text-sm text-muted-foreground">
                  accepted · {setup.invitations.length} invited
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Reviews</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p>
                  {finished} of {total} finished
                </p>
                <Progress value={total ? (finished / total) * 100 : 0} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Judging deadline</CardTitle>
              </CardHeader>
              <CardContent>
                <p>{formatJudgingTime(setup.settings.closesAt, setup.settings.timezone)}</p>
                <p className="text-sm text-muted-foreground">{setup.settings.timezone}</p>
                <Button variant="link" onClick={() => setEditor("schedule")}>
                  Edit dates
                </Button>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>
                {setup.readiness.isReady ? "You're ready for judging" : "Get ready for judging"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Set up prizes, a scorecard, judges, dates, and project assignments.
              </p>
              {next && (
                <Button onClick={() => setEditor(next)}>{JUDGING_EDITOR_LABELS[next]}</Button>
              )}
              <div className="space-y-2">
                {setup.readiness.issues.map((issue) => (
                  <div
                    key={issue.code}
                    className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <p className="text-sm">{issue.message}</p>
                    <Button variant="outline" size="sm" onClick={() => setEditor(issue.editor)}>
                      Fix this<span className="sr-only">: {issue.message}</span>
                    </Button>
                  </div>
                ))}
              </div>
              <Button variant="link" asChild>
                <Link href={judgingHref(setup.slug, "settings")}>Judging settings</Link>
              </Button>
            </CardContent>
          </Card>
          <JudgingInbox hackathonId={setup.id} />
        </>
      )}
      {destination === "settings" && (
        <>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">Set up judging</h2>
            <p className="text-muted-foreground">Start anywhere. Save each step as you go.</p>
          </div>
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {steps.map((step, index) => (
              <li key={step}>
                <Button
                  variant={editor === step ? "secondary" : "outline"}
                  onClick={() => setEditor(step)}
                >
                  <span>{index + 1}.</span> {JUDGING_EDITOR_LABELS[step]}
                </Button>
              </li>
            ))}
          </ol>
          <details className="rounded-lg border p-4">
            <summary className="cursor-pointer font-medium">More judging options</summary>
            <div className="mt-4 flex flex-col items-start gap-3">
              <p className="text-sm text-muted-foreground">
                Score projects, check requirements, sort into groups, pick favorites, or let the
                audience vote. Choose each prize&apos;s method in its editor.
              </p>
              <Button variant="outline" onClick={() => setEditor("prizes")}>
                Prize judging methods
              </Button>
              <Button variant="outline" onClick={() => setEditor("rounds")}>
                Add rounds and choose who moves on
              </Button>
              <Button variant="outline" onClick={() => setEditor("notifications")}>
                Instructions and notifications
              </Button>
            </div>
          </details>
        </>
      )}
      {destination === "judges" && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Who&apos;s judging?</h2>
            <Button onClick={() => setEditor("judges")}>Invite judges</Button>
          </div>
          <div className="space-y-3">
            {setup.judges.map((judge) => (
              <Card key={judge.participantId}>
                <CardContent className="pt-4 space-y-2">
                  <div className="flex flex-wrap justify-between gap-3">
                    <p className="font-medium">{judge.displayName}</p>
                    <Badge variant="secondary">Accepted</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground break-all">{judge.email}</p>
                  <p className="text-sm">
                    {judge.completedCount} finished · {judge.assignmentCount} assigned
                  </p>
                  <Button variant="outline" size="sm" onClick={() => setEditor("assignments")}>
                    Manage projects
                  </Button>
                </CardContent>
              </Card>
            ))}
            <JudgingInvitationStatus setup={setup} onSaved={() => void reload()} />
          </div>
        </>
      )}
      {editor && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <CardTitle>{JUDGING_EDITOR_LABELS[editor]}</CardTitle>
                {current >= 0 && (
                  <p className="text-sm text-muted-foreground">
                    {current + 1} / {steps.length}
                  </p>
                )}
              </div>
              <Button variant="ghost" onClick={() => setEditor(null)}>
                Close
              </Button>
            </div>
            {current >= 0 && <Progress value={((current + 1) / steps.length) * 100} />}
          </CardHeader>
          <CardContent className="space-y-6">
            <JudgingEditorContent
              key={editor}
              setup={setup}
              editor={editor}
              onSaved={() => void reload()}
            />
            {current >= 0 && (
              <div className="flex flex-wrap gap-3">
                {current > 0 && (
                  <Button variant="outline" onClick={() => setEditor(steps[current - 1])}>
                    Previous step
                  </Button>
                )}
                {current < steps.length - 1 && (
                  <Button variant="outline" onClick={() => setEditor(steps[current + 1])}>
                    Next: {JUDGING_EDITOR_LABELS[steps[current + 1]]}
                  </Button>
                )}
                <Button variant="link" onClick={() => setEditor(null)}>
                  Skip to settings
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
