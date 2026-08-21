"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const frequencies = [
  { value: "once", label: "Once" },
  { value: "hourly", label: "Hourly" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "cron", label: "Custom (Cron)" },
]

const jobTypes = [
  { value: "echo", label: "Echo input" },
  { value: "delay", label: "Delay" },
  { value: "sdk-test", label: "SDK test" },
]

const commonTimezones = [
  { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "Europe/London", label: "London (GMT)" },
  { value: "Europe/Paris", label: "Paris (CET)" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)" },
  { value: "Asia/Shanghai", label: "Shanghai (CST)" },
  { value: "Australia/Sydney", label: "Sydney (AEST)" },
]

export function CreateScheduleButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState("")
  const [frequency, setFrequency] = useState<string>("daily")
  const [cronExpression, setCronExpression] = useState("")
  const [timezone, setTimezone] = useState("UTC")
  const [runTime, setRunTime] = useState("09:00")
  const [jobType, setJobType] = useState("echo")
  const [prompt, setPrompt] = useState("")

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!name.trim() || !jobType || loading) return

    setLoading(true)
    try {
      const response = await fetch("/api/dashboard/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          frequency,
          cronExpression: frequency === "cron" ? cronExpression.trim() : undefined,
          timezone,
          runTime: frequency !== "cron" ? runTime : undefined,
          jobType,
          input: prompt.trim() ? { prompt: prompt.trim() } : undefined,
        }),
      })

      if (response.ok) {
        setOpen(false)
        setName("")
        setFrequency("daily")
        setCronExpression("")
        setTimezone("UTC")
        setRunTime("09:00")
        setJobType("echo")
        setPrompt("")
        router.refresh()
      }
    } finally {
      setLoading(false)
    }
  }

  const isValid = name.trim() && jobType && (frequency !== "cron" || cronExpression.trim())

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4 mr-2" />
          Create Schedule
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <form
          onSubmit={handleSubmit}
          autoComplete="off"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault()
              handleSubmit()
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Create New Schedule</DialogTitle>
            <DialogDescription>
              Pick a job and when it should run.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="Daily sync"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="off"
                data-form-type="other"
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="job-type">Job</Label>
              <Select value={jobType} onValueChange={setJobType}>
                <SelectTrigger id="job-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {jobTypes.map((job) => (
                    <SelectItem key={job.value} value={job.value}>
                      {job.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="frequency">Frequency</Label>
                <Select value={frequency} onValueChange={setFrequency}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {frequencies.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {commonTimezones.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>
                        {tz.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {frequency !== "cron" && frequency !== "once" && (
              <div className="grid gap-2">
                <Label htmlFor="time">Run Time</Label>
                <Input
                  id="time"
                  type="time"
                  value={runTime}
                  onChange={(e) => setRunTime(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Time of day to run (in selected timezone)
                </p>
              </div>
            )}

            {frequency === "cron" && (
              <div className="grid gap-2">
                <Label htmlFor="cron">Cron Expression</Label>
                <Input
                  id="cron"
                  placeholder="0 9 * * 1-5"
                  value={cronExpression}
                  onChange={(e) => setCronExpression(e.target.value)}
                  autoComplete="off"
                  data-form-type="other"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Format: minute hour day-of-month month day-of-week
                </p>
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="prompt">Input (optional)</Label>
              <Textarea
                id="prompt"
                placeholder="Check for updates and send a summary"
                rows={2}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                This text is sent to the job when it runs.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !isValid}>
              {loading ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Schedule"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
