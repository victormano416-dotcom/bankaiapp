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
  /\bvoce recebeu\b/, /\bvc recebeu\b/, /\brecebemos\b/, /\brecebimento\b/,
  /\bcredito recebido\b/, /\brecebid[oa]s?\b/, /\brecebeu\b/,
  /\b(?:pix|transferencia|ted|doc|deposito)\s+recebid[oa]s?\b/,
  /\btransferencia recebida\b/, /\bpix\s+recebido\b/,
  /\bvalor recebido\b/, /\bcredito (?:em conta|de salario|na conta)\b/,
  /\bdeposito (?:em conta|identificado|recebido)\b/, /\bsalario (?:recebido|creditado)\b/,
  /\bfoi creditado\b/, /\bcaiu na (?:sua )?conta\b/,
];
const OUTGOING = [
  /\b(?:pix|transferencia|ted|doc)\s+(?:enviad[oa]s?|realizad[oa]s?|efetuad[oa]s?)\b/,
  /\bvoce (?:enviou|pagou|transferiu)\b/,
  /\benviou (?:um |uma )?(?:pix|transferencia|ted|doc)\b/,
  /\bcompra (?:aprovada|realizada|no (?:credito|debito))\b/,
  /\bpagamento (?:de boleto|de conta|efetuado|realizado)\b/,
  /\bpix\s+enviado\b/, /\btransferencia enviada\b/,
];

function lineIsIncoming(line: string): boolean {
  return INCOMING.some((re) => re.test(fold(line)));
}
function isIncoming(raw: string): boolean {
  const t = fold(raw);
  if (!INCOMING.some((re) => re.test(t))) return false;
  if (/\bcompra (?:aprovada|realizada|no (?:credito|debito))\b/.test(t)) return false;
  if (/\bvoce (?:enviou|pagou|transferiu)\b/.test(t)) return false;
  if (/\b(?:pix|transferencia|ted|doc)\s+enviad[oa]s?\b/.test(t)) return false;
  return true;
}
function isOutgoing(raw: string): boolean {
  const t = fold(raw);
  if (/\bvoce (?:enviou|pagou|transferiu)\b/.test(t)) return true;
  if (/\b(?:pix|transferencia|ted|doc)\s+enviad[oa]s?\b/.test(t)) return true;
  if (/\bcompra (?:aprovada|realizada|no (?:credito|debito))\b/.test(t)) return true;
  return false;
}

