import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/session";
import { updateTournamentStatus } from "@/app/tournaments/[slug]/actions";

type LifecycleIntent = "mark-ready" | "start" | "pause" | "resume" | "draft";
type DashboardFilter = "all" | "draft" | "live" | "completed" | "shared";

type TournamentRow = {
  name: string;
  slug: string;
  category: string | null;
  status: string;
  visibility: string;
  format: string;
  max_participants: number;
  best_of: number;
  scheduled_at: string | null;
  updated_at: string;
  participants: { id: string }[] | null;
  matches:
    | {
        id: string;
        status: string;
        participant_one_id: string | null;
        participant_two_id: string | null;
        winner_id: string | null;
      }[]
    | null;
};

const dashboardFilters: { key: DashboardFilter; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "draft", label: "Drafts" },
  { key: "live", label: "En marcha" },
  { key: "completed", label: "Finalizados" },
  { key: "shared", label: "Compartidos" },
];

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

function formatVisibility(visibility: string) {
  const labels: Record<string, string> = {
    public: "Publico",
    unlisted: "Con enlace",
    private: "Privado",
  };

  return labels[visibility] ?? visibility;
}

function progressFor(matches: TournamentRow["matches"]) {
  if (!matches?.length) return 0;
  const completed = matches.filter((match) => match.status === "completed");
  return Math.round((completed.length / matches.length) * 100);
}

function normalizeFilter(
  value: string | string[] | undefined,
): DashboardFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  return dashboardFilters.some((filter) => filter.key === raw)
    ? (raw as DashboardFilter)
    : "all";
}

function matchesFilter(tournament: TournamentRow, filter: DashboardFilter) {
  if (filter === "all") return true;
  if (filter === "draft") return tournament.status === "draft";
  if (filter === "live") {
    return ["ready", "active", "paused"].includes(tournament.status);
  }
  if (filter === "completed") return tournament.status === "completed";
  return tournament.visibility !== "private";
}

function countForFilter(rows: TournamentRow[], filter: DashboardFilter) {
  return rows.filter((row) => matchesFilter(row, filter)).length;
}

function readyMatchCount(matches: TournamentRow["matches"]) {
  return (
    matches?.filter(
      (match) =>
        match.status !== "completed" &&
        match.participant_one_id &&
        match.participant_two_id &&
        !match.winner_id,
    ).length ?? 0
  );
}

function completedMatchCount(matches: TournamentRow["matches"]) {
  return matches?.filter((match) => match.status === "completed").length ?? 0;
}

function formatDate(value: string | null) {
  if (!value) return "Sin fecha";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";

  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  }).format(date);
}

function statusNote(tournament: TournamentRow) {
  const ready = readyMatchCount(tournament.matches);
  const completed = completedMatchCount(tournament.matches);
  const total = tournament.matches?.length ?? 0;

  if (tournament.status === "draft") return "Revisar participantes y reglas";
  if (tournament.status === "ready") return `${ready} partidos listos`;
  if (tournament.status === "active") return `${completed}/${total} cerrados`;
  if (tournament.status === "paused") return "Resultados pausados";
  if (tournament.status === "completed") return "Resultados finales";
  return formatStatus(tournament.status);
}

function primaryAction(tournament: TournamentRow):
  | {
      href: string;
      label: string;
      type: "link";
    }
  | {
      intent: LifecycleIntent;
      label: string;
      type: "form";
    } {
  if (tournament.status === "draft") {
    return {
      href: `/tournaments/${tournament.slug}/edit`,
      label: "Editar draft",
      type: "link",
    };
  }

  if (tournament.status === "ready") {
    return { intent: "start", label: "Iniciar", type: "form" };
  }

  if (tournament.status === "paused") {
    return { intent: "resume", label: "Reanudar", type: "form" };
  }

  return {
    href: `/tournaments/${tournament.slug}`,
    label: tournament.status === "completed" ? "Ver resultados" : "Abrir",
    type: "link",
  };
}

function DashboardStatusForm({
  children,
  intent,
  slug,
}: {
  children: ReactNode;
  intent: LifecycleIntent;
  slug: string;
}) {
  return (
    <form action={updateTournamentStatus} className="inline-form">
      <input name="slug" type="hidden" value={slug} />
      <button className="button small" name="intent" value={intent}>
        {children}
      </button>
    </form>
  );
}

