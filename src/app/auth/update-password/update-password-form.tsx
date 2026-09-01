"use client";

import Link from "next/link";
import { useActionState } from "react";
import { updatePassword, type AuthState } from "@/app/auth/actions";

const initialState: AuthState = {
  status: "idle",
  message: "",
};

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return <small className="field-error">{messages[0]}</small>;
}

export function UpdatePasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, initialState);

  return (
    <form className="auth-panel" action={action}>
      <div>
        <p className="eyebrow">Nueva contraseña</p>
        <h2>Recupera tu cuenta</h2>
      </div>
      <label>
        Contraseña
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
        />
        <FieldError messages={state.fieldErrors?.password} />
      </label>
      <label>
        Confirmar contraseña
        <input
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
        />
        <FieldError messages={state.fieldErrors?.confirmPassword} />
      </label>
      <button className="button large" disabled={pending}>
        {pending ? "Actualizando..." : "Actualizar contraseña"}
      </button>
      {state.message ? (
        <div className={`form-state is-${state.status}`}>
          <p>{state.message}</p>
          {state.status === "success" ? (
            <Link href="/dashboard">Ir al panel</Link>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