type Person = { name: string; role: "from" | "to" | "store" };
function cleanName(value: string): string {
  const name = cleanDesc(value).replace(/[\d*.\-/]{5,}/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  return /\p{L}{2}/u.test(name) ? name : "";
}
function nameHits(haystack: string, name: string): boolean {
  const h = fold(haystack);
  const n = fold(name).trim();
  if (n.length < 3) return false;
  if (h.includes(n)) return true;
  const parts = n.split(/\s+/).filter((p) => p.length > 2);
  if (parts.length >= 2 && parts.every((p) => h.includes(p))) return true;
  return false;
}
function pickAllPersons(raw: string): Person[] {
  const found: Person[] = [];
  for (const line of raw.split("\n")) {
    const l = line.trim();
    if (!l) continue;
    const store = l.match(/^(?:estabelecimento|loja|local(?: da compra)?)\s*[:-]\s*(.+)$/i);
    const from = l.match(/^(?:de|origem|remetente|pagador|enviado por|quem enviou)\s*[:-]?\s*(.+)$/i);
    const to = l.match(/^(?:para|favorecido|destinat[aá]rio|recebedor|quem recebeu)\s*[:-]?\s*(.+)$/i);
    for (const [m, role] of [[store, "store"], [from, "from"], [to, "to"]] as const) {
      if (!m) continue;
      const name = cleanName(m[1] ?? "");
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
function directionFromIdentity(raw: string, identity?: ParseIdentity): boolean | null {
  if (!identity) return null;
  const names = identity.names.map((n) => n.trim()).filter((n) => n.length >= 3);
  const cpf = (identity.cpfDigits ?? "").replace(/\D/g, "");
  if (!names.length && cpf.length < 4) return null;
  const persons = pickAllPersons(raw);
  const toMe = persons.some((p) => p.role === "to" && names.some((n) => nameHits(p.name, n)));
  const fromMe = persons.some((p) => p.role === "from" && names.some((n) => nameHits(p.name, n)));
  if (toMe && !fromMe) return true;
  if (fromMe && !toMe) return false;
  return null;
}
function kindWord(raw: string): string | null {
  const t = fold(raw);
  if (/\bpix\b/.test(t)) return "Pix";
  if (/\bted\b/.test(t)) return "TED";
  if (/transferencia/.test(t)) return "Transferência";
  if (/deposito/.test(t)) return "Depósito";
  if (/boleto/.test(t)) return "Boleto";
  return null;
}
function isGeneric(description: string): boolean {
  const d = fold(description).replace(/[:\-–—]+/g, " ").replace(/\s+/g, " ").trim();
  if (!d) return true;
  return /^(valor|outros|pagamento|compra|lancamento|item|pix|transferencia|ted|doc|deposito|comprovante|transacao|total|data|hora|tipo|chave|origem|destino|banco|cpf|cnpj|nome)$/.test(d);
}
function isNoiseLine(line: string): boolean {
  const t = fold(line);
  if (!t.trim()) return true;
  if (/\b(cnpj|cpf)\b/.test(t) && !/\b(nome|para|de)\b/.test(t)) return true;
  return false;
}
function isNoiseDesc(description: string): boolean {
  const d = fold(description).replace(/[:\-–—]+/g, " ").replace(/\s+/g, " ").trim();
  if (!d || isGeneric(d)) return true;
  if (/tipo de transferencia/.test(d)) return true;
  if (/^chave(\s|\d|$)/.test(d)) return true;
  if (/^comprovante/.test(d)) return true;
  return false;
}
function describe(raw: string, incoming: boolean, person: Person | null): string | null {
  const kind = kindWord(raw);
  if (incoming) {
    const label = kind === "Pix" ? "Pix recebido" : kind === "TED" ? "TED recebida" : kind === "Transferência" ? "Transferência recebida" : "Entrada";
    if (person?.name) return `${label} de ${person.name}`;
    return label;
  }
  if (person?.role === "store") return person.name;
  if (person?.role === "to") return `${kind ?? "Pagamento"} para ${person.name}`;
  if (kind === "Pix") return isOutgoing(raw) ? "Pix enviado" : "Pix";
  return null;
}
function polish(item: ParsedItem, raw: string, incoming: boolean, person: Person | null): ParsedItem {
  const noisy = isGeneric(item.description) || isNoiseDesc(item.description);
  const label = describe(raw, incoming, person);
  if (!label) return item;
  if (!(incoming || noisy)) return item;
  return { ...item, description: label.slice(0, 160), category: incoming ? "Outros" : guessCategory(`${label} ${item.merchant ?? ""}`) };
}

function detectMethod(text: string): PayMethod | null {
  const t = fold(text);
  if (isIncoming(text)) return "entrada";
  const creditHints =
    /compra\s+no\s+credito|\bno\s+credito\b|compra\s+aprovada|compra\s+realizada|\bfatura\b|\bparcel[ao]|\d{1,2}\s*x\s*(?:de\s*)?r\$|\bcartao\b|\bfinal\s*\d{4}\b/.test(t);
  const debitHints =
    /compra\s+no\s+debito|\bno\s+debito\b|debito\s+aprovad/.test(t) ||
    (/\bdebito\b/.test(t) && !/\bcredito\b/.test(t));
  if (creditHints && !debitHints) return "credito";
  if (debitHints) return "debito";
  if (creditHints) return "credito";
  if (/dinheiro|especie|em especie/.test(t)) return "dinheiro";
  if (/\bpix\b|\bted\b|\bdoc\b|transferencia/.test(t)) {
    if (isOutgoing(text)) return "pix";
    return null;
  }
  return null;
}

function detectMerchant(text: string): string | null {
  const labeled = text.match(/estabelecimento\s*[:-]\s*(.+)/i);
  if (!labeled?.[1]) return null;
  const name = cleanDesc(labeled[1].split("\n")[0]);
  return name && !isNoiseDesc(name) ? name : null;
}
function cleanDesc(raw: string): string {
  return raw.replace(/\s+/g, " ").replace(/[|•·]+/g, " ").trim();
}
function findDate(text: string, now: Date): FoundDate | null {
  const iso = text.match(/\b(20\d{2})[-\/](\d{1,2})[-\/](\d{1,2})\b/);
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
  const br = text.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2}|\d{2})\b/);
  if (br) {
    let year = Number(br[3]);
    if (year < 100) year += 2000;
    return { year, month: Number(br[2]), day: Number(br[1]) };
  }
  const named = text.match(/\b(\d{1,2})\s+de\s+([a-zç]{3,9})(?:\s+de)?\s+(20\d{2})/i);
  if (named) {
    const mon = MONTHS[fold(named[2]).slice(0, 3)];
    if (mon) return { year: Number(named[3]), month: mon, day: Number(named[1]) };
  }
  return null;
}
function findPlan(text: string): { count: number; eachCents: number } | null {
  const patterns = [
    /(\d{1,2})\s*x\s*(?:de\s*)?(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/i,
    /(?:parcelado\s+em|em)\s*(\d{1,2})\s*(?:x|vezes)/i,
    /(?:total\s+de\s+)?(\d{1,2})\s*(?:parcelas|vezes)/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const count = Number(m[1]);
    if (count < 2 || count > 48) continue;
    const each = m[2] ? moneyTokenToCents(m[2]) : 0;
    return { count, eachCents: each };
  }
  return null;
}
function findParcel(text: string): { current: number; count: number } | null {
  const patterns = [
    /parcela\s*(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})/i,
    /(\d{1,2})\s*(?:ª|a)?\s*parcela\s*(?:de\s*)?(\d{1,2})/i,
    /(?:parc\.?|p\.?)\s*(\d{1,2})\s*[\/de]\s*(\d{1,2})/i,
    /(\d{1,2})\s*\/\s*(\d{1,2})(?!\d)/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const current = Number(m[1]);
    const count = Number(m[2]);
    if (current < 1 || count < 2 || current > count || count > 48) continue;
    return { current, count };
  }
  return null;
}
function findTotal(text: string): number | null {
  const patterns = [
    /(?:valor\s+(?:total|da\s+compra|do\s+pix|da\s+transferencia|recebido|pago|da\s+transacao)|total\s+geral|total)\s*:?\s*(?:R\$\s*)?(-?\d{1,3}(?:\.\d{3})+,\d{2}|-?\d+,\d{2})/gi,
    /(?:R\$\s*)(-?\d{1,3}(?:\.\d{3})+,\d{2}|-?\d+,\d{2})/g,
  ];
  const found: number[] = [];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const cents = moneyTokenToCents(m[1] ?? m[0]);
      if (cents > 0) found.push(cents);
    }
  }
  if (!found.length) return null;
  return Math.max(...found);
}
function lineAmount(line: string): number | null {
  const m = line.match(moneyRe());
  if (!m?.length) return null;
  return moneyTokenToCents(m[m.length - 1]);
}
function fallbackDate(now: Date): FoundDate {
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}
function parseCharges(raw: string, now: Date, merchant: string | null, skipIncoming: boolean): ParsedItem[] {
  const items: ParsedItem[] = [];
  const date = findDate(raw, now) ?? fallbackDate(now);
  for (const line of raw.split("\n")) {
    const l = line.trim();
    if (!l || isNoiseLine(l)) continue;
    if (skipIncoming && lineIsIncoming(l)) continue;
    if (PAYMENT.test(l) && !/recebid/.test(fold(l))) continue;
    const amount = lineAmount(l);
    if (amount == null || amount <= 0) continue;
    const desc = cleanDesc(l.replace(moneyRe(), " ").replace(/R\$/gi, " "));
    if (isNoiseDesc(desc) && !merchant) continue;
    items.push({
      description: (desc || merchant || "Lançamento").slice(0, 160),
      merchant,
      category: guessCategory(`${desc} ${merchant ?? ""}`),
      totalCents: amount,
      installments: 1,
      year: date.year,
      month: date.month,
      day: date.day,
    });
  }
  return items;
}
function singleItem(
  raw: string,
  now: Date,
  merchant: string | null,
  plan: { count: number; eachCents: number } | null,
  charges: ParsedItem[],
): ParsedItem | null {
  const labeled = findTotal(raw);
  const fromCharges = charges.length ? Math.max(...charges.map((c) => c.totalCents)) : 0;
  let total = labeled ?? fromCharges;
  if (!total || total <= 0) return null;
  const date = findDate(raw, now) ?? fallbackDate(now);
  const parcel = findParcel(raw);
  const installments = plan?.count ?? parcel?.count ?? 1;
  if (plan?.eachCents && plan.eachCents > 0 && installments > 1) total = plan.eachCents * installments;
  const line = charges[0]?.description ?? merchant ?? "Lançamento";
  const start = parcel && parcel.current > 1 ? addMonths(date, -(parcel.current - 1)) : date;
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

export function parseReceiptText(text: string, now = new Date(), identity?: ParseIdentity): ParseOutcome {
  const raw = text.replace(/\r/g, "").replace(/\u00a0/g, " ").trim();
  if (!raw) return { method: null, merchant: null, items: [] };
  const merchant = detectMerchant(raw);
  const plan = findPlan(raw);
  const rows = parseCharges(raw, now, merchant, true);
  const byId = directionFromIdentity(raw, identity);
  const incoming = byId === true || (byId === null && isIncoming(raw));
  const outgoing = byId === false || (byId === null && isOutgoing(raw));
  let method: PayMethod | null = incoming ? "entrada" : detectMethod(raw);
  if (byId === false) method = method === "entrada" || method == null ? "pix" : method;
  if (incoming) method = "entrada";
  if (method == null && !outgoing && /\bpix\b|transferencia|\bted\b/i.test(raw)) method = null;
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
  } else if (charges.length) {
    items = charges;
  } else {
    const item = singleItem(raw, now, merchant, plan, []);
    items = item ? [item] : [];
  }
  items = items.map((item) => polish(item, raw, incoming, person));
  return { method, merchant, items };
}

