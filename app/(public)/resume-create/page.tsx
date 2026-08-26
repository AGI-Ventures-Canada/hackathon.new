import { ResumeCreateClient } from "@/components/hackathon/resume-create-client"
import { Suspense } from "react"

export default function ResumeCreatePage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-muted-foreground">Restoring your draft…</p>}>
      <ResumeCreateClient />
    </Suspense>
  )
}
