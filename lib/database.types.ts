export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
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
          created_at: string
          display_name: string
          education_level: string | null
          id: string
          is_discoverable: boolean
          is_incognito: boolean
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
          created_at?: string
          display_name: string
          education_level?: string | null
          id: string
          is_discoverable?: boolean
          is_incognito?: boolean
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
          created_at?: string
          display_name?: string
          education_level?: string | null
          id?: string
          is_discoverable?: boolean
          is_incognito?: boolean
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
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          cancelled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          legal_hold: boolean | null
          provider: string
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
          id?: string
          legal_hold?: boolean | null
          provider: string
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
          id?: string
          legal_hold?: boolean | null
          provider?: string
          provider_plan_id?: string
          provider_subscription_id?: string
          retention_until?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
          user_id?: string | null
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
      block_user: { Args: { p_target_id: string }; Returns: string }
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
          primary_photo_path: string
          profile_id: string
          relationship_intention: Database["public"]["Enums"]["relationship_intention"]
          shared_interests: string[]
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
      moderation_transition_case: {
        Args: {
          p_case_id: string
          p_new_status: Database["public"]["Enums"]["moderation_case_status"]
          p_note: string
        }
        Returns: undefined
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
      submit_report: {
        Args: {
          p_category: Database["public"]["Enums"]["report_category"]
          p_client_report_id?: string
          p_context_summary: string
          p_reported_user_id: string
        }
        Returns: string
      }
      unblock_user: { Args: { p_target_id: string }; Returns: boolean }
      unmatch: { Args: { p_target_id: string }; Returns: boolean }
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

