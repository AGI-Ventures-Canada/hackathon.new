"use client"

import { useState, useEffect } from "react"
import {
  Search,
  ChevronsUpDown,
  LogOut,
  Building2,
  Settings,
  UserCog,
  BookOpen,
  ChevronLeft,
  Key,
  Clock,
  Webhook,
  Plug,
  Home,
  Users,
  Star,
  Megaphone,
  Scale,
  Globe,
  ExternalLink,
  Plus,
  Download,
  Compass,
} from "lucide-react"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import Image from "next/image"
import Link from "next/link"
import { usePathname, useSearchParams, useRouter } from "next/navigation"
import {
  useUser,
  useClerk,
  useOrganization,
  useOrganizationList,
} from "@clerk/nextjs"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ThemeSwitcher } from "@/components/theme-switcher"
import { CreateHackathonMenu } from "@/components/hackathon/create-hackathon-menu"
import { CreateOrganizationDialog } from "@/components/create-organization-dialog"
import { InstallSkillButton } from "@/components/install-skill-button"
import { OPEN_SEARCH_EVENT } from "@/components/search-command"

const mainItems = [
  { title: "Dashboard", href: "/home", icon: Home },
  { title: "Explore", href: "/browse", icon: Compass },
]

const hackathonItems = [
  { title: "Organizing", href: "/home/organizing", icon: Megaphone },
  { title: "Participating", href: "/home/participating", icon: Users },
  { title: "Judging", href: "/home/judging", icon: Scale },
  { title: "Sponsoring", href: "/home/sponsoring", icon: Star },
]

const manageItems = [
  { title: "Settings", href: "/settings", icon: Settings },
  { title: "API Docs", href: "/docs", icon: BookOpen },
]

const settingsItems = [
  { title: "Organization", href: "/settings/profile", icon: Building2 },
  { title: "API Keys", href: "/settings/api-keys", icon: Key },
  { title: "Schedules", href: "/settings/schedules", icon: Clock },
  { title: "Webhooks", href: "/settings/webhooks", icon: Webhook },
  { title: "Integrations", href: "/settings/integrations", icon: Plug },
]

