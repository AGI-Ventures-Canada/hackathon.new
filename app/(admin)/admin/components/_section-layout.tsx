"use client"

import { useMemo } from "react"
import { cn } from "@/lib/utils"
import { useScrollSpy } from "@/hooks/use-scroll-spy"

export interface SectionItem {
  id: string
  label: string
}

export function SectionLayout({
  sections,
  children,
}: {
  sections: SectionItem[]
  children: React.ReactNode
}) {
  const ids = useMemo(() => sections.map((s) => s.id), [sections])
  const activeId = useScrollSpy(ids)

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>, id: string) {
    e.preventDefault()
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" })
      history.replaceState(null, "", `#${id}`)
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[200px_1fr]">
      <nav className="hidden lg:block">
        <ul className="sticky top-6 space-y-1 text-xs">
          {sections.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                onClick={(e) => handleClick(e, s.id)}
                className={cn(
                  "block border-l-2 py-1 pl-3 transition-colors",
                  activeId === s.id
                    ? "border-foreground font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0 space-y-12">{children}</div>
    </div>
  )
}

export function ShowcaseSection({
  id,
  title,
  description,
  children,
}: {
  id: string
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-6 space-y-4">
      <div className="space-y-1">
        <h3 className="text-lg font-medium">{title}</h3>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="rounded-none border bg-card p-4 md:p-6">{children}</div>
    </section>
  )
}

export function ShowcaseRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>
}

export function ShowcaseStack({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-3">{children}</div>
}

export function ShowcaseLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
  )
}
