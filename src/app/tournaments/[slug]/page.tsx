import Link from "next/link";
import { notFound } from "next/navigation";
import { ShareButton } from "@/components/share-button";
import { SiteHeader } from "@/components/site-header";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/session";
import { MatchResultForm } from "./match-result-form";
import { resolveByes, updateTournamentStatus } from "./actions";

type TournamentRecord = {
  id: string;
  owner_id: string;
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
  best_of: number;
  participant_one_id: string | null;
  participant_two_id: string | null;
  participant_one_score: number | null;
  participant_two_score: number | null;
  winner_id: string | null;
  loser_id: string | null;
  next_match_for_winner_id: string | null;
};

const tournamentStatusLabels: Record<string, string> = {
  draft: "Borrador",
  ready: "Listo",
  active: "Activo",
  paused: "Pausado",
  completed: "Completado",
  archived: "Archivado",
  cancelled: "Cancelado",
};

const matchStatusLabels: Record<string, string> = {
  pending: "Pendiente",
  ready: "Listo",
  in_progress: "En juego",
  completed: "Finalizado",
  review: "En revision",
  void: "Anulado",
};

const visibilityLabels: Record<string, string> = {
  public: "Publico",
  unlisted: "No listado",
  private: "Privado",
};

function labelFor(labels: Record<string, string>, value: string) {
  return labels[value] ?? value;
}

function formatMatchNumber(matchNumber: number) {
  return `M${matchNumber.toString().padStart(2, "0")}`;
}

function scoreText(score: number | null) {
  return score === null ? "-" : score.toString();
}

function playerInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function playerLine(
  participant: ParticipantRecord | null,
  score: number | null,
  isWinner: boolean,
) {
  if (!participant) {
    return (
      <div className="result-player is-empty">
        <span className="result-player-seed">-</span>
        <span className="result-player-avatar">?</span>
        <span className="result-player-main">
          <strong>Por decidir</strong>
        </span>
        <b className="result-player-score">{scoreText(score)}</b>
      </div>
    );
  }

  return (
    <div className={`result-player${isWinner ? "is-winner" : ""}`}>
      <span className="result-player-seed">{participant.seed}</span>
      <span className="result-player-avatar">
        {playerInitials(participant.display_name)}
      </span>
      <span className="result-player-main">
        <strong>{participant.display_name}</strong>
        {isWinner ? <span className="result-player-badge">Gana</span> : null}
      </span>
      <b className="result-player-score">{scoreText(score)}</b>
    </div>
  );
}

export const dynamic = "force-dynamic";

