"use client";

import { useActionState } from "react";
import {
  requestPasswordReset,
  signIn,
  signUp,
  type AuthState,
} from "@/app/auth/actions";

const initialState: AuthState = {
  status: "idle",
  message: "",
};

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return <small className="field-error">{messages[0]}</small>;
}

export function AuthForm() {
  const [signInState, signInAction, signInPending] = useActionState(
    signIn,
    initialState,
  );
  const [signUpState, signUpAction, signUpPending] = useActionState(
    signUp,
    initialState,
  );
  const [resetState, resetAction, resetPending] = useActionState(
    requestPasswordReset,
    initialState,
  );

  return (
    <div className="auth-grid">
      <form className="auth-panel" action={signInAction}>
        <div>
          <p className="eyebrow">Entrar</p>
          <h2>Continúa tu torneo</h2>
        </div>
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
          <FieldError messages={signInState.fieldErrors?.email} />
        </label>
        <label>
          Contraseña
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          <FieldError messages={signInState.fieldErrors?.password} />
        </label>
        <button className="button large" disabled={signInPending}>
          {signInPending ? "Entrando..." : "Entrar"}
        </button>
        {signInState.message ? (
          <div className={`form-state is-${signInState.status}`}>
            <p>{signInState.message}</p>
          </div>
        ) : null}
      </form>

      <form className="auth-panel compact" action={resetAction}>
        <div>
          <p className="eyebrow">Recuperar acceso</p>
          <h2>Cambia tu contraseña</h2>
        </div>
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
          <FieldError messages={resetState.fieldErrors?.email} />
        </label>
        <button className="button ghost" disabled={resetPending}>
          {resetPending ? "Enviando..." : "Enviar enlace"}
        </button>
        {resetState.message ? (
          <div className={`form-state is-${resetState.status}`}>
            <p>{resetState.message}</p>
          </div>
        ) : null}
      </form>

      <form className="auth-panel" action={signUpAction}>
        <div>
          <p className="eyebrow">Crear cuenta</p>
          <h2>Guarda brackets reales</h2>
        </div>
        <label>
          Nombre público
          <input name="displayName" type="text" autoComplete="name" required />
          <FieldError messages={signUpState.fieldErrors?.displayName} />
        </label>
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
          <FieldError messages={signUpState.fieldErrors?.email} />
        </label>
        <label>
          Contraseña
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            required
          />
          <FieldError messages={signUpState.fieldErrors?.password} />
        </label>
        <button className="button large" disabled={signUpPending}>
          {signUpPending ? "Creando..." : "Crear cuenta"}
        </button>
        {signUpState.message ? (
          <div className={`form-state is-${signUpState.status}`}>
            <p>{signUpState.message}</p>
          </div>
        ) : null}
      </form>
    </div>
  );
}
