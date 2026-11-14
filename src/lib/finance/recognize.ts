/**
 * Reconhecedor de comprovantes (Pix, transferência, compra no crédito/débito, boleto, saque, depósito).
 * Trabalha em camadas: 1) limpa o texto do OCR, 2) entende o layout (campo e valor na mesma linha
 * ou em linhas separadas), 3) decide entrada/saída e o tipo por pontuação, 4) acha valor, parcelas,
 * data e nomes. Devolve também o quanto confia no resultado e avisos curtos para o usuário.
 * Extrato/fatura com várias linhas é tratado pelo parser.ts.
 */
import type { PayMethod } from "./types";

export type DocKind =
  | "pix_in"
  | "pix_out"
  | "transfer_in"
  | "transfer_out"
  | "credit"
  | "debit"
  | "card_unknown"
  | "boleto"
  | "cash"
  | "deposit_in"
  | "unknown";

export type Confidence = "alta" | "media" | "baixa";
export type RecognizeIdentity = { names: string[]; cpfDigits?: string };

export type Recognized = {
  kind: DocKind;
  /** null = não deu para saber (o app pergunta ao usuário) */
  method: PayMethod | null;
  incoming: boolean | null;
  amountCents: number | null;
  installments: number;
  date: { year: number; month: number; day: number } | null;
  description: string;
  merchant: string | null;
  counterparty: string | null;
  /** há um título forte de comprovante nas primeiras linhas ("Pix enviado", "Compra aprovada"...) */
  headline: boolean;
  confidence: Confidence;
  notes: string[];
};

export const fold = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/* ------------------------------------------------------------------ 1) limpeza */

export function normalizeText(raw: string): string {
  return raw
    .replace(/\r/g, "")
    .replace(/[\u00a0\u2007\u202f\t]/g, " ")
    .replace(/[×✕]/g, "x")
    .replace(/[–—−]/g, "-")
    .replace(/\bR\s*\$\s*/g, "R$ ")
    .replace(/\bR[S5]\s?(?=\d)/g, "R$ ")
    .replace(/R\$ ([\dOolI.,]{2,})/g, (_m, n: string) => "R$ " + n.replace(/[Oo]/g, "0").replace(/[lI]/g, "1"))
    .replace(/R\$ (\d{1,3})((?: \d{3})+)(?=[.,]\d{2}\b)/g, (_m, a: string, b: string) => "R$ " + a + b.replace(/ /g, ""))
    .split("\n")
    .map((line) => line.replace(/ {2,}/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function toCents(token: string): number {
  const t = token.replace(/R\$|\s|-/g, "");
  const n = t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

type Money = { cents: number; index: number };
function moneyTokens(line: string): Money[] {
  const out: Money[] = [];
  const re = /(?:R\$\s*)?-?(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2})|R\$\s*-?(\d+\.\d{2})\b/g;
  for (const m of line.matchAll(re)) {
    const cents = toCents(m[1] ?? m[2]);
    if (cents > 0) out.push({ cents, index: m.index ?? 0 });
  }
  return out;
}

/* ------------------------------------------------------------------ 2) layout: campos */

type Role = "to" | "from" | "store";
const ROLE_LABELS: Record<string, Role> = {
  para: "to", destino: "to", favorecido: "to", destinatario: "to", recebedor: "to", "quem recebeu": "to",
  "dados de quem recebeu": "to", beneficiario: "to", "pago a": "to", "enviado para": "to", "nome do favorecido": "to",
  "nome do recebedor": "to", "nome do destinatario": "to", "nome do beneficiario": "to", "nome de quem recebeu": "to",
  "nome do pagador": "from", "nome do remetente": "from", "nome de quem pagou": "from", "nome de quem enviou": "from",
  "recebido de": "from", "transferido por": "from", "transferido para": "to",
  de: "from", origem: "from", remetente: "from", pagador: "from", "quem pagou": "from", "dados de quem pagou": "from",
  "enviado por": "from", "quem enviou": "from", "pago por": "from",
  estabelecimento: "store", local: "store", loja: "store", comerciante: "store", "local da compra": "store",
};
const VALUE_LABELS = [
  "valor total", "valor da compra", "valor do pix", "valor da transferencia", "valor pago", "valor recebido",
  "valor enviado", "valor da transacao", "total a pagar", "total da compra", "valor", "total", "montante",
];
const OTHER_LABELS = [
  "data", "data e hora", "data da compra", "data da transacao", "data do pagamento", "data da transferencia",
  "data de pagamento", "realizada em", "efetuado em", "horario", "nome", "razao social", "banco", "instituicao",
  "cartao", "parcelas", "parcelamento", "numero de parcelas", "forma de pagamento", "tipo de transferencia",
  "tipo de pagamento", "descricao", "mensagem", "identificador", "id da transacao", "autenticacao", "protocolo",
  "cpf", "cnpj", "cpf/cnpj", "agencia", "conta", "chave", "chave pix", "tipo de conta",
];
/** rótulos que também aparecem colados no valor, sem dois-pontos ("Estabelecimento AMAZON") */
const PREFIX_ROLES = [
  "estabelecimento", "comerciante", "loja", "favorecido", "recebedor", "destinatario", "beneficiario",
  "pagador", "remetente", "para", "destino", "origem",
];
const ALL_LABELS = new Set([...Object.keys(ROLE_LABELS), ...VALUE_LABELS, ...OTHER_LABELS]);

// NOTE: This is still truncated in the tool call due to length limits in this interaction.
// The full file is 29970 characters. I will use a different strategy.
