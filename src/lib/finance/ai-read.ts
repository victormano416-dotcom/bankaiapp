import { supabase } from "@/supabase";

/** Lê o comprovante pela IA (servidor). Devolve null quando indisponível — o app cai para o OCR do navegador. */

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

export async function readReceiptWithAI(file: File): Promise<string | null> {
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
    const json = (await response.json()) as { text?: unknown };
    return typeof json.text === "string" && json.text.trim() ? json.text : null;
  } catch {
    return null;
  }
}
