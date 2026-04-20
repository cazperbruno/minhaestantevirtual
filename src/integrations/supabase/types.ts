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
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          favorite_genres: string[] | null
          id: string
          level: number
          onboarded_at: string | null
          updated_at: string
          username: string | null
          xp: number
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          favorite_genres?: string[] | null
          id: string
          level?: number
          onboarded_at?: string | null
          updated_at?: string
          username?: string | null
          xp?: number
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          favorite_genres?: string[] | null
          id?: string
          level?: number
          onboarded_at?: string | null
          updated_at?: string
          username?: string | null
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
    }
    Views: {
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
    }
    Functions: {
      array_intersect_count: {
        Args: { a: string[]; b: string[] }
        Returns: number
      }
      check_achievements: {
        Args: { _user_id: string }
        Returns: {
          title: string
          unlocked_code: string
          xp_reward: number
        }[]
      }
      grant_xp: {
        Args: { _amount: number; _user_id: string }
        Returns: undefined
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
      reading_streak: { Args: { _user_id: string }; Returns: number }
      recommend_for_user: {
        Args: { _limit?: number; _user_id: string }
        Returns: {
          affinity: number
          id: string
          popularity: number
          reason: string
          score: number
        }[]
      }
      similar_books: {
        Args: { _book_id: string; _limit?: number }
        Returns: {
          id: string
          score: number
        }[]
      }
      user_taste: {
        Args: { _user_id: string }
        Returns: {
          category: string
          weight: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user"
      book_status: "not_read" | "reading" | "read" | "wishlist"
      loan_status: "lent" | "returned" | "overdue"
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
    },
  },
} as const
