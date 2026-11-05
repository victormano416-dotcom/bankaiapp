import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { buildInsights, leftover } from "@/lib/finance/insights";
import { brl } from "@/lib/finance/money";
import {
  addMonths,
  daysUntilDue,
  invoiceTotal,
  monthLabel,
  openBalance,
  sumExpenses,
  sumIncome,
} from "@/lib/finance/period";
import { useFinance } from "./provider";
import { Button, Money, PlasticCard } from "./ui";

export function HomeView() {
  const { bundle, ym, openQuick, setTab } = useFinance();
  const hidden = bundle.profile.privacyHidden;
  const start = bundle.profile.monthStartDay;
  const income = sumIncome(bundle.incomes, ym, start);
  const fixed = sumExpenses(bundle.expenses, ym, start, true);
  const variable = sumExpenses(bundle.expenses, ym, start, false);
  const invoice = invoiceTotal(bundle.purchases, ym, start);
  const left = leftover(bundle, ym);
  const insights = buildInsights(bundle, ym, hidden);
  const points = Array.from({ length: 6 }, (_, index) => {
    const at = addMonths(ym, index);
    return { label: monthLabel(at), value: invoiceTotal(bundle.purchases, at, start) / 100 };
  });
  const hasCurve = points.some((point) => point.value > 0);
  const goals = bundle.goals.filter((goal) => !goal.done).slice(0, 2);

  return (
    <div className="space-y-8">
      <section>
        <p className="text-xs tracking-widest text-muted uppercase">Sobra do mês</p>
        <p className={`mt-2 text-5xl font-medium tracking-tight ${left < 0 ? "text-danger" : ""}`}>
          <Money cents={left} hidden={hidden} />
        </p>
        <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-3xl ring-1 ring-line">
          <Stat label="Entradas" cents={income} hidden={hidden} />
          <Stat label="Fixos" cents={fixed} hidden={hidden} />
          <Stat label="Variáveis" cents={variable} hidden={hidden} />
          <Stat label="Fatura" cents={invoice} hidden={hidden} />
        </dl>
      </section>

      {insights.length ? (
        <p className="text-sm text-muted">{insights.join(" ")}</p>
      ) : income > 0 ? (
        <p className="text-sm text-muted">Nada saiu neste mês. A sobra é o que entrou.</p>
      ) : (
        <p className="text-sm text-muted">Lance a primeira entrada para ver a sobra com clareza.</p>
      )}

      <div className="flex gap-2">
        <Button tone="line" className="h-10 px-4" onClick={() => openQuick({ method: "entrada" })}>
          Entrada
        </Button>
        <Button tone="line" className="h-10 px-4" onClick={() => openQuick({ method: "pix" })}>
          Gasto
        </Button>
        <Button tone="line" className="h-10 px-4" onClick={() => setTab("cards")}>
          Cartão
        </Button>
      </div>

      <DueList />

      <section className="rounded-3xl p-4 ring-1 ring-line">
        <h2 className="px-1 text-sm text-muted">Faturas à frente</h2>
        {hasCurve && !hidden ? (
          <div className="mt-3 h-36">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={points} margin={{ top: 12, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="invoice-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--c-accent)" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="var(--c-accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "var(--c-muted)", fontSize: 12 }} />
                <Tooltip
                  cursor={false}
                  content={({ active, payload, label }) =>
                    active && payload?.[0] ? (
                      <div className="rounded-xl bg-surface px-3 py-2 text-xs ring-1 ring-line">
                        <div className="text-muted">{label}</div>
                        <div className="tabular-nums">{brl(Math.round(Number(payload[0].value) * 100))}</div>
                      </div>
                    ) : null
                  }
                />
                <Area type="monotone" dataKey="value" stroke="var(--c-accent)" fill="url(#invoice-fill)" strokeWidth={1.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="mt-3 text-sm text-subtle">
            {hidden ? "Valores ocultos." : "A curva aparece quando houver compra no cartão."}
          </p>
        )}
      </section>

      <section className="space-y-3">
        {bundle.cards.length ? (
          bundle.cards.map((card) => {
            const used = bundle.purchases
              .filter((row) => row.cardId === card.id)
              .reduce((sum, row) => sum + openBalance(row, ym, start), 0);
            const monthInvoice = invoiceTotal(bundle.purchases, ym, start, card.id);
            const ratio = card.limitCents > 0 ? used / card.limitCents : 0;
            const days = daysUntilDue(card.dueDay);
            const alert =
              ratio >= 1 ? "Limite tomado." : ratio >= 0.8 ? "Acima de 80% do limite." : days <= 5 ? (days === 0 ? "Vence hoje." : `Vence em ${days} dias.`) : null;
            return (
              <PlasticCard
                key={card.id}
                card={card}
                used={used}
                invoice={monthInvoice}
                hidden={hidden}
                alert={alert}
                onClick={() => setTab("cards")}
              />
            );
          })
        ) : (
          <button type="button" onClick={() => setTab("cards")} className="plastic w-full p-5 text-left">
            <p className="text-xs tracking-widest text-muted uppercase">Cartão</p>
            <p className="mt-3 text-lg">Adicione o primeiro cartão</p>
            <p className="mt-1 text-sm text-muted">Limite, vencimento e fatura no mesmo cartão.</p>
          </button>
        )}
      </section>

      {goals.length ? (
        <section className="space-y-3">
          {goals.map((goal) => {
            const pct = Math.min(100, Math.round((goal.savedCents / goal.targetCents) * 100));
            return (
              <button key={goal.id} type="button" onClick={() => setTab("more")} className="block w-full text-left">
                <div className="flex justify-between text-sm">
                  <span>{goal.name}</span>
                  <span className="text-muted tabular-nums">{hidden ? "••••" : `${pct}%`}</span>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-line">
                  <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
                </div>
              </button>
            );
          })}
        </section>
      ) : null}
    </div>
  );
}

function Stat({ label, cents, hidden }: { label: string; cents: number; hidden: boolean }) {
  return (
    <div className="bg-surface px-4 py-4">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 text-sm">
        <Money cents={cents} hidden={hidden} />
      </dd>
    </div>
  );
}

function DueList() {
  const { bundle } = useFinance();
  const due = bundle.cards
    .map((card) => ({ card, days: daysUntilDue(card.dueDay) }))
    .filter((item) => item.days <= 5);
  if (!due.length) return null;
  return (
    <div className="space-y-2">
      {due.map(({ card, days }) => (
        <p key={card.id} className="badge-due rounded-full px-4 py-2 text-sm">
          {card.name} {days === 0 ? "vence hoje" : `vence em ${days} ${days === 1 ? "dia" : "dias"}`}
        </p>
      ))}
    </div>
  );
}
