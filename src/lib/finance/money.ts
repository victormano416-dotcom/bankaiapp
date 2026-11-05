export function brl(cents: number, hidden = false): string {
  if (hidden) return "••••";
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function brlPlain(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Digits are cents: "39400" and "394,00" both become 39400. */
export function centsFromText(raw: string): number {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return 0;
  const n = Number(digits);
  if (!Number.isFinite(n)) return 0;
  return Math.min(n, 100_000_000_000);
}

export function parseBrlNumber(token: string): number {
  const clean = token.trim().replace(/\./g, "").replace(",", ".");
  const n = Number(clean);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}
