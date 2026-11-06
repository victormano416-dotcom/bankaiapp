import { readReceiptWithAI } from "@/lib/finance/ai-read";
import { useEffect, useMemo, useState } from "react";
import { CATEGORIES, INCOME_KINDS, METHODS, type PayMethod } from "@/lib/finance/types";
import { brl, centsFromText } from "@/lib/finance/money";
import { matchCardName, parseReceiptText, type ParsedItem } from "@/lib/finance/parser";
import type { LaunchItem } from "@/lib/finance/validate";
import { useFinance, type QuickSeed } from "./provider";
import { Button, Field, Modal, fieldClass } from "./ui";

type Draft = {
  method: PayMethod;
  digits: string;
  description: string;
  category: string;
  incomeKind: (typeof INCOME_KINDS)[number]["id"];
  fixed: boolean;
  recurring: boolean;
  installments: string;
  cardId: string;
  year: number;
  month: number;
  day: string;
  merchant: string | null;
  newCardName: string;
  newCardLimit: string;
  newCardDue: string;
};

type Row = ParsedItem & { key: string; checked: boolean };

function emptyDraft(seed: QuickSeed | null, year: number, month: number): Draft {
  return {
    method: seed?.method ?? "pix",
    digits: "",
    description: "",
    category: "Outros",
    incomeKind: "extra",
    fixed: false,
    recurring: false,
    installments: "1",
    cardId: "",
    year,
    month,
    day: "",
    merchant: null,
    newCardName: "",
    newCardLimit: "",
    newCardDue: "10",
  };
}

