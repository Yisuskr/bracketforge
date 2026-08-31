"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<
  ReturnType<typeof createSupabaseServerClient>
>;

type TournamentStatus =
  | "draft"
  | "ready"
  | "active"
  | "paused"
  | "completed"
  | "archived"
  | "cancelled";

type MatchStatus =
  "pending" | "ready" | "in_progress" | "completed" | "review" | "void";

type TournamentOwnerRow = {
  id: string;
  owner_id: string;
  slug: string;
  status: TournamentStatus;
  version: number;
};

type MatchRow = {
  id: string;
  tournament_id: string;
  match_number: number;
  participant_one_id: string | null;
  participant_two_id: string | null;
  winner_id: string | null;
  loser_id: string | null;
  status: MatchStatus;
  best_of: number;
  participant_one_score: number | null;
  participant_two_score: number | null;
  next_match_for_winner_id: string | null;
  version: number;
};

export type MatchResultState = {
  status: "idle" | "error" | "success";
  message: string;
};

const idleState: MatchResultState = { status: "idle", message: "" };

const matchResultSchema = z.object({
  matchId: z.string().uuid(),
  participantOneScore: z
    .string()
    .trim()
    .regex(/^\d+$/, "Pon un marcador valido.")
    .transform(Number),
  participantTwoScore: z
    .string()
    .trim()
    .regex(/^\d+$/, "Pon un marcador valido.")
    .transform(Number),
});

const lifecycleSchema = z.object({
  slug: z.string().trim().min(1),
  intent: z.enum(["mark-ready", "start", "pause", "resume", "draft"]),
});

const byesSchema = z.object({
  slug: z.string().trim().min(1),
});

function failure(message: string): MatchResultState {
  return { status: "error", message };
}

function success(message: string): MatchResultState {
  return { status: "success", message };
}

function requiredWins(bestOf: number) {
  return Math.floor(bestOf / 2) + 1;
}

function targetFieldForWinner(
  sourceMatch: MatchRow,
  matches: MatchRow[],
): "participant_one_id" | "participant_two_id" | null {
  if (!sourceMatch.next_match_for_winner_id) return null;

  const sources = matches
    .filter(
      (match) =>
        match.next_match_for_winner_id === sourceMatch.next_match_for_winner_id,
    )
    .sort((a, b) => a.match_number - b.match_number);

  const index = sources.findIndex((match) => match.id === sourceMatch.id);
  if (index === 0) return "participant_one_id";
  if (index === 1) return "participant_two_id";

  return null;
}

async function fetchTournamentMatches(
  supabase: SupabaseServerClient,
  tournamentId: string,
) {
  const { data } = await supabase
    .from("matches")
    .select(
      "id, tournament_id, match_number, participant_one_id, participant_two_id, winner_id, loser_id, status, best_of, participant_one_score, participant_two_score, next_match_for_winner_id, version",
    )
    .eq("tournament_id", tournamentId)
    .order("match_number", { ascending: true })
    .returns<MatchRow[]>();

  return data ?? [];
}

async function getOwnedTournament(
  supabase: SupabaseServerClient,
  slug: string,
) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return null;

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, owner_id, slug, status, version")
    .eq("slug", slug)
    .single<TournamentOwnerRow>();

  if (!tournament || tournament.owner_id !== user.id) return null;

  return tournament;
}

async function syncPlayableMatches(
  supabase: SupabaseServerClient,
  tournamentId: string,
) {
  const matches = await fetchTournamentMatches(supabase, tournamentId);
  const readyIds = matches
    .filter(
      (match) =>
        match.status !== "completed" &&
        match.participant_one_id &&
        match.participant_two_id &&
        !match.winner_id,
    )
    .map((match) => match.id);

  if (!readyIds.length) return;

  await supabase.from("matches").update({ status: "ready" }).in("id", readyIds);
}

