import Link from "next/link"
import { Clock, Gavel } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type JudgeWorkspaceStateProps = {
  state: "draft" | "before_judging" | "waiting_for_assignments" | "closed"
  eventHref?: string
}

const content = {
  draft: {
    title: "This event isn't live yet",
    description: "You're on the judge list. Your work will show here after the event goes live.",
  },
  before_judging: {
    title: "Judging hasn't started",
    description: "You're all set. Come back when judging opens to see your projects and scoring steps.",
  },
  waiting_for_assignments: {
    title: "No projects are assigned yet",
    description: "You don't need to do anything right now. This page will refresh when the organizer assigns your projects.",
  },
  closed: {
    title: "Judging is closed",
    description: "Judging has ended. You can return to the event page for results and updates.",
  },
} satisfies Record<JudgeWorkspaceStateProps["state"], { title: string; description: string }>

export function JudgeWorkspaceState({ state, eventHref }: JudgeWorkspaceStateProps) {
  const stateContent = content[state]
  const Icon = state === "waiting_for_assignments" ? Gavel : Clock

  return (
    <Card>
      <CardHeader className="items-center text-center">
        <Icon className="size-8 text-muted-foreground" />
        <CardTitle>{stateContent.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-center">
        <p className="text-sm text-muted-foreground">{stateContent.description}</p>
        {eventHref && (
          <Button variant="outline" asChild>
            <Link href={eventHref}>View Event</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
