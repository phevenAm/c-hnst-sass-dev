import type { Database, Tables } from "./database.types";

export type Role = "admin" | "client";

export type AuthUser = {
  id: string;
  email: string | null;
  created_at: string;
  updated_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at?: string | null;
  user_metadata?: {
    first_name?: string;
    last_name?: string;
    dob?: string;
    // biome-ignore lint/suspicious/noExplicitAny: Supabase user_metadata is an open-ended JSON object
    [key: string]: any;
  };
  app_metadata?: {
    provider?: string;
    providers?: string[];
    // biome-ignore lint/suspicious/noExplicitAny: Supabase app_metadata is an open-ended JSON object
    [key: string]: any;
  };
  // biome-ignore lint/suspicious/noExplicitAny: Supabase identities shape varies by provider
  identities?: any[];
  // biome-ignore lint/suspicious/noExplicitAny: catch-all for Supabase auth fields not in our schema
  [key: string]: any;
};

// ─── Enums ─────────────────────────────────────────────────

export enum QuestionnaireFrequency {
  DAILY = "daily",
  WEEKLY = "weekly",
  FORTNIGHTLY = "fortnightly",
}

export enum UserRole {
  ADMIN = "admin",
  CLIENT = "client",
}

export enum QuestionType {
  SCALE = "scale",
  TEXT = "text",
  MULTIPLE_CHOICE = "multiple_choice",
}

export enum FormType {
  OUTCOME_MEASURE = "outcome_measure",
  FEEDBACK = "feedback",
  ONBOARDING = "onboarding",
}

export enum ResourceType {
  ARTICLE = "article",
  VIDEO = "video",
  AUDIO = "audio",
  DOCUMENT = "document",
  LINK = "link",
}

export enum ContentFormat {
  MARKDOWN = "markdown",
  HTML = "html",
  PLAIN = "plain",
}

// ─── App types derived from DB schema ──────────────────────
// Each type uses Omit<Tables<'table'>, fields> & { stricterFields }
// Fields in the Omit list are re-added with stricter (non-null) types.
// Fields NOT in the Omit list are inherited from the DB type and
// automatically updated when the schema changes.

// Hand-typed until `npm run "update types"` is run after the tags migration.
// After: replace with Omit<Tables<"tags">, never> or just Tables<"tags">.
export type Tag = Tables<"tags">;

export type UserProfile = Omit<Tables<"users">, "age" | "first_name" | "role" | "disabled"> & {
  email: string;
  first_name: string;
  role: UserRole | string;
  disabled: boolean;
  admin_codename?: string | null;
};

export type Questionnaire = Omit<Tables<"questionnaires">, "title" | "description" | "frequency" | "is_active"> & {
  title: string;
  description?: string;
  frequency: QuestionnaireFrequency | null;
  is_active: boolean;
  form_type: FormType | string;
  is_system_default: boolean;
  source_default_id: string | null;
  // joined — not in DB row
  questions: Question[];
  assignedTo: string[];
};

export type Question = Omit<
  Tables<"questions">,
  "questionnaire_id" | "text" | "type" | "order_index" | "is_required"
> & {
  questionnaire_id: string;
  text: string;
  type: QuestionType | "scale" | "text" | "multiple_choice";
  order_index: number;
  is_required: boolean;
  options: { label: string; value: number }[] | null;
  tag_id: string | null;
  tag?: Pick<Tag, "id" | "name">;
};

export type QuestionnaireAssignment = Omit<
  Tables<"questionnaire_assignments">,
  "questionnaire_id" | "user_id" | "assigned_at"
> & {
  questionnaire_id: string;
  user_id: string;
  assigned_at: string;
  is_plotted: boolean;
  // join extensions
  questionnaires?: Pick<Questionnaire, "id" | "title" | "frequency" | "is_active" | "form_type">;
  users?: Pick<UserProfile, "id" | "first_name" | "last_name">;
};

