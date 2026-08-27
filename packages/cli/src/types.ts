export interface CliConfig {
  apiKey: string
  baseUrl: string
  tenantId?: string
  tenantName?: string | null
  tenantType?: "organization" | "personal" | null
  keyId?: string
  scopes?: string[]
}

export interface WhoAmIResponse {
  tenantId: string
  tenantName?: string | null
  tenantSlug?: string | null
  tenantType?: "organization" | "personal" | null
  keyId: string
  scopes: string[]
  keyName?: string | null
}

export interface Hackathon {
  id: string
  name: string
  slug: string
  description?: string
  status?: string
  phase?: string
  startsAt?: string
  endsAt?: string
  allowLateRegistration?: boolean
  createdAt?: string
  updatedAt?: string
}

export interface HackathonListResponse {
  hackathons: Hackathon[]
  total?: number
  page?: number
  limit?: number
}

export interface Submission {
  id: string
  title: string
  description?: string
  submitter?: string
  createdAt?: string
  githubUrl?: string
  liveAppUrl?: string
  demoVideoUrl?: string
}

export interface JudgingCriteria {
  id: string
  hackathonId: string
  name: string
  description?: string
  maxScore: number
  weight: number
  category?: string
  orderIndex?: number
}

export interface RubricLevel {
  id: string
  criteriaId: string
  levelNumber: number
  label: string
  description?: string
}

export interface Judge {
  id: string
  hackathonId: string
  userId?: string
  email?: string
  name?: string
  completedCount?: number
  totalCount?: number
}

export interface JudgeAssignment {
  id: string
  judgeParticipantId: string
  submissionId: string
  judgeName?: string
  submissionTitle?: string
  isComplete?: boolean
  assignedAt?: string
}

export interface JudgeInvitation {
  id: string
  hackathonId: string
  email: string
  status: string
  createdAt?: string
}

export interface JudgeAddResponse {
  participant?: Judge
  invitation?: {
    id: string
    email: string
    token?: string
  }
  queued?: boolean
  delivery?: "sent" | "queued" | "failed"
  queueReason?: "event_draft"
}

export interface Prize {
  id: string
  hackathonId: string
  name: string
  description?: string
  type?: string
  value?: string
  displayOrder?: number
  assignedSubmissionId?: string
  assignedSubmissionName?: string
}

export interface Perk {
  id: string
  hackathonId: string
  sponsorId?: string | null
  name: string
  description?: string | null
  type: "api_key" | "credit" | "coupon" | "other"
  code?: string | null
  redemptionUrl?: string | null
  instructions?: string | null
  scheduledReleaseAt?: string | null
  releasedAt?: string | null
  sortOrder?: number
  createdAt?: string
  updatedAt?: string
}

export interface Sponsor {
  id: string
  name: string
  tier?: string | null
  customTierLabel?: string | null
  logoUrl?: string | null
  websiteUrl?: string | null
  displayOrder?: number
  useOrgAssets?: boolean
  sponsorTenantId?: string | null
  createdAt?: string
}

export interface Team {
  id: string
  hackathonId: string
  name: string
  status?: string
  mode?: "in_person" | "virtual" | null
  roomId?: string | null
  roomName?: string | null
  captain?: { id?: string; email?: string; name?: string } | null
  members?: Array<{ id: string; email?: string; name?: string; role?: string }>
  createdAt?: string
}

export interface Announcement {
  id: string
  hackathonId: string
  title: string
  body?: string
  audience?: string
  priority?: string
  status?: string
  publishedAt?: string | null
  scheduledAt?: string | null
  createdAt?: string
}

export interface Challenge {
  id: string
  hackathonId: string
  title: string
  description?: string | null
  resources?: Array<{ label: string; url: string }>
  displayOrder?: number
  createdAt?: string
}

export interface ScheduleItem {
  id: string
  hackathonId: string
  title: string
  description?: string | null
  startsAt?: string
  endsAt?: string | null
  location?: string | null
  type?: string | null
  displayOrder?: number
}

export interface JudgeDisplayProfile {
  id: string
  hackathonId: string
  name: string
  title?: string
  bio?: string
  headshotUrl?: string
  orderIndex?: number
}

export interface ResultsData {
  hackathonId: string
  isPublished: boolean
  publishedAt?: string
  results?: Array<{
    rank: number
    submissionId: string
    submissionTitle: string
    teamName?: string
    totalScore: number
    prizes?: string[]
  }>
}

export interface Webhook {
  id: string
  url: string
  events: string[]
  active: boolean
  signingSecret?: string
  createdAt?: string
}

export interface Job {
  id: string
  type: string
  status: string
  input?: Record<string, unknown>
  result?: Record<string, unknown>
  error?: string
  createdAt?: string
  completedAt?: string
}

export interface Schedule {
  id: string
  name: string
  cronExpression: string
  isActive: boolean
  lastRunAt?: string
  nextRunAt?: string
  createdAt?: string
}

export interface OrgProfile {
  id: string
  name: string
  slug: string
  description?: string
  organizedHackathons?: unknown[]
  sponsoredHackathons?: unknown[]
}

export interface PrizeTrack {
  trackId: string
  trackName: string
  description?: string | null
  intent?: string
  style?: string | null
  displayOrder?: number
  totalAssignments: number
  completedAssignments: number
}

export interface TrackDetail {
  id: string
  name: string
  description: string | null
  intent: string
  displayOrder?: number
  rounds: TrackRound[]
}

export interface TrackRound {
  id: string
  name: string
  style: string | null
  status: string
  advancement: string
  advancementConfig: Record<string, unknown>
  displayOrder: number
  buckets: BucketDef[]
}

export interface BucketDef {
  id: string
  level: number
  label: string
  description: string | null
}

export interface PickResults {
  hackathonId: string
  results: Record<string, unknown>
}

export type PresenterViewConfig =
  | { kind: "round_finalists"; roundId: string }
  | { kind: "manual"; submissionIds: string[] }

export interface PresenterView {
  id: string
  hackathon_id: string
  name: string
  config: PresenterViewConfig
  created_at: string
  updated_at: string
}

export interface PaginationParams {
  page?: number
  limit?: number
}

export interface ApiResponse<T> {
  data?: T
  error?: string
  message?: string
}
