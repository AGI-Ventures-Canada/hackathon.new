export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      api_keys: {
        Row: {
          created_at: string
          hash: string
          id: string
          last_used_at: string | null
          name: string
          prefix: string
          revoked_at: string | null
          scopes: string[]
          tenant_id: string
        }
        Insert: {
          created_at?: string
          hash: string
          id?: string
          last_used_at?: string | null
          name: string
          prefix: string
          revoked_at?: string | null
          scopes?: string[]
          tenant_id: string
        }
        Update: {
          created_at?: string
          hash?: string
          id?: string
          last_used_at?: string | null
          name?: string
          prefix?: string
          revoked_at?: string | null
          scopes?: string[]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string
          actor_type: Database["public"]["Enums"]["actor_type"]
          created_at: string
          id: string
          metadata: Json | null
          resource_id: string | null
          resource_type: string
          tenant_id: string
        }
        Insert: {
          action: string
          actor_id: string
          actor_type: Database["public"]["Enums"]["actor_type"]
          created_at?: string
          id?: string
          metadata?: Json | null
          resource_id?: string | null
          resource_type: string
          tenant_id: string
        }
        Update: {
          action?: string
          actor_id?: string
          actor_type?: Database["public"]["Enums"]["actor_type"]
          created_at?: string
          id?: string
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      binary_responses: {
        Row: {
          created_at: string
          criteria_id: string
          id: string
          judge_assignment_id: string
          passed: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          criteria_id: string
          id?: string
          judge_assignment_id: string
          passed: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          criteria_id?: string
          id?: string
          judge_assignment_id?: string
          passed?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "binary_responses_criteria_id_fkey"
            columns: ["criteria_id"]
            isOneToOne: false
            referencedRelation: "judging_criteria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "binary_responses_judge_assignment_id_fkey"
            columns: ["judge_assignment_id"]
            isOneToOne: false
            referencedRelation: "judge_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      bucket_definitions: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          id: string
          label: string
          level: number
          prize_id: string | null
          round_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          label: string
          level: number
          prize_id?: string | null
          round_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          label?: string
          level?: number
          prize_id?: string | null
          round_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bucket_definitions_prize_id_fkey"
            columns: ["prize_id"]
            isOneToOne: false
            referencedRelation: "prizes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bucket_definitions_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "judging_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      bucket_responses: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          judge_assignment_id: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id?: string
          judge_assignment_id: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          judge_assignment_id?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bucket_responses_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "bucket_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bucket_responses_judge_assignment_id_fkey"
            columns: ["judge_assignment_id"]
            isOneToOne: true
            referencedRelation: "judge_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      challenges: {
        Row: {
          created_at: string
          description: string | null
          hackathon_id: string
          id: string
          resources: Json
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          hackathon_id: string
          id?: string
          resources?: Json
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          hackathon_id?: string
          id?: string
          resources?: Json
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenges_hackathon_id_fkey"
            columns: ["hackathon_id"]
            isOneToOne: false
            referencedRelation: "hackathons"
            referencedColumns: ["id"]
          },
        ]
      }
      cli_auth_sessions: {
        Row: {
          created_at: string
          device_token: string
          encrypted_api_key: string | null
          expires_at: string
          id: string
          key_id: string | null
          status: string
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          device_token: string
          encrypted_api_key?: string | null
          expires_at?: string
          id?: string
          key_id?: string | null
          status?: string
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          device_token?: string
          encrypted_api_key?: string | null
          expires_at?: string
          id?: string
          key_id?: string | null
          status?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cli_auth_sessions_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cli_auth_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crowd_votes: {
        Row: {
          clerk_user_id: string
          created_at: string
          hackathon_id: string
          id: string
          prize_id: string | null
          submission_id: string
        }
        Insert: {
          clerk_user_id: string
          created_at?: string
          hackathon_id: string
          id?: string
          prize_id?: string | null
          submission_id: string
        }
        Update: {
          clerk_user_id?: string
          created_at?: string
          hackathon_id?: string
          id?: string
          prize_id?: string | null
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crowd_votes_hackathon_id_fkey"
            columns: ["hackathon_id"]
            isOneToOne: false
            referencedRelation: "hackathons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crowd_votes_prize_id_fkey"
            columns: ["prize_id"]
            isOneToOne: false
            referencedRelation: "prizes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crowd_votes_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      hackathon_announcements: {
        Row: {
          audience: string
          body: string
          created_at: string
          hackathon_id: string
          id: string
          priority: string
          published_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          audience?: string
          body: string
          created_at?: string
          hackathon_id: string
          id?: string
          priority?: string
          published_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          audience?: string
          body?: string
          created_at?: string
          hackathon_id?: string
          id?: string
          priority?: string
          published_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hackathon_announcements_hackathon_id_fkey"
            columns: ["hackathon_id"]
            isOneToOne: false
            referencedRelation: "hackathons"
            referencedColumns: ["id"]
          },
        ]
      }
      hackathon_judges_display: {
        Row: {
          clerk_user_id: string | null
          created_at: string
          display_order: number
          hackathon_id: string
          headshot_url: string | null
          id: string
          name: string
          organization: string | null
          participant_id: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          clerk_user_id?: string | null
          created_at?: string
          display_order?: number
          hackathon_id: string
          headshot_url?: string | null
          id?: string
          name: string
          organization?: string | null
          participant_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          clerk_user_id?: string | null
          created_at?: string
          display_order?: number
          hackathon_id?: string
          headshot_url?: string | null
          id?: string
          name?: string
          organization?: string | null
          participant_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hackathon_judges_display_hackathon_id_fkey"
            columns: ["hackathon_id"]
            isOneToOne: false
            referencedRelation: "hackathons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hackathon_judges_display_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "hackathon_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      hackathon_notification_settings: {
        Row: {
          created_at: string
          email_on_hackathon_active: boolean
          email_on_judging_started: boolean
          email_on_registration_open: boolean
          email_on_results_published: boolean
          hackathon_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email_on_hackathon_active?: boolean
          email_on_judging_started?: boolean
          email_on_registration_open?: boolean
          email_on_results_published?: boolean
          hackathon_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email_on_hackathon_active?: boolean
          email_on_judging_started?: boolean
          email_on_registration_open?: boolean
          email_on_results_published?: boolean
          hackathon_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hackathon_notification_settings_hackathon_id_fkey"
            columns: ["hackathon_id"]
            isOneToOne: true
            referencedRelation: "hackathons"
            referencedColumns: ["id"]
          },
        ]
      }
      hackathon_participants: {
        Row: {
          clerk_user_id: string
          hackathon_id: string
          id: string
          registered_at: string
          role: Database["public"]["Enums"]["participant_role"]
          team_id: string | null
        }
        Insert: {
          clerk_user_id: string
          hackathon_id: string
          id?: string
          registered_at?: string
          role?: Database["public"]["Enums"]["participant_role"]
          team_id?: string | null
        }
        Update: {
          clerk_user_id?: string
          hackathon_id?: string
          id?: string
          registered_at?: string
          role?: Database["public"]["Enums"]["participant_role"]
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hackathon_participants_hackathon_id_fkey"
            columns: ["hackathon_id"]
            isOneToOne: false
            referencedRelation: "hackathons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hackathon_participants_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      hackathon_perks: {
        Row: {
          code: string | null
          created_at: string
          description: string | null
          hackathon_id: string
          id: string
          instructions: string | null
          name: string
          redemption_url: string | null
          released_at: string | null
          scheduled_release_at: string | null
          sort_order: number
          sponsor_id: string | null
          type: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          description?: string | null
          hackathon_id: string
          id?: string
          instructions?: string | null
          name: string
          redemption_url?: string | null
          released_at?: string | null
          scheduled_release_at?: string | null
          sort_order?: number
          sponsor_id?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          description?: string | null
          hackathon_id?: string
          id?: string
          instructions?: string | null
          name?: string
          redemption_url?: string | null
          released_at?: string | null
          scheduled_release_at?: string | null
          sort_order?: number
          sponsor_id?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hackathon_perks_hackathon_id_fkey"
            columns: ["hackathon_id"]
            isOneToOne: false
            referencedRelation: "hackathons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hackathon_perks_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "hackathon_sponsors"
            referencedColumns: ["id"]
          },
        ]
      }
      hackathon_results: {
        Row: {
          created_at: string
          hackathon_id: string
          id: string
          judge_count: number
          prize_id: string | null
          prize_track_id: string | null
          published_at: string | null
          rank: number
          round_id: string | null
          submission_id: string
          total_score: number | null
          weighted_score: number | null
        }
        Insert: {
          created_at?: string
          hackathon_id: string
          id?: string
          judge_count?: number
          prize_id?: string | null
          prize_track_id?: string | null
          published_at?: string | null
          rank: number
          round_id?: string | null
          submission_id: string
          total_score?: number | null
          weighted_score?: number | null
        }
        Update: {
          created_at?: string
          hackathon_id?: string
          id?: string
          judge_count?: number
          prize_id?: string | null
          prize_track_id?: string | null
          published_at?: string | null
          rank?: number
          round_id?: string | null
          submission_id?: string
          total_score?: number | null
          weighted_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hackathon_results_hackathon_id_fkey"
            columns: ["hackathon_id"]
            isOneToOne: false
            referencedRelation: "hackathons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hackathon_results_prize_id_fkey"
            columns: ["prize_id"]
            isOneToOne: false
            referencedRelation: "prizes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hackathon_results_prize_track_id_fkey"
            columns: ["prize_track_id"]
            isOneToOne: false
            referencedRelation: "prize_tracks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hackathon_results_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "judging_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hackathon_results_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      hackathon_schedule_items: {
        Row: {
          created_at: string
          description: string | null
          ends_at: string | null
          hackathon_id: string
          id: string
          linked_to: string | null
          location: string | null
          sort_order: number
          starts_at: string
          title: string
          trigger_type: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          ends_at?: string | null
          hackathon_id: string
          id?: string
          linked_to?: string | null
          location?: string | null
          sort_order?: number
          starts_at: string
          title: string
          trigger_type?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          ends_at?: string | null
          hackathon_id?: string
          id?: string
          linked_to?: string | null
          location?: string | null
          sort_order?: number
          starts_at?: string
          title?: string
          trigger_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hackathon_schedule_items_hackathon_id_fkey"
            columns: ["hackathon_id"]
            isOneToOne: false
            referencedRelation: "hackathons"
            referencedColumns: ["id"]
          },
        ]
      }
      hackathon_sponsors: {
        Row: {
          created_at: string
          custom_tier_label: string | null
          display_order: number
          hackathon_id: string
          id: string
          logo_url: string | null
          logo_url_dark: string | null
          name: string
          sponsor_tenant_id: string | null
          tenant_sponsor_id: string | null
          tier: Database["public"]["Enums"]["sponsor_tier"]
          use_org_assets: boolean
          website_url: string | null
        }
        Insert: {
          created_at?: string
          custom_tier_label?: string | null
          display_order?: number
          hackathon_id: string
          id?: string
          logo_url?: string | null
          logo_url_dark?: string | null
          name: string
          sponsor_tenant_id?: string | null
          tenant_sponsor_id?: string | null
          tier?: Database["public"]["Enums"]["sponsor_tier"]
          use_org_assets?: boolean
          website_url?: string | null
        }
        Update: {
          created_at?: string
          custom_tier_label?: string | null
          display_order?: number
          hackathon_id?: string
          id?: string
          logo_url?: string | null
          logo_url_dark?: string | null
          name?: string
          sponsor_tenant_id?: string | null
          tenant_sponsor_id?: string | null
          tier?: Database["public"]["Enums"]["sponsor_tier"]
          use_org_assets?: boolean
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hackathon_sponsors_hackathon_id_fkey"
            columns: ["hackathon_id"]
            isOneToOne: false
            referencedRelation: "hackathons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hackathon_sponsors_sponsor_tenant_id_fkey"
            columns: ["sponsor_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hackathon_sponsors_tenant_sponsor_id_fkey"
            columns: ["tenant_sponsor_id"]
            isOneToOne: false
            referencedRelation: "tenant_sponsors"
            referencedColumns: ["id"]
          },
        ]
      }
      hackathon_transitions: {
        Row: {
          created_at: string
          from_status: string
          hackathon_id: string
          id: string
          to_status: string
          trigger: string
          triggered_by: string | null
        }
        Insert: {
          created_at?: string
          from_status: string
          hackathon_id: string
          id?: string
          to_status: string
          trigger: string
          triggered_by?: string | null
        }
        Update: {
          created_at?: string
          from_status?: string
          hackathon_id?: string
          id?: string
          to_status?: string
          trigger?: string
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hackathon_transitions_hackathon_id_fkey"
            columns: ["hackathon_id"]
            isOneToOne: false
            referencedRelation: "hackathons"
            referencedColumns: ["id"]
          },
        ]
      }
      hackathons: {
        Row: {
          allow_solo: boolean | null
          anonymous_judging: boolean
          banner_url: string | null
          challenge_released_at: string | null
          created_at: string
          description: string | null
          ends_at: string | null
          feedback_survey_sent_at: string | null
          feedback_survey_url: string | null
          id: string
          judging_mode: Database["public"]["Enums"]["judging_mode"] | null
          location_latitude: number | null
          location_longitude: number | null
          location_name: string | null
          location_type: Database["public"]["Enums"]["location_type"] | null
          location_url: string | null
          max_participants: number | null
          max_team_size: number | null
          metadata: Json | null
          min_team_size: number | null
          name: string
          perks_none: boolean
          phase: Database["public"]["Enums"]["hackathon_phase"] | null
          registration_closes_at: string | null
          registration_opens_at: string | null
          require_location_verification: boolean
          results_announcement_sent_at: string | null
          results_published_at: string | null
          rules: string | null
          slug: string
          starts_at: string | null
          status: Database["public"]["Enums"]["hackathon_status"]
          tenant_id: string
          updated_at: string
          winner_emails_sent_at: string | null
        }
        Insert: {
          allow_solo?: boolean | null
          anonymous_judging?: boolean
          banner_url?: string | null
          challenge_released_at?: string | null
          created_at?: string
          description?: string | null
          ends_at?: string | null
          feedback_survey_sent_at?: string | null
          feedback_survey_url?: string | null
          id?: string
          judging_mode?: Database["public"]["Enums"]["judging_mode"] | null
          location_latitude?: number | null
          location_longitude?: number | null
          location_name?: string | null
          location_type?: Database["public"]["Enums"]["location_type"] | null
          location_url?: string | null
          max_participants?: number | null
          max_team_size?: number | null
          metadata?: Json | null
          min_team_size?: number | null
          name: string
          perks_none?: boolean
          phase?: Database["public"]["Enums"]["hackathon_phase"] | null
          registration_closes_at?: string | null
          registration_opens_at?: string | null
          require_location_verification?: boolean
          results_announcement_sent_at?: string | null
          results_published_at?: string | null
          rules?: string | null
          slug: string
          starts_at?: string | null
          status?: Database["public"]["Enums"]["hackathon_status"]
          tenant_id: string
          updated_at?: string
          winner_emails_sent_at?: string | null
        }
        Update: {
          allow_solo?: boolean | null
          anonymous_judging?: boolean
          banner_url?: string | null
          challenge_released_at?: string | null
          created_at?: string
          description?: string | null
          ends_at?: string | null
          feedback_survey_sent_at?: string | null
          feedback_survey_url?: string | null
          id?: string
          judging_mode?: Database["public"]["Enums"]["judging_mode"] | null
          location_latitude?: number | null
          location_longitude?: number | null
          location_name?: string | null
          location_type?: Database["public"]["Enums"]["location_type"] | null
          location_url?: string | null
          max_participants?: number | null
          max_team_size?: number | null
          metadata?: Json | null
          min_team_size?: number | null
          name?: string
          perks_none?: boolean
          phase?: Database["public"]["Enums"]["hackathon_phase"] | null
          registration_closes_at?: string | null
          registration_opens_at?: string | null
          require_location_verification?: boolean
          results_announcement_sent_at?: string | null
          results_published_at?: string | null
          rules?: string | null
          slug?: string
          starts_at?: string | null
          status?: Database["public"]["Enums"]["hackathon_status"]
          tenant_id?: string
          updated_at?: string
          winner_emails_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hackathons_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by_key_id: string | null
          error: Json | null
          id: string
          idempotency_key: string | null
          input: Json | null
          result: Json | null
          status_cache: Database["public"]["Enums"]["job_status"]
          tenant_id: string
          type: string
          updated_at: string
          workflow_run_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by_key_id?: string | null
          error?: Json | null
          id?: string
          idempotency_key?: string | null
          input?: Json | null
          result?: Json | null
          status_cache?: Database["public"]["Enums"]["job_status"]
          tenant_id: string
          type: string
          updated_at?: string
          workflow_run_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by_key_id?: string | null
          error?: Json | null
          id?: string
          idempotency_key?: string | null
          input?: Json | null
          result?: Json | null
          status_cache?: Database["public"]["Enums"]["job_status"]
          tenant_id?: string
          type?: string
          updated_at?: string
          workflow_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_created_by_key_id_fkey"
            columns: ["created_by_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      judge_assignments: {
        Row: {
          assigned_at: string
          completed_at: string | null
          hackathon_id: string
          id: string
          is_complete: boolean
          judge_participant_id: string
          notes: string
          prize_id: string | null
          room_id: string | null
          round_id: string | null
          submission_id: string
          viewed_at: string | null
        }
        Insert: {
          assigned_at?: string
          completed_at?: string | null
          hackathon_id: string
          id?: string
          is_complete?: boolean
          judge_participant_id: string
          notes?: string
          prize_id?: string | null
          room_id?: string | null
          round_id?: string | null
          submission_id: string
          viewed_at?: string | null
        }
        Update: {
          assigned_at?: string
          completed_at?: string | null
          hackathon_id?: string
          id?: string
          is_complete?: boolean
          judge_participant_id?: string
          notes?: string
          prize_id?: string | null
          room_id?: string | null
          round_id?: string | null
          submission_id?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "judge_assignments_hackathon_id_fkey"
            columns: ["hackathon_id"]
            isOneToOne: false
            referencedRelation: "hackathons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judge_assignments_judge_participant_id_fkey"
            columns: ["judge_participant_id"]
            isOneToOne: false
            referencedRelation: "hackathon_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judge_assignments_prize_id_fkey"
            columns: ["prize_id"]
            isOneToOne: false
            referencedRelation: "prizes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judge_assignments_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judge_assignments_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "judging_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judge_assignments_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      judge_invitations: {
        Row: {
          accepted_by_clerk_user_id: string | null
          created_at: string
          email: string
          emailed_at: string | null
          expires_at: string
          hackathon_id: string
          id: string
          invited_by_clerk_user_id: string
          status: string
          token: string
          updated_at: string
        }
        Insert: {
          accepted_by_clerk_user_id?: string | null
          created_at?: string
          email: string
          emailed_at?: string | null
          expires_at: string
          hackathon_id: string
          id?: string
          invited_by_clerk_user_id: string
          status?: string
          token: string
          updated_at?: string
        }
        Update: {
          accepted_by_clerk_user_id?: string | null
          created_at?: string
          email?: string
          emailed_at?: string | null
          expires_at?: string
          hackathon_id?: string
          id?: string
          invited_by_clerk_user_id?: string
          status?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "judge_invitations_hackathon_id_fkey"
            columns: ["hackathon_id"]
            isOneToOne: false
            referencedRelation: "hackathons"
            referencedColumns: ["id"]
          },
        ]
      }
      judge_pending_notifications: {
        Row: {
          added_by_name: string
          created_at: string
          email: string
          hackathon_id: string
          id: string
          participant_id: string
          sent_at: string | null
        }
        Insert: {
          added_by_name: string
          created_at?: string
          email: string
          hackathon_id: string
          id?: string
          participant_id: string
          sent_at?: string | null
        }
        Update: {
          added_by_name?: string
          created_at?: string
          email?: string
          hackathon_id?: string
          id?: string
          participant_id?: string
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "judge_pending_notifications_hackathon_id_fkey"
            columns: ["hackathon_id"]
            isOneToOne: false
            referencedRelation: "hackathons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judge_pending_notifications_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "hackathon_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      judge_picks: {
        Row: {
          created_at: string
          hackathon_id: string
          id: string
          judge_participant_id: string
          prize_id: string
          rank: number
          reason: string | null
          submission_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          hackathon_id: string
          id?: string
          judge_participant_id: string
          prize_id: string
          rank?: number
          reason?: string | null
          submission_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          hackathon_id?: string
          id?: string
          judge_participant_id?: string
          prize_id?: string
          rank?: number
          reason?: string | null
          submission_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "judge_picks_hackathon_id_fkey"
            columns: ["hackathon_id"]
            isOneToOne: false
            referencedRelation: "hackathons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judge_picks_judge_participant_id_fkey"
            columns: ["judge_participant_id"]
            isOneToOne: false
            referencedRelation: "hackathon_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judge_picks_prize_id_fkey"
            columns: ["prize_id"]
            isOneToOne: false
            referencedRelation: "prizes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judge_picks_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      judge_prize_assignments: {
        Row: {
          created_at: string
          hackathon_id: string
          id: string
          judge_participant_id: string
          prize_id: string
        }
        Insert: {
          created_at?: string
          hackathon_id: string
          id?: string
          judge_participant_id: string
          prize_id: string
        }
        Update: {
          created_at?: string
          hackathon_id?: string
          id?: string
          judge_participant_id?: string
          prize_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "judge_prize_assignments_hackathon_id_fkey"
            columns: ["hackathon_id"]
            isOneToOne: false
            referencedRelation: "hackathons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judge_prize_assignments_judge_participant_id_fkey"
            columns: ["judge_participant_id"]
            isOneToOne: false
            referencedRelation: "hackathon_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judge_prize_assignments_prize_id_fkey"
            columns: ["prize_id"]
            isOneToOne: false
            referencedRelation: "prizes"
            referencedColumns: ["id"]
          },
        ]
      }
      judging_criteria: {
        Row: {
          category: Database["public"]["Enums"]["criterion_category"] | null
          category_id: string | null
          created_at: string
          description: string | null
          display_order: number
          hackathon_id: string
          id: string
          max_score: number
          name: string
          round_id: string | null
          updated_at: string
          weight: number
        }
        Insert: {
          category?: Database["public"]["Enums"]["criterion_category"] | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          hackathon_id: string
          id?: string
          max_score?: number
          name: string
          round_id?: string | null
          updated_at?: string
          weight?: number
        }
        Update: {
          category?: Database["public"]["Enums"]["criterion_category"] | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          hackathon_id?: string
          id?: string
          max_score?: number
          name?: string
          round_id?: string | null
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "judging_criteria_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "submission_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judging_criteria_hackathon_id_fkey"
            columns: ["hackathon_id"]
            isOneToOne: false
            referencedRelation: "hackathons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judging_criteria_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "judging_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      judging_rounds: {
        Row: {
          advancement: Database["public"]["Enums"]["advancement_rule"]
          advancement_config: Json | null
          created_at: string
          display_order: number
          hackathon_id: string
          id: string
          is_active: boolean
          name: string
          prize_track_id: string | null
          round_type: string | null
          status: Database["public"]["Enums"]["round_status"]
          style: Database["public"]["Enums"]["judging_style"] | null
          updated_at: string
        }
        Insert: {
          advancement?: Database["public"]["Enums"]["advancement_rule"]
          advancement_config?: Json | null
          created_at?: string
          display_order?: number
          hackathon_id: string
          id?: string
          is_active?: boolean
          name: string
          prize_track_id?: string | null
          round_type?: string | null
          status?: Database["public"]["Enums"]["round_status"]
          style?: Database["public"]["Enums"]["judging_style"] | null
          updated_at?: string
        }
        Update: {
          advancement?: Database["public"]["Enums"]["advancement_rule"]
          advancement_config?: Json | null
          created_at?: string
          display_order?: number
          hackathon_id?: string
          id?: string
          is_active?: boolean
          name?: string
          prize_track_id?: string | null
          round_type?: string | null
          status?: Database["public"]["Enums"]["round_status"]
          style?: Database["public"]["Enums"]["judging_style"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "judging_rounds_hackathon_id_fkey"
            columns: ["hackathon_id"]
            isOneToOne: false
            referencedRelation: "hackathons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judging_rounds_prize_track_id_fkey"
            columns: ["prize_track_id"]
            isOneToOne: false
            referencedRelation: "prize_tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      mentor_requests: {
        Row: {
          category: string | null
          claimed_at: string | null
          claimed_by_participant_id: string | null
          created_at: string
          description: string | null
          hackathon_id: string
          id: string
          requester_participant_id: string
          resolved_at: string | null
          status: Database["public"]["Enums"]["mentor_request_status"]
          team_id: string | null
        }
        Insert: {
          category?: string | null
          claimed_at?: string | null
          claimed_by_participant_id?: string | null
          created_at?: string
          description?: string | null
          hackathon_id: string
          id?: string
          requester_participant_id: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["mentor_request_status"]
          team_id?: string | null
        }
        Update: {
          category?: string | null
          claimed_at?: string | null
          claimed_by_participant_id?: string | null
          created_at?: string
          description?: string | null
          hackathon_id?: string
          id?: string
          requester_participant_id?: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["mentor_request_status"]
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mentor_requests_claimed_by_participant_id_fkey"
            columns: ["claimed_by_participant_id"]
            isOneToOne: false
            referencedRelation: "hackathon_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentor_requests_hackathon_id_fkey"
            columns: ["hackathon_id"]
            isOneToOne: false
            referencedRelation: "hackathons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentor_requests_requester_participant_id_fkey"
            columns: ["requester_participant_id"]
            isOneToOne: false
            referencedRelation: "hackathon_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentor_requests_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      org_api_credentials: {
        Row: {
          account_identifier: string | null
          api_key_encrypted: string
          created_at: string
          id: string
          is_active: boolean
          label: string | null
          last_used_at: string | null
          provider: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          account_identifier?: string | null
          api_key_encrypted: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          last_used_at?: string | null
          provider: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          account_identifier?: string | null
          api_key_encrypted?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          last_used_at?: string | null
          provider?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_api_credentials_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      org_integrations: {
        Row: {
          access_token_encrypted: string
          account_email: string | null
          created_at: string
          id: string
          is_active: boolean | null
          metadata: Json | null
          provider: Database["public"]["Enums"]["integration_provider"]
          refresh_token_encrypted: string | null
          scopes: string[] | null
          tenant_id: string
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token_encrypted: string
          account_email?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          provider: Database["public"]["Enums"]["integration_provider"]
          refresh_token_encrypted?: string | null
          scopes?: string[] | null
          tenant_id: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token_encrypted?: string
          account_email?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          provider?: Database["public"]["Enums"]["integration_provider"]
          refresh_token_encrypted?: string | null
          scopes?: string[] | null
          tenant_id?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_integrations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      post_event_reminders: {
        Row: {
          cancelled_at: string | null
          created_at: string
          hackathon_id: string
          id: string
          metadata: Json | null
          recipient_filter: string
          scheduled_for: string
          sent_at: string | null
          type: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          hackathon_id: string
          id?: string
          metadata?: Json | null
          recipient_filter: string
          scheduled_for: string
          sent_at?: string | null
          type: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          hackathon_id?: string
          id?: string
          metadata?: Json | null
          recipient_filter?: string
          scheduled_for?: string
          sent_at?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_event_reminders_hackathon_id_fkey"
            columns: ["hackathon_id"]
            isOneToOne: false
            referencedRelation: "hackathons"
            referencedColumns: ["id"]
          },
        ]
      }
      prize_assignments: {
        Row: {
          assigned_at: string
          id: string
          prize_id: string
          submission_id: string
        }
        Insert: {
          assigned_at?: string
          id?: string
          prize_id: string
          submission_id: string
        }
        Update: {
          assigned_at?: string
          id?: string
          prize_id?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prize_assignments_prize_id_fkey"
            columns: ["prize_id"]
            isOneToOne: false
            referencedRelation: "prizes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prize_assignments_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      prize_fulfillments: {
        Row: {
          claim_token: string | null
          claim_token_expires_at: string | null
          claimed_at: string | null
          contacted_at: string | null
          created_at: string
          hackathon_id: string
          id: string
          notes: string | null
          payment_detail: string | null
          payment_method: string | null
          prize_assignment_id: string
          recipient_email: string | null
          recipient_name: string | null
          shipped_at: string | null
          shipping_address: string | null
          status: Database["public"]["Enums"]["prize_fulfillment_status"]
          tracking_number: string | null
          updated_at: string
        }
        Insert: {
          claim_token?: string | null
          claim_token_expires_at?: string | null
          claimed_at?: string | null
          contacted_at?: string | null
          created_at?: string
          hackathon_id: string
          id?: string
          notes?: string | null
          payment_detail?: string | null
          payment_method?: string | null
          prize_assignment_id: string
          recipient_email?: string | null
          recipient_name?: string | null
          shipped_at?: string | null
          shipping_address?: string | null
          status?: Database["public"]["Enums"]["prize_fulfillment_status"]
          tracking_number?: string | null
          updated_at?: string
        }
        Update: {
          claim_token?: string | null
          claim_token_expires_at?: string | null
          claimed_at?: string | null
          contacted_at?: string | null
          created_at?: string
          hackathon_id?: string
          id?: string
          notes?: string | null
          payment_detail?: string | null
          payment_method?: string | null
          prize_assignment_id?: string
          recipient_email?: string | null
          recipient_name?: string | null
          shipped_at?: string | null
          shipping_address?: string | null
          status?: Database["public"]["Enums"]["prize_fulfillment_status"]
          tracking_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prize_fulfillments_hackathon_id_fkey"
            columns: ["hackathon_id"]
            isOneToOne: false
            referencedRelation: "hackathons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prize_fulfillments_prize_assignment_id_fkey"
            columns: ["prize_assignment_id"]
            isOneToOne: true
            referencedRelation: "prize_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      prize_tracks: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          hackathon_id: string
          id: string
          intent: Database["public"]["Enums"]["track_intent"]
          name: string
          sponsor_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          hackathon_id: string
          id?: string
          intent?: Database["public"]["Enums"]["track_intent"]
          name: string
          sponsor_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          hackathon_id?: string
          id?: string
          intent?: Database["public"]["Enums"]["track_intent"]
          name?: string
          sponsor_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prize_tracks_hackathon_id_fkey"
            columns: ["hackathon_id"]
            isOneToOne: false
            referencedRelation: "hackathons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prize_tracks_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "hackathon_sponsors"
            referencedColumns: ["id"]
          },
        ]
      }
      prizes: {
        Row: {
          allowed_team_modes: Database["public"]["Enums"]["team_mode"][] | null
          assignment_mode: string | null
          created_at: string
          criteria_id: string | null
          currency: string | null
          description: string | null
          display_order: number
          display_value: string | null
          distribution_method: string | null
          hackathon_id: string
          id: string
          is_screening: boolean
          judging_style: string | null
          kind: string
          max_picks: number | null
          monetary_value: number | null
          name: string
          prize_track_id: string | null
          rank: number | null
          round_id: string | null
          type: Database["public"]["Enums"]["prize_type"]
          updated_at: string
          value: string | null
        }
        Insert: {
          allowed_team_modes?: Database["public"]["Enums"]["team_mode"][] | null
          assignment_mode?: string | null
          created_at?: string
          criteria_id?: string | null
          currency?: string | null
          description?: string | null
          display_order?: number
          display_value?: string | null
          distribution_method?: string | null
          hackathon_id: string
          id?: string
          is_screening?: boolean
          judging_style?: string | null
          kind?: string
          max_picks?: number | null
          monetary_value?: number | null
          name: string
          prize_track_id?: string | null
          rank?: number | null
          round_id?: string | null
          type?: Database["public"]["Enums"]["prize_type"]
          updated_at?: string
          value?: string | null
        }
        Update: {
          allowed_team_modes?: Database["public"]["Enums"]["team_mode"][] | null
          assignment_mode?: string | null
          created_at?: string
          criteria_id?: string | null
          currency?: string | null
          description?: string | null
          display_order?: number
          display_value?: string | null
          distribution_method?: string | null
          hackathon_id?: string
          id?: string
          is_screening?: boolean
          judging_style?: string | null
          kind?: string
          max_picks?: number | null
          monetary_value?: number | null
          name?: string
          prize_track_id?: string | null
          rank?: number | null
          round_id?: string | null
          type?: Database["public"]["Enums"]["prize_type"]
          updated_at?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prizes_criteria_id_fkey"
            columns: ["criteria_id"]
            isOneToOne: false
            referencedRelation: "judging_criteria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prizes_hackathon_id_fkey"
            columns: ["hackathon_id"]
            isOneToOne: false
            referencedRelation: "hackathons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prizes_prize_track_id_fkey"
            columns: ["prize_track_id"]
            isOneToOne: false
            referencedRelation: "prize_tracks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prizes_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "judging_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          count: number
          key: string
          reset_at: number
        }
        Insert: {
          count?: number
          key: string
          reset_at?: number
        }
        Update: {
          count?: number
          key?: string
          reset_at?: number
        }
        Relationships: []
      }
      room_teams: {
        Row: {
          has_presented: boolean
          id: string
          present_order: number | null
          room_id: string
          team_id: string
        }
        Insert: {
          has_presented?: boolean
          id?: string
          present_order?: number | null
          room_id: string
          team_id: string
        }
        Update: {
          has_presented?: boolean
          id?: string
          present_order?: number | null
          room_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_teams_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_teams_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          created_at: string
          display_order: number
          hackathon_id: string
          id: string
          name: string
          timer_ends_at: string | null
          timer_label: string | null
          timer_remaining_ms: number | null
        }
        Insert: {
          created_at?: string
          display_order?: number
          hackathon_id: string
          id?: string
          name: string
          timer_ends_at?: string | null
          timer_label?: string | null
          timer_remaining_ms?: number | null
        }
        Update: {
          created_at?: string
          display_order?: number
          hackathon_id?: string
          id?: string
          name?: string
          timer_ends_at?: string | null
          timer_label?: string | null
          timer_remaining_ms?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rooms_hackathon_id_fkey"
            columns: ["hackathon_id"]
            isOneToOne: false
            referencedRelation: "hackathons"
            referencedColumns: ["id"]
          },
        ]
      }
      round_submissions: {
        Row: {
          advanced_at: string | null
          id: string
          round_id: string
          submission_id: string
        }
        Insert: {
          advanced_at?: string | null
          id?: string
          round_id: string
          submission_id: string
        }
        Update: {
          advanced_at?: string | null
          id?: string
          round_id?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "round_submissions_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "judging_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_submissions_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      rubric_levels: {
        Row: {
          created_at: string
          criteria_id: string
          description: string | null
          id: string
          label: string
          level_number: number
        }
        Insert: {
          created_at?: string
          criteria_id: string
          description?: string | null
          id?: string
          label: string
          level_number: number
        }
        Update: {
          created_at?: string
          criteria_id?: string
          description?: string | null
          id?: string
          label?: string
          level_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "rubric_levels_criteria_id_fkey"
            columns: ["criteria_id"]
            isOneToOne: false
            referencedRelation: "judging_criteria"
            referencedColumns: ["id"]
          },
        ]
      }
      schedules: {
        Row: {
          agent_id: string | null
          created_at: string
          cron_expression: string | null
          frequency: Database["public"]["Enums"]["schedule_frequency"]
          id: string
          input: Json | null
          is_active: boolean | null
          job_type: string | null
          last_run_at: string | null
          name: string
          next_run_at: string | null
          run_count: number | null
          run_time: string | null
          tenant_id: string
          timezone: string | null
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          cron_expression?: string | null
          frequency: Database["public"]["Enums"]["schedule_frequency"]
          id?: string
          input?: Json | null
          is_active?: boolean | null
          job_type?: string | null
          last_run_at?: string | null
          name: string
          next_run_at?: string | null
          run_count?: number | null
          run_time?: string | null
          tenant_id: string
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          cron_expression?: string | null
          frequency?: Database["public"]["Enums"]["schedule_frequency"]
          id?: string
          input?: Json | null
          is_active?: boolean | null
          job_type?: string | null
          last_run_at?: string | null
          name?: string
          next_run_at?: string | null
          run_count?: number | null
          run_time?: string | null
          tenant_id?: string
          timezone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      scores: {
        Row: {
          created_at: string
          criteria_id: string
          id: string
          judge_assignment_id: string
          score: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          criteria_id: string
          id?: string
          judge_assignment_id: string
          score: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          criteria_id?: string
          id?: string
          judge_assignment_id?: string
          score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scores_criteria_id_fkey"
            columns: ["criteria_id"]
            isOneToOne: false
            referencedRelation: "judging_criteria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scores_judge_assignment_id_fkey"
            columns: ["judge_assignment_id"]
            isOneToOne: false
            referencedRelation: "judge_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      social_media_submissions: {
        Row: {
          created_at: string
          hackathon_id: string
          id: string
          og_description: string | null
          og_image_url: string | null
          og_title: string | null
          participant_id: string
          platform: string | null
          reviewed_at: string | null
          status: string
          team_id: string | null
          url: string
        }
        Insert: {
          created_at?: string
          hackathon_id: string
          id?: string
          og_description?: string | null
          og_image_url?: string | null
          og_title?: string | null
          participant_id: string
          platform?: string | null
          reviewed_at?: string | null
          status?: string
          team_id?: string | null
          url: string
        }
        Update: {
          created_at?: string
          hackathon_id?: string
          id?: string
          og_description?: string | null
          og_image_url?: string | null
          og_title?: string | null
          participant_id?: string
          platform?: string | null
          reviewed_at?: string | null
          status?: string
          team_id?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_media_submissions_hackathon_id_fkey"
            columns: ["hackathon_id"]
            isOneToOne: false
            referencedRelation: "hackathons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_media_submissions_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "hackathon_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_media_submissions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_categories: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          hackathon_id: string
          id: string
          name: string
          prize_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          hackathon_id: string
          id?: string
          name: string
          prize_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          hackathon_id?: string
          id?: string
          name?: string
          prize_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "submission_categories_hackathon_id_fkey"
            columns: ["hackathon_id"]
            isOneToOne: false
            referencedRelation: "hackathons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submission_categories_prize_id_fkey"
            columns: ["prize_id"]
            isOneToOne: false
            referencedRelation: "prizes"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_category_entries: {
        Row: {
          category_id: string
          id: string
          submission_id: string
        }
        Insert: {
          category_id: string
          id?: string
          submission_id: string
        }
        Update: {
          category_id?: string
          id?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "submission_category_entries_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "submission_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submission_category_entries_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_challenges: {
        Row: {
          challenge_id: string
          created_at: string
          submission_id: string
        }
        Insert: {
          challenge_id: string
          created_at?: string
          submission_id: string
        }
        Update: {
          challenge_id?: string
          created_at?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "submission_challenges_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submission_challenges_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      submissions: {
        Row: {
          created_at: string
          demo_video_url: string | null
          description: string | null
          github_url: string | null
          hackathon_id: string
          id: string
          live_app_url: string | null
          metadata: Json | null
          participant_id: string | null
          screenshot_url: string | null
          status: Database["public"]["Enums"]["submission_status"]
          team_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          demo_video_url?: string | null
          description?: string | null
          github_url?: string | null
          hackathon_id: string
          id?: string
          live_app_url?: string | null
          metadata?: Json | null
          participant_id?: string | null
          screenshot_url?: string | null
          status?: Database["public"]["Enums"]["submission_status"]
          team_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          demo_video_url?: string | null
          description?: string | null
          github_url?: string | null
          hackathon_id?: string
          id?: string
          live_app_url?: string | null
          metadata?: Json | null
          participant_id?: string | null
          screenshot_url?: string | null
          status?: Database["public"]["Enums"]["submission_status"]
          team_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "submissions_hackathon_id_fkey"
            columns: ["hackathon_id"]
            isOneToOne: false
            referencedRelation: "hackathons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "hackathon_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by_clerk_user_id: string | null
          created_at: string
          email: string
          expires_at: string
          hackathon_id: string
          id: string
          invited_by_clerk_user_id: string
          is_captain_invite: boolean
          status: Database["public"]["Enums"]["invitation_status"]
          team_id: string
          token: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by_clerk_user_id?: string | null
          created_at?: string
          email: string
          expires_at?: string
          hackathon_id: string
          id?: string
          invited_by_clerk_user_id: string
          is_captain_invite?: boolean
          status?: Database["public"]["Enums"]["invitation_status"]
          team_id: string
          token: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by_clerk_user_id?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          hackathon_id?: string
          id?: string
          invited_by_clerk_user_id?: string
          is_captain_invite?: boolean
          status?: Database["public"]["Enums"]["invitation_status"]
          team_id?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_invitations_hackathon_id_fkey"
            columns: ["hackathon_id"]
            isOneToOne: false
            referencedRelation: "hackathons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invitations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          captain_clerk_user_id: string | null
          created_at: string
          hackathon_id: string
          id: string
          invite_code: string
          mode: Database["public"]["Enums"]["team_mode"] | null
          name: string
          pending_captain_email: string | null
          status: Database["public"]["Enums"]["team_status"]
          updated_at: string
        }
        Insert: {
          captain_clerk_user_id?: string | null
          created_at?: string
          hackathon_id: string
          id?: string
          invite_code: string
          mode?: Database["public"]["Enums"]["team_mode"] | null
          name: string
          pending_captain_email?: string | null
          status?: Database["public"]["Enums"]["team_status"]
          updated_at?: string
        }
        Update: {
          captain_clerk_user_id?: string | null
          created_at?: string
          hackathon_id?: string
          id?: string
          invite_code?: string
          mode?: Database["public"]["Enums"]["team_mode"] | null
          name?: string
          pending_captain_email?: string | null
          status?: Database["public"]["Enums"]["team_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_hackathon_id_fkey"
            columns: ["hackathon_id"]
            isOneToOne: false
            referencedRelation: "hackathons"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_sponsors: {
        Row: {
          created_at: string
          id: string
          logo_url: string | null
          logo_url_dark: string | null
          name: string
          tenant_id: string
          updated_at: string
          website_url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          logo_url?: string | null
          logo_url_dark?: string | null
          name: string
          tenant_id: string
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          logo_url?: string | null
          logo_url_dark?: string | null
          name?: string
          tenant_id?: string
          updated_at?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_sponsors_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          clerk_org_id: string | null
          clerk_user_id: string | null
          created_at: string
          description: string | null
          id: string
          logo_url: string | null
          logo_url_dark: string | null
          name: string
          slug: string | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          clerk_org_id?: string | null
          clerk_user_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          logo_url_dark?: string | null
          name: string
          slug?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          clerk_org_id?: string | null
          clerk_user_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          logo_url_dark?: string | null
          name?: string
          slug?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      webhook_deliveries: {
        Row: {
          attempt: number | null
          created_at: string
          delivered_at: string | null
          event: Database["public"]["Enums"]["webhook_event"]
          id: string
          payload: Json
          response_body: string | null
          response_status: number | null
          webhook_id: string
        }
        Insert: {
          attempt?: number | null
          created_at?: string
          delivered_at?: string | null
          event: Database["public"]["Enums"]["webhook_event"]
          id?: string
          payload: Json
          response_body?: string | null
          response_status?: number | null
          webhook_id: string
        }
        Update: {
          attempt?: number | null
          created_at?: string
          delivered_at?: string | null
          event?: Database["public"]["Enums"]["webhook_event"]
          id?: string
          payload?: Json
          response_body?: string | null
          response_status?: number | null
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      webhooks: {
        Row: {
          created_at: string
          events: Database["public"]["Enums"]["webhook_event"][]
          failure_count: number | null
          id: string
          is_active: boolean | null
          last_failure_at: string | null
          last_success_at: string | null
          last_triggered_at: string | null
          secret: string
          tenant_id: string
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          events?: Database["public"]["Enums"]["webhook_event"][]
          failure_count?: number | null
          id?: string
          is_active?: boolean | null
          last_failure_at?: string | null
          last_success_at?: string | null
          last_triggered_at?: string | null
          secret: string
          tenant_id: string
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          events?: Database["public"]["Enums"]["webhook_event"][]
          failure_count?: number | null
          id?: string
          is_active?: boolean | null
          last_failure_at?: string | null
          last_success_at?: string | null
          last_triggered_at?: string | null
          secret?: string
          tenant_id?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhooks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_team_invitation:
        | {
            Args: { p_clerk_user_id: string; p_token: string }
            Returns: {
              error_code: string
              error_message: string
              hackathon_id: string
              success: boolean
              team_id: string
            }[]
          }
        | {
            Args: {
              p_clerk_user_id: string
              p_token: string
              p_user_email?: string
            }
            Returns: {
              error_code: string
              error_message: string
              hackathon_id: string
              success: boolean
              team_id: string
            }[]
          }
      bulk_assign_teams: {
        Args: { p_assignments: Json; p_hackathon_id: string }
        Returns: {
          assigned_count: number
          error_code: string
          error_message: string
          success: boolean
        }[]
      }
      calculate_results: {
        Args: { p_hackathon_id: string }
        Returns: {
          error_code: string
          error_message: string
          results_count: number
          success: boolean
        }[]
      }
      calculate_round_results: {
        Args: { p_hackathon_id: string; p_round_id: string }
        Returns: {
          error_code: string
          error_message: string
          results_count: number
          success: boolean
        }[]
      }
      check_rate_limit: {
        Args: { p_key: string; p_max_requests: number; p_window_ms: number }
        Returns: Json
      }
      cleanup_expired_rate_limits: {
        Args: { p_limit?: number }
        Returns: number
      }
      effective_hackathon_status: {
        Args: {
          ends_at: string
          starts_at: string
          status: Database["public"]["Enums"]["hackathon_status"]
        }
        Returns: Database["public"]["Enums"]["hackathon_status"]
      }
      get_organizer_poll_data: {
        Args: { p_hackathon_id: string }
        Returns: Json
      }
      register_for_hackathon:
        | {
            Args: { p_clerk_user_id: string; p_hackathon_id: string }
            Returns: {
              error_code: string
              error_message: string
              participant_id: string
              success: boolean
            }[]
          }
        | {
            Args: {
              p_clerk_user_id: string
              p_hackathon_id: string
              p_team_name?: string
            }
            Returns: {
              error_code: string
              error_message: string
              participant_id: string
              success: boolean
              team_id: string
            }[]
          }
      submit_scores: {
        Args: {
          p_judge_assignment_id: string
          p_notes?: string
          p_scores: Json
        }
        Returns: {
          error_code: string
          error_message: string
          success: boolean
        }[]
      }
    }
    Enums: {
      actor_type: "user" | "api_key"
      advancement_rule: "top_n" | "threshold" | "manual"
      criterion_category: "core" | "bonus"
      hackathon_phase:
        | "build"
        | "submission_open"
        | "preliminaries"
        | "finals"
        | "results_pending"
      hackathon_status:
        | "draft"
        | "published"
        | "registration_open"
        | "active"
        | "judging"
        | "completed"
        | "archived"
      integration_provider: "gmail" | "google_calendar" | "notion" | "luma"
      invitation_status:
        | "pending"
        | "accepted"
        | "declined"
        | "expired"
        | "cancelled"
      job_status: "queued" | "running" | "succeeded" | "failed" | "canceled"
      judging_mode: "points" | "subjective" | "rubric"
      judging_style:
        | "bucket_sort"
        | "gate_check"
        | "head_to_head"
        | "top_n"
        | "compliance"
        | "crowd"
        | "points"
        | "subjective"
      location_type: "in_person" | "virtual" | "hybrid"
      mentor_request_status: "open" | "claimed" | "resolved" | "cancelled"
      participant_role: "participant" | "judge" | "mentor" | "organizer"
      prize_fulfillment_status: "assigned" | "contacted" | "shipped" | "claimed"
      prize_type: "score" | "favorite" | "crowd" | "criteria"
      round_status: "planned" | "active" | "complete" | "advanced"
      schedule_frequency:
        | "once"
        | "hourly"
        | "daily"
        | "weekly"
        | "monthly"
        | "cron"
      sponsor_tier: "gold" | "silver" | "bronze" | "custom" | "none"
      submission_status:
        | "draft"
        | "submitted"
        | "under_review"
        | "accepted"
        | "rejected"
        | "winner"
      team_mode: "in_person" | "virtual"
      team_status: "forming" | "locked" | "disbanded"
      track_intent:
        | "overall_winner"
        | "sponsor_prize"
        | "crowd_favorite"
        | "quick_comparison"
        | "custom"
      webhook_event:
        | "hackathon.created"
        | "hackathon.updated"
        | "submission.created"
        | "submission.submitted"
        | "participant.registered"
        | "submission.updated"
        | "results.published"
        | "hackathon.registration_opened"
        | "hackathon.started"
        | "hackathon.judging_started"
        | "hackathon.completed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      actor_type: ["user", "api_key"],
      advancement_rule: ["top_n", "threshold", "manual"],
      criterion_category: ["core", "bonus"],
      hackathon_phase: [
        "build",
        "submission_open",
        "preliminaries",
        "finals",
        "results_pending",
      ],
      hackathon_status: [
        "draft",
        "published",
        "registration_open",
        "active",
        "judging",
        "completed",
        "archived",
      ],
      integration_provider: ["gmail", "google_calendar", "notion", "luma"],
      invitation_status: [
        "pending",
        "accepted",
        "declined",
        "expired",
        "cancelled",
      ],
      job_status: ["queued", "running", "succeeded", "failed", "canceled"],
      judging_mode: ["points", "subjective", "rubric"],
      judging_style: [
        "bucket_sort",
        "gate_check",
        "head_to_head",
        "top_n",
        "compliance",
        "crowd",
        "points",
        "subjective",
      ],
      location_type: ["in_person", "virtual", "hybrid"],
      mentor_request_status: ["open", "claimed", "resolved", "cancelled"],
      participant_role: ["participant", "judge", "mentor", "organizer"],
      prize_fulfillment_status: ["assigned", "contacted", "shipped", "claimed"],
      prize_type: ["score", "favorite", "crowd", "criteria"],
      round_status: ["planned", "active", "complete", "advanced"],
      schedule_frequency: [
        "once",
        "hourly",
        "daily",
        "weekly",
        "monthly",
        "cron",
      ],
      sponsor_tier: ["gold", "silver", "bronze", "custom", "none"],
      submission_status: [
        "draft",
        "submitted",
        "under_review",
        "accepted",
        "rejected",
        "winner",
      ],
      team_mode: ["in_person", "virtual"],
      team_status: ["forming", "locked", "disbanded"],
      track_intent: [
        "overall_winner",
        "sponsor_prize",
        "crowd_favorite",
        "quick_comparison",
        "custom",
      ],
      webhook_event: [
        "hackathon.created",
        "hackathon.updated",
        "submission.created",
        "submission.submitted",
        "participant.registered",
        "submission.updated",
        "results.published",
        "hackathon.registration_opened",
        "hackathon.started",
        "hackathon.judging_started",
        "hackathon.completed",
      ],
    },
  },
} as const

