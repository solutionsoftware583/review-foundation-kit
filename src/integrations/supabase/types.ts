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
      reviewvala_rating_snapshots: {
        Row: {
          channel: string
          created_at: string
          id: string
          period_label: string
          rating: number
          workspace_slug: string
        }
        Insert: {
          channel: string
          created_at?: string
          id?: string
          period_label: string
          rating: number
          workspace_slug?: string
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          period_label?: string
          rating?: number
          workspace_slug?: string
        }
        Relationships: []
      }
      reviewvala_response_events: {
        Row: {
          action: string
          actor_name: string
          actor_role: string
          created_at: string
          from_status: string | null
          id: string
          note: string | null
          response_id: string
          to_status: string
        }
        Insert: {
          action: string
          actor_name?: string
          actor_role?: string
          created_at?: string
          from_status?: string | null
          id?: string
          note?: string | null
          response_id: string
          to_status: string
        }
        Update: {
          action?: string
          actor_name?: string
          actor_role?: string
          created_at?: string
          from_status?: string | null
          id?: string
          note?: string | null
          response_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviewvala_response_events_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "reviewvala_responses"
            referencedColumns: ["id"]
          },
        ]
      }
      reviewvala_responses: {
        Row: {
          author_name: string
          created_at: string
          id: string
          response_status: string
          response_text: string
          review_id: string
          updated_at: string
        }
        Insert: {
          author_name?: string
          created_at?: string
          id?: string
          response_status?: string
          response_text: string
          review_id: string
          updated_at?: string
        }
        Update: {
          author_name?: string
          created_at?: string
          id?: string
          response_status?: string
          response_text?: string
          review_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviewvala_responses_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviewvala_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      reviewvala_review_notes: {
        Row: {
          author_name: string
          created_at: string
          id: string
          note_text: string
          review_id: string
        }
        Insert: {
          author_name?: string
          created_at?: string
          id?: string
          note_text: string
          review_id: string
        }
        Update: {
          author_name?: string
          created_at?: string
          id?: string
          note_text?: string
          review_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviewvala_review_notes_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviewvala_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      reviewvala_reviews: {
        Row: {
          assignee: string | null
          created_at: string
          id: string
          location: string
          priority: string
          rating: number
          review_date: string
          review_text: string
          reviewer_initials: string
          reviewer_name: string
          sentiment: string
          source: string
          status: string
          time_label: string
          updated_at: string
          workspace_slug: string
        }
        Insert: {
          assignee?: string | null
          created_at?: string
          id?: string
          location: string
          priority?: string
          rating: number
          review_date?: string
          review_text: string
          reviewer_initials: string
          reviewer_name: string
          sentiment?: string
          source: string
          status?: string
          time_label: string
          updated_at?: string
          workspace_slug?: string
        }
        Update: {
          assignee?: string | null
          created_at?: string
          id?: string
          location?: string
          priority?: string
          rating?: number
          review_date?: string
          review_text?: string
          reviewer_initials?: string
          reviewer_name?: string
          sentiment?: string
          source?: string
          status?: string
          time_label?: string
          updated_at?: string
          workspace_slug?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
