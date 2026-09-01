"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type AuthField = "displayName" | "email" | "password" | "confirmPassword";

export type AuthState = {
  status: "idle" | "error" | "success";
  message: string;
  fieldErrors?: Partial<Record<AuthField, string[]>>;
};

const emailSchema = z
  .string()
  .trim()
  .email("Escribe un email válido.")
  .max(254, "Ese email es demasiado largo.");

const passwordSchema = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres.")
  .max(72, "La contraseña no puede pasar de 72 caracteres.");

const signInSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

const signUpSchema = signInSchema.extend({
  displayName: z
    .string()
    .trim()
    .min(2, "Pon un nombre público con al menos 2 caracteres.")
    .max(80, "El nombre público no puede pasar de 80 caracteres."),
});

const resetPasswordSchema = z.object({
  email: emailSchema,
});

const updatePasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: passwordSchema,
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Las contraseñas no coinciden.",
    path: ["confirmPassword"],
  });

function failure(
  message: string,
  fieldErrors?: AuthState["fieldErrors"],
): AuthState {
  return { status: "error", message, fieldErrors };
}

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

export async function signIn(
  _previousState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const validated = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!validated.success) {
    return failure(
      "Revisa el email y la contraseña.",
      validated.error.flatten().fieldErrors,
    );
  }

  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return failure("Conecta Supabase en .env.local antes de iniciar sesión.");
  }

  const { error } = await supabase.auth.signInWithPassword(validated.data);

  if (error) {
    return failure("No se pudo iniciar sesión con esos datos.");
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signUp(
  _previousState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const validated = signUpSchema.safeParse({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!validated.success) {
    return failure(
      "Revisa los datos de la cuenta.",
      validated.error.flatten().fieldErrors,
    );
  }

  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return failure("Conecta Supabase en .env.local antes de crear cuentas.");
  }

  const { displayName, email, password } = validated.data;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
      emailRedirectTo: `${siteUrl()}/auth/callback?next=/dashboard`,
    },
  });

  if (error) {
    return failure(error.message);
  }

  if (!data.session) {
    return {
      status: "success",
      message:
        "Cuenta creada. Revisa tu email para confirmar la sesión antes de entrar.",
    };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function requestPasswordReset(
  _previousState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const validated = resetPasswordSchema.safeParse({
    email: formData.get("email"),
  });

  if (!validated.success) {
    return failure(
      "Escribe el email de tu cuenta.",
      validated.error.flatten().fieldErrors,
    );
  }

  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return failure("Conecta Supabase en .env.local antes de recuperar acceso.");
  }

  const { error } = await supabase.auth.resetPasswordForEmail(
    validated.data.email,
    {
      redirectTo: `${siteUrl()}/auth/callback?next=/auth/update-password`,
    },
  );

  if (error) {
    return failure(error.message);
  }

  return {
    status: "success",
    message: "Te enviamos un enlace para cambiar la contraseña.",
  };
}

export async function updatePassword(
  _previousState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const validated = updatePasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!validated.success) {
    return failure(
      "Revisa la nueva contraseña.",
      validated.error.flatten().fieldErrors,
    );
  }

  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return failure(
      "Conecta Supabase en .env.local antes de cambiar contraseña.",
    );
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return failure("Abre esta pantalla desde el enlace de recuperación.");
  }

  const { error } = await supabase.auth.updateUser({
    password: validated.data.password,
  });

  if (error) {
    return failure(error.message);
  }

  revalidatePath("/", "layout");

  return {
    status: "success",
    message: "Contraseña actualizada. Ya puedes seguir usando tu cuenta.",
  };
}

export async function signOut() {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } catch {
    // If Supabase is not configured, the local session cannot exist here.
  }

  revalidatePath("/", "layout");
  redirect("/");
}
