import {
  createSingleEliminationBracket,
  seededPositions,
  type Slot,
} from "@/domain/bracket/single-elimination";
import type { createSupabaseServerClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<
  ReturnType<typeof createSupabaseServerClient>
>;

type InsertedParticipant = { id: string; seed: number };
type InsertedRound = { id: string; round_number: number };
type InsertedMatch = { id: string; match_number: number };

export function parseParticipants(input: string) {
  return input
    .split(/[\n,]/)
    .map((name) => name.trim())
    .filter(Boolean);
}

export function duplicateNames(names: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  names.forEach((name) => {
    const normalized = name.toLocaleLowerCase("es");
    if (seen.has(normalized)) duplicates.add(name);
    seen.add(normalized);
  });

  return [...duplicates];
}

export function parseScheduledAt(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

export function roundName(round: number, totalRounds: number) {
  const remaining = totalRounds - round;
  if (remaining === 0) return "Gran final";
  if (remaining === 1) return "Semifinales";
  if (remaining === 2) return "Cuartos de final";
  return `Ronda ${round}`;
}

export function slugify(input: string) {
  const base = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

  return base || "torneo";
}

export function uniqueSlug(name: string) {
  return `${slugify(name)}-${crypto.randomUUID().slice(0, 8)}`;
}

export function bracketSizeForParticipantCount(count: number) {
  if (count < 2) return 0;

  let size = 1;
  while (size < count) size *= 2;

  return size;
}

async function ensureOk<T>(
  result: { data: T | null; error: { message: string } | null },
  fallback: string,
) {
  if (result.error || !result.data) {
    throw new Error(result.error?.message ?? fallback);
  }

  return result.data;
}

function participantIdForSlot(
  slot: Slot,
  seedByEntrantId: Map<string, number>,
  participantIdBySeed: Map<number, string>,
) {
  if (!slot.entrantId) return null;
  const seed = seedByEntrantId.get(slot.entrantId);
  return seed ? (participantIdBySeed.get(seed) ?? null) : null;
}

export async function clearTournamentBracket(
  supabase: SupabaseServerClient,
  tournamentId: string,
) {
  const { error: matchesError } = await supabase
    .from("matches")
    .delete()
    .eq("tournament_id", tournamentId);

  if (matchesError) throw new Error(matchesError.message);

  const { error: roundsError } = await supabase
    .from("rounds")
    .delete()
    .eq("tournament_id", tournamentId);

  if (roundsError) throw new Error(roundsError.message);

  const { error: participantsError } = await supabase
    .from("participants")
    .delete()
    .eq("tournament_id", tournamentId);

  if (participantsError) throw new Error(participantsError.message);
}

export async function insertSingleEliminationBracket({
  bestOf,
  participants,
  supabase,
  tournamentId,
}: {
  bestOf: number;
  participants: string[];
  supabase: SupabaseServerClient;
  tournamentId: string;
}) {
  const bracketEntrants = participants.map((name, index) => ({
    id: `entrant-${index + 1}`,
    name,
    seed: index + 1,
  }));
  const bracket = createSingleEliminationBracket(bracketEntrants);
  const seededSlots = seededPositions(bracket.size);
  const positionBySeed = new Map(
    seededSlots.map((seed, index) => [seed, index + 1]),
  );

  const insertedParticipants = await ensureOk(
    await supabase
      .from("participants")
      .insert(
        participants.map((displayName, index) => {
          const seed = index + 1;
          return {
            tournament_id: tournamentId,
            display_name: displayName,
            seed,
            initial_position: positionBySeed.get(seed) ?? seed,
          };
        }),
      )
      .select("id, seed")
      .returns<InsertedParticipant[]>(),
    "No se pudieron crear los participantes.",
  );

  const participantIdBySeed = new Map(
    insertedParticipants.map((participant) => [
      participant.seed,
      participant.id,
    ]),
  );
  const seedByEntrantId = new Map(
    bracketEntrants.map((entrant) => [entrant.id, entrant.seed]),
  );

  const insertedRounds = await ensureOk(
    await supabase
      .from("rounds")
      .insert(
        Array.from({ length: bracket.rounds }, (_, index) => {
          const roundNumber = index + 1;
          return {
            tournament_id: tournamentId,
            round_number: roundNumber,
            name: roundName(roundNumber, bracket.rounds),
            sequence: roundNumber,
          };
        }),
      )
      .select("id, round_number")
      .returns<InsertedRound[]>(),
    "No se pudieron crear las rondas.",
  );

  const roundIdByNumber = new Map(
    insertedRounds.map((round) => [round.round_number, round.id]),
  );

  const insertedMatches = await ensureOk(
    await supabase
      .from("matches")
      .insert(
        bracket.matches.map((match, index) => {
          const participantOneId = participantIdForSlot(
            match.participantOne,
            seedByEntrantId,
            participantIdBySeed,
          );
          const participantTwoId = participantIdForSlot(
            match.participantTwo,
            seedByEntrantId,
            participantIdBySeed,
          );

          return {
            tournament_id: tournamentId,
            round_id: roundIdByNumber.get(match.round),
            match_number: index + 1,
            participant_one_id: participantOneId,
            participant_two_id: participantTwoId,
            status: participantOneId && participantTwoId ? "ready" : "pending",
            best_of: bestOf,
          };
        }),
      )
      .select("id, match_number")
      .returns<InsertedMatch[]>(),
    "No se pudieron crear los partidos.",
  );

  const matchIdByDomainId = new Map(
    bracket.matches.map((match, index) => {
      const inserted = insertedMatches.find(
        (row) => row.match_number === index + 1,
      );
      return [match.id, inserted?.id] as const;
    }),
  );

  for (const match of bracket.matches) {
    const currentId = matchIdByDomainId.get(match.id);
    const nextId = match.nextMatchId
      ? matchIdByDomainId.get(match.nextMatchId)
      : null;

    if (!currentId || !nextId) continue;

    const { error } = await supabase
      .from("matches")
      .update({ next_match_for_winner_id: nextId })
      .eq("id", currentId);

    if (error) throw new Error(error.message);
  }

  const domainMatchById = new Map(
    bracket.matches.map((match) => [match.id, match]),
  );

  for (const match of bracket.matches) {
    const participantOneId = participantIdForSlot(
      match.participantOne,
      seedByEntrantId,
      participantIdBySeed,
    );
    const participantTwoId = participantIdForSlot(
      match.participantTwo,
      seedByEntrantId,
      participantIdBySeed,
    );
    const winnerId =
      participantOneId && !participantTwoId
        ? participantOneId
        : participantTwoId && !participantOneId
          ? participantTwoId
          : null;
    const currentId = matchIdByDomainId.get(match.id);

    if (!currentId || !winnerId) continue;

    const { error: byeError } = await supabase
      .from("matches")
      .update({
        winner_id: winnerId,
        loser_id: null,
        participant_one_score: null,
        participant_two_score: null,
        status: "completed",
      })
      .eq("id", currentId);

    if (byeError) throw new Error(byeError.message);

    if (!match.nextMatchId) continue;

    const nextDomainMatch = domainMatchById.get(match.nextMatchId);
    const nextId = matchIdByDomainId.get(match.nextMatchId);
    const targetField =
      nextDomainMatch?.participantOne.sourceMatchId === match.id
        ? "participant_one_id"
        : nextDomainMatch?.participantTwo.sourceMatchId === match.id
          ? "participant_two_id"
          : null;

    if (!nextId || !targetField) continue;

    const { error: advanceByeError } = await supabase
      .from("matches")
      .update({ [targetField]: winnerId })
      .eq("id", nextId);

    if (advanceByeError) throw new Error(advanceByeError.message);
  }

  const { data: generatedMatches, error: generatedMatchesError } =
    await supabase
      .from("matches")
      .select("id, participant_one_id, participant_two_id, winner_id, status")
      .eq("tournament_id", tournamentId)
      .returns<
        {
          id: string;
          participant_one_id: string | null;
          participant_two_id: string | null;
          winner_id: string | null;
          status: string;
        }[]
      >();

  if (generatedMatchesError) throw new Error(generatedMatchesError.message);

  const readyMatchIds = (generatedMatches ?? [])
    .filter(
      (match) =>
        match.status !== "completed" &&
        match.participant_one_id &&
        match.participant_two_id &&
        !match.winner_id,
    )
    .map((match) => match.id);

  if (readyMatchIds.length) {
    const { error: readyMatchesError } = await supabase
      .from("matches")
      .update({ status: "ready" })
      .in("id", readyMatchIds);

    if (readyMatchesError) throw new Error(readyMatchesError.message);
  }

  return {
    matchCount: bracket.matches.length,
    roundCount: bracket.rounds,
    size: bracket.size,
  };
}
