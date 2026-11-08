import { useEffect, useState } from "react";
import { readReceiptWithAI } from "@/lib/finance/ai-read";
import { centsFromText, brl } from "@/lib/finance/money";
import { matchCardName, parseReceiptText } from "@/lib/finance/parser";
import { INCOME_KINDS, type PayMethod } from "@/lib/finance/types";
import type { LaunchItem } from "@/lib/finance/validate";
import { useFinance, type QuickSeed } from "./provider";
import { Button, Field, Modal, fieldClass } from "./ui";

const METHODS: { id: PayMethod; label: string }[] = [
  { id: "credito", label: "Crédito" },
  { id: "debito", label: "Débito" },
  { id: "pix", label: "PIX" },
  { id: "dinheiro", label: "Dinheiro" },
  { id: "entrada", label: "Entrada" },
];

type Draft = {
  method: PayMethod;
  digits: string;
  description: string;
  category: string;
  incomeKind: (typeof INCOME_KINDS)[number]["id"];
  installments: string;
  year: number;
  month: number;
  day: string;
  merchant: string | null;
  cardId: string;
  newCardName: string;
  newCardLimit: string;
  recurring: boolean;
};

function emptyDraft(method: PayMethod | undefined, year: number, month: number): Draft {
  return {
    method: method ?? "pix",
    digits: "",
    description: "",
    category: "Outros",
    incomeKind: "extra",
    installments: "1",
    year,
    month,
    day: "",
    merchant: null,
    cardId: "",
    newCardName: "",
    newCardLimit: "",
    recurring: false,
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
  const seed = quick;

  function applyText(text: string) {
    const identity = {
      names: [bundle.profile.legalName, bundle.profile.displayName]
        .filter((n): n is string => typeof n === "string" && n.trim().length >= 2)
        .map((n) => n.trim()),
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
    const method = parsed.method;
    setDraft((prev) => ({
      ...prev,
      method: method ?? "pix",
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
    setRequiresMethodConfirmation(method === null);
    setError(
      method === null
        ? "Confirme se é Entrada (você recebeu) ou PIX (você enviou) antes de salvar."
        : "",
    );
  }

  async function prepareOcrImage(file: File): Promise<Blob> {
    try {
      const bitmap = await createImageBitmap(file);
      const max = 1600;
      const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      try {
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          const g = d[i] * 0.3 + d[i + 1] * 0.6 + d[i + 2] * 0.1;
          const v = g < 140 ? Math.max(0, g * 0.7) : Math.min(255, g * 1.15);
          d[i] = d[i + 1] = d[i + 2] = v;
        }
        ctx.putImageData(img, 0, 0);
      } catch {
        /* ignore */
      }
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      return blob ?? file;
    } catch {
      return file;
    }
  }

  async function readWithTesseract(file: File): Promise<string> {
    const { createWorker } = await import("tesseract.js");
    const prepared = await prepareOcrImage(file);
    let lastError: unknown;
    for (const lang of ["por", "eng"] as const) {
      let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
      try {
        worker = await createWorker(lang);
        const result = await worker.recognize(prepared);
        const text = (result.data.text || "").trim();
        if (text.length >= 4) return text;
      } catch (error) {
        lastError = error;
      } finally {
        if (worker) await worker.terminate().catch(() => undefined);
      }
    }
    if (lastError) throw lastError;
    return "";
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
    } catch {
      /* IA indisponível — tenta OCR local */
    }
    try {
      const text = await readWithTesseract(file);
      if (!text) {
        setPhase("form");
        setError("Não consegui ler a imagem. Toque em Colar texto ou digite o valor.");
        return;
      }
      applyText(text);
    } catch {
      setPhase("form");
      setError("Não consegui ler a imagem. Toque em Colar texto ou digite o valor.");
    }
  }

  async function submitForm() {
    if (requiresMethodConfirmation) {
      setError("Escolha Entrada (recebeu) ou PIX (enviou) tocando no tipo acima.");
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
          dueDay: 10,
          tone: "ink",
        };
      }
      items = [
        {
          kind: "purchase",
          data: {
            cardId: draft.cardId || "__new__",
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
            fixed: false,
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
      if (seed.inboxId) markInboxLaunched(seed.inboxId);
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
                {["Outros", "Moradia", "Mercado", "Transporte", "Saúde", "Assinaturas", "Educação", "Restaurante", "Roupas", "Lazer"].map(
                  (c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ),
                )}
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
                </>
              ) : null}
              <Field label="Parcelas">
                <input
                  className={fieldClass}
                  inputMode="numeric"
                  value={draft.installments}
                  onChange={(e) => setDraft((p) => ({ ...p, installments: e.target.value.replace(/\D/g, "").slice(0, 2) }))}
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
