/**
 * Committed schema types for Humbble migrations 0001–0005.
 * Regenerate with `supabase gen types typescript --local > lib/database.types.ts`
 * and review the client-write contracts below. Postgres grants/RLS remain the
 * authorization boundary; TypeScript restrictions are defense in depth.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Relationship = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};
type Rel<Name extends string, Column extends string, Relation extends string, RefColumn extends string, One extends boolean = false> = {
  foreignKeyName: Name;
  columns: [Column];
  isOneToOne: One;
  referencedRelation: Relation;
  referencedColumns: [RefColumn];
};
type TableDef<Row, Insert, Update, Relationships extends Relationship[] = []> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: Relationships;
};

export type VerificationState = 'not_started' | 'pending' | 'verified' | 'failed' | 'requires_review';
export type RelationshipIntention = 'serious_relationship' | 'long_term_dating' | 'cultural_connection_and_dating';
export type SwipeDirection = 'like' | 'pass';
export type MatchStatus = 'active' | 'ended';
export type ReportCategory = 'safety' | 'harassment' | 'scam' | 'underage' | 'impersonation' | 'other';
export type ReportStatus = 'submitted' | 'under_review' | 'actioned' | 'dismissed' | 'closed';
export type ReportSeverity = 'low' | 'normal' | 'high' | 'urgent';
export type ModerationCaseStatus = 'open' | 'in_review' | 'resolved' | 'appealed' | 'closed';
export type SubscriptionStatus = 'approval_pending' | 'active' | 'past_due' | 'suspended' | 'cancelled' | 'expired' | 'refunded' | 'revoked';
export type EntitlementStatus = 'active' | 'inactive' | 'revoked';
export type PaymentEventStatus = 'received' | 'verified' | 'processing' | 'processed' | 'quarantined' | 'failed';
export type ConsentChoice = 'granted' | 'denied' | 'withdrawn';
export type PrivacyRequestType = 'export' | 'deletion';
export type PrivacyRequestStatus = 'requested' | 'in_progress' | 'completed' | 'failed' | 'cancelled';

export type Database = {
  public: {
    Tables: {
      profiles: TableDef<{
        id: string; display_name: string; birth_date: string; city_region: string | null;
        occupation: string | null; education_level: string | null; languages_spoken: string[];
        shared_interests: string[]; relationship_intention: RelationshipIntention; prompts: Json;
        is_incognito: boolean; verification_status: VerificationState; is_discoverable: boolean;
        is_suspended: boolean; created_at: string; updated_at: string;
      }, {
        id: string; display_name: string; birth_date: string; city_region?: string | null;
        occupation?: string | null; education_level?: string | null; languages_spoken?: string[];
        shared_interests?: string[]; relationship_intention?: RelationshipIntention; prompts?: Json; is_incognito?: boolean;
      }, {
        display_name?: string; city_region?: string | null; occupation?: string | null;
        education_level?: string | null; languages_spoken?: string[]; shared_interests?: string[];
        relationship_intention?: RelationshipIntention; prompts?: Json; is_incognito?: boolean;
      }>;
      profile_photos: TableDef<{
        id: string; user_id: string; storage_path: string; position: number; created_at: string; updated_at: string;
      }, { user_id: string; storage_path: string; position: number }, { storage_path?: string; position?: number }>;
      user_preferences: TableDef<{
        user_id: string; min_age: number; max_age: number; max_distance_km: number;
        preferred_intentions: RelationshipIntention[]; created_at: string; updated_at: string;
      }, {
        user_id: string; min_age?: number; max_age?: number; max_distance_km?: number;
        preferred_intentions?: RelationshipIntention[];
      }, {
        min_age?: number; max_age?: number; max_distance_km?: number; preferred_intentions?: RelationshipIntention[];
      }>;
      verification_requests: TableDef<{
        id: string; user_id: string; provider: string; provider_session_id: string | null;
        status: VerificationState; attempts: number; created_at: string; decided_at: string | null;
      }, never, never>;
      swipes: TableDef<{
        id: string; actor_id: string; target_id: string; direction: SwipeDirection; created_at: string;
      }, never, never, [
        Rel<'swipes_actor_id_fkey', 'actor_id', 'profiles', 'id'>,
        Rel<'swipes_target_id_fkey', 'target_id', 'profiles', 'id'>
      ]>;
      daily_swipe_quotas: TableDef<{
        user_id: string; quota_date: string; likes_used: number; updated_at: string;
      }, never, never, [Rel<'daily_swipe_quotas_user_id_fkey', 'user_id', 'profiles', 'id'>]>;
      matches: TableDef<{
        id: string; user_a_id: string; user_b_id: string; status: MatchStatus; matched_at: string;
        ended_at: string | null; created_at: string; updated_at: string;
      }, never, never, [
        Rel<'matches_user_a_id_fkey', 'user_a_id', 'profiles', 'id'>,
        Rel<'matches_user_b_id_fkey', 'user_b_id', 'profiles', 'id'>
      ]>;
      conversations: TableDef<{
        id: string; match_id: string; created_at: string; last_message_at: string | null;
      }, never, never, [Rel<'conversations_match_id_fkey', 'match_id', 'matches', 'id', true>]>;
      conversation_participants: TableDef<{
        conversation_id: string; user_id: string; joined_at: string;
      }, never, never, [
        Rel<'conversation_participants_conversation_id_fkey', 'conversation_id', 'conversations', 'id'>,
        Rel<'conversation_participants_user_id_fkey', 'user_id', 'profiles', 'id'>
      ]>;
      messages: TableDef<{
        id: string; conversation_id: string; sender_id: string; body: string; created_at: string;
      }, { conversation_id: string; sender_id: string; body: string }, never, [
        Rel<'messages_conversation_id_fkey', 'conversation_id', 'conversations', 'id'>,
        Rel<'messages_sender_id_fkey', 'sender_id', 'profiles', 'id'>
      ]>;
      blocks: TableDef<{
        blocker_id: string; blocked_id: string; created_at: string;
      }, { blocker_id: string; blocked_id: string }, never, [
        Rel<'blocks_blocker_id_fkey', 'blocker_id', 'profiles', 'id'>,
        Rel<'blocks_blocked_id_fkey', 'blocked_id', 'profiles', 'id'>
      ]>;
      reports: TableDef<{
        id: string; reporter_id: string | null; reported_user_id: string | null; category: ReportCategory;
        context_summary: string | null; status: ReportStatus; severity: ReportSeverity; created_at: string;
        updated_at: string; retention_until: string | null; legal_hold: boolean | null;
      }, {
        reporter_id: string; reported_user_id: string; category: ReportCategory; context_summary?: string | null;
      }, never, [
        Rel<'reports_reporter_id_fkey', 'reporter_id', 'profiles', 'id'>,
        Rel<'reports_reported_user_id_fkey', 'reported_user_id', 'profiles', 'id'>
      ]>;
      moderation_cases: TableDef<{
        id: string; report_id: string | null; status: ModerationCaseStatus; assigned_moderator_id: string | null;
        resolution_code: string | null; created_at: string; updated_at: string; closed_at: string | null;
        retention_until: string | null; legal_hold: boolean | null;
      }, never, never, [Rel<'moderation_cases_report_id_fkey', 'report_id', 'reports', 'id'>]>;
      subscriptions: TableDef<{
        id: string; user_id: string | null; provider: string; provider_subscription_id: string;
        provider_plan_id: string; status: SubscriptionStatus; current_period_start: string | null;
        current_period_end: string | null; cancel_at_period_end: boolean; cancelled_at: string | null;
        created_at: string; updated_at: string; retention_until: string | null; legal_hold: boolean | null;
      }, never, never, [Rel<'subscriptions_user_id_fkey', 'user_id', 'profiles', 'id'>]>;
      entitlements: TableDef<{
        id: string; user_id: string; entitlement_key: string; status: EntitlementStatus;
        source_subscription_id: string | null; valid_from: string; valid_until: string | null;
        created_at: string; updated_at: string;
      }, never, never, [
        Rel<'entitlements_user_id_fkey', 'user_id', 'profiles', 'id'>,
        Rel<'entitlements_source_subscription_id_fkey', 'source_subscription_id', 'subscriptions', 'id'>
      ]>;
      payment_events: TableDef<{
        id: string; provider: string; provider_event_id: string; event_type: string; resource_id: string | null;
        user_id: string | null; subscription_id: string | null; amount: number | null; currency: string | null;
        status: PaymentEventStatus; provider_verified: boolean; payload_sha256: string | null;
        occurred_at: string | null; received_at: string; processed_at: string | null;
        retention_until: string | null; legal_hold: boolean | null;
      }, never, never, [
        Rel<'payment_events_user_id_fkey', 'user_id', 'profiles', 'id'>,
        Rel<'payment_events_subscription_id_fkey', 'subscription_id', 'subscriptions', 'id'>
      ]>;
      consent_records: TableDef<{
        id: string; user_id: string | null; consent_key: string; version: string; choice: ConsentChoice;
        source: string; metadata: Json; recorded_at: string; retention_until: string | null; legal_hold: boolean | null;
      }, {
        user_id: string; consent_key: string; version: string; choice: ConsentChoice; source?: string; metadata?: Json;
      }, never, [Rel<'consent_records_user_id_fkey', 'user_id', 'profiles', 'id'>]>;
      privacy_requests: TableDef<{
        id: string; user_id: string | null; request_type: PrivacyRequestType; status: PrivacyRequestStatus;
        idempotency_key: string; completion_metadata: Json; failure_code: string | null; created_at: string;
        updated_at: string; completed_at: string | null; retention_until: string | null; legal_hold: boolean | null;
      }, { user_id: string; request_type: PrivacyRequestType; idempotency_key: string }, never, [Rel<'privacy_requests_user_id_fkey', 'user_id', 'profiles', 'id'>]>;
      audit_events: TableDef<{
        id: string; actor_id: string | null; action: string; target_type: string | null; target_id: string | null;
        correlation_id: string | null; metadata: Json; created_at: string; retention_until: string | null;
        legal_hold: boolean | null;
      }, never, never>;
    };
    Views: Record<string, never>;
    Functions: {
      get_discovery_feed: {
        Args: { p_limit?: number; p_cursor?: string | null };
        Returns: {
          profile_id: string;
          display_name: string;
          age: number;
          city_region: string | null;
          relationship_intention: RelationshipIntention;
          shared_interests: string[];
          primary_photo_path: string | null;
        }[];
      };
      record_swipe: {
        Args: { p_target_id: string; p_direction: SwipeDirection };
        Returns: { swipe_id: string; matched: boolean; match_id: string | null; likes_remaining: number }[];
      };
      has_active_entitlement: { Args: { p_user_id: string }; Returns: boolean };
      block_user: { Args: { p_target_id: string }; Returns: string };
      unblock_user: { Args: { p_target_id: string }; Returns: boolean };
      submit_report: {
        Args: { p_reported_user_id: string; p_category: ReportCategory; p_context_summary: string | null };
        Returns: string;
      };
      request_privacy_action: { Args: { p_request_type: PrivacyRequestType; p_idempotency_key: string }; Returns: string };
      moderation_transition_case: {
        Args: { p_case_id: string; p_new_status: ModerationCaseStatus; p_note: string | null };
        Returns: undefined;
      };
    };
    Enums: {
      verification_state: VerificationState;
      relationship_intention: RelationshipIntention;
      swipe_direction: SwipeDirection;
      match_status: MatchStatus;
      report_category: ReportCategory;
      report_status: ReportStatus;
      report_severity: ReportSeverity;
      moderation_case_status: ModerationCaseStatus;
      subscription_status: SubscriptionStatus;
      entitlement_status: EntitlementStatus;
      payment_event_status: PaymentEventStatus;
      consent_choice: ConsentChoice;
      privacy_request_type: PrivacyRequestType;
      privacy_request_status: PrivacyRequestStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};

export type ProfileRow = Database['public']['Tables']['profiles']['Row'];
export type EditableProfileUpdate = Database['public']['Tables']['profiles']['Update'];
export type SwipeRow = Database['public']['Tables']['swipes']['Row'];
export type MatchRow = Database['public']['Tables']['matches']['Row'];
export type ConversationRow = Database['public']['Tables']['conversations']['Row'];
export type MessageRow = Database['public']['Tables']['messages']['Row'];
export type BlockRow = Database['public']['Tables']['blocks']['Row'];
export type ReportRow = Database['public']['Tables']['reports']['Row'];
export type SubscriptionRow = Database['public']['Tables']['subscriptions']['Row'];
export type EntitlementRow = Database['public']['Tables']['entitlements']['Row'];
export type PaymentEventRow = Database['public']['Tables']['payment_events']['Row'];
export type ConsentRecordRow = Database['public']['Tables']['consent_records']['Row'];
export type PrivacyRequestRow = Database['public']['Tables']['privacy_requests']['Row'];
export type AuditEventRow = Database['public']['Tables']['audit_events']['Row'];
