/**
 * Minimal P2-01 database types. Regenerate the schema types from local Supabase
 * as described in docs/implementation/database-runbook.md. `profiles.Update`
 * intentionally mirrors the client column grant and excludes server-controlled
 * fields; Postgres grants, RLS, and triggers remain the security boundary.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type VerificationState =
  | 'not_started'
  | 'pending'
  | 'verified'
  | 'failed'
  | 'requires_review';

export type RelationshipIntention =
  | 'serious_relationship'
  | 'long_term_dating'
  | 'cultural_connection_and_dating';

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          birth_date: string;
          city_region: string | null;
          occupation: string | null;
          education_level: string | null;
          languages_spoken: string[];
          shared_interests: string[];
          relationship_intention: RelationshipIntention;
          prompts: Json;
          is_incognito: boolean;
          verification_status: VerificationState;
          is_discoverable: boolean;
          is_suspended: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name: string;
          birth_date: string;
          city_region?: string | null;
          occupation?: string | null;
          education_level?: string | null;
          languages_spoken?: string[];
          shared_interests?: string[];
          relationship_intention?: RelationshipIntention;
          prompts?: Json;
          is_incognito?: boolean;
        };
        Update: {
          display_name?: string;
          city_region?: string | null;
          occupation?: string | null;
          education_level?: string | null;
          languages_spoken?: string[];
          shared_interests?: string[];
          relationship_intention?: RelationshipIntention;
          prompts?: Json;
          is_incognito?: boolean;
        };
        Relationships: [];
      };
      profile_photos: {
        Row: {
          id: string;
          user_id: string;
          storage_path: string;
          position: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          storage_path: string;
          position: number;
        };
        Update: {
          storage_path?: string;
          position?: number;
        };
        Relationships: [];
      };
      user_preferences: {
        Row: {
          user_id: string;
          min_age: number;
          max_age: number;
          max_distance_km: number;
          preferred_intentions: RelationshipIntention[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          min_age?: number;
          max_age?: number;
          max_distance_km?: number;
          preferred_intentions?: RelationshipIntention[];
        };
        Update: {
          min_age?: number;
          max_age?: number;
          max_distance_km?: number;
          preferred_intentions?: RelationshipIntention[];
        };
        Relationships: [];
      };
      verification_requests: {
        Row: {
          id: string;
          user_id: string;
          provider: string;
          provider_session_id: string | null;
          status: VerificationState;
          attempts: number;
          created_at: string;
          decided_at: string | null;
        };
        /** No authenticated client insert/update path exists for this table. */
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      verification_state: VerificationState;
      relationship_intention: RelationshipIntention;
    };
    CompositeTypes: Record<string, never>;
  };
};

export type ProfileRow = Database['public']['Tables']['profiles']['Row'];
export type EditableProfileUpdate = Database['public']['Tables']['profiles']['Update'];
