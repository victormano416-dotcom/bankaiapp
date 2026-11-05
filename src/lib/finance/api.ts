import { supabase } from "@/supabase";
import { addMonths } from "./period";
import { applyMutation, normalize } from "./logic";
import type { Bundle } from "./types";
import { sanitizeMutation, type Mutation } from "./validate";

/**
 * Dados do BANKAI no Supabase: o caixa de cada pessoa fica na tabela `dados`
 * (uma linha por usuário, protegida por RLS: cada um só enxerga o que é seu).
 */

function fail(error: { code?: string; message: string }): never {
  if (error.code === "42P01" || /does not exist|schema cache/i.test(error.message)) {
    throw new Error("O banco ainda não foi criado. Rode o arquivo supabase/schema.sql no SQL Editor do Supabase.");
  }
  throw new Error(error.message);
}

async function userId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error("Sessão expirada. Entre de novo.");
  return id;
}

async function read(uid: string): Promise<Bundle> {
  const { data, error } = await supabase.from("dados").select("json").eq("user_id", uid).maybeSingle();
  if (error) fail(error);
  return normalize(data?.json);
}

async function write(uid: string, bundle: Bundle): Promise<void> {
  const { error } = await supabase
    .from("dados")
    .upsert({ user_id: uid, json: bundle, atualizado_em: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) fail(error);
}

export async function loadFinance(): Promise<Bundle> {
  return read(await userId());
}

export async function mutateFinance({ data }: { data: Mutation }): Promise<Bundle> {
  const mutation = sanitizeMutation(data);
  const uid = await userId();
  const next = applyMutation(await read(uid), mutation);
  await write(uid, next);
  return next;
}

export function shiftMonth(year: number, month: number, delta: number) {
  return addMonths({ year, month }, delta);
}
