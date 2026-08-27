import { redirect } from "next/navigation";
import { AuthForm } from "@/app/auth/auth-form";
import { SiteHeader } from "@/components/site-header";
import { getCurrentUser } from "@/lib/supabase/session";

export default async function AuthPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <>
      <SiteHeader />
      <main className="auth-page container">
        <section className="auth-heading">
          <p className="eyebrow">Cuenta BracketForge</p>
          <h1>Entra para guardar torneos reales.</h1>
          <p>
            Conecta tu sesión de Supabase y el asistente podrá crear drafts,
            participantes, rondas y partidos en la base de datos.
          </p>
        </section>
        <AuthForm />
      </main>
    </>
  );
}
