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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      achievements: {
        Row: {
          category: string
          code: string
          description: string
          icon: string
          threshold: number | null
          title: string
          xp_reward: number
        }
        Insert: {
          category: string
          code: string
          description: string
          icon: string
          threshold?: number | null
          title: string
          xp_reward?: number
        }
        Update: {
          category?: string
          code?: string
          description?: string
          icon?: string
          threshold?: number | null
          title?: string
          xp_reward?: number
        }
        Relationships: []
      }
      activities: {
        Row: {
          book_id: string | null
          club_id: string | null
          created_at: string
          id: string
          is_public: boolean
          kind: string
          meta: Json | null
          target_user_id: string | null
          user_id: string
        }
        Insert: {
          book_id?: string | null
          club_id?: string | null
          created_at?: string
          id?: string
          is_public?: boolean
          kind: string
          meta?: Json | null
          target_user_id?: string | null
          user_id: string
        }
        Update: {
          book_id?: string | null
          club_id?: string | null
          created_at?: string
          id?: string
          is_public?: boolean
          kind?: string
          meta?: Json | null
          target_user_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "trending_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "book_clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      app_events: {
        Row: {
          created_at: string
          event: string
          id: string
          props: Json | null
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event: string
          id?: string
          props?: Json | null
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event?: string
          id?: string
          props?: Json | null
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      book_clubs: {
        Row: {
          cover_url: string | null
          created_at: string
          current_book_id: string | null
          description: string | null
          id: string
          is_public: boolean
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          cover_url?: string | null
          created_at?: string
          current_book_id?: string | null
          description?: string | null
          id?: string
          is_public?: boolean
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          cover_url?: string | null
          created_at?: string
          current_book_id?: string | null
          description?: string | null
          id?: string
          is_public?: boolean
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_clubs_current_book_id_fkey"
            columns: ["current_book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_clubs_current_book_id_fkey"
            columns: ["current_book_id"]
            isOneToOne: false
            referencedRelation: "trending_books"
            referencedColumns: ["id"]
          },
        ]
      }
      book_recommendations: {
        Row: {
          book_id: string
          comments_count: number
          created_at: string
          id: string
          is_public: boolean
          likes_count: number
          message: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          book_id: string
          comments_count?: number
          created_at?: string
          id?: string
          is_public?: boolean
          likes_count?: number
          message?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          book_id?: string
          comments_count?: number
          created_at?: string
          id?: string
          is_public?: boolean
          likes_count?: number
          message?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      book_signals: {
        Row: {
          avg_rating: number | null
          book_id: string
          dismisses_count: number
          finished_count: number
          library_count: number
          popularity_score: number
          quality_score: number
          rec_clicks_count: number
          recs_count: number
          reviews_count: number
          updated_at: string
          views_count: number
        }
        Insert: {
          avg_rating?: number | null
          book_id: string
          dismisses_count?: number
          finished_count?: number
          library_count?: number
          popularity_score?: number
          quality_score?: number
          rec_clicks_count?: number
          recs_count?: number
          reviews_count?: number
          updated_at?: string
          views_count?: number
        }
        Update: {
          avg_rating?: number | null
          book_id?: string
          dismisses_count?: number
          finished_count?: number
          library_count?: number
          popularity_score?: number
          quality_score?: number
          rec_clicks_count?: number
          recs_count?: number
          reviews_count?: number
          updated_at?: string
          views_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "book_signals_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: true
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_signals_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: true
            referencedRelation: "trending_books"
            referencedColumns: ["id"]
          },
        ]
      }
      books: {
        Row: {
          authors: string[]
          authors_text: string | null
          categories: string[] | null
          content_type: Database["public"]["Enums"]["content_type"]
          cover_url: string | null
          created_at: string
          description: string | null
          id: string
          isbn_10: string | null
          isbn_13: string | null
          language: string | null
          page_count: number | null
          published_year: number | null
          publisher: string | null
          raw: Json | null
          series_id: string | null
          source: string | null
          source_id: string | null
          subtitle: string | null
          title: string
          updated_at: string
          volume_number: number | null
        }
        Insert: {
          authors?: string[]
          authors_text?: string | null
          categories?: string[] | null
          content_type?: Database["public"]["Enums"]["content_type"]
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          isbn_10?: string | null
          isbn_13?: string | null
          language?: string | null
          page_count?: number | null
          published_year?: number | null
          publisher?: string | null
          raw?: Json | null
          series_id?: string | null
          source?: string | null
          source_id?: string | null
          subtitle?: string | null
          title: string
          updated_at?: string
          volume_number?: number | null
        }
        Update: {
          authors?: string[]
          authors_text?: string | null
          categories?: string[] | null
          content_type?: Database["public"]["Enums"]["content_type"]
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          isbn_10?: string | null
          isbn_13?: string | null
          language?: string | null
          page_count?: number | null
          published_year?: number | null
          publisher?: string | null
          raw?: Json | null
          series_id?: string | null
          source?: string | null
          source_id?: string | null
          subtitle?: string | null
          title?: string
          updated_at?: string
          volume_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "books_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["id"]
          },
        ]
      }
      buddy_read_messages: {
        Row: {
          buddy_read_id: string
          content: string
          created_at: string
          id: string
          spoiler_page: number | null
          user_id: string
        }
        Insert: {
          buddy_read_id: string
          content: string
          created_at?: string
          id?: string
          spoiler_page?: number | null
          user_id: string
        }
        Update: {
          buddy_read_id?: string
          content?: string
          created_at?: string
          id?: string
          spoiler_page?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "buddy_read_messages_buddy_read_id_fkey"
            columns: ["buddy_read_id"]
            isOneToOne: false
            referencedRelation: "buddy_reads"
            referencedColumns: ["id"]
          },
        ]
      }
      buddy_read_participants: {
        Row: {
          buddy_read_id: string
          current_page: number
          finished_at: string | null
          percent: number
          updated_at: string
          user_id: string
        }
        Insert: {
          buddy_read_id: string
          current_page?: number
          finished_at?: string | null
          percent?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          buddy_read_id?: string
          current_page?: number
          finished_at?: string | null
          percent?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "buddy_read_participants_buddy_read_id_fkey"
            columns: ["buddy_read_id"]
            isOneToOne: false
            referencedRelation: "buddy_reads"
            referencedColumns: ["id"]
          },
        ]
      }
      buddy_reads: {
        Row: {
          book_id: string
          completed_at: string | null
          created_at: string
          id: string
          initiator_id: string
          invitee_id: string
          message: string | null
          started_at: string | null
          status: string
          target_finish_date: string | null
          updated_at: string
        }
        Insert: {
          book_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          initiator_id: string
          invitee_id: string
          message?: string | null
          started_at?: string | null
          status?: string
          target_finish_date?: string | null
          updated_at?: string
        }
        Update: {
          book_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          initiator_id?: string
          invitee_id?: string
          message?: string | null
          started_at?: string | null
          status?: string
          target_finish_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "buddy_reads_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buddy_reads_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "trending_books"
            referencedColumns: ["id"]
          },
        ]
      }
      challenge_templates: {
        Row: {
          category: string
          code: string
          description: string
          icon: string
          metric: string
          tags: string[] | null
          target: number
          title: string
          weight: number
          xp_reward: number
        }
        Insert: {
          category: string
          code: string
          description: string
          icon?: string
          metric: string
          tags?: string[] | null
          target: number
          title: string
          weight?: number
          xp_reward?: number
        }
        Update: {
          category?: string
          code?: string
          description?: string
          icon?: string
          metric?: string
          tags?: string[] | null
          target?: number
          title?: string
          weight?: number
          xp_reward?: number
        }
        Relationships: []
      }
      club_book_nominations: {
        Row: {
          book_id: string
          club_id: string
          created_at: string
          id: string
          nominated_by: string
          votes_count: number
        }
        Insert: {
          book_id: string
          club_id: string
          created_at?: string
          id?: string
          nominated_by: string
          votes_count?: number
        }
        Update: {
          book_id?: string
          club_id?: string
          created_at?: string
          id?: string
          nominated_by?: string
          votes_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "club_book_nominations_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_book_nominations_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "trending_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_book_nominations_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "book_clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_book_votes: {
        Row: {
          created_at: string
          nomination_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          nomination_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          nomination_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_book_votes_nomination_id_fkey"
            columns: ["nomination_id"]
            isOneToOne: false
            referencedRelation: "club_book_nominations"
            referencedColumns: ["id"]
          },
        ]
      }
      club_invitations: {
        Row: {
          club_id: string
          created_at: string
          id: string
          invited_by: string
          invitee_id: string
          responded_at: string | null
          status: string
        }
        Insert: {
          club_id: string
          created_at?: string
          id?: string
          invited_by: string
          invitee_id: string
          responded_at?: string | null
          status?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          id?: string
          invited_by?: string
          invitee_id?: string
          responded_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_invitations_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "book_clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_join_requests: {
        Row: {
          club_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          message: string | null
          status: string
          user_id: string
        }
        Insert: {
          club_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          message?: string | null
          status?: string
          user_id: string
        }
        Update: {
          club_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          message?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_join_requests_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "book_clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_members: {
        Row: {
          club_id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          club_id: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          club_id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_members_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "book_clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_messages: {
        Row: {
          club_id: string
          content: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          club_id: string
          content: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          club_id?: string
          content?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_messages_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "book_clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      cover_audit_log: {
        Row: {
          checked: number
          details: Json | null
          failed: number
          id: string
          mode: string
          ok: number
          ran_at: string
          replaced: number
        }
        Insert: {
          checked?: number
          details?: Json | null
          failed?: number
          id?: string
          mode: string
          ok?: number
          ran_at?: string
          replaced?: number
        }
        Update: {
          checked?: number
          details?: Json | null
          failed?: number
          id?: string
          mode?: string
          ok?: number
          ran_at?: string
          replaced?: number
        }
        Relationships: []
      }
      enrichment_queue: {
        Row: {
          attempts: number
          book_id: string
          enqueued_at: string
          fields_filled: string[] | null
          id: string
          last_error: string | null
          next_attempt_at: string
          processed_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          book_id: string
          enqueued_at?: string
          fields_filled?: string[] | null
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          processed_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          book_id?: string
          enqueued_at?: string
          fields_filled?: string[] | null
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          processed_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrichment_queue_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrichment_queue_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "trending_books"
            referencedColumns: ["id"]
          },
        ]
      }
      follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
        }
        Relationships: []
      }
      invite_redemptions: {
        Row: {
          code: string
          created_at: string
          id: string
          invitee_id: string
          inviter_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          invitee_id: string
          inviter_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          invitee_id?: string
          inviter_id?: string
        }
        Relationships: []
      }
      invites: {
        Row: {
          code: string
          created_at: string
          signups_count: number
          user_id: string
          xp_earned: number
        }
        Insert: {
          code: string
          created_at?: string
          signups_count?: number
          user_id: string
          xp_earned?: number
        }
        Update: {
          code?: string
          created_at?: string
          signups_count?: number
          user_id?: string
          xp_earned?: number
        }
        Relationships: []
      }
      loans: {
        Row: {
          book_id: string
          borrower_name: string
          created_at: string
          due_at: string | null
          id: string
          lent_at: string
          notes: string | null
          returned_at: string | null
          status: Database["public"]["Enums"]["loan_status"]
          user_id: string
        }
        Insert: {
          book_id: string
          borrower_name: string
          created_at?: string
          due_at?: string | null
          id?: string
          lent_at?: string
          notes?: string | null
          returned_at?: string | null
          status?: Database["public"]["Enums"]["loan_status"]
          user_id: string
        }
        Update: {
          book_id?: string
          borrower_name?: string
          created_at?: string
          due_at?: string | null
          id?: string
          lent_at?: string
          notes?: string | null
          returned_at?: string | null
          status?: Database["public"]["Enums"]["loan_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loans_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "trending_books"
            referencedColumns: ["id"]
          },
        ]
      }
      merge_suggestions: {
        Row: {
          canonical_id: string
          detected_at: string
          duplicate_id: string
          id: string
          resolved_at: string | null
          similarity_score: number
          status: string
        }
        Insert: {
          canonical_id: string
          detected_at?: string
          duplicate_id: string
          id?: string
          resolved_at?: string | null
          similarity_score: number
          status?: string
        }
        Update: {
          canonical_id?: string
          detected_at?: string
          duplicate_id?: string
          id?: string
          resolved_at?: string | null
          similarity_score?: number
          status?: string
        }
        Relationships: []
      }
      metadata_normalization_queue: {
        Row: {
          attempts: number
          book_id: string
          enqueued_at: string
          fields_changed: string[] | null
          id: string
          last_error: string | null
          next_attempt_at: string
          processed_at: string | null
          reasons: string[]
          status: string
        }
        Insert: {
          attempts?: number
          book_id: string
          enqueued_at?: string
          fields_changed?: string[] | null
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          processed_at?: string | null
          reasons?: string[]
          status?: string
        }
        Update: {
          attempts?: number
          book_id?: string
          enqueued_at?: string
          fields_changed?: string[] | null
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          processed_at?: string | null
          reasons?: string[]
          status?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          kind: string
          link: string | null
          meta: Json | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          kind: string
          link?: string | null
          meta?: Json | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          kind?: string
          link?: string | null
          meta?: Json | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          content_types: Database["public"]["Enums"]["content_type"][]
          created_at: string
          display_name: string | null
          favorite_genres: string[] | null
          id: string
          instagram: string | null
          level: number
          library_visibility: string
          onboarded_at: string | null
          profile_visibility: string
          tiktok: string | null
          twitter: string | null
          updated_at: string
          username: string | null
          website: string | null
          xp: number
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          content_types?: Database["public"]["Enums"]["content_type"][]
          created_at?: string
          display_name?: string | null
          favorite_genres?: string[] | null
          id: string
          instagram?: string | null
          level?: number
          library_visibility?: string
          onboarded_at?: string | null
          profile_visibility?: string
          tiktok?: string | null
          twitter?: string | null
          updated_at?: string
          username?: string | null
          website?: string | null
          xp?: number
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          content_types?: Database["public"]["Enums"]["content_type"][]
          created_at?: string
          display_name?: string | null
          favorite_genres?: string[] | null
          id?: string
          instagram?: string | null
          level?: number
          library_visibility?: string
          onboarded_at?: string | null
          profile_visibility?: string
          tiktok?: string | null
          twitter?: string | null
          updated_at?: string
          username?: string | null
          website?: string | null
          xp?: number
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      reading_goals: {
        Row: {
          created_at: string
          id: string
          target_books: number
          updated_at: string
          user_id: string
          year: number
        }
        Insert: {
          created_at?: string
          id?: string
          target_books: number
          updated_at?: string
          user_id: string
          year: number
        }
        Update: {
          created_at?: string
          id?: string
          target_books?: number
          updated_at?: string
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      recommendation_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          recommendation_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          recommendation_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          recommendation_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_comments_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "book_recommendations"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendation_likes: {
        Row: {
          created_at: string
          recommendation_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          recommendation_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          recommendation_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_likes_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "book_recommendations"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendation_recipients: {
        Row: {
          created_at: string
          recipient_id: string
          recommendation_id: string
        }
        Insert: {
          created_at?: string
          recipient_id: string
          recommendation_id: string
        }
        Update: {
          created_at?: string
          recipient_id?: string
          recommendation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_recipients_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "book_recommendations"
            referencedColumns: ["id"]
          },
        ]
      }
      review_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          review_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          review_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          review_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_comments_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      review_likes: {
        Row: {
          created_at: string
          review_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          review_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          review_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_likes_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          book_id: string
          comments_count: number
          content: string
          created_at: string
          id: string
          is_public: boolean
          likes_count: number
          rating: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          book_id: string
          comments_count?: number
          content: string
          created_at?: string
          id?: string
          is_public?: boolean
          likes_count?: number
          rating?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          book_id?: string
          comments_count?: number
          content?: string
          created_at?: string
          id?: string
          is_public?: boolean
          likes_count?: number
          rating?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "trending_books"
            referencedColumns: ["id"]
          },
        ]
      }
      search_log: {
        Row: {
          created_at: string
          id: string
          query: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          query: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          query?: string
          user_id?: string
        }
        Relationships: []
      }
      series: {
        Row: {
          authors: string[]
          content_type: Database["public"]["Enums"]["content_type"]
          cover_url: string | null
          created_at: string
          description: string | null
          id: string
          raw: Json | null
          source: string | null
          source_id: string | null
          status: string | null
          title: string
          total_volumes: number | null
          updated_at: string
        }
        Insert: {
          authors?: string[]
          content_type: Database["public"]["Enums"]["content_type"]
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          raw?: Json | null
          source?: string | null
          source_id?: string | null
          status?: string | null
          title: string
          total_volumes?: number | null
          updated_at?: string
        }
        Update: {
          authors?: string[]
          content_type?: Database["public"]["Enums"]["content_type"]
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          raw?: Json | null
          source?: string | null
          source_id?: string | null
          status?: string | null
          title?: string
          total_volumes?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      stories: {
        Row: {
          bg_color: string | null
          book_id: string | null
          content: string | null
          created_at: string
          current_page: number | null
          expires_at: string
          id: string
          kind: string
          total_pages: number | null
          user_id: string
        }
        Insert: {
          bg_color?: string | null
          book_id?: string | null
          content?: string | null
          created_at?: string
          current_page?: number | null
          expires_at?: string
          id?: string
          kind?: string
          total_pages?: number | null
          user_id: string
        }
        Update: {
          bg_color?: string | null
          book_id?: string | null
          content?: string | null
          created_at?: string
          current_page?: number | null
          expires_at?: string
          id?: string
          kind?: string
          total_pages?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stories_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stories_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "trending_books"
            referencedColumns: ["id"]
          },
        ]
      }
      story_views: {
        Row: {
          story_id: string
          user_id: string
          viewed_at: string
        }
        Insert: {
          story_id: string
          user_id: string
          viewed_at?: string
        }
        Update: {
          story_id?: string
          user_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_views_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      trades: {
        Row: {
          created_at: string
          id: string
          message: string | null
          proposer_book_id: string
          proposer_id: string
          receiver_book_id: string
          receiver_id: string
          status: Database["public"]["Enums"]["trade_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          proposer_book_id: string
          proposer_id: string
          receiver_book_id: string
          receiver_id: string
          status?: Database["public"]["Enums"]["trade_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          proposer_book_id?: string
          proposer_id?: string
          receiver_book_id?: string
          receiver_id?: string
          status?: Database["public"]["Enums"]["trade_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trades_proposer_book_id_fkey"
            columns: ["proposer_book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_proposer_book_id_fkey"
            columns: ["proposer_book_id"]
            isOneToOne: false
            referencedRelation: "trending_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_receiver_book_id_fkey"
            columns: ["receiver_book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_receiver_book_id_fkey"
            columns: ["receiver_book_id"]
            isOneToOne: false
            referencedRelation: "trending_books"
            referencedColumns: ["id"]
          },
        ]
      }
      user_achievements: {
        Row: {
          achievement_code: string
          unlocked_at: string
          user_id: string
        }
        Insert: {
          achievement_code: string
          unlocked_at?: string
          user_id: string
        }
        Update: {
          achievement_code?: string
          unlocked_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_achievement_code_fkey"
            columns: ["achievement_code"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["code"]
          },
        ]
      }
      user_book_notes: {
        Row: {
          created_at: string
          notes: string | null
          updated_at: string
          user_book_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          notes?: string | null
          updated_at?: string
          user_book_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          notes?: string | null
          updated_at?: string
          user_book_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_book_notes_user_book_id_fkey"
            columns: ["user_book_id"]
            isOneToOne: true
            referencedRelation: "user_books"
            referencedColumns: ["id"]
          },
        ]
      }
      user_books: {
        Row: {
          available_for_loan: boolean
          available_for_trade: boolean
          book_id: string
          created_at: string
          current_page: number | null
          finished_at: string | null
          id: string
          is_public: boolean
          rating: number | null
          started_at: string | null
          status: Database["public"]["Enums"]["book_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          available_for_loan?: boolean
          available_for_trade?: boolean
          book_id: string
          created_at?: string
          current_page?: number | null
          finished_at?: string | null
          id?: string
          is_public?: boolean
          rating?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["book_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          available_for_loan?: boolean
          available_for_trade?: boolean
          book_id?: string
          created_at?: string
          current_page?: number | null
          finished_at?: string | null
          id?: string
          is_public?: boolean
          rating?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["book_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_books_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_books_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "trending_books"
            referencedColumns: ["id"]
          },
        ]
      }
      user_challenges: {
        Row: {
          category: string
          claimed_at: string | null
          completed_at: string | null
          created_at: string
          expires_at: string
          id: string
          progress: number
          status: string
          target: number
          template_code: string
          user_id: string
          xp_reward: number
        }
        Insert: {
          category: string
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          progress?: number
          status?: string
          target: number
          template_code: string
          user_id: string
          xp_reward: number
        }
        Update: {
          category?: string
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          progress?: number
          status?: string
          target?: number
          template_code?: string
          user_id?: string
          xp_reward?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_challenges_template_code_fkey"
            columns: ["template_code"]
            isOneToOne: false
            referencedRelation: "challenge_templates"
            referencedColumns: ["code"]
          },
        ]
      }
      user_interactions: {
        Row: {
          book_id: string
          created_at: string
          id: string
          kind: string
          meta: Json | null
          user_id: string
          weight: number
        }
        Insert: {
          book_id: string
          created_at?: string
          id?: string
          kind: string
          meta?: Json | null
          user_id: string
          weight?: number
        }
        Update: {
          book_id?: string
          created_at?: string
          id?: string
          kind?: string
          meta?: Json | null
          user_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_interactions_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_interactions_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "trending_books"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_streaks: {
        Row: {
          current_days: number
          freezes_available: number
          last_active_date: string | null
          last_freeze_grant: string | null
          last_freeze_used_date: string | null
          longest_days: number
          next_milestone: number
          updated_at: string
          user_id: string
        }
        Insert: {
          current_days?: number
          freezes_available?: number
          last_active_date?: string | null
          last_freeze_grant?: string | null
          last_freeze_used_date?: string | null
          longest_days?: number
          next_milestone?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          current_days?: number
          freezes_available?: number
          last_active_date?: string | null
          last_freeze_grant?: string | null
          last_freeze_used_date?: string | null
          longest_days?: number
          next_milestone?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_weights: {
        Row: {
          last_recomputed_at: string | null
          recs_clicked: number
          recs_dismissed: number
          recs_shown: number
          updated_at: string
          user_id: string
          w_collab: number
          w_content: number
          w_trending: number
        }
        Insert: {
          last_recomputed_at?: string | null
          recs_clicked?: number
          recs_dismissed?: number
          recs_shown?: number
          updated_at?: string
          user_id: string
          w_collab?: number
          w_content?: number
          w_trending?: number
        }
        Update: {
          last_recomputed_at?: string | null
          recs_clicked?: number
          recs_dismissed?: number
          recs_shown?: number
          updated_at?: string
          user_id?: string
          w_collab?: number
          w_content?: number
          w_trending?: number
        }
        Relationships: []
      }
      xp_events: {
        Row: {
          amount: number
          created_at: string
          id: string
          meta: Json | null
          source: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          meta?: Json | null
          source: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          meta?: Json | null
          source?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      ambassadors_view: {
        Row: {
          avatar_url: string | null
          display_name: string | null
          id: string | null
          position: number | null
          signups_count: number | null
          tier: string | null
          username: string | null
          xp_earned: number | null
        }
        Relationships: []
      }
      app_events_daily: {
        Row: {
          day: string | null
          event: string | null
          p50_latency_ms: number | null
          p95_latency_ms: number | null
          sessions: number | null
          total: number | null
          users: number | null
        }
        Relationships: []
      }
      books_quality_report: {
        Row: {
          avg_quality_score: number | null
          poor_quality_count: number | null
          total_books: number | null
          with_categories: number | null
          with_cover: number | null
          with_isbn13: number | null
          with_pages: number | null
          with_rich_desc: number | null
          with_series: number | null
        }
        Relationships: []
      }
      ranking_view: {
        Row: {
          avatar_url: string | null
          books_read: number | null
          display_name: string | null
          id: string | null
          level: number | null
          position: number | null
          reviews_count: number | null
          username: string | null
          xp: number | null
        }
        Relationships: []
      }
      trending_books: {
        Row: {
          id: string | null
          readers: number | null
          recent_interactions: number | null
          score: number | null
        }
        Relationships: []
      }
      weekly_ranking_view: {
        Row: {
          avatar_url: string | null
          display_name: string | null
          id: string | null
          level: number | null
          position: number | null
          username: string | null
          weekly_xp: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_buddy_read: {
        Args: { _buddy_id: string }
        Returns: {
          message: string
          success: boolean
        }[]
      }
      accept_club_invitation: {
        Args: { _invitation_id: string }
        Returns: {
          club_id: string
          message: string
          success: boolean
        }[]
      }
      active_seasonal_challenges: {
        Args: never
        Returns: {
          category: string
          code: string
          description: string
          icon: string
          metric: string
          tags: string[] | null
          target: number
          title: string
          weight: number
          xp_reward: number
        }[]
        SetofOptions: {
          from: "*"
          to: "challenge_templates"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      activity_relevance: {
        Args: {
          _activity_user: string
          _book_id: string
          _created_at: string
          _kind: string
          _user_id: string
        }
        Returns: number
      }
      add_xp: {
        Args: {
          _amount: number
          _meta?: Json
          _source?: string
          _user_id: string
        }
        Returns: {
          leveled_up: boolean
          new_level: number
          new_xp: number
        }[]
      }
      approve_club_request: {
        Args: { _request_id: string }
        Returns: {
          message: string
          success: boolean
        }[]
      }
      array_intersect_count: {
        Args: { a: string[]; b: string[] }
        Returns: number
      }
      assign_daily_challenges: { Args: { _user_id: string }; Returns: number }
      book_meta_issues: {
        Args: { _authors: string[]; _title: string }
        Returns: string[]
      }
      book_quality_score: {
        Args: { b: Database["public"]["Tables"]["books"]["Row"] }
        Returns: number
      }
      books_for_cover_audit: {
        Args: { _limit?: number }
        Returns: {
          book_id: string
          priority: number
        }[]
      }
      books_read_by_following: {
        Args: { _limit?: number; _user_id: string }
        Returns: {
          book_id: string
          reader_avatars: string[]
          reader_count: number
          reader_names: string[]
          recent_at: string
        }[]
      }
      can_view_library: {
        Args: { _owner: string; _viewer: string }
        Returns: boolean
      }
      check_achievements: {
        Args: { _user_id: string }
        Returns: {
          title: string
          unlocked_code: string
          xp_reward: number
        }[]
      }
      claim_challenge: {
        Args: { _challenge_id: string; _user_id: string }
        Returns: {
          message: string
          success: boolean
          xp_granted: number
        }[]
      }
      decline_buddy_read: {
        Args: { _buddy_id: string }
        Returns: {
          message: string
          success: boolean
        }[]
      }
      decline_club_invitation: {
        Args: { _invitation_id: string }
        Returns: {
          message: string
          success: boolean
        }[]
      }
      division_from_xp: { Args: { _xp: number }; Returns: string }
      ensure_invite: { Args: { _user_id: string }; Returns: string }
      find_duplicate_book: {
        Args: {
          _author: string
          _content_type?: Database["public"]["Enums"]["content_type"]
          _exclude_id?: string
          _title: string
        }
        Returns: string
      }
      get_affiliate_interactions_admin: {
        Args: { _from: string }
        Returns: {
          book_id: string
          created_at: string
          kind: string
          meta: Json
        }[]
      }
      get_collaborative_recommendations: {
        Args: { target_user_id: string }
        Returns: {
          avg_rating: number
          book_id: string
          collab_score: number
          reader_count: number
        }[]
      }
      get_following_stories: {
        Args: { _user_id: string }
        Returns: {
          avatar_url: string
          display_name: string
          has_unseen: boolean
          latest_at: string
          story_count: number
          user_id: string
          username: string
        }[]
      }
      get_my_buddy_reads: {
        Args: never
        Returns: {
          book_cover: string
          book_id: string
          book_title: string
          completed_at: string
          created_at: string
          id: string
          is_initiator: boolean
          my_percent: number
          partner_avatar: string
          partner_id: string
          partner_name: string
          partner_percent: number
          started_at: string
          status: string
        }[]
      }
      get_similar_users: {
        Args: { target_user_id: string }
        Returns: {
          common_count: number
          similar_user_id: string
        }[]
      }
      grant_xp: {
        Args: { _amount: number; _user_id: string }
        Returns: undefined
      }
      has_pending_club_invite: {
        Args: { _club: string; _user: string }
        Returns: boolean
      }
      has_pending_club_request: {
        Args: { _club: string; _user: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_buddy_participant: {
        Args: { _buddy_id: string; _user: string }
        Returns: boolean
      }
      is_club_member: {
        Args: { _club: string; _user: string }
        Returns: boolean
      }
      is_following: {
        Args: { _follower: string; _following: string }
        Returns: boolean
      }
      is_rec_recipient: {
        Args: { _rec_id: string; _user: string }
        Returns: boolean
      }
      level_for_xp: { Args: { _xp: number }; Returns: number }
      merge_books: {
        Args: { _canonical_id: string; _duplicate_id: string }
        Returns: Json
      }
      parse_series_title: {
        Args: { _title: string }
        Returns: {
          series_title: string
          volume_num: number
        }[]
      }
      reading_streak: { Args: { _user_id: string }; Returns: number }
      recommend_book: {
        Args: {
          _book_id: string
          _is_public: boolean
          _message: string
          _recipient_ids: string[]
        }
        Returns: {
          message: string
          recommendation_id: string
          success: boolean
          xp_granted: number
        }[]
      }
      recommend_for_user: {
        Args: { _limit?: number; _user_id: string }
        Returns: {
          affinity: number
          collab_readers: number
          id: string
          popularity: number
          reason: string
          score: number
        }[]
      }
      recompute_all_book_signals: { Args: { _limit?: number }; Returns: number }
      recompute_book_signals: { Args: { _book_id: string }; Returns: undefined }
      recompute_challenge_progress: {
        Args: { _user_id: string }
        Returns: number
      }
      recompute_user_weights: {
        Args: { _user_id: string }
        Returns: {
          ctr: number
          w_collab: number
          w_content: number
          w_trending: number
        }[]
      }
      redeem_invite: {
        Args: { _code: string; _new_user_id: string }
        Returns: {
          inviter_id: string
          message: string
          success: boolean
        }[]
      }
      reject_club_request: {
        Args: { _request_id: string }
        Returns: {
          message: string
          success: boolean
        }[]
      }
      search_books_internal: {
        Args: { lim?: number; q: string }
        Returns: {
          authors: string[]
          content_type: Database["public"]["Enums"]["content_type"]
          cover_url: string
          id: string
          isbn_10: string
          isbn_13: string
          published_year: number
          rank: number
          subtitle: string
          title: string
        }[]
      }
      series_collection_ranking: {
        Args: { _limit?: number }
        Returns: {
          avg_completion: number
          collectors: number
          content_type: Database["public"]["Enums"]["content_type"]
          cover_url: string
          series_id: string
          title: string
          total_volumes: number
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      similar_books: {
        Args: { _book_id: string; _limit?: number }
        Returns: {
          id: string
          score: number
        }[]
      }
      similar_books_lexical: {
        Args: { _book_id: string; _limit?: number }
        Returns: {
          id: string
          reason: string
          score: number
        }[]
      }
      similar_readers: {
        Args: { _limit?: number; _user_id: string }
        Returns: {
          avatar_url: string
          display_name: string
          id: string
          level: number
          shared_books: number
          shared_genres: number
          username: string
        }[]
      }
      track_book_dismiss: { Args: { _book_id: string }; Returns: undefined }
      track_book_view: { Args: { _book_id: string }; Returns: undefined }
      track_rec_click: { Args: { _book_id: string }; Returns: undefined }
      track_recs_shown: { Args: { _count: number }; Returns: undefined }
      track_search: { Args: { _query: string }; Returns: undefined }
      update_buddy_progress: {
        Args: { _buddy_id: string; _current_page: number; _percent: number }
        Returns: {
          both_finished: boolean
          message: string
          success: boolean
        }[]
      }
      update_streak: {
        Args: { _user_id: string }
        Returns: {
          bonus_xp: number
          current_days: number
          milestone_hit: number
        }[]
      }
      use_streak_freeze: {
        Args: { _user_id: string }
        Returns: {
          freezes_left: number
          message: string
          success: boolean
        }[]
      }
      user_content_types: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["content_type"][]
      }
      user_format_count: { Args: { _user_id: string }; Returns: number }
      user_taste: {
        Args: { _user_id: string }
        Returns: {
          category: string
          weight: number
        }[]
      }
      weekly_league_for_user: {
        Args: { _user_id: string }
        Returns: {
          demotion_threshold: number
          division: string
          division_label: string
          position_global: number
          position_in_division: number
          promotion_threshold: number
          total_in_division: number
          weekly_xp: number
        }[]
      }
      xp_for_level: { Args: { _level: number }; Returns: number }
    }
    Enums: {
      app_role: "admin" | "user"
      book_status: "not_read" | "reading" | "read" | "wishlist"
      content_type: "book" | "manga" | "comic" | "magazine"
      loan_status: "lent" | "returned" | "overdue"
      trade_status:
        | "pending"
        | "accepted"
        | "declined"
        | "completed"
        | "cancelled"
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
      app_role: ["admin", "user"],
      book_status: ["not_read", "reading", "read", "wishlist"],
      content_type: ["book", "manga", "comic", "magazine"],
      loan_status: ["lent", "returned", "overdue"],
      trade_status: [
        "pending",
        "accepted",
        "declined",
        "completed",
        "cancelled",
      ],
    },
  },
} as const