export type Response = Omit<Tables<"responses">, "questionnaire_id" | "user_id" | "scores" | "submitted_at"> & {
  questionnaire_id: string;
  user_id: string;
  scores: Record<string, unknown>;
  submitted_at: string;
};

export type Resource = Omit<Tables<"resources">, "title" | "category" | "type" | "is_published" | "updated_at"> & {
  title: string;
  category: string;
  type: ResourceType | string;
  is_published: boolean;
  updated_at: string;
};

// ─── Utility types ─────────────────────────────────────────

export type ResponseScores = Record<string, number | string>;

export type UpdateQuestionnaire = Partial<Omit<Questionnaire, "id" | "created_at" | "questions" | "assignedTo">> & {
  id: string;
};
export type UpdateUser = Partial<Omit<UserProfile, "id" | "created_at">> & {
  id: string;
};
export type UpdateResource = Partial<Omit<Resource, "id" | "created_at">> & {
  id: string;
};

export interface ProgressChartProps {
  responses: Response[];
  questions: Question[];
  title?: string;
}

export type AuditLog = {
  id: string;
  created_at: string;
  actor_id: string | null;
  action: "INSERT" | "UPDATE" | "DELETE";
  table_name: string;
  record_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  actor?: Pick<UserProfile, "first_name" | "last_name"> | null;
};

export type SessionStatus = Database["public"]["Enums"]["session_status"];

// Shape of the metadata stored on sessions created as part of a block.
// Casting is required when reading session.metadata since the DB type is Json.
export type SessionBlockMeta = {
  block_id: string;
  block_pos: number;
  block_total: number;
  block_start: string;
};

export type Session = Tables<"sessions">;

export type RescheduleRequest = {
  id: string;
  session_id: string;
  client_id: string;
  requested_at: string;
  message: string | null;
  status: "pending" | "accepted" | "rejected";
  created_at: string;
};

export type SessionEvent = {
  id: string;
  session_id: string;
  event_type: "scheduled" | "rescheduled" | "cancelled" | "paid" | "unpaid" | "attended" | "no_show";
  metadata: { from?: string; to?: string } | null;
  created_at: string;
};

// Recurring weekly availability template. day_of_week matches JS Date.getDay()
// (0 = Sunday … 6 = Saturday). start_time / end_time are Postgres `time`
// values, i.e. "HH:MM:SS" strings. Hand-typed until `npm run update-types`.
export type AvailabilityRule = {
  id: string;
  admin_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  label: string | null;
  created_at: string;
};

// One-off exception to the recurring template, tied to a specific date.
//   is_blocked === true  → availability removed (holiday). Null times = whole day.
//   is_blocked === false → an extra one-off window (start/end always present).
export type AvailabilityOverride = {
  id: string;
  admin_id: string;
  override_date: string;
  start_time: string | null;
  end_time: string | null;
  is_blocked: boolean;
  label: string | null;
  created_at: string;
};

// Admin-only private calendar event (supervision, admin time, personal
// appointments). Renders on the admin's own scheduler only — the table has no
// client-facing RLS policy, so clients can never read these rows. starts_at /
// ends_at are timestamptz ISO strings. Hand-typed until `npm run update-types`.
export type AdminPrivateEvent = {
  id: string;
  admin_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  notes: string | null;
  is_supervision: boolean;
  is_cpd: boolean;
  created_at: string;
};

export type Todo = Tables<"admin_todos">;

export type ClientStub = {
  id: string;
  created_by: string;
  linked_user_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  codename: string | null;
  created_at: string;
};

export type StubSession = {
  id: string;
  stub_id: string;
  admin_id: string;
  scheduled_at: string;
  duration_minutes: number | null;
  status: "scheduled" | "attended" | "no_show" | "cancelled";
  amount_paid: number | null;
  currency: string;
  notes: string | null;
  code: string | null;
  created_at: string;
};
