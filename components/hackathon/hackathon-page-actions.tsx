"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  ExternalLink,
  ChevronDown,
  Timer,
  DoorOpen,
  FileText,
  BarChart3,
  LayoutDashboard,
  Trophy,
  MessageCircle,
} from "lucide-react"

interface HackathonPageActionsProps {
  slug: string
  hackathonName: string
  isOrganizer: boolean
}

const DISPLAY_LINKS = [
  { href: "display/timer", label: "Timer", icon: Timer },
  { href: "display/rooms", label: "Rooms", icon: DoorOpen },
  { href: "display/challenge", label: "Challenge", icon: FileText },
  { href: "display/leaderboard", label: "Leaderboard", icon: BarChart3 },
  { href: "display/winners", label: "Winners", icon: Trophy },
]

const PAGE_LINKS = [
  { href: "dashboard", label: "Live Dashboard", icon: LayoutDashboard },
  { href: "mentors", label: "Mentor Queue", icon: MessageCircle },
  { href: "winners", label: "Winners Page", icon: Trophy },
]

export function HackathonPageActions({
  slug,
  hackathonName,
  isOrganizer,
}: HackathonPageActionsProps) {
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button asChild variant="ghost" size="icon-sm">
            <Link href={`/e/${slug}`} target="_blank">
              <ExternalLink className="size-4" />
              <span className="sr-only">View Live</span>
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent>View Live</TooltipContent>
      </Tooltip>
      {isOrganizer ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm">
              <ChevronDown className="size-4" />
              <span className="sr-only">Screens</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuLabel>Projection Displays</DropdownMenuLabel>
            {DISPLAY_LINKS.map(({ href, label, icon: Icon }) => (
              <DropdownMenuItem key={href} asChild>
                <Link href={`/e/${slug}/${href}`} target="_blank">
                  <Icon className="mr-2 size-4" />
                  {label}
                </Link>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Public Pages</DropdownMenuLabel>
            {PAGE_LINKS.map(({ href, label, icon: Icon }) => (
              <DropdownMenuItem key={href} asChild>
                <Link href={`/e/${slug}/${href}`} target="_blank">
                  <Icon className="mr-2 size-4" />
                  {label}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </>
  )
}
