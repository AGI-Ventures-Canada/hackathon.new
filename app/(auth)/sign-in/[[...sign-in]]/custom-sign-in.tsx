"use client"

import { useEffect } from "react"
import { useAuth } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { SignInForm } from "@/components/auth/sign-in-form"

export function CustomSignIn({
  redirectUrl,
  initialEmail,
}: {
  redirectUrl?: string
  initialEmail?: string
}) {
  const { isLoaded, isSignedIn } = useAuth()
  const router = useRouter()
  const destination = redirectUrl || "/home"

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace(destination)
    }
  }, [isLoaded, isSignedIn, destination, router])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="mb-8 text-center">
        <h1 className="font-bold text-2xl text-foreground">hackathon.new</h1>
      </div>
      <SignInForm redirectUrl={destination} initialEmail={initialEmail} />
    </div>
  )
}
