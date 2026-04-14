"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import {
  Clock,
  MoreHorizontal,
  Pencil,
  Trash2,
  Play,
  Pause,
} from "lucide-react"
import type { Schedule } from "@/lib/db/hackathon-types"
import { assertOk } from "@/lib/utils/fetch"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { EditScheduleForm } from "@/components/dashboard/edit-schedule-form"

interface ScheduleListProps {
  schedules: Schedule[]
}

const frequencyLabels: Record<string, string> = {
  once: "Once",
  hourly: "Hourly",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  cron: "Custom (Cron)",
}

export function ScheduleList({ schedules }: ScheduleListProps) {
  const router = useRouter()
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [editSchedule, setEditSchedule] = useState<Schedule | null>(null)
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
  const [localToggles, setLocalToggles] = useState<Map<string, boolean>>(new Map())

  const handleDelete = async () => {
    if (!deleteId) return
    const id = deleteId
    setDeleteId(null)
    setHiddenIds((prev) => new Set(prev).add(id))
    try {
      await fetch(`/api/dashboard/schedules/${id}`, {
        method: "DELETE",
      }).then(assertOk)
      router.refresh()
    } catch {
      setHiddenIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  const handleToggle = async (schedule: Schedule) => {
    const prevValue = localToggles.get(schedule.id) ?? schedule.is_active
    const newValue = !prevValue
    setLocalToggles((prev) => new Map(prev).set(schedule.id, newValue))
    try {
      await fetch(`/api/dashboard/schedules/${schedule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: newValue }),
      }).then(assertOk)
      router.refresh()
    } catch {
      setLocalToggles((prev) => new Map(prev).set(schedule.id, prevValue))
    }
  }

  const formatDate = (date: string | null) => {
    if (!date) return "—"
    const d = new Date(date)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    const hours = String(d.getHours()).padStart(2, "0")
    const minutes = String(d.getMinutes()).padStart(2, "0")
    return `${year}-${month}-${day} ${hours}:${minutes}`
  }

  const visibleSchedules = schedules.filter((s) => !hiddenIds.has(s.id))

  if (visibleSchedules.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Clock className="size-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold">No schedules yet</h3>
        <p className="text-sm text-muted-foreground max-w-sm mt-1">
          Create a schedule to run your agents automatically
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Job Type</TableHead>
            <TableHead>Frequency</TableHead>
            <TableHead>Next Run</TableHead>
            <TableHead>Last Run</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleSchedules.map((schedule) => (
            <TableRow key={schedule.id}>
              <TableCell>
                <div className="font-medium">{schedule.name}</div>
                {schedule.cron_expression && (
                  <code className="text-xs text-muted-foreground">
                    {schedule.cron_expression}
                  </code>
                )}
              </TableCell>
              <TableCell>
                <span className="text-muted-foreground">
                  {schedule.job_type ?? "—"}
                </span>
              </TableCell>
              <TableCell>
                <Badge variant="outline">
                  {frequencyLabels[schedule.frequency] ?? schedule.frequency}
                </Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatDate(schedule.next_run_at)}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatDate(schedule.last_run_at)}
              </TableCell>
              <TableCell>
                {(localToggles.get(schedule.id) ?? schedule.is_active) ? (
                  <Badge variant="default">Active</Badge>
                ) : (
                  <Badge variant="secondary">Paused</Badge>
                )}
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setEditSchedule(schedule)}>
                      <Pencil className="size-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleToggle(schedule)}
                    >
                      {(localToggles.get(schedule.id) ?? schedule.is_active) ? (
                        <>
                          <Pause className="size-4 mr-2" />
                          Pause
                        </>
                      ) : (
                        <>
                          <Play className="size-4 mr-2" />
                          Resume
                        </>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => setDeleteId(schedule.id)}
                    >
                      <Trash2 className="size-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Schedule</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this schedule? This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet open={!!editSchedule} onOpenChange={() => setEditSchedule(null)}>
        <SheetContent className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Edit Schedule</SheetTitle>
            <SheetDescription>
              Update the schedule configuration
            </SheetDescription>
          </SheetHeader>
          {editSchedule && (
            <EditScheduleForm
              schedule={editSchedule}
              onSuccess={() => {
                setEditSchedule(null)
                router.refresh()
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
