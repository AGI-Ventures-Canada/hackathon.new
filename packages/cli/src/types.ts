export interface CliConfig {
  apiKey: string
  baseUrl: string
  tenantId?: string
  keyId?: string
  scopes?: string[]
}

export interface WhoAmIResponse {
  tenantId: string
  keyId: string
  scopes: string[]
  keyName: string
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

export interface PaginationParams {
  page?: number
  limit?: number
}

export interface ApiResponse<T> {
  data?: T
  error?: string
  message?: string
}
