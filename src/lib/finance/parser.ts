import { parseBrlNumber } from "./money";
import { addMonths } from "./period";
import type { PayMethod } from "./types";

const MONTHS: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

export type ParsedItem = {
  description: string;
  merchant: string | null;
  category: string;
  totalCents: number;
  installments: number;
  year: number;
  month: number;
  day: number | null;
};

export type ParseOutcome = {
  method: PayMethod | null;
  merchant: string | null;
  items: ParsedItem[];
};

/** Quem é você no comprovante — nome(s) e dígitos de CPF salvos no perfil. */
export type ParseIdentity = {
  names: string[];
  cpfDigits?: string;
};

type FoundDate = { year: number; month: number; day: number };

const PAYMENT =
  /pagamento recebido|pagamento efetuado|pagto\.?\s*(da\s*)?fatura|valor pago|estorno|fatura anterior/i;

function moneyRe() {
  return /(?:R\$\s*)?(-?\d{1,3}(?:\.\d{3})+,\d{2}|-?\d+,\d{2}|-?\d+\.\d{2})/g;
}

export function moneyTokenToCents(token: string): number {
  const negative = /^\s*-/.test(token);
  const raw = token.trim().replace(/^-/, "").replace(/^R\$\s*/i, "");
  let cents = 0;
  if (raw.includes(",")) cents = parseBrlNumber(raw);
  else {
    const n = Number(raw);
    cents = Number.isFinite(n) ? Math.round(n * 100) : 0;
  }
  return negative ? -Math.abs(cents) : Math.abs(cents);
}

export function guessCategory(text: string): string {
  const t = text.toLowerCase();
  const rules: [RegExp, string][] = [
    [/aluguel|condom[ií]nio|iptu|energia|enel|\bluz\b|sabesp|[aá]gua|internet|vivo|claro|tim\b/, "Moradia"],
    [/mercado|hortifruti|carrefour|assa[ií]|p[aã]o de a[cç][uú]car|supermercado|padaria|a[cç]ougue/, "Mercado"],
    [/uber|\b99\b|cabify|posto|combust|estaciona|metr[oô]|[oô]nibus|ped[aá]gio|shell|ipiranga/, "Transporte"],
    [/farm[aá]cia|drogaria|droga\s?raia|hospital|m[eé]dic|odonto|consulta|unimed/, "Saúde"],
    [/netflix|spotify|prime video|disney|youtube|icloud|assinatura|apple\.com|deezer/, "Assinaturas"],
    [/curso|escola|faculdade|udemy|alura|livro|mensalidade/, "Educação"],
    [/ifood|restaurante|\bbar\b|lanche|burger|pizza|caf[eé]|rappi|mcdonald/, "Restaurante"],
    [/renner|zara|riachuelo|roupa|cal[cç]ado|\bnike\b|centauro|shein/, "Roupas"],
    [/cinema|show|ingresso|steam|jogo|spotify/, "Lazer"],
  ];
  for (const [re, cat] of rules) if (re.test(t)) return cat;
  return "Outros";
}

const fold = (value: string) =>
  value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const INCOMING = [
  /\bvoce recebeu\b/,
  /\brecebemos\b/,
  /\brecebimento\s+(?:de|via|por|no|em)\b/,
  /\bpagamento recebido\b/,
  /\bcredito recebido\b/,
  /\b(?:recebido|recebida)\s+(?:por|via|no|pelo|pela)\s+(?:cartao|credito)\b/,
  /\bvenda(?:s)?\s+(?:aprovada|realizada|confirmada).*\b(?:credito|cartao)\b/,
  /\brecebeu (?:um |uma )?(?:pix|transferencia|ted|doc|deposito)\b/,
  /\b(?:pix|transferencia|ted|doc|deposito) recebid[oa]s?\b/,
  /\bcredito (?:em conta|de salario)\b/,
  /\bdeposito (?:em conta|identificado)\b/,
  /\bsalario (?:recebido|creditado)\b/,
];
const OUTGOING = [
  /\b(?:pix|transferencia|ted|doc) (?:enviad[oa]s?|realizad[oa]s?|efetuad[oa]s?)\b/,
  /\bvoce (?:enviou|pagou|transferiu)\b/,
  /\bcompra (?:aprovada|realizada|no (?:credito|debito))\b/,
  /\bpagamento (?:de boleto|de conta|efetuado|realizado)\b/,
];

function lineIsIncoming(line: string): boolean {
  return INCOMING.some((re) => re.test(fold(line)));
}

