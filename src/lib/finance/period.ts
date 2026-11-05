import type { Dated, Expense, Income, Purchase } from "./types";

export type Ym = { year: number; month: number };

export function cmpYm(a: Ym, b: Ym): number {
  return a.year * 12 + a.month - (b.year * 12 + b.month);
}

export function addMonths(ym: Ym, n: number): Ym {
  const index = ym.year * 12 + (ym.month - 1) + n;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return { year, month };
}

export function shiftPeriod(year: number, month: number, day: number, startDay: number): Ym {
  if (startDay > 1 && day < startDay) {
    return addMonths({ year, month }, -1);
  }
  return { year, month };
}

export function itemPeriod(item: Dated, startDay: number): Ym {
  if (item.day && startDay > 1) return shiftPeriod(item.year, item.month, item.day, startDay);
  return { year: item.year, month: item.month };
}

export function todayYm(startDay: number, now = new Date()): Ym {
  return shiftPeriod(now.getFullYear(), now.getMonth() + 1, now.getDate(), startDay);
}

export function occursInMonth(
  item: Dated & { recurring: boolean },
  ym: Ym,
  startDay: number,
): boolean {
  const start = itemPeriod(item, startDay);
  if (item.recurring) return cmpYm(start, ym) <= 0;
  return cmpYm(start, ym) === 0;
}

export function installmentValue(p: Purchase, index: number): number {
  if (index < 0 || index >= p.installments) return 0;
  if (index === p.installments - 1) {
    return p.totalCents - p.installmentCents * (p.installments - 1);
  }
  return p.installmentCents;
}

export function chargeInMonth(p: Purchase, ym: Ym, startDay: number): number {
  const start = itemPeriod(p, startDay);
  for (let i = 0; i < p.installments; i += 1) {
    const at = addMonths(start, i);
    if (at.year === ym.year && at.month === ym.month) return installmentValue(p, i);
  }
  return 0;
}

export function openBalance(p: Purchase, ym: Ym, startDay: number): number {
  const start = itemPeriod(p, startDay);
  let sum = 0;
  for (let i = 0; i < p.installments; i += 1) {
    const at = addMonths(start, i);
    if (cmpYm(at, ym) >= 0) sum += installmentValue(p, i);
  }
  return sum;
}

export function isSettled(p: Purchase, ym: Ym, startDay: number): boolean {
  const last = addMonths(itemPeriod(p, startDay), p.installments - 1);
  return cmpYm(last, ym) < 0;
}

export function monthLabel(ym: Ym, withYear = false): string {
  const date = new Date(ym.year, ym.month - 1, 1);
  const label = date.toLocaleDateString("pt-BR", {
    month: withYear ? "long" : "short",
    year: withYear ? "numeric" : undefined,
  });
  return label.replace(".", "");
}

export function fullMonthLabel(ym: Ym): string {
  return new Date(ym.year, ym.month - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
}

export function dateLabel(item: Dated): string {
  if (!item.day) {
    return new Date(item.year, item.month - 1, 1).toLocaleDateString("pt-BR", {
      month: "short",
      year: "numeric",
    });
  }
  return new Date(item.year, item.month - 1, item.day).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function sumIncome(rows: Income[], ym: Ym, startDay: number): number {
  return rows.reduce((s, row) => (occursInMonth(row, ym, startDay) ? s + row.amountCents : s), 0);
}

export function sumExpenses(rows: Expense[], ym: Ym, startDay: number, fixed: boolean): number {
  return rows.reduce((s, row) => {
    if (row.fixed !== fixed) return s;
    return occursInMonth(row, ym, startDay) ? s + row.amountCents : s;
  }, 0);
}

export function invoiceTotal(rows: Purchase[], ym: Ym, startDay: number, cardId?: string): number {
  return rows.reduce((s, row) => {
    if (cardId && row.cardId !== cardId) return s;
    return s + chargeInMonth(row, ym, startDay);
  }, 0);
}

export function daysUntilDue(dueDay: number, now = new Date()): number {
  const day = Math.min(Math.max(dueDay, 1), 31);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let due = clampDate(start.getFullYear(), start.getMonth(), day);
  if (due < start) due = clampDate(start.getFullYear(), start.getMonth() + 1, day);
  return Math.round((due.getTime() - start.getTime()) / 86_400_000);
}

function clampDate(year: number, monthIndex: number, day: number): Date {
  const last = new Date(year, monthIndex + 1, 0).getDate();
  return new Date(year, monthIndex, Math.min(day, last));
}

export function categorySpend(
  expenses: Expense[],
  purchases: Purchase[],
  ym: Ym,
  startDay: number,
): Map<string, number> {
  const map = new Map<string, number>();
  const add = (category: string, cents: number) => {
    if (!cents) return;
    map.set(category, (map.get(category) ?? 0) + cents);
  };
  for (const row of expenses) {
    if (occursInMonth(row, ym, startDay)) add(row.category, row.amountCents);
  }
  for (const row of purchases) add(row.category, chargeInMonth(row, ym, startDay));
  return map;
}
