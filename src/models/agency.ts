// Shared types for the agency ("manage mode") feature. Mirrors the tables in
// supabase/migrations/20260902000000-5_*.sql.

export type AgencyMemberRole = "manager" | "counsellor";
export type AgencyEmploymentType = "employee" | "freelance";
export type AgencyMemberStatus = "active" | "disabled";
export type AssignmentStatus = "pending" | "accepted" | "declined";
export type OnboardingAudience = "client" | "admin";

export interface Agency {
  id: string;
  name: string;
  owner_id: string;
  locked_consent: boolean;
  consent_text: string | null;
  consent_pdf_url: string | null;
  shared_resources: boolean;
  require_note_encryption: boolean;
  locked_email_templates: boolean;
  created_at: string;
  updated_at: string;
}

export interface AgencyMember {
  id: string;
  agency_id: string;
  user_id: string;
  role: AgencyMemberRole;
  employment_type: AgencyEmploymentType;
  counselling_enabled: boolean;
  status: AgencyMemberStatus;
  invited_at: string | null;
  joined_at: string;
}

// agency_members joined to the member's users row — what the Members table renders.
export interface AgencyMemberWithUser extends AgencyMember {
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

// The current user's own membership, or null when they're not in an agency.
export interface MyAgencyMembership {
  membership: AgencyMember | null;
  agency: Agency | null;
}

export interface ClientAssignment {
  id: string;
  stub_id: string;
  agency_id: string;
  from_manager_id: string;
  to_admin_id: string;
  status: AssignmentStatus;
  rate_pence: number | null;
  availability_note: string | null;
  intake_note: string | null;
  decline_reason: string | null;
  created_at: string;
  responded_at: string | null;
}

// An intake stub in the agency pool, plus its live assignment (if any).
export interface AgencyClient {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  codename: string | null;
  agency_id: string | null;
  default_rate_pence: number | null;
  availability_note: string | null;
  created_by: string;
  created_at: string;
  linked_user_id: string | null;
  assignment: ClientAssignment | null;
}

export interface AgencyExpense {
  id: string;
  agency_id: string;
  incurred_on: string;
  category: string | null;
  amount_pence: number;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export interface AgencyOnboardingItem {
  id: string;
  agency_id: string;
  audience: OnboardingAudience;
  title: string;
  body: string | null;
  url: string | null;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgencyFinanceSummary {
  from: string;
  to: string;
  income_pence: number;
  outgoings_pence: number;
  net_pence: number;
}