function isIncoming(raw: string): boolean {
  const t = fold(raw);
  return INCOMING.some((re) => re.test(t)) && !OUTGOING.some((re) => re.test(t));
}

type Person = { name: string; role: "from" | "to" | "store" };

function cleanName(value: string): string {
  const name = cleanDesc(value)
    .replace(/[\d*.\-/]{5,}/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return /\p{L}{2}/u.test(name) ? name : "";
}

function nameHits(haystack: string, name: string): boolean {
  const h = fold(haystack);
  const n = fold(name).trim();
  if (n.length < 3) return false;
  if (h.includes(n)) return true;
  const parts = n.split(/\s+/).filter((p) => p.length > 2);
  if (parts.length >= 2 && parts.every((p) => h.includes(p))) return true;
  if (parts.length >= 2 && h.includes(parts[0]) && h.includes(parts[parts.length - 1])) return true;
  return false;
}

function pickAllPersons(raw: string): Person[] {
  const found: Person[] = [];
  for (const line of raw.split("\n")) {
    const l = line.trim();
    const store = l.match(/^(?:estabelecimento|loja|local(?: da compra)?)\s*[:-]\s*(.+)$/i);
    const from = l.match(
      /^(?:de|origem|remetente|pagador|enviado por|quem enviou|quem pagou)\s*[:-]\s*(.+)$/i,
    );
    const to =
      l.match(
        /^(?:para|favorecido|destinat[aá]rio|recebedor|quem recebeu|nome do favorecido|benefici[aá]rio)\s*[:-]\s*(.+)$/i,
      ) ?? l.match(/^[Pp]ara\s+([A-ZÀ-Ú][^\n]{2,})$/);
    for (const [m, role] of [
      [store, "store"],
      [from, "from"],
      [to, "to"],
    ] as const) {
      const name = m ? cleanName(m[1]) : "";
      if (name) found.push({ name, role });
    }
  }
  return found;
}

function pickPerson(raw: string, incoming: boolean): Person | null {
  const found = pickAllPersons(raw);
  if (incoming) return found.find((p) => p.role === "from") ?? null;
  return found.find((p) => p.role === "store") ?? found.find((p) => p.role === "to") ?? null;
}

/** true = você recebeu; false = você enviou/pagou; null = não deu para saber pelo perfil. */
function directionFromIdentity(raw: string, identity?: ParseIdentity): boolean | null {
  if (!identity) return null;
  const names = identity.names.map((n) => n.trim()).filter((n) => n.length >= 3);
  const cpf = (identity.cpfDigits ?? "").replace(/\D/g, "");
  if (!names.length && cpf.length < 4) return null;

  const persons = pickAllPersons(raw);
  const toMe = persons.some((p) => p.role === "to" && names.some((n) => nameHits(p.name, n)));
  const fromMe = persons.some((p) => p.role === "from" && names.some((n) => nameHits(p.name, n)));

  if (cpf.length >= 4) {
    for (const line of raw.split("\n")) {
      const digits = line.replace(/\D/g, "");
      if (!digits.includes(cpf)) continue;
      const t = fold(line);
      if (/^(para|favorecido|destinat|recebedor|benefici)/.test(t) || /\bpara\b/.test(t)) {
        if (!fromMe) return true;
      }
      if (/^(de|origem|remetente|pagador)/.test(t)) {
        if (!toMe) return false;
      }
    }
    if (toMe) return true;
    if (fromMe) return false;
  }

  if (toMe && !fromMe) return true;
  if (fromMe && !toMe) return false;

  const body = fold(raw);
  if (names.some((n) => nameHits(body, n))) {
    if (INCOMING.some((re) => re.test(body))) return true;
    if (OUTGOING.some((re) => re.test(body))) return false;
  }
  return null;
}

function kindWord(raw: string): string | null {
  const t = fold(raw);
  if (/\bpix\b/.test(t)) return "Pix";
  if (/\bted\b/.test(t)) return "TED";
  if (/\bdoc\b/.test(t)) return "DOC";
  if (/transferencia/.test(t)) return "Transferência";
  if (/deposito/.test(t)) return "Depósito";
  if (/boleto/.test(t)) return "Boleto";
  if (/saque/.test(t)) return "Saque";
  return null;
}

const GENERIC =
  /^(valor|total|subtotal|lancamento|data|horario|hora|banco|conta|agencia|comprovante.*|compra (aprovada|realizada|no\b.*|na\b.*)|pagamento.*|transferencia.*|pix.*|ted.*|doc.*|voce .*|recebid.*|enviad.*|cartao.*|(de|origem|remetente|pagador|para|favorecido|destinatario|recebedor|nome do favorecido|beneficiario)(?:\s*[:-]|\s+).*|credito|debito|outros?|opcional)$/;

function isGeneric(description: string): boolean {
  const d = fold(description).trim();
  return d.length < 3 || GENERIC.test(d);
}

function isNoiseLine(line: string): boolean {
  const t = fold(line);
  if (/\b(cnpj|cpf|c\.?n\.?p\.?j\.?|c\.?p\.?f\.?)\b/.test(t)) return true;
  if (/^(ag[eê]ncia|agencia|conta|banco|nsu|auth|autenticacao|protocolo|end to end|id da trans)/.test(t)) {
    return true;
  }
  if (/\binscricao\s+estadual\b|\bie\b/.test(t) && (t.match(/\p{L}/gu) ?? []).length < 12) return true;
  return false;
}

function isNoiseDesc(description: string): boolean {
  const d = fold(description).trim();
  if (!d || isGeneric(d)) return true;
  if (/\b(cnpj|cpf)\b/.test(d)) return true;
  if (/^[\d\s./\-]+$/.test(d)) return true;
  if ((d.match(/\p{L}/gu) ?? []).length < 3) return true;
  return false;
}

function describe(raw: string, incoming: boolean, person: Person | null): string | null {
  const kind = kindWord(raw);
  if (incoming) {
    const t = fold(raw);
    const label = /salario/.test(t)
      ? "Salário"
      : kind === "TED"
        ? "TED recebida"
        : kind === "DOC"
          ? "DOC recebido"
          : kind === "Pix"
            ? "Pix recebido"
            : kind === "Transferência"
              ? "Transferência recebida"
              : kind === "Depósito"
                ? "Depósito recebido"
                : "Entrada";
    return person ? `${label} de ${person.name}` : label;
  }
  if (person?.role === "store") return person.name;
  if (person?.role === "to") return kind === "Boleto" ? person.name : `${kind ?? "Pagamento"} para ${person.name}`;
  if (kind === "Pix") return "Pix enviado";
  if (kind === "TED") return "TED enviada";
  if (kind === "Boleto") return "Pagamento de boleto";
  if (kind === "Transferência" || kind === "Saque") return kind;
  return null;
}

function polish(item: ParsedItem, raw: string, incoming: boolean, person: Person | null): ParsedItem {
  const label = describe(raw, incoming, person);
  if (!label || !(incoming || isGeneric(item.description) || isNoiseDesc(item.description))) return item;
  return {
    ...item,
    description: label.slice(0, 160),
    category: guessCategory(`${label} ${item.merchant ?? ""}`),
  };
}

function detectMethod(text: string): PayMethod | null {
  const t = text.toLowerCase();
  if (/\bpix\b/.test(t)) return "pix";
  if (/d[eé]bito/.test(t)) return "debito";
  if (/cr[eé]dito|cart[aã]o|compra aprovada|compra realizada/.test(t)) return "credito";
  if (/dinheiro|esp[eé]cie/.test(t)) return "dinheiro";
  return null;
}

function detectMerchant(text: string): string | null {
  const labeled = text.match(/estabelecimento\s*[:-]\s*(.+)/i);
  if (!labeled?.[1]) return null;
  const name = cleanDesc(labeled[1].split("\n")[0]);
  return name && !isNoiseDesc(name) ? name : null;
}

function cleanDesc(raw: string): string {
  return raw
    .replace(moneyRe(), " ")
    .replace(/\b\d{1,2}\s*[x×]\s*(?:de)?\b/gi, " ")
    .replace(/parc(?:ela)?s?\.?\s*\d+\s*\/\s*\d+/gi, " ")
    .replace(/\b\d{2}\/\d{2}(?:\/\d{2,4})?\b/g, " ")
    .replace(/\b\d{1,2}\s+(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zç]*\b/gi, " ")
    .replace(/\bcompra\s+(?:aprovada|realizada|n[oa])\b/gi, " ")
    .replace(/\b(cr[eé]dito|d[eé]bito|pix|dinheiro|visa|master|elo)\b/gi, " ")
    .replace(/\b(?:cnpj|cpf)\s*[\d./\-]*/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—:|.*]+|[\s\-–—:|.*]+$/g, "")
    .trim();
}

