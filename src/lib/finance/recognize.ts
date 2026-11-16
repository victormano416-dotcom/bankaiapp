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

type Person = { role: Role; name: string };

const BANK_WORDS =
  /\b(nubank|nu pagamentos|inter|itau|bradesco|santander|caixa economica|banco do brasil|c6 bank|picpay|pagbank|pagseguro|mercado pago|banco original|neon|next|safra|sicoob|sicredi|btg pactual|banrisul)\b/;
const BANK_EXACT =
  /^(?:nubank|nu pagamentos|nu financeira|inter|banco inter|itau|itau unibanco|bradesco|santander|caixa|caixa economica federal|banco do brasil|c6|c6 bank|picpay|pagbank|pagseguro|mercado pago|banco original|original|neon|next|safra|sicoob|sicredi|btg pactual|xp|banrisul)(?:\s+(?:s\.?a\.?|ltda|pagamentos|instituicao de pagamento))?$/;

export function cleanName(value: string): string {
  const name = value
    .replace(/\d{3}\.\d{3}\.\d{3}-\d{2}|\*{3}\.\d{3}\.\d{3}-\*{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g, " ")
    .replace(/[\d*]{4,}/g, " ")
    .replace(/R\$\s*[\d.,]+/g, " ")
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, " ")
    .replace(/\b(?:cpf|cnpj|chave|ag[eê]ncia|conta)\b.*$/i, " ")
    .replace(/\s+(?:em\s+)?\d{1,2}\s*x\b.*$/i, " ")
    .replace(/\s+(?:no|com)\s+cart[aã]o\b.*$/i, " ")
    .replace(/\s+final\s*\d{4}.*$/i, " ")
    .replace(/\s+(?:em|no|na)\s*$/i, " ")
    .replace(/[|•·]+/g, " ")
    .replace(/^[\s:.\-–—]+|[\s:.\-–—]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return /\p{L}{2}/u.test(name) ? name : "";
}

function titleCase(name: string): string {
  if (name !== name.toUpperCase()) return name;
  return name
    .toLowerCase()
    .split(" ")
    .map((w) => (["de", "da", "do", "das", "dos", "e"].includes(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

function labelOf(line: string): { label: string; rest: string } | null {
  const idx = line.search(/[:]/);
  const head = fold(idx >= 0 ? line.slice(0, idx) : line).replace(/[:\s]+$/g, "").trim();
  if (!ALL_LABELS.has(head)) return null;
  return { label: head, rest: idx >= 0 ? line.slice(idx + 1).trim() : "" };
}

/** Lê "Rótulo: valor" e "Rótulo" + valor na linha de baixo; "Nome" herda o papel do bloco (Para/De). */
function readPersons(lines: string[]): Person[] {
  const persons: Person[] = [];
  let section: Role | null = null;
  for (let i = 0; i < lines.length; i++) {
    const hit = labelOf(lines[i]);
    if (!hit) {
      const line = lines[i].normalize("NFC");
      const folded = fold(line);
      const key = PREFIX_ROLES.find((k) => folded.startsWith(k + " "));
      if (key) {
        const rest = line.slice(key.length).trim();
        const name = /^[A-ZÀ-Ú]/.test(rest) ? cleanName(rest) : "";
        if (name && !BANK_EXACT.test(fold(name))) persons.push({ role: ROLE_LABELS[key], name });
      }
      continue;
    }
    let value = hit.rest;
    const next = lines[i + 1] ?? "";
    if (!value && next && !labelOf(next) && !moneyTokens(next).length) value = next;
    const role = ROLE_LABELS[hit.label];
    if (role) {
      section = role;
      const name = cleanName(value);
      if (name && !BANK_EXACT.test(fold(name))) persons.push({ role, name });
      continue;
    }
    if ((hit.label === "nome" || hit.label === "razao social") && section) {
      const name = cleanName(value);
      if (name) persons.push({ role: section, name });
    }
  }
  return persons;
}

/** "Você enviou R$ 85,90 para JOÃO", "Pix recebido de MARIA", "Compra aprovada em MAGALU"... */
function inlinePersons(text: string): Person[] {
  const found: Person[] = [];
  const add = (role: Role, raw?: string) => {
    const name = raw ? cleanName(raw.split("\n")[0]) : "";
    if (name && !BANK_EXACT.test(fold(name))) found.push({ role, name });
  };
  const money = String.raw`(?:de\s+)?(?:R\$\s*[\d.,]+\s*)?`;
  const who = String.raw`([^\n]{2,60})`;
  for (const m of text.matchAll(new RegExp(String.raw`voc[êe]\s+(?:enviou|pagou|transferiu)\s+${money}(?:para|pra|a|ao)\s+${who}`, "gi"))) add("to", m[1]);
  for (const m of text.matchAll(new RegExp(String.raw`(?:pix|transfer[êe]ncia|ted|doc)\s+(?:enviad[oa]|realizad[oa]|efetuad[oa])\s+${money}(?:para|pra|a|ao)\s+${who}`, "gi"))) add("to", m[1]);
  for (const m of text.matchAll(new RegExp(String.raw`voc[êe]\s+recebeu\s+(?:um[a]?\s+)?(?:pix|transfer[êe]ncia)?\s*${money}(?:de|da|do)\s+${who}`, "gi"))) add("from", m[1]);
  for (const m of text.matchAll(new RegExp(String.raw`(?:pix|transfer[êe]ncia|ted|doc|dep[óo]sito)\s+recebid[oa]\s+${money}(?:de|da|do)\s+${who}`, "gi"))) add("from", m[1]);
  for (const m of text.matchAll(new RegExp(String.raw`(?:voc[êe]\s+recebeu|pix\s+recebido|transfer[êe]ncia\s+recebida)[^\n]*\n\s*(?:de|da|do)\s+${who}`, "gi"))) add("from", m[1]);
  for (const m of text.matchAll(new RegExp(String.raw`voc[êe]\s+(?:enviou|pagou|transferiu)[^\n]*\n\s*(?:para|pra)\s+${who}`, "gi"))) add("to", m[1]);
  for (const m of text.matchAll(/(?:^|\n)\s*([A-ZÀ-Ú][\p{L}'. ]{2,50}?)\s+te\s+(?:enviou|pagou|transferiu|mandou)\b/gu)) add("from", m[1]);
  for (const m of text.matchAll(new RegExp(String.raw`compra\s+(?:de\s+R\$\s*[\d.,]+\s+)?(?:aprovada|realizada|efetuada)?\s*(?:em|no|na)\s+(?!(?:cr[eé]dito|d[eé]bito|cart[aã]o|dinheiro|pix|boleto)\b)${who}`, "gi"))) add("store", m[1]);
  for (const m of text.matchAll(new RegExp(String.raw`pagamento\s+(?:de\s+R\$\s*[\d.,]+\s+)?(?:aprovado\s+)?(?:em|no|na)\s+(?!(?:cr[eé]dito|d[eé]bito|cart[aã]o|dinheiro|pix|boleto)\b)${who}`, "gi"))) add("store", m[1]);
  return found;
}

/* ------------------------------------------------------------------ 3) direção e tipo */

const IN_PATTERNS: [RegExp, number][] = [
  [/\bvoce recebeu\b/, 4],
  [/\brecebeu (?:um |uma |o )?(?:pix|transferencia|ted|doc|deposito|pagamento|dinheiro)\b/, 4],
  [/\b(?:pix|transferencia|ted|doc|deposito) recebid[oa]s?\b/, 4],
  [/\bcredito (?:em conta|de salario|de proventos|de beneficio)\b/, 3],
  [/\bdeposito (?:em conta|identificado|recebido|confirmado)\b/, 3],
  [/\b(?:salario|proventos|reembolso) (?:recebido|creditado)\b/, 3],
  [/\bte (?:enviou|pagou|transferiu|mandou)\b/, 4],
  [/\b(?:enviou|pagou|transferiu|mandou) (?:para|pra) voce\b/, 4],
  [/\bvoce foi pago\b/, 3],
  [/\brecebimento\b/, 3],
  [/\b(?:estorno|reembolso|devolucao)\b/, 3],
];
const OUT_PATTERNS: [RegExp, number][] = [
  [/\bpix (?:enviado|realizado|efetuado|agendado|pago)\b/, 4],
  [/\bvoce (?:enviou|pagou|transferiu)\b/, 4],
  [/\b(?:transferencia|ted|doc) (?:enviad[oa]|realizad[oa]|efetuad[oa]|agendad[oa])\b/, 4],
  [/\bpagamento (?:de boleto|de conta|de fatura|efetuado|realizado|aprovado|confirmado)\b/, 3],
  [/\bcompra (?:aprovada|realizada|efetuada|parcelada|no (?:credito|debito))\b/, 4],
  [/\bcompra\b[^\n]{0,30}\b(?:aprovada|realizada|efetuada)\b/, 4],
  [/\bsaque\b/, 3],
  [/\bdebito automatico\b/, 3],
  [/\benviado para\b/, 3],
  [/\bcomprovante de pagamento\b/, 2],
];

function nameHits(person: string, mine: string): boolean {
  const a = fold(person).split(/\s+/).filter((w) => w.length > 1);
  const b = fold(mine).split(/\s+/).filter((w) => w.length > 1);
  if (!a.length || !b.length) return false;
  if (b.length === 1) return a.includes(b[0]);
  const first = b[0];
  const last = b[b.length - 1];
  const hasFirst = a.includes(first);
  const hasLast = a.includes(last) || a.some((w) => w.charAt(0) === last.charAt(0) && w.length <= 2);
  return hasFirst && hasLast;
}

function identityScore(lines: string[], persons: Person[], identity?: RecognizeIdentity): { in: number; out: number } {
  const score = { in: 0, out: 0 };
  if (!identity) return score;
  const names = identity.names.map((n) => n.trim()).filter((n) => n.length >= 3);
  for (const p of persons) {
    if (!names.some((n) => nameHits(p.name, n))) continue;
    if (p.role === "to") score.in += 6;
    if (p.role === "from") score.out += 6;
  }
  const cpf = (identity.cpfDigits ?? "").replace(/\D/g, "");
  if (cpf.length >= 4) {
    let role: Role | null = null;
    for (const line of lines) {
      const hit = labelOf(line);
      if (hit && ROLE_LABELS[hit.label]) role = ROLE_LABELS[hit.label];
      if (role && line.replace(/\D/g, "").includes(cpf)) {
        if (role === "to") score.in += 6;
        if (role === "from") score.out += 6;
      }
    }
  }
  return score;
}

function scorePatterns(t: string, patterns: [RegExp, number][]): number {
  return patterns.reduce((sum, [re, weight]) => sum + (re.test(t) ? weight : 0), 0);
}

/* ------------------------------------------------------------------ 4) valor, parcelas, data */

const NOT_AMOUNT = /saldo|limite|tarifa|iof|juros|multa|desconto|encargo|cashback|anuidade|bonus|pontos|taxa|disponivel|minimo|fatura atual/;

type Cand = { cents: number; score: number; each: boolean };

function pickAmount(lines: string[]): { best: Cand | null; distinct: number } {
  const cands: Cand[] = [];
  lines.forEach((line, i) => {
    const f = fold(line);
    const prev = fold(lines[i - 1] ?? "").replace(/[:\s]+$/g, "").trim();
    const tokens = moneyTokens(line);
    if (!tokens.length || NOT_AMOUNT.test(f.replace(/sem (?:juros|acrescimo|taxas?|encargos?)/g, " "))) return;
    for (const tk of tokens) {
      let score = line.includes("R$") ? 1 : 0;
      const before = f.slice(0, tk.index);
      const each = /\d{1,2}\s*(?:x|parcelas?|vezes)\s*(?:de\s*)?$/.test(before.replace(/r\$\s*$/, "").trimEnd() + " ") || /\d{1,2}\s*(?:x|parcelas?|vezes)\s*(?:de\s*)?r\$/.test(f);
      if (/valor total|valor da compra|total a pagar|total da compra/.test(before)) score += 8;
      else if (/valor (?:do pix|da transferencia|pago|recebido|enviado|da transacao)|montante/.test(before)) score += 7;
      else if (/\bvalor\b/.test(before)) score += 6;
      else if (/\btotal\b/.test(before)) score += 5;
      else if (/(?:compra|pagamento|transferencia|pix|deposito|saque) (?:de|no valor de)\s*$/.test(before.trim() + " ") || /(?:enviou|recebeu|pagou|transferiu)\s*(?:um[a]?\s+)?(?:pix\s+|transferencia\s+)?(?:de\s+)?$/.test(before.trim() + " ")) score += 5;
      else if (VALUE_LABELS.includes(prev)) score += 6;
      if (new RegExp(String.raw`^(?:R\$\s*)?-?[\d.,]+$`).test(line.trim())) score += 2;
      if (each) score -= 3;
      cands.push({ cents: tk.cents, score, each });
    }
  });
  if (!cands.length) return { best: null, distinct: 0 };
  const totals = cands.filter((c) => !c.each);
  const pool = totals.length ? totals : cands;
  const best = pool.reduce((a, b) => (b.score > a.score ? b : a));
  return { best, distinct: new Set(pool.map((c) => c.cents)).size };
}

function findPlan(t: string): { count: number; each: number | null } | null {
  const withEach = t.match(/(?<![\d.,])(\d{1,2})[ \t]*(?:x|parcelas?|vezes)[ \t]*(?:de[ \t]*)?(?:r\$[ \t]*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/);
  if (withEach) {
    const count = Number(withEach[1]);
    const each = toCents(withEach[2]);
    if (count >= 2 && count <= 48 && each > 0) return { count, each };
  }
  const candidates = [
    t.match(/(?<![\d.,])(\d{1,2})[ \t]*(?:parcelas|vezes)\b/),
    t.match(/\bparcel(?:as|amento|ado)\b[^\d\n]{0,12}(\d{1,2})\b(?!\s*\/)/),
    t.match(/\b(?:em\s+)?(\d{1,2})x\b/),
  ];
  for (const m of candidates) {
    const count = Number(m?.[1] ?? 0);
    if (count >= 2 && count <= 48) return { count, each: null };
  }
  return null;
}

function parcelOf(t: string): { current: number; count: number } | null {
  const m = t.match(/parc(?:ela)?s?\.?\s*0*(\d{1,2})\s*\/\s*0*(\d{1,2})/);
  if (!m) return null;
  const current = Number(m[1]);
  const count = Number(m[2]);
  return count >= 2 && count <= 48 && current >= 1 && current <= count ? { current, count } : null;
}

function shiftMonths(d: { year: number; month: number; day: number }, delta: number) {
  const idx = d.year * 12 + (d.month - 1) + delta;
  const year = Math.floor(idx / 12);
  const month = (idx % 12) + 1;
  return { year, month, day: Math.min(d.day, new Date(year, month, 0).getDate()) };
}

const MONTH3: Record<string, number> = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
type DateHit = { year: number | null; month: number; day: number; weight: number; relative?: number };

function validDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getMonth() === m - 1 && dt.getDate() === d;
}

function collectDates(lines: string[], now: Date): DateHit[] {
  const hits: DateHit[] = [];
  const labelBoost = /(data da compra|data da transacao|data do pagamento|data da transferencia|data e hora|data de pagamento|realizada em|efetuado em|^data\b)/;
  lines.forEach((line, i) => {
    const f = fold(line);
    const prev = fold(lines[i - 1] ?? "");
    if (/vencimento|vence\b|vencida|fechamento|validade|valid[ao] ate|melhor dia|proxim[ao]/.test(f)) return;
    let weight = (labelBoost.test(f) ? 5 : 0) + (/^data( e hora)?$/.test(prev.replace(/[:\s]+$/g, "")) ? 5 : 0) + (/\d{1,2}:\d{2}/.test(f) ? 2 : 0) + (i < 6 ? 1 : 0);
    if (/agendad|agendamento/.test(f)) weight -= 3;
    for (const m of line.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/g)) {
      const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
      if (validDate(y, Number(m[2]), Number(m[1]))) hits.push({ year: y, month: Number(m[2]), day: Number(m[1]), weight });
    }
    for (const m of line.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)) {
      if (validDate(Number(m[1]), Number(m[2]), Number(m[3]))) hits.push({ year: Number(m[1]), month: Number(m[2]), day: Number(m[3]), weight });
    }
    for (const m of f.matchAll(/\b(\d{1,2})\s+(?:de\s+)?(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\.?(?:\s+(?:de\s+)?(20\d{2}))?/g)) {
      const mo = MONTH3[m[2]];
      const y = m[3] ? Number(m[3]) : null;
      if (mo && validDate(y ?? 2024, mo, Number(m[1]))) hits.push({ year: y, month: mo, day: Number(m[1]), weight: weight + 1 });
    }
    if (!/\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/.test(line) && !/parc|\dx\b|\d\s*x\s*de/.test(f)) {
      for (const m of line.matchAll(/(?<![\d/])(\d{1,2})\/(\d{1,2})(?![\d/])/g)) {
        if (validDate(2024, Number(m[2]), Number(m[1]))) hits.push({ year: null, month: Number(m[2]), day: Number(m[1]), weight });
      }
    }
    const rel = /\banteontem\b/.test(f) ? 2 : /\bontem\b/.test(f) ? 1 : /\bhoje\b/.test(f) ? 0 : null;
    if (rel !== null) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - rel);
      hits.push({ year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), weight: weight + 2, relative: rel });
    }
  });
  return hits;
}

function pickDate(lines: string[], now: Date): { date: { year: number; month: number; day: number }; labeled: boolean } | null {
  const hits = collectDates(lines, now);
  const good: DateHit[] = [];
  for (const h of hits) {
    let year = h.year;
    if (year === null) {
      year = now.getFullYear();
      if (new Date(year, h.month - 1, h.day).getTime() > now.getTime() + 3 * 86_400_000) year -= 1;
    }
    if (Math.abs(year - now.getFullYear()) > 1) continue;
    good.push({ ...h, year });
  }
  if (!good.length) return null;
  const best = good.reduce((a, b) => (b.weight > a.weight ? b : a));
  return { date: { year: best.year!, month: best.month, day: best.day }, labeled: best.weight >= 5 };
}

/* ------------------------------------------------------------------ montagem */

const NOISE_LINE =
  /^(?:comprovante|compra|aprovad|realizad|efetuad|pagamento|transfer|pix|valor|total|data|hora|cart[aã]o|cr[eé]dito|d[eé]bito|parcel|final|banco|ag[eê]ncia|conta|protocolo|autentica|id\b|transa|nsu|c[oó]digo|via\b|cliente|sac\b|ouvidoria|obrigad|detalhes|recibo|resumo|tipo|chave|cpf|cnpj|nome|instituicao|institui[cç][aã]o|descri|mensagem|n[uú]mero|voc[eê]|recebid|enviad|dep[oó]sito|saque|boleto|benefici|origem|destino|para\b|de\b)/i;

function descriptiveLine(lines: string[]): string | null {
  for (const line of lines) {
    const f = fold(line);
    if (line.length < 3 || /\d{4,}/.test(f.replace(/\s/g, "")) && !/[a-z]{4,}/.test(f)) continue;
    if (moneyTokens(line).length || NOISE_LINE.test(line) || BANK_WORDS.test(f) || labelOf(line)) continue;
    if (!/\p{L}{3}/u.test(line)) continue;
    const name = cleanName(line);
    if (name) return name;
  }
  return null;
}

/**
 * Texto usado só para decidir "crédito x débito x Pix": tira nome do banco, agência, CPF/CNPJ, ID da transação etc.
 * Assim "Cooperativa de Crédito" ou um número de protocolo não faz o Pix virar compra no cartão.
 */
function keywordText(lines: string[]): string {
  const SKIP = /^(?:instituicao|banco|cooperativa|agencia|ag\b|conta\b|tipo de conta|cnpj|cpf|id\b|protocolo|autenticacao|chave|end ?to ?end|codigo)/;
  const kept: string[] = [];
  let skipNext = false;
  for (const line of lines) {
    const f = fold(line).trim();
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (SKIP.test(f)) {
      skipNext = !f.includes(":") && f.split(/\s+/).length <= 3; // rótulo sozinho: o valor está na linha de baixo
      continue;
    }
    kept.push(f);
  }
  return kept
    .join("\n")
    .replace(/cooperativas? (?:de )?credito[^\n]*|sociedade de credito[^\n]*|credito,? financiamento[^\n]*/g, " ");
}

export function recognize(input: string, now = new Date(), identity?: RecognizeIdentity): Recognized {
  const raw = normalizeText(input);
  const lines = raw.split("\n").filter(Boolean);
  const t = fold(raw);
  const head = fold(lines.slice(0, 8).join("\n"));
  const notes: string[] = [];

  const persons = [...readPersons(lines), ...inlinePersons(raw)];
  const idScore = identityScore(lines, persons, identity);
  const tw = t.replace(/\s*[-–—]\s*/g, " ");
  const inScore = scorePatterns(tw, IN_PATTERNS) + idScore.in;
  const outScore = scorePatterns(tw, OUT_PATTERNS) + idScore.out;

  let incoming: boolean | null = null;
  let strong = false;
  if (inScore >= 3 && inScore >= outScore + 2) { incoming = true; strong = true; }
  else if (outScore >= 3 && outScore >= inScore + 2) { incoming = false; strong = true; }
  else if (inScore > outScore) incoming = true;
  else if (outScore > inScore) incoming = false;

  const plan = findPlan(t);
  const isPix =
    /\bpix\b/.test(t) || (!/\b(?:ted|doc|transferencia|deposito|boleto)\b/.test(t) && /\bvoce enviou\b/.test(t));
  const word = isPix ? "Pix" : /\bted\b/.test(t) ? "TED" : /\bdoc\b/.test(t) ? "DOC" : /transferencia/.test(t) ? "Transferência" : /deposito/.test(t) ? "Depósito" : null;
  const kt = keywordText(lines);
  // Pix escrito no comprovante só vira cartão se o texto falar de cartão de verdade
  const cardContext = /cartao|no credito|credito (?:a vista|parcelado)|\bfinal \d{4}|fatura/.test(kt);
  const creditWord =
    (/\bcredito\b/.test(kt.replace(/credito (?:em conta|de salario|de proventos|de beneficio)/g, "")) || /cartao de credito/.test(kt)) &&
    (!isPix || cardContext);
  const debitWord = /\bdebito\b/.test(kt) && (!isPix || cardContext);

  let kind: DocKind = "unknown";
  if (incoming === true) kind = isPix ? "pix_in" : /deposito/.test(t) && !word?.startsWith("T") ? "deposit_in" : "transfer_in";
  else if ((plan && plan.count > 1 && (!isPix || cardContext)) || creditWord) kind = "credit";
  else if (debitWord && !/debito automatico/.test(t)) kind = "debit";
  else if (/\bboleto\b|codigo de barras|linha digitavel/.test(t)) kind = "boleto";
  else if (/\bsaque\b/.test(t)) kind = "cash";
  else if (isPix) kind = "pix_out";
  else if (word) kind = "transfer_out";
  else if (/compra\b[^\n]{0,30}\b(?:aprovada|realizada|efetuada)|pagamento (?:aprovado|em)/.test(t)) kind = "card_unknown";
  else if (debitWord) kind = "debit";
  if (kind === "unknown" && incoming === false) kind = "transfer_out";
  if (kind === "credit" || kind === "debit" || kind === "boleto" || kind === "cash") {
    if (incoming === true && !strong) incoming = false;
  }

  const { best, distinct } = pickAmount(lines);
  let amountCents = best?.cents ?? null;
  let installments = 1;
  if (kind === "credit" && plan) {
    installments = plan.count;
    if (plan.each) {
      const byEach = plan.each * plan.count;
      if (amountCents === null || Math.abs(amountCents - plan.each) <= 1) amountCents = byEach;
      else if (best && best.score < 8 && Math.abs(amountCents - byEach) > Math.max(amountCents * 0.05, 500)) amountCents = byEach;
    }
  }

  const found = pickDate(lines, now);
  let date = found?.date ?? null;

  // "Parcela 3/10 R$ 100,00": o valor é da parcela; a compra foi (N-1) meses antes.
  const parcel = parcelOf(t);
  if (parcel && incoming !== true && !plan) {
    if (kind === "unknown" || kind === "card_unknown") kind = "credit";
    if (kind === "credit" && amountCents) {
      installments = parcel.count;
      amountCents *= parcel.count;
      const slip = date ?? { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
      date = shiftMonths(slip, -(parcel.current - 1));
      notes.push(`Parcela ${parcel.current}/${parcel.count}: lancei a compra de ${parcel.count}x no mês em que ela começou.`);
    }
  }

  const wantRole: Role = incoming === true ? "from" : "to";
  const person = persons.find((p) => p.role === wantRole && !(identity?.names ?? []).some((n) => nameHits(p.name, n)));
  const storeName = persons.find((p) => p.role === "store")?.name ?? null;
  const counterparty = person ? titleCase(person.name) : null;
  let merchant: string | null = null;
  if (kind === "credit" || kind === "debit" || kind === "card_unknown") {
    const line = descriptiveLine(lines);
    merchant = storeName ? titleCase(storeName) : line ? titleCase(line) : null;
  }

  let description: string;
  switch (kind) {
    case "pix_in": description = counterparty ? `Pix recebido de ${counterparty}` : "Pix recebido"; break;
    case "transfer_in": description = counterparty ? `${word === "TED" ? "TED recebida" : word === "DOC" ? "DOC recebido" : "Transferência recebida"} de ${counterparty}` : word === "TED" ? "TED recebida" : "Transferência recebida"; break;
    case "deposit_in": description = counterparty ? `Depósito de ${counterparty}` : "Depósito recebido"; break;
    case "pix_out": description = counterparty ? `Pix para ${counterparty}` : "Pix enviado"; break;
    case "transfer_out": description = counterparty ? `${word ?? "Pagamento"} para ${counterparty}` : word ? `${word} enviada` : "Pagamento"; break;
    case "boleto": description = counterparty ?? "Pagamento de boleto"; break;
    case "cash": description = "Saque"; break;
    case "credit": description = merchant ?? "Compra no crédito"; break;
    case "debit": description = merchant ?? "Compra no débito"; break;
    case "card_unknown": description = merchant ?? "Compra no cartão"; break;
    default: description = counterparty ?? descriptiveLine(lines) ?? "Lançamento";
  }

  if (incoming === true && /\b(?:estorno|reembolso)\b/.test(t)) {
    const store = descriptiveLine(lines.filter((l) => !/estorno|reembolso/i.test(l)));
    const who = counterparty ?? (store ? titleCase(store) : null);
    description = who ? `Estorno de ${who}` : "Estorno";
  }

  const method: PayMethod | null =
    incoming === true ? "entrada" : kind === "credit" ? "credito" : kind === "debit" || kind === "boleto" ? "debito"
    : kind === "pix_out" || kind === "transfer_out" ? "pix" : null;

  /* confiança e avisos */
  let confidence: Confidence = "alta";
  const lower = (c: Confidence) => { confidence = c === "baixa" || confidence === "baixa" ? "baixa" : "media"; };
  if (amountCents === null) { confidence = "baixa"; notes.push("Não encontrei o valor."); }
  else if (!best || best.score < 3) { lower("baixa"); notes.push("Valor escolhido sem rótulo claro: confira."); }
  else if (distinct > 2 && best.score < 6) { lower("media"); notes.push("Havia mais de um valor: confira se este é o total."); }
  if (kind === "card_unknown") { lower("media"); notes.push("Compra no cartão: confirme se foi crédito ou débito."); }
  else if (kind === "unknown" && incoming === null) { lower("baixa"); notes.push("Não deu para saber se foi entrada ou saída: confirme o tipo."); }
  else if (!strong && incoming !== null && (kind === "pix_in" || kind === "pix_out" || kind === "transfer_in" || kind === "transfer_out")) { lower("media"); notes.push(incoming ? "Parece uma entrada: confira." : "Parece uma saída: confira."); }
  if (!date) { lower("media"); notes.push("Não achei a data do comprovante: usei hoje."); }
  else if (date.year !== now.getFullYear() || date.month !== now.getMonth() + 1) {
    notes.push(`Data lida: ${String(date.day).padStart(2, "0")}/${String(date.month).padStart(2, "0")}/${date.year}. O lançamento vai para esse mês.`);
    if (confidence === "alta" && !found?.labeled) lower("media");
  }
  if (date && /agendad|agendamento/.test(t)) notes.push("Pagamento agendado: confira se já saiu da conta.");

  return {
    kind, method, incoming, amountCents, installments,
    date, description, merchant, counterparty,
    headline: strong || /compra (?:aprovada|realizada)|comprovante/.test(head),
    confidence, notes,
  };
}