export function matchCardName(text: string, cards: { id: string; name: string }[]): string | null {
  const t = fold(text);
  for (const card of cards) {
    const n = fold(card.name);
    if (n && t.includes(n)) return card.id;
    const final = text.match(/(?:final|termina(?:ndo)?(?:\s+em)?)\s*(\d{4})/i);
    if (final && fold(card.name).includes(final[1])) return card.id;
  }
  return null;
}

/** Monta resultado do parser a partir do JSON estruturado da IA. */
export function outcomeFromAi(
  ai: {
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
  },
  now = new Date(),
): ParseOutcome {
  const installments = Math.max(1, Math.min(48, ai.installments || 1));
  const current = ai.currentInstallment && ai.currentInstallment >= 1 ? ai.currentInstallment : 1;
  const base: FoundDate = {
    year: ai.year && ai.year >= 2000 ? ai.year : now.getFullYear(),
    month: ai.month && ai.month >= 1 && ai.month <= 12 ? ai.month : now.getMonth() + 1,
    day: ai.day && ai.day >= 1 && ai.day <= 31 ? ai.day : now.getDate(),
  };
  const start = current > 1 ? addMonths(base, -(current - 1)) : base;
  const description =
    ai.description?.trim() ||
    ai.merchant?.trim() ||
    (ai.method === "credito" ? "Compra no crédito" : "Lançamento");
  return {
    method: ai.method,
    merchant: ai.merchant,
    items: [
      {
        description: description.slice(0, 160),
        merchant: ai.merchant,
        category: ai.category || guessCategory(description),
        totalCents: Math.round(ai.totalCents),
        installments,
        year: start.year,
        month: start.month,
        day: base.day,
      },
    ],
  };
}
