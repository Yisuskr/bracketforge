"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import {
  deleteDraftTournament,
  updateDraftTournament,
  type EditTournamentState,
} from "@/app/tournaments/[slug]/edit/actions";
import { createSingleEliminationBracket } from "@/domain/bracket/single-elimination";

const initialState: EditTournamentState = {
  status: "idle",
  message: "",
};

type EditTournamentFormProps = {
  initialValues: {
    bestOf: number;
    category: string;
    name: string;
    participants: string;
    scheduledAt: string;
    slug: string;
    visibility: string;
  };
};

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return <small className="field-error">{messages[0]}</small>;
}

export function EditTournamentForm({ initialValues }: EditTournamentFormProps) {
  const [names, setNames] = useState(initialValues.participants);
  const [state, formAction, pending] = useActionState(
    updateDraftTournament,
    initialState,
  );
  const parsed = useMemo(
    () =>
      names
        .split(/[\n,]/)
        .map((name) => name.trim())
        .filter(Boolean),
    [names],
  );
  const bracket =
    parsed.length >= 2
      ? createSingleEliminationBracket(
          parsed.map((name, index) => ({
            id: `draft-${index}`,
            name,
            seed: index + 1,
          })),
        )
      : null;

  return (
    <div className="edit-layout">
      <form className="wizard" action={formAction}>
        <input name="slug" type="hidden" value={initialValues.slug} />
        <div className="form-grid">
          <label>
            Nombre del torneo
            <input
              defaultValue={initialValues.name}
              maxLength={120}
              name="name"
              required
            />
            <FieldError messages={state.fieldErrors?.name} />
          </label>
          <label>
            Categoría
            <input
              defaultValue={initialValues.category}
              maxLength={80}
              name="category"
              placeholder="Juego, deporte o actividad"
            />
            <FieldError messages={state.fieldErrors?.category} />
          </label>
          <label>
            Fecha prevista
            <input
              defaultValue={initialValues.scheduledAt}
              name="scheduledAt"
              type="datetime-local"
            />
            <FieldError messages={state.fieldErrors?.scheduledAt} />
          </label>
          <label>
            Visibilidad
            <select name="visibility" defaultValue={initialValues.visibility}>
              <option value="public">Público</option>
              <option value="unlisted">No listado</option>
              <option value="private">Privado</option>
            </select>
            <FieldError messages={state.fieldErrors?.visibility} />
          </label>
          <label>
            Formato de partida
            <select name="bestOf" defaultValue={initialValues.bestOf}>
              <option value="1">Mejor de 1</option>
              <option value="3">Mejor de 3</option>
              <option value="5">Mejor de 5</option>
              <option value="7">Mejor de 7</option>
              <option value="9">Mejor de 9</option>
            </select>
            <FieldError messages={state.fieldErrors?.bestOf} />
          </label>
          <label className="full">
            Participantes y seeds
            <small>
              Uno por línea. El orden define los seeds: primera línea = seed 1.
            </small>
            <textarea
              name="participants"
              onChange={(event) => setNames(event.target.value)}
              rows={8}
              value={names}
            />
            <FieldError messages={state.fieldErrors?.participants} />
          </label>
        </div>

        <div className="summary">
          <div>
            <strong>{parsed.length}</strong>
            <span>participantes</span>
          </div>
          <div>
            <strong>{bracket?.rounds ?? 0}</strong>
            <span>rondas</span>
          </div>
          <div>
            <strong>{bracket?.matches.length ?? 0}</strong>
            <span>partidos</span>
          </div>
        </div>

        <div className="form-actions">
          <button
            className="button large"
            disabled={parsed.length < 2 || pending}
          >
            {pending ? "Guardando..." : "Guardar cambios"}
          </button>
          <Link
            className="button ghost large"
            href={`/tournaments/${initialValues.slug}`}
          >
            Volver al torneo
          </Link>
        </div>

        {state.message ? (
          <div className={`form-state is-${state.status}`} aria-live="polite">
            <p>{state.message}</p>
            {state.status === "success" ? (
              <Link href={`/tournaments/${initialValues.slug}`}>
                Ver torneo
              </Link>
            ) : null}
          </div>
        ) : (
          <p className="form-note">
            Los cambios reconstruyen el bracket completo mientras siga en
            borrador.
          </p>
        )}
      </form>

      <section className="danger-zone">
        <div>
          <p className="eyebrow">Zona sensible</p>
          <h2>Borrar este draft</h2>
          <p>
            Elimina el torneo y todos sus participantes, rondas y partidos. Esta
            acción solo está disponible antes de iniciar la competición.
          </p>
        </div>
        <form action={deleteDraftTournament}>
          <input name="slug" type="hidden" value={initialValues.slug} />
          <button className="button danger" type="submit">
            Borrar torneo
          </button>
        </form>
      </section>
    </div>
  );
}
