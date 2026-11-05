import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { brl } from "@/lib/finance/money";
import { fullMonthLabel, type Ym } from "@/lib/finance/period";
import type { Card } from "@/lib/finance/types";

export function Boot() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 py-14">
      <p className="wordmark text-xs text-muted">BANKAI</p>
      <h1 className="mt-10 text-4xl font-medium tracking-tight">Seu caixa, sem planilha.</h1>
      <p className="mt-4 max-w-xs text-sm text-muted">Entradas, gastos e a fatura do cartão no mesmo lugar.</p>
      <div className="mt-12 space-y-3" aria-hidden="true">
        <div className="skel h-14 w-44 rounded-2xl" />
        <div className="skel h-28 w-full rounded-3xl" />
        <div className="skel h-36 w-full rounded-3xl" />
      </div>
    </main>
  );
}

export function Money({ cents, hidden, className }: { cents: number; hidden?: boolean; className?: string }) {
  return <span className={cn("tabular-nums", className)}>{brl(cents, hidden)}</span>;
}

export function cap(value: string) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function monthTitle(ym: Ym) {
  return cap(fullMonthLabel(ym));
}

export function Button({
  children,
  onClick,
  type = "button",
  tone = "solid",
  disabled,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  tone?: "solid" | "ghost" | "line";
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-12 items-center justify-center gap-2 rounded-full px-5 text-sm font-medium transition duration-200 active:scale-[0.98] disabled:opacity-50",
        tone === "solid" && "bg-accent text-accent-fg",
        tone === "line" && "bg-transparent text-fg ring-1 ring-line",
        tone === "ghost" && "bg-transparent text-muted",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs text-muted">{label}</span>
      {children}
    </label>
  );
}

export const fieldClass =
  "h-12 w-full rounded-2xl bg-surface-2 px-4 text-base text-fg outline-none ring-1 ring-line transition focus:ring-accent";

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button type="button" className="absolute inset-0 bg-overlay" aria-label="Fechar" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="rise glass relative max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl p-5 sm:rounded-3xl"
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-lg font-medium">{title}</h2>
          <button type="button" onClick={onClose} className="grid size-11 place-items-center rounded-full text-muted ring-1 ring-line" aria-label="Fechar">
            <X strokeWidth={1.5} className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="rounded-3xl px-5 py-10 text-center ring-1 ring-line">
      <h3 className="text-lg font-medium">{title}</h3>
      <p className="mx-auto mt-2 max-w-xs text-sm text-muted">{body}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Notice({ text, onDone }: { text: string; onDone: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, 3200);
    return () => window.clearTimeout(timer);
  }, [onDone]);
  return (
    <div className="fixed top-4 left-1/2 z-50 w-[min(100%-2rem,24rem)] -translate-x-1/2 rounded-full bg-fg px-4 py-3 text-center text-sm text-bg">
      {text}
    </div>
  );
}

export function LimitBar({ ratio }: { ratio: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(ratio * 100)));
  const tone = ratio >= 1 ? "bg-danger" : ratio >= 0.8 ? "bg-warn" : "bg-accent";
  return (
    <div className="h-1 overflow-hidden rounded-full bg-line" aria-hidden="true">
      <div className={cn("h-full rounded-full transition-all duration-500", tone)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function PlasticCard({
  card,
  used,
  invoice,
  hidden,
  alert,
  onClick,
}: {
  card: Card;
  used: number;
  invoice: number;
  hidden?: boolean;
  alert?: string | null;
  onClick?: () => void;
}) {
  const ratio = card.limitCents > 0 ? used / card.limitCents : 0;
  const pct = Math.max(0, Math.round(ratio * 100));
  const body = (
    <>
      <div className="relative z-10 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs tracking-widest text-muted uppercase">Crédito</p>
          <h3 className="mt-1 text-2xl font-medium tracking-tight">{card.name}</h3>
        </div>
        <span className="card-chip shrink-0" aria-hidden="true" />
      </div>
      <div className="relative z-10 mt-8">
        <div className="mb-2 flex items-center justify-between text-xs text-muted">
          <span>Uso do limite</span>
          <span className="tabular-nums">{hidden ? "••••" : `${pct}%`}</span>
        </div>
        <LimitBar ratio={ratio} />
        <div className="mt-4 flex items-end justify-between gap-3 text-sm">
          <div>
            <p className="text-xs text-muted">Disponível</p>
            <Money cents={Math.max(0, card.limitCents - used)} hidden={hidden} className="text-lg" />
          </div>
          <div className="text-right">
            <p className="text-xs text-muted">Fatura</p>
            <Money cents={invoice} hidden={hidden} className="text-lg" />
          </div>
        </div>
        {alert ? <p className={cn("mt-3 text-xs", ratio >= 1 ? "text-danger" : "text-warn")}>{alert}</p> : null}
      </div>
    </>
  );
  const className = cn("plastic w-full p-5 text-left", `tone-${card.tone}`, onClick && "transition active:scale-[0.99]");
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {body}
      </button>
    );
  }
  return <article className={className}>{body}</article>;
}

export function Confetti({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, 1100);
    return () => window.clearTimeout(timer);
  }, [onDone]);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-50 flex justify-center gap-2" aria-hidden="true">
      {Array.from({ length: 7 }, (_, i) => (
        <span
          key={i}
          className="size-2 rounded-full bg-accent"
          style={{ animation: `rise 700ms ease ${i * 40}ms both` }}
        />
      ))}
    </div>
  );
}
