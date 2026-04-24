"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const NAV_ITEMS = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/hackathons", label: "Hackathons" },
  { href: "/admin/scenarios", label: "Scenarios" },
  { href: "/admin/components", label: "Components" },
]

export function AdminNav() {
  const pathname = usePathname()

  return (
    <nav className="flex gap-4 text-sm text-muted-foreground">
      {NAV_ITEMS.map(({ href, label, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={active ? "font-medium text-foreground" : "hover:text-foreground"}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
