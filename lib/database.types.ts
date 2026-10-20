export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.6"
  }
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          display_name: string
          birth_date: string
          city_region: string | null
          occupation: string | null
          education_level: string | null
          languages_spoken: string[]
          shared_interests: string[]
          relationship_intention: Database["public"]["Enums"]["relationship_intention"]
          prompts: Json
          is_incognito: boolean
          verification_status: Database["public"]["Enums"]["verification_state"]
          is_discoverable: boolean
          is_suspended: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          display_name: string
          birth_date: string
          city_region?: string | null
          occupation?: string | null
          education_level?: string | null
          languages_spoken?: string[]
          shared_interests?: string[]
          relationship_intention?: Database["public"]["Enums"]["relationship_intention"]
          prompts?: Json
          is_incognito?: boolean
          verification_status?: Database["public"]["Enums"]["verification_state"]
          is_discoverable?: boolean
          is_suspended?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          display_name?: string
          birth_date?: string
          city_region?: string | null
          occupation?: string | null
          education_level?: string | null
          languages_spoken?: string[]
          shared_interests?: string[]
          relationship_intention?: Database["public"]["Enums"]["relationship_intention"]
          prompts?: Json
          is_incognito?: boolean
          verification_status?: Database["public"]["Enums"]["verification_state"]
          is_discoverable?: boolean
          is_suspended?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
        ]
      },
      profile_photos: {
        Row: {
          id: string
          user_id: string
          storage_path: string
          position: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          storage_path: string
          position: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          storage_path?: string
          position?: number
          created_at?: string
          updated_at?: string
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
      },
      user_preferences: {
        Row: {
          user_id: string
          min_age: number
          max_age: number
          max_distance_km: number
          preferred_intentions: Database["public"]["Enums"]["relationship_intention"][]
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          min_age?: number
          max_age?: number
          max_distance_km?: number
          preferred_intentions?: Database["public"]["Enums"]["relationship_intention"][]
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          min_age?: number
          max_age?: number
          max_distance_km?: number
          preferred_intentions?: Database["public"]["Enums"]["relationship_intention"][]
          created_at?: string
          updated_at?: string
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
      },
      verification_requests: {
        Row: {
          id: string
          user_id: string
          provider: string
          provider_session_id: string | null
          status: Database["public"]["Enums"]["verification_state"]
          attempts: number
          created_at: string
          decided_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          provider: string
          provider_session_id?: string | null
          status?: Database["public"]["Enums"]["verification_state"]
          attempts?: number
          created_at?: string
          decided_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          provider?: string
          provider_session_id?: string | null
          status?: Database["public"]["Enums"]["verification_state"]
          attempts?: number
          created_at?: string
          decided_at?: string | null
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
      },
      swipes: {
        Row: {
          id: string
          actor_id: string
          target_id: string
          direction: Database["public"]["Enums"]["swipe_direction"]
          created_at: string
        }
        Insert: {
          id?: string
          actor_id: string
          target_id: string
          direction: Database["public"]["Enums"]["swipe_direction"]
          created_at?: string
        }
        Update: {
          id?: string
          actor_id?: string
          target_id?: string
          direction?: Database["public"]["Enums"]["swipe_direction"]
          created_at?: string
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
      },
      daily_swipe_quotas: {
        Row: {
          user_id: string
          quota_date: string
          likes_used: number
          updated_at: string
        }
        Insert: {
          user_id: string
          quota_date: string
          likes_used?: number
          updated_at?: string
        }
        Update: {
          user_id?: string
          quota_date?: string
          likes_used?: number
          updated_at?: string
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
      },
      matches: {
        Row: {
          id: string
          user_a_id: string
          user_b_id: string
          status: Database["public"]["Enums"]["match_status"]
          matched_at: string
          ended_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_a_id: string
          user_b_id: string
          status?: Database["public"]["Enums"]["match_status"]
          matched_at?: string
          ended_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_a_id?: string
          user_b_id?: string
          status?: Database["public"]["Enums"]["match_status"]
          matched_at?: string
          ended_at?: string | null
          created_at?: string
          updated_at?: string
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
      },
      conversations: {
        Row: {
          id: string
          match_id: string
          created_at: string
          last_message_at: string | null
        }
        Insert: {
          id?: string
          match_id: string
          created_at?: string
          last_message_at?: string | null
        }
        Update: {
          id?: string
          match_id?: string
          created_at?: string
          last_message_at?: string | null
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
      },
      conversation_participants: {
        Row: {
          conversation_id: string
          user_id: string
          joined_at: string
        }
        Insert: {
          conversation_id: string
          user_id: string
          joined_at?: string
        }
        Update: {
          conversation_id?: string
          user_id?: string
          joined_at?: string
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
      },
      messages: {
        Row: {
          id: string
          conversation_id: string
          sender_id: string
          body: string
          created_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          sender_id: string
          body: string
          created_at?: string
        }
        Update: {
          id?: string
          conversation_id?: string
          sender_id?: string
          body?: string
          created_at?: string
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
      },
      blocks: {
        Row: {
          blocker_id: string
          blocked_id: string
          created_at: string
        }
        Insert: {
          blocker_id: string
          blocked_id: string
          created_at?: string
        }
        Update: {
          blocker_id?: string
          blocked_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      },
      reports: {
        Row: {
          id: string
          reporter_id: string | null
          reported_user_id: string | null
          category: Database["public"]["Enums"]["report_category"]
          context_summary: string | null
          status: Database["public"]["Enums"]["report_status"]
          severity: Database["public"]["Enums"]["report_severity"]
          created_at: string
          updated_at: string
          retention_until: string | null
          legal_hold: boolean | null
        }
        Insert: {
          id?: string
          reporter_id?: string | null
          reported_user_id?: string | null
          category: Database["public"]["Enums"]["report_category"]
          context_summary?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          severity?: Database["public"]["Enums"]["report_severity"]
          created_at?: string
          updated_at?: string
          retention_until?: string | null
          legal_hold?: boolean | null
        }
        Update: {
          id?: string
          reporter_id?: string | null
          reported_user_id?: string | null
          category?: Database["public"]["Enums"]["report_category"]
          context_summary?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          severity?: Database["public"]["Enums"]["report_severity"]
          created_at?: string
          updated_at?: string
          retention_until?: string | null
          legal_hold?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reported_user_id_fkey"
            columns: ["reported_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      },
      moderation_cases: {
        Row: {
          id: string
          report_id: string | null
          status: Database["public"]["Enums"]["moderation_case_status"]
          assigned_moderator_id: string | null
          resolution_code: string | null
          created_at: string
          updated_at: string
          closed_at: string | null
          retention_until: string | null
          legal_hold: boolean | null
        }
        Insert: {
          id?: string
          report_id?: string | null
          status?: Database["public"]["Enums"]["moderation_case_status"]
          assigned_moderator_id?: string | null
          resolution_code?: string | null
          created_at?: string
          updated_at?: string
          closed_at?: string | null
          retention_until?: string | null
          legal_hold?: boolean | null
        }
        Update: {
          id?: string
          report_id?: string | null
          status?: Database["public"]["Enums"]["moderation_case_status"]
          assigned_moderator_id?: string | null
          resolution_code?: string | null
          created_at?: string
          updated_at?: string
          closed_at?: string | null
          retention_until?: string | null
          legal_hold?: boolean | null
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
      },
      subscriptions: {
        Row: {
          id: string
          user_id: string | null
          provider: string
          provider_subscription_id: string
          provider_plan_id: string
          status: Database["public"]["Enums"]["subscription_status"]
          current_period_start: string | null
          current_period_end: string | null
          cancel_at_period_end: boolean
          cancelled_at: string | null
          created_at: string
          updated_at: string
          retention_until: string | null
          legal_hold: boolean | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          provider: string
          provider_subscription_id: string
          provider_plan_id: string
          status?: Database["public"]["Enums"]["subscription_status"]
          current_period_start?: string | null
          current_period_end?: string | null
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          created_at?: string
          updated_at?: string
          retention_until?: string | null
          legal_hold?: boolean | null
        }
        Update: {
          id?: string
          user_id?: string | null
          provider?: string
          provider_subscription_id?: string
          provider_plan_id?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          current_period_start?: string | null
          current_period_end?: string | null
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          created_at?: string
          updated_at?: string
          retention_until?: string | null
          legal_hold?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      },
      entitlements: {
        Row: {
          id: string
          user_id: string
          entitlement_key: string
          status: Database["public"]["Enums"]["entitlement_status"]
          source_subscription_id: string | null
          valid_from: string
          valid_until: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          entitlement_key: string
          status?: Database["public"]["Enums"]["entitlement_status"]
          source_subscription_id?: string | null
          valid_from?: string
          valid_until?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          entitlement_key?: string
          status?: Database["public"]["Enums"]["entitlement_status"]
          source_subscription_id?: string | null
          valid_from?: string
          valid_until?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entitlements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entitlements_source_subscription_id_fkey"
            columns: ["source_subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      },
      payment_events: {
        Row: {
          id: string
          provider: string
          provider_event_id: string
          event_type: string
          resource_id: string | null
          user_id: string | null
          subscription_id: string | null
          amount: number | null
          currency: string | null
          status: Database["public"]["Enums"]["payment_event_status"]
          provider_verified: boolean
          payload_sha256: string | null
          occurred_at: string | null
          received_at: string
          processed_at: string | null
          retention_until: string | null
          legal_hold: boolean | null
        }
        Insert: {
          id?: string
          provider: string
          provider_event_id: string
          event_type: string
          resource_id?: string | null
          user_id?: string | null
          subscription_id?: string | null
          amount?: number | null
          currency?: string | null
          status?: Database["public"]["Enums"]["payment_event_status"]
          provider_verified?: boolean
          payload_sha256?: string | null
          occurred_at?: string | null
          received_at?: string
          processed_at?: string | null
          retention_until?: string | null
          legal_hold?: boolean | null
        }
        Update: {
          id?: string
          provider?: string
          provider_event_id?: string
          event_type?: string
          resource_id?: string | null
          user_id?: string | null
          subscription_id?: string | null
          amount?: number | null
          currency?: string | null
          status?: Database["public"]["Enums"]["payment_event_status"]
          provider_verified?: boolean
          payload_sha256?: string | null
          occurred_at?: string | null
          received_at?: string
          processed_at?: string | null
          retention_until?: string | null
          legal_hold?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      },
      consent_records: {
        Row: {
          id: string
          user_id: string | null
          consent_key: string
          version: string
          choice: Database["public"]["Enums"]["consent_choice"]
          source: string
          metadata: Json
          recorded_at: string
          retention_until: string | null
          legal_hold: boolean | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          consent_key: string
          version: string
          choice: Database["public"]["Enums"]["consent_choice"]
          source?: string
          metadata?: Json
          recorded_at?: string
          retention_until?: string | null
          legal_hold?: boolean | null
        }
        Update: {
          id?: string
          user_id?: string | null
          consent_key?: string
          version?: string
          choice?: Database["public"]["Enums"]["consent_choice"]
          source?: string
          metadata?: Json
          recorded_at?: string
          retention_until?: string | null
          legal_hold?: boolean | null
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
      },
      privacy_requests: {
        Row: {
          id: string
          user_id: string | null
          request_type: Database["public"]["Enums"]["privacy_request_type"]
          status: Database["public"]["Enums"]["privacy_request_status"]
          idempotency_key: string
          completion_metadata: Json
          failure_code: string | null
          created_at: string
          updated_at: string
          completed_at: string | null
          retention_until: string | null
          legal_hold: boolean | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          request_type: Database["public"]["Enums"]["privacy_request_type"]
          status?: Database["public"]["Enums"]["privacy_request_status"]
          idempotency_key: string
          completion_metadata?: Json
          failure_code?: string | null
          created_at?: string
          updated_at?: string
          completed_at?: string | null
          retention_until?: string | null
          legal_hold?: boolean | null
        }
        Update: {
          id?: string
          user_id?: string | null
          request_type?: Database["public"]["Enums"]["privacy_request_type"]
          status?: Database["public"]["Enums"]["privacy_request_status"]
          idempotency_key?: string
          completion_metadata?: Json
          failure_code?: string | null
          created_at?: string
          updated_at?: string
          completed_at?: string | null
          retention_until?: string | null
          legal_hold?: boolean | null
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
      },
      audit_events: {
        Row: {
          id: string
          actor_id: string | null
          action: string
          target_type: string | null
          target_id: string | null
          correlation_id: string | null
          metadata: Json
          created_at: string
          retention_until: string | null
          legal_hold: boolean | null
        }
        Insert: {
          id?: string
          actor_id?: string | null
          action: string
          target_type?: string | null
          target_id?: string | null
          correlation_id?: string | null
          metadata?: Json
          created_at?: string
          retention_until?: string | null
          legal_hold?: boolean | null
        }
        Update: {
          id?: string
          actor_id?: string | null
          action?: string
          target_type?: string | null
          target_id?: string | null
          correlation_id?: string | null
          metadata?: Json
          created_at?: string
          retention_until?: string | null
          legal_hold?: boolean | null
        }
        Relationships: [
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_discovery_feed: {
        Args: { p_limit?: number; p_cursor?: string | null }
        Returns: {
          age: number
          city_region: string | null
          display_name: string
          primary_photo_path: string | null
          profile_id: string
          relationship_intention: Database["public"]["Enums"]["relationship_intention"]
          shared_interests: string[]
        }[]
      },
      has_active_entitlement: {
        Args: { p_user_id: string }
        Returns: boolean
      },
      record_swipe: {
        Args: { p_direction: Database["public"]["Enums"]["swipe_direction"]; p_target_id: string }
        Returns: {
          likes_remaining: number
          match_id: string | null
          matched: boolean
          swipe_id: string
        }[]
      },
      block_user: {
        Args: { p_target_id: string }
        Returns: string
      },
      unblock_user: {
        Args: { p_target_id: string }
        Returns: boolean
      },
      submit_report: {
        Args: {
          p_category: Database["public"]["Enums"]["report_category"]
          p_context_summary: string | null
          p_reported_user_id: string
        }
        Returns: string
      },
      request_privacy_action: {
        Args: {
          p_idempotency_key: string
          p_request_type: Database["public"]["Enums"]["privacy_request_type"]
        }
        Returns: string
      },
      moderation_transition_case: {
        Args: {
          p_case_id: string
          p_new_status: Database["public"]["Enums"]["moderation_case_status"]
          p_note: string | null
        }
        Returns: undefined
      }
    }
    Enums: {
      verification_state: "not_started" | "pending" | "verified" | "failed" | "requires_review"
      relationship_intention: "serious_relationship" | "long_term_dating" | "cultural_connection_and_dating"
      swipe_direction: "like" | "pass"
      match_status: "active" | "ended"
      report_category: "safety" | "harassment" | "scam" | "underage" | "impersonation" | "other"
      report_status: "submitted" | "under_review" | "actioned" | "dismissed" | "closed"
      report_severity: "low" | "normal" | "high" | "urgent"
      moderation_case_status: "open" | "in_review" | "resolved" | "appealed" | "closed"
      subscription_status: "approval_pending" | "active" | "past_due" | "suspended" | "cancelled" | "expired" | "refunded" | "revoked"
      entitlement_status: "active" | "inactive" | "revoked"
      payment_event_status: "received" | "verified" | "processing" | "processed" | "quarantined" | "failed"
      consent_choice: "granted" | "denied" | "withdrawn"
      privacy_request_type: "export" | "deletion"
      privacy_request_status: "requested" | "in_progress" | "completed" | "failed" | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
