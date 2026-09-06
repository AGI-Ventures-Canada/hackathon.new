"use client"

import { useId, type ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { JUDGING_DESTINATIONS, judgingHref } from "@/lib/judging/setup"

export function JudgingNavigation({ slug, children }: { slug: string; children: ReactNode }) {
  const pathname = usePathname()
  const id = useId()
  const selected = JUDGING_DESTINATIONS.find((destination) => {
    if (destination.id === "overview") return false
    const href = judgingHref(slug, destination.id)
    return pathname === href || pathname.startsWith(`${href}/`)
  })?.id ?? "overview"

  return (
    <Tabs value={selected} activationMode="manual">
      <div className="space-y-6">
        <nav aria-label="Judging" className="overflow-x-auto">
          <TabsList aria-label="Judging sections">
            {JUDGING_DESTINATIONS.map((destination) => (
              <TabsTrigger
                key={destination.id}
                value={destination.id}
                id={`${id}-${destination.id}-tab`}
                aria-controls={`${id}-${destination.id}-panel`}
                data-active={selected === destination.id ? true : undefined}
                asChild
              >
                <Link
                  href={judgingHref(slug, destination.id)}
                  aria-current={selected === destination.id ? "page" : undefined}
                >
                  {destination.label}
                </Link>
              </TabsTrigger>
            ))}
          </TabsList>
        </nav>
        <div
          role="tabpanel"
          id={`${id}-${selected}-panel`}
          aria-labelledby={`${id}-${selected}-tab`}
          tabIndex={0}
        >
          {children}
        </div>
      </div>
    </Tabs>
  )
}
