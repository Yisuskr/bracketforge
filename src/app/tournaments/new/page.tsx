import { redirect } from "next/navigation";
import { TournamentWizard } from "./wizard";
import { SiteHeader } from "@/components/site-header";
import { getCurrentUser } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";

export default async function NewTournament() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");

  return (
    <>
      <SiteHeader />
      <main className="page narrow container">
        <p className="eyebrow">Nuevo torneo</p>
        <h1>Crea un draft jugable</h1>
        <p className="lede small">
          Define participantes, formato y visibilidad. Después podrás revisar
          seeds, editar el draft e iniciar el bracket desde tu panel.
        </p>
        <TournamentWizard />
      </main>
    </>
  );
}
