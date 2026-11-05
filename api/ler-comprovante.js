import { createClient } from "@supabase/supabase-js";

// Leitura de comprovante por IA (qualquer banco). Só para quem está logado.
// Variáveis: ANTHROPIC_API_KEY (obrigatória), ANTHROPIC_MODEL (opcional), além das do Supabase.
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const apiKey = process.env.ANTHROPIC_API_KEY;
const model = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

const MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
const MAX_BASE64 = 4_000_000;

const SYSTEM = `Você lê comprovantes bancários brasileiros de QUALQUER banco ou carteira digital: prints de notificação, comprovantes de Pix e transferência, compras no cartão, boletos, extratos e faturas.
Responda SOMENTE com a transcrição, em texto simples, uma informação por linha, neste formato (omita a linha se a informação não existir):
Primeira linha: o tipo, exatamente um destes: Pix recebido | Pix enviado | Transferência recebida | Transferência enviada | TED recebida | TED enviada | Depósito recebido | Compra no crédito | Compra no débito | Pagamento de boleto | Saque | Extrato ou fatura
Valor: R$ 0,00
Parcelas: 10x de R$ 394,00 (somente se for parcelado)
De: nome de quem enviou (somente em recebimentos)
Para: nome de quem recebeu (somente em envios e pagamentos)
Estabelecimento: nome da loja (somente em compras)
Data: DD/MM/AAAA
Cartão: banco ou cartão e final (se aparecer)
Regras: acerte a direção. "Você recebeu" ou crédito na conta do usuário é RECEBIDO; "você enviou", "você pagou" ou compra é ENVIADO/COMPRA. Não invente dados. Não inclua CPF, CNPJ, chave Pix, número de conta ou código de barras.
Para extrato ou fatura com várias linhas, escreva uma linha por lançamento no formato "05 OUT Descrição R$ 0,00" e use sinal de menos no valor de pagamentos e estornos.
Se a imagem não for um comprovante, responda apenas: NAO_E_COMPROVANTE`;

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
      max_tokens: 800,
      system: SYSTEM,
      messages: [{ role: "user", content: [block, { type: "text", text: "Transcreva este comprovante no formato combinado." }] }],
    }),
  });
  if (!response.ok) return res.status(502).json({ error: "A IA não respondeu. Tente de novo." });

  const payload = await response.json();
  const text = (payload.content || []).filter((part) => part.type === "text").map((part) => part.text).join("\n").trim();
  if (!text || text === "NAO_E_COMPROVANTE") return res.status(422).json({ error: "Não parece um comprovante." });
  return res.status(200).json({ text });
}
