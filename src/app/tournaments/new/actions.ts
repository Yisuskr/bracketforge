"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  bracketSizeForParticipantCount,
  duplicateNames,
  insertSingleEliminationBracket,
  parseParticipants,
  parseScheduledAt,
  uniqueSlug,
} from "@/app/tournaments/_lib/bracket-storage";
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

  const bracketSize = bracketSizeForParticipantCount(participants.length);
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
        max_participants: bracketSize,
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

    await insertSingleEliminationBracket({
      bestOf: values.bestOf,
      participants,
      supabase,
      tournamentId: tournament.id,
    });

    revalidatePath("/dashboard");
    revalidatePath(`/tournaments/${tournament.slug}`);

    return {
      status: "success",
      message: "Torneo guardado. Ya existe como borrador real en Supabase.",
      slug: tournament.slug,
    };
  } catch (error) {
    await rollbackTournament(supabase, tournamentId);
    return failure(
      error instanceof Error
        ? error.message
        : "No se pudo guardar el torneo. Inténtalo de nuevo.",
    );
  }
}
