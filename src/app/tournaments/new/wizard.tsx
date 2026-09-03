"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import {
  createTournament,
  type CreateTournamentState,
} from "@/app/tournaments/new/actions";
import { createSingleEliminationBracket } from "@/domain/bracket/single-elimination";

const initialState: CreateTournamentState = {
  status: "idle",
  message: "",
};

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return <small className="field-error">{messages[0]}</small>;
}

export function TournamentWizard() {
  const [names, setNames] = useState("");
  const [state, formAction, pending] = useActionState(
    createTournament,
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
    <form className="wizard" action={formAction}>
      <ol className="steps">
        <li className="active">
          1 <span>Detalles</span>
        </li>
        <li className="active">
          2 <span>Participantes</span>
        </li>
        <li className="active">
          3 <span>Formato</span>
        </li>
        <li>
          4 <span>Revisar</span>
        </li>
      </ol>
      <div className="form-grid">
        <label>
          Nombre del torneo
          <input
            name="name"
            required
            maxLength={120}
            placeholder="Copa de la comunidad"
          />
          <FieldError messages={state.fieldErrors?.name} />
        </label>
        <label>
          Categoria
          <input
            name="category"
            maxLength={80}
            placeholder="Juego, deporte o actividad"
          />
          <FieldError messages={state.fieldErrors?.category} />
        </label>
        <label>
          Fecha prevista
          <input name="scheduledAt" type="datetime-local" />
          <FieldError messages={state.fieldErrors?.scheduledAt} />
        </label>
        <label>
          Visibilidad
          <select name="visibility" defaultValue="unlisted">
            <option value="public">Publico</option>
            <option value="unlisted">No listado</option>
            <option value="private">Privado</option>
          </select>
          <FieldError messages={state.fieldErrors?.visibility} />
        </label>
        <label>
          Formato de partida
          <select name="bestOf" defaultValue="3">
            <option value="1">Mejor de 1</option>
            <option value="3">Mejor de 3</option>
            <option value="5">Mejor de 5</option>
            <option value="7">Mejor de 7</option>
          </select>
          <FieldError messages={state.fieldErrors?.bestOf} />
        </label>
        <label className="full">
          Participantes
          <small>Uno por linea o separados por comas.</small>
          <textarea
            name="participants"
            placeholder={"Esteban\nMario\nAngel\nManu"}
            value={names}
            onChange={(event) => setNames(event.target.value)}
            rows={6}
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
      <button className="button large" disabled={parsed.length < 2 || pending}>
        {pending ? "Guardando..." : "Guardar draft"}
      </button>
      {state.message ? (
        <div className={`form-state is-${state.status}`} aria-live="polite">
          <p>{state.message}</p>
          {state.slug ? (
            <Link href={`/tournaments/${state.slug}`}>Abrir torneo</Link>
          ) : null}
        </div>
      ) : (
        <p className="form-note">
          Se guardará como borrador. Podrás revisarlo, editar seeds y abrirlo
          desde tu panel.
        </p>
      )}
    </form>
  );
}
