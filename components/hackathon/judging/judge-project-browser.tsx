"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import type { ReviewProject } from "@/lib/utils/judging-review"
import { ProjectReviewContent } from "./project-review-content"

export function JudgeProjectBrowser({ projects }: { projects: ReviewProject[] }) {
  const [query,setQuery] = useState("")
  const visible = projects.filter((project) => `${project.submissionTitle} ${project.teamName ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()))
  return <div className="space-y-4"><Input aria-label="Search projects" placeholder="Find a project…" value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off" data-1p-ignore data-lpignore="true" data-form-type="other" /><p role="status" className="text-sm text-muted-foreground">{visible.length} projects</p><div className="grid items-start gap-4 md:grid-cols-2">{visible.map((project) => <Card key={project.submissionId}><CardContent><div className="py-4"><ProjectReviewContent project={project} /></div></CardContent></Card>)}</div>{visible.length === 0 && <p className="text-sm text-muted-foreground">No projects match your search.</p>}</div>
}
