"use client"

import { SignInForm } from "@/components/auth/sign-in-form"

export function CustomSignIn({
  redirectUrl,
  initialEmail,
}: {
  redirectUrl?: string
  initialEmail?: string
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="mb-8 text-center">
        <h1 className="font-bold text-2xl text-foreground">Oatmeal</h1>
      </div>
      <SignInForm redirectUrl={redirectUrl || "/home"} initialEmail={initialEmail} />
    </div>
  )
}
