import type { Json } from "./types"

export type HackathonStatus =
  | "draft"
  | "published"
  | "registration_open"
  | "active"
  | "judging"
  | "completed"
  | "archived"

export type ParticipantRole = "participant" | "judge" | "mentor" | "organizer"

export type SubmissionStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "accepted"
  | "rejected"
  | "winner"

export type TeamStatus = "forming" | "pending_approval" | "locked" | "disbanded"

export const DEFAULT_TEAM_STATUS = "forming" satisfies TeamStatus

export const TEAM_STATUS_LABELS = {
  forming: "Forming",
  pending_approval: "Waiting for approval",
  locked: "Locked",
  disbanded: "No longer active",
} satisfies Record<TeamStatus, string>

export type InvitationStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "expired"
  | "cancelled"

export type JudgeInvitationStatus = "pending" | "accepted" | "expired" | "cancelled"

export type HackathonPhase =
  | "build"
  | "submission_open"
  | "preliminaries"
  | "finals"
  | "results_pending"

export type WebhookEvent =
  | "hackathon.created"
  | "hackathon.updated"
  | "hackathon.registration_opened"
  | "hackathon.started"
  | "hackathon.judging_started"
  | "hackathon.completed"
  | "hackathon.challenges_released"
  | "participant.registered"
  | "submission.created"
  | "submission.submitted"
  | "submission.updated"
  | "results.published"

export type TransitionTrigger = "manual" | "auto"

export type TransitionEvent =
  | "registration_opened"
  | "hackathon_started"
  | "judging_started"
  | "results_published"

export type ChallengeSummary = {
  title: string
  description: string | null
}

export interface HackathonTransition {
  id: string
  hackathon_id: string
  from_status: string
  to_status: string
  trigger: TransitionTrigger
  triggered_by: string | null
  created_at: string
}

export interface HackathonNotificationSettings {
  hackathon_id: string
  email_on_registration_open: boolean
  email_on_hackathon_active: boolean
  email_on_judging_started: boolean
  email_on_results_published: boolean
  email_on_challenges_released: boolean
  created_at: string
  updated_at: string
}

export type ScheduleFrequency =
  | "once"
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  | "cron"

export type ApiCredentialProvider = "luma"

export type IntegrationProvider =
  | "gmail"
  | "google_calendar"
  | "notion"
  | "luma"

export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "canceled"

export interface Hackathon {
  id: string
  tenant_id: string
  name: string
  slug: string
  description: string | null
  rules: string | null
  starts_at: string | null
  ends_at: string | null
  registration_opens_at: string | null
  registration_closes_at: string | null
  allow_late_registration: boolean
  max_participants: number | null
  min_team_size: number
  max_team_size: number
  allow_solo: boolean
  require_team_approval: boolean
  status: HackathonStatus
  banner_url: string | null
  location_type: "in_person" | "virtual" | "hybrid" | null
  location_name: string | null
  location_url: string | null
  location_latitude: number | null
  location_longitude: number | null
  require_location_verification: boolean
  anonymous_judging: boolean
  judging_mode: JudgingMode
  results_published_at: string | null
  winner_emails_sent_at: string | null
  results_announcement_sent_at: string | null
  feedback_survey_sent_at: string | null
  feedback_survey_url: string | null
  phase: HackathonPhase | null
  challenge_released_at: string | null
  perks_none: boolean
  community_url: string | null
  community_label: string | null
  require_terms_acceptance: boolean
  terms_content: string | null
  translations: Record<string, Partial<Record<"name" | "description" | "rules" | "location_name" | "community_label", string>>> | null
  default_locale: string | null
  metadata: Json
  created_at: string
  updated_at: string
}

export type TeamMode = "in_person" | "virtual"

export interface Team {
  id: string
  hackathon_id: string
  name: string
  captain_clerk_user_id: string
  invite_code: string
  status: TeamStatus
  mode: TeamMode | null
  created_at: string
  updated_at: string
}

export interface TeamInvitation {
  id: string
  team_id: string
  hackathon_id: string
  email: string
  token: string
  invited_by_clerk_user_id: string
  status: InvitationStatus
  expires_at: string
  accepted_at: string | null
  accepted_by_clerk_user_id: string | null
  reminded_at: string | null
  emailed_at: string | null
  created_at: string
  updated_at: string
}

export interface HackathonParticipant {
  id: string
  hackathon_id: string
  clerk_user_id: string
  role: ParticipantRole
  team_id: string | null
  registered_at: string
}

export interface Submission {
  id: string
  hackathon_id: string
  participant_id: string | null
  team_id: string | null
  title: string
  description: string | null
  github_url: string | null
  live_app_url: string | null
  demo_video_url: string | null
  screenshot_url: string | null
  status: SubmissionStatus
  metadata: Json
  created_at: string
  updated_at: string
}

