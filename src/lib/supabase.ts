import { createClient } from "@supabase/supabase-js";

import type { Database } from "@models/database.types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// The browser's fetch() has no default timeout — if a query or edge function
// call hangs server-side (stuck connection, exhausted pool, dead egress),
// the request just sits forever with no error and no rejection. Every page
// built on the idle -> loading -> succeeded/failed status pattern already
// handles "failed" correctly (see isPageStatusLoading), but nothing ever
// reaches "failed" if the promise never settles. Bounding every request to
// this client fixes that: a hang now surfaces as a real error within 20s
// instead of an indefinite spinner.
const REQUEST_TIMEOUT_MS = 20_000;

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  return fetch(input, { ...init, signal: init?.signal ?? controller.signal }).finally(() => clearTimeout(timeout));
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  global: { fetch: fetchWithTimeout },
});
