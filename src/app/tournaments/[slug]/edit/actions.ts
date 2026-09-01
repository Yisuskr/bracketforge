"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  bracketSizeForParticipantCount,
  clearTournamentBracket,
  duplicateNames,
  insertSingleEliminationBracket,
  parseParticipants,
  parseScheduledAt,
} from "@/app/tournaments/_lib/bracket-storage";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<
  ReturnType<typeof createSupabaseServerClient>
>;

type FieldName =
  | "name"
  | "category"
  | "scheduledAt"
  | "visibility"
  | "bestOf"
  | "participants";

type DraftTournamentRow = {
  id: string;
  owner_id: string;
  slug: string;
  status: string;
  version: number;
};

export type EditTournamentState = {
  status: "idle" | "error" | "success";
  message: string;
  fieldErrors?: Partial<Record<FieldName, string[]>>;
};

const editTournamentSchema = z.object({
  slug: z.string().trim().min(1),
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

const deleteTournamentSchema = z.object({
  slug: z.string().trim().min(1),
});

function failure(
  message: string,
  fieldErrors?: EditTournamentState["fieldErrors"],
): EditTournamentState {
  return { status: "error", message, fieldErrors };
}

async function getOwnedDraftTournament(
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
    .single<DraftTournamentRow>();

  if (!tournament || tournament.owner_id !== user.id) return null;

  return tournament;
}

export async function updateDraftTournament(
  _previousState: EditTournamentState,
  formData: FormData,
): Promise<EditTournamentState> {
  const validated = editTournamentSchema.safeParse({
    slug: formData.get("slug"),
    name: formData.get("name"),
    category: formData.get("category"),
    scheduledAt: formData.get("scheduledAt"),
    visibility: formData.get("visibility"),
    bestOf: formData.get("bestOf"),
    participants: formData.get("participants"),
  });

  if (!validated.success) {
    return failure(
      "Revisa los campos marcados antes de guardar los cambios.",
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

  let supabase: SupabaseServerClient;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return failure("Conecta Supabase en .env.local antes de editar torneos.");
  }

  const tournament = await getOwnedDraftTournament(supabase, values.slug);

  if (!tournament) {
    return failure("No encontré ese draft o no tienes permiso para editarlo.");
  }

  if (tournament.status !== "draft") {
    return failure("Solo puedes editar torneos mientras están en borrador.");
  }

  try {
    await clearTournamentBracket(supabase, tournament.id);
    await insertSingleEliminationBracket({
      bestOf: values.bestOf,
      participants,
      supabase,
      tournamentId: tournament.id,
    });

    const { error: updateError } = await supabase
      .from("tournaments")
      .update({
        name: values.name,
        category: values.category || null,
        visibility: values.visibility,
        scheduled_at: scheduledAt,
        max_participants: bracketSizeForParticipantCount(participants.length),
        best_of: values.bestOf,
        random_seed: Date.now(),
        updated_at: new Date().toISOString(),
        version: tournament.version + 1,
      })
      .eq("id", tournament.id);

    if (updateError) return failure(updateError.message);
  } catch (error) {
    return failure(
      error instanceof Error
        ? error.message
        : "No se pudo actualizar el draft. Inténtalo de nuevo.",
    );
  }

  revalidatePath("/dashboard");
  revalidatePath(`/tournaments/${tournament.slug}`);
  revalidatePath(`/tournaments/${tournament.slug}/edit`);

  return {
    status: "success",
    message: "Draft actualizado. El bracket se reconstruyó con estos datos.",
  };
}

export async function deleteDraftTournament(formData: FormData) {
  const validated = deleteTournamentSchema.safeParse({
    slug: formData.get("slug"),
  });

  if (!validated.success) return;

  const supabase = await createSupabaseServerClient();
  const tournament = await getOwnedDraftTournament(
    supabase,
    validated.data.slug,
  );

  if (!tournament || tournament.status !== "draft") return;

  await clearTournamentBracket(supabase, tournament.id);
  await supabase.from("tournaments").delete().eq("id", tournament.id);

  revalidatePath("/dashboard");
  redirect("/dashboard");
}
