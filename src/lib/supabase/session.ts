import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getCurrentUser() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) return null;
    return user;
  } catch {
    return null;
  }
}
