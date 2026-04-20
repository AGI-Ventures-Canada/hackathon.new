"use client"

import { useState } from "react"
import { Settings, User, LogOut, Plus, Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  DrawerClose,
} from "@/components/ui/drawer"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  SectionLayout,
  ShowcaseSection,
  ShowcaseRow,
} from "../_section-layout"

const SECTIONS = [
  { id: "dialog", label: "Dialog" },
  { id: "alert-dialog", label: "Alert dialog" },
  { id: "sheet", label: "Sheet" },
  { id: "drawer", label: "Drawer" },
  { id: "popover", label: "Popover" },
  { id: "hover-card", label: "Hover card" },
  { id: "dropdown-menu", label: "Dropdown menu" },
  { id: "command", label: "Command" },
]

export function OverlaysShowcase() {
  const [checked, setChecked] = useState(true)
  const [cmdOpen, setCmdOpen] = useState(false)

  return (
    <SectionLayout sections={SECTIONS}>
      <ShowcaseSection id="dialog" title="Dialog" description="A pop-up box for focused tasks.">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">Open dialog</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit your name</DialogTitle>
              <DialogDescription>Change what shows up on your profile.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="d-name">Name</Label>
              <Input id="d-name" defaultValue="Alex Ivany" autoComplete="off" data-1p-ignore />
            </div>
            <DialogFooter showCloseButton>
              <Button>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </ShowcaseSection>

      <ShowcaseSection
        id="alert-dialog"
        title="Alert dialog"
        description="A pop-up that makes the user confirm before a destructive action."
      >
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive">Delete account</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete your account. You can&apos;t undo this.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive">Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </ShowcaseSection>

      <ShowcaseSection id="sheet" title="Sheet" description="A panel that slides in from an edge.">
        <ShowcaseRow>
          {(["right", "left", "top", "bottom"] as const).map((side) => (
            <Sheet key={side}>
              <SheetTrigger asChild>
                <Button variant="outline">{side}</Button>
              </SheetTrigger>
              <SheetContent side={side}>
                <SheetHeader>
                  <SheetTitle>Sheet from {side}</SheetTitle>
                  <SheetDescription>Slides in from the {side}.</SheetDescription>
                </SheetHeader>
                <SheetFooter>
                  <Button>Confirm</Button>
                </SheetFooter>
              </SheetContent>
            </Sheet>
          ))}
        </ShowcaseRow>
      </ShowcaseSection>

      <ShowcaseSection id="drawer" title="Drawer" description="Mobile-friendly bottom sheet.">
        <Drawer>
          <DrawerTrigger asChild>
            <Button variant="outline">Open drawer</Button>
          </DrawerTrigger>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>A drawer</DrawerTitle>
              <DrawerDescription>Swipe or tap outside to close.</DrawerDescription>
            </DrawerHeader>
            <div className="px-4 text-xs">Drawer body content here.</div>
            <DrawerFooter>
              <Button>Save</Button>
              <DrawerClose asChild>
                <Button variant="outline">Cancel</Button>
              </DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      </ShowcaseSection>

      <ShowcaseSection id="popover" title="Popover" description="A small floating panel anchored to an element.">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline">Open popover</Button>
          </PopoverTrigger>
          <PopoverContent>
            <PopoverHeader>
              <PopoverTitle>Quick settings</PopoverTitle>
              <PopoverDescription>Change a few options without leaving this page.</PopoverDescription>
            </PopoverHeader>
            <div className="space-y-2">
              <Label htmlFor="p-width">Width</Label>
              <Input id="p-width" defaultValue="240" />
            </div>
          </PopoverContent>
        </Popover>
      </ShowcaseSection>

      <ShowcaseSection id="hover-card" title="Hover card" description="A preview card that pops up on hover.">
        <HoverCard>
          <HoverCardTrigger asChild>
            <Button variant="link">@alex</Button>
          </HoverCardTrigger>
          <HoverCardContent>
            <div className="space-y-1">
              <div className="text-sm font-medium">Alex Ivany</div>
              <p className="text-xs text-muted-foreground">
                Builds hackathons. Likes oatmeal.
              </p>
            </div>
          </HoverCardContent>
        </HoverCard>
      </ShowcaseSection>

      <ShowcaseSection id="dropdown-menu" title="Dropdown menu" description="A list of actions that drops down from a trigger.">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">Open menu</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>My account</DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <User />
                Profile
                <DropdownMenuShortcut>⌘P</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Settings />
                Settings
                <DropdownMenuShortcut>⌘,</DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={checked}
              onCheckedChange={(v) => setChecked(v === true)}
            >
              Auto-save
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive">
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ShowcaseSection>

      <ShowcaseSection id="command" title="Command" description="A searchable list of actions — like a command palette.">
        <ShowcaseRow>
          <Button variant="outline" onClick={() => setCmdOpen(true)}>
            Open command palette
          </Button>
        </ShowcaseRow>
        <CommandDialog open={cmdOpen} onOpenChange={setCmdOpen}>
          <Command>
            <CommandInput placeholder="Type a command..." />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandGroup heading="Suggestions">
                <CommandItem>
                  <Calendar />
                  New event
                  <CommandShortcut>⌘N</CommandShortcut>
                </CommandItem>
                <CommandItem>
                  <User />
                  Invite person
                </CommandItem>
                <CommandItem>
                  <Plus />
                  Add prize
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Settings">
                <CommandItem>
                  <Settings />
                  Preferences
                  <CommandShortcut>⌘,</CommandShortcut>
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </CommandDialog>
        <div className="mt-4 max-w-md rounded-none border">
          <Command>
            <CommandInput placeholder="Or try inline..." />
            <CommandList>
              <CommandEmpty>No results.</CommandEmpty>
              <CommandGroup>
                <CommandItem>Apple</CommandItem>
                <CommandItem>Banana</CommandItem>
                <CommandItem>Cherry</CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      </ShowcaseSection>
    </SectionLayout>
  )
}
