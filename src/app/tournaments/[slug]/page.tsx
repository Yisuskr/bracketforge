import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { ShareButton } from "@/components/share-button";
import { SiteHeader } from "@/components/site-header";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/session";
import { MatchResultForm } from "./match-result-form";
import { LiveTournamentRefresh } from "./live-tournament-refresh";
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

type LifecycleIntent = "mark-ready" | "start" | "pause" | "resume" | "draft";

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

const lifecycleSteps = [
  {
    key: "draft",
    label: "Borrador",
    note: "Participantes y reglas",
  },
  {
    key: "ready",
    label: "Listo",
    note: "Revision final",
  },
  {
    key: "active",
    label: "En vivo",
    note: "Resultados abiertos",
  },
  {
    key: "completed",
    label: "Final",
    note: "Campeon definido",
  },
];

function labelFor(labels: Record<string, string>, value: string) {
  return labels[value] ?? value;
}

function formatMatchNumber(matchNumber: number) {
  return `M${matchNumber.toString().padStart(2, "0")}`;
}

function scoreText(score: number | null) {
  return score === null ? "-" : score.toString();
}

function completionPercent(completed: number, total: number) {
  if (!total) return 0;
  return Math.round((completed / total) * 100);
}

function lifecyclePosition(status: string) {
  if (status === "draft") return 0;
  if (status === "ready") return 1;
  if (status === "active" || status === "paused") return 2;
  return 3;
}

function eventInitials(name: string) {
  const initials = playerInitials(name);
  return initials ? initials.slice(0, 2) : "BF";
}

function phaseLabel(
  status: string,
  champion: ParticipantRecord | null,
  currentRoundName: string | null,
) {
  if (champion) return "Final cerrada";
  if (status === "active") return currentRoundName ?? "En juego";
  if (status === "paused") return "Pausado";
  return labelFor(tournamentStatusLabels, status);
}