export default async function TournamentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const currentUser = await getCurrentUser();

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
      "id, owner_id, name, category, format, status, visibility, scheduled_at, best_of, participants(id, display_name, seed, initial_position), rounds(id, name, round_number, sequence), matches(id, round_id, match_number, status, best_of, participant_one_id, participant_two_id, participant_one_score, participant_two_score, winner_id, loser_id, next_match_for_winner_id)",
    )
    .eq("slug", slug)
    .single<TournamentRecord>();

  if (error || !tournament) notFound();

  const isOwner = currentUser?.id === tournament.owner_id;
  const participants = [...(tournament.participants ?? [])].sort(
    (a, b) => a.seed - b.seed,
  );
  const rounds = [...(tournament.rounds ?? [])].sort(
    (a, b) => a.sequence - b.sequence,
  );
  const matches = [...(tournament.matches ?? [])].sort(
    (a, b) => a.match_number - b.match_number,
  );
  const participantsById = new Map(
    participants.map((participant) => [participant.id, participant]),
  );
  const matchesByRound = new Map(
    rounds.map((round) => [
      round.id,
      matches.filter((match) => match.round_id === round.id),
    ]),
  );
  const nextMatchById = new Map(matches.map((match) => [match.id, match]));
  const completedMatches = matches.filter(
    (match) => match.status === "completed",
  );
  const playableMatches = matches.filter(
    (match) => match.participant_one_id && match.participant_two_id,
  );
  const unresolvedByes = matches.filter(
    (match) =>
      !match.winner_id &&
      Boolean(match.participant_one_id) !== Boolean(match.participant_two_id),
  );
  const finalMatch = matches.at(-1);
  const champion = finalMatch?.winner_id
    ? participantsById.get(finalMatch.winner_id)
    : null;
  const canRecordResults = tournament.status === "active";
  const canShare = tournament.visibility !== "private";

  return (
    <>
      <SiteHeader />
      <main className="page tournament-detail container">
        <section className="tournament-detail-hero">
          <div>
            <p className="eyebrow">
              {champion ? "Campeon decidido" : "Torneo real"}
            </p>
            <h1>{tournament.name}</h1>
            <p>
              {tournament.category || "Sin categoria"} · Eliminacion simple ·
              Mejor de {tournament.best_of}
            </p>
          </div>
          <div className="detail-actions">
            {canShare ? (
              <ShareButton title={`${tournament.name} · BracketForge`} />
            ) : null}
            {isOwner && tournament.status === "draft" ? (
              <Link className="button ghost" href={`/tournaments/${slug}/edit`}>
                Editar draft
              </Link>
            ) : null}
            <span className="pill">
              {labelFor(tournamentStatusLabels, tournament.status)}
            </span>
            <span className="pill">
              {labelFor(visibilityLabels, tournament.visibility)}
            </span>
          </div>
        </section>

        <section className="stats">
          <article>
            <b>{participants.length}</b>
            <span>Participantes</span>
          </article>
          <article>
            <b>
              {completedMatches.length}/{matches.length}
            </b>
            <span>Partidos cerrados</span>
          </article>
          <article>
            <b>{champion?.display_name ?? "Pendiente"}</b>
            <span>Campeon</span>
          </article>
        </section>

        {isOwner ? (
          <section className="manager-panel">
            <div>
              <p className="eyebrow">Control del organizador</p>
              <h2>Gestiona el ritmo del torneo</h2>
              <p>
                Marca el torneo como listo, inicialo cuando toque y guarda cada
                resultado desde su partido.
              </p>
            </div>
            <div className="status-actions">
              {tournament.status === "draft" ? (
                <form action={updateTournamentStatus} className="inline-form">
                  <input name="slug" type="hidden" value={slug} />
                  <button
                    className="button ghost"
                    name="intent"
                    value="mark-ready"
                  >
                    Marcar listo
                  </button>
                </form>
              ) : null}
              {["draft", "ready", "paused"].includes(tournament.status) ? (
                <form action={updateTournamentStatus} className="inline-form">
                  <input name="slug" type="hidden" value={slug} />
                  <button
                    className="button"
                    name="intent"
                    value={tournament.status === "paused" ? "resume" : "start"}
                  >
                    {tournament.status === "paused" ? "Reanudar" : "Iniciar"}
                  </button>
                </form>
              ) : null}
              {tournament.status === "active" ? (
                <form action={updateTournamentStatus} className="inline-form">
                  <input name="slug" type="hidden" value={slug} />
                  <button className="button ghost" name="intent" value="pause">
                    Pausar
                  </button>
                </form>
              ) : null}
              {tournament.status !== "draft" && !completedMatches.length ? (
                <form action={updateTournamentStatus} className="inline-form">
                  <input name="slug" type="hidden" value={slug} />
                  <button className="button ghost" name="intent" value="draft">
                    Volver a borrador
                  </button>
                </form>
              ) : null}
              {unresolvedByes.length ? (
                <form action={resolveByes} className="inline-form">
                  <input name="slug" type="hidden" value={slug} />
                  <button className="button ghost">Aplicar byes</button>
                </form>
              ) : null}
            </div>
          </section>
        ) : null}

        <section className="live-results-board">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Bracket vivo</p>
              <h2>Resultados y avance</h2>
            </div>
            <p>
              {playableMatches.length} partidos jugables ·{" "}
              {unresolvedByes.length} byes pendientes
            </p>
          </div>

          <div className="round-result-grid">
            {rounds.map((round) => (
              <article className="result-round" key={round.id}>
                <header>
                  <span>
                    Ronda {round.round_number.toString().padStart(2, "0")}
                  </span>
                  <h3>{round.name}</h3>
                </header>
                <div className="result-match-list">
                  {(matchesByRound.get(round.id) ?? []).map((match) => {
                    const participantOne = match.participant_one_id
                      ? (participantsById.get(match.participant_one_id) ?? null)
                      : null;
                    const participantTwo = match.participant_two_id
                      ? (participantsById.get(match.participant_two_id) ?? null)
                      : null;
                    const winner = match.winner_id
                      ? participantsById.get(match.winner_id)
                      : null;
                    const nextMatch = match.next_match_for_winner_id
                      ? nextMatchById.get(match.next_match_for_winner_id)
                      : null;
                    const nextAlreadyStarted = Boolean(
                      nextMatch &&
                      (nextMatch.status === "completed" ||
                        nextMatch.participant_one_score !== null ||
                        nextMatch.participant_two_score !== null),
                    );
                    const hasBothParticipants = Boolean(
                      participantOne && participantTwo,
                    );
                    const disabledReason = !hasBothParticipants
                      ? "Esperando participantes."
                      : nextAlreadyStarted
                        ? "El siguiente partido ya empezo."
                        : undefined;

                    return (
                      <article
                        className={`result-match-card is-${match.status}`}
                        key={match.id}
                      >
                        <header>
                          <span>{formatMatchNumber(match.match_number)}</span>
                          <strong>
                            {labelFor(matchStatusLabels, match.status)}
                          </strong>
                        </header>
                        <div className="result-players">
                          {playerLine(
                            participantOne,
                            match.participant_one_score,
                            match.winner_id === participantOne?.id,
                          )}
                          {playerLine(
                            participantTwo,
                            match.participant_two_score,
                            match.winner_id === participantTwo?.id,
                          )}
                        </div>
                        {winner ? (
                          <p className="match-winner">
                            Ganador: <strong>{winner.display_name}</strong>
                          </p>
                        ) : null}
                        {isOwner && canRecordResults ? (
                          <MatchResultForm
                            bestOf={match.best_of}
                            disabled={Boolean(disabledReason)}
                            disabledReason={disabledReason}
                            matchId={match.id}
                            participantOneName={
                              participantOne?.display_name ?? "Participante 1"
                            }
                            participantOneScore={match.participant_one_score}
                            participantTwoName={
                              participantTwo?.display_name ?? "Participante 2"
                            }
                            participantTwoScore={match.participant_two_score}
                          />
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
