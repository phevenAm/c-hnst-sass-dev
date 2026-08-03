import { createClient } from "jsr:@supabase/supabase-js@2";

const INTERNAL_SECRET = Deno.env.get("INTERNAL_AVATAR_SECRET") ?? "";

Deno.serve(async (req: Request) => {
  if (!INTERNAL_SECRET || req.headers.get("x-internal-secret") !== INTERNAL_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { user_id } = (await req.json()) as { user_id?: string };
  if (!user_id) return new Response("Missing user_id", { status: 400 });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { error } = await supabase.storage.from("avatars").remove([`${user_id}.jpg`]);
  if (error) console.error("Avatar cleanup failed:", error.message);

  return new Response("ok", { status: 200 });
});
