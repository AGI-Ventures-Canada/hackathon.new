/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Mail, MoreHorizontal, Trash2, Bot, Pencil, Copy, Check } from "lucide-react"
import type { EmailAddress } from "@/lib/db/hackathon-types"
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
import { EditEmailAddressForm } from "@/components/dashboard/edit-email-address-form"
import { assertOk } from "@/lib/utils/fetch"

interface EmailAddressListProps {
  emailAddresses: EmailAddress[]
  agentMap: Map<string, string>
}

export function EmailAddressList({ emailAddresses, agentMap }: EmailAddressListProps) {
  const router = useRouter()
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
  const [editAddress, setEditAddress] = useState<EmailAddress | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const visibleAddresses = emailAddresses.filter((a) => !hiddenIds.has(a.id))

  const [deleteError, setDeleteError] = useState<string | null>(null)

  const handleDelete = async () => {
    if (!deleteId) return

    const id = deleteId
    setDeleteError(null)
    setHiddenIds((prev) => new Set(prev).add(id))
    setDeleteId(null)

    try {
      await fetch(`/api/dashboard/email-addresses/${id}`, { method: "DELETE" }).then(assertOk)
      router.refresh()
    } catch (err) {
      setHiddenIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      setDeleteError(err instanceof Error ? err.message : "Failed to delete email address")
    }
  }

  const handleCopy = async (address: EmailAddress) => {
    await navigator.clipboard.writeText(address.address)
    setCopiedId(address.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  if (visibleAddresses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Mail className="size-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold">No email addresses yet</h3>
        <p className="text-sm text-muted-foreground max-w-sm mt-1">
          Create an email address to trigger agents when emails are received
        </p>
      </div>
    )
  }

  return (
    <>
      {deleteError && (
        <p className="text-sm text-destructive mb-2">{deleteError}</p>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email Address</TableHead>
            <TableHead>Linked Agent</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleAddresses.map((address) => (
            <TableRow key={address.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <code className="text-sm bg-muted px-1.5 py-0.5 rounded">
                    {address.address}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    onClick={() => handleCopy(address)}
                  >
                    {copiedId === address.id ? (
                      <Check className="size-3 text-green-500" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                  </Button>
                </div>
              </TableCell>
              <TableCell>
                {address.agent_id ? (
                  <span className="flex items-center gap-1.5">
                    <Bot className="size-3.5" />
                    {agentMap.get(address.agent_id) ?? "Unknown"}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Not linked</span>
                )}
              </TableCell>
              <TableCell>
                {address.is_active ? (
                  <Badge variant="default">Active</Badge>
                ) : (
                  <Badge variant="secondary">Inactive</Badge>
                )}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {(() => {
                  const d = new Date(address.created_at)
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
                    <DropdownMenuItem onClick={() => setEditAddress(address)}>
                      <Pencil className="size-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => setDeleteId(address.id)}
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

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Email Address</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this email address? Any future
              emails to this address will not be processed.
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

      <Sheet open={!!editAddress} onOpenChange={() => setEditAddress(null)}>
        <SheetContent className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Edit Email Address</SheetTitle>
            <SheetDescription>
              Configure which agent handles emails to this address
            </SheetDescription>
          </SheetHeader>
          {editAddress && (
            <EditEmailAddressForm
              emailAddress={editAddress}
              onSuccess={() => {
                setEditAddress(null)
                router.refresh()
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
