export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      attribution_networks: {
        Row: {
          click_id_params: string[]
          created_at: string
          display_name: string
          postback_enabled: boolean
          postback_url_template: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          click_id_params?: string[]
          created_at?: string
          display_name: string
          postback_enabled?: boolean
          postback_url_template?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          click_id_params?: string[]
          created_at?: string
          display_name?: string
          postback_enabled?: boolean
          postback_url_template?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      audit_events: {
        Row: {
          action: string
          actor_id: string | null
          correlation_id: string | null
          created_at: string
          id: string
          legal_hold: boolean | null
          metadata: Json
          retention_until: string | null
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          correlation_id?: string | null
          created_at?: string
          id?: string
          legal_hold?: boolean | null
          metadata?: Json
          retention_until?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          correlation_id?: string | null
          created_at?: string
          id?: string
          legal_hold?: boolean | null
          metadata?: Json
          retention_until?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      billing_markets: {
        Row: {
          country_code: string
          created_at: string
          is_enabled: boolean
          plan_key: string
        }
        Insert: {
          country_code: string
          created_at?: string
          is_enabled?: boolean
          plan_key: string
        }
        Update: {
          country_code?: string
          created_at?: string
          is_enabled?: boolean
          plan_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_markets_plan_key_fkey"
            columns: ["plan_key"]
            isOneToOne: false
            referencedRelation: "billing_plans"
            referencedColumns: ["plan_key"]
          },
        ]
      }
      billing_plans: {
        Row: {
          amount: number
          billing_interval: string
          created_at: string
          currency: string
          entitlement_key: string
          is_enabled: boolean
          market: string
          plan_key: string
        }
        Insert: {
          amount: number
          billing_interval?: string
          created_at?: string
          currency: string
          entitlement_key?: string
          is_enabled?: boolean
          market: string
          plan_key: string
        }
        Update: {
          amount?: number
          billing_interval?: string
          created_at?: string
          currency?: string
          entitlement_key?: string
          is_enabled?: boolean
          market?: string
          plan_key?: string
        }
        Relationships: []
      }
      billing_readbacks: {
        Row: {
          applied_at: string | null
          apply_outcome: string | null
          id: string
          kind: string
          last_payment_amount: number | null
          last_payment_currency: string | null
          mapped_status: Database["public"]["Enums"]["subscription_status"]
          payment_event_id: string | null
          period_end: string | null
          provider_plan_id: string | null
          provider_status: string | null
          provider_subscription_id: string
          recorded_at: string
          subscription_id: string
        }
        Insert: {
          applied_at?: string | null
          apply_outcome?: string | null
          id?: string
          kind: string
          last_payment_amount?: number | null
          last_payment_currency?: string | null
          mapped_status: Database["public"]["Enums"]["subscription_status"]
          payment_event_id?: string | null
          period_end?: string | null
          provider_plan_id?: string | null
          provider_status?: string | null
          provider_subscription_id: string
          recorded_at?: string
          subscription_id: string
        }
        Update: {
          applied_at?: string | null
          apply_outcome?: string | null
          id?: string
          kind?: string
          last_payment_amount?: number | null
          last_payment_currency?: string | null
          mapped_status?: Database["public"]["Enums"]["subscription_status"]
          payment_event_id?: string | null
          period_end?: string | null
          provider_plan_id?: string | null
          provider_status?: string | null
          provider_subscription_id?: string
          recorded_at?: string
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_readbacks_payment_event_id_fkey"
            columns: ["payment_event_id"]
            isOneToOne: false
            referencedRelation: "payment_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_readbacks_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_records: {
        Row: {
          choice: Database["public"]["Enums"]["consent_choice"]
          consent_key: string
          id: string
          legal_hold: boolean | null
          metadata: Json
          recorded_at: string
          retention_until: string | null
          source: string
          user_id: string | null
          version: string
        }
        Insert: {
          choice: Database["public"]["Enums"]["consent_choice"]
          consent_key: string
          id?: string
          legal_hold?: boolean | null
          metadata?: Json
          recorded_at?: string
          retention_until?: string | null
          source?: string
          user_id?: string | null
          version: string
        }
        Update: {
          choice?: Database["public"]["Enums"]["consent_choice"]
          consent_key?: string
          id?: string
          legal_hold?: boolean | null
          metadata?: Json
          recorded_at?: string
          retention_until?: string | null
          source?: string
          user_id?: string | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "consent_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          joined_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          joined_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          joined_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          last_message_at: string | null
          match_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          match_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          match_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_swipe_quotas: {
        Row: {
          likes_used: number
          quota_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          likes_used?: number
          quota_date: string
          updated_at?: string
          user_id: string
        }
        Update: {
          likes_used?: number
          quota_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_swipe_quotas_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      entitlements: {
        Row: {
          created_at: string
          entitlement_key: string
          id: string
          source_subscription_id: string | null
          status: Database["public"]["Enums"]["entitlement_status"]
          updated_at: string
          user_id: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          entitlement_key: string
          id?: string
          source_subscription_id?: string | null
          status?: Database["public"]["Enums"]["entitlement_status"]
          updated_at?: string
          user_id: string
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          entitlement_key?: string
          id?: string
          source_subscription_id?: string | null
          status?: Database["public"]["Enums"]["entitlement_status"]
          updated_at?: string
          user_id?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entitlements_source_subscription_id_fkey"
            columns: ["source_subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entitlements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      funnel_events: {
        Row: {
          event: string
          id: number
          occurred_at: string
          user_id: string
        }
        Insert: {
          event: string
          id?: never
          occurred_at?: string
          user_id: string
        }
        Update: {
          event?: string
          id?: never
          occurred_at?: string
          user_id?: string
        }
        Relationships: []
      }
      matches: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          matched_at: string
          status: Database["public"]["Enums"]["match_status"]
          updated_at: string
          user_a_id: string
          user_b_id: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          matched_at?: string
          status?: Database["public"]["Enums"]["match_status"]
          updated_at?: string
          user_a_id: string
          user_b_id: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          matched_at?: string
          status?: Database["public"]["Enums"]["match_status"]
          updated_at?: string
          user_a_id?: string
          user_b_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "matches_user_a_id_fkey"
            columns: ["user_a_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_user_b_id_fkey"
            columns: ["user_b_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          client_message_id: string | null
          conversation_id: string
          created_at: string
          id: string
          sender_id: string
        }
        Insert: {
          body: string
          client_message_id?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          sender_id: string
        }
        Update: {
          body?: string
          client_message_id?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_cases: {
        Row: {
          assigned_moderator_id: string | null
          closed_at: string | null
          created_at: string
          id: string
          legal_hold: boolean | null
          report_id: string | null
          resolution_code: string | null
          retention_until: string | null
          status: Database["public"]["Enums"]["moderation_case_status"]
          updated_at: string
        }
        Insert: {
          assigned_moderator_id?: string | null
          closed_at?: string | null
          created_at?: string
          id?: string
          legal_hold?: boolean | null
          report_id?: string | null
          resolution_code?: string | null
          retention_until?: string | null
          status?: Database["public"]["Enums"]["moderation_case_status"]
          updated_at?: string
        }
        Update: {
          assigned_moderator_id?: string | null
          closed_at?: string | null
          created_at?: string
          id?: string
          legal_hold?: boolean | null
          report_id?: string | null
          resolution_code?: string | null
          retention_until?: string | null
          status?: Database["public"]["Enums"]["moderation_case_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_cases_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_deliveries: {
        Row: {
          job_id: number
          last_error_code: string | null
          status: string
          token: string
          updated_at: string
        }
        Insert: {
          job_id: number
          last_error_code?: string | null
          status: string
          token: string
          updated_at?: string
        }
        Update: {
          job_id?: number
          last_error_code?: string | null
          status?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "notification_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_events: {
        Row: {
          conversation_id: string | null
          created_at: string
          id: string
          kind: string
          read_at: string | null
          recipient_id: string
          source_id: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          id?: string
          kind: string
          read_at?: string | null
          recipient_id: string
          source_id: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          read_at?: string | null
          recipient_id?: string
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_events_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_jobs: {
        Row: {
          conversation_id: string | null
          created_at: string
          dedupe_key: string
          id: number
          last_error_code: string | null
          locked_at: string | null
          match_id: string | null
          message_id: string | null
          next_attempt_at: string
          notification_type: string
          recipient_id: string
          retry_count: number
          sent_at: string | null
          status: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          dedupe_key: string
          id?: never
          last_error_code?: string | null
          locked_at?: string | null
          match_id?: string | null
          message_id?: string | null
          next_attempt_at?: string
          notification_type: string
          recipient_id: string
          retry_count?: number
          sent_at?: string | null
          status?: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          dedupe_key?: string
          id?: never
          last_error_code?: string | null
          locked_at?: string | null
          match_id?: string | null
          message_id?: string | null
          next_attempt_at?: string
          notification_type?: string
          recipient_id?: string
          retry_count?: number
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_jobs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_jobs_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_jobs_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_jobs_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          created_at: string
          matches_enabled: boolean
          messages_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          matches_enabled?: boolean
          messages_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          matches_enabled?: boolean
          messages_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          amount: number | null
          currency: string | null
          event_type: string
          id: string
          legal_hold: boolean | null
          occurred_at: string | null
          payload_sha256: string | null
          processed_at: string | null
          provider: string
          provider_event_id: string
          provider_verified: boolean
          received_at: string
          resource_id: string | null
          retention_until: string | null
          status: Database["public"]["Enums"]["payment_event_status"]
          subscription_id: string | null
          user_id: string | null
        }
        Insert: {
          amount?: number | null
          currency?: string | null
          event_type: string
          id?: string
          legal_hold?: boolean | null
          occurred_at?: string | null
          payload_sha256?: string | null
          processed_at?: string | null
          provider: string
          provider_event_id: string
          provider_verified?: boolean
          received_at?: string
          resource_id?: string | null
          retention_until?: string | null
          status?: Database["public"]["Enums"]["payment_event_status"]
          subscription_id?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number | null
          currency?: string | null
          event_type?: string
          id?: string
          legal_hold?: boolean | null
          occurred_at?: string | null
          payload_sha256?: string | null
          processed_at?: string | null
          provider?: string
          provider_event_id?: string
          provider_verified?: boolean
          received_at?: string
          resource_id?: string | null
          retention_until?: string | null
          status?: Database["public"]["Enums"]["payment_event_status"]
          subscription_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      postback_outbox: {
        Row: {
          attempts: number
          click_id: string
          created_at: string
          event: string
          id: number
          network: string
          payout: number | null
          sent_at: string | null
          status: string
          transaction_id: string | null
          url_template: string | null
          user_id: string | null
        }
        Insert: {
          attempts?: number
          click_id: string
          created_at?: string
          event: string
          id?: never
          network: string
          payout?: number | null
          sent_at?: string | null
          status?: string
          transaction_id?: string | null
          url_template?: string | null
          user_id?: string | null
        }
        Update: {
          attempts?: number
          click_id?: string
          created_at?: string
          event?: string
          id?: never
          network?: string
          payout?: number | null
          sent_at?: string | null
          status?: string
          transaction_id?: string | null
          url_template?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      privacy_requests: {
        Row: {
          completed_at: string | null
          completion_metadata: Json
          created_at: string
          failure_code: string | null
          id: string
          idempotency_key: string
          legal_hold: boolean | null
          request_type: Database["public"]["Enums"]["privacy_request_type"]
          retention_until: string | null
          status: Database["public"]["Enums"]["privacy_request_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          completed_at?: string | null
          completion_metadata?: Json
          created_at?: string
          failure_code?: string | null
          id?: string
          idempotency_key: string
          legal_hold?: boolean | null
          request_type: Database["public"]["Enums"]["privacy_request_type"]
          retention_until?: string | null
          status?: Database["public"]["Enums"]["privacy_request_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          completed_at?: string | null
          completion_metadata?: Json
          created_at?: string
          failure_code?: string | null
          id?: string
          idempotency_key?: string
          legal_hold?: boolean | null
          request_type?: Database["public"]["Enums"]["privacy_request_type"]
          retention_until?: string | null
          status?: Database["public"]["Enums"]["privacy_request_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "privacy_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_photos: {
        Row: {
          created_at: string
          id: string
          position: number
          storage_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          position: number
          storage_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          position?: number
          storage_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_photos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          birth_date: string
          city_region: string | null
          country_code: string | null
          created_at: string
          display_name: string
          education_level: string | null
          id: string
          is_discoverable: boolean
          is_incognito: boolean
          is_paused: boolean
          is_suspended: boolean
          languages_spoken: string[]
          occupation: string | null
          prompts: Json
          relationship_intention: Database["public"]["Enums"]["relationship_intention"]
          shared_interests: string[]
          updated_at: string
          verification_status: Database["public"]["Enums"]["verification_state"]
        }
        Insert: {
          birth_date: string
          city_region?: string | null
          country_code?: string | null
          created_at?: string
          display_name: string
          education_level?: string | null
          id: string
          is_discoverable?: boolean
          is_incognito?: boolean
          is_paused?: boolean
          is_suspended?: boolean
          languages_spoken?: string[]
          occupation?: string | null
          prompts?: Json
          relationship_intention?: Database["public"]["Enums"]["relationship_intention"]
          shared_interests?: string[]
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["verification_state"]
        }
        Update: {
          birth_date?: string
          city_region?: string | null
          country_code?: string | null
          created_at?: string
          display_name?: string
          education_level?: string | null
          id?: string
          is_discoverable?: boolean
          is_incognito?: boolean
          is_paused?: boolean
          is_suspended?: boolean
          languages_spoken?: string[]
          occupation?: string | null
          prompts?: Json
          relationship_intention?: Database["public"]["Enums"]["relationship_intention"]
          shared_interests?: string[]
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["verification_state"]
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          created_at: string
          id: string
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          platform: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_events: {
        Row: {
          answer: string | null
          country_code: string | null
          created_at: string
          event: string
          network: string | null
          session_id: string
          step: number
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          answer?: string | null
          country_code?: string | null
          created_at?: string
          event: string
          network?: string | null
          session_id: string
          step?: number
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          answer?: string | null
          country_code?: string | null
          created_at?: string
          event?: string
          network?: string | null
          session_id?: string
          step?: number
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: []
      }
      reports: {
        Row: {
          category: Database["public"]["Enums"]["report_category"]
          client_report_id: string | null
          context_summary: string | null
          created_at: string
          id: string
          legal_hold: boolean | null
          reported_user_id: string | null
          reporter_id: string | null
          retention_until: string | null
          severity: Database["public"]["Enums"]["report_severity"]
          status: Database["public"]["Enums"]["report_status"]
          updated_at: string
        }
        Insert: {
          category: Database["public"]["Enums"]["report_category"]
          client_report_id?: string | null
          context_summary?: string | null
          created_at?: string
          id?: string
          legal_hold?: boolean | null
          reported_user_id?: string | null
          reporter_id?: string | null
          retention_until?: string | null
          severity?: Database["public"]["Enums"]["report_severity"]
          status?: Database["public"]["Enums"]["report_status"]
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["report_category"]
          client_report_id?: string | null
          context_summary?: string | null
          created_at?: string
          id?: string
          legal_hold?: boolean | null
          reported_user_id?: string | null
          reporter_id?: string | null
          retention_until?: string | null
          severity?: Database["public"]["Enums"]["report_severity"]
          status?: Database["public"]["Enums"]["report_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_reported_user_id_fkey"
            columns: ["reported_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      signup_attributions: {
        Row: {
          click_id: string | null
          created_at: string
          first_seen_at: string | null
          landing_path: string | null
          network: string
          params: Json
          user_id: string
        }
        Insert: {
          click_id?: string | null
          created_at?: string
          first_seen_at?: string | null
          landing_path?: string | null
          network?: string
          params?: Json
          user_id: string
        }
        Update: {
          click_id?: string | null
          created_at?: string
          first_seen_at?: string | null
          landing_path?: string | null
          network?: string
          params?: Json
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          cancelled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          environment: string
          id: string
          last_verified_at: string | null
          legal_hold: boolean | null
          plan_key: string | null
          provider: string
          provider_cancel_attempts: number
          provider_cancel_last_attempt_at: string | null
          provider_cancel_status: string | null
          provider_plan_id: string
          provider_subscription_id: string
          retention_until: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          last_verified_at?: string | null
          legal_hold?: boolean | null
          plan_key?: string | null
          provider: string
          provider_cancel_attempts?: number
          provider_cancel_last_attempt_at?: string | null
          provider_cancel_status?: string | null
          provider_plan_id: string
          provider_subscription_id: string
          retention_until?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          last_verified_at?: string | null
          legal_hold?: boolean | null
          plan_key?: string | null
          provider?: string
          provider_cancel_attempts?: number
          provider_cancel_last_attempt_at?: string | null
          provider_cancel_status?: string | null
          provider_plan_id?: string
          provider_subscription_id?: string
          retention_until?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_key_fkey"
            columns: ["plan_key"]
            isOneToOne: false
            referencedRelation: "billing_plans"
            referencedColumns: ["plan_key"]
          },
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      support_requests: {
        Row: {
          body: string
          client_request_id: string
          created_at: string
          id: string
          status: string
          topic: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          client_request_id: string
          created_at?: string
          id?: string
          status?: string
          topic: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          client_request_id?: string
          created_at?: string
          id?: string
          status?: string
          topic?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      swipes: {
        Row: {
          actor_id: string
          created_at: string
          direction: Database["public"]["Enums"]["swipe_direction"]
          id: string
          target_id: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          direction: Database["public"]["Enums"]["swipe_direction"]
          id?: string
          target_id: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          direction?: Database["public"]["Enums"]["swipe_direction"]
          id?: string
          target_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "swipes_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swipes_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_consents: {
        Row: {
          created_at: string
          marketing_opt_in: boolean
          marketing_opt_in_at: string | null
          terms_privacy_accepted_at: string
          terms_version: string
          user_id: string
        }
        Insert: {
          created_at?: string
          marketing_opt_in?: boolean
          marketing_opt_in_at?: string | null
          terms_privacy_accepted_at?: string
          terms_version?: string
          user_id: string
        }
        Update: {
          created_at?: string
          marketing_opt_in?: boolean
          marketing_opt_in_at?: string | null
          terms_privacy_accepted_at?: string
          terms_version?: string
          user_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          created_at: string
          max_age: number
          max_distance_km: number
          min_age: number
          preferred_intentions: Database["public"]["Enums"]["relationship_intention"][]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          max_age?: number
          max_distance_km?: number
          min_age?: number
          preferred_intentions?: Database["public"]["Enums"]["relationship_intention"][]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          max_age?: number
          max_distance_km?: number
          min_age?: number
          preferred_intentions?: Database["public"]["Enums"]["relationship_intention"][]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_requests: {
        Row: {
          attempts: number
          created_at: string
          decided_at: string | null
          id: string
          provider: string
          provider_session_id: string | null
          status: Database["public"]["Enums"]["verification_state"]
          user_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          decided_at?: string | null
          id?: string
          provider: string
          provider_session_id?: string | null
          status?: Database["public"]["Enums"]["verification_state"]
          user_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          decided_at?: string | null
          id?: string
          provider?: string
          provider_session_id?: string | null
          status?: Database["public"]["Enums"]["verification_state"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_sync_discoverability: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      billing_apply_readback: {
        Args: { p_readback_id: string }
        Returns: {
          granted: boolean
          outcome: string
          subscription_id: string
        }[]
      }
      billing_finish_event: {
        Args: {
          p_event_id: string
          p_status: Database["public"]["Enums"]["payment_event_status"]
        }
        Returns: undefined
      }
      billing_flag_unresolved_event: {
        Args: { p_event_id: string; p_reason: string }
        Returns: undefined
      }
      billing_list_pending_provider_cancels: {
        Args: { p_environment: string; p_limit?: number }
        Returns: {
          attempts: number
          provider_subscription_id: string
        }[]
      }
      billing_list_reconcile_subscriptions: {
        Args: { p_environment: string; p_limit?: number }
        Returns: {
          provider_subscription_id: string
          reason: string
        }[]
      }
      billing_list_reprocessable_events: {
        Args: { p_limit?: number }
        Returns: {
          event_id: string
          event_status: Database["public"]["Enums"]["payment_event_status"]
          event_type: string
          provider_event_id: string
          resource_id: string
        }[]
      }
      billing_purge_readbacks: {
        Args: { p_older_than?: string }
        Returns: number
      }
      billing_record_event: {
        Args: {
          p_event_type: string
          p_occurred_at: string
          p_payload_sha256: string
          p_provider_event_id: string
          p_resource_id: string
        }
        Returns: {
          event_id: string
          event_status: Database["public"]["Enums"]["payment_event_status"]
          is_new: boolean
        }[]
      }
      billing_record_provider_cancel: {
        Args: { p_provider_subscription_id: string; p_result: string }
        Returns: string
      }
      billing_record_readback: {
        Args: {
          p_event_id?: string
          p_last_payment_amount: number
          p_last_payment_currency: string
          p_period_end: string
          p_provider_plan_id: string
          p_provider_status: string
          p_provider_subscription_id: string
        }
        Returns: string
      }
      billing_record_refund_readback: {
        Args: {
          p_event_id: string
          p_provider_plan_id: string
          p_provider_subscription_id: string
        }
        Returns: string
      }
      billing_register_pending_subscription: {
        Args: {
          p_environment: string
          p_plan_key: string
          p_provider_plan_id: string
          p_provider_subscription_id: string
          p_user_id: string
        }
        Returns: string
      }
      billing_resolve_plan_for_user: {
        Args: { p_country_hint?: string; p_user_id: string }
        Returns: {
          amount: number
          country_code: string
          currency: string
          plan_key: string
        }[]
      }
      block_user: { Args: { p_target_id: string }; Returns: string }
      claim_notification_jobs: {
        Args: { p_limit?: number }
        Returns: {
          conversation_id: string
          id: number
          match_id: string
          notification_type: string
          recipient_id: string
          retry_count: number
        }[]
      }
      get_billing_plan: {
        Args: { p_country_hint?: string }
        Returns: {
          amount: number
          country_code: string
          currency: string
          plan_key: string
        }[]
      }
      get_conversation_list: {
        Args: never
        Returns: {
          conversation_id: string
          counterpart_id: string
          counterpart_name: string
          last_message: string
          last_message_at: string
          match_id: string
        }[]
      }
      get_discovery_feed: {
        Args: { p_cursor?: string; p_limit?: number }
        Returns: {
          age: number
          city_region: string
          cursor_created_at: string
          display_name: string
          is_verified: boolean
          primary_photo_path: string
          profile_id: string
          relationship_intention: Database["public"]["Enums"]["relationship_intention"]
          shared_interests: string[]
        }[]
      }
      get_liked_you: {
        Args: never
        Returns: {
          display_name: string
          liked_at: string
          profile_id: string
        }[]
      }
      get_liked_you_count: { Args: never; Returns: number }
      get_my_premium_status: {
        Args: never
        Returns: {
          cancel_at_period_end: boolean
          is_premium: boolean
          subscription_status: Database["public"]["Enums"]["subscription_status"]
          valid_until: string
        }[]
      }
      has_active_entitlement: { Args: { p_user_id: string }; Returns: boolean }
      list_blocked_users: {
        Args: never
        Returns: {
          blocked_id: string
          created_at: string
          display_name: string
        }[]
      }
      mark_my_notification_read: {
        Args: { p_notification_id: string }
        Returns: boolean
      }
      moderation_transition_case: {
        Args: {
          p_case_id: string
          p_new_status: Database["public"]["Enums"]["moderation_case_status"]
          p_note: string
        }
        Returns: undefined
      }
      purge_quiz_events: {
        Args: {
          p_batch_size?: number
          p_max_rows?: number
          p_retention_days?: number
          p_time_budget_seconds?: number
        }
        Returns: number
      }
      quiz_funnel_summary: {
        Args: { p_from?: string; p_to?: string }
        Returns: {
          day: string
          event: string
          network: string
          sessions: number
          step: number
          utm_campaign: string
          utm_source: string
        }[]
      }
      record_quiz_event: {
        Args: {
          p_answer?: string
          p_country_code?: string
          p_event: string
          p_network?: string
          p_session_id: string
          p_step?: number
          p_utm_campaign?: string
          p_utm_medium?: string
          p_utm_source?: string
        }
        Returns: boolean
      }
      record_swipe: {
        Args: {
          p_direction: Database["public"]["Enums"]["swipe_direction"]
          p_target_id: string
        }
        Returns: {
          likes_remaining: number
          match_id: string
          matched: boolean
          swipe_id: string
        }[]
      }
      refresh_my_discoverability: { Args: never; Returns: boolean }
      register_push_token: {
        Args: { p_platform: string; p_token: string }
        Returns: string
      }
      request_privacy_action: {
        Args: {
          p_idempotency_key: string
          p_request_type: Database["public"]["Enums"]["privacy_request_type"]
        }
        Returns: string
      }
      send_message: {
        Args: {
          p_body: string
          p_client_message_id: string
          p_conversation_id: string
        }
        Returns: {
          body: string
          client_message_id: string
          conversation_id: string
          created_at: string
          id: string
          sender_id: string
        }[]
      }
      sincera_activate_bubble_link: {
        Args: {
          p_bubble_user_id: string
          p_evidence_reference: string
          p_supabase_user_id: string
        }
        Returns: boolean
      }
      submit_report: {
        Args: {
          p_category: Database["public"]["Enums"]["report_category"]
          p_client_report_id?: string
          p_context_summary: string
          p_reported_user_id: string
        }
        Returns: string
      }
      submit_support_request: {
        Args: { p_body: string; p_client_request_id: string; p_topic: string }
        Returns: string
      }
      unblock_user: { Args: { p_target_id: string }; Returns: boolean }
      unmatch: { Args: { p_target_id: string }; Returns: boolean }
      unregister_push_token: { Args: { p_token: string }; Returns: boolean }
    }
    Enums: {
      consent_choice: "granted" | "denied" | "withdrawn"
      entitlement_status: "active" | "inactive" | "revoked"
      match_status: "active" | "ended"
      moderation_case_status:
        | "open"
        | "in_review"
        | "resolved"
        | "appealed"
        | "closed"
      payment_event_status:
        | "received"
        | "verified"
        | "processing"
        | "processed"
        | "quarantined"
        | "failed"
      privacy_request_status:
        | "requested"
        | "in_progress"
        | "completed"
        | "failed"
        | "cancelled"
      privacy_request_type: "export" | "deletion"
      relationship_intention:
        | "serious_relationship"
        | "long_term_dating"
        | "cultural_connection_and_dating"
      report_category:
        | "safety"
        | "harassment"
        | "scam"
        | "underage"
        | "impersonation"
        | "other"
        | "explicit_content"
        | "fake_profile"
      report_severity: "low" | "normal" | "high" | "urgent"
      report_status:
        | "submitted"
        | "under_review"
        | "actioned"
        | "dismissed"
        | "closed"
      subscription_status:
        | "approval_pending"
        | "active"
        | "past_due"
        | "suspended"
        | "cancelled"
        | "expired"
        | "refunded"
        | "revoked"
      swipe_direction: "like" | "pass"
      verification_state:
        | "not_started"
        | "pending"
        | "verified"
        | "failed"
        | "requires_review"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      consent_choice: ["granted", "denied", "withdrawn"],
      entitlement_status: ["active", "inactive", "revoked"],
      match_status: ["active", "ended"],
      moderation_case_status: [
        "open",
        "in_review",
        "resolved",
        "appealed",
        "closed",
      ],
      payment_event_status: [
        "received",
        "verified",
        "processing",
        "processed",
        "quarantined",
        "failed",
      ],
      privacy_request_status: [
        "requested",
        "in_progress",
        "completed",
        "failed",
        "cancelled",
      ],
      privacy_request_type: ["export", "deletion"],
      relationship_intention: [
        "serious_relationship",
        "long_term_dating",
        "cultural_connection_and_dating",
      ],
      report_category: [
        "safety",
        "harassment",
        "scam",
        "underage",
        "impersonation",
        "other",
        "explicit_content",
        "fake_profile",
      ],
      report_severity: ["low", "normal", "high", "urgent"],
      report_status: [
        "submitted",
        "under_review",
        "actioned",
        "dismissed",
        "closed",
      ],
      subscription_status: [
        "approval_pending",
        "active",
        "past_due",
        "suspended",
        "cancelled",
        "expired",
        "refunded",
        "revoked",
      ],
      swipe_direction: ["like", "pass"],
      verification_state: [
        "not_started",
        "pending",
        "verified",
        "failed",
        "requires_review",
      ],
    },
  },
} as const
