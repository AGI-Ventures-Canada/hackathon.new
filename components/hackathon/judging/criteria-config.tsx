"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown, Loader2, CheckCircle2, AlertTriangle } from "lucide-react"
import type { JudgingMode, CriterionCategory } from "@/lib/db/hackathon-types"

type Criterion = {
  id: string
  name: string
  description: string | null
  maxScore: number
  weight: number
  category: CriterionCategory | null
  displayOrder: number
  createdAt: string
}

interface CriteriaConfigProps {
  hackathonId: string
  judgingMode: JudgingMode
  initialCriteria: Criterion[]
}

type FormState = {
  name: string
  description: string
  maxScore: string
  weight: string
  category: CriterionCategory
}

const emptyForm: FormState = { name: "", description: "", maxScore: "10", weight: "1.0", category: "core" }

export function CriteriaConfig({ hackathonId, judgingMode, initialCriteria }: CriteriaConfigProps) {
  const isRubric = judgingMode === "rubric"
  const [criteria, setCriteria] = useState<Criterion[]>(initialCriteria)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [reorderingId, setReorderingId] = useState<string | null>(null)

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setError(null)
    setSuccess(false)
    setDialogOpen(true)
  }

  function openEdit(c: Criterion) {
    setEditingId(c.id)
    setForm({
      name: c.name,
      description: c.description ?? "",
      maxScore: String(c.maxScore),
      weight: String(c.weight),
      category: c.category ?? "core",
    })
    setError(null)
    setSuccess(false)
    setDialogOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const payload = isRubric
      ? {
          name: form.name.trim(),
          description: form.description.trim() || null,
          category: form.category,
        }
      : {
          name: form.name.trim(),
          description: form.description.trim() || null,
          maxScore: parseInt(form.maxScore) || 10,
          weight: parseFloat(form.weight) || 1.0,
        }

    if (!payload.name) {
      setError("Name is required")
      setSaving(false)
      return
    }

    try {
      if (editingId) {
        const res = await fetch(
          `/api/dashboard/hackathons/${hackathonId}/judging/criteria/${editingId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        )
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || "Failed to update")
        }
        setCriteria((prev) =>
          prev.map((c) =>
            c.id === editingId ? { ...c, ...payload, description: payload.description } : c
          )
        )
      } else {
        const res = await fetch(
          `/api/dashboard/hackathons/${hackathonId}/judging/criteria`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...payload, displayOrder: criteria.length }),
          }
        )
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || "Failed to create")
        }
        const data = await res.json()
        const newCriterion: Criterion = isRubric
          ? {
              id: data.id,
              name: payload.name,
              description: payload.description,
              maxScore: 0,
              weight: 1,
              category: (payload as { category: CriterionCategory }).category,
              displayOrder: criteria.length,
              createdAt: new Date().toISOString(),
            }
          : {
              id: data.id,
              name: payload.name,
              description: payload.description,
              maxScore: (payload as { maxScore: number }).maxScore,
              weight: (payload as { weight: number }).weight,
              category: null,
              displayOrder: criteria.length,
              createdAt: new Date().toISOString(),
            }
        setCriteria((prev) => [...prev, newCriterion])
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
        `/api/dashboard/hackathons/${hackathonId}/judging/criteria/${id}`,
        { method: "DELETE" }
      )
      if (!res.ok) throw new Error("Failed to delete")
      setCriteria((prev) => prev.filter((c) => c.id !== id))
    } catch {
      setError("Failed to delete criteria")
    } finally {
      setDeletingId(null)
    }
  }

  async function handleReorder(id: string, direction: "up" | "down") {
    const idx = criteria.findIndex((c) => c.id === id)
    if (idx === -1) return
    if (direction === "up" && idx === 0) return
    if (direction === "down" && idx === criteria.length - 1) return

    setReorderingId(id)
    const swapIdx = direction === "up" ? idx - 1 : idx + 1
    const newCriteria = [...criteria]
    const temp = newCriteria[idx]
    newCriteria[idx] = newCriteria[swapIdx]
    newCriteria[swapIdx] = temp

    newCriteria[idx].displayOrder = idx
    newCriteria[swapIdx].displayOrder = swapIdx

    setCriteria(newCriteria)

    try {
      await Promise.all([
        fetch(
          `/api/dashboard/hackathons/${hackathonId}/judging/criteria/${newCriteria[idx].id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ displayOrder: idx }),
          }
        ),
        fetch(
          `/api/dashboard/hackathons/${hackathonId}/judging/criteria/${newCriteria[swapIdx].id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ displayOrder: swapIdx }),
          }
        ),
      ])
    } catch {
      setCriteria(criteria)
    } finally {
      setReorderingId(null)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !saving) {
      e.preventDefault()
      handleSubmit(e as unknown as React.FormEvent)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Judging Criteria</h3>
          <p className="text-sm text-muted-foreground">
            Define the scoring rubric for judges
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-2 size-4" />
              Add Criterion
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingId ? "Edit Criterion" : "Add Criterion"}
              </DialogTitle>
              <DialogDescription>Set what judges should look for.</DialogDescription>
            </DialogHeader>
            {success ? (
              <div className="flex flex-col items-center gap-3 py-8">
                <CheckCircle2 className="size-10 text-primary" />
                <p className="text-sm font-medium">
                  {editingId ? "Criterion updated" : "Criterion added"}
                </p>
              </div>
            ) : (
              <form
                onSubmit={handleSubmit}
                onKeyDown={handleKeyDown}
                autoComplete="off"
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="criteria-name">Name</Label>
                  <Input
                    id="criteria-name"
                    name="criteria-name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Innovation"
                    autoComplete="off"
                    autoFocus
                    data-1p-ignore
                    data-lpignore="true"
                    data-form-type="other"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="criteria-description">Description</Label>
                  <Textarea
                    id="criteria-description"
                    name="criteria-description"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="What should judges evaluate?"
                    rows={2}
                    autoComplete="off"
                    data-1p-ignore
                    data-lpignore="true"
                    data-form-type="other"
                  />
                </div>
                {isRubric ? (
                  <div className="flex items-start gap-3 rounded-md border p-3">
                    <Checkbox
                      id="criteria-core"
                      checked={form.category === "core"}
                      onCheckedChange={(checked) =>
                        setForm({ ...form, category: checked ? "core" : "bonus" })
                      }
                      className="mt-0.5"
                    />
                    <div className="flex flex-col gap-0.5">
                      <Label htmlFor="criteria-core" className="cursor-pointer font-medium text-sm">
                        Core criterion
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Counts 2x toward the final score. Uncheck for optional criteria that count 1x.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="criteria-max-score">Max Score</Label>
                      <Input
                        id="criteria-max-score"
                        name="criteria-max-score"
                        type="number"
                        min={1}
                        value={form.maxScore}
                        onChange={(e) => setForm({ ...form, maxScore: e.target.value })}
                        autoComplete="off"
                        data-1p-ignore
                        data-lpignore="true"
                        data-form-type="other"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="criteria-weight">Weight</Label>
                      <Input
                        id="criteria-weight"
                        name="criteria-weight"
                        type="number"
                        min={0}
                        step={0.1}
                        value={form.weight}
                        onChange={(e) => setForm({ ...form, weight: e.target.value })}
                        autoComplete="off"
                        data-1p-ignore
                        data-lpignore="true"
                        data-form-type="other"
                      />
                    </div>
                  </div>
                )}
                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                  >
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

      {criteria.length === 0 && (
        <div className="flex items-start gap-3 rounded-md border border-destructive/50 bg-destructive/10 p-3">
          <AlertTriangle className="size-5 shrink-0 text-destructive mt-0.5" />
          <div className="text-sm text-destructive">
            <p className="font-medium">No criteria defined</p>
            <p className="text-destructive/80">
              Judges won&apos;t be able to score submissions until you add at least one criterion.
            </p>
          </div>
        </div>
      )}

      {criteria.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No criteria defined yet. Add criteria to create a scoring rubric for judges.
          </p>
        </div>
      ) : isRubric ? (
        <div className="space-y-3">
          {criteria.map((c, idx) => (
            <div key={c.id} className="rounded-lg border">
              <div className="flex items-center gap-2 p-3">
                <div className="flex flex-col shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    disabled={idx === 0 || reorderingId !== null}
                    onClick={() => handleReorder(c.id, "up")}
                  >
                    <ChevronUp className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    disabled={idx === criteria.length - 1 || reorderingId !== null}
                    onClick={() => handleReorder(c.id, "down")}
                  >
                    <ChevronDown className="size-3.5" />
                  </Button>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{c.name}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      {(c.category ?? "core") === "core" ? "Core · 2x" : "Optional · 1x"}
                    </span>
                  </div>
                  {c.description && (
                    <p className="text-sm text-muted-foreground mt-0.5 truncate">{c.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => openEdit(c)}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-destructive"
                        disabled={deletingId === c.id}
                      >
                        {deletingId === c.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="size-3.5" />
                        )}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete &quot;{c.name}&quot;?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete this criterion and any associated scores. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(c.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-[100px] text-right">Max Score</TableHead>
                <TableHead className="w-[80px] text-right">Weight</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {criteria.map((c, idx) => (
                <TableRow key={c.id}>
                  <TableCell className="py-1">
                    <div className="flex flex-col">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6"
                        disabled={idx === 0 || reorderingId !== null}
                        onClick={() => handleReorder(c.id, "up")}
                      >
                        <ChevronUp className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6"
                        disabled={idx === criteria.length - 1 || reorderingId !== null}
                        onClick={() => handleReorder(c.id, "down")}
                      >
                        <ChevronDown className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
                    {c.description || "—"}
                  </TableCell>
                  <TableCell className="text-right">{c.maxScore}</TableCell>
                  <TableCell className="text-right">{c.weight}x</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => openEdit(c)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-destructive"
                            disabled={deletingId === c.id}
                          >
                            {deletingId === c.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="size-3.5" />
                            )}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete &quot;{c.name}&quot;?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete this criterion and any associated scores. This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(c.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
