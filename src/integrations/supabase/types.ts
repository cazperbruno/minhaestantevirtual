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
      books: {
        Row: {
          authors: string[]
          categories: string[] | null
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
          source: string | null
          source_id: string | null
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          authors?: string[]
          categories?: string[] | null
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
          source?: string | null
          source_id?: string | null
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          authors?: string[]
          categories?: string[] | null
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
          source?: string | null
          source_id?: string | null
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
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
          notes: string | null
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
          notes?: string | null
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
          notes?: string | null
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
          last_active_date: string | null
          longest_days: number
          next_milestone: number
          updated_at: string
          user_id: string
        }
        Insert: {
          current_days?: number
          last_active_date?: string | null
          longest_days?: number
          next_milestone?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          current_days?: number
          last_active_date?: string | null
          longest_days?: number
          next_milestone?: number
          updated_at?: string
          user_id?: string
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
      accept_club_invitation: {
        Args: { _invitation_id: string }
        Returns: {
          club_id: string
          message: string
          success: boolean
        }[]
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
      decline_club_invitation: {
        Args: { _invitation_id: string }
        Returns: {
          message: string
          success: boolean
        }[]
      }
      ensure_invite: { Args: { _user_id: string }; Returns: string }
      get_collaborative_recommendations: {
        Args: { target_user_id: string }
        Returns: {
          avg_rating: number
          book_id: string
          collab_score: number
          reader_count: number
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
      is_club_member: {
        Args: { _club: string; _user: string }
        Returns: boolean
      }
      is_following: {
        Args: { _follower: string; _following: string }
        Returns: boolean
      }
      level_for_xp: { Args: { _xp: number }; Returns: number }
      reading_streak: { Args: { _user_id: string }; Returns: number }
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
      recompute_challenge_progress: {
        Args: { _user_id: string }
        Returns: number
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
      similar_books: {
        Args: { _book_id: string; _limit?: number }
        Returns: {
          id: string
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
      update_streak: {
        Args: { _user_id: string }
        Returns: {
          bonus_xp: number
          current_days: number
          milestone_hit: number
        }[]
      }
      user_taste: {
        Args: { _user_id: string }
        Returns: {
          category: string
          weight: number
        }[]
      }
      xp_for_level: { Args: { _level: number }; Returns: number }
    }
    Enums: {
      app_role: "admin" | "user"
      book_status: "not_read" | "reading" | "read" | "wishlist"
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
