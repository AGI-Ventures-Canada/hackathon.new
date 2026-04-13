"use client"

import { useUser } from "@clerk/nextjs"
import { AppSidebarSimple } from "@/components/app-sidebar-simple"
import { MobileHeader } from "@/components/mobile-header"
import { HeaderLogo } from "@/components/public/header-logo"
import { HeaderAuth } from "@/components/public/header-auth"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"

export function PublicLayoutShell({
  children,
  initialSignedIn,
}: {
  children: React.ReactNode
  initialSignedIn: boolean
}) {
  const { isSignedIn } = useUser()
  const signedIn = isSignedIn ?? initialSignedIn

  if (!signedIn) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="border-b">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HeaderLogo />
            </div>
            <nav className="flex items-center gap-2">
              <HeaderAuth />
            </nav>
          </div>
        </header>
        <main className="flex-1 flex flex-col">
          {children}
        </main>
      </div>
    )
  }

  return (
    <SidebarProvider>
      <AppSidebarSimple />
      <SidebarInset>
        <MobileHeader />
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
