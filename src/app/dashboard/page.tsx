import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/session";

type TournamentRow = {
  name: string;
  slug: string;
  status: string;
  format: string;
  max_participants: number;
  updated_at: string;
  participants: { id: string }[] | null;
  matches: { id: string; status: string }[] | null;
};

function formatStatus(status: string) {
  const labels: Record<string, string> = {
    draft: "Borrador",
    ready: "Listo",
    active: "Activo",
    paused: "Pausado",
    completed: "Completado",
    archived: "Archivado",
    cancelled: "Cancelado",
  };

  return labels[status] ?? status;
}

function progressFor(matches: TournamentRow["matches"]) {
  if (!matches?.length) return 0;
  const completed = matches.filter((match) => match.status === "completed");
  return Math.round((completed.length / matches.length) * 100);
}

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");

  const supabase = await createSupabaseServerClient();
  const { data: tournaments } = await supabase
    .from("tournaments")
    .select(
      "name, slug, status, format, max_participants, updated_at, participants(id), matches(id, status)",
    )
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false })
    .returns<TournamentRow[]>();

  const rows = tournaments ?? [];
  const activeCount = rows.filter((row) =>
    ["ready", "active", "paused"].includes(row.status),
  ).length;
  const participantCount = rows.reduce(
    (total, row) => total + (row.participants?.length ?? 0),
    0,
  );

  return (
    <>
      <SiteHeader />
      <main className="page container">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Panel del organizador</p>
            <h1>Tus torneos</h1>
            <p>Continúa donde lo dejaste o prepara una nueva competición.</p>
          </div>
          <Link className="button large" href="/tournaments/new">
            + Nuevo torneo
          </Link>
        </div>
        <div className="stats">
          <article>
            <b>{rows.length}</b>
            <span>Torneos</span>
          </article>
          <article>
            <b>{activeCount}</b>
            <span>En curso</span>
          </article>
          <article>
            <b>{participantCount}</b>
            <span>Participantes</span>
          </article>
        </div>
        {rows.length ? (
          <section className="card-grid">
            {rows.map((tournament) => {
              const progress = progressFor(tournament.matches);

              return (
                <article className="tournament-card" key={tournament.slug}>
                  <div>
                    <span className="pill">
                      {formatStatus(tournament.status)}
                    </span>
                    <span>
                      {tournament.participants?.length ?? 0} /{" "}
                      {tournament.max_participants} participantes
                    </span>
                  </div>
                  <h2>{tournament.name}</h2>
                  <p>Eliminación simple</p>
                  <div className="progress">
                    <span style={{ width: `${progress}%` }} />
                  </div>
                  <footer>
                    <small>{progress}% completado</small>
                    <Link href={`/tournaments/${tournament.slug}`}>
                      Abrir →
                    </Link>
                  </footer>
                </article>
              );
            })}
          </section>
        ) : (
          <section className="empty-state">
            <p className="eyebrow">Primer torneo</p>
            <h2>Aún no hay drafts guardados.</h2>
            <p>
              Crea el primero desde el asistente y aparecerá aquí con sus
              participantes, rondas y partidos.
            </p>
            <Link className="button large" href="/tournaments/new">
              Crear torneo
            </Link>
          </section>
        )}
      </main>
    </>
  );
}
