import { useEffect, useState } from "react";
import { readReceiptWithAI, type AiReceipt } from "@/lib/finance/ai-read";
import { centsFromText, brl } from "@/lib/finance/money";
import { matchCardName, outcomeFromAi, parseReceiptText } from "@/lib/finance/parser";
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
        ? "Confirme se é Entrada (você recebeu), Crédito, Débito ou PIX antes de salvar."
        : "",
    );
  }

  function applyStructured(ai: AiReceipt) {
    const outcome = outcomeFromAi(ai, new Date());
    const item = outcome.items[0];
    if (!item) {
      setError("Não encontrei um valor. Tente outra foto ou digite.");
      setPhase("form");
      return;
    }
    const card =
      (ai.cardHint ? matchCardName(ai.cardHint, bundle.cards) : null) ||
      matchCardName(ai.rawText || ai.description, bundle.cards);
    const method = outcome.method;
    setDraft((prev) => ({
      ...prev,
      method: method ?? "pix",
      digits: String(item.totalCents),
      description: item.description,
      category: item.category || "Outros",
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
        ? "Confirme se é Entrada (você recebeu), Crédito, Débito ou PIX antes de salvar."
        : "",
    );
  }

  async function prepareOcrVariants(file: File): Promise<Blob[]> {
    try {
      const bitmap = await createImageBitmap(file);
      const minW = 1280;
      const maxW = 1800;
      let scale = 1;
      if (bitmap.width < minW) scale = minW / bitmap.width;
      else if (bitmap.width > maxW) scale = maxW / bitmap.width;
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const base = document.createElement("canvas");
      base.width = w;
      base.height = h;
      const bctx = base.getContext("2d");
      if (!bctx) return [file];
      bctx.fillStyle = "#fff";
      bctx.fillRect(0, 0, w, h);
      bctx.drawImage(bitmap, 0, 0, w, h);
      const src = bctx.getImageData(0, 0, w, h);
      const gray = new Uint8ClampedArray(w * h);
      let sum = 0;
      for (let i = 0, p = 0; i < src.data.length; i += 4, p++) {
        const g = src.data[i] * 0.299 + src.data[i + 1] * 0.587 + src.data[i + 2] * 0.114;
        gray[p] = g;
        sum += g;
      }
      const mean = sum / gray.length;
      if (mean < 110) for (let p = 0; p < gray.length; p++) gray[p] = 255 - gray[p];
      let min = 255, max = 0;
      for (let p = 0; p < gray.length; p++) {
        if (gray[p] < min) min = gray[p];
        if (gray[p] > max) max = gray[p];
      }
      const span = Math.max(1, max - min);
      const stretched = new Uint8ClampedArray(gray.length);
      for (let p = 0; p < gray.length; p++) stretched[p] = Math.round(((gray[p] - min) / span) * 255);
      function toBlob(pixels: Uint8ClampedArray, threshold?: number): Promise<Blob | null> {
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        const ctx = c.getContext("2d");
        if (!ctx) return Promise.resolve(null);
        const img = ctx.createImageData(w, h);
        for (let p = 0, i = 0; p < pixels.length; p++, i += 4) {
          let v = pixels[p];
          if (threshold !== undefined) v = v > threshold ? 255 : 0;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
          img.data[i + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
        return new Promise((resolve) => c.toBlob(resolve, "image/png"));
      }
      const variants: Blob[] = [];
      const contrast = await toBlob(stretched);
      if (contrast) variants.push(contrast);
      const hist = new Array(256).fill(0);
      for (let p = 0; p < stretched.length; p++) hist[stretched[p]]++;
      const total = stretched.length;
      let sumAll = 0;
      for (let i = 0; i < 256; i++) sumAll += i * hist[i];
      let sumB = 0, wB = 0, maxVar = -1, otsu = 128;
      for (let t = 0; t < 256; t++) {
        wB += hist[t];
        if (wB === 0) continue;
        const wF = total - wB;
        if (wF === 0) break;
        sumB += t * hist[t];
        const mB = sumB / wB, mF = (sumAll - sumB) / wF;
        const between = wB * wF * (mB - mF) * (mB - mF);
        if (between > maxVar) { maxVar = between; otsu = t; }
      }
      for (const th of [otsu, 140, 160]) {
        const bin = await toBlob(stretched, th);
        if (bin) variants.push(bin);
      }
      return variants.length ? variants : [file];
    } catch {
      return [file];
    }
  }

  function scoreOcrText(text: string): number {
    const t = text.toLowerCase();
    let score = Math.min(40, text.length / 4);
    if (/r\$\s*\d/.test(t) || /\d+[.,]\d{2}/.test(t)) score += 30;
    if (/\bpix\b|transfer|comprovante|recebeu|enviou|valor|credito|parcela|cartao/.test(t)) score += 25;
    if (/\b(nubank|inter|c6|bradesco|ita[uú]|santander|bb|caixa)\b/.test(t)) score += 10;
    return score;
  }

  async function readWithTesseract(file: File): Promise<string> {
    const { createWorker } = await import("tesseract.js");
    const variants = await prepareOcrVariants(file);
    const psms = [6, 4, 3, 11] as const;
    let best = "", bestScore = -1;
    let lastError: unknown;
    let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
    try {
      try { worker = await createWorker("por"); }
      catch (error) { lastError = error; worker = await createWorker("eng"); }
      await worker.setParameters({
        tessedit_char_whitelist:
          "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÁÀÂÃÉÊÍÓÔÕÚÜÇáàâãéêíóôõúüç$R.,/-: ",
        preserve_interword_spaces: "1",
      });
      for (const blob of variants) {
        for (const psm of psms) {
          try {
            await worker.setParameters({ tessedit_pageseg_mode: psm as any });
            const result = await worker.recognize(blob);
            const text = (result.data.text || "").trim();
            if (text.length < 4) continue;
            const score = scoreOcrText(text);
            if (score > bestScore) { bestScore = score; best = text; }
            if (score >= 70) return best;
          } catch (error) { lastError = error; }
        }
      }
    } finally {
      if (worker) await worker.terminate().catch(() => undefined);
    }
    if (best) return best;
    if (lastError) throw lastError;
    return "";
  }

  async function readImage(file: File) {
    setPhase("reading");
    setError("");
    try {
      try {
        const ai = await readReceiptWithAI(file);
        if (ai?.structured) { applyStructured(ai.structured); return; }
        if (ai?.text) { applyText(ai.text); return; }
      } catch { /* sem IA */ }
      const local = await readWithTesseract(file);
      if (local) { applyText(local); return; }
    } catch {
      try {
        const ai = await readReceiptWithAI(file);
        if (ai?.structured) { applyStructured(ai.structured); return; }
        if (ai?.text) { applyText(ai.text); return; }
      } catch { /* ignore */ }
    }
    setPhase("form");
    setError("Não consegui ler a imagem. Toque em Colar texto ou digite o valor.");
  }

  async function submitForm() {
    if (requiresMethodConfirmation) {
      setError("Escolha Entrada, Crédito, Débito ou PIX tocando no tipo acima.");
      return;
    }
    const total = centsFromText(draft.digits);
    if (total <= 0) { setError("Informe um valor válido."); return; }
    const day = draft.day ? Number(draft.day) : null;
    const installments = Math.max(1, Math.min(48, Number(draft.installments) || 1));
    let items: LaunchItem[] = [];
    let newCard: { name: string; limitCents: number; dueDay: number; tone: "ink" } | undefined;

    if (draft.method === "entrada") {
      items = [{ kind: "income", data: { kind: draft.incomeKind, description: draft.description.trim() || "Entrada", amountCents: total, recurring: draft.recurring, year: draft.year, month: draft.month, day } }];
    } else if (draft.method === "credito") {
      if (!draft.cardId) {
        if (!draft.newCardName.trim() || centsFromText(draft.newCardLimit) <= 0) {
          setError("Escolha um cartão ou informe nome e limite.");
          return;
        }
        newCard = { name: draft.newCardName.trim(), limitCents: centsFromText(draft.newCardLimit), dueDay: 10, tone: "ink" };
      }
      items = [{ kind: "purchase", data: { cardId: draft.cardId || "__new__", description: draft.description.trim() || "Compra", category: draft.category, merchant: draft.merchant, totalCents: total, installments, installmentCents: Math.floor(total / installments), year: draft.year, month: draft.month, day } }];
    } else {
      items = [{ kind: "expense", data: { category: draft.category, description: draft.description.trim() || "Gasto", amountCents: total, fixed: false, recurring: draft.recurring, year: draft.year, month: draft.month, day } }];
    }

    const saved = await commit({ op: "launch", items, newCard });
    if (saved) {
      if (seed.inboxId) markInboxLaunched(seed.inboxId);
      closeQuick();
    } else setError("Não foi possível salvar.");
  }

  return (
    <Modal title="Lançar" onClose={closeQuick}>
      {phase === "reading" ? <p className="text-sm text-muted">Lendo comprovante…</p> : null}
      {phase === "paste" ? (
        <div className="space-y-4">
          <Field label="Cole o texto do extrato">
            <textarea className={`${fieldClass} min-h-32 py-3`} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Cole aqui…" />
          </Field>
          <Button className="w-full" onClick={() => applyText(paste)}>Ler texto</Button>
        </div>
      ) : null}
      {phase === "form" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {METHODS.map((m) => (
              <button key={m.id} type="button" className={`h-9 rounded-full px-3 text-xs ring-1 ${draft.method === m.id ? "bg-accent text-accent-fg ring-accent" : "ring-line text-muted"}`} onClick={() => { setDraft((p) => ({ ...p, method: m.id })); setRequiresMethodConfirmation(false); setError(""); }}>
                {m.label}
              </button>
            ))}
          </div>
          <Field label="Valor">
            <input className={fieldClass} inputMode="numeric" value={draft.digits ? brl(centsFromText(draft.digits)) : ""} onChange={(e) => setDraft((p) => ({ ...p, digits: e.target.value.replace(/\D/g, "").slice(0, 11) }))} />
          </Field>
          <Field label="Descrição">
            <input className={fieldClass} value={draft.description} onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))} />
          </Field>
          {draft.method === "entrada" ? (
            <Field label="Tipo">
              <select className={fieldClass} value={draft.incomeKind} onChange={(e) => setDraft((p) => ({ ...p, incomeKind: e.target.value as Draft["incomeKind"] }))}>
                {INCOME_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
            </Field>
          ) : (
            <Field label="Categoria">
              <select className={fieldClass} value={draft.category} onChange={(e) => setDraft((p) => ({ ...p, category: e.target.value }))}>
                {["Outros", "Moradia", "Mercado", "Transporte", "Saúde", "Assinaturas", "Educação", "Restaurante", "Roupas", "Lazer"].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          )}
          {draft.method === "credito" ? (
            <>
              <Field label="Cartão">
                <select className={fieldClass} value={draft.cardId} onChange={(e) => setDraft((p) => ({ ...p, cardId: e.target.value }))}>
                  <option value="">Novo cartão…</option>
                  {bundle.cards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              {!draft.cardId ? (
                <>
                  <Field label="Nome do cartão"><input className={fieldClass} value={draft.newCardName} onChange={(e) => setDraft((p) => ({ ...p, newCardName: e.target.value }))} /></Field>
                  <Field label="Limite"><input className={fieldClass} inputMode="numeric" value={draft.newCardLimit ? brl(centsFromText(draft.newCardLimit)) : ""} onChange={(e) => setDraft((p) => ({ ...p, newCardLimit: e.target.value.replace(/\D/g, "").slice(0, 11) }))} /></Field>
                </>
              ) : null}
              <Field label="Parcelas">
                <input className={fieldClass} inputMode="numeric" value={draft.installments} onChange={(e) => setDraft((p) => ({ ...p, installments: e.target.value.replace(/\D/g, "").slice(0, 2) }))} />
              </Field>
            </>
          ) : null}
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <div className="flex gap-2">
            <Button className="flex-1" disabled={busy} onClick={() => void submitForm()}>Salvar</Button>
            <Button tone="line" className="flex-1" onClick={() => setPhase("paste")}>Colar texto</Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
