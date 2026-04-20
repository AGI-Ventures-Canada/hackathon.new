"use client"

import { useState } from "react"
import { Search, Mail } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Slider } from "@/components/ui/slider"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import {
  SectionLayout,
  ShowcaseSection,
  ShowcaseStack,
  ShowcaseLabel,
} from "../_section-layout"

const SECTIONS = [
  { id: "input", label: "Input" },
  { id: "textarea", label: "Textarea" },
  { id: "select", label: "Select" },
  { id: "checkbox", label: "Checkbox" },
  { id: "switch", label: "Switch" },
  { id: "radio", label: "Radio group" },
  { id: "slider", label: "Slider" },
  { id: "input-group", label: "Input group" },
  { id: "field", label: "Field" },
]

export function FormsShowcase() {
  const [text, setText] = useState("")
  const [note, setNote] = useState("")
  const [agreed, setAgreed] = useState(false)
  const [enabled, setEnabled] = useState(true)
  const [pick, setPick] = useState("one")
  const [volume, setVolume] = useState([35])

  return (
    <SectionLayout sections={SECTIONS}>
      <ShowcaseSection id="input" title="Input" description="A single line of text.">
        <ShowcaseStack>
          <div className="max-w-sm space-y-2">
            <Label htmlFor="demo-input">Your name</Label>
            <Input
              id="demo-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type here"
              autoComplete="off"
              data-1p-ignore
            />
          </div>
          <div className="max-w-sm">
            <Input placeholder="Disabled" disabled />
          </div>
          <div className="max-w-sm">
            <Input aria-invalid placeholder="Something is wrong" />
          </div>
        </ShowcaseStack>
      </ShowcaseSection>

      <ShowcaseSection id="textarea" title="Textarea" description="A bigger text box for longer answers.">
        <div className="max-w-md space-y-2">
          <Label htmlFor="demo-textarea">Notes</Label>
          <Textarea
            id="demo-textarea"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Write a bit..."
            autoComplete="off"
            data-1p-ignore
          />
        </div>
      </ShowcaseSection>

      <ShowcaseSection id="select" title="Select" description="A drop-down to pick one thing from a list.">
        <ShowcaseStack>
          <ShowcaseLabel>Default</ShowcaseLabel>
          <div className="max-w-xs">
            <Select defaultValue="apple">
              <SelectTrigger>
                <SelectValue placeholder="Pick a fruit" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Fruit</SelectLabel>
                  <SelectItem value="apple">Apple</SelectItem>
                  <SelectItem value="banana">Banana</SelectItem>
                  <SelectItem value="cherry">Cherry</SelectItem>
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>Veg</SelectLabel>
                  <SelectItem value="carrot">Carrot</SelectItem>
                  <SelectItem value="kale">Kale</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <ShowcaseLabel>Small size</ShowcaseLabel>
          <div className="max-w-xs">
            <Select>
              <SelectTrigger size="sm">
                <SelectValue placeholder="Pick one" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="a">Option A</SelectItem>
                <SelectItem value="b">Option B</SelectItem>
                <SelectItem value="c">Option C</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </ShowcaseStack>
      </ShowcaseSection>

      <ShowcaseSection id="checkbox" title="Checkbox" description="A box the user can turn on or off.">
        <div className="flex items-center gap-2">
          <Checkbox
            id="demo-check"
            checked={agreed}
            onCheckedChange={(v) => setAgreed(v === true)}
          />
          <Label htmlFor="demo-check">I agree to the terms</Label>
        </div>
      </ShowcaseSection>

      <ShowcaseSection id="switch" title="Switch" description="An on/off toggle.">
        <ShowcaseStack>
          <div className="flex items-center gap-2">
            <Switch id="demo-switch" checked={enabled} onCheckedChange={setEnabled} />
            <Label htmlFor="demo-switch">Notifications</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch size="sm" id="demo-switch-sm" defaultChecked />
            <Label htmlFor="demo-switch-sm">Small</Label>
          </div>
        </ShowcaseStack>
      </ShowcaseSection>

      <ShowcaseSection id="radio" title="Radio group" description="A set of circles where only one can be selected.">
        <RadioGroup value={pick} onValueChange={setPick} className="max-w-xs">
          <div className="flex items-center gap-2">
            <RadioGroupItem value="one" id="r-one" />
            <Label htmlFor="r-one">Option one</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="two" id="r-two" />
            <Label htmlFor="r-two">Option two</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="three" id="r-three" />
            <Label htmlFor="r-three">Option three</Label>
          </div>
        </RadioGroup>
      </ShowcaseSection>

      <ShowcaseSection id="slider" title="Slider" description="Drag a handle to pick a number in a range.">
        <ShowcaseStack>
          <div className="max-w-md">
            <Slider value={volume} onValueChange={setVolume} max={100} step={1} />
            <p className="mt-2 text-xs text-muted-foreground">Value: {volume[0]}</p>
          </div>
        </ShowcaseStack>
      </ShowcaseSection>

      <ShowcaseSection
        id="input-group"
        title="Input group"
        description="An input with small extras tucked inside, like an icon or unit label."
      >
        <ShowcaseStack>
          <div className="max-w-sm">
            <InputGroup>
              <InputGroupAddon align="inline-start">
                <Search />
              </InputGroupAddon>
              <InputGroupInput placeholder="Search hackathons" />
            </InputGroup>
          </div>
          <div className="max-w-sm">
            <InputGroup>
              <InputGroupAddon align="inline-start">
                <Mail />
              </InputGroupAddon>
              <InputGroupInput type="email" placeholder="you@example.com" />
              <InputGroupAddon align="inline-end">
                <InputGroupText>@agiventures.ca</InputGroupText>
              </InputGroupAddon>
            </InputGroup>
          </div>
        </ShowcaseStack>
      </ShowcaseSection>

      <ShowcaseSection id="field" title="Field" description="Lays out a label, control, and help text together.">
        <FieldSet className="max-w-md">
          <FieldLegend>Account details</FieldLegend>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="f-email">Email</FieldLabel>
              <Input id="f-email" type="email" placeholder="you@example.com" />
              <FieldDescription>We&apos;ll only use this for sign-in.</FieldDescription>
            </Field>
            <Field orientation="horizontal">
              <Checkbox id="f-updates" />
              <FieldContent>
                <FieldLabel htmlFor="f-updates">Send me updates</FieldLabel>
                <FieldDescription>About once a month, nothing spammy.</FieldDescription>
              </FieldContent>
            </Field>
          </FieldGroup>
        </FieldSet>
      </ShowcaseSection>
    </SectionLayout>
  )
}
