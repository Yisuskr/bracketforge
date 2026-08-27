import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type TournamentRecord = {
  id: string;
  name: string;
  category: string | null;
  format: string;
  status: string;
  visibility: string;
  scheduled_at: string | null;
  best_of: number;
  participants: ParticipantRecord[] | null;
  rounds: RoundRecord[] | null;
  matches: MatchRecord[] | null;
};

type ParticipantRecord = {
  id: string;
  display_name: string;
  seed: number;
  initial_position: number;
};

type RoundRecord = {
  id: string;
  name: string;
  round_number: number;
  sequence: number;
};

type MatchRecord = {
  id: string;
  round_id: string;
  match_number: number;
  status: string;
  participant_one_id: string | null;
  participant_two_id: string | null;
  winner_id: string | null;
};

export const dynamic = "force-dynamic";

export default async function TournamentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return (
      <>
        <SiteHeader />
        <main className="page narrow container">
          <p className="eyebrow">Torneo real</p>
          <h1>Conecta Supabase</h1>
          <p className="lede small">
            Esta pagina lee torneos guardados. Configura las variables de
            Supabase en <code>.env.local</code> para ver datos reales.
          </p>
          <Link className="button large" href="/tournaments/new">
            Volver al asistente
          </Link>
        </main>
      </>
    );
  }

  const { data: tournament, error } = await supabase
    .from("tournaments")
    .select(
      "id, name, category, format, status, visibility, scheduled_at, best_of, participants(id, display_name, seed, initial_position), rounds(id, name, round_number, sequence), matches(id, round_id, match_number, status, participant_one_id, participant_two_id, winner_id)",
    )
    .eq("slug", slug)
    .single<TournamentRecord>();

  if (error || !tournament) notFound();

  const participants = [...(tournament.participants ?? [])].sort(
    (a, b) => a.seed - b.seed,
  );
  const rounds = [...(tournament.rounds ?? [])].sort(
    (a, b) => a.sequence - b.sequence,
  );
  const matches = [...(tournament.matches ?? [])].sort(
    (a, b) => a.match_number - b.match_number,
  );

  return (
    <>
      <SiteHeader />
      <main className="page tournament-detail container">
        <section className="tournament-detail-hero">
          <div>
            <p className="eyebrow">Borrador real</p>
            <h1>{tournament.name}</h1>
            <p>
              {tournament.category || "Sin categoria"} · Eliminacion simple ·
              Mejor de {tournament.best_of}
            </p>
          </div>
          <div className="detail-actions">
            <span className="pill">{tournament.status}</span>
            <span className="pill">{tournament.visibility}</span>
          </div>
        </section>

        <section className="stats">
          <article>
            <b>{participants.length}</b>
            <span>Participantes</span>
          </article>
          <article>
            <b>{rounds.length}</b>
            <span>Rondas</span>
          </article>
          <article>
            <b>{matches.length}</b>
            <span>Partidos</span>
          </article>
        </section>

        <section className="detail-grid">
          <article>
            <div className="section-heading">
              <div>
                <p className="eyebrow">Seeds</p>
                <h2>Participantes</h2>
              </div>
            </div>
            <ol className="participant-list">
              {participants.map((participant) => (
                <li key={participant.id}>
                  <span>{participant.seed}</span>
                  <strong>{participant.display_name}</strong>
                  <small>Posicion {participant.initial_position}</small>
                </li>
              ))}
            </ol>
          </article>

          <article>
            <div className="section-heading">
              <div>
                <p className="eyebrow">Estructura</p>
                <h2>Bracket generado</h2>
              </div>
            </div>
            <div className="round-list">
              {rounds.map((round) => (
                <div key={round.id}>
                  <strong>{round.name}</strong>
                  <span>
                    {
                      matches.filter((match) => match.round_id === round.id)
                        .length
                    }{" "}
                    partidos preparados
                  </span>
                </div>
              ))}
            </div>
            <p className="form-note">
              El siguiente bloque sera editar resultados y avanzar ganadores.
            </p>
          </article>
        </section>
      </main>
    </>
  );
}
