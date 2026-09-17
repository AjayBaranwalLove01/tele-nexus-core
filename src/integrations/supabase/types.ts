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
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity: string | null
          entity_id: string | null
          id: number
          meta: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: number
          meta?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: number
          meta?: Json | null
        }
        Relationships: []
      }
      audit_logs_v2: {
        Row: {
          action: string
          created_at: string
          description: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: string | null
          module: string
          session_id: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          description?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          module: string
          session_id?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          description?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          module?: string
          session_id?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      crm_settings: {
        Row: {
          auto_refill: boolean
          enforce_10_digit_phone: boolean
          id: number
          leads_per_telecaller: number
          updated_at: string
        }
        Insert: {
          auto_refill?: boolean
          enforce_10_digit_phone?: boolean
          id?: number
          leads_per_telecaller?: number
          updated_at?: string
        }
        Update: {
          auto_refill?: boolean
          enforce_10_digit_phone?: boolean
          id?: number
          leads_per_telecaller?: number
          updated_at?: string
        }
        Relationships: []
      }
      import_jobs: {
        Row: {
          created_at: string
          created_by: string
          duplicate_rows: number
          error: string | null
          failed_rows: number
          filename: string | null
          finished_at: string | null
          id: string
          inserted_rows: number
          processed_rows: number
          started_at: string | null
          status: string
          total_rows: number
        }
        Insert: {
          created_at?: string
          created_by: string
          duplicate_rows?: number
          error?: string | null
          failed_rows?: number
          filename?: string | null
          finished_at?: string | null
          id?: string
          inserted_rows?: number
          processed_rows?: number
          started_at?: string | null
          status?: string
          total_rows?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          duplicate_rows?: number
          error?: string | null
          failed_rows?: number
          filename?: string | null
          finished_at?: string | null
          id?: string
          inserted_rows?: number
          processed_rows?: number
          started_at?: string | null
          status?: string
          total_rows?: number
        }
        Relationships: []
      }
      lead_activity_history: {
        Row: {
          activity_date: string
          activity_source: string
          activity_type: string
          call_date: string | null
          call_outcome: string | null
          created_at: string
          follow_up_date: string | null
          id: number
          import_batch_id: string | null
          lead_id: number
          metadata: Json | null
          new_assigned_name: string | null
          new_assigned_to: string | null
          new_status: string | null
          performed_by: string | null
          performed_by_name: string | null
          previous_assigned_name: string | null
          previous_assigned_to: string | null
          previous_status: string | null
          remarks: string | null
          telecaller_id: string | null
          telecaller_name: string | null
        }
        Insert: {
          activity_date?: string
          activity_source?: string
          activity_type: string
          call_date?: string | null
          call_outcome?: string | null
          created_at?: string
          follow_up_date?: string | null
          id?: number
          import_batch_id?: string | null
          lead_id: number
          metadata?: Json | null
          new_assigned_name?: string | null
          new_assigned_to?: string | null
          new_status?: string | null
          performed_by?: string | null
          performed_by_name?: string | null
          previous_assigned_name?: string | null
          previous_assigned_to?: string | null
          previous_status?: string | null
          remarks?: string | null
          telecaller_id?: string | null
          telecaller_name?: string | null
        }
        Update: {
          activity_date?: string
          activity_source?: string
          activity_type?: string
          call_date?: string | null
          call_outcome?: string | null
          created_at?: string
          follow_up_date?: string | null
          id?: number
          import_batch_id?: string | null
          lead_id?: number
          metadata?: Json | null
          new_assigned_name?: string | null
          new_assigned_to?: string | null
          new_status?: string | null
          performed_by?: string | null
          performed_by_name?: string | null
          previous_assigned_name?: string | null
          previous_assigned_to?: string | null
          previous_status?: string | null
          remarks?: string | null
          telecaller_id?: string | null
          telecaller_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_activity_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_archive: {
        Row: {
          archive_reason: string | null
          archived_at: string
          archived_by: string | null
          archived_by_name: string | null
          assigned_name: string | null
          assigned_to: string | null
          call_date: string | null
          city: string | null
          created_at: string
          email: string | null
          follow_up_date: string | null
          follow_up_time: string | null
          id: string
          last_remark: string | null
          lead_created_at: string | null
          lead_id: number
          lead_received_date: string | null
          lead_updated_at: string | null
          name: string | null
          phone_number: string | null
          remarks_count: number
          restored_at: string | null
          restored_by: string | null
          restored_by_name: string | null
          snapshot: Json | null
          source: string | null
          status_id: string | null
          status_name: string | null
          temperature_name: string | null
        }
        Insert: {
          archive_reason?: string | null
          archived_at?: string
          archived_by?: string | null
          archived_by_name?: string | null
          assigned_name?: string | null
          assigned_to?: string | null
          call_date?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          follow_up_date?: string | null
          follow_up_time?: string | null
          id?: string
          last_remark?: string | null
          lead_created_at?: string | null
          lead_id: number
          lead_received_date?: string | null
          lead_updated_at?: string | null
          name?: string | null
          phone_number?: string | null
          remarks_count?: number
          restored_at?: string | null
          restored_by?: string | null
          restored_by_name?: string | null
          snapshot?: Json | null
          source?: string | null
          status_id?: string | null
          status_name?: string | null
          temperature_name?: string | null
        }
        Update: {
          archive_reason?: string | null
          archived_at?: string
          archived_by?: string | null
          archived_by_name?: string | null
          assigned_name?: string | null
          assigned_to?: string | null
          call_date?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          follow_up_date?: string | null
          follow_up_time?: string | null
          id?: string
          last_remark?: string | null
          lead_created_at?: string | null
          lead_id?: number
          lead_received_date?: string | null
          lead_updated_at?: string | null
          name?: string | null
          phone_number?: string | null
          remarks_count?: number
          restored_at?: string | null
          restored_by?: string | null
          restored_by_name?: string | null
          snapshot?: Json | null
          source?: string | null
          status_id?: string | null
          status_name?: string | null
          temperature_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_archive_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_remarks: {
        Row: {
          created_at: string
          id: string
          lead_id: number
          remark: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: number
          remark: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: number
          remark?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_remarks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_remarks_user_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_requests: {
        Row: {
          approved_count: number | null
          assigned_count: number | null
          created_at: string
          id: string
          note: string | null
          requested_count: number
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          telecaller_id: string
        }
        Insert: {
          approved_count?: number | null
          assigned_count?: number | null
          created_at?: string
          id?: string
          note?: string | null
          requested_count?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          telecaller_id: string
        }
        Update: {
          approved_count?: number | null
          assigned_count?: number | null
          created_at?: string
          id?: string
          note?: string | null
          requested_count?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          telecaller_id?: string
        }
        Relationships: []
      }
      lead_statuses: {
        Row: {
          created_at: string
          id: string
          is_completion: boolean
          is_default: boolean
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_completion?: boolean
          is_default?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_completion?: boolean
          is_default?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      lead_temperatures: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      leads: {
        Row: {
          archive_reason: string | null
          archived_at: string | null
          archived_by: string | null
          assigned_at: string | null
          assigned_to: string | null
          call_date: string | null
          city: string | null
          completed_at: string | null
          created_at: string
          email: string | null
          follow_up_date: string | null
          follow_up_time: string | null
          id: number
          last_remark: string | null
          lead_received_date: string
          name: string | null
          phone_number: string | null
          remarks_count: number
          source: string | null
          status_id: string | null
          temperature_id: string | null
          updated_at: string
        }
        Insert: {
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          assigned_at?: string | null
          assigned_to?: string | null
          call_date?: string | null
          city?: string | null
          completed_at?: string | null
          created_at?: string
          email?: string | null
          follow_up_date?: string | null
          follow_up_time?: string | null
          id?: number
          last_remark?: string | null
          lead_received_date?: string
          name?: string | null
          phone_number?: string | null
          remarks_count?: number
          source?: string | null
          status_id?: string | null
          temperature_id?: string | null
          updated_at?: string
        }
        Update: {
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          assigned_at?: string | null
          assigned_to?: string | null
          call_date?: string | null
          city?: string | null
          completed_at?: string | null
          created_at?: string
          email?: string | null
          follow_up_date?: string | null
          follow_up_time?: string | null
          id?: number
          last_remark?: string | null
          lead_received_date?: string
          name?: string | null
          phone_number?: string | null
          remarks_count?: number
          source?: string | null
          status_id?: string | null
          temperature_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_to_profiles_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "lead_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_temperature_id_fkey"
            columns: ["temperature_id"]
            isOneToOne: false
            referencedRelation: "lead_temperatures"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean
          is_approved: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean
          is_approved?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          is_approved?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      user_activity_logs: {
        Row: {
          activity_type: string
          created_at: string
          duration: number
          ended_at: string | null
          id: string
          ip_address: string | null
          metadata: Json | null
          module: string
          page: string | null
          session_id: string | null
          started_at: string
          user_id: string
        }
        Insert: {
          activity_type?: string
          created_at?: string
          duration?: number
          ended_at?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          module: string
          page?: string | null
          session_id?: string | null
          started_at?: string
          user_id: string
        }
        Update: {
          activity_type?: string
          created_at?: string
          duration?: number
          ended_at?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          module?: string
          page?: string | null
          session_id?: string | null
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_activity_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "user_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_sessions: {
        Row: {
          active_duration: number
          browser: string | null
          created_at: string
          current_page: string | null
          device_info: string | null
          id: string
          idle_duration: number
          ip_address: string | null
          last_activity_at: string
          last_heartbeat_at: string
          login_at: string
          logout_at: string | null
          os: string | null
          status: string
          total_duration: number
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          active_duration?: number
          browser?: string | null
          created_at?: string
          current_page?: string | null
          device_info?: string | null
          id?: string
          idle_duration?: number
          ip_address?: string | null
          last_activity_at?: string
          last_heartbeat_at?: string
          login_at?: string
          logout_at?: string | null
          os?: string | null
          status?: string
          total_duration?: number
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          active_duration?: number
          browser?: string | null
          created_at?: string
          current_page?: string | null
          device_info?: string | null
          id?: string
          idle_duration?: number
          ip_address?: string | null
          last_activity_at?: string
          last_heartbeat_at?: string
          login_at?: string
          logout_at?: string | null
          os?: string | null
          status?: string
          total_duration?: number
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_lead_request: {
        Args: { _count: number; _id: string }
        Returns: number
      }
      archive_leads: {
        Args: { _ids: number[]; _reason?: string }
        Returns: Json
      }
      assign_leads_by_ids: {
        Args: { _ids: number[]; _telecaller: string }
        Returns: Json
      }
      assign_leads_by_phone: {
        Args: { _phones: string[]; _telecaller: string }
        Returns: Json
      }
      assign_leads_to_telecaller: {
        Args: { _count: number; _telecaller: string }
        Returns: number
      }
      bulk_insert_leads: {
        Args: { _job_id: string; _rows: Json }
        Returns: Json
      }
      close_stale_sessions: { Args: never; Returns: number }
      distribute_leads: { Args: { _per_caller: number }; Returns: Json }
      get_more_leads: { Args: never; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_approved: { Args: { _user_id: string }; Returns: boolean }
      lead_journey: { Args: { _lead_id: number }; Returns: Json }
      leads_worked: {
        Args: { _from: string; _telecaller?: string; _to: string }
        Returns: {
          activity_count: number
          assigned_name: string
          city: string
          current_status: string
          first_activity: string
          last_activity: string
          latest_remark: string
          lead_id: number
          name: string
          phone_number: string
          status_on_date: string
        }[]
      }
      productivity_daily: {
        Args: { _from: string; _telecaller?: string; _to: string }
        Returns: {
          activities: number
          activity_date: string
          calls: number
          completed: number
          converted: number
          followups: number
          remarks: number
          status_changes: number
          telecaller_id: string
          telecaller_name: string
          unique_leads: number
        }[]
      }
      productivity_summary: {
        Args: { _from: string; _telecaller?: string; _to: string }
        Returns: {
          activities: number
          calls: number
          completed: number
          converted: number
          currently_assigned: number
          followups: number
          status_changes: number
          telecaller_id: string
          telecaller_name: string
          unique_leads: number
        }[]
      }
      profile_name: { Args: { _id: string }; Returns: string }
      recall_unused_leads: { Args: { _telecaller?: string }; Returns: number }
      reject_lead_request: {
        Args: { _id: string; _note?: string }
        Returns: undefined
      }
      request_more_leads: { Args: { _count: number }; Returns: string }
      restore_leads: { Args: { _ids: number[] }; Returns: Json }
      status_name: { Args: { _id: string }; Returns: string }
      status_transitions: {
        Args: { _from: string; _telecaller?: string; _to: string }
        Returns: {
          new_status: string
          previous_status: string
          transitions: number
        }[]
      }
      title_case: { Args: { _txt: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "telecaller"
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
    Enums: {
      app_role: ["admin", "telecaller"],
    },
  },
} as const
