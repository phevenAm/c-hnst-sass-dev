import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";

// Nightly (pg_cron -> net.http_post from 20260909000400_file_manager.sql).
// Drains public.file_deletion_queue: every row there is a practice-files blob
// whose file_objects row is already gone (folder delete cascade, file delete).
// We remove the blobs and clear the queue rows. Anything that fails to delete
// stays queued for the next run.
//
// Auth: the `x-internal-secret` header must equal INTERNAL_FILE_SWEEP_SECRET.
// The cron job reads the matching value from Vault (internal_file_sweep_secret).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Content-Type": "application/json",
};

const BATCH = 500;
const REMOVE_CHUNK = 100;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const expected = Deno.env.get("INTERNAL_FILE_SWEEP_SECRET");
  if (!expected || req.headers.get("x-internal-secret") !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: queued, error } = await supabase
    .from("file_deletion_queue")
    .select("storage_path")
    .order("queued_at", { ascending: true })
    .limit(BATCH);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }

  const paths = (queued ?? []).map((r) => r.storage_path as string);
  let removed = 0;
  const cleared: string[] = [];

  for (let i = 0; i < paths.length; i += REMOVE_CHUNK) {
    const chunk = paths.slice(i, i + REMOVE_CHUNK);
    const { data, error: rmErr } = await supabase.storage.from("practice-files").remove(chunk);
    if (rmErr) continue; // leave the chunk queued for next run
    removed += data?.length ?? 0;
    cleared.push(...chunk);
  }

  if (cleared.length) {
    await supabase.from("file_deletion_queue").delete().in("storage_path", cleared);
  }

  return new Response(JSON.stringify({ ok: true, queued: paths.length, removed, cleared: cleared.length }), {
    headers: corsHeaders,
  });
});
