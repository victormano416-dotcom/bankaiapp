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
  const [reviewImported, setReviewImported] = useState(false);

  useEffect(() => {
    setDraft(emptyDraft(quick, ym.year, ym.month));
    setPhase("form");
    setRows([]);
    setError("");
    setPaste("");
    setReviewImported(false);
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
        recurring: row.recurring,
        at: row.createdAt,
        installments: "1",
        cardId: "",
        fixed: false,
      })),
      ...bundle.expenses.map((row) => ({
        id: row.id,
        label: row.description,
        digits: String(row.amountCents),
        method: "pix" as const,
        category: row.category,
        incomeKind: "extra" as const,
        recurring: row.recurring,
        at: row.createdAt,
        installments: "1",
        cardId: "",
        fixed: row.fixed,
      })),
      ...bundle.purchases.map((row) => ({
        id: row.id,
        label: row.description,
        digits: String(row.totalCents),
        method: "credito" as const,
        category: row.category,
        incomeKind: "extra" as const,
        recurring: false,
        at: row.createdAt,
        installments: String(row.installments),
        cardId: row.cardId,
        fixed: false,
      })),
    ];
    return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 3);
  }, [bundle]);

  if (!quick) return null;

  function applyText(text: string) {
    const parsed = parseReceiptText(text);
    const card = matchCardName(text, bundle.cards);
    if (parsed.items.length >= 2) {
      setRows(parsed.items.map((item) => ({ ...item, key: crypto.randomUUID(), checked: true })));
      setDraft((prev) => ({
        ...prev,
        method: parsed.method && parsed.method !== "entrada" ? parsed.method : prev.method === "entrada" ? "credito" : prev.method,
        cardId: card ?? prev.cardId,
      }));
      setPhase("statement");
      setReviewImported(true);
      setError("");
      return;
    }
    const item = parsed.items[0];
    if (!item) {
      setReviewImported(false);
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
    setReviewImported(true);
    setError("");
  }

  async function readImage(file: File) {
    setPhase("reading");
    setReviewImported(false);
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
      setError("Informe um valor.");
      return;
    }
    const when = { year: draft.year, month: draft.month, day: draft.day ? Number(draft.day) : null };
    let items: LaunchItem[] = [];
    let newCard: { name: string; limitCents: number; dueDay: number; tone: "ink" } | undefined;
    if (draft.method === "entrada") {
      items = [
        {
          kind: "income",
          data: {
            kind: draft.incomeKind,
            description: draft.description || "Entrada",
            amountCents: total,
            recurring: draft.recurring,
            ...when,
          },
        },
      ];
    } else if (draft.method === "credito") {
      const installments = Math.min(48, Math.max(1, Number(draft.installments) || 1));
      const purchase = {
        cardId: draft.cardId,
        description: draft.description || draft.merchant || "Compra",
        category: draft.category,
        merchant: draft.merchant,
        totalCents: total,
        installments,
        installmentCents: Math.floor(total / installments),
        ...when,
      };
      if (!draft.cardId) {
        if (!draft.newCardName.trim() || centsFromText(draft.newCardLimit) <= 0) {
          setError("Escolha um cartão ou crie um agora.");
          return;
        }
        newCard = {
          name: draft.newCardName.trim(),
          limitCents: centsFromText(draft.newCardLimit),
          dueDay: Number(draft.newCardDue) || 10,
          tone: "ink",
        };
        purchase.cardId = "";
      }
      items = [{ kind: "purchase", data: purchase }];
    } else {
      items = [
        {
          kind: "expense",
          data: {
            category: draft.category,
            description: draft.description || "Gasto",
            amountCents: total,
            fixed: draft.fixed,
            recurring: draft.fixed || draft.recurring,
            ...when,
          },
        },
      ];
    }
    const saved = await commit({ op: "launch", items, newCard });
    if (saved) {
      if (quick?.inboxId) void markInboxLaunched(quick.inboxId);
      closeQuick();
    }
  }

  async function submitRows() {
    const chosen = rows.filter((row) => row.checked);
    if (!chosen.length) {
      setError("Marque ao menos uma linha.");
      return;
    }
    const method = draft.method === "entrada" ? "debito" : draft.method;
    let newCard: { name: string; limitCents: number; dueDay: number; tone: "ink" } | undefined;
    if (method === "credito" && !draft.cardId) {
      if (!draft.newCardName.trim() || centsFromText(draft.newCardLimit) <= 0) {
        setError("Escolha o cartão uma vez para lançar o extrato.");
        return;
      }
      newCard = {
        name: draft.newCardName.trim(),
        limitCents: centsFromText(draft.newCardLimit),
        dueDay: Number(draft.newCardDue) || 10,
        tone: "ink",
      };
    }
    const items: LaunchItem[] = chosen.map((row) => {
      if (method === "credito") {
        return {
          kind: "purchase" as const,
          data: {
            cardId: draft.cardId,
            description: row.description,
            category: row.category,
            merchant: row.merchant,
            totalCents: row.totalCents,
            installments: row.installments,
            installmentCents: Math.floor(row.totalCents / row.installments),
            year: row.year,
            month: row.month,
            day: row.day,
          },
        };
      }
      return {
        kind: "expense" as const,
        data: {
          category: row.category,
          description: row.description,
          amountCents: row.installments > 1 ? Math.floor(row.totalCents / row.installments) : row.totalCents,
          fixed: false,
          recurring: false,
          year: row.year,
          month: row.month,
          day: row.day,
        },
      };
    });
    const saved = await commit({ op: "launch", items, newCard });
    if (saved) {
      if (quick?.inboxId) void markInboxLaunched(quick.inboxId);
      closeQuick();
    }
  }

  const monthValue = `${draft.year}-${String(draft.month).padStart(2, "0")}`;
  const selectedRows = rows.filter((row) => row.checked).length;

  return (
    <Modal title={phase === "statement" ? "Extrato" : "Lançar"} onClose={closeQuick}>
      {phase === "reading" ? (
        <p className="py-10 text-center text-sm text-muted" role="status" aria-live="polite">Lendo o comprovante…</p>
      ) : null}

      {phase === "paste" ? (
        <div className="space-y-4">
          <textarea
            className={`${fieldClass} h-40 py-3`}
            placeholder="Cole o texto do extrato"
            aria-label="Texto do extrato"
            value={paste}
            onChange={(event) => setPaste(event.target.value)}
          />
          <Button className="w-full" onClick={() => applyText(paste)}>
            Ler linhas
          </Button>
        </div>
      ) : null}

      {phase === "statement" ? (
        <div className="space-y-4">
          <p className="rounded-2xl bg-surface-2 p-3 text-sm text-muted" role="status">
            Confira os dados reconhecidos, edite o que estiver incorreto e desmarque as linhas que não quiser lançar. Nada será salvo até você tocar em “Lançar selecionados”.
          </p>
          <div className="flex gap-2 overflow-x-auto">
            {METHODS.filter((item) => item.id !== "entrada").map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={draft.method === item.id}
                onClick={() => setDraft({ ...draft, method: item.id })}
                className={`h-10 shrink-0 rounded-full px-4 text-sm ring-1 ${draft.method === item.id ? "bg-accent text-accent-fg ring-accent" : "ring-line"}`}
              >
                {item.label}
              </button>
            ))}
          </div>
          {draft.method === "credito" ? <CardPicker draft={draft} setDraft={setDraft} /> : null}
          <ul className="space-y-3" aria-label="Lançamentos reconhecidos">
            {rows.map((row) => (
              <li key={row.key} className="space-y-3 rounded-2xl p-3 ring-1 ring-line">
                <label className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="size-5 accent-current"
                    checked={row.checked}
                    onChange={() => setRows(rows.map((item) => (item.key === row.key ? { ...item, checked: !item.checked } : item)))}
                    aria-label={`Incluir lançamento: ${row.description}`}
                  />
                  <span>Incluir este lançamento</span>
                </label>
                <label className="block text-xs text-muted">
                  Descrição
                  <input
                    className={`${fieldClass} mt-1`}
                    value={row.description}
                    aria-label={`Descrição do lançamento ${row.description}`}
                    onChange={(event) => setRows(rows.map((item) => item.key === row.key ? { ...item, description: event.target.value } : item))}
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-xs text-muted">
                    Valor total
                    <input
                      className={`${fieldClass} mt-1`}
                      inputMode="numeric"
                      value={brl(row.totalCents)}
                      aria-label={`Valor total do lançamento ${row.description}`}
                      onChange={(event) => {
                        const digits = event.target.value.replace(/\D/g, "");
                        setRows(rows.map((item) => item.key === row.key ? { ...item, totalCents: centsFromText(digits) } : item));
                      }}
                    />
                  </label>
                  <label className="block text-xs text-muted">
                    Categoria
                    <select
                      className={`${fieldClass} mt-1`}
                      value={row.category}
                      aria-label={`Categoria do lançamento ${row.description}`}
                      onChange={(event) => setRows(rows.map((item) => item.key === row.key ? { ...item, category: event.target.value } : item))}
                    >
                      {CATEGORIES.map((category) => <option key={category}>{category}</option>)}
                    </select>
                  </label>
                </div>
                <p className="text-xs text-muted">
                  Data: {row.day ? `${String(row.day).padStart(2, "0")}/` : ""}{String(row.month).padStart(2, "0")}/{row.year}
                  {row.installments > 1 ? ` · ${row.installments} parcelas` : " · À vista"}
                </p>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted" aria-live="polite">
            {selectedRows} de {rows.length} lançamento(s) selecionado(s).
          </p>
          {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
          <Button className="w-full" disabled={busy} onClick={() => void submitRows()}>
            {busy ? "Salvando…" : "Lançar selecionados"}
          </Button>
        </div>
      ) : null}

      {phase === "form" ? (
        <div className="space-y-5">
          {reviewImported ? (
            <p className="rounded-2xl bg-surface-2 p-3 text-sm text-muted" role="status">
              Confira os dados reconhecidos abaixo. Você pode editá-los; nada será salvo até tocar em “Lançar”.
            </p>
          ) : null}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {METHODS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={draft.method === item.id}
                onClick={() => setDraft({ ...draft, method: item.id })}
                className={`h-10 shrink-0 rounded-full px-4 text-sm ring-1 transition ${draft.method === item.id ? "bg-accent text-accent-fg ring-accent" : "ring-line"}`}
              >
                {item.label}
              </button>
            ))}
          </div>
          {chips.length ? (
            <div className="flex gap-2 overflow-x-auto">
              {chips.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      method: chip.method,
                      digits: chip.digits,
                      description: chip.label,
                      category: chip.category,
                      incomeKind: chip.incomeKind,
                      recurring: chip.recurring,
                      fixed: chip.fixed,
                      installments: chip.installments,
                      cardId: chip.cardId || draft.cardId,
                    })
                  }
                  className="h-9 shrink-0 rounded-full px-3 text-xs text-muted ring-1 ring-line"
                >
                  {chip.label} · {brl(Number(chip.digits))}
                </button>
              ))}
            </div>
          ) : null}
          <label className="block text-center">
            <span className="sr-only">Valor</span>
            <input
              inputMode="numeric"
              aria-label="Valor do lançamento em reais"
              className="w-full bg-transparent text-center text-5xl font-medium tracking-tight tabular-nums outline-none"
              placeholder="R$ 0,00"
              value={draft.digits ? brl(centsFromText(draft.digits)) : ""}
              onChange={(event) => setDraft({ ...draft, digits: event.target.value.replace(/\D/g, "").slice(0, 11) })}
            />
          </label>
          <Field label="Descrição">
            <input
              className={fieldClass}
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            />
          </Field>
          {draft.method === "entrada" ? (
            <Field label="Tipo">
              <select
                className={fieldClass}
                value={draft.incomeKind}
                onChange={(event) => setDraft({ ...draft, incomeKind: event.target.value as Draft["incomeKind"] })}
              >
                {INCOME_KINDS.map((kind) => (
                  <option key={kind.id} value={kind.id}>{kind.label}</option>
                ))}
              </select>
            </Field>
          ) : (
            <Field label="Categoria">
              <select className={fieldClass} value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>
                {CATEGORIES.map((category) => <option key={category}>{category}</option>)}
              </select>
            </Field>
          )}
          {draft.method === "credito" ? (
            <>
              <CardPicker draft={draft} setDraft={setDraft} />
              <Field label="Parcelas">
                <input
                  className={fieldClass}
                  inputMode="numeric"
                  value={draft.installments}
                  onChange={(event) => setDraft({ ...draft, installments: event.target.value.replace(/\D/g, "").slice(0, 2) })}
                />
              </Field>
              {Number(draft.installments) > 1 && draft.digits ? (
                <p className="text-center text-sm text-muted">
                  {draft.installments}x de {brl(Math.floor(centsFromText(draft.digits) / Number(draft.installments)))}
                </p>
              ) : null}
            </>
          ) : null}
          {draft.method !== "entrada" && draft.method !== "credito" ? (
            <div className="flex gap-2">
              <button
                type="button"
                aria-pressed={draft.fixed}
                onClick={() => setDraft({ ...draft, fixed: !draft.fixed, recurring: !draft.fixed || draft.recurring })}
                className={`h-10 rounded-full px-4 text-sm ring-1 ${draft.fixed ? "bg-accent text-accent-fg ring-accent" : "ring-line"}`}
              >
                Fixo
              </button>
              <button
                type="button"
                aria-pressed={draft.recurring}
                onClick={() => setDraft({ ...draft, recurring: !draft.recurring })}
                className={`h-10 rounded-full px-4 text-sm ring-1 ${draft.recurring ? "bg-accent text-accent-fg ring-accent" : "ring-line"}`}
              >
                Todo mês
              </button>
            </div>
          ) : null}
          {draft.method === "entrada" ? (
            <button
              type="button"
              aria-pressed={draft.recurring}
              onClick={() => setDraft({ ...draft, recurring: !draft.recurring })}
              className={`h-10 rounded-full px-4 text-sm ring-1 ${draft.recurring ? "bg-accent text-accent-fg ring-accent" : "ring-line"}`}
            >
              Recorrente
            </button>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Mês">
              <input
                type="month"
                className={fieldClass}
                value={monthValue}
                onChange={(event) => {
                  const [year, month] = event.target.value.split("-").map(Number);
                  if (year && month) setDraft({ ...draft, year, month });
                }}
              />
            </Field>
            <Field label="Dia">
              <input
                className={fieldClass}
                inputMode="numeric"
                placeholder="Opcional"
                value={draft.day}
                onChange={(event) => setDraft({ ...draft, day: event.target.value.replace(/\D/g, "").slice(0, 2) })}
              />
            </Field>
          </div>
          <div className="flex gap-2">
            <label className="flex h-11 flex-1 cursor-pointer items-center justify-center rounded-full text-sm ring-1 ring-line">
              Foto
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                aria-label="Selecionar ou tirar foto do comprovante"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void readImage(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <button type="button" className="h-11 flex-1 rounded-full text-sm ring-1 ring-line" onClick={() => setPhase("paste")}>
              Colar extrato
            </button>
          </div>
          {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
          <Button className="w-full" disabled={busy} onClick={() => void submitForm()}>
            {busy ? "Salvando…" : "Lançar"}
          </Button>
        </div>
      ) : null}
    </Modal>
  );
}