function findDate(text: string, now: Date): FoundDate | null {
  const labeled = text.match(/data\s*[:-]?\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i);
  const numeric = labeled ?? text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    let year = Number(numeric[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return { year, month, day };
  }
  const named = text.match(
    /\b(\d{1,2})\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zç]*\b/i,
  );
  if (named) {
    const day = Number(named[1]);
    const month = MONTHS[named[2].toLowerCase().slice(0, 3)];
    const yearIn = text.match(/\b(20\d{2})\b/);
    const year = yearIn ? Number(yearIn[1]) : now.getFullYear();
    if (month && day >= 1 && day <= 31) return { year, month, day };
  }
  return null;
}

function findPlan(text: string): { count: number; eachCents: number } | null {
  const times = text.match(
    /(\d{1,2})\s*[x×]\s*(?:de\s*)?(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d+\.\d{2})/i,
  );
  if (!times) return null;
  const count = Number(times[1]);
  const eachCents = moneyTokenToCents(times[2]);
  if (count < 2 || count > 48 || eachCents <= 0) return null;
  return { count, eachCents };
}

function findParcel(text: string): { current: number; count: number } | null {
  const parc = text.match(/parc(?:ela)?s?\.?\s*0*(\d{1,2})\s*\/\s*0*(\d{1,2})/i);
  if (!parc) return null;
  const current = Number(parc[1]);
  const count = Number(parc[2]);
  if (count < 2 || count > 48 || current < 1 || current > count) return null;
  return { current, count };
}

