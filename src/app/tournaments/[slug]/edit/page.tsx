import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EditTournamentForm } from "./edit-tournament-form";
import { SiteHeader } from "@/components/site-header";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/session";

type TournamentEditRow = {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  category: string | null;
  status: string;
  visibility: string;
  scheduled_at: string | null;
  best_of: number;
  participants: { display_name: string; seed: number }[] | null;
};

function toDatetimeLocal(value: string | null) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

export const dynamic = "force-dynamic";

export default async function EditTournamentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/auth");

  const supabase = await createSupabaseServerClient();
  const { data: tournament } = await supabase
    .from("tournaments")
    .select(
      "id, owner_id, name, slug, category, status, visibility, scheduled_at, best_of, participants(display_name, seed)",
    )
    .eq("slug", slug)
    .single<TournamentEditRow>();

  if (!tournament || tournament.owner_id !== user.id) notFound();

  const participants = [...(tournament.participants ?? [])]
    .sort((a, b) => a.seed - b.seed)
    .map((participant) => participant.display_name)
    .join("\n");

  return (
    <>
      <SiteHeader />
      <main className="page narrow container">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Editar draft</p>
            <h1>Ajusta el torneo antes de empezar.</h1>
            <p>
              Cambia datos, visibilidad, formato y seeds mientras el torneo siga
              en borrador.
            </p>
          </div>
          <Link className="button ghost large" href={`/tournaments/${slug}`}>
            Ver torneo
          </Link>
        </div>

        {tournament.status === "draft" ? (
          <EditTournamentForm
            initialValues={{
              bestOf: tournament.best_of,
              category: tournament.category ?? "",
              name: tournament.name,
              participants,
              scheduledAt: toDatetimeLocal(tournament.scheduled_at),
              slug: tournament.slug,
              visibility: tournament.visibility,
            }}
          />
        ) : (
          <section className="empty-state">
            <p className="eyebrow">Edición bloqueada</p>
            <h2>Este torneo ya salió del borrador.</h2>
            <p>
              Para proteger el bracket y los resultados, la edición profunda
              solo está disponible antes de marcarlo como listo o iniciarlo.
            </p>
            <Link className="button large" href={`/tournaments/${slug}`}>
              Volver al torneo
            </Link>
          </section>
        )}
      </main>
    </>
  );
}
