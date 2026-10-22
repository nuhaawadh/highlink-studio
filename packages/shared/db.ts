/**
 * أنواع قاعدة البيانات — نسخة يدوية مؤقتة تطابق supabase/migrations/0001_init.sql.
 * بعد تشغيل Supabase محليًا، تُستبدل بالكامل بالأمر:
 *   npm run gen:types   →  supabase gen types typescript --local > packages/shared/db.ts
 * لا تعدّلي هذا الملف يدويًا بعد ذلك.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          username: string | null
          display_name: string | null
          avatar_url: string | null
          plan_id: string
          locale: string
          auto_refill_threshold: number | null
          auto_refill_credits: number | null
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['profiles']['Row']> & { id: string }
        Update: Partial<Database['public']['Tables']['profiles']['Row']>
        Relationships: []
      }
      assets: {
        Row: {
          id: string
          user_id: string
          project_id: string | null
          type: 'image' | 'video' | 'audio'
          status: 'queued' | 'processing' | 'completed' | 'failed' | 'canceled'
          feature_tag: string | null
          model: string | null
          prompt: string | null
          negative_prompt: string | null
          aspect_ratio: string | null
          duration_s: number | null
          resolution: string | null
          input_urls: string[] | null
          url: string | null
          thumbnail_url: string | null
          provider: string | null
          provider_job_id: string | null
          cost_credits: number | null
          error_code: string | null
          error_message: string | null
          visibility: 'private' | 'public'
          metadata: Json
          created_at: string
          completed_at: string | null
          deleted_at: string | null
        }
        Insert: Partial<Database['public']['Tables']['assets']['Row']> & {
          id: string
          user_id: string
          type: 'image' | 'video' | 'audio'
        }
        Update: Partial<Database['public']['Tables']['assets']['Row']>
        Relationships: []
      }
      credit_ledger: {
        Row: {
          id: number
          user_id: string
          amount: number
          kind: 'grant' | 'hold' | 'charge' | 'refund' | 'expire' | 'bonus' | 'adjust'
          status: 'held' | 'posted' | 'released'
          asset_id: string | null
          ref: string | null
          note: string | null
          expires_at: string | null
          created_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      plans: {
        Row: {
          id: string
          name_ar: string
          name_en: string
          monthly_credits: number
          price_sar_monthly: number | null
          price_sar_yearly: number | null
          max_concurrent: number
          private_by_default: boolean
          sort: number
        }
        Insert: never
        Update: never
        Relationships: []
      }
      models: {
        Row: {
          id: string
          name_ar: string
          name_en: string
          type: 'image' | 'video' | 'audio'
          provider: 'replicate' | 'fal' | 'google'
          provider_slug: string
          fallback_slug: string | null
          cost_credits: number | null
          cost_per_second: number | null
          max_duration_s: number | null
          supports: Json
          default_params: Json
          input_schema: Json | null
          enabled: boolean
          rollout_pct: number
          badge: string | null
          sort: number
        }
        Insert: never
        Update: never
        Relationships: []
      }
      studios: {
        Row: {
          id: string
          name_ar: string
          description_ar: string | null
          icon: string | null
          badge: string | null
          pipeline: Json
          cost_credits: number | null
          enabled: boolean
          sort: number
        }
        Insert: never
        Update: never
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      get_balance: { Args: { p_user: string }; Returns: number }
      hold_credits: { Args: { p_user: string; p_amount: number; p_asset: string }; Returns: number }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