async function syncTournamentStatus(
  supabase: SupabaseServerClient,
  tournament: TournamentOwnerRow,
) {
  const matches = await fetchTournamentMatches(supabase, tournament.id);
  if (!matches.length) return;

  const allCompleted = matches.every(
    (match) => match.status === "completed" && match.winner_id,
  );
  const hasCompleted = matches.some((match) => match.status === "completed");
  const nextStatus = allCompleted
    ? "completed"
    : hasCompleted && tournament.status !== "paused"
      ? "active"
      : null;

  if (!nextStatus || nextStatus === tournament.status) return;

  await supabase
    .from("tournaments")
    .update({
      status: nextStatus,
      updated_at: new Date().toISOString(),
      version: tournament.version + 1,
    })
    .eq("id", tournament.id);
}

async function propagateWinner(
  supabase: SupabaseServerClient,
  sourceMatch: MatchRow,
  winnerId: string,
  matches: MatchRow[],
) {
  if (!sourceMatch.next_match_for_winner_id) return;

  const target = matches.find(
    (match) => match.id === sourceMatch.next_match_for_winner_id,
  );
  if (!target || target.status === "completed") return;

  const targetField = targetFieldForWinner(sourceMatch, matches);
  if (!targetField) return;

  const nextOne =
    targetField === "participant_one_id" ? winnerId : target.participant_one_id;
  const nextTwo =
    targetField === "participant_two_id" ? winnerId : target.participant_two_id;

  await supabase
    .from("matches")
    .update({
      [targetField]: winnerId,
      status: nextOne && nextTwo ? "ready" : "pending",
      participant_one_score: null,
      participant_two_score: null,
      winner_id: null,
      loser_id: null,
      updated_at: new Date().toISOString(),
      version: target.version + 1,
    })
    .eq("id", target.id);
}

export async function recordMatchResult(
  _previousState: MatchResultState = idleState,
  formData: FormData,
): Promise<MatchResultState> {
  void _previousState;

  const validated = matchResultSchema.safeParse({
    matchId: formData.get("matchId"),
    participantOneScore: formData.get("participantOneScore"),
    participantTwoScore: formData.get("participantTwoScore"),
  });

  if (!validated.success) {
    return failure("Revisa los marcadores antes de guardar.");
  }

  const supabase = await createSupabaseServerClient();
  const { matchId, participantOneScore, participantTwoScore } = validated.data;

  const { data: currentMatch } = await supabase
    .from("matches")
    .select(
      "id, tournament_id, match_number, participant_one_id, participant_two_id, winner_id, loser_id, status, best_of, participant_one_score, participant_two_score, next_match_for_winner_id, version",
    )
    .eq("id", matchId)
    .single<MatchRow>();

  if (!currentMatch) return failure("No encontre ese partido.");

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, owner_id, slug, status, version")
    .eq("id", currentMatch.tournament_id)
    .single<TournamentOwnerRow>();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user || !tournament || tournament.owner_id !== user.id) {
    return failure("Solo el organizador puede guardar resultados.");
  }

  if (!currentMatch.participant_one_id || !currentMatch.participant_two_id) {
    return failure("Este partido todavia no tiene dos participantes.");
  }

  if (participantOneScore === participantTwoScore) {
    return failure("El partido no puede acabar empatado.");
  }

  const winsToTakeMatch = requiredWins(currentMatch.best_of);
  const winnerScore = Math.max(participantOneScore, participantTwoScore);
  const loserScore = Math.min(participantOneScore, participantTwoScore);

  if (winnerScore !== winsToTakeMatch || loserScore >= winsToTakeMatch) {
    return failure(
      `En mejor de ${currentMatch.best_of}, el ganador debe llegar a ${winsToTakeMatch}.`,
    );
  }

  const matches = await fetchTournamentMatches(supabase, tournament.id);
  const latestCurrent = matches.find((match) => match.id === currentMatch.id);
  if (!latestCurrent) return failure("No encontre ese partido.");

  const nextMatch = latestCurrent.next_match_for_winner_id
    ? matches.find(
        (match) => match.id === latestCurrent.next_match_for_winner_id,
      )
    : null;

  if (
    nextMatch &&
    (nextMatch.status === "completed" ||
      nextMatch.participant_one_score !== null ||
      nextMatch.participant_two_score !== null)
  ) {
    return failure(
      "No puedes cambiar este resultado porque el siguiente partido ya empezo.",
    );
  }

  const participantOneWon = participantOneScore > participantTwoScore;
  const winnerId = participantOneWon
    ? latestCurrent.participant_one_id
    : latestCurrent.participant_two_id;
  const loserId = participantOneWon
    ? latestCurrent.participant_two_id
    : latestCurrent.participant_one_id;

  if (!winnerId || !loserId) {
    return failure("Este partido todavia no tiene dos participantes.");
  }

  const { error: updateError } = await supabase
    .from("matches")
    .update({
      participant_one_score: participantOneScore,
      participant_two_score: participantTwoScore,
      winner_id: winnerId,
      loser_id: loserId,
      status: "completed",
      updated_at: new Date().toISOString(),
      version: latestCurrent.version + 1,
    })
    .eq("id", latestCurrent.id);

  if (updateError) return failure(updateError.message);

  await propagateWinner(supabase, latestCurrent, winnerId, matches);
  await syncPlayableMatches(supabase, tournament.id);
  await syncTournamentStatus(supabase, tournament);

  revalidatePath("/dashboard");
  revalidatePath(`/tournaments/${tournament.slug}`);

  return success("Resultado guardado y bracket actualizado.");
}

