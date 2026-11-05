import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** false quando as variáveis do Supabase não foram configuradas (o app mostra um aviso). */
export const supabaseReady = Boolean(url && anonKey);

export const supabase = createClient(url || "http://localhost:54321", anonKey || "sem-chave", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
