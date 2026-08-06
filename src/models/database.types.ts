export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4";
  };
  public: {
    Tables: {
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
      platform_access_token: {
        Row: {
          created_at: string;
          expires_at: string | null;
          id: number;
          is_used: boolean | null;
          token: string | null;
          used_at: string | null;
        };
        Insert: {
          created_at?: string;
          expires_at?: string | null;
          id?: number;
          is_used?: boolean | null;
          token?: string | null;
          used_at?: string | null;
        };
        Update: {
          created_at?: string;
          expires_at?: string | null;
          id?: number;
          is_used?: boolean | null;
          token?: string | null;
          used_at?: string | null;
        };
        Relationships: [];
      };
      practice_settings: {
        Row: {
          address: string | null;
          admin_id: string;
          business_name: string | null;
          counsellor_name: string | null;
          email: string | null;
          id: string;
          logo_url: string | null;
          phone: string | null;
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          admin_id: string;
          business_name?: string | null;
          counsellor_name?: string | null;
          email?: string | null;
          id?: string;
          logo_url?: string | null;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          admin_id?: string;
          business_name?: string | null;
          counsellor_name?: string | null;
          email?: string | null;
          id?: string;
          logo_url?: string | null;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      questionnaire_assignments: {
        Row: {
          assigned_at: string | null;
          id: string;
          questionnaire_id: string | null;
          user_id: string | null;
        };
        Insert: {
          assigned_at?: string | null;
          id?: string;
          questionnaire_id?: string | null;
          user_id?: string | null;
        };
        Update: {
          assigned_at?: string | null;
          id?: string;
          questionnaire_id?: string | null;
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
          created_at: string;
          description: string | null;
          frequency: string | null;
          id: string;
          is_active: boolean | null;
          is_demo: boolean;
          title: string | null;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          frequency?: string | null;
          id?: string;
          is_active?: boolean | null;
          is_demo?: boolean;
          title?: string | null;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          frequency?: string | null;
          id?: string;
          is_active?: boolean | null;
          is_demo?: boolean;
          title?: string | null;
        };
        Relationships: [];
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
      resources: {
        Row: {
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
          user_id: string | null;
        };
        Insert: {
          admin_id: string;
          content: string;
          created_at?: string;
          id?: string;
          user_id?: string | null;
        };
        Update: {
          admin_id?: string;
          content?: string;
          created_at?: string;
          id?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "session_notes_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      sessions: {
        Row: {
          address: string | null;
          attended: boolean | null;
          client_id: string | null;
          created_at: string;
          created_by: string | null;
          duration_minutes: number;
          id: string;
          location: string | null;
          metadata: Json | null;
          notes: string | null;
          paid: boolean;
          price_pence: number;
          reference_code: string | null;
          scheduled_at: string;
          status: Database["public"]["Enums"]["session_status"];
          stripe_payment_intent_id: string | null;
        };
        Insert: {
          address?: string | null;
          attended?: boolean | null;
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          duration_minutes?: number;
          id?: string;
          location?: string | null;
          metadata?: Json | null;
          notes?: string | null;
          paid?: boolean;
          price_pence?: number;
          reference_code?: string | null;
          scheduled_at: string;
          status?: Database["public"]["Enums"]["session_status"];
          stripe_payment_intent_id?: string | null;
        };
        Update: {
          address?: string | null;
          attended?: boolean | null;
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          duration_minutes?: number;
          id?: string;
          location?: string | null;
          metadata?: Json | null;
          notes?: string | null;
          paid?: boolean;
          price_pence?: number;
          reference_code?: string | null;
          scheduled_at?: string;
          status?: Database["public"]["Enums"]["session_status"];
          stripe_payment_intent_id?: string | null;
        };
        Relationships: [];
      };
      tags: {
        Row: {
          created_at: string;
          id: string;
          is_demo: boolean;
          name: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_demo?: boolean;
          name: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_demo?: boolean;
          name?: string;
        };
        Relationships: [];
      };
      users: {
        Row: {
          age: number | null;
          avatar_url: string | null;
          created_at: string;
          deleted_at: string | null;
          disabled: boolean | null;
          display_name: string | null;
          dob: string | null;
          first_name: string | null;
          focus_keywords: string[] | null;
          id: string;
          is_demo: boolean;
          last_name: string | null;
          onboarding_completed: boolean;
          role: string | null;
          stripe_customer_id: string | null;
        };
        Insert: {
          age?: number | null;
          avatar_url?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          disabled?: boolean | null;
          display_name?: string | null;
          dob?: string | null;
          first_name?: string | null;
          focus_keywords?: string[] | null;
          id?: string;
          is_demo?: boolean;
          last_name?: string | null;
          onboarding_completed?: boolean;
          role?: string | null;
          stripe_customer_id?: string | null;
        };
        Update: {
          age?: number | null;
          avatar_url?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          disabled?: boolean | null;
          display_name?: string | null;
          dob?: string | null;
          first_name?: string | null;
          focus_keywords?: string[] | null;
          id?: string;
          is_demo?: boolean;
          last_name?: string | null;
          onboarding_completed?: boolean;
          role?: string | null;
          stripe_customer_id?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
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
      get_my_is_demo: { Args: never; Returns: boolean };
      get_my_role: { Args: never; Returns: string };
    };
    Enums: {
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
      session_status: ["scheduled", "completed", "cancelled", "rescheduled"],
    },
  },
} as const;
