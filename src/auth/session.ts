import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase, supabaseReady } from "@/supabase";

export type AppUser = { id: string; email: string; displayName: string };

export type SessionState =
  | { status: "loading" }
  | { status: "out" }
  | { status: "recovery" }
  | { status: "in"; user: AppUser };

function toUser(user: User): AppUser {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const email = user.email ?? "";
  const named = String(meta.full_name ?? meta.name ?? "").trim();
  return { id: user.id, email, displayName: named || email.split("@")[0] || "Você" };
}

/** Acompanha o login do Supabase: carregando, deslogado, trocando a senha ou logado. */
export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({ status: supabaseReady ? "loading" : "out" });

  useEffect(() => {
    if (!supabaseReady) return;
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setState((prev) =>
        prev.status === "recovery" ? prev : data.session?.user ? { status: "in", user: toUser(data.session.user) } : { status: "out" },
      );
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") setState({ status: "recovery" });
      else if (session?.user) setState({ status: "in", user: toUser(session.user) });
      else setState({ status: "out" });
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return state;
}

export const signOut = () => supabase.auth.signOut();
