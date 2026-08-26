"use client"

import { useState, useCallback, useEffect } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Loader2, Mail, Clock, X, Send } from "lucide-react"
import { normalizeUrl } from "@/lib/utils/url"
import { useActionItemsOptional } from "@/components/hackathon/manage/action-items-context"
import { useIsClient } from "@/hooks/use-is-client"

export type Reminder = {
  id: string
  type: string
  scheduledFor: string
  sentAt: string | null
  cancelledAt: string | null
  recipientFilter: string
  createdAt: string
}

const REMINDER_LABELS: Record<string, { label: string; description: string }> = {
  prize_claim: { label: "Prize Claim Reminder", description: "Reminds winners to claim their prizes" },
  organizer_fulfillment: { label: "Fulfillment Reminder", description: "Reminds organizers about unfulfilled prizes" },
  feedback_followup: { label: "Feedback Follow-up", description: "Reminds participants to share feedback" },
}

function formatReminderDate(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleDateString(timeZone ? "en-US" : undefined, {
    timeZone,
  })
}

export function ReminderStatus({ reminder }: { reminder: Reminder }) {
  const isClient = useIsClient()
  if (reminder.sentAt) return <Badge variant="default">Sent</Badge>
  if (reminder.cancelledAt) return <Badge variant="secondary">Cancelled</Badge>
  const isPast = isClient && new Date(reminder.scheduledFor) < new Date()
  if (isPast) return <Badge variant="outline">Pending</Badge>
  return <Badge variant="outline">Scheduled</Badge>
}

export function ReminderDateLabel({ reminder }: { reminder: Reminder }) {
  const isClient = useIsClient()
  const displayTimeZone = isClient ? undefined : "UTC"

  if (reminder.sentAt) {
    return <>Sent {formatReminderDate(reminder.sentAt, displayTimeZone)}</>
  }
  if (reminder.cancelledAt) return <>Cancelled</>
  return <>Scheduled for {formatReminderDate(reminder.scheduledFor, displayTimeZone)}</>
}

export function PostEventPanel({
  hackathonId,
  feedbackSurveySentAt,
  feedbackSurveyUrl,
  initialReminders,
}: {
  hackathonId: string
  feedbackSurveySentAt: string | null
  feedbackSurveyUrl: string | null
  initialReminders: Reminder[]
}) {
  const [surveyUrl, setSurveyUrl] = useState(feedbackSurveyUrl ?? "")
  const [sending, setSending] = useState(false)
  const [surveySent, setSurveySent] = useState(!!feedbackSurveySentAt)
  const [surveyResult, setSurveyResult] = useState<{ sent: number; failed: number } | null>(null)
  const [reminders, setReminders] = useState(initialReminders)
  const [processingReminder, setProcessingReminder] = useState<string | null>(null)

  const actionItemsCtx = useActionItemsOptional()
  useEffect(() => {
    if (!actionItemsCtx) return
    const { registerTabAction, unregisterTabAction } = actionItemsCtx
    registerTabAction("feedback-survey-not-sent", () => {
      document.getElementById("survey-url")?.focus()
    })
    return () => {
      unregisterTabAction("feedback-survey-not-sent")
    }
  }, [actionItemsCtx])

  const refreshReminders = useCallback(async () => {
    const res = await fetch(`/api/dashboard/hackathons/${hackathonId}/reminders`)
    if (res.ok) {
      const data = await res.json()
      setReminders(data.reminders)
    }
  }, [hackathonId])

  const handleSendSurvey = async () => {
    if (!surveyUrl.trim()) return
    setSending(true)
    try {
      const res = await fetch(`/api/dashboard/hackathons/${hackathonId}/feedback-survey`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ surveyUrl: normalizeUrl(surveyUrl.trim()) }),
      })
      if (res.ok) {
        const data = await res.json()
        setSurveySent(true)
        setSurveyResult({ sent: data.sent, failed: data.failed })
      }
    } finally {
      setSending(false)
    }
  }

  const handleCancelReminder = async (reminderId: string) => {
    setProcessingReminder(reminderId)
    try {
      const res = await fetch(`/api/dashboard/hackathons/${hackathonId}/reminders/${reminderId}`, {
        method: "DELETE",
      })
      if (res.ok) {
        await refreshReminders()
      }
    } finally {
      setProcessingReminder(null)
    }
  }

  const handleSendReminder = async (reminderId: string) => {
    setProcessingReminder(reminderId)
    try {
      const res = await fetch(`/api/dashboard/hackathons/${hackathonId}/reminders/${reminderId}/send`, {
        method: "POST",
      })
      if (res.ok) {
        await refreshReminders()
      }
    } finally {
      setProcessingReminder(null)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Feedback Survey
          </CardTitle>
          <CardDescription>
            Send a feedback survey to all participants
          </CardDescription>
        </CardHeader>
        <CardContent>
          {surveySent ? (
            <div className="space-y-2">
              <Badge variant="default">Sent</Badge>
              {surveyResult && (
                <p className="text-sm text-muted-foreground">
                  {surveyResult.sent} sent, {surveyResult.failed} failed
                </p>
              )}
              {feedbackSurveyUrl && (
                <p className="text-sm text-muted-foreground">
                  Survey URL: {feedbackSurveyUrl}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="survey-url">Survey URL</Label>
                <Input
                  id="survey-url"
                  type="text"
                  inputMode="url"
                  value={surveyUrl}
                  onChange={(e) => setSurveyUrl(e.target.value)}
                  placeholder="forms.google.com/your-survey"
                  name="survey-url"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-1p-ignore
                  data-lpignore="true"
                  data-form-type="other"
                />
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button disabled={!surveyUrl.trim() || sending}>
                    {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Send Feedback Survey
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Send feedback survey?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will email a survey link to all participants. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleSendSurvey}>
                      Send to All Participants
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </CardContent>
      </Card>

      {reminders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Scheduled Reminders
            </CardTitle>
            <CardDescription>
              Automated reminders scheduled after results publication
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {reminders.map((reminder) => {
                const config = REMINDER_LABELS[reminder.type] ?? {
                  label: reminder.type,
                  description: "",
                }
                const isActive = !reminder.sentAt && !reminder.cancelledAt
                const isProcessing = processingReminder === reminder.id
                return (
                  <div
                    key={reminder.id}
                    className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{config.label}</span>
                        <ReminderStatus reminder={reminder} />
                      </div>
                      <p className="text-sm text-muted-foreground">{config.description}</p>
                      <p className="text-xs text-muted-foreground">
                        <ReminderDateLabel reminder={reminder} />
                      </p>
                    </div>
                    {isActive && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSendReminder(reminder.id)}
                          disabled={isProcessing}
                        >
                          {isProcessing ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          ) : (
                            <Send className="mr-1 h-3 w-3" />
                          )}
                          <span className="hidden sm:inline">Send Now</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCancelReminder(reminder.id)}
                          disabled={isProcessing}
                        >
                          <X className="mr-1 h-3 w-3" />
                          <span className="hidden sm:inline">Cancel</span>
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
