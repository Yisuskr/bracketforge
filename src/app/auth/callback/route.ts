import { type NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/dashboard";

  if (code) {
    try {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (!error) {
        return NextResponse.redirect(new URL(next, requestUrl.origin));
      }
    } catch {
      // Fall through to the auth page with a recoverable message.
    }
  }

  return NextResponse.redirect(
    new URL(
      "/auth?message=No%20se%20pudo%20confirmar%20la%20sesion",
      requestUrl.origin,
    ),
  );
}
