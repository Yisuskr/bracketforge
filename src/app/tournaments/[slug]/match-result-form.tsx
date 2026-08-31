"use client";

import { useActionState } from "react";
import {
  recordMatchResult,
  type MatchResultState,
} from "@/app/tournaments/[slug]/actions";

const initialState: MatchResultState = {
  status: "idle",
  message: "",
};

type MatchResultFormProps = {
  matchId: string;
  bestOf: number;
  participantOneName: string;
  participantTwoName: string;
  participantOneScore: number | null;
  participantTwoScore: number | null;
  disabled?: boolean;
  disabledReason?: string;
};

export function MatchResultForm({
  matchId,
  bestOf,
  participantOneName,
  participantTwoName,
  participantOneScore,
  participantTwoScore,
  disabled,
  disabledReason,
}: MatchResultFormProps) {
  const [state, action, pending] = useActionState(
    recordMatchResult,
    initialState,
  );
  const winsToTakeMatch = Math.floor(bestOf / 2) + 1;

  return (
    <form className="match-result-form" action={action}>
      <input name="matchId" type="hidden" value={matchId} />
      <div className="score-grid">
        <label>
          <span>{participantOneName}</span>
          <input
            defaultValue={participantOneScore ?? ""}
            disabled={disabled || pending}
            inputMode="numeric"
            max={winsToTakeMatch}
            min={0}
            name="participantOneScore"
            placeholder="0"
            required
            type="number"
          />
        </label>
        <label>
          <span>{participantTwoName}</span>
          <input
            defaultValue={participantTwoScore ?? ""}
            disabled={disabled || pending}
            inputMode="numeric"
            max={winsToTakeMatch}
            min={0}
            name="participantTwoScore"
            placeholder="0"
            required
            type="number"
          />
        </label>
      </div>
      <button className="button" disabled={disabled || pending}>
        {pending ? "Guardando..." : `Guardar BO${bestOf}`}
      </button>
      {disabled && disabledReason ? (
        <small className="form-note">{disabledReason}</small>
      ) : null}
      {state.message ? (
        <small className={`result-message is-${state.status}`}>
          {state.message}
        </small>
      ) : null}
    </form>
  );
}
