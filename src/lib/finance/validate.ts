import {
  CARD_TONES,
  CATEGORIES,
  INCOME_KINDS,
  THEMES,
  type Bundle,
  type CardInput,
  type ExpenseInput,
  type GoalInput,
  type IncomeInput,
  type PayMethod,
  type Profile,
  type PurchaseInput,
  type ThemeId,
} from "./types";

const METHODS: PayMethod[] = ["credito", "debito", "pix", "dinheiro", "entrada"];

export type LaunchItem =
  | { kind: "income"; data: IncomeInput }
  | { kind: "expense"; data: ExpenseInput }
  | { kind: "purchase"; data: PurchaseInput };

export type Mutation =
  | { op: "profile"; profile: Partial<Profile> }
  | { op: "launch"; items: LaunchItem[]; newCard?: CardInput }
  | { op: "save-income"; id: string; data: IncomeInput }
  | { op: "delete-income"; id: string }
  | { op: "save-expense"; id: string; data: ExpenseInput }
  | { op: "delete-expense"; id: string }
  | { op: "save-card"; id: string; data: CardInput }
  | { op: "delete-card"; id: string }
  | { op: "delete-purchase"; id: string }
  | { op: "save-goal"; id?: string; data: GoalInput }
  | { op: "delete-goal"; id: string }
  | { op: "save-budget"; category: string; limitCents: number }
  | { op: "delete-budget"; id: string }
  | { op: "purge" }
  | { op: "import"; snapshot: Bundle };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown, max: number, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function int(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function cents(value: unknown): number {
  return int(value, 0, 100_000_000_000, 0);
}

function flag(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  return fallback;
}

function idOf(value: unknown): string {
  const id = text(value, 80);
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(id)) throw new Error("Identificador inválido.");
  return id;
}

function optionalId(value: unknown): string | undefined {
  if (value == null || value === "") return undefined;
  return idOf(value);
}

function period(value: Record<string, unknown>): { year: number; month: number; day: number | null } {
  const year = int(value.year, 2000, 2100, new Date().getFullYear());
  const month = int(value.month, 1, 12, new Date().getMonth() + 1);
  const dayRaw = value.day;
  const day = dayRaw == null || dayRaw === "" ? null : int(dayRaw, 1, 31, 1);
  return { year, month, day };
}

function categoryOf(value: unknown): string {
  const name = text(value, 40, "Outros");
  if ((CATEGORIES as readonly string[]).includes(name)) return name;
  return name || "Outros";
}

function cpfHintOf(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\D/g, "").slice(0, 11);
}

export function incomeInput(value: unknown): IncomeInput {
  if (!isRecord(value)) throw new Error("Entrada inválida.");
  const kind = text(value.kind, 32, "outros");
  const known = INCOME_KINDS.some((k) => k.id === kind);
  const amountCents = cents(value.amountCents);
  if (amountCents <= 0) throw new Error("Informe um valor.");
  return {
    kind: (known ? kind : "outros") as IncomeInput["kind"],
    description: text(value.description, 160, "Entrada"),
    amountCents,
    recurring: flag(value.recurring),
    ...period(value),
  };
}

export function expenseInput(value: unknown): ExpenseInput {
  if (!isRecord(value)) throw new Error("Gasto inválido.");
  const amountCents = cents(value.amountCents);
  if (amountCents <= 0) throw new Error("Informe um valor.");
  return {
    category: categoryOf(value.category),
    description: text(value.description, 160, "Gasto"),
    amountCents,
    fixed: flag(value.fixed),
    recurring: flag(value.recurring),
    ...period(value),
  };
}

