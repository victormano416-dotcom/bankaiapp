import { useState } from "react";
import { CATEGORIES, INCOME_KINDS, type Expense, type Income } from "@/lib/finance/types";
import { brl, centsFromText } from "@/lib/finance/money";
import { dateLabel, occursInMonth } from "@/lib/finance/period";
import { useFinance } from "./provider";
import { Button, Empty, Field, Modal, Money, fieldClass } from "./ui";

export function MoneyLists({ kind }: { kind: "income" | "expense" }) {
  const { bundle, ym, openQuick } = useFinance();
  const hidden = bundle.profile.privacyHidden;
  const start = bundle.profile.monthStartDay;
  const [editing, setEditing] = useState<Income | Expense | null>(null);
  const rows =
    kind === "income"
      ? bundle.incomes.filter((row) => occursInMonth(row, ym, start))
      : bundle.expenses.filter((row) => occursInMonth(row, ym, start));

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between">
        <h2 className="text-2xl font-medium">{kind === "income" ? "Entradas" : "Gastos"}</h2>
        <button type="button" className="text-sm text-muted" onClick={() => openQuick({ method: kind === "income" ? "entrada" : "pix" })}>
          Novo
        </button>
      </div>
      {rows.length === 0 ? (
        <Empty
          title={kind === "income" ? "Nenhuma entrada neste mês" : "Nenhum gasto neste mês"}
          body={kind === "income" ? "Salário, freelance ou um extra. Pode ser todo mês." : "Fixo ou variável. O que não repetir fica só neste mês."}
          action={<Button onClick={() => openQuick({ method: kind === "income" ? "entrada" : "pix" })}>Lançar</Button>}
        />
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((row) => (
            <li key={row.id}>
              <button type="button" onClick={() => setEditing(row)} className="flex w-full items-center gap-3 py-4 text-left">
                <div className="min-w-0 flex-1">
                  <p className="truncate">{row.description}</p>
                  <p className="text-xs text-muted">
                    {"kind" in row ? labelKind(row.kind) : row.category}
                    {row.recurring ? " · todo mês" : ""}
                    {"fixed" in row && row.fixed ? " · fixo" : ""}
                    {" · "}
                    {dateLabel(row)}
                  </p>
                </div>
                <Money cents={row.amountCents} hidden={hidden} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing ? <Editor row={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function labelKind(kind: string) {
  return INCOME_KINDS.find((item) => item.id === kind)?.label ?? "Outros";
}

function Editor({ row, onClose }: { row: Income | Expense; onClose: () => void }) {
  const { commit, busy } = useFinance();
  const income = "kind" in row;
  const [description, setDescription] = useState(row.description);
  const [digits, setDigits] = useState(String(row.amountCents));
  const [recurring, setRecurring] = useState(row.recurring);
  const [fixed, setFixed] = useState("fixed" in row ? row.fixed : false);
  const [category, setCategory] = useState("category" in row ? row.category : "Outros");
  const [kind, setKind] = useState(income ? row.kind : "outros");
  const [error, setError] = useState("");

  async function save() {
    const amountCents = centsFromText(digits);
    if (amountCents <= 0) {
      setError("Informe um valor.");
      return;
    }
    const when = { year: row.year, month: row.month, day: row.day };
    const saved = income
      ? await commit({
          op: "save-income",
          id: row.id,
          data: { kind, description: description || "Entrada", amountCents, recurring, ...when },
        })
      : await commit({
          op: "save-expense",
          id: row.id,
          data: { category, description: description || "Gasto", amountCents, fixed, recurring, ...when },
        });
    if (saved) onClose();
  }

  async function remove() {
    const saved = await commit(income ? { op: "delete-income", id: row.id } : { op: "delete-expense", id: row.id });
    if (saved) onClose();
  }

  return (
    <Modal title="Editar" onClose={onClose}>
      <div className="space-y-4">
        <input
          className="w-full bg-transparent text-center text-4xl tabular-nums outline-none"
          inputMode="numeric"
          value={digits ? brl(centsFromText(digits)) : ""}
          onChange={(event) => setDigits(event.target.value.replace(/\D/g, "").slice(0, 11))}
        />
        <Field label="Descrição">
          <input className={fieldClass} value={description} onChange={(event) => setDescription(event.target.value)} />
        </Field>
        {income ? (
          <Field label="Tipo">
            <select className={fieldClass} value={kind} onChange={(event) => setKind(event.target.value as Income["kind"])}>
              {INCOME_KINDS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="Categoria">
            <select className={fieldClass} value={category} onChange={(event) => setCategory(event.target.value)}>
              {CATEGORIES.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </Field>
        )}
        <div className="flex gap-2">
          {!income ? (
            <button type="button" onClick={() => setFixed(!fixed)} className={`h-10 rounded-full px-4 text-sm ring-1 ${fixed ? "bg-accent text-accent-fg" : "ring-line"}`}>
              Fixo
            </button>
          ) : null}
          <button type="button" onClick={() => setRecurring(!recurring)} className={`h-10 rounded-full px-4 text-sm ring-1 ${recurring ? "bg-accent text-accent-fg" : "ring-line"}`}>
            Todo mês
          </button>
        </div>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button className="w-full" disabled={busy} onClick={() => void save()}>
          Salvar
        </Button>
        <Button tone="ghost" className="w-full text-danger" disabled={busy} onClick={() => void remove()}>
          Excluir
        </Button>
      </div>
    </Modal>
  );
}
