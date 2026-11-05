import { cmpYm, isSettled, itemPeriod, todayYm } from "./period";
import type { Budget, Bundle, Card, Expense, Goal, Income, Profile, Purchase } from "./types";
import { applyProfilePatch, type Mutation } from "./validate";

/** Lógica pura do caixa (sem rede): usada por api.ts, que só lê/grava no Supabase. */

const BASE_PROFILE: Profile = {
  displayName: "",
  avatar: null,
  appName: "BANKAI",
  theme: "obsidian",
  monthStartDay: 1,
  privacyHidden: false,
  ambient: false,
  celebrate: true,
  onboarded: false,
};

export function emptyBundle(): Bundle {
  return { profile: { ...BASE_PROFILE }, incomes: [], expenses: [], cards: [], purchases: [], goals: [], budgets: [] };
}

const uuid = () => crypto.randomUUID();
const stamp = () => new Date().toISOString();
const list = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
const recent = <T extends { year: number; month: number; createdAt: string }>(a: T, b: T) =>
  b.year - a.year || b.month - a.month || b.createdAt.localeCompare(a.createdAt);

/** Aceita o JSON salvo (ou `{}` de conta nova) e devolve um Bundle completo e ordenado. */
export function normalize(raw: unknown): Bundle {
  const base = emptyBundle();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<Bundle>;
  return {
    profile: applyProfilePatch(base.profile, (r.profile ?? {}) as Partial<Profile>),
    incomes: list<Income>(r.incomes).sort(recent),
    expenses: list<Expense>(r.expenses).sort(recent),
    cards: list<Card>(r.cards).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    purchases: list<Purchase>(r.purchases).sort(recent),
    goals: list<Goal>(r.goals)
      .map((goal) => ({ ...goal, done: goal.done || goal.savedCents >= goal.targetCents }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    budgets: list<Budget>(r.budgets).sort((a, b) => a.category.localeCompare(b.category)),
  };
}

function fresh<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.map((row) => {
    let id = row.id;
    while (!id || seen.has(id)) id = uuid();
    seen.add(id);
    return { ...row, id };
  });
}

function find<T extends { id: string }>(rows: T[], id: string, message: string): number {
  const index = rows.findIndex((row) => row.id === id);
  if (index < 0) throw new Error(message);
  return index;
}

/** Aplica uma mutação já validada (sanitizeMutation) e devolve um novo Bundle. */
export function applyMutation(current: Bundle, mutation: Mutation): Bundle {
  const next = structuredClone(current);

  switch (mutation.op) {
    case "profile":
      next.profile = applyProfilePatch(next.profile, mutation.profile);
      break;

    case "launch": {
      let newCardId = "";
      if (mutation.newCard) {
        newCardId = uuid();
        next.cards.push({ ...mutation.newCard, id: newCardId, createdAt: stamp() });
      }
      for (const item of mutation.items) {
        const id = uuid();
        if (item.kind === "income") {
          next.incomes.push({ ...item.data, id, createdAt: stamp() });
        } else if (item.kind === "expense") {
          next.expenses.push({ ...item.data, id, createdAt: stamp() });
        } else {
          const cardId = item.data.cardId || newCardId;
          if (!cardId) throw new Error("Escolha um cartão.");
          if (!next.cards.some((card) => card.id === cardId)) throw new Error("Cartão não encontrado.");
          next.purchases.push({
            ...item.data,
            id,
            cardId,
            installmentCents: Math.floor(item.data.totalCents / item.data.installments),
            createdAt: stamp(),
          });
        }
      }
      break;
    }

    case "save-income": {
      const i = find(next.incomes, mutation.id, "Entrada não encontrada.");
      next.incomes[i] = { ...next.incomes[i], ...mutation.data };
      break;
    }
    case "delete-income":
      next.incomes = next.incomes.filter((row) => row.id !== mutation.id);
      break;

    case "save-expense": {
      const i = find(next.expenses, mutation.id, "Gasto não encontrado.");
      next.expenses[i] = { ...next.expenses[i], ...mutation.data };
      break;
    }
    case "delete-expense":
      next.expenses = next.expenses.filter((row) => row.id !== mutation.id);
      break;

    case "save-card": {
      const i = find(next.cards, mutation.id, "Cartão não encontrado.");
      next.cards[i] = { ...next.cards[i], ...mutation.data };
      break;
    }
    case "delete-card":
      next.purchases = next.purchases.filter((row) => row.cardId !== mutation.id);
      next.cards = next.cards.filter((row) => row.id !== mutation.id);
      break;

    case "delete-purchase":
      next.purchases = next.purchases.filter((row) => row.id !== mutation.id);
      break;

    case "save-goal": {
      const done = mutation.data.savedCents >= mutation.data.targetCents;
      if (!mutation.id) {
        next.goals.push({ ...mutation.data, id: uuid(), done, createdAt: stamp() });
      } else {
        const i = find(next.goals, mutation.id, "Meta não encontrada.");
        next.goals[i] = { ...next.goals[i], ...mutation.data, done };
      }
      break;
    }
    case "delete-goal":
      next.goals = next.goals.filter((row) => row.id !== mutation.id);
      break;

    case "save-budget": {
      if (mutation.limitCents <= 0) throw new Error("Informe o limite da categoria.");
      const existing = next.budgets.find((row) => row.category === mutation.category);
      if (existing) existing.limitCents = mutation.limitCents;
      else next.budgets.push({ id: uuid(), category: mutation.category, limitCents: mutation.limitCents });
      break;
    }
    case "delete-budget":
      next.budgets = next.budgets.filter((row) => row.id !== mutation.id);
      break;

    case "purge": {
      const day = next.profile.monthStartDay;
      const ym = todayYm(day);
      next.purchases = next.purchases.filter((row) => !isSettled(row, ym, day));
      next.expenses = next.expenses.filter((row) => row.recurring || cmpYm(itemPeriod(row, day), ym) >= 0);
      break;
    }

    case "import": {
      const snap = mutation.snapshot;
      next.profile = applyProfilePatch({ ...next.profile, ...snap.profile }, snap.profile);
      next.cards = fresh(snap.cards);
      const cardIds = new Set(next.cards.map((row) => row.id));
      next.incomes = fresh(snap.incomes);
      next.expenses = fresh(snap.expenses);
      next.purchases = fresh(snap.purchases.filter((row) => cardIds.has(row.cardId)));
      next.goals = fresh(snap.goals).map((goal) => ({ ...goal, done: goal.savedCents >= goal.targetCents }));
      next.budgets = fresh(snap.budgets.filter((row) => row.limitCents > 0));
      break;
    }
  }

  return normalize(next);
}
