/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { Sparkles, MoreHorizontal, Pencil, Trash2, Lock } from "lucide-react"
import type { Skill } from "@/lib/db/hackathon-types"
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
import { assertOk } from "@/lib/utils/fetch"
import { useState } from "react"

interface SkillListProps {
  skills: Skill[]
}

export function SkillList({ skills }: SkillListProps) {
  const router = useRouter()
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())

  const handleDelete = async () => {
    if (!deleteId) return

    const id = deleteId
    setHiddenIds((prev) => new Set(prev).add(id))
    setDeleteId(null)

    try {
      await fetch(`/api/dashboard/skills/${id}`, { method: "DELETE" }).then(assertOk)
      router.refresh()
    } catch {
      setHiddenIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  const visibleSkills = skills.filter((s) => !hiddenIds.has(s.id))

  if (visibleSkills.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Sparkles className="size-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold">No skills yet</h3>
        <p className="text-sm text-muted-foreground max-w-sm mt-1">
          Create your first skill to extend your agents&apos; capabilities
        </p>
      </div>
    )
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Slug</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleSkills.map((skill) => (
            <TableRow key={skill.id}>
              <TableCell>
                <Link
                  href={`/skills/${skill.id}`}
                  className="font-medium hover:underline"
                >
                  {skill.name}
                </Link>
                {skill.description && (
                  <p className="text-sm text-muted-foreground truncate max-w-xs">
                    {skill.description}
                  </p>
                )}
              </TableCell>
              <TableCell>
                <code className="text-sm bg-muted px-1.5 py-0.5 rounded">
                  {skill.slug}
                </code>
              </TableCell>
              <TableCell>
                {skill.is_builtin ? (
                  <Badge variant="secondary">
                    <Lock className="size-3 mr-1" />
                    Built-in
                  </Badge>
                ) : (
                  <Badge variant="outline">Custom</Badge>
                )}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {(() => {
                  const d = new Date(skill.updated_at)
                  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
                })()}
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link href={`/skills/${skill.id}`}>
                        <Pencil className="size-4 mr-2" />
                        {skill.is_builtin ? "View" : "Edit"}
                      </Link>
                    </DropdownMenuItem>
                    {!skill.is_builtin && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setDeleteId(skill.id)}
                        >
                          <Trash2 className="size-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Skill</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this skill? This action cannot be undone.
              Any agents using this skill will need to be updated.
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
    </>
  )
}
