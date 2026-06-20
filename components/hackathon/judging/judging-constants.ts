import {
  ArrowUpDown,
  Award,
  ListChecks,
  Sliders,
  Vote,
} from "lucide-react"
import type { PrizeJudgingStyle } from "@/lib/db/hackathon-types"

export const STYLE_OPTIONS: {
  value: PrizeJudgingStyle
  label: string
  description: string
  detail: string
  icon: typeof ArrowUpDown
}[] = [
  {
    value: "bucket_sort",
    label: "Sort into groups",
    description: "Judges score by sorting each project into a group like great, okay, or not ready.",
    detail: "Good for: grand prize or overall winner",
    icon: ArrowUpDown,
  },
  {
    value: "gate_check",
    label: "Pass or fail",
    description: "Judges score by giving each project a yes or no on a list of rules.",
    detail: "Good for: “Best Use of [Product]” or rule-based prizes",
    icon: ListChecks,
  },
  {
    value: "crowd_vote",
    label: "Everyone votes",
    description: "Anyone at the event can vote. No judges needed.",
    detail: "Good for: People's Choice or Audience Award",
    icon: Vote,
  },
  {
    value: "judges_pick",
    label: "Judge's picks (by vibes)",
    description: "No scoring. Each judge picks their favorites. Most picks wins.",
    detail: "Example: 3 judges each pick 1 favorite from 6 finalists. The top-picked project wins.",
    icon: Award,
  },
  {
    value: "weighted_score",
    label: "Weighted scoring",
    description: "Judges rate each project on a set of categories you define, with a weight assigned to each.",
    detail: "Good for: sponsor prizes with a custom rubric on top of shared criteria",
    icon: Sliders,
  },
]

export const DEFAULT_BUCKETS = [
  { level: 1, label: "Not Ready", description: "No working demo or unclear problem statement" },
  { level: 2, label: "Solid Effort", description: "Working demo, clear problem, but incremental or execution has gaps" },
  { level: 3, label: "Strong Contender", description: "Working demo, novel approach, good execution" },
  { level: 4, label: "Outstanding", description: "Would invest in this team today. Exceptional on multiple dimensions" },
]
