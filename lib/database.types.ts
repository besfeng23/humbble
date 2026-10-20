/**
 * Minimal committed database types for P2-01 and P2-02.
 * Regenerate from the local schema with the command documented in
 * docs/implementation/database-runbook.md. Postgres grants and RLS—not these
 * TypeScript shapes—are the authorization boundary.
 *
 * The `Insert: never` / `Update: never` contracts below intentionally prevent
 * direct client writes to swipe history, quotas, matches, conversations, and
 * participant membership until the reviewed transactional RPCs are added.
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

export type SwipeDirection = 'like' | 'pass';
export type MatchStatus = 'active' | 'ended';

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
      swipes: {
        Row: {
          id: string;
          actor_id: string;
          target_id: string;
          direction: SwipeDirection;
          created_at: string;
        };
        /** Inserts are performed by the later actor-derived record_swipe RPC. */
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: 'swipes_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'swipes_target_id_fkey';
            columns: ['target_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      daily_swipe_quotas: {
        Row: {
          user_id: string;
          quota_date: string;
          likes_used: number;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: 'daily_swipe_quotas_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      matches: {
        Row: {
          id: string;
          user_a_id: string;
          user_b_id: string;
          status: MatchStatus;
          matched_at: string;
          ended_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: 'matches_user_a_id_fkey';
            columns: ['user_a_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'matches_user_b_id_fkey';
            columns: ['user_b_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      conversations: {
        Row: {
          id: string;
          match_id: string;
          created_at: string;
          last_message_at: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: 'conversations_match_id_fkey';
            columns: ['match_id'];
            isOneToOne: true;
            referencedRelation: 'matches';
            referencedColumns: ['id'];
          },
        ];
      };
      conversation_participants: {
        Row: {
          conversation_id: string;
          user_id: string;
          joined_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: 'conversation_participants_conversation_id_fkey';
            columns: ['conversation_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'conversation_participants_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          sender_id: string;
          body: string;
          created_at: string;
        };
        Insert: {
          conversation_id: string;
          sender_id: string;
          body: string;
        };
        Update: never;
        Relationships: [
          {
            foreignKeyName: 'messages_conversation_id_fkey';
            columns: ['conversation_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'messages_sender_id_fkey';
            columns: ['sender_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      blocks: {
        Row: {
          blocker_id: string;
          blocked_id: string;
          created_at: string;
        };
        Insert: {
          blocker_id: string;
          blocked_id: string;
        };
        Update: never;
        Relationships: [
          {
            foreignKeyName: 'blocks_blocker_id_fkey';
            columns: ['blocker_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'blocks_blocked_id_fkey';
            columns: ['blocked_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      verification_state: VerificationState;
      relationship_intention: RelationshipIntention;
      swipe_direction: SwipeDirection;
      match_status: MatchStatus;
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
