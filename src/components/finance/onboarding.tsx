import { useState } from "react";
import { THEMES, type ThemeId } from "@/lib/finance/types";
import { Button } from "./ui";

const COPY: Record<ThemeId, { label: string; hint: string }> = {
  obsidian: { label: "Obsidian", hint: "Preto, silêncio, foco" },
  paper: { label: "Paper", hint: "Claro como papel" },
  aurora: { label: "Aurora", hint: "Noite com violeta" },
  forest: { label: "Forest", hint: "Verde sage" },
  sand: { label: "Sand", hint: "Areia e serifa" },
};

export function Onboarding({
  mode,
  theme,
  onTheme,
  defaultName,
  onFinish,
}: {
  mode: "guest" | "full" | "name";
  theme: ThemeId;
  onTheme: (theme: ThemeId) => void;
  defaultName?: string;
  onFinish: (name: string) => void;
}) {
  const steps = mode === "name" ? (["name"] as const) : mode === "guest" ? (["what", "theme"] as const) : (["what", "theme", "name"] as const);
  const [step, setStep] = useState(0);
  const [name, setName] = useState(defaultName ?? "");
  const current = steps[step] ?? "what";
  const last = step === steps.length - 1;

  function next() {
    if (!last) {
      setStep(step + 1);
      return;
    }
    onFinish(name.trim());
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-between px-6 py-14">
      <div>
        <p className="wordmark text-xs text-muted">Bankai</p>
        {current === "what" ? (
          <div className="mt-10">
            <h1 className="text-4xl font-medium tracking-tight">Seu caixa, sem planilha.</h1>
            <ul className="mt-8 space-y-4 text-sm text-muted">
              <li>Entradas e gastos do mês, fixos ou avulsos.</li>
              <li>Cartão com limite de verdade: o que ainda está em aberto.</li>
              <li>Comprovante e extrato viram lançamento, sem redigitar.</li>
            </ul>
          </div>
        ) : null}
        {current === "theme" ? (
          <div className="mt-10">
            <h1 className="text-4xl font-medium tracking-tight">Escolha o clima.</h1>
            <div className="mt-8 space-y-2">
              {THEMES.map((id) => {
                const meta = COPY[id];
                const selected = theme === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onTheme(id)}
                    className={`flex w-full items-center gap-4 rounded-2xl px-3 py-3 text-left ring-1 transition ${selected ? "ring-accent" : "ring-line"}`}
                  >
                    <span className={`swatch swatch-${id} size-11 shrink-0 rounded-full ring-1 ring-line`} />
                    <span>
                      <span className="block text-sm">{meta.label}</span>
                      <span className="block text-xs text-muted">
                        {meta.hint}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        {current === "name" ? (
          <div className="mt-10">
            <h1 className="text-4xl font-medium tracking-tight">Como podemos te chamar?</h1>
            <input
              className="mt-8 h-14 w-full rounded-2xl bg-surface px-4 text-lg outline-none ring-1 ring-line focus:ring-accent"
              placeholder="Seu nome"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
          </div>
        ) : null}
      </div>
      <Button onClick={next} className="w-full">
        {last ? (mode === "guest" ? "Entrar" : "Começar") : "Continuar"}
      </Button>
    </main>
  );
}
