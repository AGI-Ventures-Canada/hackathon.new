"use client"

import { useCallback, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { parseAddress, formatAddress } from "@/lib/utils/address"
import { Package, Check, Clock, Mail, Eye, EyeOff } from "lucide-react"
import type { PrizeFulfillmentStatus } from "@/lib/db/hackathon-types"
import { useWebMcpTools } from "@/hooks/use-webmcp-tools"
import { assertOk } from "@/lib/utils/fetch"
import { createSponsorFulfillmentTools } from "@/lib/webmcp/sponsor-tools"

type SponsorFulfillment = {
  fulfillmentId: string
  prizeName: string
  prizeValue: string | null
  submissionTitle: string
  teamName: string | null
  status: PrizeFulfillmentStatus
  recipientName: string | null
  recipientEmail: string | null
  shippingAddress: string | null
  paymentMethod: string | null
  paymentDetail: string | null
  trackingNumber: string | null
  claimedAt: string | null
}

const STATUS_CONFIG: Record<PrizeFulfillmentStatus, { label: string; variant: "secondary" | "outline" | "default"; icon: React.ComponentType<{ className?: string }> }> = {
  assigned: { label: "Awaiting Claim", variant: "secondary", icon: Clock },
  contacted: { label: "Contacted", variant: "outline", icon: Mail },
  shipped: { label: "Fulfilled", variant: "default", icon: Check },
  claimed: { label: "Claimed", variant: "default", icon: Package },
}

export function SponsorFulfillmentView({
  hackathonId,
  fulfillments: initialFulfillments,
}: {
  hackathonId: string
  fulfillments: SponsorFulfillment[]
}) {
  const [fulfillments, setFulfillments] = useState(initialFulfillments)
  const [fulfillDialogOpen, setFulfillDialogOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [trackingNumber, setTrackingNumber] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [revealedPayments, setRevealedPayments] = useState<Set<string>>(new Set())
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())

  const openFulfillDialog = useCallback((id: string, preparedTracking = "") => {
    setSelectedId(id)
    setTrackingNumber(preparedTracking)
    setError(null)
    setFulfillDialogOpen(true)
  }, [])

  const webMcpTools = useMemo(
    () => createSponsorFulfillmentTools({
      getFulfillments: () => fulfillments.map((fulfillment) => ({
        id: fulfillment.fulfillmentId,
        prizeName: fulfillment.prizeName,
        prizeValue: fulfillment.prizeValue,
        submissionTitle: fulfillment.submissionTitle,
        teamName: fulfillment.teamName,
        status: fulfillment.status,
      })),
      onPrepare: openFulfillDialog,
    }),
    [fulfillments, openFulfillDialog],
  )
  useWebMcpTools(webMcpTools)

  async function handleMarkFulfilled() {
    if (!selectedId || pendingIds.has(selectedId)) return
    const fulfillmentId = selectedId
    const nextTrackingNumber = trackingNumber.trim() || null
    const previous = fulfillments.find((item) => item.fulfillmentId === fulfillmentId)
    if (!previous || previous.status !== "claimed") return

    setPendingIds((current) => new Set(current).add(fulfillmentId))
    setFulfillments((current) => current.map((item) =>
      item.fulfillmentId === fulfillmentId
        ? { ...item, status: "shipped", trackingNumber: nextTrackingNumber }
        : item
    ))
    setFulfillDialogOpen(false)
    setError(null)

    try {
      await fetch(`/api/dashboard/hackathons/${hackathonId}/sponsor-fulfillments/${fulfillmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackingNumber: nextTrackingNumber ?? undefined }),
      }).then(assertOk)
    } catch {
      setFulfillments((current) => current.map((item) =>
        item.fulfillmentId === fulfillmentId ? previous : item
      ))
      setError("We couldn't mark that prize fulfilled. Try again.")
    } finally {
      setPendingIds((current) => {
        const next = new Set(current)
        next.delete(fulfillmentId)
        return next
      })
    }
  }

  const claimedCount = fulfillments.filter((f) => f.status === "claimed" || f.status === "shipped").length
  const totalCount = fulfillments.length

  if (fulfillments.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Package className="size-10 mx-auto mb-4" />
        <p>No prize assignments for your sponsored tracks yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{claimedCount}/{totalCount} claimed</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Prize</TableHead>
              <TableHead>Winner</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Details</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fulfillments.map((f) => {
              const config = STATUS_CONFIG[f.status]
              const Icon = config.icon
              return (
                <TableRow key={f.fulfillmentId}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{f.prizeName}</p>
                      {f.prizeValue && (
                        <p className="text-sm text-muted-foreground">{f.prizeValue}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {f.recipientName ? (
                      <div>
                        <p className="text-sm">{f.recipientName}</p>
                        {f.recipientEmail && (
                          <p className="text-xs text-muted-foreground">{f.recipientEmail}</p>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        {f.submissionTitle}
                        {f.teamName ? ` (${f.teamName})` : ""}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={config.variant}>
                      <Icon className="mr-1 size-3" />
                      {config.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {f.shippingAddress && (() => {
                      const parsed = parseAddress(f.shippingAddress)
                      const display = parsed ? formatAddress(parsed) : f.shippingAddress
                      return <p className="text-xs text-muted-foreground truncate max-w-48">{display}</p>
                    })()}
                    {f.paymentMethod && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <span>{f.paymentMethod}</span>
                        {f.paymentDetail && (
                          <>
                            <span>: {revealedPayments.has(f.fulfillmentId) ? f.paymentDetail : "••••••••"}</span>
                            <button
                              type="button"
                              onClick={() => setRevealedPayments((prev) => {
                                const next = new Set(prev)
                                if (next.has(f.fulfillmentId)) next.delete(f.fulfillmentId)
                                else next.add(f.fulfillmentId)
                                return next
                              })}
                              className="inline-flex items-center text-muted-foreground hover:text-foreground"
                              aria-label={revealedPayments.has(f.fulfillmentId) ? "Hide payment detail" : "Show payment detail"}
                            >
                              {revealedPayments.has(f.fulfillmentId) ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                            </button>
                          </>
                        )}
                      </p>
                    )}
                    {f.trackingNumber && (
                      <p className="text-xs text-muted-foreground">Tracking: {f.trackingNumber}</p>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {f.status === "claimed" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openFulfillDialog(f.fulfillmentId)}
                        disabled={pendingIds.has(f.fulfillmentId)}
                      >
                        Mark Fulfilled
                      </Button>
                    )}
                    {f.status === "shipped" && (
                      <span className="text-sm text-muted-foreground">Fulfilled</span>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={fulfillDialogOpen} onOpenChange={setFulfillDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Fulfilled</DialogTitle>
            <DialogDescription>
              Confirm that you&apos;ve sent or delivered this prize.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="tracking">Tracking number (optional)</Label>
              <Input
                id="tracking"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder="e.g., 1Z999AA10123456784"
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFulfillDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleMarkFulfilled}>
              Confirm Fulfilled
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
