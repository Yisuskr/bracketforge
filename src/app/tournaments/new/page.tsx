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
        <h1>Prepara el terreno de juego</h1>
        <p className="lede small">
          Completa los datos básicos. Podrás revisar todo antes de generar el
          bracket.
        </p>
        <TournamentWizard />
      </main>
    </>
  );
}