function CardPicker({ draft, setDraft }: { draft: Draft; setDraft: (draft: Draft) => void }) {
  const { bundle } = useFinance();
  return (
    <div className="space-y-3">
      {bundle.cards.length ? (
        <Field label="Cartão">
          <select className={fieldClass} value={draft.cardId} onChange={(event) => setDraft({ ...draft, cardId: event.target.value })}>
            <option value="">Novo cartão</option>
            {bundle.cards.map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}
          </select>
        </Field>
      ) : null}
      {!draft.cardId || !bundle.cards.length ? (
        <div className="grid grid-cols-3 gap-2">
          <input className={fieldClass} placeholder="Nome" aria-label="Nome do novo cartão" value={draft.newCardName} onChange={(event) => setDraft({ ...draft, newCardName: event.target.value })} />
          <input
            className={fieldClass}
            inputMode="numeric"
            placeholder="Limite"
            aria-label="Limite do novo cartão em reais"
            value={draft.newCardLimit ? brl(centsFromText(draft.newCardLimit)) : ""}
            onChange={(event) => setDraft({ ...draft, newCardLimit: event.target.value.replace(/\D/g, "").slice(0, 11) })}
          />
          <input
            className={fieldClass}
            inputMode="numeric"
            placeholder="Vence"
            aria-label="Dia de vencimento da fatura"
            value={draft.newCardDue}
            onChange={(event) => setDraft({ ...draft, newCardDue: event.target.value.replace(/\D/g, "").slice(0, 2) })}
          />
        </div>
      ) : null}
    </div>
  );
}
