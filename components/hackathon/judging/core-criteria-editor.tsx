"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Pencil } from "lucide-react";
import { assertOk, assertOkJson } from "@/lib/utils/fetch";

export type CoreCriterion = {
  id: string;
  name: string;
  description: string | null;
  weight: number;
  minScore: number;
  maxScore: number;
  displayOrder: number;
};

type DraftRow = {
  name: string;
  description: string;
  weight: string;
  minScore: string;
  maxScore: string;
};

const EMPTY_DRAFT: DraftRow = {
  name: "",
  description: "",
  weight: "",
  minScore: "1",
  maxScore: "10",
};

interface CoreCriteriaEditorProps {
  hackathonId: string;
  criteria: CoreCriterion[];
}

export function CoreCriteriaEditor({
  hackathonId,
  criteria,
}: CoreCriteriaEditorProps) {
  const router = useRouter();
  const [items, setItems] = useState<CoreCriterion[]>(criteria);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<DraftRow>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<DraftRow>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sum = items.reduce((acc, c) => acc + c.weight, 0);

  function startEdit(c: CoreCriterion) {
    setEditingId(c.id);
    setEditDraft({
      name: c.name,
      description: c.description ?? "",
      weight: String(c.weight),
      minScore: String(c.minScore),
      maxScore: String(c.maxScore),
    });
    setError(null);
  }

  function validateDraft(
    d: DraftRow,
  ):
    | {
        ok: true;
        payload: {
          name: string;
          description: string | null;
          weight: number;
          minScore: number;
          maxScore: number;
        };
      }
    | { ok: false; error: string } {
    const name = d.name.trim();
    if (!name) return { ok: false, error: "Name is required" };
    const weight = Number(d.weight);
    if (!Number.isFinite(weight) || weight < 0 || weight > 100) {
      return { ok: false, error: "Weight must be between 0 and 100" };
    }
    const minScore = Number(d.minScore);
    const maxScore = Number(d.maxScore);
    if (!Number.isFinite(minScore) || !Number.isFinite(maxScore)) {
      return { ok: false, error: "Min and max must be numbers" };
    }
    if (minScore < 0) return { ok: false, error: "Min must be 0 or higher" };
    if (!(minScore < maxScore))
      return { ok: false, error: "Min must be less than max" };
    return {
      ok: true,
      payload: {
        name,
        description: d.description.trim() || null,
        weight,
        minScore,
        maxScore,
      },
    };
  }

  async function handleAdd() {
    const result = validateDraft(draft);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const data = await fetch(
        `/api/dashboard/hackathons/${hackathonId}/core-criteria`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(result.payload),
        },
      ).then(assertOkJson<{ criterion: CoreCriterion }>);

      setItems([...items, data.criterion]);
      setDraft(EMPTY_DRAFT);
      setAdding(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveEdit(id: string) {
    const result = validateDraft(editDraft);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const data = await fetch(
        `/api/dashboard/hackathons/${hackathonId}/core-criteria/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(result.payload),
        },
      ).then(assertOkJson<{ criterion: CoreCriterion }>);

      setItems(items.map((c) => (c.id === id ? data.criterion : c)));
      setEditingId(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    setBusy(true);
    setError(null);
    try {
      await fetch(
        `/api/dashboard/hackathons/${hackathonId}/core-criteria/${id}`,
        { method: "DELETE" },
      ).then(assertOk);

      setItems(items.filter((c) => c.id !== id));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setBusy(false);
    }
  }

  function renderRangeInputs(
    d: DraftRow,
    setD: (next: DraftRow) => void,
    idPrefix: string,
    trailing?: ReactNode,
    actions?: ReactNode,
  ) {
    return (
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Score range</Label>
        <p className="text-xs text-muted-foreground">
          The slider judges see runs from this lowest score to highest score.
        </p>
        <div className="flex items-end gap-2">
          <div className="flex flex-col w-20">
            <Label
              htmlFor={`${idPrefix}-min`}
              className="text-xs text-muted-foreground mb-1"
            >
              Lowest
            </Label>
            <Input
              id={`${idPrefix}-min`}
              type="number"
              inputMode="numeric"
              value={d.minScore}
              onChange={(e) => setD({ ...d, minScore: e.target.value })}
              className="text-center"
              autoComplete="off"
            />
          </div>
          <span className="text-muted-foreground pb-2">–</span>
          <div className="flex flex-col w-20">
            <Label
              htmlFor={`${idPrefix}-max`}
              className="text-xs text-muted-foreground mb-1"
            >
              Highest
            </Label>
            <Input
              id={`${idPrefix}-max`}
              type="number"
              inputMode="numeric"
              value={d.maxScore}
              onChange={(e) => setD({ ...d, maxScore: e.target.value })}
              className="text-center"
              autoComplete="off"
            />
          </div>
          {trailing}
          {actions && <div className="ml-auto flex gap-2">{actions}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Core Weighted Categories
          </h4>
          <p className="text-sm text-muted-foreground mt-1">
            Shared scoring criteria applied to every weighted-scoring prize.
            Prize-specific criteria are layered on top.
          </p>
        </div>
        {!adding && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAdding(true)}
          >
            <Plus className="mr-1 size-3.5" />
            Add criterion
          </Button>
        )}
      </div>

      <div className="rounded-md border bg-muted px-3 py-2 text-sm">
        Core total: <span className="font-medium">{sum}%</span>
        <span className="text-muted-foreground">
          {" "}
          · Each prize fills the remaining {Math.max(0, 100 - sum)}%
        </span>
      </div>

      {items.length === 0 && !adding && (
        <p className="text-sm text-muted-foreground italic">
          No core criteria yet.
        </p>
      )}

      <div className="space-y-2">
        {items.map((c) => {
          const isEditing = editingId === c.id;
          if (isEditing) {
            return (
              <div key={c.id} className="rounded-md border p-3 space-y-3">
                <div className="space-y-2">
                  <Input
                    value={editDraft.name}
                    onChange={(e) =>
                      setEditDraft({ ...editDraft, name: e.target.value })
                    }
                    placeholder="Criterion name"
                    autoComplete="off"
                  />
                  <Textarea
                    value={editDraft.description}
                    onChange={(e) =>
                      setEditDraft({
                        ...editDraft,
                        description: e.target.value,
                      })
                    }
                    placeholder="Helper text (optional)"
                    rows={2}
                    autoComplete="off"
                  />
                </div>

                {renderRangeInputs(
                  editDraft,
                  setEditDraft,
                  `core-criterion-edit-${c.id}`,
                  <div className="flex flex-col w-20 ml-2">
                    <Label
                      htmlFor={`core-criterion-edit-${c.id}-weight`}
                      className="text-xs text-muted-foreground mb-1"
                    >
                      Weight %
                    </Label>
                    <Input
                      id={`core-criterion-edit-${c.id}-weight`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={100}
                      value={editDraft.weight}
                      onChange={(e) =>
                        setEditDraft({ ...editDraft, weight: e.target.value })
                      }
                      className="text-center"
                      autoComplete="off"
                    />
                  </div>,
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setEditingId(null)}
                      disabled={busy}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      onClick={() => handleSaveEdit(c.id)}
                      disabled={busy}
                    >
                      Save
                    </Button>
                  </>,
                )}
              </div>
            );
          }
          return (
            <div
              key={c.id}
              className="flex items-start justify-between gap-2 rounded-md border p-3"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium">{c.name}</div>
                {c.description && (
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {c.description}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  Range: {c.minScore}–{c.maxScore}
                </p>
              </div>
              <div className="flex h-8 items-center justify-end w-12 text-sm font-medium tabular-nums">
                {c.weight}%
              </div>
              <div className="flex gap-1 shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => startEdit(c)}
                  aria-label="Edit criterion"
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => handleDelete(c.id)}
                  disabled={busy}
                  aria-label="Remove criterion"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {adding && (
        <div className="rounded-md border p-3 space-y-3">
          <div className="space-y-2">
            <Input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="e.g. Agentic Build Quality"
              autoFocus
              autoComplete="off"
            />
            <Textarea
              value={draft.description}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
              placeholder="Helper text (optional)"
              rows={2}
              autoComplete="off"
            />
          </div>

          {renderRangeInputs(
            draft,
            setDraft,
            "core-criterion-add",
            <div className="flex flex-col w-20 ml-2">
              <Label
                htmlFor="core-criterion-add-weight"
                className="text-xs text-muted-foreground mb-1"
              >
                Weight %
              </Label>
              <Input
                id="core-criterion-add-weight"
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                value={draft.weight}
                onChange={(e) => setDraft({ ...draft, weight: e.target.value })}
                placeholder="%"
                className="text-center"
                autoComplete="off"
              />
            </div>,
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setAdding(false);
                  setDraft(EMPTY_DRAFT);
                  setError(null);
                }}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button type="button" onClick={handleAdd} disabled={busy}>
                Save
              </Button>
            </>,
          )}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
