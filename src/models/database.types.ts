export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4";
  };
  public: {
    Tables: {
      admin_google_calendar: {
        Row: {
          access_token: string | null;
          access_token_expires_at: string | null;
          admin_id: string;
          calendar_id: string;
          created_at: string;
          google_email: string | null;
          refresh_token: string;
          sync_enabled: boolean;
          updated_at: string;
        };
        Insert: {
          access_token?: string | null;
          access_token_expires_at?: string | null;
          admin_id: string;
          calendar_id?: string;
          created_at?: string;
          google_email?: string | null;
          refresh_token: string;
          sync_enabled?: boolean;
          updated_at?: string;
        };
        Update: {
          access_token?: string | null;
          access_token_expires_at?: string | null;
          admin_id?: string;
          calendar_id?: string;
          created_at?: string;
          google_email?: string | null;
          refresh_token?: string;
          sync_enabled?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admin_google_calendar_admin_id_fkey";
            columns: ["admin_id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      admin_private_events: {
        Row: {
          admin_id: string;
          cost_pence: number | null;
          created_at: string;
          currency: string;
          ends_at: string;
          id: string;
          is_cpd: boolean;
          is_supervision: boolean;
          notes: string | null;
          starts_at: string;
          title: string;
        };
        Insert: {
          admin_id: string;
          cost_pence?: number | null;
          created_at?: string;
          currency?: string;
          ends_at: string;
          id?: string;
          is_cpd?: boolean;
          is_supervision?: boolean;
          notes?: string | null;
          starts_at: string;
          title: string;
        };
        Update: {
          admin_id?: string;
          cost_pence?: number | null;
          created_at?: string;
          currency?: string;
          ends_at?: string;
          id?: string;
          is_cpd?: boolean;
          is_supervision?: boolean;
          notes?: string | null;
          starts_at?: string;
          title?: string;
        };
        Relationships: [];
      };
      admin_reminder_mutes: {
        Row: {
          admin_id: string;
          client_id: string | null;
          created_at: string;
          id: string;
          stub_id: string | null;
        };
        Insert: {
          admin_id: string;
          client_id?: string | null;
          created_at?: string;
          id?: string;
          stub_id?: string | null;
        };
        Update: {
          admin_id?: string;
          client_id?: string | null;
          created_at?: string;
          id?: string;
          stub_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "admin_reminder_mutes_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "admin_reminder_mutes_stub_id_fkey";
            columns: ["stub_id"];
            isOneToOne: false;
            referencedRelation: "client_stubs";
            referencedColumns: ["id"];
          },
        ];
      };
      admin_todos: {
        Row: {
          admin_id: string;
          completed: boolean;
          completed_at: string | null;
          created_at: string;
          deadline: string | null;
          id: string;
          priority: number;
          text: string;
        };
        Insert: {
          admin_id: string;
          completed?: boolean;
          completed_at?: string | null;
          created_at?: string;
          deadline?: string | null;
          id?: string;
          priority?: number;
          text: string;
        };
        Update: {
          admin_id?: string;
          completed?: boolean;
          completed_at?: string | null;
          created_at?: string;
          deadline?: string | null;
          id?: string;
          priority?: number;
          text?: string;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          id: string;
          new_data: Json | null;
          old_data: Json | null;
          record_id: string | null;
          table_name: string;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          id?: string;
          new_data?: Json | null;
          old_data?: Json | null;
          record_id?: string | null;
          table_name: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          id?: string;
          new_data?: Json | null;
          old_data?: Json | null;
          record_id?: string | null;
          table_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      availability_overrides: {
        Row: {
          admin_id: string;
          created_at: string;
          end_time: string | null;
          id: string;
          is_blocked: boolean;
          label: string | null;
          override_date: string;
          start_time: string | null;
        };
        Insert: {
          admin_id: string;
          created_at?: string;
          end_time?: string | null;
          id?: string;
          is_blocked?: boolean;
          label?: string | null;
          override_date: string;
          start_time?: string | null;
        };
        Update: {
          admin_id?: string;
          created_at?: string;
          end_time?: string | null;
          id?: string;
          is_blocked?: boolean;
          label?: string | null;
          override_date?: string;
          start_time?: string | null;
        };
        Relationships: [];
      };
      availability_rules: {
        Row: {
          admin_id: string;
          created_at: string;
          day_of_week: number;
          end_time: string;
          id: string;
          label: string | null;
          start_time: string;
        };
        Insert: {
          admin_id: string;
          created_at?: string;
          day_of_week: number;
          end_time: string;
          id?: string;
          label?: string | null;
          start_time: string;
        };
        Update: {
          admin_id?: string;
          created_at?: string;
          day_of_week?: number;
          end_time?: string;
          id?: string;
          label?: string | null;
          start_time?: string;
        };
        Relationships: [];
      };
      cancellation_requests: {
        Row: {
          client_id: string;
          created_at: string;
          id: string;
          message: string | null;
          session_id: string;
          status: string;
        };
        Insert: {
          client_id: string;
          created_at?: string;
          id?: string;
          message?: string | null;
          session_id: string;
          status?: string;
        };
        Update: {
          client_id?: string;
          created_at?: string;
          id?: string;
          message?: string | null;
          session_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cancellation_requests_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      client_stubs: {
        Row: {
          codename: string | null;
          created_at: string;
          created_by: string;
          email: string | null;
          first_name: string;
          id: string;
          last_name: string;
          linked_user_id: string | null;
        };
        Insert: {
          codename?: string | null;
          created_at?: string;
          created_by?: string;
          email?: string | null;
          first_name: string;
          id?: string;
          last_name: string;
          linked_user_id?: string | null;
        };
        Update: {
          codename?: string | null;
          created_at?: string;
          created_by?: string;
          email?: string | null;
          first_name?: string;
          id?: string;
          last_name?: string;
          linked_user_id?: string | null;
        };
        Relationships: [];
      };
      client_views: {
        Row: {
          admin_id: string;
          client_ref: string;
          client_type: string;
          viewed_at: string;
        };
        Insert: {
          admin_id: string;
          client_ref: string;
          client_type: string;
          viewed_at?: string;
        };
        Update: {
          admin_id?: string;
          client_ref?: string;
          client_type?: string;
          viewed_at?: string;
        };
        Relationships: [];
      };
      cpd_logs: {
        Row: {
          activity_type: Database["public"]["Enums"]["cpd_activity_type"];
          admin_id: string;
          contract_code: string | null;
          created_at: string;
          custom_category: string | null;
          date: string;
          duration_minutes: number | null;
          id: string;
          issues_raised: string | null;
          mode: string | null;
          notes: string | null;
          provider: string | null;
          session_number: number | null;
          supervisor_name: string | null;
          title: string | null;
          updated_at: string;
          venue: string | null;
        };
        Insert: {
          activity_type?: Database["public"]["Enums"]["cpd_activity_type"];
          admin_id: string;
          contract_code?: string | null;
          created_at?: string;
          custom_category?: string | null;
          date: string;
          duration_minutes?: number | null;
          id?: string;
          issues_raised?: string | null;
          mode?: string | null;
          notes?: string | null;
          provider?: string | null;
          session_number?: number | null;
          supervisor_name?: string | null;
          title?: string | null;
          updated_at?: string;
          venue?: string | null;
        };
        Update: {
          activity_type?: Database["public"]["Enums"]["cpd_activity_type"];
          admin_id?: string;
          contract_code?: string | null;
          created_at?: string;
          custom_category?: string | null;
          date?: string;
          duration_minutes?: number | null;
          id?: string;
          issues_raised?: string | null;
          mode?: string | null;
          notes?: string | null;
          provider?: string | null;
          session_number?: number | null;
          supervisor_name?: string | null;
          title?: string | null;
          updated_at?: string;
          venue?: string | null;
        };
        Relationships: [];
      };
      demo_requests: {
        Row: {
          created_at: string;
          for_value: string;
          id: string;
          kind: string;
          last_used_at: string | null;
          used_count: number;
        };
        Insert: {
          created_at?: string;
          for_value: string;
          id?: string;
          kind?: string;
          last_used_at?: string | null;
          used_count?: number;
        };
        Update: {
          created_at?: string;
          for_value?: string;
          id?: string;
          kind?: string;
          last_used_at?: string | null;
          used_count?: number;
        };
        Relationships: [];
      };
      email_logs: {
        Row: {
          admin_id: string | null;
          client_id: string | null;
          created_at: string;
          email_type: string;
          error_message: string | null;
          id: string;
          recipient_email: string;
          resend_email_id: string | null;
          sent_at: string;
          session_id: string | null;
          status: string;
          subject: string;
        };
        Insert: {
          admin_id?: string | null;
          client_id?: string | null;
          created_at?: string;
          email_type: string;
          error_message?: string | null;
          id?: string;
          recipient_email: string;
          resend_email_id?: string | null;
          sent_at?: string;
          session_id?: string | null;
          status?: string;
          subject: string;
        };
        Update: {
          admin_id?: string | null;
          client_id?: string | null;
          created_at?: string;
          email_type?: string;
          error_message?: string | null;
          id?: string;
          recipient_email?: string;
          resend_email_id?: string | null;
          sent_at?: string;
          session_id?: string | null;
          status?: string;
          subject?: string;
        };
        Relationships: [
          {
            foreignKeyName: "email_logs_admin_id_fkey";
            columns: ["admin_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "email_logs_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "email_logs_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      feedback: {
        Row: {
          created_at: string;
          id: string;
          message: string;
          page: string | null;
          status: string;
          submitter_id: string | null;
          type: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          message: string;
          page?: string | null;
          status?: string;
          submitter_id?: string | null;
          type: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          message?: string;
          page?: string | null;
          status?: string;
          submitter_id?: string | null;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "feedback_submitter_id_fkey";
            columns: ["submitter_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      journal_entries: {
        Row: {
          content: string;
          created_at: string;
          id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          content?: string;
          created_at?: string;
          id?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "journal_entries_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          created_at: string;
          id: string;
          message: string;
          read: boolean;
          type: string;
          url: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          message: string;
          read?: boolean;
          type: string;
          url?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          message?: string;
          read?: boolean;
          type?: string;
          url?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      payments: {
        Row: {
          admin_id: string;
          amount_pence: number;
          client_id: string | null;
          created_at: string;
          description: string | null;
          id: string;
          paid_at: string;
          stub_id: string | null;
        };
        Insert: {
          admin_id?: string;
          amount_pence?: number;
          client_id?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          paid_at?: string;
          stub_id?: string | null;
        };
        Update: {
          admin_id?: string;
          amount_pence?: number;
          client_id?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          paid_at?: string;
          stub_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "payments_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_stub_id_fkey";
            columns: ["stub_id"];
            isOneToOne: false;
            referencedRelation: "client_stubs";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_access_token: {
        Row: {
          admin_id: string | null;
          created_at: string;
          expires_at: string | null;
          id: number;
          is_used: boolean | null;
          stub_id: string | null;
          token: string | null;
          used_at: string | null;
        };
        Insert: {
          admin_id?: string | null;
          created_at?: string;
          expires_at?: string | null;
          id?: number;
          is_used?: boolean | null;
          stub_id?: string | null;
          token?: string | null;
          used_at?: string | null;
        };
        Update: {
          admin_id?: string | null;
          created_at?: string;
          expires_at?: string | null;
          id?: number;
          is_used?: boolean | null;
          stub_id?: string | null;
          token?: string | null;
          used_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "platform_access_token_stub_id_fkey";
            columns: ["stub_id"];
            isOneToOne: false;
            referencedRelation: "client_stubs";
            referencedColumns: ["id"];
          },
        ];
      };
      practice_settings: {
        Row: {
          address: string | null;
          admin_id: string;
          admin_reminder_lead_minutes: number;
          admin_reminder_summary_fields: string[];
          admin_reminders_enabled: boolean;
          allow_block_session_cancellation: boolean;
          auto_cancel_enabled: boolean;
          bank_account_name: string | null;
          bank_account_number: string | null;
          bank_name: string | null;
          bank_payment_reference: string | null;
          bank_sort_code: string | null;
          billing_customer_id: string | null;
          billing_period: string;
          business_name: string | null;
          card_payments_enabled: boolean;
          consent_body: string;
          consent_counsellor_cta: string;
          consent_enabled: boolean;
          consent_pdf_url: string | null;
          consent_questionnaire_id: string | null;
          consent_title: string;
          counsellor_name: string | null;
          cpd_annual_target_hours: number;
          cpd_custom_categories: string[];
          disabled_email_types: string[];
          email: string | null;
          enc_data_key: string | null;
          enc_data_key_iv: string | null;
          enc_data_key_salt: string | null;
          hidden_sections: string[];
          id: string;
          is_paused: boolean;
          logo_url: string | null;
          onboarding_required: boolean;
          paused_at: string | null;
          paused_reason: string | null;
          payment_deadline_hours: number;
          phone: string | null;
          reduce_motion: boolean;
          referral_code: string | null;
          referred_by_code: string | null;
          reminder_email_body: string | null;
          reminder_email_heading: string | null;
          reminder_email_subject: string | null;
          reminder_hours_before: number;
          reschedule_cutoff_hours: number | null;
          saved_locations: Json;
          stripe_connect_account_id: string | null;
          stripe_connect_onboarded: boolean;
          stripe_subscription_id: string | null;
          subscription_cancel_at_period_end: boolean;
          subscription_current_period_end: string | null;
          subscription_plan: string;
          subscription_status: string;
          updated_at: string;
          use_client_codenames: boolean;
        };
        Insert: {
          address?: string | null;
          admin_id: string;
          admin_reminder_lead_minutes?: number;
          admin_reminder_summary_fields?: string[];
          admin_reminders_enabled?: boolean;
          allow_block_session_cancellation?: boolean;
          auto_cancel_enabled?: boolean;
          bank_account_name?: string | null;
          bank_account_number?: string | null;
          bank_name?: string | null;
          bank_payment_reference?: string | null;
          bank_sort_code?: string | null;
          billing_customer_id?: string | null;
          billing_period?: string;
          business_name?: string | null;
          card_payments_enabled?: boolean;
          consent_body?: string;
          consent_counsellor_cta?: string;
          consent_enabled?: boolean;
          consent_pdf_url?: string | null;
          consent_questionnaire_id?: string | null;
          consent_title?: string;
          counsellor_name?: string | null;
          cpd_annual_target_hours?: number;
          cpd_custom_categories?: string[];
          disabled_email_types?: string[];
          email?: string | null;
          enc_data_key?: string | null;
          enc_data_key_iv?: string | null;
          enc_data_key_salt?: string | null;
          hidden_sections?: string[];
          id?: string;
          is_paused?: boolean;
          logo_url?: string | null;
          onboarding_required?: boolean;
          paused_at?: string | null;
          paused_reason?: string | null;
          payment_deadline_hours?: number;
          phone?: string | null;
          reduce_motion?: boolean;
          referral_code?: string | null;
          referred_by_code?: string | null;
          reminder_email_body?: string | null;
          reminder_email_heading?: string | null;
          reminder_email_subject?: string | null;
          reminder_hours_before?: number;
          reschedule_cutoff_hours?: number | null;
          saved_locations?: Json;
          stripe_connect_account_id?: string | null;
          stripe_connect_onboarded?: boolean;
          stripe_subscription_id?: string | null;
          subscription_cancel_at_period_end?: boolean;
          subscription_current_period_end?: string | null;
          subscription_plan?: string;
          subscription_status?: string;
          updated_at?: string;
          use_client_codenames?: boolean;
        };
        Update: {
          address?: string | null;
          admin_id?: string;
          admin_reminder_lead_minutes?: number;
          admin_reminder_summary_fields?: string[];
          admin_reminders_enabled?: boolean;
          allow_block_session_cancellation?: boolean;
          auto_cancel_enabled?: boolean;
          bank_account_name?: string | null;
          bank_account_number?: string | null;
          bank_name?: string | null;
          bank_payment_reference?: string | null;
          bank_sort_code?: string | null;
          billing_customer_id?: string | null;
          billing_period?: string;
          business_name?: string | null;
          card_payments_enabled?: boolean;
          consent_body?: string;
          consent_counsellor_cta?: string;
          consent_enabled?: boolean;
          consent_pdf_url?: string | null;
          consent_questionnaire_id?: string | null;
          consent_title?: string;
          counsellor_name?: string | null;
          cpd_annual_target_hours?: number;
          cpd_custom_categories?: string[];
          disabled_email_types?: string[];
          email?: string | null;
          enc_data_key?: string | null;
          enc_data_key_iv?: string | null;
          enc_data_key_salt?: string | null;
          hidden_sections?: string[];
          id?: string;
          is_paused?: boolean;
          logo_url?: string | null;
          onboarding_required?: boolean;
          paused_at?: string | null;
          paused_reason?: string | null;
          payment_deadline_hours?: number;
          phone?: string | null;
          reduce_motion?: boolean;
          referral_code?: string | null;
          referred_by_code?: string | null;
          reminder_email_body?: string | null;
          reminder_email_heading?: string | null;
          reminder_email_subject?: string | null;
          reminder_hours_before?: number;
          reschedule_cutoff_hours?: number | null;
          saved_locations?: Json;
          stripe_connect_account_id?: string | null;
          stripe_connect_onboarded?: boolean;
          stripe_subscription_id?: string | null;
          subscription_cancel_at_period_end?: boolean;
          subscription_current_period_end?: string | null;
          subscription_plan?: string;
          subscription_status?: string;
          updated_at?: string;
          use_client_codenames?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "practice_settings_consent_questionnaire_id_fkey";
            columns: ["consent_questionnaire_id"];
            isOneToOne: false;
            referencedRelation: "questionnaires";
            referencedColumns: ["id"];
          },
        ];
      };
      questionnaire_assignments: {
        Row: {
          assigned_at: string | null;
          id: string;
          is_plotted: boolean;
          prompt_again_at: string | null;
          questionnaire_id: string | null;
          stub_id: string | null;
          user_id: string | null;
        };
        Insert: {
          assigned_at?: string | null;
          id?: string;
          is_plotted?: boolean;
          prompt_again_at?: string | null;
          questionnaire_id?: string | null;
          stub_id?: string | null;
          user_id?: string | null;
        };
        Update: {
          assigned_at?: string | null;
          id?: string;
          is_plotted?: boolean;
          prompt_again_at?: string | null;
          questionnaire_id?: string | null;
          stub_id?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "questionnaire_assignments_questionnaire_id_fkey";
            columns: ["questionnaire_id"];
            isOneToOne: false;
            referencedRelation: "questionnaires";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "questionnaire_assignments_stub_id_fkey";
            columns: ["stub_id"];
            isOneToOne: false;
            referencedRelation: "client_stubs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "questionnaire_assignments_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      questionnaires: {
        Row: {
          admin_id: string | null;
          created_at: string;
          description: string | null;
          form_type: string;
          frequency: string | null;
          id: string;
          is_active: boolean | null;
          is_demo: boolean;
          is_rcads: boolean;
          is_system_default: boolean;
          pdf_url: string | null;
          source_default_id: string | null;
          title: string | null;
        };
        Insert: {
          admin_id?: string | null;
          created_at?: string;
          description?: string | null;
          form_type?: string;
          frequency?: string | null;
          id?: string;
          is_active?: boolean | null;
          is_demo?: boolean;
          is_rcads?: boolean;
          is_system_default?: boolean;
          pdf_url?: string | null;
          source_default_id?: string | null;
          title?: string | null;
        };
        Update: {
          admin_id?: string | null;
          created_at?: string;
          description?: string | null;
          form_type?: string;
          frequency?: string | null;
          id?: string;
          is_active?: boolean | null;
          is_demo?: boolean;
          is_rcads?: boolean;
          is_system_default?: boolean;
          pdf_url?: string | null;
          source_default_id?: string | null;
          title?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "questionnaires_source_default_id_fkey";
            columns: ["source_default_id"];
            isOneToOne: false;
            referencedRelation: "questionnaires";
            referencedColumns: ["id"];
          },
        ];
      };
      questions: {
        Row: {
          created_at: string;
          id: string;
          is_required: boolean | null;
          max_label: string | null;
          max_value: number | null;
          min_label: string | null;
          min_value: number | null;
          options: Json | null;
          order_index: number | null;
          questionnaire_id: string | null;
          tag_id: string | null;
          text: string | null;
          type: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_required?: boolean | null;
          max_label?: string | null;
          max_value?: number | null;
          min_label?: string | null;
          min_value?: number | null;
          options?: Json | null;
          order_index?: number | null;
          questionnaire_id?: string | null;
          tag_id?: string | null;
          text?: string | null;
          type?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_required?: boolean | null;
          max_label?: string | null;
          max_value?: number | null;
          min_label?: string | null;
          min_value?: number | null;
          options?: Json | null;
          order_index?: number | null;
          questionnaire_id?: string | null;
          tag_id?: string | null;
          text?: string | null;
          type?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "questions_questionnaire_id_fkey";
            columns: ["questionnaire_id"];
            isOneToOne: false;
            referencedRelation: "questionnaires";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "questions_tag_id_fkey";
            columns: ["tag_id"];
            isOneToOne: false;
            referencedRelation: "tags";
            referencedColumns: ["id"];
          },
        ];
      };
      rcads_assessments: {
        Row: {
          admin_id: string;
          answers: Json;
          client_id: string;
          date_of_birth: string;
          gender: string;
          id: string;
          submitted_at: string;
        };
        Insert: {
          admin_id: string;
          answers: Json;
          client_id: string;
          date_of_birth: string;
          gender: string;
          id?: string;
          submitted_at?: string;
        };
        Update: {
          admin_id?: string;
          answers?: Json;
          client_id?: string;
          date_of_birth?: string;
          gender?: string;
          id?: string;
          submitted_at?: string;
        };
        Relationships: [];
      };
      reschedule_requests: {
        Row: {
          client_id: string;
          created_at: string;
          id: string;
          message: string | null;
          requested_at: string;
          session_id: string;
          status: string;
        };
        Insert: {
          client_id: string;
          created_at?: string;
          id?: string;
          message?: string | null;
          requested_at: string;
          session_id: string;
          status?: string;
        };
        Update: {
          client_id?: string;
          created_at?: string;
          id?: string;
          message?: string | null;
          requested_at?: string;
          session_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reschedule_requests_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      resource_favourites: {
        Row: {
          created_at: string;
          resource_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          resource_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          resource_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "resource_favourites_resource_id_fkey";
            columns: ["resource_id"];
            isOneToOne: false;
            referencedRelation: "resources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "resource_favourites_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      resources: {
        Row: {
          admin_id: string;
          category: string | null;
          content: string | null;
          content_format: string | null;
          created_at: string;
          id: string;
          is_demo: boolean;
          is_published: boolean | null;
          is_sensitive: boolean;
          summary: string | null;
          title: string | null;
          type: string | null;
          updated_at: string | null;
          url: string | null;
          videoUrl: string | null;
        };
        Insert: {
          admin_id?: string;
          category?: string | null;
          content?: string | null;
          content_format?: string | null;
          created_at?: string;
          id?: string;
          is_demo?: boolean;
          is_published?: boolean | null;
          is_sensitive?: boolean;
          summary?: string | null;
          title?: string | null;
          type?: string | null;
          updated_at?: string | null;
          url?: string | null;
          videoUrl?: string | null;
        };
        Update: {
          admin_id?: string;
          category?: string | null;
          content?: string | null;
          content_format?: string | null;
          created_at?: string;
          id?: string;
          is_demo?: boolean;
          is_published?: boolean | null;
          is_sensitive?: boolean;
          summary?: string | null;
          title?: string | null;
          type?: string | null;
          updated_at?: string | null;
          url?: string | null;
          videoUrl?: string | null;
        };
        Relationships: [];
      };
      responses: {
        Row: {
          created_at: string;
          id: string;
          questionnaire_id: string | null;
          scores: Json | null;
          submitted_at: string | null;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          questionnaire_id?: string | null;
          scores?: Json | null;
          submitted_at?: string | null;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          questionnaire_id?: string | null;
          scores?: Json | null;
          submitted_at?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "responses_questionnaire_id_fkey";
            columns: ["questionnaire_id"];
            isOneToOne: false;
            referencedRelation: "questionnaires";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "responses_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      session_events: {
        Row: {
          created_at: string;
          event_type: string;
          id: string;
          metadata: Json | null;
          session_id: string;
        };
        Insert: {
          created_at?: string;
          event_type: string;
          id?: string;
          metadata?: Json | null;
          session_id: string;
        };
        Update: {
          created_at?: string;
          event_type?: string;
          id?: string;
          metadata?: Json | null;
          session_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "session_events_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      session_notes: {
        Row: {
          admin_id: string;
          content: string;
          created_at: string;
          id: string;
          is_encrypted: boolean;
          note_iv: string | null;
          session_id: string | null;
          stub_id: string | null;
          user_id: string | null;
        };
        Insert: {
          admin_id: string;
          content: string;
          created_at?: string;
          id?: string;
          is_encrypted?: boolean;
          note_iv?: string | null;
          session_id?: string | null;
          stub_id?: string | null;
          user_id?: string | null;
        };
        Update: {
          admin_id?: string;
          content?: string;
          created_at?: string;
          id?: string;
          is_encrypted?: boolean;
          note_iv?: string | null;
          session_id?: string | null;
          stub_id?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "session_notes_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "session_notes_stub_id_fkey";
            columns: ["stub_id"];
            isOneToOne: false;
            referencedRelation: "client_stubs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "session_notes_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      session_packages: {
        Row: {
          admin_id: string;
          archived: boolean;
          created_at: string;
          description: string | null;
          duration_minutes: number;
          id: string;
          name: string;
          price_pence: number;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          admin_id: string;
          archived?: boolean;
          created_at?: string;
          description?: string | null;
          duration_minutes?: number;
          id?: string;
          name: string;
          price_pence?: number;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          admin_id?: string;
          archived?: boolean;
          created_at?: string;
          description?: string | null;
          duration_minutes?: number;
          id?: string;
          name?: string;
          price_pence?: number;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "session_packages_admin_id_fkey";
            columns: ["admin_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      sessions: {
        Row: {
          address: string | null;
          admin_reminder_sent_at: string | null;
          attended: boolean | null;
          client_id: string | null;
          created_at: string;
          created_by: string | null;
          duration_minutes: number;
          google_event_id: string | null;
          id: string;
          imported_from_stub_id: string | null;
          is_supervision: boolean;
          location: string | null;
          manual_payment_status: string;
          metadata: Json | null;
          notes: string | null;
          paid: boolean;
          paid_at: string | null;
          price_pence: number;
          reference_code: string | null;
          scheduled_at: string;
          send_reminders: boolean;
          status: Database["public"]["Enums"]["session_status"];
          stripe_payment_intent_id: string | null;
          supervision_cost_pence: number | null;
        };
        Insert: {
          address?: string | null;
          admin_reminder_sent_at?: string | null;
          attended?: boolean | null;
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          duration_minutes?: number;
          google_event_id?: string | null;
          id?: string;
          imported_from_stub_id?: string | null;
          is_supervision?: boolean;
          location?: string | null;
          manual_payment_status?: string;
          metadata?: Json | null;
          notes?: string | null;
          paid?: boolean;
          paid_at?: string | null;
          price_pence?: number;
          reference_code?: string | null;
          scheduled_at: string;
          send_reminders?: boolean;
          status?: Database["public"]["Enums"]["session_status"];
          stripe_payment_intent_id?: string | null;
          supervision_cost_pence?: number | null;
        };
        Update: {
          address?: string | null;
          admin_reminder_sent_at?: string | null;
          attended?: boolean | null;
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          duration_minutes?: number;
          google_event_id?: string | null;
          id?: string;
          imported_from_stub_id?: string | null;
          is_supervision?: boolean;
          location?: string | null;
          manual_payment_status?: string;
          metadata?: Json | null;
          notes?: string | null;
          paid?: boolean;
          paid_at?: string | null;
          price_pence?: number;
          reference_code?: string | null;
          scheduled_at?: string;
          send_reminders?: boolean;
          status?: Database["public"]["Enums"]["session_status"];
          stripe_payment_intent_id?: string | null;
          supervision_cost_pence?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "sessions_imported_from_stub_id_fkey";
            columns: ["imported_from_stub_id"];
            isOneToOne: false;
            referencedRelation: "stub_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      stub_sessions: {
        Row: {
          admin_id: string;
          admin_reminder_sent_at: string | null;
          amount_paid: number | null;
          code: string | null;
          created_at: string;
          currency: string;
          duration_minutes: number | null;
          id: string;
          location: string | null;
          metadata: Json | null;
          notes: string | null;
          paid: boolean;
          price_pence: number | null;
          scheduled_at: string;
          status: string;
          stub_id: string;
        };
        Insert: {
          admin_id: string;
          admin_reminder_sent_at?: string | null;
          amount_paid?: number | null;
          code?: string | null;
          created_at?: string;
          currency?: string;
          duration_minutes?: number | null;
          id?: string;
          location?: string | null;
          metadata?: Json | null;
          notes?: string | null;
          paid?: boolean;
          price_pence?: number | null;
          scheduled_at: string;
          status?: string;
          stub_id: string;
        };
        Update: {
          admin_id?: string;
          admin_reminder_sent_at?: string | null;
          amount_paid?: number | null;
          code?: string | null;
          created_at?: string;
          currency?: string;
          duration_minutes?: number | null;
          id?: string;
          location?: string | null;
          metadata?: Json | null;
          notes?: string | null;
          paid?: boolean;
          price_pence?: number | null;
          scheduled_at?: string;
          status?: string;
          stub_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stub_sessions_stub_id_fkey";
            columns: ["stub_id"];
            isOneToOne: false;
            referencedRelation: "client_stubs";
            referencedColumns: ["id"];
          },
        ];
      };
      supervision_sessions: {
        Row: {
          admin_id: string;
          contract_code: string | null;
          cost_pence: number | null;
          created_at: string;
          currency: string;
          date: string;
          duration_minutes: number | null;
          id: string;
          issues_raised: string | null;
          mode: string | null;
          notes: string | null;
          session_number: number | null;
          supervisor_name: string | null;
          track_as_cpd: boolean;
          venue: string | null;
        };
        Insert: {
          admin_id: string;
          contract_code?: string | null;
          cost_pence?: number | null;
          created_at?: string;
          currency?: string;
          date: string;
          duration_minutes?: number | null;
          id?: string;
          issues_raised?: string | null;
          mode?: string | null;
          notes?: string | null;
          session_number?: number | null;
          supervisor_name?: string | null;
          track_as_cpd?: boolean;
          venue?: string | null;
        };
        Update: {
          admin_id?: string;
          contract_code?: string | null;
          cost_pence?: number | null;
          created_at?: string;
          currency?: string;
          date?: string;
          duration_minutes?: number | null;
          id?: string;
          issues_raised?: string | null;
          mode?: string | null;
          notes?: string | null;
          session_number?: number | null;
          supervisor_name?: string | null;
          track_as_cpd?: boolean;
          venue?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "supervision_sessions_admin_id_fkey";
            columns: ["admin_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      tags: {
        Row: {
          admin_id: string;
          created_at: string;
          id: string;
          is_demo: boolean;
          name: string;
        };
        Insert: {
          admin_id: string;
          created_at?: string;
          id?: string;
          is_demo?: boolean;
          name: string;
        };
        Update: {
          admin_id?: string;
          created_at?: string;
          id?: string;
          is_demo?: boolean;
          name?: string;
        };
        Relationships: [];
      };
      users: {
        Row: {
          admin_codename: string | null;
          admin_id: string | null;
          age: number | null;
          avatar_url: string | null;
          consented_at: string | null;
          created_at: string;
          deleted_at: string | null;
          disabled: boolean | null;
          display_name: string | null;
          dob: string | null;
          email_prefs_disabled: string[];
          first_name: string | null;
          focus_keywords: string[] | null;
          has_consented: boolean;
          id: string;
          is_demo: boolean;
          is_root_admin: boolean;
          is_superadmin: boolean;
          last_name: string | null;
          onboarding_completed: boolean;
          role: string | null;
          stripe_customer_id: string | null;
          unsubscribe_token: string;
        };
        Insert: {
          admin_codename?: string | null;
          admin_id?: string | null;
          age?: number | null;
          avatar_url?: string | null;
          consented_at?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          disabled?: boolean | null;
          display_name?: string | null;
          dob?: string | null;
          email_prefs_disabled?: string[];
          first_name?: string | null;
          focus_keywords?: string[] | null;
          has_consented?: boolean;
          id?: string;
          is_demo?: boolean;
          is_root_admin?: boolean;
          is_superadmin?: boolean;
          last_name?: string | null;
          onboarding_completed?: boolean;
          role?: string | null;
          stripe_customer_id?: string | null;
          unsubscribe_token?: string;
        };
        Update: {
          admin_codename?: string | null;
          admin_id?: string | null;
          age?: number | null;
          avatar_url?: string | null;
          consented_at?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          disabled?: boolean | null;
          display_name?: string | null;
          dob?: string | null;
          email_prefs_disabled?: string[];
          first_name?: string | null;
          focus_keywords?: string[] | null;
          has_consented?: boolean;
          id?: string;
          is_demo?: boolean;
          is_root_admin?: boolean;
          is_superadmin?: boolean;
          last_name?: string | null;
          onboarding_completed?: boolean;
          role?: string | null;
          stripe_customer_id?: string | null;
          unsubscribe_token?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      payment_ledger_rows: {
        Row: {
          admin_codename: string | null;
          amount_pence: number | null;
          client_first_name: string | null;
          client_id: string | null;
          client_last_name: string | null;
          date: string | null;
          description: string | null;
          display_name: string | null;
          id: string | null;
          is_paid: boolean | null;
          source: string | null;
          stub_codename: string | null;
          stub_first_name: string | null;
          stub_id: string | null;
          stub_last_name: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      auto_cancel_unpaid_sessions: { Args: never; Returns: undefined };
      check_demo_access: { Args: { p_for: string }; Returns: boolean };
      check_no_duplicate_submission: {
        Args: { p_questionnaire_id: string; p_user_id: string };
        Returns: boolean;
      };
      consume_platform_access_token: {
        Args: { input_token: string };
        Returns: boolean;
      };
      delete_own_account: { Args: never; Returns: undefined };
      delete_user_by_id: {
        Args: { target_user_id: string };
        Returns: undefined;
      };
      get_availability_for_date: {
        Args: { p_admin_id: string; p_date: string };
        Returns: {
          end_time: string;
          source: string;
          start_time: string;
        }[];
      };
      get_google_calendar_status: {
        Args: never;
        Returns: {
          connected: boolean;
          google_email: string;
          sync_enabled: boolean;
        }[];
      };
      get_my_admin_consent_settings: {
        Args: never;
        Returns: {
          consent_body: string;
          consent_counsellor_cta: string;
          consent_enabled: boolean;
          consent_pdf_url: string;
          consent_title: string;
        }[];
      };
      get_my_is_demo: { Args: never; Returns: boolean };
      get_my_is_paused: { Args: never; Returns: boolean };
      get_my_reschedule_cutoff_hours: { Args: never; Returns: number };
      get_my_role: { Args: never; Returns: string };
      get_practice_busy_slots: {
        Args: { exclude_session_id?: string };
        Returns: {
          slot_end: string;
          slot_start: string;
        }[];
      };
      is_admin: { Args: never; Returns: boolean };
      is_superadmin: { Args: never; Returns: boolean };
      is_within_availability: {
        Args: {
          p_admin_id: string;
          p_duration_minutes?: number;
          p_scheduled_at: string;
        };
        Returns: boolean;
      };
      merge_stub_into_client: {
        Args: { p_admin_id: string; p_real_user_id: string; p_stub_id: string };
        Returns: undefined;
      };
      merge_stub_to_user: {
        Args: { p_stub_id: string; p_user_id: string };
        Returns: undefined;
      };
      questionnaire_admin_id: { Args: { q_id: string }; Returns: string };
      questionnaire_is_demo: { Args: { q_id: string }; Returns: boolean };
      questionnaire_is_system_default: {
        Args: { q_id: string };
        Returns: boolean;
      };
      record_client_view: {
        Args: { p_ref: string; p_type: string };
        Returns: undefined;
      };
      request_manual_payment: {
        Args: { p_session_id: string };
        Returns: undefined;
      };
      reset_form_to_default: {
        Args: { p_questionnaire_id: string };
        Returns: undefined;
      };
      respond_manual_payment: {
        Args: { p_approved: boolean; p_session_id: string };
        Returns: undefined;
      };
      send_admin_session_reminders: { Args: never; Returns: undefined };
      set_google_calendar_sync_enabled: {
        Args: { p_enabled: boolean };
        Returns: undefined;
      };
      set_plotted_assignment: {
        Args: { p_assignment_id: string };
        Returns: undefined;
      };
      validate_platform_access_token: {
        Args: { input_token: string };
        Returns: boolean;
      };
    };
    Enums: {
      cpd_activity_type:
        | "supervision"
        | "training"
        | "reading"
        | "conference"
        | "peer_consultation"
        | "personal_therapy"
        | "other";
      session_status: "scheduled" | "completed" | "cancelled" | "rescheduled";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

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
} as const;
