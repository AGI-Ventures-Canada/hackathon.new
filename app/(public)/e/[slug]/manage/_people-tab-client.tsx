"use client"

import { useMemo, useState, useSyncExternalStore } from "react"
import { Download, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatDate } from "@/lib/utils/format"
import { ROLE_LABEL, STATUS_LABEL, type Person } from "@/lib/services/hackathon-people-types"

type PeopleTabClientProps = {
  hackathonId: string
  people: Person[]
}

const emptySubscribe = () => () => {}

export function PeopleTabClient({ hackathonId, people }: PeopleTabClientProps) {
  const [query, setQuery] = useState("")
  const isClient = useSyncExternalStore(emptySubscribe, () => true, () => false)
  const csvHref = useMemo(() => {
    const base = `/api/dashboard/hackathons/${hackathonId}/people.csv`
    if (!isClient) return base
    const today = new Date().toLocaleDateString("sv-SE")
    return `${base}?date=${today}`
  }, [hackathonId, isClient])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return people
    return people.filter((p) => {
      const haystack = [p.name ?? "", p.email ?? "", p.teamName ?? "", ROLE_LABEL[p.role]]
        .join(" ")
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [people, query])

  const acceptedCount = people.filter((p) => p.status === "accepted").length
  const pendingCount = people.length - acceptedCount

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Everyone at this event</h2>
          <p className="text-sm text-muted-foreground">
            {acceptedCount} signed up · {pendingCount} invited
          </p>
        </div>
        <a
          href={csvHref}
          download
          className="self-start sm:self-auto"
        >
          <Button variant="outline">
            <Download className="size-4" />
            Export CSV
          </Button>
        </a>
      </div>

      <div className="relative w-full sm:max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, email, or team"
          className="pl-9"
          aria-label="Search people"
        />
      </div>

      {people.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          No one&apos;s signed up yet.
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          No one matches that search.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Team</TableHead>
                <TableHead>Joined / Invited</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    {p.name ?? <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.email ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{ROLE_LABEL[p.role]}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={p.status === "accepted" ? "default" : "outline"}>
                      {STATUS_LABEL[p.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {p.teamName ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span>{p.teamName}</span>
                        {p.isCaptain && (
                          <Badge variant="outline" className="text-xs">
                            Captain
                          </Badge>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(p.joinedOrInvitedAt)}
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
