"use client"

import { ThemeProvider as NextThemesProvider } from "next-themes"

// Suppress false-positive React 19 warning from next-themes@0.4.6.
// next-themes renders an inline <script> to prevent FOUC — it executes
// correctly during SSR, but React 19 warns about script tags in client
// components. The library is unmaintained; remove this once upgraded.
// See: https://github.com/pacocoursey/next-themes/issues/296
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  const origConsoleError = console.error
  console.error = (...args: unknown[]) => {
    if (
      typeof args[0] === "string" &&
      args[0].includes("Encountered a script tag while rendering")
    ) return
    origConsoleError.apply(console, args)
  }
}

export function ThemeProvider({
  children,
  nonce,
}: {
  children: React.ReactNode
  nonce?: string
}) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
      nonce={nonce}
    >
      {children}
    </NextThemesProvider>
  )
}
