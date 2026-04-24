"use client"

import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { useCallback } from "react"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { LANGUAGE_LABELS } from "@/lib/utils/language"

type LanguageToggleProps = {
  locales: string[]
  current: string
}

export function LanguageToggle({ locales, current }: LanguageToggleProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const handleSelect = useCallback(
    (locale: string) => {
      if (locale === current) return
      const params = new URLSearchParams(searchParams?.toString() ?? "")
      params.set("lang", locale)
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    },
    [current, pathname, searchParams, router]
  )

  if (locales.length < 2) return null

  return (
    <ButtonGroup aria-label="Language">
      {locales.map((locale) => (
        <Button
          key={locale}
          type="button"
          size="sm"
          variant={locale === current ? "default" : "outline"}
          aria-pressed={locale === current}
          onClick={() => handleSelect(locale)}
        >
          {LANGUAGE_LABELS[locale] ?? locale.toUpperCase()}
        </Button>
      ))}
    </ButtonGroup>
  )
}