export async function updateTournamentStatus(formData: FormData) {
  const validated = lifecycleSchema.safeParse({
    slug: formData.get("slug"),
    intent: formData.get("intent"),
  });

  if (!validated.success) return;

  const supabase = await createSupabaseServerClient();
  const tournament = await getOwnedTournament(supabase, validated.data.slug);
  if (!tournament || tournament.status === "completed") return;

  const matches = await fetchTournamentMatches(supabase, tournament.id);
  const hasCompleted = matches.some((match) => match.status === "completed");
  let nextStatus: TournamentStatus | null = null;

  if (validated.data.intent === "mark-ready") nextStatus = "ready";
  if (validated.data.intent === "start") nextStatus = "active";
  if (validated.data.intent === "resume") nextStatus = "active";
  if (validated.data.intent === "pause" && tournament.status === "active") {
    nextStatus = "paused";
  }
  if (validated.data.intent === "draft" && !hasCompleted) nextStatus = "draft";

  if (!nextStatus || nextStatus === tournament.status) return;

  await supabase
    .from("tournaments")
    .update({
      status: nextStatus,
      updated_at: new Date().toISOString(),
      version: tournament.version + 1,
    })
    .eq("id", tournament.id);

  if (nextStatus === "ready" || nextStatus === "active") {
    await syncPlayableMatches(supabase, tournament.id);
  }

  revalidatePath("/dashboard");
  revalidatePath(`/tournaments/${tournament.slug}`);
}

export async function resolveByes(formData: FormData) {
  const validated = byesSchema.safeParse({ slug: formData.get("slug") });
  if (!validated.success) return;

  const supabase = await createSupabaseServerClient();
  const tournament = await getOwnedTournament(supabase, validated.data.slug);
  if (!tournament || tournament.status === "completed") return;

  const matches = await fetchTournamentMatches(supabase, tournament.id);
  const byeMatches = matches.filter(
    (match) =>
      !match.winner_id &&
      Boolean(match.participant_one_id) !== Boolean(match.participant_two_id),
  );

  for (const match of byeMatches) {
    const winnerId = match.participant_one_id ?? match.participant_two_id;
    if (!winnerId) continue;

    await supabase
      .from("matches")
      .update({
        winner_id: winnerId,
        loser_id: null,
        participant_one_score: null,
        participant_two_score: null,
        status: "completed",
        updated_at: new Date().toISOString(),
        version: match.version + 1,
      })
      .eq("id", match.id);

    await propagateWinner(supabase, match, winnerId, matches);
  }

  await syncPlayableMatches(supabase, tournament.id);
  await syncTournamentStatus(supabase, tournament);

  revalidatePath("/dashboard");
  revalidatePath(`/tournaments/${tournament.slug}`);
}
