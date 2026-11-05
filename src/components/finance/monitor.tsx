import { useState } from "react";
import { CATEGORIES } from "@/lib/finance/types";
import { brl, centsFromText } from "@/lib/finance/money";
import { categorySpend } from "@/lib/finance/period";
import { useFinance } from "./provider";
import { Button, Empty, Field, Money, fieldClass } from "./ui";

export function MonitorView() {
  const { bundle, ym, commit, busy } = useFinance();
  const hidden = bundle.profile.privacyHidden;
  const spend = categorySpend(bundle.expenses, bundle.purchases, ym, bundle.profile.monthStartDay);
  const ranked = [...spend.entries()].sort((a, b) => b[1] - a[1]);
  const max = ranked[0]?.[1] ?? 1;
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [digits, setDigits] = useState("");

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-medium">Monitor</h2>
      {ranked.length === 0 ? (
        <Empty title="Nada para comparar" body="Os gastos e as parcelas do mês aparecem aqui, por categoria." />
      ) : (
        <ul className="space-y-4">
          {ranked.map(([name, cents]) => {
            const budget = bundle.budgets.find((item) => item.category === name);
            const ratio = budget ? cents / budget.limitCents : cents / max;
            const hot = budget ? cents / budget.limitCents : 0;
            return (
              <li key={name}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span>{name}</span>
                  <span className="tabular-nums text-muted">
                    <Money cents={cents} hidden={hidden} />
                    {budget ? (
                      <>
                        {" / "}
                        <Money cents={budget.limitCents} hidden={hidden} />
                      </>
                    ) : null}
                  </span>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-line">
                  <div
                    className={`h-full ${hot >= 1 ? "bg-danger" : hot >= 0.8 ? "bg-warn" : "bg-accent"}`}
                    style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }}
                  />
                </div>
                {budget && hot >= 0.8 ? (
                  <p className={`mt-1 text-xs ${hot >= 1 ? "text-danger" : "text-warn"}`}>
                    {hot >= 1 ? "Passou do orçamento." : "Chegou a 80% do orçamento."}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <section className="space-y-3">
        <h3 className="text-sm text-muted">Orçamento do mês</h3>
        <Field label="Categoria">
          <select className={fieldClass} value={category} onChange={(event) => setCategory(event.target.value)}>
            {CATEGORIES.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </Field>
        <Field label="Limite">
          <input
            className={fieldClass}
            inputMode="numeric"
            placeholder="R$ 0,00"
            value={digits ? brl(centsFromText(digits)) : ""}
            onChange={(event) => setDigits(event.target.value.replace(/\D/g, "").slice(0, 11))}
          />
        </Field>
        <Button
          className="w-full"
          disabled={busy}
          onClick={() => {
            const limitCents = centsFromText(digits);
            if (limitCents <= 0) return;
            void commit({ op: "save-budget", category, limitCents });
          }}
        >
          Guardar limite
        </Button>
        <ul className="divide-y divide-line">
          {bundle.budgets.map((budget) => (
            <li key={budget.id} className="flex items-center justify-between py-3 text-sm">
              <span>
                {budget.category} · <Money cents={budget.limitCents} hidden={hidden} />
              </span>
              <button type="button" className="text-muted" onClick={() => void commit({ op: "delete-budget", id: budget.id })}>
                Remover
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
