"use client"

import { RoundScheduleEditor } from "./round-schedule-editor"
import { ManualJudgingAssignments } from "./manual-judging-assignments"
import { judgingSetupRequestKey } from "@/lib/judging/setup-request"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useJudgingFormDraft } from "@/hooks/use-judging-form-draft"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { assertOkJson } from "@/lib/utils/fetch"
import type { JudgingSetup, JudgingEditor, ConfigureJudgingInput } from "@/lib/judging/setup"
import { suggestedJudgingWindow } from "@/lib/judging/setup"
import { judgingLocalTime, judgingInstant } from "@/lib/utils/judging-datetime"
import type { JudgingDistributionPreview } from "@/lib/judging/distribution-planner"
import { AddPrizeDialog } from "./add-prize-dialog"
import { EditPrizeDialog, type EditablePrize } from "./edit-prize-dialog"
import { CoreCriteriaEditor } from "./core-criteria-editor"
import { RoundsSection } from "./rounds-section"
import { JudgingInviteComposer } from "./judging-invite-composer"
import { JudgingInvitationStatus } from "./judging-invitation-status"
import { JudgingInbox } from "./judging-inbox"

export const JUDGING_EDITOR_LABELS: Record<JudgingEditor, string> = {
  prizes: "What can teams win?",
  scorecard: "What should judges look for?",
  judges: "Who's judging?",
  schedule: "When should they judge?",
  assignments: "Who reviews each project?",
  notifications: "Judging notifications",
  rounds: "Who moves on?",
}

export async function saveJudgingSetup(
  setup: JudgingSetup,
  input: Omit<ConfigureJudgingInput, "expectedVersion" | "requestKey">,
  requestKey?: string,
) {
  const stableKey = requestKey ?? (await judgingSetupRequestKey(setup.id, setup.version, input))
  return fetch(`/api/dashboard/hackathons/${setup.id}/judging/setup`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, expectedVersion: setup.version, requestKey: stableKey }),
  }).then(assertOkJson<{ setup: JudgingSetup }>)
}

export function JudgingScheduleEditor({
  setup,
  onSaved,
}: {
  setup: JudgingSetup
  onSaved: () => void
}) {
  const router = useRouter()
  const [draft, setDraft, clearDraft, recovered] = useJudgingFormDraft(setup.id, "judging-dates", {
    timezone: setup.settings.timezone,
    opens: judgingLocalTime(setup.settings.opensAt, setup.settings.timezone),
    closes: judgingLocalTime(setup.settings.closesAt, setup.settings.timezone),
  })
  const { timezone, opens, closes } = draft
  const setTimezone = (timezone: string) => setDraft((current) => ({ ...current, timezone }))
  const setOpens = (opens: string) => setDraft((current) => ({ ...current, opens }))
  const setCloses = (closes: string) => setDraft((current) => ({ ...current, closes }))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const zones = Intl.supportedValuesOf("timeZone")
  const suggestedRef = useRef(false)
  useEffect(() => {
    if (setup.settings.opensAt || recovered || suggestedRef.current) return
    suggestedRef.current = true
    const suggested = suggestedJudgingWindow(setup.submissionDeadline, new Date())
    setDraft({
      timezone: setup.settings.timezone,
      opens: judgingLocalTime(suggested.opensAt, setup.settings.timezone),
      closes: judgingLocalTime(suggested.closesAt, setup.settings.timezone),
    })
  }, [
    setup.submissionDeadline,
    setup.settings.opensAt,
    setup.settings.timezone,
    recovered,
    setDraft,
  ])
  async function save() {
    setError(null)
    try {
      const opensAt = judgingInstant(opens, timezone),
        closesAt = judgingInstant(closes, timezone)
      if (!opensAt || !closesAt || closesAt <= opensAt)
        throw new Error("Choose an opening time and a later deadline.")
      setBusy(true)
      await saveJudgingSetup(setup, { settings: { opensAt, closesAt, timezone } })
      clearDraft()
      router.refresh()
      onSaved()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't save these dates.")
    } finally {
      setBusy(false)
    }
  }
  return (
    <form
      className="space-y-4"
      autoComplete="off"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault()
          void save()
        }
      }}
    >
      <p className="text-sm text-muted-foreground">
        We suggest two hours after projects close. You can allow more time.
      </p>
      <div className="space-y-2">
        <Label htmlFor="judging-timezone">Time zone</Label>
        <Input
          id="judging-timezone"
          list="judging-timezones"
          value={timezone}
          onChange={(event) => setTimezone(event.target.value)}
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          data-form-type="other"
        />
        <datalist id="judging-timezones">
          <option value="UTC" />
          {zones.map((zone) => (
            <option key={zone} value={zone} />
          ))}
        </datalist>
      </div>
      <div className="space-y-2">
        <Label htmlFor="judging-opens">Judging opens</Label>
        <Input
          id="judging-opens"
          type="datetime-local"
          value={opens}
          onChange={(event) => setOpens(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="judging-closes">Judging deadline</Label>
        <Input
          id="judging-closes"
          type="datetime-local"
          min={opens}
          value={closes}
          onChange={(event) => setCloses(event.target.value)}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        All times above use the selected time zone. Results stay private until you publish them.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button disabled={busy}>{busy ? "Saving dates…" : "Save judging dates"}</Button>
    </form>
  )
}

