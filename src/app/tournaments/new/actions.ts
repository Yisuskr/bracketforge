"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  createSingleEliminationBracket,
  seededPositions,
  type Slot,
} from "@/domain/bracket/single-elimination";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type FieldName =
  | "name"
  | "category"
  | "scheduledAt"
  | "visibility"
  | "bestOf"
  | "participants";

export type CreateTournamentState = {
  status: "idle" | "error" | "success";
  message: string;
  slug?: string;
  fieldErrors?: Partial<Record<FieldName, string[]>>;
};

const createTournamentSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "Pon un nombre con al menos 3 caracteres.")
    .max(120, "El nombre no puede pasar de 120 caracteres."),
  category: z
    .string()
    .trim()
    .max(80, "La categoría no puede pasar de 80 caracteres.")
    .optional(),
  scheduledAt: z.string().trim().optional(),
  visibility: z.enum(["public", "unlisted", "private"], {
    error: "Elige una visibilidad válida.",
  }),
  bestOf: z.coerce
    .number()
    .int("El formato debe ser un número entero.")
    .min(1, "El formato mínimo es mejor de 1.")
    .max(9, "De momento limitamos el formato a mejor de 9.")
    .refine((value) => value % 2 === 1, "El mejor de debe ser impar."),
  participants: z.string().trim().min(1, "Añade al menos dos participantes."),
});

type InsertedTournament = { id: string; slug: string };
type InsertedParticipant = { id: string; seed: number };
type InsertedRound = { id: string; round_number: number };
type InsertedMatch = { id: string; match_number: number };

