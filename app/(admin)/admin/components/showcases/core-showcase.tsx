"use client"

import { Info, Plus, Trash, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ButtonGroup, ButtonGroupSeparator, ButtonGroupText } from "@/components/ui/button-group"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "@/components/ui/avatar"
import { Progress } from "@/components/ui/progress"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  SectionLayout,
  ShowcaseSection,
  ShowcaseRow,
  ShowcaseStack,
  ShowcaseLabel,
} from "../_section-layout"

const SECTIONS = [
  { id: "button", label: "Button" },
  { id: "button-group", label: "Button group" },
  { id: "badge", label: "Badge" },
  { id: "alert", label: "Alert" },
  { id: "skeleton", label: "Skeleton" },
  { id: "avatar", label: "Avatar" },
  { id: "progress", label: "Progress" },
  { id: "kbd", label: "Kbd" },
  { id: "separator", label: "Separator" },
  { id: "tooltip", label: "Tooltip" },
]

export function CoreShowcase() {
  return (
    <SectionLayout sections={SECTIONS}>
      <ShowcaseSection id="button" title="Button" description="The main way to trigger an action.">
        <ShowcaseStack>
          <ShowcaseLabel>Variants</ShowcaseLabel>
          <ShowcaseRow>
            <Button>Default</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="link">Link</Button>
          </ShowcaseRow>
          <ShowcaseLabel>Sizes</ShowcaseLabel>
          <ShowcaseRow>
            <Button size="xs">Extra small</Button>
            <Button size="sm">Small</Button>
            <Button>Default</Button>
            <Button size="lg">Large</Button>
          </ShowcaseRow>
          <ShowcaseLabel>Icon only</ShowcaseLabel>
          <ShowcaseRow>
            <Button size="icon-xs" variant="outline" aria-label="Add">
              <Plus />
            </Button>
            <Button size="icon-sm" variant="outline" aria-label="Add">
              <Plus />
            </Button>
            <Button size="icon" variant="outline" aria-label="Add">
              <Plus />
            </Button>
            <Button size="icon-lg" variant="outline" aria-label="Add">
              <Plus />
            </Button>
          </ShowcaseRow>
          <ShowcaseLabel>With icon + label</ShowcaseLabel>
          <ShowcaseRow>
            <Button>
              <Plus />
              Add item
            </Button>
            <Button variant="destructive">
              <Trash />
              Delete
            </Button>
            <Button variant="outline">
              Options
              <ChevronDown />
            </Button>
          </ShowcaseRow>
          <ShowcaseLabel>Disabled</ShowcaseLabel>
          <ShowcaseRow>
            <Button disabled>Default</Button>
            <Button disabled variant="outline">Outline</Button>
            <Button disabled variant="destructive">Destructive</Button>
          </ShowcaseRow>
        </ShowcaseStack>
      </ShowcaseSection>

      <ShowcaseSection
        id="button-group"
        title="Button group"
        description="A row of buttons that stick together."
      >
        <ShowcaseStack>
          <ShowcaseRow>
            <ButtonGroup>
              <Button variant="outline">Left</Button>
              <Button variant="outline">Middle</Button>
              <Button variant="outline">Right</Button>
            </ButtonGroup>
          </ShowcaseRow>
          <ShowcaseRow>
            <ButtonGroup>
              <Button variant="outline">Copy</Button>
              <ButtonGroupSeparator />
              <Button variant="outline" size="icon" aria-label="More">
                <ChevronDown />
              </Button>
            </ButtonGroup>
          </ShowcaseRow>
          <ShowcaseRow>
            <ButtonGroup>
              <ButtonGroupText>$</ButtonGroupText>
              <Button variant="outline">100</Button>
              <Button variant="outline">500</Button>
              <Button variant="outline">1,000</Button>
            </ButtonGroup>
          </ShowcaseRow>
        </ShowcaseStack>
      </ShowcaseSection>

      <ShowcaseSection id="badge" title="Badge" description="A tiny label for status or counts.">
        <ShowcaseRow>
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="count">42</Badge>
          <Badge variant="destructive">Destructive</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="ghost">Ghost</Badge>
          <Badge variant="link">Link</Badge>
        </ShowcaseRow>
      </ShowcaseSection>

      <ShowcaseSection id="alert" title="Alert" description="Short, important messages inline with content.">
        <ShowcaseStack>
          <Alert>
            <Info />
            <AlertTitle>Heads up</AlertTitle>
            <AlertDescription>Something noteworthy just happened.</AlertDescription>
          </Alert>
          <Alert variant="destructive">
            <Info />
            <AlertTitle>Something went wrong</AlertTitle>
            <AlertDescription>Your last change could not be saved. Try again.</AlertDescription>
          </Alert>
        </ShowcaseStack>
      </ShowcaseSection>

      <ShowcaseSection id="skeleton" title="Skeleton" description="Placeholder shape shown while real content loads.">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
      </ShowcaseSection>

      <ShowcaseSection id="avatar" title="Avatar" description="A profile picture, with fallbacks for when the image is missing.">
        <ShowcaseStack>
          <ShowcaseLabel>Sizes</ShowcaseLabel>
          <ShowcaseRow>
            <Avatar size="sm">
              <AvatarImage src="https://i.pravatar.cc/80?img=1" alt="User" />
              <AvatarFallback>AB</AvatarFallback>
            </Avatar>
            <Avatar>
              <AvatarImage src="https://i.pravatar.cc/80?img=2" alt="User" />
              <AvatarFallback>CD</AvatarFallback>
            </Avatar>
            <Avatar size="lg">
              <AvatarImage src="https://i.pravatar.cc/80?img=3" alt="User" />
              <AvatarFallback>EF</AvatarFallback>
            </Avatar>
          </ShowcaseRow>
          <ShowcaseLabel>Fallbacks</ShowcaseLabel>
          <ShowcaseRow>
            <Avatar>
              <AvatarFallback>GH</AvatarFallback>
            </Avatar>
            <Avatar>
              <AvatarFallback>IJ</AvatarFallback>
            </Avatar>
          </ShowcaseRow>
          <ShowcaseLabel>Group</ShowcaseLabel>
          <AvatarGroup>
            <Avatar>
              <AvatarImage src="https://i.pravatar.cc/80?img=4" alt="User" />
              <AvatarFallback>AA</AvatarFallback>
            </Avatar>
            <Avatar>
              <AvatarImage src="https://i.pravatar.cc/80?img=5" alt="User" />
              <AvatarFallback>BB</AvatarFallback>
            </Avatar>
            <Avatar>
              <AvatarImage src="https://i.pravatar.cc/80?img=6" alt="User" />
              <AvatarFallback>CC</AvatarFallback>
            </Avatar>
            <AvatarGroupCount>+3</AvatarGroupCount>
          </AvatarGroup>
        </ShowcaseStack>
      </ShowcaseSection>

      <ShowcaseSection id="progress" title="Progress" description="A bar that fills up as a task completes.">
        <ShowcaseStack>
          <Progress value={25} />
          <Progress value={55} />
          <Progress value={90} />
        </ShowcaseStack>
      </ShowcaseSection>

      <ShowcaseSection id="kbd" title="Keyboard hint" description="Shows a key or shortcut.">
        <ShowcaseRow>
          <Kbd>Esc</Kbd>
          <Kbd>⌘</Kbd>
          <KbdGroup>
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </KbdGroup>
          <KbdGroup>
            <Kbd>⌘</Kbd>
            <Kbd>⇧</Kbd>
            <Kbd>Enter</Kbd>
          </KbdGroup>
        </ShowcaseRow>
      </ShowcaseSection>

      <ShowcaseSection id="separator" title="Separator" description="A thin line that splits content.">
        <ShowcaseStack>
          <div className="text-xs">Above</div>
          <Separator />
          <div className="text-xs">Below</div>
          <div className="flex h-8 items-center gap-3">
            <span className="text-xs">Left</span>
            <Separator orientation="vertical" />
            <span className="text-xs">Right</span>
          </div>
        </ShowcaseStack>
      </ShowcaseSection>

      <ShowcaseSection id="tooltip" title="Tooltip" description="A hint that pops up when you hover or focus.">
        <ShowcaseRow>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline">Hover me</Button>
            </TooltipTrigger>
            <TooltipContent>Here is the hint.</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Save">
                <Plus />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Save for later</TooltipContent>
          </Tooltip>
        </ShowcaseRow>
      </ShowcaseSection>
    </SectionLayout>
  )
}
