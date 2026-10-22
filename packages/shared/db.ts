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
    PostgrestVersion: "14.18"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      assets: {
        Row: {
          aspect_ratio: string | null
          completed_at: string | null
          cost_credits: number | null
          created_at: string
          deleted_at: string | null
          duration_s: number | null
          error_code: string | null
          error_message: string | null
          feature_tag: string | null
          id: string
          input_urls: string[] | null
          metadata: Json
          model: string | null
          negative_prompt: string | null
          project_id: string | null
          prompt: string | null
          provider: string | null
          provider_job_id: string | null
          resolution: string | null
          status: string
          thumbnail_url: string | null
          type: string
          url: string | null
          user_id: string
          visibility: string
        }
        Insert: {
          aspect_ratio?: string | null
          completed_at?: string | null
          cost_credits?: number | null
          created_at?: string
          deleted_at?: string | null
          duration_s?: number | null
          error_code?: string | null
          error_message?: string | null
          feature_tag?: string | null
          id: string
          input_urls?: string[] | null
          metadata?: Json
          model?: string | null
          negative_prompt?: string | null
          project_id?: string | null
          prompt?: string | null
          provider?: string | null
          provider_job_id?: string | null
          resolution?: string | null
          status?: string
          thumbnail_url?: string | null
          type: string
          url?: string | null
          user_id: string
          visibility?: string
        }
        Update: {
          aspect_ratio?: string | null
          completed_at?: string | null
          cost_credits?: number | null
          created_at?: string
          deleted_at?: string | null
          duration_s?: number | null
          error_code?: string | null
          error_message?: string | null
          feature_tag?: string | null
          id?: string
          input_urls?: string[] | null
          metadata?: Json
          model?: string | null
          negative_prompt?: string | null
          project_id?: string | null
          prompt?: string | null
          provider?: string | null
          provider_job_id?: string | null
          resolution?: string | null
          status?: string
          thumbnail_url?: string | null
          type?: string
          url?: string | null
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "assets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_ledger: {
        Row: {
          amount: number
          asset_id: string | null
          created_at: string
          expires_at: string | null
          id: number
          kind: string
          note: string | null
          ref: string | null
          status: string
          user_id: string
        }
        Insert: {
          amount: number
          asset_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: number
          kind: string
          note?: string | null
          ref?: string | null
          status?: string
          user_id: string
        }
        Update: {
          amount?: number
          asset_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: number
          kind?: string
          note?: string | null
          ref?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      models: {
        Row: {
          badge: string | null
          cost_credits: number | null
          cost_per_second: number | null
          default_params: Json
          enabled: boolean
          fallback_slug: string | null
          id: string
          input_schema: Json | null
          max_duration_s: number | null
          name_ar: string
          name_en: string
          provider: string
          provider_slug: string
          rollout_pct: number
          sort: number
          supports: Json
          type: string
        }
        Insert: {
          badge?: string | null
          cost_credits?: number | null
          cost_per_second?: number | null
          default_params?: Json
          enabled?: boolean
          fallback_slug?: string | null
          id: string
          input_schema?: Json | null
          max_duration_s?: number | null
          name_ar: string
          name_en: string
          provider: string
          provider_slug: string
          rollout_pct?: number
          sort?: number
          supports?: Json
          type: string
        }
        Update: {
          badge?: string | null
          cost_credits?: number | null
          cost_per_second?: number | null
          default_params?: Json
          enabled?: boolean
          fallback_slug?: string | null
          id?: string
          input_schema?: Json | null
          max_duration_s?: number | null
          name_ar?: string
          name_en?: string
          provider?: string
          provider_slug?: string
          rollout_pct?: number
          sort?: number
          supports?: Json
          type?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_sar: number
          created_at: string
          credits: number
          id: string
          provider: string
          provider_payment_id: string | null
          raw: Json | null
          status: string
          user_id: string | null
          vat_sar: number
        }
        Insert: {
          amount_sar: number
          created_at?: string
          credits?: number
          id?: string
          provider?: string
          provider_payment_id?: string | null
          raw?: Json | null
          status?: string
          user_id?: string | null
          vat_sar?: number
        }
        Update: {
          amount_sar?: number
          created_at?: string
          credits?: number
          id?: string
          provider?: string
          provider_payment_id?: string | null
          raw?: Json | null
          status?: string
          user_id?: string | null
          vat_sar?: number
        }
        Relationships: [
          {
            foreignKeyName: "payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          id: string
          max_concurrent: number
          monthly_credits: number
          name_ar: string
          name_en: string
          price_sar_monthly: number | null
          price_sar_yearly: number | null
          private_by_default: boolean
          sort: number
        }
        Insert: {
          id: string
          max_concurrent?: number
          monthly_credits: number
          name_ar: string
          name_en: string
          price_sar_monthly?: number | null
          price_sar_yearly?: number | null
          private_by_default?: boolean
          sort?: number
        }
        Update: {
          id?: string
          max_concurrent?: number
          monthly_credits?: number
          name_ar?: string
          name_en?: string
          price_sar_monthly?: number | null
          price_sar_yearly?: number | null
          private_by_default?: boolean
          sort?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          auto_refill_credits: number | null
          auto_refill_threshold: number | null
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          locale: string
          plan_id: string
          username: string | null
        }
        Insert: {
          auto_refill_credits?: number | null
          auto_refill_threshold?: number | null
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          locale?: string
          plan_id?: string
          username?: string | null
        }
        Update: {
          auto_refill_credits?: number | null
          auto_refill_threshold?: number | null
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          locale?: string
          plan_id?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      studios: {
        Row: {
          badge: string | null
          cost_credits: number | null
          description_ar: string | null
          enabled: boolean
          icon: string | null
          id: string
          name_ar: string
          pipeline: Json
          sort: number
        }
        Insert: {
          badge?: string | null
          cost_credits?: number | null
          description_ar?: string | null
          enabled?: boolean
          icon?: string | null
          id: string
          name_ar: string
          pipeline: Json
          sort?: number
        }
        Update: {
          badge?: string | null
          cost_credits?: number | null
          description_ar?: string | null
          enabled?: boolean
          icon?: string | null
          id?: string
          name_ar?: string
          pipeline?: Json
          sort?: number
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan_id: string
          provider: string
          provider_customer_id: string | null
          provider_token: string | null
          status: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id: string
          provider?: string
          provider_customer_id?: string | null
          provider_token?: string | null
          status: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id?: string
          provider?: string
          provider_customer_id?: string | null
          provider_token?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          created_at: string
          event_id: string
          id: number
          payload: Json | null
          processed_at: string | null
          source: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: number
          payload?: Json | null
          processed_at?: string | null
          source: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: number
          payload?: Json | null
          processed_at?: string | null
          source?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      confirm_hold: { Args: { p_hold_id: number }; Returns: undefined }
      get_balance: { Args: { p_user: string }; Returns: number }
      grant_credits: {
        Args: {
          p_amount: number
          p_expires?: string
          p_kind: string
          p_ref?: string
          p_user: string
        }
        Returns: number
      }
      hold_credits: {
        Args: { p_amount: number; p_asset: string; p_user: string }
        Returns: number
      }
      release_hold: {
        Args: { p_hold_id: number; p_note?: string }
        Returns: undefined
      }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
