"use client"

import Link from "next/link"
import { useUser } from "@clerk/nextjs"

export function HeaderLogo() {
  const { isSignedIn } = useUser()

  return (
    <Link href={isSignedIn ? "/home" : "/"} className="font-bold text-xl">
      hackathon.new
    </Link>
  )
}
