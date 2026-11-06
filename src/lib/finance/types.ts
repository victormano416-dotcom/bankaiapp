export const THEMES = ["obsidian", "paper", "aurora", "forest", "sand"] as const;
export type ThemeId = (typeof THEMES)[number];

export const CATEGORIES = [
  "Moradia",
  "Mercado",
  "Transporte",
  "Saúde",
  "Lazer",
  "Assinaturas",
  "Educação",
  "Restaurante",
  "Roupas",
  "Outros",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const INCOME_KINDS = [
  { id: "salario", label: "Salário" },
  { id: "extra", label: "Renda extra" },
  { id: "freelance", label: "Freelance" },
  { id: "investimentos", label: "Investimentos" },
  { id: "outros", label: "Outros" },
] as const;
export type IncomeKind = (typeof INCOME_KINDS)[number]["id"];

export const CARD_TONES = ["ink", "dusk", "moss", "clay", "mist"] as const;
export type CardTone = (typeof CARD_TONES)[number];

export const METHODS = [
  { id: "credito", label: "Crédito" },
  { id: "debito", label: "Débito" },
  { id: "pix", label: "PIX" },
  { id: "dinheiro", label: "Dinheiro" },
  { id: "entrada", label: "Entrada" },
] as const;
export type PayMethod = (typeof METHODS)[number]["id"];

export type Profile = {
  displayName: string;
  /** Nome completo como aparece no Pix/TED (para o leitor saber se você enviou ou recebeu). */
  legalName: string;
  /** Só dígitos do CPF (4 a 11). Usado só no aparelho para bater com o comprovante. */
  cpfHint: string;
  avatar: string | null;
  appName: string;
  theme: ThemeId;
  monthStartDay: number;
  privacyHidden: boolean;
  ambient: boolean;
  celebrate: boolean;
  onboarded: boolean;
};

export type Income = {
  id: string;
  kind: IncomeKind;
  description: string;
  amountCents: number;
  recurring: boolean;
  year: number;
  month: number;
  day: number | null;
  createdAt: string;
};

export type Expense = {
  id: string;
  category: string;
  description: string;
  amountCents: number;
  fixed: boolean;
  recurring: boolean;
  year: number;
  month: number;
  day: number | null;
  createdAt: string;
};

export type Card = {
  id: string;
  name: string;
  limitCents: number;
  dueDay: number;
  tone: CardTone;
  createdAt: string;
};

export type Purchase = {
  id: string;
  cardId: string;
  description: string;
  category: string;
  merchant: string | null;
  totalCents: number;
  installments: number;
  installmentCents: number;
  year: number;
  month: number;
  day: number | null;
  createdAt: string;
};

export type Goal = {
  id: string;
  name: string;
  targetCents: number;
  savedCents: number;
  year: number;
  month: number;
  done: boolean;
  createdAt: string;
};

export type Budget = {
  id: string;
  category: string;
  limitCents: number;
};

export type Bundle = {
  profile: Profile;
  incomes: Income[];
  expenses: Expense[];
  cards: Card[];
  purchases: Purchase[];
  goals: Goal[];
  budgets: Budget[];
};

export type Dated = {
  year: number;
  month: number;
  day: number | null;
};

export type IncomeInput = Omit<Income, "id" | "createdAt">;
export type ExpenseInput = Omit<Expense, "id" | "createdAt">;
export type CardInput = Omit<Card, "id" | "createdAt">;
export type PurchaseInput = Omit<Purchase, "id" | "createdAt">;
export type GoalInput = Omit<Goal, "id" | "createdAt" | "done">;