export function cardInput(value: unknown): CardInput {
  if (!isRecord(value)) throw new Error("Cartão inválido.");
  const tone = text(value.tone, 16, "ink");
  const limitCents = cents(value.limitCents);
  if (limitCents <= 0) throw new Error("Informe o limite do cartão.");
  const name = text(value.name, 40);
  if (!name) throw new Error("Dê um nome ao cartão.");
  return {
    name,
    limitCents,
    dueDay: int(value.dueDay, 1, 28, 1),
    tone: (CARD_TONES as readonly string[]).includes(tone) ? (tone as CardInput["tone"]) : "ink",
  };
}

export function purchaseInput(value: unknown): PurchaseInput {
  if (!isRecord(value)) throw new Error("Compra inválida.");
  const totalCents = cents(value.totalCents);
  if (totalCents <= 0) throw new Error("Informe um valor.");
  const installments = int(value.installments, 1, 48, 1);
  const installmentCents = Math.floor(totalCents / installments);
  const cardId = text(value.cardId, 80);
  return {
    cardId,
    description: text(value.description, 160, "Compra"),
    category: categoryOf(value.category),
    merchant: text(value.merchant, 80) || null,
    totalCents,
    installments,
    installmentCents,
    ...period(value),
  };
}

export function goalInput(value: unknown): GoalInput {
  if (!isRecord(value)) throw new Error("Meta inválida.");
  const name = text(value.name, 60);
  if (!name) throw new Error("Dê um nome à meta.");
  const targetCents = cents(value.targetCents);
  if (targetCents <= 0) throw new Error("Informe o valor da meta.");
  return {
    name,
    targetCents,
    savedCents: cents(value.savedCents),
    ...period(value),
  };
}

function profilePatch(value: unknown): Partial<Profile> {
  if (!isRecord(value)) throw new Error("Perfil inválido.");
  const patch: Partial<Profile> = {};
  if ("displayName" in value) patch.displayName = text(value.displayName, 40);
  if ("legalName" in value) patch.legalName = text(value.legalName, 80);
  if ("cpfHint" in value) patch.cpfHint = cpfHintOf(value.cpfHint);
  if ("avatar" in value) {
    const avatar = typeof value.avatar === "string" ? value.avatar : null;
    patch.avatar = avatar && avatar.length < 300_000 ? avatar : null;
  }
  if ("appName" in value) patch.appName = text(value.appName, 24, "BANKAI") || "BANKAI";
  if ("theme" in value && (THEMES as readonly string[]).includes(String(value.theme))) {
    patch.theme = value.theme as ThemeId;
  }
  if ("monthStartDay" in value) patch.monthStartDay = int(value.monthStartDay, 1, 28, 1);
  if ("privacyHidden" in value) patch.privacyHidden = flag(value.privacyHidden);
  if ("ambient" in value) patch.ambient = flag(value.ambient);
  if ("celebrate" in value) patch.celebrate = flag(value.celebrate);
  if ("onboarded" in value) patch.onboarded = flag(value.onboarded);
  return patch;
}

export function applyProfilePatch(current: Profile, patch: Partial<Profile>): Profile {
  const next: Profile = {
    legalName: "",
    cpfHint: "",
    ...current,
    ...patch,
  };
  if (!next.appName) next.appName = "BANKAI";
  if (!(THEMES as readonly string[]).includes(next.theme)) next.theme = "obsidian";
  next.monthStartDay = int(next.monthStartDay, 1, 28, 1);
  next.legalName = text(next.legalName, 80);
  next.cpfHint = cpfHintOf(next.cpfHint);
  return next;
}

