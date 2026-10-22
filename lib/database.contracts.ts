import type { Database, Json } from './database.types';

// Public enum aliases retained for app code that previously imported them from
// database.types.ts. These aliases do not narrow or replace database privileges.
export type VerificationState = Database['public']['Enums']['verification_state'];
export type RelationshipIntention = Database['public']['Enums']['relationship_intention'];
export type SwipeDirection = Database['public']['Enums']['swipe_direction'];
export type MatchStatus = Database['public']['Enums']['match_status'];
export type ReportCategory = Database['public']['Enums']['report_category'];
export type ReportStatus = Database['public']['Enums']['report_status'];
export type ReportSeverity = Database['public']['Enums']['report_severity'];
export type ModerationCaseStatus = Database['public']['Enums']['moderation_case_status'];
export type SubscriptionStatus = Database['public']['Enums']['subscription_status'];
export type EntitlementStatus = Database['public']['Enums']['entitlement_status'];
export type PaymentEventStatus = Database['public']['Enums']['payment_event_status'];
export type ConsentChoice = Database['public']['Enums']['consent_choice'];
export type PrivacyRequestType = Database['public']['Enums']['privacy_request_type'];
export type PrivacyRequestStatus = Database['public']['Enums']['privacy_request_status'];
export type { Json };

// Canonical row aliases.
export type ProfileRow = Database['public']['Tables']['profiles']['Row'];
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

// Client-facing write contracts deliberately exclude server-owned profile flags.
export type ProfileClientInsert = Pick<
  Database['public']['Tables']['profiles']['Insert'],
  | 'id'
  | 'display_name'
  | 'birth_date'
  | 'city_region'
  | 'country_code'
  | 'occupation'
  | 'education_level'
  | 'languages_spoken'
  | 'shared_interests'
  | 'relationship_intention'
  | 'prompts'
  | 'is_incognito'
>;
export type ProfileClientUpdate = Pick<
  Database['public']['Tables']['profiles']['Update'],
  | 'display_name'
  | 'city_region'
  | 'country_code'
  | 'occupation'
  | 'education_level'
  | 'languages_spoken'
  | 'shared_interests'
  | 'relationship_intention'
  | 'prompts'
  | 'is_incognito'
>;
export type EditableProfileUpdate = ProfileClientUpdate;

export type MessageClientInsert = Pick<
  Database['public']['Tables']['messages']['Insert'],
  'conversation_id' | 'sender_id' | 'body'
>;
// Block and report mutations deliberately have no direct table-write contract.
// Use the authenticated-only block_user / unblock_user / submit_report RPCs.
export type ConsentRecordClientInsert = Pick<
  Database['public']['Tables']['consent_records']['Insert'],
  'user_id' | 'consent_key' | 'version' | 'choice' | 'source' | 'metadata'
>;
export type PrivacyRequestClientInsert = Pick<
  Database['public']['Tables']['privacy_requests']['Insert'],
  'user_id' | 'request_type' | 'idempotency_key'
>;

// RPC argument/return aliases centralize the reviewed P2-05 API contracts.
export type GetDiscoveryFeedArgs = Database['public']['Functions']['get_discovery_feed']['Args'];
export type DiscoveryProfile = Database['public']['Functions']['get_discovery_feed']['Returns'][number];
export type RecordSwipeArgs = Database['public']['Functions']['record_swipe']['Args'];
export type RecordSwipeResult = Database['public']['Functions']['record_swipe']['Returns'][number];
export type HasActiveEntitlementArgs = Database['public']['Functions']['has_active_entitlement']['Args'];
export type BlockUserArgs = Database['public']['Functions']['block_user']['Args'];
export type UnblockUserArgs = Database['public']['Functions']['unblock_user']['Args'];
export type SubmitReportArgs = Database['public']['Functions']['submit_report']['Args'];
export type UnmatchArgs = Database['public']['Functions']['unmatch']['Args'];
export type BlockedUserRow = Database['public']['Functions']['list_blocked_users']['Returns'][number];
export type RequestPrivacyActionArgs = Database['public']['Functions']['request_privacy_action']['Args'];
export type ModerationTransitionCaseArgs = Database['public']['Functions']['moderation_transition_case']['Args'];

// P3-04 messaging RPC contracts derive directly from the generated schema.
export type GetConversationListRow = Database['public']['Functions']['get_conversation_list']['Returns'][number];
export type SendMessageArgs = Database['public']['Functions']['send_message']['Args'];
export type SendMessageResult = Database['public']['Functions']['send_message']['Returns'][number];
