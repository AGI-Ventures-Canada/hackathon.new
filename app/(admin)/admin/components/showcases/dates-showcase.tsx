"use client"

import { useState } from "react"
import { Calendar } from "@/components/ui/calendar"
import { DateTimePicker } from "@/components/ui/date-time-picker"
import { DateTimeRangePicker, type DateTimeRange } from "@/components/ui/date-time-range-picker"
import {
  SectionLayout,
  ShowcaseSection,
  ShowcaseStack,
  ShowcaseLabel,
} from "../_section-layout"

const SECTIONS = [
  { id: "calendar", label: "Calendar" },
  { id: "date-time-picker", label: "Date + time picker" },
  { id: "date-time-range-picker", label: "Date + time range" },
]

const DEFAULT_DATE = new Date("2026-05-01T09:00:00Z")
const DEFAULT_RANGE: DateTimeRange = {
  from: new Date("2026-05-01T09:00:00Z"),
  to: new Date("2026-05-03T17:00:00Z"),
}

export function DatesShowcase() {
  const [single, setSingle] = useState<Date | undefined>(DEFAULT_DATE)
  const [dateTime, setDateTime] = useState<Date | null>(DEFAULT_DATE)
  const [range, setRange] = useState<DateTimeRange>(DEFAULT_RANGE)

  return (
    <SectionLayout sections={SECTIONS}>
      <ShowcaseSection id="calendar" title="Calendar" description="Pick a date from a month view.">
        <ShowcaseStack>
          <ShowcaseLabel>Single date</ShowcaseLabel>
          <Calendar
            mode="single"
            selected={single}
            onSelect={setSingle}
            className="rounded-none border"
          />
          <p className="text-xs text-muted-foreground">
            Selected: {single ? single.toDateString() : "none"}
          </p>
        </ShowcaseStack>
      </ShowcaseSection>

      <ShowcaseSection
        id="date-time-picker"
        title="Date + time picker"
        description="A single date along with a time."
      >
        <div className="max-w-sm">
          <DateTimePicker value={dateTime} onChange={setDateTime} />
          <p className="mt-2 text-xs text-muted-foreground">
            Selected: {dateTime ? dateTime.toLocaleString() : "none"}
          </p>
        </div>
      </ShowcaseSection>

      <ShowcaseSection
        id="date-time-range-picker"
        title="Date + time range"
        description="A start and end date with times for each."
      >
        <div className="max-w-md">
          <DateTimeRangePicker value={range} onChange={setRange} />
          <p className="mt-2 text-xs text-muted-foreground">
            {range.from?.toLocaleString() ?? "—"} → {range.to?.toLocaleString() ?? "—"}
          </p>
        </div>
      </ShowcaseSection>
    </SectionLayout>
  )
}
