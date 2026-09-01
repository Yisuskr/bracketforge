import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { getCurrentUser } from "@/lib/supabase/session";
import { UpdatePasswordForm } from "./update-password-form";

export const dynamic = "force-dynamic";

export default async function UpdatePasswordPage() {
  const user = await getCurrentUser();

  return (
    <>
      <SiteHeader />
      <main className="auth-page container">
        <section className="auth-heading">
          <p className="eyebrow">Recuperar acceso</p>
          <h1>Cambia tu contraseña.</h1>
          <p>
            Usa esta pantalla después de abrir el enlace de recuperación de
            Supabase. La sesión temporal permite guardar una contraseña nueva.
          </p>
        </section>
        {user ? (
          <UpdatePasswordForm />
        ) : (
          <section className="auth-panel">
            <div>
              <p className="eyebrow">Enlace requerido</p>
              <h2>No hay sesión de recuperación</h2>
            </div>
            <p className="form-note">
              Vuelve a pedir el enlace desde la pantalla de acceso y abre el
              email en este navegador.
            </p>
            <Link className="button large" href="/auth">
              Volver a acceso
            </Link>
          </section>
        )}
      </main>
    </>
  );
}