export function AppSidebarSimple() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { user } = useUser()
  const { signOut, openUserProfile } = useClerk()
  const { organization } = useOrganization()
  const { userMemberships, setActive } = useOrganizationList({
    userMemberships: { infinite: true },
  })

  const { setOpenMobile, isMobile } = useSidebar()
  const [tenantSlug, setTenantSlug] = useState<string | null>(null)
  const [createOrgOpen, setCreateOrgOpen] = useState(false)

  useEffect(() => {
    if (isMobile) {
      setOpenMobile(false)
    }
  }, [pathname, searchParams, isMobile, setOpenMobile])

  useEffect(() => {
    if (!organization) {
      const id = requestAnimationFrame(() => setTenantSlug(null))
      return () => cancelAnimationFrame(id)
    }
    let cancelled = false
    fetch("/api/dashboard/org-profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setTenantSlug(data?.slug ?? null)
      })
      .catch(() => {
        if (!cancelled) setTenantSlug(null)
      })
    return () => { cancelled = true }
  }, [organization])

  const isSettingsView = pathname.startsWith("/settings")

  function isActive(item: { href: string }) {
    if (item.href === "/home") return pathname === "/home"
    return pathname.startsWith(item.href)
  }

  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton className="h-auto py-2.5">
                  {organization?.imageUrl ? (
                    <Image
                      src={organization.imageUrl}
                      alt={organization.name || "Organization"}
                      width={28}
                      height={28}
                      className="size-7 rounded object-cover"
                    />
                  ) : (
                    <div className="flex size-7 items-center justify-center rounded bg-primary text-primary-foreground text-xs font-semibold">
                      {organization?.name?.charAt(0).toUpperCase() || user?.firstName?.charAt(0)?.toUpperCase() || "P"}
                    </div>
                  )}
                  <div className="flex-1 text-left text-sm leading-tight truncate">
                    <span className="font-semibold">{organization?.name || "Personal Workspace"}</span>
                  </div>
                  <ChevronsUpDown className="size-4 opacity-50" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56"
                align="start"
              >
                <DropdownMenuLabel>Organizations</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    setActive?.({ organization: null })
                    router.push("/home")
                  }}
                  className="gap-2"
                >
                  <div className="flex size-5 items-center justify-center rounded bg-primary text-primary-foreground text-xs font-semibold">
                    {user?.firstName?.charAt(0)?.toUpperCase() || "P"}
                  </div>
                  <span className="truncate">Personal Workspace</span>
                </DropdownMenuItem>
                {userMemberships?.data?.map((mem) => (
                  <DropdownMenuItem
                    key={mem.organization.id}
                    onClick={() => {
                      setActive?.({ organization: mem.organization.id })
                      router.push("/home")
                    }}
                    className="gap-2"
                  >
                    {mem.organization.imageUrl ? (
                      <Image
                        src={mem.organization.imageUrl}
                        alt={mem.organization.name}
                        width={20}
                        height={20}
                        className="size-5 rounded object-cover"
                      />
                    ) : (
                      <div className="flex size-5 items-center justify-center rounded bg-primary text-primary-foreground text-xs font-semibold">
                        {mem.organization.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="truncate">{mem.organization.name}</span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem
                  onClick={() => setCreateOrgOpen(true)}
                  className="gap-2"
                >
                  <div className="flex size-5 items-center justify-center rounded bg-muted text-muted-foreground">
                    <Plus className="size-3" />
                  </div>
                  <span className="truncate">Create New Organization</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {organization && (
                  <>
                    <DropdownMenuItem asChild>
                      <Link href="/settings/profile">
                        <Settings className="size-4 mr-2" />
                        Organization Settings
                      </Link>
                    </DropdownMenuItem>
                    {tenantSlug && (
                      <DropdownMenuItem asChild>
                        <Link href={`/o/${tenantSlug}`} target="_blank">
                          <Globe className="size-4 mr-2" />
                          Organization Page
                          <ExternalLink className="size-3 ml-auto opacity-50" />
                        </Link>
                      </DropdownMenuItem>
                    )}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="h-9 text-muted-foreground"
              onClick={() => document.dispatchEvent(new CustomEvent(OPEN_SEARCH_EVENT))}
            >
              <Search className="size-4" />
              <span className="text-sm flex-1">Search</span>
              <KbdGroup><Kbd>⌘</Kbd>+<Kbd>K</Kbd></KbdGroup>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {isSettingsView ? (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className="h-10">
                    <Link href="/home">
                      <ChevronLeft />
                      <span className="font-semibold text-sm">Settings</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
            <SidebarGroupContent>
              <SidebarMenu>
                {settingsItems.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={pathname === item.href} className="h-10">
                      <Link href={item.href}>
                        <item.icon />
                        <span className="text-sm">{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : (
          <>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {mainItems.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={isActive(item)} className="h-10">
                        <Link href={item.href}>
                          <item.icon />
                          <span className="text-sm">{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel>Hackathons</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <CreateHackathonMenu
                      trigger={
                        <SidebarMenuButton className="h-10">
                          <Plus className="size-4 text-primary" />
                          <span className="text-sm text-primary">Create Event</span>
                        </SidebarMenuButton>
                      }
                    />
                  </SidebarMenuItem>
                  {hackathonItems.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={isActive(item)} className="h-10">
                        <Link href={item.href}>
                          <item.icon />
                          <span className="text-sm">{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel>Manage</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {manageItems.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={isActive(item)} className="h-10">
                        <Link href={item.href}>
                          <item.icon />
                          <span className="text-sm">{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                  <SidebarMenuItem>
                    <InstallSkillButton
                      trigger={
                        <SidebarMenuButton className="h-10">
                          <Download />
                          <span className="text-sm">Install Skill</span>
                        </SidebarMenuButton>
                      }
                    />
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton className="h-auto py-2.5">
                  {user?.imageUrl ? (
                    <Image
                      src={user.imageUrl}
                      alt={user.fullName || "User"}
                      width={28}
                      height={28}
                      className="size-7 rounded-full"
                    />
                  ) : (
                    <div className="flex size-7 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                      {user?.firstName?.charAt(0) || user?.emailAddresses[0]?.emailAddress?.charAt(0).toUpperCase() || "U"}
                    </div>
                  )}
                  <div className="flex-1 text-left text-sm leading-tight truncate">
                    <span className="block font-medium truncate">
                      {user?.fullName || user?.firstName || "User"}
                    </span>
                    <span className="block text-xs text-muted-foreground truncate">
                      {user?.emailAddresses[0]?.emailAddress}
                    </span>
                  </div>
                  <ChevronsUpDown className="size-4 opacity-50" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56"
                align="start"
                side="top"
              >
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium">{user?.fullName || user?.firstName}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {user?.emailAddresses[0]?.emailAddress}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => openUserProfile()}>
                  <UserCog className="size-4 mr-2" />
                  Account Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <div className="flex items-center justify-between px-2 py-1.5">
                  <span className="text-sm">Theme</span>
                  <ThemeSwitcher />
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut({ redirectUrl: "/sign-in" })}>
                  <LogOut className="size-4 mr-2" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <CreateOrganizationDialog
        open={createOrgOpen}
        onOpenChange={setCreateOrgOpen}
      />
    </Sidebar>
  )
}