export const dynamic = "force-dynamic";

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] | undefined }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");

  const activeFilter = normalizeFilter((await searchParams).status);
  const supabase = await createSupabaseServerClient();
  const { data: tournaments } = await supabase
    .from("tournaments")
    .select(
      "name, slug, category, status, visibility, format, max_participants, best_of, scheduled_at, updated_at, participants(id), matches(id, status, participant_one_id, participant_two_id, winner_id)",
    )
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false })
    .returns<TournamentRow[]>();

  const rows = tournaments ?? [];
  const filteredRows = rows.filter((row) => matchesFilter(row, activeFilter));
  const activeCount = countForFilter(rows, "live");
  const sharedCount = countForFilter(rows, "shared");
  const participantCount = rows.reduce(
    (total, row) => total + (row.participants?.length ?? 0),
    0,
  );
  const nextTournament =
    rows.find((row) => ["active", "ready", "paused"].includes(row.status)) ??
    rows[0] ??
    null;

  return (
    <>
      <SiteHeader />
      <main className="page dashboard-page container">
        <div className="page-heading dashboard-heading">
          <div>
            <p className="eyebrow">Panel del organizador</p>
            <h1>Tus torneos</h1>
            <p>Controla drafts, directos, enlaces y resultados desde aquí.</p>
          </div>
          <Link className="button large" href="/tournaments/new">
            Nuevo torneo
          </Link>
        </div>

        <section className="dashboard-command">
          <div>
            <span>Ahora</span>
            <strong>{nextTournament?.name ?? "Sin torneos activos"}</strong>
            <p>
              {nextTournament
                ? statusNote(nextTournament)
                : "Crea el primer bracket para activar el panel."}
            </p>
          </div>
          {nextTournament ? (
            <Link
              className="button ghost"
              href={`/tournaments/${nextTournament.slug}`}
            >
              Abrir torneo
            </Link>
          ) : (
            <Link className="button ghost" href="/tournaments/new">
              Crear draft
            </Link>
          )}
        </section>

        <div className="stats dashboard-stats">
          <article>
            <b>{rows.length}</b>
            <span>Torneos</span>
          </article>
          <article>
            <b>{activeCount}</b>
            <span>En marcha</span>
          </article>
          <article>
            <b>{sharedCount}</b>
            <span>Con acceso público</span>
          </article>
          <article>
            <b>{participantCount}</b>
            <span>Participantes</span>
          </article>
        </div>

        <nav className="dashboard-tabs" aria-label="Filtrar torneos">
          {dashboardFilters.map((filter) => (
            <Link
              aria-current={filter.key === activeFilter ? "page" : undefined}
              className={filter.key === activeFilter ? "is-active" : ""}
              href={
                filter.key === "all"
                  ? "/dashboard"
                  : `/dashboard?status=${filter.key}`
              }
              key={filter.key}
            >
              <span>{filter.label}</span>
              <b>{countForFilter(rows, filter.key)}</b>
            </Link>
          ))}
        </nav>

        {rows.length && filteredRows.length ? (
          <section className="dashboard-grid">
            {filteredRows.map((tournament) => {
              const progress = progressFor(tournament.matches);
              const completed = completedMatchCount(tournament.matches);
              const totalMatches = tournament.matches?.length ?? 0;
              const action = primaryAction(tournament);

              return (
                <article
                  className="tournament-card dashboard-card"
                  key={tournament.slug}
                >
                  <header className="dashboard-card-header">
                    <span className={`pill is-${tournament.status}`}>
                      {formatStatus(tournament.status)}
                    </span>
                    <span>{formatVisibility(tournament.visibility)}</span>
                  </header>

                  <div className="dashboard-card-title">
                    <div>
                      <h2>
                        <Link href={`/tournaments/${tournament.slug}`}>
                          {tournament.name}
                        </Link>
                      </h2>
                      <p>
                        {tournament.category || "Sin categoria"} · Mejor de{" "}
                        {tournament.best_of}
                      </p>
                    </div>
                    <strong>{progress}%</strong>
                  </div>

                  <div className="progress">
                    <span style={{ width: `${progress}%` }} />
                  </div>

                  <dl className="dashboard-card-metrics">
                    <div>
                      <dt>Participantes</dt>
                      <dd>
                        {tournament.participants?.length ?? 0}/
                        {tournament.max_participants}
                      </dd>
                    </div>
                    <div>
                      <dt>Partidos</dt>
                      <dd>
                        {completed}/{totalMatches}
                      </dd>
                    </div>
                    <div>
                      <dt>Fecha</dt>
                      <dd>{formatDate(tournament.scheduled_at)}</dd>
                    </div>
                  </dl>

                  <footer className="dashboard-card-footer">
                    <span>{statusNote(tournament)}</span>
                    <div className="card-links">
                      {action.type === "link" ? (
                        <Link className="button small" href={action.href}>
                          {action.label}
                        </Link>
                      ) : (
                        <DashboardStatusForm
                          intent={action.intent}
                          slug={tournament.slug}
                        >
                          {action.label}
                        </DashboardStatusForm>
                      )}
                      <Link
                        className="button ghost small"
                        href={`/tournaments/${tournament.slug}`}
                      >
                        Detalle
                      </Link>
                    </div>
                  </footer>
                </article>
              );
            })}
          </section>
        ) : rows.length ? (
          <section className="empty-state">
            <p className="eyebrow">Filtro vacío</p>
            <h2>No hay torneos en esta vista.</h2>
            <p>Cambia de filtro para volver a ver el resto de brackets.</p>
            <Link className="button large" href="/dashboard">
              Ver todos
            </Link>
          </section>
        ) : (
          <section className="empty-state">
            <p className="eyebrow">Primer torneo</p>
            <h2>Aún no hay drafts guardados.</h2>
            <p>
              Crea el primero desde el asistente y aparecerá aquí con sus
              participantes, rondas, partidos y estado de publicación.
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
