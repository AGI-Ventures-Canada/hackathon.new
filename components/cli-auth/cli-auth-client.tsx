"use client"

import { Button } from "@/components/ui/button"
import { CheckCircle2, XCircle } from "lucide-react"

export function CliAuthClient({ result }: { result: { success: boolean; error?: string } }) {
  if (!result.success) {
    return (
      <div className="text-center max-w-md">
        <XCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
        <h1 className="text-2xl font-bold mb-2">CLI sign-in failed</h1>
        <p className="text-muted-foreground mb-4">
          {result.error ?? "Something went wrong. Please try again."}
        </p>
        <p className="text-sm text-muted-foreground">
          Run <code className="bg-muted px-1.5 py-0.5 rounded">oatmeal login</code>{" "}
          again from your terminal.
        </p>
      </div>
    )
  }

  return (
    <div className="text-center max-w-md">
      <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-primary" />
      <h1 className="text-2xl font-bold mb-2">CLI is ready</h1>
      <p className="text-muted-foreground mb-6">
        You can close this tab and return to your terminal.
      </p>
      <Button variant="outline" onClick={() => window.close()}>
        Close Tab
      </Button>
    </div>
  )
}
