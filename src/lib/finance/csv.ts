import { brlPlain } from "./money";
import { chargeInMonth, occursInMonth, type Ym } from "./period";
import type { Bundle } from "./types";

function cell(value: string | number): string {
  const text = String(value ?? "");
  if (/[;"\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function dateOf(year: number, month: number, day: number | null): string {
  const dd = String(day ?? 1).padStart(2, "0");
  const mm = String(month).padStart(2, "0");
  return `${dd}/${mm}/${year}`;
}

export function bundleToCsv(bundle: Bundle, ym?: Ym): string {
  const start = bundle.profile.monthStartDay;
  const header = ["tipo", "data", "descricao", "categoria", "valor", "recorrente", "cartao", "parcelas"];
  const rows: string[][] = [header];
  const cardName = new Map(bundle.cards.map((c) => [c.id, c.name]));

  for (const row of bundle.incomes) {
    if (ym && !occursInMonth(row, ym, start)) continue;
    rows.push([
      "entrada",
      dateOf(row.year, row.month, row.day),
      row.description,
      row.kind,
      brlPlain(row.amountCents),
      row.recurring ? "sim" : "nao",
      "",
      "1",
    ]);
  }
  for (const row of bundle.expenses) {
    if (ym && !occursInMonth(row, ym, start)) continue;
    rows.push([
      row.fixed ? "gasto-fixo" : "gasto",
      dateOf(row.year, row.month, row.day),
      row.description,
      row.category,
      brlPlain(row.amountCents),
      row.recurring ? "sim" : "nao",
      "",
      "1",
    ]);
  }
  for (const row of bundle.purchases) {
    if (ym && chargeInMonth(row, ym, start) <= 0) continue;
    const amount = ym ? chargeInMonth(row, ym, start) : row.totalCents;
    rows.push([
      "cartao",
      dateOf(row.year, row.month, row.day),
      row.description,
      row.category,
      brlPlain(amount),
      "nao",
      cardName.get(row.cardId) ?? "",
      String(row.installments),
    ]);
  }
  return `\uFEFF${rows.map((r) => r.map(cell).join(";")).join("\n")}`;
}

export function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
