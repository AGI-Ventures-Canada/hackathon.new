import type { Metadata } from "next"
import { Geist, Geist_Mono, JetBrains_Mono } from "next/font/google"
import { auth } from "@clerk/nextjs/server"
import { hasAdminMetadata } from "@/lib/auth/principal"
import { ThemeProvider } from "@/components/theme-provider"
import { ThemedClerkProvider } from "@/components/clerk-provider"
import { PostHogProvider } from "@/components/posthog-provider"
import { SearchCommand } from "@/components/search-command"
import { DevTool } from "@/components/dev-tool/dev-tool"
import "./globals.css"

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-sans",
})

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "Oatmeal",
  description: "Hackathon platform",
}

async function shouldShowDevTool(): Promise<boolean> {
  // In local dev, always show — no auth check. Dev API routes still enforce
  // auth independently, so this only controls UI visibility.
  if (process.env.NODE_ENV !== "production") return true
  if (process.env.ADMIN_ENABLED !== "true") return false
  const session = await auth()
  if (!session.userId) return false
  return hasAdminMetadata(session.sessionClaims)
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const showDevTool = await shouldShowDevTool()

  return (
    <html lang="en" className={jetbrainsMono.variable} suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider>
          <ThemedClerkProvider>
            <PostHogProvider>{children}</PostHogProvider>
            <SearchCommand />
            {showDevTool && <DevTool />}
          </ThemedClerkProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
