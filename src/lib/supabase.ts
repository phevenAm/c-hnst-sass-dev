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

// Intermittent request timing, visible from the console any time after the
// fact via window.__supabaseRequestLog() — you don't need DevTools open (or
// recording) at the exact moment something hangs. Survives until the tab
// closes (sessionStorage), so it's still there even if the page had to be
// reloaded to recover from a stuck spinner.
if (typeof window !== "undefined") {
  (window as unknown as { __supabaseRequestLog: () => RequestLogEntry[] }).__supabaseRequestLog = readLog;
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
    .finally(() => clearTimeout(timeout));
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  global: { fetch: fetchWithTimeout },
});
