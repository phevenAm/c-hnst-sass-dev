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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      admin_private_events: {
        Row: {
          admin_id: string
          created_at: string
          ends_at: string
          id: string
          notes: string | null
          starts_at: string
          title: string
        }
        Insert: {
          admin_id: string
          created_at?: string
          ends_at: string
          id?: string
          notes?: string | null
          starts_at: string
          title: string
        }
        Update: {
          admin_id?: string
          created_at?: string
          ends_at?: string
          id?: string
          notes?: string | null
          starts_at?: string
          title?: string
        }
        Relationships: []
      }
      admin_todos: {
        Row: {
          admin_id: string
          completed: boolean
          completed_at: string | null
          created_at: string
          deadline: string | null
          id: string
          priority: number
          text: string
        }
        Insert: {
          admin_id: string
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          deadline?: string | null
          id?: string
          priority?: number
          text: string
        }
        Update: {
          admin_id?: string
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          deadline?: string | null
          id?: string
          priority?: number
          text?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_overrides: {
        Row: {
          admin_id: string
          created_at: string
          end_time: string | null
          id: string
          is_blocked: boolean
          label: string | null
          override_date: string
          start_time: string | null
        }
        Insert: {
          admin_id: string
          created_at?: string
          end_time?: string | null
          id?: string
          is_blocked?: boolean
          label?: string | null
          override_date: string
          start_time?: string | null
        }
        Update: {
          admin_id?: string
          created_at?: string
          end_time?: string | null
          id?: string
          is_blocked?: boolean
          label?: string | null
          override_date?: string
          start_time?: string | null
        }
        Relationships: []
      }
      availability_rules: {
        Row: {
          admin_id: string
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          label: string | null
          start_time: string
        }
        Insert: {
          admin_id: string
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          label?: string | null
          start_time: string
        }
        Update: {
          admin_id?: string
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          label?: string | null
          start_time?: string
        }
        Relationships: []
      }
      client_stubs: {
        Row: {
          codename: string | null
          created_at: string
          created_by: string
          email: string | null
          first_name: string
          id: string
          last_name: string
          linked_user_id: string | null
        }
        Insert: {
          codename?: string | null
          created_at?: string
          created_by: string
          email?: string | null
          first_name: string
          id?: string
          last_name: string
          linked_user_id?: string | null
        }
        Update: {
          codename?: string | null
          created_at?: string
          created_by?: string
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string
          linked_user_id?: string | null
        }
        Relationships: []
      }
      cpd_logs: {
        Row: {
          activity_type: Database["public"]["Enums"]["cpd_activity_type"]
          admin_id: string
          contract_code: string | null
          created_at: string
          date: string
          duration_minutes: number | null
          id: string
          issues_raised: string | null
          mode: string | null
          notes: string | null
          provider: string | null
          session_number: number | null
          supervisor_name: string | null
          title: string | null
          updated_at: string
          venue: string | null
        }
        Insert: {
          activity_type?: Database["public"]["Enums"]["cpd_activity_type"]
          admin_id: string
          contract_code?: string | null
          created_at?: string
          date: string
          duration_minutes?: number | null
          id?: string
          issues_raised?: string | null
          mode?: string | null
          notes?: string | null
          provider?: string | null
          session_number?: number | null
          supervisor_name?: string | null
          title?: string | null
          updated_at?: string
          venue?: string | null
        }
        Update: {
          activity_type?: Database["public"]["Enums"]["cpd_activity_type"]
          admin_id?: string
          contract_code?: string | null
          created_at?: string
          date?: string
          duration_minutes?: number | null
          id?: string
          issues_raised?: string | null
          mode?: string | null
          notes?: string | null
          provider?: string | null
          session_number?: number | null
          supervisor_name?: string | null
          title?: string | null
          updated_at?: string
          venue?: string | null
        }
        Relationships: []
      }
      feedback: {
        Row: {
          created_at: string
          id: string
          message: string
          page: string | null
          status: string
          submitter_id: string | null
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          page?: string | null
          status?: string
          submitter_id?: string | null
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          page?: string | null
          status?: string
          submitter_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_submitter_id_fkey"
            columns: ["submitter_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          message: string
          read: boolean
          type: string
          url: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          read?: boolean
          type: string
          url?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          read?: boolean
          type?: string
          url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      platform_access_token: {
        Row: {
          admin_id: string | null
          created_at: string
          expires_at: string | null
          id: number
          is_used: boolean | null
          token: string | null
          used_at: string | null
        }
        Insert: {
          admin_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: number
          is_used?: boolean | null
          token?: string | null
          used_at?: string | null
        }
        Update: {
          admin_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: number
          is_used?: boolean | null
          token?: string | null
          used_at?: string | null
        }
        Relationships: []
      }
      practice_settings: {
        Row: {
          address: string | null
          admin_id: string
          bank_account_name: string | null
          bank_account_number: string | null
          bank_name: string | null
          bank_payment_reference: string | null
          bank_sort_code: string | null
          billing_customer_id: string | null
          billing_period: string
          business_name: string | null
          counsellor_name: string | null
          cpd_annual_target_hours: number
          disabled_email_types: string[]
          email: string | null
          hidden_sections: string[]
          id: string
          logo_url: string | null
          note_enc_key: string | null
          note_enc_key_iv: string | null
          note_enc_rec_iv: string | null
          note_enc_rec_key: string | null
          note_enc_salt: string | null
          payment_deadline_hours: number
          phone: string | null
          reduce_motion: boolean
          referral_code: string | null
          referred_by_code: string | null
          reminder_email_body: string | null
          reminder_email_heading: string | null
          reminder_email_subject: string | null
          reminder_hours_before: number
          saved_locations: Json
          stripe_connect_account_id: string | null
          stripe_connect_onboarded: boolean
          stripe_subscription_id: string | null
          subscription_plan: string
          subscription_status: string
          updated_at: string
          use_client_codenames: boolean
        }
        Insert: {
          address?: string | null
          admin_id: string
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          bank_payment_reference?: string | null
          bank_sort_code?: string | null
          billing_customer_id?: string | null
          billing_period?: string
          business_name?: string | null
          counsellor_name?: string | null
          cpd_annual_target_hours?: number
          disabled_email_types?: string[]
          email?: string | null
          hidden_sections?: string[]
          id?: string
          logo_url?: string | null
          note_enc_key?: string | null
          note_enc_key_iv?: string | null
          note_enc_rec_iv?: string | null
          note_enc_rec_key?: string | null
          note_enc_salt?: string | null
          payment_deadline_hours?: number
          phone?: string | null
          reduce_motion?: boolean
          referral_code?: string | null
          referred_by_code?: string | null
          reminder_email_body?: string | null
          reminder_email_heading?: string | null
          reminder_email_subject?: string | null
          reminder_hours_before?: number
          saved_locations?: Json
          stripe_connect_account_id?: string | null
          stripe_connect_onboarded?: boolean
          stripe_subscription_id?: string | null
          subscription_plan?: string
          subscription_status?: string
          updated_at?: string
          use_client_codenames?: boolean
        }
        Update: {
          address?: string | null
          admin_id?: string
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          bank_payment_reference?: string | null
          bank_sort_code?: string | null
          billing_customer_id?: string | null
          billing_period?: string
          business_name?: string | null
          counsellor_name?: string | null
          cpd_annual_target_hours?: number
          disabled_email_types?: string[]
          email?: string | null
          hidden_sections?: string[]
          id?: string
          logo_url?: string | null
          note_enc_key?: string | null
          note_enc_key_iv?: string | null
          note_enc_rec_iv?: string | null
          note_enc_rec_key?: string | null
          note_enc_salt?: string | null
          payment_deadline_hours?: number
          phone?: string | null
          reduce_motion?: boolean
          referral_code?: string | null
          referred_by_code?: string | null
          reminder_email_body?: string | null
          reminder_email_heading?: string | null
          reminder_email_subject?: string | null
          reminder_hours_before?: number
          saved_locations?: Json
          stripe_connect_account_id?: string | null
          stripe_connect_onboarded?: boolean
          stripe_subscription_id?: string | null
          subscription_plan?: string
          subscription_status?: string
          updated_at?: string
          use_client_codenames?: boolean
        }
        Relationships: []
      }
      questionnaire_assignments: {
        Row: {
          assigned_at: string | null
          id: string
          is_plotted: boolean
          questionnaire_id: string | null
          user_id: string | null
        }
        Insert: {
          assigned_at?: string | null
          id?: string
          is_plotted?: boolean
          questionnaire_id?: string | null
          user_id?: string | null
        }
        Update: {
          assigned_at?: string | null
          id?: string
          is_plotted?: boolean
          questionnaire_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "questionnaire_assignments_questionnaire_id_fkey"
            columns: ["questionnaire_id"]
            isOneToOne: false
            referencedRelation: "questionnaires"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questionnaire_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      questionnaires: {
        Row: {
          admin_id: string | null
          created_at: string
          description: string | null
          form_type: string
          frequency: string | null
          id: string
          is_active: boolean | null
          is_demo: boolean
          is_system_default: boolean
          source_default_id: string | null
          title: string | null
        }
        Insert: {
          admin_id?: string | null
          created_at?: string
          description?: string | null
          form_type?: string
          frequency?: string | null
          id?: string
          is_active?: boolean | null
          is_demo?: boolean
          is_system_default?: boolean
          source_default_id?: string | null
          title?: string | null
        }
        Update: {
          admin_id?: string | null
          created_at?: string
          description?: string | null
          form_type?: string
          frequency?: string | null
          id?: string
          is_active?: boolean | null
          is_demo?: boolean
          is_system_default?: boolean
          source_default_id?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "questionnaires_source_default_id_fkey"
            columns: ["source_default_id"]
            isOneToOne: false
            referencedRelation: "questionnaires"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          created_at: string
          id: string
          is_required: boolean | null
          max_label: string | null
          max_value: number | null
          min_label: string | null
          min_value: number | null
          options: Json | null
          order_index: number | null
          questionnaire_id: string | null
          tag_id: string | null
          text: string | null
          type: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_required?: boolean | null
          max_label?: string | null
          max_value?: number | null
          min_label?: string | null
          min_value?: number | null
          options?: Json | null
          order_index?: number | null
          questionnaire_id?: string | null
          tag_id?: string | null
          text?: string | null
          type?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_required?: boolean | null
          max_label?: string | null
          max_value?: number | null
          min_label?: string | null
          min_value?: number | null
          options?: Json | null
          order_index?: number | null
          questionnaire_id?: string | null
          tag_id?: string | null
          text?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "questions_questionnaire_id_fkey"
            columns: ["questionnaire_id"]
            isOneToOne: false
            referencedRelation: "questionnaires"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      reschedule_requests: {
        Row: {
          client_id: string
          created_at: string
          id: string
          message: string | null
          requested_at: string
          session_id: string
          status: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          message?: string | null
          requested_at: string
          session_id: string
          status?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          message?: string | null
          requested_at?: string
          session_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reschedule_requests_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      resources: {
        Row: {
          admin_id: string
          category: string | null
          content: string | null
          content_format: string | null
          created_at: string
          id: string
          is_demo: boolean
          is_published: boolean | null
          is_sensitive: boolean
          summary: string | null
          title: string | null
          type: string | null
          updated_at: string | null
          url: string | null
          videoUrl: string | null
        }
        Insert: {
          admin_id: string
          category?: string | null
          content?: string | null
          content_format?: string | null
          created_at?: string
          id?: string
          is_demo?: boolean
          is_published?: boolean | null
          is_sensitive?: boolean
          summary?: string | null
          title?: string | null
          type?: string | null
          updated_at?: string | null
          url?: string | null
          videoUrl?: string | null
        }
        Update: {
          admin_id?: string
          category?: string | null
          content?: string | null
          content_format?: string | null
          created_at?: string
          id?: string
          is_demo?: boolean
          is_published?: boolean | null
          is_sensitive?: boolean
          summary?: string | null
          title?: string | null
          type?: string | null
          updated_at?: string | null
          url?: string | null
          videoUrl?: string | null
        }
        Relationships: []
      }
      responses: {
        Row: {
          created_at: string
          id: string
          questionnaire_id: string | null
          scores: Json | null
          submitted_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          questionnaire_id?: string | null
          scores?: Json | null
          submitted_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          questionnaire_id?: string | null
          scores?: Json | null
          submitted_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "responses_questionnaire_id_fkey"
            columns: ["questionnaire_id"]
            isOneToOne: false
            referencedRelation: "questionnaires"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "responses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      session_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          session_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          session_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_notes: {
        Row: {
          admin_id: string
          content: string
          created_at: string
          id: string
          is_encrypted: boolean
          note_iv: string | null
          session_id: string | null
          stub_id: string | null
          user_id: string | null
        }
        Insert: {
          admin_id: string
          content: string
          created_at?: string
          id?: string
          is_encrypted?: boolean
          note_iv?: string | null
          session_id?: string | null
          stub_id?: string | null
          user_id?: string | null
        }
        Update: {
          admin_id?: string
          content?: string
          created_at?: string
          id?: string
          is_encrypted?: boolean
          note_iv?: string | null
          session_id?: string | null
          stub_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_notes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_notes_stub_id_fkey"
            columns: ["stub_id"]
            isOneToOne: false
            referencedRelation: "client_stubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_notes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          address: string | null
          attended: boolean | null
          client_id: string | null
          created_at: string
          created_by: string | null
          duration_minutes: number
          id: string
          location: string | null
          metadata: Json | null
          notes: string | null
          paid: boolean
          paid_at: string | null
          price_pence: number
          reference_code: string | null
          scheduled_at: string
          status: Database["public"]["Enums"]["session_status"]
          stripe_payment_intent_id: string | null
        }
        Insert: {
          address?: string | null
          attended?: boolean | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          duration_minutes?: number
          id?: string
          location?: string | null
          metadata?: Json | null
          notes?: string | null
          paid?: boolean
          paid_at?: string | null
          price_pence?: number
          reference_code?: string | null
          scheduled_at: string
          status?: Database["public"]["Enums"]["session_status"]
          stripe_payment_intent_id?: string | null
        }
        Update: {
          address?: string | null
          attended?: boolean | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          duration_minutes?: number
          id?: string
          location?: string | null
          metadata?: Json | null
          notes?: string | null
          paid?: boolean
          paid_at?: string | null
          price_pence?: number
          reference_code?: string | null
          scheduled_at?: string
          status?: Database["public"]["Enums"]["session_status"]
          stripe_payment_intent_id?: string | null
        }
        Relationships: []
      }
      stub_sessions: {
        Row: {
          admin_id: string
          amount_paid: number | null
          created_at: string
          currency: string
          duration_minutes: number | null
          id: string
          notes: string | null
          scheduled_at: string
          status: string
          stub_id: string
        }
        Insert: {
          admin_id: string
          amount_paid?: number | null
          created_at?: string
          currency?: string
          duration_minutes?: number | null
          id?: string
          notes?: string | null
          scheduled_at: string
          status?: string
          stub_id: string
        }
        Update: {
          admin_id?: string
          amount_paid?: number | null
          created_at?: string
          currency?: string
          duration_minutes?: number | null
          id?: string
          notes?: string | null
          scheduled_at?: string
          status?: string
          stub_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stub_sessions_stub_id_fkey"
            columns: ["stub_id"]
            isOneToOne: false
            referencedRelation: "client_stubs"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          admin_id: string
          created_at: string
          id: string
          is_demo: boolean
          name: string
        }
        Insert: {
          admin_id: string
          created_at?: string
          id?: string
          is_demo?: boolean
          name: string
        }
        Update: {
          admin_id?: string
          created_at?: string
          id?: string
          is_demo?: boolean
          name?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          admin_codename: string | null
          admin_id: string | null
          age: number | null
          avatar_url: string | null
          created_at: string
          deleted_at: string | null
          disabled: boolean | null
          display_name: string | null
          dob: string | null
          first_name: string | null
          focus_keywords: string[] | null
          id: string
          is_demo: boolean
          is_root_admin: boolean
          is_superadmin: boolean
          last_name: string | null
          onboarding_completed: boolean
          role: string | null
          stripe_customer_id: string | null
        }
        Insert: {
          admin_codename?: string | null
          admin_id?: string | null
          age?: number | null
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          disabled?: boolean | null
          display_name?: string | null
          dob?: string | null
          first_name?: string | null
          focus_keywords?: string[] | null
          id?: string
          is_demo?: boolean
          is_root_admin?: boolean
          is_superadmin?: boolean
          last_name?: string | null
          onboarding_completed?: boolean
          role?: string | null
          stripe_customer_id?: string | null
        }
        Update: {
          admin_codename?: string | null
          admin_id?: string | null
          age?: number | null
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          disabled?: boolean | null
          display_name?: string | null
          dob?: string | null
          first_name?: string | null
          focus_keywords?: string[] | null
          id?: string
          is_demo?: boolean
          is_root_admin?: boolean
          is_superadmin?: boolean
          last_name?: string | null
          onboarding_completed?: boolean
          role?: string | null
          stripe_customer_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_no_duplicate_submission: {
        Args: { p_questionnaire_id: string; p_user_id: string }
        Returns: boolean
      }
      consume_platform_access_token: {
        Args: { input_token: string }
        Returns: boolean
      }
      delete_own_account: { Args: never; Returns: undefined }
      delete_user_by_id: {
        Args: { target_user_id: string }
        Returns: undefined
      }
      get_my_is_demo: { Args: never; Returns: boolean }
      get_my_role: { Args: never; Returns: string }
      get_practice_busy_slots: {
        Args: { exclude_session_id?: string }
        Returns: {
          slot_end: string
          slot_start: string
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      is_superadmin: { Args: never; Returns: boolean }
      merge_stub_to_user: {
        Args: { p_stub_id: string; p_user_id: string }
        Returns: undefined
      }
      questionnaire_admin_id: { Args: { q_id: string }; Returns: string }
      questionnaire_is_demo: { Args: { q_id: string }; Returns: boolean }
      questionnaire_is_system_default: {
        Args: { q_id: string }
        Returns: boolean
      }
      reset_form_to_default: {
        Args: { p_questionnaire_id: string }
        Returns: undefined
      }
      validate_platform_access_token: {
        Args: { input_token: string }
        Returns: boolean
      }
    }
    Enums: {
      cpd_activity_type:
        | "supervision"
        | "training"
        | "reading"
        | "conference"
        | "peer_consultation"
        | "personal_therapy"
        | "other"
      session_status: "scheduled" | "completed" | "cancelled" | "rescheduled"
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
      cpd_activity_type: [
        "supervision",
        "training",
        "reading",
        "conference",
        "peer_consultation",
        "personal_therapy",
        "other",
      ],
      session_status: ["scheduled", "completed", "cancelled", "rescheduled"],
    },
  },
} as const
