import { createClient } from "@supabase/supabase-js";

// Leitura estruturada de comprovante (crédito, débito, Pix, entrada, parcelas).
// Env: ANTHROPIC_API_KEY (obrigatória), ANTHROPIC_MODEL (opcional), SUPABASE/VITE_SUPABASE_*.
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const apiKey = process.env.ANTHROPIC_API_KEY;
const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";

const MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
const MAX_BASE64 = 4_000_000;

const SYSTEM = `Você é um extrator de comprovantes bancários brasileiros (Nubank, Inter, C6, Bradesco, Itaú, Santander, BB, Caixa, PicPay, Mercado Pago, etc.).

Responda APENAS com um JSON válido, sem markdown, neste schema:
{
  "method": "entrada" | "credito" | "debito" | "pix" | "dinheiro" | null,
  "totalCents": number,
  "installments": number,
  "currentInstallment": number | null,
  "description": string,
  "merchant": string | null,
  "category": string,
  "year": number | null,
  "month": number | null,
  "day": number | null,
  "cardHint": string | null,
  "rawText": string
}

Regras de method (prioridade nesta ordem):
1. "entrada" — Pix/TED/DOC/transferência RECEBIDA, depósito, salário, “você recebeu”, crédito na conta.
2. "credito" — compra no cartão de CRÉDITO, fatura, “compra aprovada” no crédito, parcelado no cartão.
3. "debito" — compra no DÉBITO, “no débito”.
4. "pix" — Pix/TED/DOC ENVIADO (você pagou/enviou), não é compra no cartão.
5. "dinheiro" — dinheiro/espécie.
6. null — ambíguo.

Parcelas:
- installments = total de parcelas (1 se à vista).
- currentInstallment = número da parcela atual se aparecer (ex.: “parcela 3/8” → 3). Senão null.
- Exemplos: “8x de R$ 50,00”, “parcelado em 8x”, “3/8”, “parcela 3 de 8”.

Valor:
- totalCents em centavos do valor TOTAL da compra (se 8x de R$ 50, totalCents=40000).
- Se só aparecer o valor da parcela e o total de parcelas, multiplique.

Descrição: curta e útil (estabelecimento ou “Pix de Maria”). Sem CPF, CNPJ, chave Pix, conta.
category: uma de Outros, Moradia, Mercado, Transporte, Saúde, Assinaturas, Educação, Restaurante, Roupas, Lazer.
rawText: transcrição curta das linhas principais (máx ~500 chars).
Se a imagem não for comprovante: {"method":null,"totalCents":0,"installments":1,"currentInstallment":null,"description":"","merchant":null,"category":"Outros","year":null,"month":null,"day":null,"cardHint":null,"rawText":"NAO_E_COMPROVANTE"}`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!apiKey) return res.status(503).json({ error: "Leitura por IA não configurada." });
  if (!supabaseUrl || !supabaseAnonKey) return res.status(503).json({ error: "Servidor não configurado." });

  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  const { data: userData, error: userError } = await createClient(supabaseUrl, supabaseAnonKey).auth.getUser(token);
  if (userError || !userData?.user) return res.status(401).json({ error: "Invalid token" });

  const { mime, data } = req.body || {};
  if (!MIMES.includes(mime) || typeof data !== "string" || !data || data.length > MAX_BASE64) {
    return res.status(400).json({ error: "Arquivo inválido ou grande demais." });
  }

  const block =
    mime === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: mime, data } }
      : { type: "image", source: { type: "base64", media_type: mime, data } };

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      system: SYSTEM,
      messages: [{ role: "user", content: [block, { type: "text", text: "Extraia o comprovante no JSON combinado." }] }],
    }),
  });
  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    console.error("anthropic error", response.status, errBody.slice(0, 300));
    return res.status(502).json({ error: "A IA não respondeu. Tente de novo." });
  }

  const payload = await response.json();
  const text = (payload.content || []).filter((p) => p.type === "text").map((p) => p.text).join("\n").trim();
  if (!text) return res.status(422).json({ error: "Resposta vazia." });

  let parsed;
  try {
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return res.status(200).json({ text, structured: null });
  }

  if (parsed.rawText === "NAO_E_COMPROVANTE" || parsed.totalCents === 0) {
    return res.status(422).json({ error: "Não parece um comprovante." });
  }

  const lines = [];
  if (parsed.method === "entrada") lines.push("Pix recebido");
  else if (parsed.method === "credito") lines.push("Compra no crédito");
  else if (parsed.method === "debito") lines.push("Compra no débito");
  else if (parsed.method === "pix") lines.push("Pix enviado");
  if (parsed.totalCents) lines.push(`Valor: R$ ${(parsed.totalCents / 100).toFixed(2).replace(".", ",")}`);
  if (parsed.installments > 1) {
    const each = Math.round(parsed.totalCents / parsed.installments);
    lines.push(
      parsed.currentInstallment
        ? `Parcela: ${parsed.currentInstallment}/${parsed.installments}`
        : `Parcelas: ${parsed.installments}x de R$ ${(each / 100).toFixed(2).replace(".", ",")}`,
    );
  }
  if (parsed.merchant) lines.push(`Estabelecimento: ${parsed.merchant}`);
  if (parsed.description) lines.push(parsed.description);
  if (parsed.year && parsed.month && parsed.day) {
    lines.push(`Data: ${String(parsed.day).padStart(2, "0")}/${String(parsed.month).padStart(2, "0")}/${parsed.year}`);
  }
  if (parsed.cardHint) lines.push(`Cartão: ${parsed.cardHint}`);

  return res.status(200).json({ text: lines.join("\n"), structured: parsed });
}
