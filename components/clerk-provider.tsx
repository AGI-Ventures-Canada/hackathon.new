"use client"

import { ClerkProvider } from "@clerk/nextjs"
import { dark } from "@clerk/themes"
import { useTheme } from "next-themes"

export function ThemedClerkProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const { resolvedTheme } = useTheme()

  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return <>{children}</>
  }

  return (
    <ClerkProvider
      appearance={{
        baseTheme: resolvedTheme === "dark" ? dark : undefined,
        elements: {
          card: "rounded-none shadow-none",
          formButtonPrimary:
            "bg-primary text-primary-foreground rounded-none hover:bg-primary/90",
          formButtonReset: "rounded-none",
          formFieldInput: "rounded-none border-input",
          socialButtonsBlockButton: "rounded-none border-border",
          otpCodeFieldInput: "rounded-none",
          alternativeMethodsBlockButton: "rounded-none",
          avatarBox: "rounded-none",
          userButtonPopoverCard: "rounded-none border border-border",
          userPreviewMainIdentifier: "font-medium",
          modalContent: "rounded-none",
          modalCloseButton: "rounded-none text-muted-foreground hover:bg-muted",
          cardBox: "rounded-none shadow-none border border-border",
          navbar: "rounded-none border-border",
          navbarButton: "rounded-none text-foreground",
          headerTitle: "font-semibold text-foreground",
          headerSubtitle: "text-muted-foreground",
          profileSectionTitleText: "text-foreground",
          profileSectionPrimaryButton: "rounded-none text-primary",
          accordionTriggerButton: "rounded-none",
          badge: "rounded-none",
          menuButton: "rounded-none",
          menuList: "rounded-none border border-border",
          selectButton: "rounded-none border-input",
          selectOptionsContainer: "rounded-none border border-border",
          fileDropAreaBox: "rounded-none border-border",
          fileDropAreaButtonPrimary: "rounded-none",
        },
      }}
    >
      {children}
    </ClerkProvider>
  )
}