function parseParticipants(input: string) {
  return input
    .split(/[\n,]/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function duplicateNames(names: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  names.forEach((name) => {
    const normalized = name.toLocaleLowerCase("es");
    if (seen.has(normalized)) duplicates.add(name);
    seen.add(normalized);
  });

  return [...duplicates];
}

function slugify(input: string) {
  const base = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

  return base || "torneo";
}

function uniqueSlug(name: string) {
  return `${slugify(name)}-${crypto.randomUUID().slice(0, 8)}`;
}

function parseScheduledAt(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function roundName(round: number, totalRounds: number) {
  const remaining = totalRounds - round;
  if (remaining === 0) return "Gran final";
  if (remaining === 1) return "Semifinales";
  if (remaining === 2) return "Cuartos de final";
  return `Ronda ${round}`;
}

function failure(
  message: string,
  fieldErrors?: CreateTournamentState["fieldErrors"],
): CreateTournamentState {
  return { status: "error", message, fieldErrors };
}

async function rollbackTournament(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  tournamentId: string | null,
) {
  if (!tournamentId) return;
  await supabase.from("tournaments").delete().eq("id", tournamentId);
}

export async function createTournament(
  _previousState: CreateTournamentState,
  formData: FormData,
): Promise<CreateTournamentState> {
  const validated = createTournamentSchema.safeParse({
    name: formData.get("name"),
    category: formData.get("category"),
    scheduledAt: formData.get("scheduledAt"),
    visibility: formData.get("visibility"),
    bestOf: formData.get("bestOf"),
    participants: formData.get("participants"),
  });

  if (!validated.success) {
    return failure(
      "Revisa los campos marcados antes de guardar el torneo.",
      validated.error.flatten().fieldErrors,
    );
  }

  const values = validated.data;
  const participants = parseParticipants(values.participants);
  const duplicates = duplicateNames(participants);
  const scheduledAt = parseScheduledAt(values.scheduledAt);

  if (participants.length < 2) {
    return failure("Añade al menos dos participantes.", {
      participants: ["Añade al menos dos participantes."],
    });
  }

  if (participants.length > 256) {
    return failure("El máximo actual es de 256 participantes.", {
      participants: ["El máximo actual es de 256 participantes."],
    });
  }

  if (duplicates.length > 0) {
    return failure("Hay participantes repetidos.", {
      participants: [`Repetidos: ${duplicates.join(", ")}`],
    });
  }

  if (scheduledAt === undefined) {
    return failure("La fecha prevista no es válida.", {
      scheduledAt: ["Elige una fecha válida o deja el campo vacío."],
    });
  }

  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return failure(
      "Conecta Supabase en .env.local antes de guardar torneos reales.",
    );
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return failure("Inicia sesión para guardar torneos reales en Supabase.");
  }

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
  const slug = uniqueSlug(values.name);
  let tournamentId: string | null = null;

  try {
    const { data: tournament, error: tournamentError } = await supabase
      .from("tournaments")
      .insert({
        owner_id: user.id,
        name: values.name,
        slug,
        category: values.category || null,
        format: "single_elimination",
        status: "draft",
        visibility: values.visibility,
        scheduled_at: scheduledAt,
        max_participants: bracket.size,
        best_of: values.bestOf,
        random_seed: Date.now(),
      })
      .select("id, slug")
      .single<InsertedTournament>();

    if (tournamentError || !tournament) {
      return failure(
        tournamentError?.message ??
          "No se pudo crear el torneo. Revisa las políticas de Supabase.",
      );
    }

    tournamentId = tournament.id;

    const { data: insertedParticipants, error: participantsError } =
      await supabase
        .from("participants")
        .insert(
          participants.map((displayName, index) => {
            const seed = index + 1;
            return {
              tournament_id: tournament.id,
              display_name: displayName,
              seed,
              initial_position: positionBySeed.get(seed) ?? seed,
            };
          }),
        )
        .select("id, seed")
        .returns<InsertedParticipant[]>();

    if (participantsError || !insertedParticipants) {
      await rollbackTournament(supabase, tournamentId);
      return failure(
        participantsError?.message ?? "No se pudieron crear los participantes.",
      );
    }

    const participantIdBySeed = new Map(
      insertedParticipants.map((participant) => [
        participant.seed,
        participant.id,
      ]),
    );
    const seedByEntrantId = new Map(
      bracketEntrants.map((entrant) => [entrant.id, entrant.seed]),
    );

    const { data: insertedRounds, error: roundsError } = await supabase
      .from("rounds")
      .insert(
        Array.from({ length: bracket.rounds }, (_, index) => {
          const roundNumber = index + 1;
          return {
            tournament_id: tournament.id,
            round_number: roundNumber,
            name: roundName(roundNumber, bracket.rounds),
            sequence: roundNumber,
          };
        }),
      )
      .select("id, round_number")
      .returns<InsertedRound[]>();

    if (roundsError || !insertedRounds) {
      await rollbackTournament(supabase, tournamentId);
      return failure(
        roundsError?.message ?? "No se pudieron crear las rondas.",
      );
    }

    const roundIdByNumber = new Map(
      insertedRounds.map((round) => [round.round_number, round.id]),
    );
    const participantIdForSlot = (slot: Slot) => {
      if (!slot.entrantId) return null;
      const seed = seedByEntrantId.get(slot.entrantId);
      return seed ? (participantIdBySeed.get(seed) ?? null) : null;
    };

    const { data: insertedMatches, error: matchesError } = await supabase
      .from("matches")
      .insert(
        bracket.matches.map((match, index) => ({
          tournament_id: tournament.id,
          round_id: roundIdByNumber.get(match.round),
          match_number: index + 1,
          participant_one_id: participantIdForSlot(match.participantOne),
          participant_two_id: participantIdForSlot(match.participantTwo),
          status: "pending",
          best_of: values.bestOf,
        })),
      )
      .select("id, match_number")
      .returns<InsertedMatch[]>();

    if (matchesError || !insertedMatches) {
      await rollbackTournament(supabase, tournamentId);
      return failure(
        matchesError?.message ?? "No se pudieron crear los partidos.",
      );
    }

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

      const { error: nextMatchError } = await supabase
        .from("matches")
        .update({ next_match_for_winner_id: nextId })
        .eq("id", currentId);

      if (nextMatchError) {
        await rollbackTournament(supabase, tournamentId);
        return failure(nextMatchError.message);
      }
    }

    revalidatePath("/dashboard");
    revalidatePath(`/tournaments/${tournament.slug}`);

    return {
      status: "success",
      message: "Torneo guardado. Ya existe como borrador real en Supabase.",
      slug: tournament.slug,
    };
  } catch {
    await rollbackTournament(supabase, tournamentId);
    return failure("No se pudo guardar el torneo. Inténtalo de nuevo.");
  }
}
