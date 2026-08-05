import { createClient } from "jsr:@supabase/supabase-js@2";

const INTERNAL_SECRET = Deno.env.get("INTERNAL_AVATAR_SECRET") ?? "";

Deno.serve(async (req: Request) => {
  if (!INTERNAL_SECRET || req.headers.get("x-internal-secret") !== INTERNAL_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { user_id } = (await req.json()) as { user_id?: string };
  if (!user_id) return new Response("Missing user_id", { status: 400 });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Remove root-level file
  await supabase.storage.from("avatars").remove([`${user_id}.jpg`]);

  // Remove any legacy folder-based uploads
  const { data: folderFiles } = await supabase.storage.from("avatars").list(user_id);
  if (folderFiles && folderFiles.length > 0) {
    const paths = folderFiles.map((f) => `${user_id}/${f.name}`);
    const { error } = await supabase.storage.from("avatars").remove(paths);
    if (error) console.error("Avatar folder cleanup failed:", error.message);
  }

  return new Response("ok", { status: 200 });
});
