"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { cn } from "@/lib/utils"
import { assertOk } from "@/lib/utils/fetch"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardAction,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { EventTimer } from "@/components/hackathon/event-timer"
import {
  Plus,
  Pencil,
  Trash2,
  Timer,
  TimerOff,
  Pause,
  Play,
  DoorOpen,
  Check,
} from "lucide-react"

type RoomTeamInfo = {
  id: string
  room_id: string
  team_id: string
  has_presented: boolean
  present_order: number | null
  team_name: string
}

type Room = {
  id: string
  hackathon_id: string
  name: string
  display_order: number
  timer_ends_at: string | null
  timer_remaining_ms: number | null
  timer_label: string | null
  created_at: string
  teamCount: number
  presentedCount: number
  teams: RoomTeamInfo[]
}

interface RoomsTabProps {
  hackathonId: string
}

function formatPausedTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (n: number) => n.toString().padStart(2, "0")
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`
  return `${pad(minutes)}:${pad(seconds)}`
}

export function RoomsTab({ hackathonId }: RoomsTabProps) {
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [roomDialogOpen, setRoomDialogOpen] = useState(false)
  const [editingRoom, setEditingRoom] = useState<Room | null>(null)
  const [roomName, setRoomName] = useState("")

  const [timerDialogOpen, setTimerDialogOpen] = useState(false)
  const [timerRoomId, setTimerRoomId] = useState<string | null>(null)
  const [timerMinutes, setTimerMinutes] = useState<number | null>(null)
  const [customMinutes, setCustomMinutes] = useState("")
  const [timerLabel, setTimerLabel] = useState("")

  const pendingMutationsRef = useRef(0)

  const fetchRooms = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboard/hackathons/${hackathonId}/rooms`)
      if (!res.ok) throw new Error("Failed to fetch rooms")
      const data = await res.json()
      setRooms(data.rooms ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load rooms")
    } finally {
      setLoading(false)
    }
  }, [hackathonId])

  useEffect(() => {
    fetchRooms()
  }, [fetchRooms])

  function openCreate() {
    setEditingRoom(null)
    setRoomName("")
    setError(null)
    setRoomDialogOpen(true)
  }

  function openEdit(room: Room) {
    setEditingRoom(room)
    setRoomName(room.name)
    setError(null)
    setRoomDialogOpen(true)
  }

  const DURATION_PRESETS = [
    { label: "3 min", minutes: 3 },
    { label: "5 min", minutes: 5 },
    { label: "10 min", minutes: 10 },
    { label: "15 min", minutes: 15 },
    { label: "30 min", minutes: 30 },
    { label: "1 hr", minutes: 60 },
  ]

  function openTimer(roomId: string, room: Room) {
    setTimerRoomId(roomId)
    setTimerMinutes(null)
    setCustomMinutes("")
    setTimerLabel(room.timer_label ?? "")
    setError(null)
    setTimerDialogOpen(true)
  }

  async function handleRoomSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = roomName.trim()
    if (!trimmed) {
      setError("Name is required")
      return
    }

    setError(null)
    setRoomDialogOpen(false)
    pendingMutationsRef.current++

    if (editingRoom) {
      const prevName = editingRoom.name
      setRooms((prev) =>
        prev.map((r) => (r.id === editingRoom.id ? { ...r, name: trimmed } : r))
      )
      try {
        const updated = await fetch(
          `/api/dashboard/hackathons/${hackathonId}/rooms/${editingRoom.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: trimmed }),
          }
        ).then(assertOk<Room>)
        setRooms((prev) =>
          prev.map((r) => (r.id === editingRoom.id ? { ...r, ...updated } : r))
        )
      } catch (err) {
        setRooms((prev) =>
          prev.map((r) => (r.id === editingRoom.id ? { ...r, name: prevName } : r))
        )
        setError(err instanceof Error ? err.message : "Failed to update room")
      } finally {
        pendingMutationsRef.current--
      }
    } else {
      const tempId = `temp-${crypto.randomUUID()}`
      const tempRoom: Room = {
        id: tempId,
        hackathon_id: hackathonId,
        name: trimmed,
        display_order: rooms.length,
        timer_ends_at: null,
        timer_remaining_ms: null,
        timer_label: null,
        created_at: new Date().toISOString(),
        teamCount: 0,
        presentedCount: 0,
        teams: [],
      }
      setRooms((prev) => [...prev, tempRoom])
      try {
        const created = await fetch(
          `/api/dashboard/hackathons/${hackathonId}/rooms`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: trimmed, displayOrder: rooms.length }),
          }
        ).then(assertOk<Room>)
        setRooms((prev) =>
          prev.map((r) =>
            r.id === tempId
              ? { ...created, teamCount: 0, presentedCount: 0, teams: [] }
              : r
          )
        )
      } catch (err) {
        setRooms((prev) => prev.filter((r) => r.id !== tempId))
        setError(err instanceof Error ? err.message : "Failed to create room")
      } finally {
        pendingMutationsRef.current--
      }
    }
  }

  async function handleDelete(roomId: string) {
    const removed = rooms.find((r) => r.id === roomId)
    setRooms((prev) => prev.filter((r) => r.id !== roomId))
    try {
      await fetch(
        `/api/dashboard/hackathons/${hackathonId}/rooms/${roomId}`,
        { method: "DELETE" }
      ).then(assertOk)
    } catch {
      if (removed) setRooms((prev) => [...prev, removed])
      setError("Failed to delete room")
    }
  }

  async function submitTimer(minutes: number) {
    if (!timerRoomId || minutes <= 0) return

    setError(null)
    const endsAt = new Date(Date.now() + minutes * 60_000).toISOString()
    const label = timerLabel.trim() || null
    const roomId = timerRoomId

    setRooms((prev) =>
      prev.map((r) =>
        r.id === roomId
          ? { ...r, timer_ends_at: endsAt, timer_remaining_ms: null, timer_label: label }
          : r
      )
    )
    setTimerDialogOpen(false)

    try {
      const updated = await fetch(
        `/api/dashboard/hackathons/${hackathonId}/rooms/${roomId}/timer`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endsAt,
            label: label || undefined,
          }),
        }
      ).then(assertOk<{ timer_ends_at: string | null; timer_label: string | null }>)
      setRooms((prev) =>
        prev.map((r) =>
          r.id === roomId
            ? { ...r, timer_ends_at: updated.timer_ends_at, timer_label: updated.timer_label }
            : r
        )
      )
    } catch (err) {
      setRooms((prev) =>
        prev.map((r) =>
          r.id === roomId
            ? { ...r, timer_ends_at: null, timer_remaining_ms: null, timer_label: null }
            : r
        )
      )
      setError(err instanceof Error ? err.message : "Failed to set timer")
    }
  }

  async function handleTimerSubmit(e: React.FormEvent) {
    e.preventDefault()
    const mins = timerMinutes ?? (customMinutes ? parseInt(customMinutes, 10) : 0)
    if (!mins || mins <= 0) {
      setError("Select a duration or enter custom minutes")
      return
    }
    await submitTimer(mins)
  }

  async function handleClearTimer(roomId: string) {
    const prev = rooms.find((r) => r.id === roomId)
    setRooms((rs) =>
      rs.map((r) =>
        r.id === roomId ? { ...r, timer_ends_at: null, timer_remaining_ms: null, timer_label: null } : r
      )
    )
    try {
      await fetch(
        `/api/dashboard/hackathons/${hackathonId}/rooms/${roomId}/timer`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      ).then(assertOk)
    } catch {
      if (prev) {
        setRooms((rs) =>
          rs.map((r) =>
            r.id === roomId
              ? { ...r, timer_ends_at: prev.timer_ends_at, timer_remaining_ms: prev.timer_remaining_ms, timer_label: prev.timer_label }
              : r
          )
        )
      }
      setError("Failed to clear timer")
    }
  }

  async function handlePauseTimer(roomId: string) {
    const prev = rooms.find((r) => r.id === roomId)
    setRooms((rs) =>
      rs.map((r) =>
        r.id === roomId
          ? { ...r, timer_ends_at: null, timer_remaining_ms: r.timer_ends_at ? Math.max(0, new Date(r.timer_ends_at).getTime() - Date.now()) : r.timer_remaining_ms }
          : r
      )
    )
    try {
      const updated = await fetch(
        `/api/dashboard/hackathons/${hackathonId}/rooms/${roomId}/timer/pause`,
        { method: "POST" }
      ).then(assertOk<{ timer_ends_at: string | null; timer_remaining_ms: number | null }>)
      setRooms((rs) =>
        rs.map((r) =>
          r.id === roomId
            ? { ...r, timer_ends_at: updated.timer_ends_at, timer_remaining_ms: updated.timer_remaining_ms }
            : r
        )
      )
    } catch {
      if (prev) {
        setRooms((rs) =>
          rs.map((r) =>
            r.id === roomId
              ? { ...r, timer_ends_at: prev.timer_ends_at, timer_remaining_ms: prev.timer_remaining_ms }
              : r
          )
        )
      }
      setError("Failed to pause timer")
    }
  }

  async function handleResumeTimer(roomId: string) {
    const prev = rooms.find((r) => r.id === roomId)
    const remaining = prev?.timer_remaining_ms
    setRooms((rs) =>
      rs.map((r) =>
        r.id === roomId
          ? { ...r, timer_ends_at: remaining ? new Date(Date.now() + remaining).toISOString() : r.timer_ends_at, timer_remaining_ms: null }
          : r
      )
    )
    try {
      const updated = await fetch(
        `/api/dashboard/hackathons/${hackathonId}/rooms/${roomId}/timer/resume`,
        { method: "POST" }
      ).then(assertOk<{ timer_ends_at: string | null; timer_remaining_ms: number | null }>)
      setRooms((rs) =>
        rs.map((r) =>
          r.id === roomId
            ? { ...r, timer_ends_at: updated.timer_ends_at, timer_remaining_ms: updated.timer_remaining_ms }
            : r
        )
      )
    } catch {
      if (prev) {
        setRooms((rs) =>
          rs.map((r) =>
            r.id === roomId
              ? { ...r, timer_ends_at: prev.timer_ends_at, timer_remaining_ms: prev.timer_remaining_ms }
              : r
          )
        )
      }
      setError("Failed to resume timer")
    }
  }

  async function handleTogglePresented(
    roomId: string,
    teamId: string,
    presented: boolean
  ) {
    setRooms((prev) =>
      prev.map((r) => {
        if (r.id !== roomId) return r
        const teams = r.teams.map((t) =>
          t.team_id === teamId ? { ...t, has_presented: presented } : t
        )
        return {
          ...r,
          teams,
          presentedCount: teams.filter((t) => t.has_presented).length,
        }
      })
    )
    try {
      await fetch(
        `/api/dashboard/hackathons/${hackathonId}/rooms/${roomId}/teams/${teamId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ presented }),
        }
      ).then(assertOk)
    } catch {
      setRooms((prev) =>
        prev.map((r) => {
          if (r.id !== roomId) return r
          const teams = r.teams.map((t) =>
            t.team_id === teamId ? { ...t, has_presented: !presented } : t
          )
          return {
            ...r,
            teams,
            presentedCount: teams.filter((t) => t.has_presented).length,
          }
        })
      )
      setError("Failed to update presentation status")
    }
  }

  function handleRoomKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault()
      handleRoomSubmit(e as unknown as React.FormEvent)
    }
  }

  function handleTimerKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault()
      handleTimerSubmit(e as unknown as React.FormEvent)
    }
  }

  if (loading) {
    return <div className="h-64 rounded-lg bg-muted animate-pulse" />
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold">Rooms</h3>
          <p className="text-sm text-muted-foreground">
            Organize teams into presentation rooms with timers
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-2 size-4" />
          <span className="hidden sm:inline">Create Room</span>
          <span className="sm:hidden">Add</span>
        </Button>
      </div>

      {error && !roomDialogOpen && !timerDialogOpen && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {rooms.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <DoorOpen className="mx-auto size-8 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">
            No rooms yet. Create rooms to organize team presentations.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.map((room) => (
            <Card key={room.id}>
              <CardHeader>
                <CardTitle className="text-base">{room.name}</CardTitle>
                <CardAction>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => openEdit(room)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Delete &quot;{room.name}&quot;?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete this room and remove all
                            team assignments.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            variant="destructive"
                            onClick={() => handleDelete(room.id)}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardAction>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">
                    {room.teamCount} {room.teamCount === 1 ? "team" : "teams"}
                  </Badge>
                  <Badge
                    variant={
                      room.teamCount > 0 &&
                      room.presentedCount === room.teamCount
                        ? "default"
                        : "outline"
                    }
                  >
                    {room.presentedCount}/{room.teamCount} presented
                  </Badge>
                </div>

                {room.timer_ends_at ? (
                  <div className="rounded-md bg-muted p-3">
                    <EventTimer
                      endsAt={room.timer_ends_at}
                      label={room.timer_label ?? undefined}
                      size="sm"
                    />
                    <div className="mt-2 flex gap-1">
                      <Button
                        variant="ghost"
                        size="xs"
                        className="flex-1"
                        onClick={() => handlePauseTimer(room.id)}
                      >
                        <Pause className="mr-1 size-3" />
                        Pause
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        className="flex-1 text-muted-foreground"
                        onClick={() => handleClearTimer(room.id)}
                      >
                        <TimerOff className="mr-1 size-3" />
                        Clear
                      </Button>
                    </div>
                  </div>
                ) : room.timer_remaining_ms ? (
                  <div className="rounded-md border border-dashed p-3">
                    <div className="flex flex-col items-center gap-1">
                      {room.timer_label && (
                        <span className="text-xs text-muted-foreground">
                          {room.timer_label}
                        </span>
                      )}
                      <span className="font-mono text-lg font-bold text-muted-foreground">
                        {formatPausedTime(room.timer_remaining_ms)}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        Paused
                      </Badge>
                    </div>
                    <div className="mt-2 flex gap-1">
                      <Button
                        variant="ghost"
                        size="xs"
                        className="flex-1"
                        onClick={() => handleResumeTimer(room.id)}
                      >
                        <Play className="mr-1 size-3" />
                        Resume
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        className="flex-1 text-muted-foreground"
                        onClick={() => handleClearTimer(room.id)}
                      >
                        <TimerOff className="mr-1 size-3" />
                        Clear
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => openTimer(room.id, room)}
                  >
                    <Timer className="mr-1.5 size-3.5" />
                    Set Timer
                  </Button>
                )}

                {room.teams.length > 0 && (
                  <div className="space-y-1.5">
                    {room.teams.map((team) => (
                      <div
                        key={team.id}
                        className="flex items-center justify-between rounded-md bg-muted px-3 py-2"
                      >
                        <span
                          className={cn(
                            "text-sm",
                            team.has_presented && "text-muted-foreground"
                          )}
                        >
                          {team.team_name}
                        </span>
                        <Button
                          variant={team.has_presented ? "ghost" : "outline"}
                          size="xs"
                          onClick={() =>
                            handleTogglePresented(
                              room.id,
                              team.team_id,
                              !team.has_presented
                            )
                          }
                        >
                          {team.has_presented ? (
                            <>
                              <Check className="mr-1 size-3" />
                              Presented
                            </>
                          ) : (
                            "Mark Presented"
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={roomDialogOpen} onOpenChange={setRoomDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingRoom ? "Edit Room" : "Create Room"}
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={handleRoomSubmit}
            onKeyDown={handleRoomKeyDown}
            autoComplete="off"
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="room-name">Name</Label>
              <Input
                id="room-name"
                name="room-name"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="e.g. Room A"
                autoFocus
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRoomDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">
                {editingRoom ? "Update" : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={timerDialogOpen} onOpenChange={setTimerDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Room Timer</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={handleTimerSubmit}
            onKeyDown={handleTimerKeyDown}
            autoComplete="off"
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>Duration</Label>
              <div className="grid grid-cols-3 gap-2">
                {DURATION_PRESETS.map((preset) => (
                  <Button
                    key={preset.minutes}
                    type="button"
                    variant={timerMinutes === preset.minutes ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setTimerMinutes(preset.minutes)
                      setCustomMinutes("")
                      setError(null)
                    }}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  id="custom-minutes"
                  name="custom-minutes"
                  type="number"
                  min="1"
                  max="480"
                  value={customMinutes}
                  onChange={(e) => {
                    setCustomMinutes(e.target.value)
                    setTimerMinutes(null)
                    setError(null)
                  }}
                  placeholder="Custom minutes"
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                  data-form-type="other"
                />
                <span className="text-sm text-muted-foreground shrink-0">min</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="timer-label">Label (optional)</Label>
              <Input
                id="timer-label"
                name="timer-label"
                value={timerLabel}
                onChange={(e) => setTimerLabel(e.target.value)}
                placeholder="e.g. Presentation Time"
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setTimerDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!timerMinutes && !customMinutes}>
                Start Timer
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