export interface Job {
  id: string
  tenant_id: string
  type: string
  input: Json
  result: Json
  error: Json
  status_cache: JobStatus
  workflow_run_id: string | null
  created_by_key_id: string | null
  idempotency_key: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
}

export interface Tenant {
  id: string
  clerk_org_id: string | null
  clerk_user_id: string | null
  name: string
  slug: string | null
  logo_url: string | null
  logo_url_dark: string | null
  description: string | null
  website_url: string | null
  created_at: string
  updated_at: string
}

export interface AuditLog {
  id: string
  tenant_id: string
  action: string
  actor_type: "user" | "api_key"
  actor_id: string
  resource_type: string
  resource_id: string | null
  metadata: Json
  created_at: string
}

export interface ApiKey {
  id: string
  tenant_id: string
  name: string
  prefix: string
  hash: string
  scopes: string[]
  revoked_at: string | null
  last_used_at: string | null
  created_at: string
}

export interface OrgApiCredential {
  id: string
  tenant_id: string
  provider: ApiCredentialProvider
  api_key_encrypted: string
  label: string | null
  account_identifier: string | null
  is_active: boolean
  last_used_at: string | null
  created_at: string
  updated_at: string
}

export interface Webhook {
  id: string
  tenant_id: string
  url: string
  secret: string
  events: WebhookEvent[]
  is_active: boolean
  failure_count: number
  last_triggered_at: string | null
  last_success_at: string | null
  last_failure_at: string | null
  created_at: string
  updated_at: string
}

export interface WebhookDelivery {
  id: string
  webhook_id: string
  event: WebhookEvent
  payload: Json
  response_status: number | null
  response_body: string | null
  attempt: number
  delivered_at: string | null
  created_at: string
}

export interface Schedule {
  id: string
  tenant_id: string
  agent_id: string | null
  job_type: string | null
  name: string
  frequency: ScheduleFrequency
  cron_expression: string | null
  timezone: string
  run_time: string | null
  input: Json | null
  is_active: boolean
  next_run_at: string | null
  last_run_at: string | null
  run_count: number
  created_at: string
  updated_at: string
}

