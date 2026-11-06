import { readReceiptWithAI } from "@/lib/finance/ai-read";
import { useEffect, useState } from "react";
import { CATEGORIES, INCOME_KINDS, METHODS, type PayMethod } from "@/lib/finance/types";
import { brl, centsFromText } from "@/lib/finance/money";
import { matchCardName, parseReceiptText } from "@/lib/finance/parser";
import type { LaunchItem } from "@/lib/finance/validate";
import { useFinance } from "./provider";
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

function emptyDraft(method: PayMethod | undefined, year: number, month: number): Draft {
  return {
    method: method ?? "pix",
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
  const [phase, setPhase] = useState<"form" | "reading" | "paste">("form");
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(quick?.method, ym.year, ym.month));
  const [paste, setPaste] = useState("");
  const [error, setError] = useState("");
  const [requiresMethodConfirmation, setRequiresMethodConfirmation] = useState(false);

  useEffect(() => {
    setDraft(emptyDraft(quick?.method, ym.year, ym.month));
    setPhase("form");
    setError("");
    setRequiresMethodConfirmation(false);
    setPaste("");
    if (quick?.text) applyText(quick.text);
    if (quick?.image) void readImage(quick.image);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quick]);

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
    setRequiresMethodConfirmation(parsed.method === null);
    setError(
      parsed.method === null
        ? "Não consegui identificar se é entrada, gasto ou compra no crédito. Confirme o tipo antes de salvar."
        : "",
    );
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
    if (requiresMethodConfirmation) {
      setError("Escolha Entrada, Débito, Crédito, PIX ou Dinheiro antes de salvar.");
      return;
    }

    const total = centsFromText(draft.digits);
    if (total <= 0) {
      setError("Informe um valor válido.");
      return;
    }
    const day = draft.day ? Number(draft.day) : null;
    const installments = Math.max(1, Math.min(48, Number(draft.installments) || 1));
    let items: LaunchItem[] = [];
    let newCard: { name: string; limitCents: number; dueDay: number; tone: "ink" } | undefined;

    if (draft.method === "entrada") {
      items = [
        {
          kind: "income",
          data: {
            kind: draft.incomeKind,
            description: draft.description.trim() || "Entrada",
            amountCents: total,
            recurring: draft.recurring,
            year: draft.year,
            month: draft.month,
            day,
          },
        },
      ];
    } else if (draft.method === "credito") {
      if (!draft.cardId) {
        if (!draft.newCardName.trim() || centsFromText(draft.newCardLimit) <= 0) {
          setError("Escolha um cartão ou informe nome e limite.");
          return;
        }
        newCard = {
          name: draft.newCardName.trim(),
          limitCents: centsFromText(draft.newCardLimit),
          dueDay: Number(draft.newCardDue) || 10,
          tone: "ink",
        };
      }
      items = [
        {
          kind: "purchase",
          data: {
            cardId: draft.cardId || "",
            description: draft.description.trim() || "Compra",
            category: draft.category,
            merchant: draft.merchant,
            totalCents: total,
            installments,
            installmentCents: Math.floor(total / installments),
            year: draft.year,
            month: draft.month,
            day,
          },
        },
      ];
    } else {
      items = [
        {
          kind: "expense",
          data: {
            category: draft.category,
            description: draft.description.trim() || "Gasto",
            amountCents: total,
            fixed: draft.fixed,
            recurring: draft.recurring,
            year: draft.year,
            month: draft.month,
            day,
          },
        },
      ];
    }

    const saved = await commit({ op: "launch", items, newCard });
    if (saved) {
      if (quick && quick.inboxId) markInboxLaunched(quick.inboxId);
      closeQuick();
    } else {
      setError("Não foi possível salvar.");
    }
  }

  return (
    <Modal title="Lançar" onClose={closeQuick}>
      {phase === "reading" ? <p className="text-sm text-muted">Lendo comprovante…</p> : null}
      {phase === "paste" ? (
        <div className="space-y-4">
          <Field label="Cole o texto do extrato">
            <textarea
              className={`${fieldClass} min-h-32 py-3`}
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder="Cole aqui…"
            />
          </Field>
          <Button className="w-full" onClick={() => applyText(paste)}>
            Ler texto
          </Button>
        </div>
      ) : null}
      {phase === "form" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {METHODS.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`h-9 rounded-full px-3 text-xs ring-1 ${
                  draft.method === m.id ? "bg-accent text-accent-fg ring-accent" : "ring-line text-muted"
                }`}
                onClick={() => {
  setDraft((p) => ({ ...p, method: m.id }));
  setRequiresMethodConfirmation(false);
  setError("");
}}
              >
                {m.label}
              </button>
            ))}
          </div>
          <Field label="Valor">
            <input
              className={fieldClass}
              inputMode="numeric"
              value={draft.digits ? brl(centsFromText(draft.digits)) : ""}
              onChange={(e) =>
                setDraft((p) => ({ ...p, digits: e.target.value.replace(/\D/g, "").slice(0, 11) }))
              }
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
            <Field label="Tipo">
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
          {draft.method === "credito" ? (
            <>
              <Field label="Cartão">
                <select
                  className={fieldClass}
                  value={draft.cardId}
                  onChange={(e) => setDraft((p) => ({ ...p, cardId: e.target.value }))}
                >
                  <option value="">Novo cartão…</option>
                  {bundle.cards.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              {!draft.cardId ? (
                <>
                  <Field label="Nome do cartão">
                    <input
                      className={fieldClass}
                      value={draft.newCardName}
                      onChange={(e) => setDraft((p) => ({ ...p, newCardName: e.target.value }))}
                    />
                  </Field>
                  <Field label="Limite">
                    <input
                      className={fieldClass}
                      inputMode="numeric"
                      value={draft.newCardLimit ? brl(centsFromText(draft.newCardLimit)) : ""}
                      onChange={(e) =>
                        setDraft((p) => ({
                          ...p,
                          newCardLimit: e.target.value.replace(/\D/g, "").slice(0, 11),
                        }))
                      }
                    />
                  </Field>
                  <Field label="Vence dia">
                    <input
                      className={fieldClass}
                      inputMode="numeric"
                      value={draft.newCardDue}
                      onChange={(e) =>
                        setDraft((p) => ({
                          ...p,
                          newCardDue: e.target.value.replace(/\D/g, "").slice(0, 2),
                        }))
                      }
                    />
                  </Field>
                </>
              ) : null}
              <Field label="Parcelas">
                <input
                  className={fieldClass}
                  inputMode="numeric"
                  value={draft.installments}
                  onChange={(e) => setDraft((p) => ({ ...p, installments: e.target.value }))}
                />
              </Field>
            </>
          ) : null}
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <div className="flex gap-2">
            <Button className="flex-1" disabled={busy} onClick={() => void submitForm()}>
              Salvar
            </Button>
            <Button tone="line" className="flex-1" onClick={() => setPhase("paste")}>
              Colar texto
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
