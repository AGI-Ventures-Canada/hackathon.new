import { Suspense } from "react"
import { SSOCallback } from "./sso-callback"

export default function SSOCallbackPage() {
  return (
    <Suspense>
      <SSOCallback />
    </Suspense>
  )
}
