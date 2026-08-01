"use client"

import { SignUpForm } from "@/components/auth/sign-up-form"

export function CustomSignUp({
  redirectUrl,
  initialEmail,
}: {
  redirectUrl?: string
  initialEmail?: string
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="mb-8 text-center">
        <h1 className="font-bold text-2xl text-foreground">hackathon.new</h1>
      </div>
      <SignUpForm redirectUrl={redirectUrl} initialEmail={initialEmail} />
    </div>
  )
}