export function JudgingDistributionEditor({
  setup,
  onSaved,
}: {
  setup: JudgingSetup
  onSaved: () => void
}) {
  const router = useRouter()
  const [target, setTarget] = useState(setup.settings.targetReviewsPerProject)
  const [preview, setPreview] = useState<JudgingDistributionPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [requestKey, setRequestKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  async function run(apply: boolean) {
    setBusy(true)
    setError(null)
    try {
      const key = requestKey ?? crypto.randomUUID()
      if (apply && preview) {
        setRequestKey(key)
        await fetch(`/api/dashboard/hackathons/${setup.id}/judging/distribution/apply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetReviewsPerProject: target,
            expectedVersion: preview.version,
            requestKey: key,
          }),
        }).then(assertOkJson)
        router.refresh()
        onSaved()
      } else {
        const result = await fetch(
          `/api/dashboard/hackathons/${setup.id}/judging/distribution/preview`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ targetReviewsPerProject: target }),
          },
        ).then(assertOkJson<{ preview: JudgingDistributionPreview }>)
        setPreview(result.preview)
        setRequestKey(null)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't assign these projects.")
    } finally {
      setBusy(false)
    }
  }
  const uncovered = preview?.coverage.some((row) => row.assigned + row.planned === 0) ?? false
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="judges-per-project">Judges per project</Label>
        <Input
          id="judges-per-project"
          type="number"
          min={1}
          max={20}
          value={target}
          onChange={(event) => {
            setTarget(Number(event.target.value))
            setPreview(null)
            setRequestKey(null)
          }}
        />
        <p className="text-sm text-muted-foreground">
          We suggest three. Existing reviews stay in place.
        </p>
      </div>
      <Button variant="outline" onClick={() => void run(false)} disabled={busy}>
        Preview assignments
      </Button>
      {preview && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Expected judge workload</caption>
              <thead>
                <tr>
                  <th className="p-2 text-left">Judge</th>
                  <th className="p-2">Assigned</th>
                  <th className="p-2">New</th>
                </tr>
              </thead>
              <tbody>
                {preview.workload.map((row) => (
                  <tr key={row.judgeId}>
                    <td className="p-2">{row.name}</td>
                    <td className="p-2 text-center">{row.existing}</td>
                    <td className="p-2 text-center">{row.added}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm">
            {preview.coverage.filter((row) => row.assigned + row.planned >= row.target).length} of{" "}
            {preview.coverage.length} project and prize pairs reach the target.
          </p>
          {preview.warnings.length > 0 && (
            <ul className="space-y-1 text-sm text-muted-foreground">
              {preview.warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          )}
          {uncovered && (
            <p className="text-sm text-destructive">
              Some projects have no eligible judges. Invite judges or change their scope first.
            </p>
          )}
          <Button
            disabled={busy || uncovered || preview.assignments.length === 0}
            onClick={() => void run(true)}
          >
            {busy ? "Assigning projects…" : `Add ${preview.assignments.length} assignments`}
          </Button>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <details className="rounded-lg border p-4">
        <summary className="cursor-pointer font-medium">Adjust one judge’s projects</summary>
        <div className="mt-4">
          <ManualJudgingAssignments hackathonId={setup.id} judges={setup.judges} />
        </div>
      </details>
    </div>
  )
}

function JudgingScorecardEditor({ setup, onSaved }: { setup: JudgingSetup; onSaved: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const canStart =
    !setup.readiness.scoringLocked &&
    !setup.coreCriteria.length &&
    !setup.rounds.length &&
    setup.prizeCriteria.every((item) => !item.criteria.length)
  async function apply() {
    setBusy(true)
    setError(null)
    try {
      await saveJudgingSetup(setup, { applyStarter: true })
      onSaved()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't save the starter scorecard.")
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Judges answer shared questions once per project. Each prize adds its own questions below.
      </p>
      {setup.readiness.scoringLocked ? (
        <p className="text-sm">Reviews have started. Add a new round to change scoring.</p>
      ) : (
        <CoreCriteriaEditor
          key={setup.id}
          hackathonId={setup.id}
          criteria={setup.coreCriteria}
        />
      )}
      {canStart && (
        <div className="rounded-lg border p-4 space-y-3">
          <p className="font-medium">Start with four simple questions</p>
          <ul className="text-sm space-y-1">
            {["Original idea", "Does it work?", "Easy to use", "Usefulness"].map((name) => (
              <li key={name}>{name} · 0–10 · 25%</li>
            ))}
          </ul>
          <Button disabled={busy} onClick={() => void apply()}>
            {busy ? "Saving scorecard…" : "Use this scorecard"}
          </Button>
        </div>
      )}
      {setup.prizes
        .filter((prize) => prize.judging_style === "weighted_score")
        .map((prize) => {
          const categories = [
            ...setup.coreCriteria,
            ...(setup.prizeCriteria.find((item) => item.prizeId === prize.id)?.criteria ?? []),
          ]
          const total = categories.reduce((sum, category) => sum + category.weight, 0)
          return (
            <div key={prize.id} className="rounded-lg border p-4 space-y-2">
              <h3 className="font-medium">{prize.name}</h3>
              {categories.map((category) => (
                <div key={category.id} className="flex justify-between gap-3 text-sm">
                  <span>{category.name}</span>
                  <span>
                    {category.minScore}–{category.maxScore} · {category.weight}%
                  </span>
                </div>
              ))}
              <p
                className={
                  total === 100 ? "text-sm text-muted-foreground" : "text-sm text-destructive"
                }
              >
                Total: {total}%.{" "}
                {total === 100
                  ? "Higher weighted scores rank first."
                  : "Adjust the weights to reach 100%."}
              </p>
            </div>
          )
        })}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

export function JudgingEditorContent({
  setup,
  editor,
  prizeId,
  onSaved,
}: {
  setup: JudgingSetup
  editor: JudgingEditor
  prizeId?: string
  onSaved: () => void
}) {
  const [addPrize, setAddPrize] = useState(editor === "prizes" && setup.prizes.length === 0)
  const [editPrize, setEditPrize] = useState<EditablePrize | null>(null)
  const [preferences, setPreferences, clearPreferences] = useJudgingFormDraft(
    setup.id,
    "judging-instructions",
    {
      instructions: setup.settings.instructions,
      browse: setup.settings.browseEnabled,
      reminders: setup.settings.remindersEnabled,
    },
  )
  const { instructions, browse, reminders } = preferences
  const setInstructions = (instructions: string) =>
    setPreferences((current) => ({ ...current, instructions }))
  const setBrowse = (browse: boolean) => setPreferences((current) => ({ ...current, browse }))
  const setReminders = (reminders: boolean) =>
    setPreferences((current) => ({ ...current, reminders }))
  const [error, setError] = useState<string | null>(null)
  const visiblePrizes = prizeId ? setup.prizes.filter((prize) => prize.id === prizeId) : setup.prizes
  const rounds = setup.rounds.map((round) => ({ ...round, isActive: round.status === "active" }))
  if (editor === "schedule") return <JudgingScheduleEditor setup={setup} onSaved={onSaved} />
  if (editor === "assignments") return <JudgingDistributionEditor setup={setup} onSaved={onSaved} />
  if (editor === "judges")
    return (
      <div className="space-y-6">
        <JudgingInvitationStatus setup={setup} failedOnly onSaved={onSaved} />
        <JudgingInviteComposer
          hackathonId={setup.id}
          prizes={setup.prizes}
          rooms={setup.rooms}
          onSaved={onSaved}
        />
      </div>
    )
  if (editor === "rounds")
    return (
      <div className="space-y-4">
        <RoundsSection hackathonId={setup.id} rounds={rounds} />
        {setup.rounds.map((round) => (
          <RoundScheduleEditor key={round.id} setup={setup} round={round} onSaved={onSaved} />
        ))}
      </div>
    )
  if (editor === "notifications")
    return (
      <div className="space-y-4">
        <form
          autoComplete="off"
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault()
            setError(null)
            try {
              await saveJudgingSetup(setup, {
                settings: { instructions, browseEnabled: browse, remindersEnabled: reminders },
              })
              clearPreferences()
              onSaved()
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : "Couldn't save settings.")
            }
          }}
        >
          <Label htmlFor="judging-instructions">What should judges know?</Label>
          <Textarea
            id="judging-instructions"
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            maxLength={5000}
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            data-form-type="other"
          />
          <label className="flex items-center gap-2">
            <Checkbox checked={browse} onCheckedChange={(checked) => setBrowse(checked === true)} />
            Let judges browse other projects
          </label>
          <label className="flex items-center gap-2">
            <Checkbox
              checked={reminders}
              onCheckedChange={(checked) => setReminders(checked === true)}
            />
            Send judging reminders by email
          </label>
          <p className="text-sm text-muted-foreground">
            For a two-hour session, unfinished work gets a reminder with one hour left.
          </p>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button>Save preferences</Button>
        </form>
        <JudgingInbox hackathonId={setup.id} />
      </div>
    )
  return (
    <div className="space-y-4">
      {editor === "scorecard" && <JudgingScorecardEditor setup={{ ...setup, prizes: visiblePrizes }} onSaved={onSaved} />}
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-medium">Prizes</h3>
        <Button variant="outline" onClick={() => setAddPrize(true)}>
          Add a prize
        </Button>
      </div>
      {visiblePrizes.map((prize) => (
        <div
          key={prize.id}
          className="rounded-lg border p-4 flex items-start justify-between gap-3"
        >
          <div className="min-w-0">
            <p className="break-words font-medium">{prize.name}</p>
            <p className="text-sm text-muted-foreground">{prize.value || "Add a reward"}</p>
          </div>
          <Button
            variant="outline"
            onClick={() =>
              setEditPrize({
                id: prize.id,
                name: prize.name,
                description: prize.description,
                value: prize.value,
                judgingStyle: prize.judging_style,
                maxPicks: prize.max_picks,
                criteria:
                  setup.prizeCriteria.find((item) => item.prizeId === prize.id)?.criteria ??
                  prize.criteria ??
                  null,
                buckets: prize.buckets ?? null,
              })
            }
          >
            Edit<span className="sr-only"> {prize.name}</span>
          </Button>
        </div>
      ))}
      <AddPrizeDialog
        hackathonId={setup.id}
        open={addPrize}
        onOpenChange={setAddPrize}
        rounds={rounds}
        coreWeightSum={setup.coreCriteria.reduce((sum, item) => sum + item.weight, 0)}
        coreCriteriaCount={setup.coreCriteria.length}
        existingPrizes={setup.prizes}
        onSuccess={onSaved}
      />
      <EditPrizeDialog
        hackathonId={setup.id}
        prize={editPrize}
        onClose={() => setEditPrize(null)}
        onSuccess={onSaved}
        coreWeightSum={setup.coreCriteria.reduce((sum, item) => sum + item.weight, 0)}
      />
    </div>
  )
}

export function JudgingTaskSheet({
  hackathonId,
  editor,
  prizeId,
  onClose,
}: {
  hackathonId: string
  editor: JudgingEditor | null
  prizeId?: string
  onClose: () => void
}) {
  const router = useRouter()
  const [loaded, setLoaded] = useState<{ key: string; setup: JudgingSetup } | null>(null)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const loadKey = `${hackathonId}:${editor}:${prizeId ?? ""}`
  const setup = loaded?.key === loadKey ? loaded.setup : null
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!editor) return
    const controller = new AbortController()
    fetch(`/api/dashboard/hackathons/${hackathonId}/judging/setup`, { signal: controller.signal })
      .then(assertOkJson<{ setup: JudgingSetup }>)
      .then((data) => {
        setLoaded({ key: loadKey, setup: data.setup })
        setError(null)
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : "Couldn't load judging.")
      })
    return () => controller.abort()
  }, [hackathonId, editor, loadKey, refreshVersion])
  return (
    <Sheet
      open={!!editor}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{editor ? JUDGING_EDITOR_LABELS[editor] : "Judging settings"}</SheetTitle>
          <SheetDescription>
            Finish this task here, then return to your Action Items.
          </SheetDescription>
          {setup && (
            <Button variant="link" asChild>
              <Link href={`/e/${setup.slug}/manage/judging/settings`}>Open judging settings</Link>
            </Button>
          )}
        </SheetHeader>
        <div className="p-4 space-y-4">
          {error ? (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          ) : setup && editor ? (
            <JudgingEditorContent
              setup={setup}
              key={loadKey}
              editor={editor}
              prizeId={prizeId}
              onSaved={() => {
                router.refresh()
                if (editor !== "judges") onClose()
                else setRefreshVersion((version) => version + 1)
              }}
            />
          ) : (
            <Skeleton className="h-64 w-full" />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