export interface OrgIntegration {
  id: string
  tenant_id: string
  provider: IntegrationProvider
  account_email: string | null
  access_token_encrypted: string
  refresh_token_encrypted: string | null
  token_expires_at: string | null
  scopes: string[] | null
  metadata: Json | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type SponsorTier = "none" | "gold" | "silver" | "bronze" | "custom"

export interface HackathonSponsor {
  id: string
  hackathon_id: string
  sponsor_tenant_id: string | null
  tenant_sponsor_id: string | null
  use_org_assets: boolean
  name: string
  logo_url: string | null
  logo_url_dark: string | null
  website_url: string | null
  tier: SponsorTier
  custom_tier_label: string | null
  display_order: number
  created_at: string
}

export interface JudgingCriteria {
  id: string
  hackathon_id: string
  name: string
  description: string | null
  max_score: number
  weight: number
  category: CriterionCategory | null
  display_order: number
  created_at: string
  updated_at: string
}

export type JudgeAssignmentKind = "per_prize" | "unified_weighted_score"

export interface JudgeAssignment {
  id: string
  hackathon_id: string
  judge_participant_id: string
  submission_id: string
  notes: string
  is_complete: boolean
  assigned_at: string
  completed_at: string | null
  viewed_at: string | null
  prize_id: string | null
  round_id: string | null
  room_id: string | null
  assignment_kind: JudgeAssignmentKind
}

export interface JudgePick {
  id: string
  hackathon_id: string
  judge_participant_id: string
  prize_id: string
  submission_id: string
  rank: number
  reason: string | null
  created_at: string
  updated_at: string
}

export interface Score {
  id: string
  judge_assignment_id: string
  criteria_id: string
  score: number
  created_at: string
  updated_at: string
}

export type PrizeType = "score" | "favorite" | "crowd" | "criteria"

export interface Prize {
  id: string
  hackathon_id: string
  name: string
  description: string | null
  value: string | null
  type: PrizeType
  rank: number | null
  kind: string
  monetary_value: number | null
  currency: string | null
  distribution_method: string | null
  display_value: string | null
  criteria_id: string | null
  prize_track_id: string | null
  judging_style: PrizeJudgingStyle | null
  round_id: string | null
  assignment_mode: PrizeAssignmentMode | null
  max_picks: number | null
  is_screening: boolean
  allowed_team_modes: TeamMode[] | null
  display_order: number
  created_at: string
  updated_at: string
}

export type JudgingMode = "points" | "subjective" | "rubric"

export type PrizeJudgingStyle =
  | "bucket_sort"
  | "gate_check"
  | "crowd_vote"
  | "judges_pick"
  | "weighted_score"

export type PrizeAssignmentMode = "organizer_assigned" | "self_select"

export type JudgingStyle =
  | "bucket_sort"
  | "gate_check"
  | "head_to_head"
  | "top_n"
  | "compliance"
  | "crowd"
  | "points"
  | "subjective"

export type RoundStatus = "planned" | "active" | "complete" | "advanced"

export type AdvancementRule = "top_n" | "threshold" | "manual"

export type TrackIntent =
  | "overall_winner"
  | "sponsor_prize"
  | "crowd_favorite"
  | "quick_comparison"
  | "custom"

export type CriterionCategory = "core" | "bonus"

export interface PrizeTrack {
  id: string
  hackathon_id: string
  name: string
  description: string | null
  intent: TrackIntent
  sponsor_id: string | null
  display_order: number
  created_at: string
  updated_at: string
}

export interface BucketDefinition {
  id: string
  round_id: string | null
  prize_id: string | null
  level: number
  label: string
  description: string | null
  display_order: number
  created_at: string
}

export interface BucketResponse {
  id: string
  judge_assignment_id: string
  bucket_id: string
  notes: string | null
  created_at: string
  updated_at: string
}

export interface BinaryResponse {
  id: string
  judge_assignment_id: string
  criteria_id: string
  passed: boolean
  created_at: string
  updated_at: string
}

export interface JudgingRound {
  id: string
  hackathon_id: string
  prize_track_id: string | null
  name: string
  round_type: string | null
  style: JudgingStyle | null
  status: RoundStatus
  advancement: AdvancementRule
  advancement_config: Record<string, unknown>
  is_active: boolean
  display_order: number
  created_at: string
  updated_at: string
}

export interface RubricLevel {
  id: string
  criteria_id: string
  level_number: number
  label: string
  description: string | null
  created_at: string
}

export interface PrizeAssignment {
  id: string
  prize_id: string
  submission_id: string
  assigned_at: string
}

export type HackathonResultKind = "prize" | "core_only"

export interface HackathonResult {
  id: string
  hackathon_id: string
  submission_id: string
  rank: number
  total_score: number | null
  weighted_score: number | null
  judge_count: number
  published_at: string | null
  created_at: string
  prize_id: string | null
  result_kind: HackathonResultKind
}

export interface JudgeInvitation {
  id: string
  hackathon_id: string
  email: string
  token: string
  invited_by_clerk_user_id: string
  status: JudgeInvitationStatus
  accepted_by_clerk_user_id: string | null
  expires_at: string
  emailed_at: string | null
  reminded_at: string | null
  created_at: string
  updated_at: string
}

export interface JudgePendingNotification {
  id: string
  hackathon_id: string
  participant_id: string
  email: string
  added_by_name: string
  sent_at: string | null
  created_at: string
}

export interface HackathonJudgeDisplay {
  id: string
  hackathon_id: string
  name: string
  title: string | null
  organization: string | null
  headshot_url: string | null
  clerk_user_id: string | null
  participant_id: string | null
  display_order: number
  created_at: string
  updated_at: string
}

export interface CrowdVote {
  id: string
  hackathon_id: string
  submission_id: string
  clerk_user_id: string
  created_at: string
}

export interface TenantProfile {
  id: string
  clerk_org_id: string | null
  clerk_user_id: string | null
  name: string
  slug: string | null
  logo_url: string | null
  logo_url_dark: string | null
  description: string | null
  website_url: string | null
  created_at: string
  updated_at: string
}

export type PrizeFulfillmentStatus = "assigned" | "contacted" | "shipped" | "claimed"

export interface PrizeFulfillment {
  id: string
  prize_assignment_id: string
  hackathon_id: string
  status: PrizeFulfillmentStatus
  recipient_email: string | null
  recipient_name: string | null
  shipping_address: string | null
  tracking_number: string | null
  notes: string | null
  payment_method: string | null
  payment_detail: string | null
  claim_token: string | null
  claim_token_expires_at: string | null
  contacted_at: string | null
  shipped_at: string | null
  claimed_at: string | null
  created_at: string
  updated_at: string
}

export type PostEventReminderType = "prize_claim" | "prize_claim_followup" | "organizer_fulfillment" | "feedback_followup" | "winner_unresponsive"

export interface PostEventReminder {
  id: string
  hackathon_id: string
  type: PostEventReminderType
  scheduled_for: string
  sent_at: string | null
  cancelled_at: string | null
  recipient_filter: string
  metadata: Json
  created_at: string
}
