import { supabase } from "@/supabase";
import type { PayMethod } from "./types";

/** Resultado estruturado da IA de comprovante. */
export type AiReceipt = {
  method: PayMethod | null;
  totalCents: number;
  installments: number;
  currentInstallment: number | null;
  description: string;
  merchant: string | null;
  category: string;
  year: number | null;
  month: number | null;
  day: number | null;
  cardHint: string | null;
  rawText: string;
};

const toBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

async function prepare(file: File): Promise<{ mime: string; data: string } | null> {
  if (file.type === "application/pdf") {
    return file.size > 2_500_000 ? null : { mime: file.type, data: await toBase64(file) };
  }
  if (!file.type.startsWith("image/")) return null;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  return blob ? { mime: "image/jpeg", data: await toBase64(blob) } : null;
}

function normalizeStructured(raw: unknown): AiReceipt | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const totalCents = Number(o.totalCents);
  if (!Number.isFinite(totalCents) || totalCents <= 0) return null;
  const methods = new Set(["entrada", "credito", "debito", "pix", "dinheiro"]);
  const method =
    typeof o.method === "string" && methods.has(o.method) ? (o.method as PayMethod) : null;
  const installments = Math.max(1, Math.min(48, Number(o.installments) || 1));
  let currentInstallment: number | null =
    o.currentInstallment == null || o.currentInstallment === ""
      ? null
      : Number(o.currentInstallment);
  if (
    currentInstallment != null &&
    (!Number.isFinite(currentInstallment) ||
      currentInstallment < 1 ||
      currentInstallment > installments)
  ) {
    currentInstallment = null;
  }
  return {
    method,
    totalCents: Math.round(totalCents),
    installments,
    currentInstallment,
    description: String(o.description || "").slice(0, 160),
    merchant: o.merchant ? String(o.merchant).slice(0, 120) : null,
    category: String(o.category || "Outros").slice(0, 40),
    year: o.year != null ? Number(o.year) : null,
    month: o.month != null ? Number(o.month) : null,
    day: o.day != null ? Number(o.day) : null,
    cardHint: o.cardHint ? String(o.cardHint).slice(0, 80) : null,
    rawText: String(o.rawText || "").slice(0, 800),
  };
}

export type AiReadResult = {
  text: string;
  structured: AiReceipt | null;
};

/** Lê o comprovante pela IA (servidor). Devolve null quando indisponível. */
export async function readReceiptWithAI(file: File): Promise<AiReadResult | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const payload = await prepare(file);
    if (!token || !payload) return null;
    const response = await fetch("/api/ler-comprovante", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    if (!response.ok) return null;
    const json = (await response.json()) as { text?: unknown; structured?: unknown };
    const text = typeof json.text === "string" ? json.text.trim() : "";
    const structured = normalizeStructured(json.structured);
    if (!structured && !text) return null;
    return { text, structured };
  } catch {
    return null;
  }
}