/** Prioriza rótulos de valor real do comprovante (não IOF, taxa, parcela solta). */
function findTotal(text: string): number | null {
  const patterns = [
    /(?:valor\s+(?:total|da\s+compra|do\s+pix|da\s+transfer[eê]ncia|recebido|enviado|pago|da\s+transa[cç][aã]o)|total\s+(?:a\s+pagar|da\s+compra|geral)|compra\s+de|pagamento\s+de)\s*[:-]?\s*(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d+\.\d{2})/gi,
    /(?:valor|total)\s*[:-]?\s*(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d+\.\d{2})/gi,
    /(?:^|\n)\s*(?:R\$\s*)(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})\s*(?:\n|$)/gim,
  ];
  const found: number[] = [];
  const feeLike = /iof|taxa|tarifa|juros|multa|desconto|anuidade|encargos/i;
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const lineStart = text.lastIndexOf("\n", m.index ?? 0) + 1;
      const lineEnd = text.indexOf("\n", m.index ?? 0);
      const line = text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
      if (feeLike.test(line) && !/valor\s+(?:total|da\s+compra|do\s+pix)/i.test(line)) continue;
      const cents = moneyTokenToCents(m[1]);
      if (cents >= 100) found.push(cents);
    }
  }
  if (!found.length) return null;
  return Math.max(...found);
}

function lineAmount(line: string): number | null {
  if (PAYMENT.test(line)) return null;
  const matches = [...line.matchAll(moneyRe())];
  if (!matches.length) return null;
  const values = matches.map((m) => {
    const token = m[1] ?? m[0];
    const negative = /-\s*R\$|R\$\s*-/.test(line) || token.trim().startsWith("-");
    const cents = moneyTokenToCents(token.replace(/^-/, ""));
    return negative ? -cents : cents;
  });
  const last = values[values.length - 1];
  if (last < 0) return last;
  const positive = values.filter((v) => v > 0);
  return positive.length ? positive[positive.length - 1] : null;
}

