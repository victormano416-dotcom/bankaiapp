import { brl } from "./money";
import {
  addMonths,
  categorySpend,
  invoiceTotal,
  sumExpenses,
  sumIncome,
  type Ym,
} from "./period";
import type { Bundle } from "./types";

export function leftover(bundle: Bundle, ym: Ym): number {
  const start = bundle.profile.monthStartDay;
  return (
    sumIncome(bundle.incomes, ym, start) -
    sumExpenses(bundle.expenses, ym, start, true) -
    sumExpenses(bundle.expenses, ym, start, false) -
    invoiceTotal(bundle.purchases, ym, start)
  );
}

export function buildInsights(bundle: Bundle, ym: Ym, hidden = false): string[] {
  const start = bundle.profile.monthStartDay;
  const lines: string[] = [];
  const spend = categorySpend(bundle.expenses, bundle.purchases, ym, start);
  const total = [...spend.values()].reduce((s, n) => s + n, 0);
  if (total > 0) {
    const top = [...spend.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top) {
      const pct = Math.round((top[1] / total) * 100);
      lines.push(
        hidden
          ? `Sua maior categoria foi ${top[0]}.`
          : `Sua maior categoria foi ${top[0]} (${pct}%).`,
      );
    }
  }
  const prev = addMonths(ym, -1);
  const prevActivity =
    sumIncome(bundle.incomes, prev, start) +
    sumExpenses(bundle.expenses, prev, start, true) +
    sumExpenses(bundle.expenses, prev, start, false) +
    invoiceTotal(bundle.purchases, prev, start);
  if (prevActivity > 0) {
    const nowLeft = leftover(bundle, ym);
    const prevLeft = leftover(bundle, prev);
    if (prevLeft !== 0) {
      const delta = (nowLeft - prevLeft) / Math.abs(prevLeft);
      if (delta <= -0.12) {
        lines.push(`Sobra ${Math.round(Math.abs(delta) * 100)}% menor que o mês passado.`);
      } else if (delta >= 0.12) {
        lines.push(`Sobra ${Math.round(delta * 100)}% maior que o mês passado.`);
      }
    }
  }
  const budgets = bundle.budgets
    .map((b) => ({ ...b, spent: spend.get(b.category) ?? 0 }))
    .filter((b) => b.limitCents > 0 && b.spent >= b.limitCents);
  if (budgets[0]) {
    lines.push(
      hidden
        ? `${budgets[0].category} passou do orçamento.`
        : `${budgets[0].category} passou do orçamento (${brl(budgets[0].spent)}).`,
    );
  }
  return lines.slice(0, 2);
}
