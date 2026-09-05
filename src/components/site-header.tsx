import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { siteConfig } from "@/config/site";
import { getCurrentUser } from "@/lib/supabase/session";

export async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="border-b border-[var(--line)] bg-[color:var(--surface)/.8] backdrop-blur">
      <div className="container flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <span className="grid size-8 place-items-center rounded-lg bg-[var(--brand)] text-white">
            B
          </span>
          {siteConfig.name}
        </Link>
        <nav className="flex items-center gap-2" aria-label="Principal">
          <Link className="button ghost" href="/arena">
            Arena
          </Link>
          {user ? (
            <>
              <Link className="button ghost" href="/dashboard">
                Mi panel
              </Link>
              <form action={signOut} className="inline-form">
                <button className="button" type="submit">
                  Salir
                </button>
              </form>
            </>
          ) : (
            <Link className="button" href="/auth">
              Entrar
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