function snapshot(value: unknown): Bundle {
  if (!isRecord(value)) throw new Error("Arquivo de backup inválido.");
  const profile = isRecord(value.profile) ? profilePatch(value.profile) : {};
  const asList = (key: string) => (Array.isArray(value[key]) ? value[key] : []);
  if (asList("incomes").length + asList("expenses").length + asList("purchases").length > 5000) {
    throw new Error("Backup grande demais.");
  }
  return {
    profile: {
      displayName: "",
      legalName: "",
      cpfHint: "",
      avatar: null,
      appName: "BANKAI",
      theme: "obsidian",
      monthStartDay: 1,
      privacyHidden: false,
      ambient: false,
      celebrate: true,
      onboarded: true,
      ...profile,
    },
    incomes: asList("incomes").slice(0, 2000).map((row) => ({ ...incomeInput(row), id: rowId(row), createdAt: "" })),
    expenses: asList("expenses").slice(0, 2000).map((row) => ({ ...expenseInput(row), id: rowId(row), createdAt: "" })),
    cards: asList("cards").slice(0, 50).map((row) => ({ ...cardInput(row), id: rowId(row), createdAt: "" })),
    purchases: asList("purchases").slice(0, 2000).map((row) => ({ ...purchaseInput(row), id: rowId(row), createdAt: "" })),
    goals: asList("goals").slice(0, 100).map((row) => ({
      ...goalInput(row),
      id: rowId(row),
      done: false,
      createdAt: "",
    })),
    budgets: asList("budgets").slice(0, 40).map((row) => {
      if (!isRecord(row)) throw new Error("Orçamento inválido.");
      return { id: rowId(row), category: categoryOf(row.category), limitCents: cents(row.limitCents) };
    }),
  };
}

function rowId(row: unknown): string {
  if (isRecord(row) && typeof row.id === "string" && /^[a-zA-Z0-9_-]{8,80}$/.test(row.id)) return row.id;
  return crypto.randomUUID();
}

function launchItem(value: unknown): LaunchItem {
  if (!isRecord(value)) throw new Error("Lançamento inválido.");
  if (value.kind === "income") return { kind: "income", data: incomeInput(value.data) };
  if (value.kind === "expense") return { kind: "expense", data: expenseInput(value.data) };
  if (value.kind === "purchase") return { kind: "purchase", data: purchaseInput(value.data) };
  throw new Error("Lançamento inválido.");
}

export function sanitizeMutation(input: unknown): Mutation {
  if (!isRecord(input)) throw new Error("Pedido inválido.");
  switch (input.op) {
    case "profile":
      return { op: "profile", profile: profilePatch(input.profile) };
    case "launch": {
      const rawItems = Array.isArray(input.items) ? input.items : [];
      if (rawItems.length > 200) throw new Error("Muitos lançamentos de uma vez.");
      const newCard = input.newCard ? cardInput(input.newCard) : undefined;
      const items = rawItems.map(launchItem);
      if (!items.length && !newCard) throw new Error("Nada para lançar.");
      return { op: "launch", items, newCard };
    }
    case "save-income":
      return { op: "save-income", id: idOf(input.id), data: incomeInput(input.data) };
    case "delete-income":
      return { op: "delete-income", id: idOf(input.id) };
    case "save-expense":
      return { op: "save-expense", id: idOf(input.id), data: expenseInput(input.data) };
    case "delete-expense":
      return { op: "delete-expense", id: idOf(input.id) };
    case "save-card":
      return { op: "save-card", id: idOf(input.id), data: cardInput(input.data) };
    case "delete-card":
      return { op: "delete-card", id: idOf(input.id) };
    case "delete-purchase":
      return { op: "delete-purchase", id: idOf(input.id) };
    case "save-goal":
      return { op: "save-goal", id: optionalId(input.id), data: goalInput(input.data) };
    case "delete-goal":
      return { op: "delete-goal", id: idOf(input.id) };
    case "save-budget":
      return {
        op: "save-budget",
        category: categoryOf(input.category),
        limitCents: cents(input.limitCents),
      };
    case "delete-budget":
      return { op: "delete-budget", id: idOf(input.id) };
    case "purge":
      return { op: "purge" };
    case "import":
      return { op: "import", snapshot: snapshot(input.snapshot) };
    default:
      throw new Error("Pedido inválido.");
  }
}

export function isMethod(value: string): value is PayMethod {
  return (METHODS as string[]).includes(value);
}
