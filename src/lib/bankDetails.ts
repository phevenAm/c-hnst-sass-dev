import { supabase } from "@/lib/supabase";

// Bank-transfer payment details live in practice_settings.bank_* but are
// encrypted at rest (migration 20260907000050_practice_bank_details_encryption).
// Reads and writes must go through the two SECURITY DEFINER RPCs, which
// decrypt / encrypt inside Postgres:
//   • get_practice_bank_details(p_admin_id) — allowed for the owning admin
//     and for that admin's own clients (PaymentModal "how to pay").
//   • set_practice_bank_details(...)        — owning admin only.
// Never select or update the bank_* columns directly — a raw read returns
// ciphertext, a raw write stores plaintext.

export type BankDetails = {
  bank_name: string;
  bank_account_name: string;
  bank_sort_code: string;
  bank_account_number: string;
  bank_payment_reference: string;
};

export const EMPTY_BANK_DETAILS: BankDetails = {
  bank_name: "",
  bank_account_name: "",
  bank_sort_code: "",
  bank_account_number: "",
  bank_payment_reference: "",
};

// get_/set_practice_bank_details only land in database.types.ts after
// `npm run update-types` runs against the deployed migration, so the typed
// rpc() overloads don't know them yet — call through this narrowed shim.
type RpcResult = { data: unknown; error: { message: string } | null };
type UntypedRpc = (fn: string, args: Record<string, unknown>) => Promise<RpcResult>;

function rpc(): UntypedRpc | null {
  const client = supabase as unknown as { rpc?: unknown };
  return typeof client.rpc === "function" ? (client.rpc as UntypedRpc).bind(supabase) : null;
}

function str(row: Record<string, unknown> | undefined, key: string): string {
  const v = row?.[key];
  return typeof v === "string" ? v : "";
}

export async function fetchBankDetails(adminId: string): Promise<BankDetails> {
  const call = rpc();
  if (!adminId || !call) return { ...EMPTY_BANK_DETAILS };
  const { data, error } = await call("get_practice_bank_details", { p_admin_id: adminId });
  if (error || !data) return { ...EMPTY_BANK_DETAILS };
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  return {
    bank_name: str(row, "bank_name"),
    bank_account_name: str(row, "bank_account_name"),
    bank_sort_code: str(row, "bank_sort_code"),
    bank_account_number: str(row, "bank_account_number"),
    bank_payment_reference: str(row, "bank_payment_reference"),
  };
}

export async function saveBankDetails(d: BankDetails): Promise<{ error: string | null }> {
  const call = rpc();
  if (!call) return { error: "Bank details are unavailable." };
  const { error } = await call("set_practice_bank_details", {
    p_bank_name: d.bank_name,
    p_bank_account_name: d.bank_account_name,
    p_bank_sort_code: d.bank_sort_code,
    p_bank_account_number: d.bank_account_number,
    p_bank_payment_reference: d.bank_payment_reference,
  });
  return { error: error?.message ?? null };
}
