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
// Anything slower than this gets logged even though it succeeded, so a spike
// that stops just short of the hard timeout still leaves a trace.
const SLOW_LOG_THRESHOLD_MS = 2_000;
const LOG_LIMIT = 50;
const LOG_STORAGE_KEY = "supabaseRequestLog";

type RequestLogEntry = {
  url: string;
  method: string;
  startedAt: string;
  durationMs: number;
  outcome: "ok" | "slow" | "timeout" | "error";
};

type PendingEntry = { url: string; method: string; startedAt: number };

const pending = new Map<number, PendingEntry>();
let pendingId = 0;

function readLog(): RequestLogEntry[] {
  try {
    return JSON.parse(sessionStorage.getItem(LOG_STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function appendLog(entry: RequestLogEntry) {
  const log = [...readLog(), entry].slice(-LOG_LIMIT);
  try {
    sessionStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(log));
  } catch {
    // sessionStorage full/unavailable — logging is best-effort, never block on it
  }
}

// Requests still in flight right now, with how long each has been waiting —
// unlike readLog() (which only records a request once it settles), this
// shows what's actually hanging *while* it's hanging.
function readPending(): Array<PendingEntry & { elapsedMs: number }> {
  const now = Date.now();
  return Array.from(pending.values()).map((entry) => ({ ...entry, elapsedMs: now - entry.startedAt }));
}

type DebugWindow = {
  __supabaseRequestLog: () => RequestLogEntry[];
  __supabasePendingRequests: () => Array<PendingEntry & { elapsedMs: number }>;
};

// Both visible from the console any time after the fact (or, for pending
// requests, during the hang itself) — you don't need DevTools open or
// recording at the exact moment something goes wrong. The settled log
// survives until the tab closes (sessionStorage), so it's still there even
// if the page had to be reloaded to recover from a stuck spinner.
if (typeof window !== "undefined") {
  (window as unknown as DebugWindow).__supabaseRequestLog = readLog;
  (window as unknown as DebugWindow).__supabasePendingRequests = readPending;
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = requestUrl(input);
  const method = init?.method ?? "GET";
  const startedAt = Date.now();
  const id = ++pendingId;
  pending.set(id, { url, method, startedAt });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  return fetch(input, { ...init, signal: init?.signal ?? controller.signal })
    .then((res) => {
      const durationMs = Date.now() - startedAt;
      if (durationMs >= SLOW_LOG_THRESHOLD_MS) {
        const entry: RequestLogEntry = {
          url,
          method,
          startedAt: new Date(startedAt).toISOString(),
          durationMs,
          outcome: "slow",
        };
        appendLog(entry);
        console.warn(`[supabase] slow request (${durationMs}ms): ${method} ${url}`);
      }
      return res;
    })
    .catch((err) => {
      const durationMs = Date.now() - startedAt;
      const outcome = err?.name === "AbortError" ? "timeout" : "error";
      const entry: RequestLogEntry = { url, method, startedAt: new Date(startedAt).toISOString(), durationMs, outcome };
      appendLog(entry);
      console.error(`[supabase] request ${outcome} after ${durationMs}ms: ${method} ${url}`, err);
      throw err;
    })
    .finally(() => {
      clearTimeout(timeout);
      pending.delete(id);
    });
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  global: { fetch: fetchWithTimeout },
});

// Removes the persisted session so the next auth init starts clean. Used
// when init hangs for reasons that never reach fetchWithTimeout at all —
// e.g. a cross-tab navigator.locks lock that's stuck client-side (the JWT
// contains everything needed to check/refresh it, so getSession() can stall
// inside supabase-js's own internals before ever making a network call,
// which is why this can happen with zero console errors and zero network
// activity). Clearing the token and reloading is exactly the manual fix of
// deleting the sb-<ref>-auth-token localStorage key — this just automates
// it instead of requiring DevTools.
export function clearPersistedAuthSession() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (/^sb-.*-auth-token$/.test(key)) localStorage.removeItem(key);
    }
  } catch {
    // localStorage unavailable (private browsing, etc.) — nothing to clear
  }
}
