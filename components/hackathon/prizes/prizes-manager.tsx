"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Plus, Pencil, Trash2, Trophy, Loader2, CheckCircle2 } from "lucide-react"

type Prize = {
  id: string
  name: string
  description: string | null
  value: string | null
  displayOrder: number
  createdAt: string
}

type PrizeAssignmentInfo = {
  id: string
  prizeId: string
  prizeName: string
  submissionId: string
  submissionTitle: string
  teamName: string | null
  assignedAt: string
}

type SubmissionOption = {
  id: string
  title: string
}

interface PrizesManagerProps {
  hackathonId: string
  initialPrizes: Prize[]
  initialAssignments: PrizeAssignmentInfo[]
  submissions: SubmissionOption[]
}

type FormState = {
  name: string
  description: string
  value: string
}

const emptyForm: FormState = { name: "", description: "", value: "" }

export function PrizesManager({
  hackathonId,
  initialPrizes,
  initialAssignments,
  submissions,
}: PrizesManagerProps) {
  const [prizes, setPrizes] = useState<Prize[]>(initialPrizes)
  const [assignments, setAssignments] = useState<PrizeAssignmentInfo[]>(initialAssignments)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [assigningPrizeId, setAssigningPrizeId] = useState<string | null>(null)
  const [selectedSubmissions, setSelectedSubmissions] = useState<Record<string, string>>({})

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setError(null)
    setSuccess(false)
    setDialogOpen(true)
  }

  function openEdit(p: Prize) {
    setEditingId(p.id)
    setForm({
      name: p.name,
      description: p.description ?? "",
      value: p.value ?? "",
    })
    setError(null)
    setSuccess(false)
    setDialogOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      value: form.value.trim() || null,
    }

    if (!payload.name) {
      setError("Name is required")
      setSaving(false)
      return
    }

    try {
      if (editingId) {
        const res = await fetch(
          `/api/dashboard/hackathons/${hackathonId}/prizes/${editingId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        )
        if (!res.ok) throw new Error("Failed to update")
        setPrizes((prev) =>
          prev.map((p) =>
            p.id === editingId ? { ...p, ...payload } : p
          )
        )
      } else {
        const res = await fetch(
          `/api/dashboard/hackathons/${hackathonId}/prizes`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...payload, displayOrder: prizes.length }),
          }
        )
        if (!res.ok) throw new Error("Failed to create")
        const data = await res.json()
        setPrizes((prev) => [
          ...prev,
          { id: data.id, ...payload, displayOrder: prizes.length, createdAt: new Date().toISOString() },
        ])
      }
      setSuccess(true)
      setTimeout(() => setDialogOpen(false), 800)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      const res = await fetch(
        `/api/dashboard/hackathons/${hackathonId}/prizes/${id}`,
        { method: "DELETE" }
      )
      if (!res.ok) throw new Error("Failed to delete")
      setPrizes((prev) => prev.filter((p) => p.id !== id))
      setAssignments((prev) => prev.filter((a) => a.prizeId !== id))
    } catch {
      setError("Failed to delete prize")
    } finally {
      setDeletingId(null)
    }
  }

  async function handleAssignPrize(prizeId: string) {
    const selected = selectedSubmissions[prizeId]
    if (!selected) return
    setAssigningPrizeId(prizeId)
    try {
      const res = await fetch(
        `/api/dashboard/hackathons/${hackathonId}/prizes/${prizeId}/assign`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ submissionId: selected }),
        }
      )
      if (!res.ok) throw new Error("Failed to assign")
      const data = await res.json()
      const prize = prizes.find((p) => p.id === prizeId)
      const sub = submissions.find((s) => s.id === selected)
      setAssignments((prev) => [
        ...prev,
        {
          id: data.id,
          prizeId,
          prizeName: prize?.name ?? "",
          submissionId: selected,
          submissionTitle: sub?.title ?? "",
          teamName: null,
          assignedAt: new Date().toISOString(),
        },
      ])
      setSelectedSubmissions((prev) => {
        const next = { ...prev }
        delete next[prizeId]
        return next
      })
    } catch {
      setError("Failed to assign prize")
    } finally {
      setAssigningPrizeId(null)
    }
  }

  async function handleRemoveAssignment(prizeId: string, submissionId: string) {
    try {
      const res = await fetch(
        `/api/dashboard/hackathons/${hackathonId}/prizes/${prizeId}/assign/${submissionId}`,
        { method: "DELETE" }
      )
      if (!res.ok) throw new Error("Failed to remove")
      setAssignments((prev) =>
        prev.filter((a) => !(a.prizeId === prizeId && a.submissionId === submissionId))
      )
    } catch {
      setError("Failed to remove assignment")
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !saving) {
      e.preventDefault()
      handleSubmit(e as unknown as React.FormEvent)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Prizes</h3>
          <p className="text-sm text-muted-foreground">
            Define prizes and assign them to winning submissions
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-2 size-4" />
              Add Prize
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Prize" : "Add Prize"}</DialogTitle>
              <DialogDescription>Add the prize name, value, and winner rules.</DialogDescription>
            </DialogHeader>
            {success ? (
              <div className="flex flex-col items-center gap-3 py-8">
                <CheckCircle2 className="size-10 text-primary" />
                <p className="text-sm font-medium">
                  {editingId ? "Prize updated" : "Prize added"}
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} autoComplete="off" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="prize-name">Name</Label>
                  <Input
                    id="prize-name"
                    name="prize-name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Grand Prize"
                    autoComplete="off"
                    data-1p-ignore
                    data-lpignore="true"
                    data-form-type="other"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="prize-description">Description</Label>
                  <Textarea
                    id="prize-description"
                    name="prize-description"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="What does the winner receive?"
                    rows={2}
                    autoComplete="off"
                    data-1p-ignore
                    data-lpignore="true"
                    data-form-type="other"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="prize-value">Value</Label>
                  <Input
                    id="prize-value"
                    name="prize-value"
                    value={form.value}
                    onChange={(e) => setForm({ ...form, value: e.target.value })}
                    placeholder="e.g. $5,000"
                    autoComplete="off"
                    data-1p-ignore
                    data-lpignore="true"
                    data-form-type="other"
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
                    {editingId ? "Update" : "Add"}
                  </Button>
                </div>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {error && !dialogOpen && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {prizes.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <Trophy className="mx-auto size-8 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">
            No prizes defined yet. Add prizes to reward outstanding submissions.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {prizes.map((p) => {
            const prizeAssignments = assignments.filter((a) => a.prizeId === p.id)
            return (
              <Card key={p.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{p.name}</CardTitle>
                      {p.value && (
                        <Badge variant="secondary" className="mt-1">{p.value}</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(p)}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-destructive"
                            disabled={deletingId === p.id}
                          >
                            {deletingId === p.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="size-3.5" />
                            )}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete &quot;{p.name}&quot;?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete this prize and its assignments.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(p.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                  {p.description && (
                    <p className="text-sm text-muted-foreground mt-1">{p.description}</p>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  {prizeAssignments.length > 0 && (
                    <div className="space-y-2">
                      {prizeAssignments.map((a) => (
                        <div key={a.id} className="flex items-center justify-between rounded-md bg-muted px-3 py-2">
                          <div className="text-sm">
                            <span className="font-medium">{a.submissionTitle}</span>
                            {a.teamName && (
                              <span className="text-muted-foreground"> by {a.teamName}</span>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-destructive"
                            onClick={() => handleRemoveAssignment(a.prizeId, a.submissionId)}
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Select value={selectedSubmissions[p.id] ?? ""} onValueChange={(v) => setSelectedSubmissions((prev) => ({ ...prev, [p.id]: v }))}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select submission..." />
                      </SelectTrigger>
                      <SelectContent>
                        {submissions.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!selectedSubmissions[p.id] || assigningPrizeId === p.id}
                      onClick={() => handleAssignPrize(p.id)}
                    >
                      {assigningPrizeId === p.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        "Assign"
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