function fallbackDate(now: Date): FoundDate {
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

function parseCharges(raw: string, now: Date, merchant: string | null, skipIncoming: boolean): ParsedItem[] {
  const headerDate = findDate(raw, now);
  const items: ParsedItem[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^(total|subtotal|soma|saldo|limite|encargos|anuidade|iof)\b/i.test(trimmed)) continue;
    if (isNoiseLine(trimmed)) continue;
    if (skipIncoming && lineIsIncoming(trimmed)) continue;
    const amount = lineAmount(trimmed);
    if (amount === null || amount <= 0) continue;
    const date = findDate(trimmed, now) ?? headerDate ?? fallbackDate(now);
    const parcel = findParcel(trimmed);
    const plan = findPlan(trimmed);
    let installments = 1;
    let total = amount;
    let start = { year: date.year, month: date.month };
    if (plan) {
      installments = plan.count;
      total = plan.eachCents * plan.count;
    } else if (parcel) {
      installments = parcel.count;
      total = amount * parcel.count;
      if (parcel.current > 1) start = addMonths(start, -(parcel.current - 1));
    }
    let description = cleanDesc(trimmed);
    if (isNoiseDesc(description)) {
      if (merchant) description = merchant;
      else continue;
    }
    description = (description || merchant || "Lançamento").slice(0, 160);
    items.push({
      description,
      merchant,
      category: guessCategory(`${description} ${merchant ?? ""}`),
      totalCents: total,
      installments,
      year: start.year,
      month: start.month,
      day: date.day,
    });
  }
  const seen = new Set<string>();
  return items.filter((item) => {
    if (isNoiseDesc(item.description) && !item.merchant) return false;
    const key = `${item.description}|${item.totalCents}|${item.year}-${item.month}-${item.day}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function singleItem(
  raw: string,
  now: Date,
  merchant: string | null,
  plan: { count: number; eachCents: number } | null,
  charges: ParsedItem[],
): ParsedItem | null {
  const labeled = findTotal(raw);
  const date = findDate(raw, now) ?? fallbackDate(now);
  let total = labeled ?? 0;
  let installments = 1;
  if (plan) {
    installments = plan.count;
    const computed = plan.eachCents * plan.count;
    if (!total || Math.abs(total - plan.eachCents) < 2) total = computed;
  }
  if (!total && charges[0]) total = charges[0].totalCents;
  if (!total) {
    const amounts = [...raw.matchAll(moneyRe())]
      .map((m) => moneyTokenToCents(m[1] ?? m[0]))
      .filter((n) => n > 0);
    if (amounts.length) total = Math.max(...amounts);
  }
  if (!total) return null;
  const parcel = findParcel(raw);
  let start = { year: date.year, month: date.month };
  if (!plan && parcel) {
    installments = parcel.count;
    if (parcel.current > 1) start = addMonths(start, -(parcel.current - 1));
  }
  const line =
    merchant ||
    cleanDesc(
      raw
        .split("\n")
        .map((l) => l.trim())
        .find((l) => {
          if (isNoiseLine(l)) return false;
          const d = cleanDesc(l);
          return d.length > 2 && !/^(total|subtotal|data|valor)\b/i.test(d) && !isGeneric(d) && !isNoiseDesc(d);
        }) ?? "",
    ) ||
    charges[0]?.description ||
    "Lançamento";
  return {
    description: line.slice(0, 160),
    merchant,
    category: guessCategory(`${line} ${merchant ?? ""}`),
    totalCents: total,
    installments,
    year: start.year,
    month: start.month,
    day: date.day,
  };
}

function looksLikeSingleReceipt(raw: string, charges: ParsedItem[]): boolean {
  const t = fold(raw);
  if (/compra (aprovada|realizada)/.test(t)) return true;
  if (/comprovante/.test(t) && charges.length <= 3) return true;
  if (findTotal(raw) && charges.length <= 3) return true;
  return false;
}

export function parseReceiptText(
  text: string,
  now = new Date(),
  identity?: ParseIdentity,
): ParseOutcome {
  const raw = text.replace(/\r/g, "").replace(/\u00a0/g, " ").trim();
  if (!raw) return { method: null, merchant: null, items: [] };
  const merchant = detectMerchant(raw);
  const plan = findPlan(raw);
  const rows = parseCharges(raw, now, merchant, true);

  const byId = directionFromIdentity(raw, identity);
  const incoming =
    byId === true || (byId === null && isIncoming(raw) && rows.length === 0);
  let method: PayMethod | null = incoming ? "entrada" : detectMethod(raw);
  if (byId === false && method === "entrada") method = detectMethod(raw) ?? "pix";

  const person = pickPerson(raw, incoming);
  const charges = incoming ? parseCharges(raw, now, merchant, false) : rows;

  let items: ParsedItem[];
  const forceSingle =
    (plan && charges.length <= 4) ||
    (method === "credito" && looksLikeSingleReceipt(raw, charges)) ||
    (incoming && charges.length <= 2);

  if (forceSingle) {
    const item = singleItem(raw, now, merchant, plan, charges);
    items = item ? [item] : [];
  } else if (charges.length >= 2) {
    items = charges;
  } else {
    const item = charges[0] ?? singleItem(raw, now, merchant, plan, charges);
    items = item ? [item] : [];
  }
  if (items.length === 0) {
    const item = singleItem(raw, now, merchant, plan, []);
    items = item ? [item] : [];
  }
  if (items.length === 1) items = [polish(items[0], raw, incoming, person)];
  return { method, merchant, items };
}

export function matchCardName(text: string, cards: { id: string; name: string }[]): string | null {
  const t = text.toLowerCase();
  let best: { id: string; len: number } | null = null;
  for (const card of cards) {
    const name = card.name.trim().toLowerCase();
    if (name.length < 2) continue;
    if (t.includes(name) && (!best || name.length > best.len)) best = { id: card.id, len: name.length };
  }
  return best?.id ?? null;
}