function organizerGuidance({
  championName,
  completedMatchCount,
  matchCount,
  playableMatchCount,
  status,
  unresolvedByeCount,
}: {
  championName: string | null;
  completedMatchCount: number;
  matchCount: number;
  playableMatchCount: number;
  status: string;
  unresolvedByeCount: number;
}) {
  if (status === "draft") {
    return {
      body:
        unresolvedByeCount > 0
          ? "Hay byes listos para resolver antes de abrir el torneo."
          : "Revisa el draft, ajusta participantes si hace falta y dejalo listo para competir.",
      headline: "Prepara la salida",
      next: "Siguiente: revisar y abrir la arena.",
    };
  }

  if (status === "ready") {
    return {
      body: `${playableMatchCount} partidos pueden jugarse cuando inicies.`,
      headline: "Todo listo para iniciar",
      next: "Siguiente: iniciar el torneo.",
    };
  }

  if (status === "active") {
    return {
      body: `${completedMatchCount} de ${matchCount} partidos cerrados. Guarda resultados desde cada partido listo.`,
      headline: "Torneo en marcha",
      next: "Siguiente: completar los partidos abiertos.",
    };
  }

  if (status === "paused") {
    return {
      body: "Los resultados estan congelados hasta que reanudes.",
      headline: "Torneo pausado",
      next: "Siguiente: reanudar cuando toque.",
    };
  }

  if (status === "completed") {
    return {
      body: championName
        ? `${championName} quedo como campeon del torneo.`
        : "El bracket esta cerrado.",
      headline: "Torneo completado",
      next: "Siguiente: compartir resultados o archivar mas adelante.",
    };
  }

  return {
    body: "Mantente atento al estado antes de permitir nuevos resultados.",
    headline: labelFor(tournamentStatusLabels, status),
    next: "Siguiente: revisar el bracket.",
  };
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
    <div className={`result-player${isWinner ? " is-winner" : ""}`}>
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

function PublicArenaHeader({
  canShare,
  tournamentId,
  tournamentName,
}: {
  canShare: boolean;
  tournamentId: string;
  tournamentName: string;
}) {
  return (
    <header className="public-arena-topbar">
      <div className="container">
        <Link className="public-brand" href="/">
          <span>B</span>
          BracketForge
        </Link>
        <div className="public-arena-topbar-actions">
          <LiveTournamentRefresh tournamentId={tournamentId} />
          {canShare ? (
            <ShareButton title={`${tournamentName} · BracketForge`} />
          ) : null}
        </div>
      </div>
    </header>
  );
}

function StatusActionForm({
  children,
  intent,
  slug,
  variant = "ghost",
}: {
  children: ReactNode;
  intent: LifecycleIntent;
  slug: string;
  variant?: "primary" | "ghost";
}) {
  return (
    <form action={updateTournamentStatus} className="inline-form">
      <input name="slug" type="hidden" value={slug} />
      <button
        className={variant === "primary" ? "button" : "button ghost"}
        name="intent"
        value={intent}
      >
        {children}
      </button>
    </form>
  );
}

function OrganizerConsole({
  championName,
  completedMatchCount,
  completion,
  matchCount,
  playableMatchCount,
  slug,
  status,
  unresolvedByeCount,
}: {
  championName: string | null;
  completedMatchCount: number;
  completion: number;
  matchCount: number;
  playableMatchCount: number;
  slug: string;
  status: string;
  unresolvedByeCount: number;
}) {
  const position = lifecyclePosition(status);
  const guidance = organizerGuidance({
    championName,
    completedMatchCount,
    matchCount,
    playableMatchCount,
    status,
    unresolvedByeCount,
  });
  const canReturnToDraft = status !== "draft" && completedMatchCount === 0;
  const hasActions =
    status === "draft" ||
    status === "ready" ||
    status === "active" ||
    status === "paused" ||
    canReturnToDraft ||
    unresolvedByeCount > 0;

  return (
    <section className="organizer-console">
      <div className="organizer-console-main">
        <p className="eyebrow">Cabina del organizador</p>
        <h2>{guidance.headline}</h2>
        <p>{guidance.body}</p>
        <div className="organizer-meter">
          <div>
            <span>Avance</span>
            <b>{completion}%</b>
          </div>
          <div className="organizer-meter-track">
            <span style={{ width: `${completion}%` }} />
          </div>
          <small>{guidance.next}</small>
        </div>
      </div>

      <ol className="lifecycle-track" aria-label="Estado del torneo">
        {lifecycleSteps.map((step, index) => {
          const isCurrent = index === position;
          const className = [
            index < position ? "is-done" : "",
            isCurrent ? "is-current" : "",
            isCurrent && status === "paused" && step.key === "active"
              ? "is-paused"
              : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <li className={className} key={step.key}>
              <span>{index + 1}</span>
              <div>
                <strong>{step.label}</strong>
                <small>{step.note}</small>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="organizer-actions">
        <div>
          <strong>Acciones disponibles</strong>
          <span>{labelFor(tournamentStatusLabels, status)}</span>
        </div>
        {hasActions ? (
          <div className="organizer-action-list">
            {status === "draft" ? (
              <>
                <Link
                  className="button ghost"
                  href={`/tournaments/${slug}/edit`}
                >
                  Editar draft
                </Link>
                <StatusActionForm intent="mark-ready" slug={slug}>
                  Marcar listo
                </StatusActionForm>
                <StatusActionForm intent="start" slug={slug} variant="primary">
                  Iniciar torneo
                </StatusActionForm>
              </>
            ) : null}
            {status === "ready" ? (
              <StatusActionForm intent="start" slug={slug} variant="primary">
                Iniciar torneo
              </StatusActionForm>
            ) : null}
            {status === "active" ? (
              <StatusActionForm intent="pause" slug={slug}>
                Pausar torneo
              </StatusActionForm>
            ) : null}
            {status === "paused" ? (
              <StatusActionForm intent="resume" slug={slug} variant="primary">
                Reanudar torneo
              </StatusActionForm>
            ) : null}
            {canReturnToDraft ? (
              <StatusActionForm intent="draft" slug={slug}>
                Volver a borrador
              </StatusActionForm>
            ) : null}
            {unresolvedByeCount > 0 ? (
              <form action={resolveByes} className="inline-form">
                <input name="slug" type="hidden" value={slug} />
                <button className="button ghost">Aplicar byes</button>
              </form>
            ) : null}
          </div>
        ) : (
          <p>Torneo cerrado.</p>
        )}
      </div>
    </section>
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
  const currentRound =
    rounds.find((round) =>
      (matchesByRound.get(round.id) ?? []).some(
        (match) => match.status !== "completed",
      ),
    ) ?? null;
  const completion = completionPercent(completedMatches.length, matches.length);
  const readyMatchCount = matches.filter((match) =>
    ["ready", "in_progress"].includes(match.status),
  ).length;
  const canRecordResults = tournament.status === "active";
  const canShare = tournament.visibility !== "private";
  const isSpectatorView = !isOwner;
  const phase = phaseLabel(
    tournament.status,
    champion ?? null,
    currentRound?.name ?? null,
  );

  return (
    <>
      {isSpectatorView ? (
        <PublicArenaHeader
          canShare={canShare}
          tournamentId={tournament.id}
          tournamentName={tournament.name}
        />
      ) : (
        <SiteHeader />
      )}
      <main
        className={`page tournament-detail container${
          isSpectatorView ? " spectator-arena" : ""
        }`}
      >
        <section
          className={`tournament-detail-hero${
            isSpectatorView ? " is-public-arena" : ""
          }`}
        >
          <div>
            <p className="eyebrow">
              {champion
                ? "Campeon decidido"
                : isSpectatorView
                  ? "Arena publica"
                  : "Torneo real"}
            </p>
            <h1>{tournament.name}</h1>
            <p>
              {tournament.category || "Sin categoria"} · Eliminacion simple ·
              Mejor de {tournament.best_of}
            </p>
            {isSpectatorView ? (
              <div className="public-arena-tags">
                <span>{phase}</span>
                <span>{labelFor(visibilityLabels, tournament.visibility)}</span>
                <span>{completion}% completado</span>
              </div>
            ) : null}
          </div>
          {isSpectatorView ? (
            <aside className="arena-spotlight" aria-label="Resumen del torneo">
              <span className="arena-emblem">
                {eventInitials(tournament.name)}
              </span>
              <div>
                <small>{champion ? "Campeon" : "Estado"}</small>
                <strong>{champion?.display_name ?? phase}</strong>
                <span>
                  {completedMatches.length}/{matches.length} partidos cerrados
                </span>
              </div>
              <div className="arena-spotlight-meter">
                <span style={{ width: `${completion}%` }} />
              </div>
            </aside>
          ) : (
            <div className="detail-actions">
              <LiveTournamentRefresh tournamentId={tournament.id} />
              {canShare ? (
                <ShareButton title={`${tournament.name} · BracketForge`} />
              ) : null}
              <span className="pill">
                {labelFor(tournamentStatusLabels, tournament.status)}
              </span>
              <span className="pill">
                {labelFor(visibilityLabels, tournament.visibility)}
              </span>
            </div>
          )}
        </section>

        <section
          className={`stats${isSpectatorView ? " spectator-stats" : ""}`}
        >
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
            <b>
              {isSpectatorView
                ? `${completion}%`
                : (champion?.display_name ?? "Pendiente")}
            </b>
            <span>{isSpectatorView ? "Avance" : "Campeon"}</span>
          </article>
        </section>

        {isOwner ? (
          <OrganizerConsole
            championName={champion?.display_name ?? null}
            completedMatchCount={completedMatches.length}
            completion={completion}
            matchCount={matches.length}
            playableMatchCount={playableMatches.length}
            slug={slug}
            status={tournament.status}
            unresolvedByeCount={unresolvedByes.length}
          />
        ) : null}

        {isSpectatorView && participants.length ? (
          <section className="public-roster">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Competidores</p>
                <h2>Participantes</h2>
              </div>
              <p>{participants.length} inscritos</p>
            </div>
            <ol className="public-roster-list">
              {participants.map((participant) => (
                <li key={participant.id}>
                  <span>{participant.seed}</span>
                  <b>{playerInitials(participant.display_name)}</b>
                  <strong>{participant.display_name}</strong>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <section
          className={`live-results-board${
            isSpectatorView ? " is-spectator" : ""
          }`}
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">
                {isSpectatorView ? "Marcador publico" : "Bracket vivo"}
              </p>
              <h2>
                {isSpectatorView
                  ? "Rondas y resultados"
                  : "Resultados y avance"}
              </h2>
            </div>
            <p>
              {isSpectatorView
                ? `${labelFor(tournamentStatusLabels, tournament.status)} · ${readyMatchCount} en cola`
                : `${playableMatches.length} partidos jugables · ${unresolvedByes.length} byes pendientes`}
            </p>
          </div>

          <div
            className={`round-result-grid${
              isSpectatorView ? " is-spectator" : ""
            }`}
          >
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
                        className={`result-match-card is-${match.status}${
                          isSpectatorView ? " is-spectator" : ""
                        }`}
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