export function QuickAdd() {
  const { quick, closeQuick, bundle, ym, commit, busy, markInboxLaunched } = useFinance();
  const [phase, setPhase] = useState<"form" | "statement" | "reading" | "paste">("form");
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(quick, ym.year, ym.month));
  const [rows, setRows] = useState<Row[]>([]);
  const [paste, setPaste] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setDraft(emptyDraft(quick, ym.year, ym.month));
    setPhase("form");
    setRows([]);
    setError("");
    setPaste("");
    if (quick?.text) applyText(quick.text);
    if (quick?.image) void readImage(quick.image);
    // Only when the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quick]);

  const chips = useMemo(() => {
    const items = [
      ...bundle.incomes.map((row) => ({
        id: row.id,
        label: row.description,
        digits: String(row.amountCents),
        method: "entrada" as const,
        category: "Outros",
        incomeKind: row.kind,
      })),
      ...bundle.expenses.map((row) => ({
        id: row.id,
        label: row.description,
        digits: String(row.amountCents),
        method: "pix" as const,
        category: row.category,
        incomeKind: "extra" as const,
      })),
    ];
    return items.slice(0, 12);
  }, [bundle]);

  if (!quick) return null;

  function applyText(text: string) {
    const identity = {
      names: [bundle.profile.legalName, bundle.profile.displayName].filter(
        (n): n is string => typeof n === "string" && n.trim().length >= 3,
      ),
      cpfDigits: bundle.profile.cpfHint || undefined,
    };
    const parsed = parseReceiptText(text, new Date(), identity);
    const card = matchCardName(text, bundle.cards);
    if (parsed.items.length >= 2) {
      setRows(parsed.items.map((item) => ({ ...item, key: crypto.randomUUID(), checked: true })));
      setDraft((prev) => ({
        ...prev,
        method: parsed.method && parsed.method !== "entrada" ? parsed.method : prev.method === "entrada" ? "credito" : prev.method,
        cardId: card ?? prev.cardId,
      }));
      setPhase("statement");
      setError("");
      return;
    }
    const item = parsed.items[0];
    if (!item) {
      setError("Não encontrei um valor. Tente outra foto ou digite.");
      setPhase("form");
      return;
    }
    setDraft((prev) => ({
      ...prev,
      method: parsed.method ?? prev.method,
      digits: String(item.totalCents),
      description: item.description,
      category: item.category,
      installments: String(item.installments),
      year: item.year,
      month: item.month,
      day: item.day ? String(item.day) : "",
      merchant: item.merchant,
      cardId: card ?? prev.cardId,
    }));
    setPhase("form");
    setError("");
  }

  async function readImage(file: File) {
    setPhase("reading");
    setError("");
    try {
      const ai = await readReceiptWithAI(file);
      if (ai) {
        applyText(ai);
        return;
      }
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("por");
      try {
        const result = await worker.recognize(file);
        applyText(result.data.text || "");
      } finally {
        await worker.terminate();
      }
    } catch {
      setPhase("form");
      setError("Não consegui ler a imagem. Digite o valor ou cole o extrato.");
    }
  }

  async function submitForm() {
    const total = centsFromText(draft.digits);
    if (total <= 0) {
      setError("Informe um valor válido.");
      return;
    }
    const day = draft.day ? Number(draft.day) : null;
    const installments = Math.max(1, Math.min(48, Number(draft.installments) || 1));
    let cardId = draft.cardId;
    if (draft.method === "credito" && !cardId && draft.newCardName.trim()) {
      const limit = centsFromText(draft.newCardLimit);
      const due = Math.max(1, Math.min(28, Number(draft.newCardDue) || 10));
      const created = await commit({
        op: "card",
        card: {
          name: draft.newCardName.trim(),
          limitCents: limit > 0 ? limit : 0,
          dueDay: due,
          tone: "ink",
        },
      });
      // @ts-expect-error id may come from commit
      cardId = created?.id ?? cardId;
    }
    const payload: LaunchItem = {
      method: draft.method,
      description: draft.description.trim() || "Lançamento",
      category: draft.category,
      incomeKind: draft.incomeKind,
      amountCents: total,
      fixed: draft.fixed,
      recurring: draft.recurring,
      installments,
      cardId: draft.method === "credito" ? cardId || null : null,
      year: draft.year,
      month: draft.month,
      day,
      merchant: draft.merchant,
    };
    try {
      await commit({ op: "launch", item: payload });
      if (quick?.inboxId) markInboxLaunched(quick.inboxId);
      closeQuick();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar.");
    }
  }

  async function submitRows() {
    const selected = rows.filter((r) => r.checked);
    if (!selected.length) {
      setError("Marque pelo menos um item.");
      return;
    }
    try {
      for (const row of selected) {
        await commit({
          op: "launch",
          item: {
            method: draft.method === "entrada" ? "entrada" : draft.method,
            description: row.description,
            category: row.category,
            incomeKind: "extra",
            amountCents: row.totalCents,
            fixed: false,
            recurring: false,
            installments: row.installments,
            cardId: draft.method === "credito" ? draft.cardId || null : null,
            year: row.year,
            month: row.month,
            day: row.day,
            merchant: row.merchant,
          },
        });
      }
      if (quick?.inboxId) markInboxLaunched(quick.inboxId);
      closeQuick();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar.");
    }
  }

  return (
    <Modal open onClose={closeQuick} title="Lançamento rápido">
      {phase === "reading" && (
        <p className="text-sm text-[var(--muted)]">Lendo comprovante…</p>
      )}
      {phase === "paste" && (
        <div className="space-y-3">
          <Field label="Cole o texto do extrato ou comprovante">
            <textarea
              className={fieldClass + " min-h-[140px]"}
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder="Cole aqui o texto copiado do banco…"
            />
          </Field>
          <Button className="w-full" onClick={() => applyText(paste)}>
            Ler texto
          </Button>
        </div>
      )}
      {phase === "statement" && (
        <div className="space-y-3">
          <p className="text-sm text-[var(--muted)]">Marque o que deseja lançar:</p>
          <ul className="space-y-2 max-h-64 overflow-auto">
            {rows.map((row) => (
              <li key={row.key} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={row.checked}
                  onChange={() =>
                    setRows((prev) =>
                      prev.map((r) => (r.key === row.key ? { ...r, checked: !r.checked } : r)),
                    )
                  }
                />
                <span className="flex-1">
                  {row.description}
                  <span className="block text-[var(--muted)]">{brl(row.totalCents)}</span>
                </span>
              </li>
            ))}
          </ul>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button className="w-full" disabled={busy} onClick={() => void submitRows()}>
            Lançar selecionados
          </Button>
        </div>
      )}
      {phase === "form" && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {METHODS.map((m) => (
              <button
                key={m.id}
                type="button"
                className={
                  "rounded-full px-3 py-1 text-xs " +
                  (draft.method === m.id
                    ? "bg-[var(--accent)] text-white"
                    : "bg-[var(--surface-2)] text-[var(--muted)]")
                }
                onClick={() => setDraft((p) => ({ ...p, method: m.id }))}
              >
                {m.label}
              </button>
            ))}
          </div>
          <Field label="Valor">
            <input
              className={fieldClass}
              inputMode="decimal"
              value={draft.digits}
              onChange={(e) => setDraft((p) => ({ ...p, digits: e.target.value }))}
              placeholder="0,00"
            />
          </Field>
          <Field label="Descrição">
            <input
              className={fieldClass}
              value={draft.description}
              onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))}
            />
          </Field>
          {draft.method === "entrada" ? (
            <Field label="Tipo de entrada">
              <select
                className={fieldClass}
                value={draft.incomeKind}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, incomeKind: e.target.value as Draft["incomeKind"] }))
                }
              >
                {INCOME_KINDS.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <Field label="Categoria">
              <select
                className={fieldClass}
                value={draft.category}
                onChange={(e) => setDraft((p) => ({ ...p, category: e.target.value }))}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {draft.method === "credito" && (
            <>
              <Field label="Cartão">
                <select
                  className={fieldClass}
                  value={draft.cardId}
                  onChange={(e) => setDraft((p) => ({ ...p, cardId: e.target.value }))}
                >
                  <option value="">Novo / escolher…</option>
                  {bundle.cards.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              {!draft.cardId && (
                <>
                  <Field label="Nome do cartão">
                    <input
                      className={fieldClass}
                      value={draft.newCardName}
                      onChange={(e) => setDraft((p) => ({ ...p, newCardName: e.target.value }))}
                    />
                  </Field>
                  <Field label="Limite (opcional)">
                    <input
                      className={fieldClass}
                      value={draft.newCardLimit}
                      onChange={(e) => setDraft((p) => ({ ...p, newCardLimit: e.target.value }))}
                    />
                  </Field>
                  <Field label="Dia do vencimento">
                    <input
                      className={fieldClass}
                      value={draft.newCardDue}
                      onChange={(e) => setDraft((p) => ({ ...p, newCardDue: e.target.value }))}
                    />
                  </Field>
                </>
              )}
              <Field label="Parcelas">
                <input
                  className={fieldClass}
                  value={draft.installments}
                  onChange={(e) => setDraft((p) => ({ ...p, installments: e.target.value }))}
                />
              </Field>
            </>
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-2">
            <Button className="flex-1" disabled={busy} onClick={() => void submitForm()}>
              Salvar
            </Button>
            <Button
              className="flex-1"
              variant="ghost"
              onClick={() => setPhase("paste")}
            >
              Colar texto
            </Button>
          </div>
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {chips.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="rounded-full bg-[var(--surface-2)] px-2 py-1 text-xs text-[var(--muted)]"
                  onClick={() =>
                    setDraft((p) => ({
                      ...p,
                      digits: c.digits,
                      description: c.label,
                      method: c.method,
                      category: c.category,
                      incomeKind: c.incomeKind,
                    }))
                  }
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
