import { useState } from "react";
import { signOut } from "@/auth/session";
import { bundleToCsv, downloadText } from "@/lib/finance/csv";
import { brl, centsFromText } from "@/lib/finance/money";
import { THEMES, type Goal, type ThemeId } from "@/lib/finance/types";
import { useFinance } from "./provider";
import { Button, Field, Modal, Money, fieldClass, monthTitle } from "./ui";

const THEME_LABEL: Record<ThemeId, string> = {
  obsidian: "Obsidian",
  paper: "Paper",
  aurora: "Aurora",
  forest: "Forest",
  sand: "Sand",
};

export function MoreView() {
  const { bundle, ym, commit, busy, selectTheme, user } = useFinance();
  const hidden = bundle.profile.privacyHidden;
  const profile = bundle.profile;
  const [name, setName] = useState(profile.displayName);
  const [appName, setAppName] = useState(profile.appName);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);

  async function saveProfile(extra?: Partial<typeof profile>) {
    await commit({
      op: "profile",
      profile: { displayName: name.trim(), appName: appName.trim() || "BANKAI", ...extra },
    });
  }

  async function onAvatar(file: File) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const avatar = canvas.toDataURL("image/jpeg", 0.72);
    await commit({ op: "profile", profile: { avatar } });
  }

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <h2 className="text-2xl font-medium">Perfil</h2>
        <div className="flex items-center gap-4">
          <label className="grid size-16 cursor-pointer place-items-center overflow-hidden rounded-full bg-surface ring-1 ring-line">
            {profile.avatar ? <img src={profile.avatar} alt="" className="size-full object-cover" /> : <span>Foto</span>}
            <input type="file" accept="image/*" className="sr-only" onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void onAvatar(file);
            }} />
          </label>
          <div>
            <p className="text-sm">{user.email}</p>
          </div>
        </div>
        <Field label="Nome">
          <input className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Nome do app">
          <input className={fieldClass} value={appName} onChange={(event) => setAppName(event.target.value)} />
        </Field>
        <Field label="Moeda">
          <p className={`${fieldClass} flex items-center text-muted`}>Real brasileiro · BRL</p>
        </Field>
        <Field label="Início do mês">
          <select
            className={fieldClass}
            value={profile.monthStartDay}
            onChange={(event) => void saveProfile({ monthStartDay: Number(event.target.value), displayName: name, appName })}
          >
            {Array.from({ length: 28 }, (_, index) => (
              <option key={index + 1} value={index + 1}>
                Dia {index + 1}
              </option>
            ))}
          </select>
        </Field>
        <Button disabled={busy} onClick={() => void saveProfile()}>
          Salvar perfil
        </Button>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm text-muted">Tema</h3>
        <div className="grid grid-cols-1 gap-2">
          {THEMES.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => selectTheme(id)}
              className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-left ring-1 ${profile.theme === id ? "ring-accent" : "ring-line"}`}
            >
              <span className={`swatch swatch-${id} size-8 rounded-full ring-1 ring-line`} />
              <span className="text-sm">{THEME_LABEL[id]}</span>
            </button>
          ))}
        </div>
        <ToggleRow
          label="Fundo suave"
          checked={profile.ambient}
          onChange={(ambient) => void commit({ op: "profile", profile: { ambient } })}
        />
        <ToggleRow
          label="Celebrar meta"
          checked={profile.celebrate}
          onChange={(celebrate) => void commit({ op: "profile", profile: { celebrate } })}
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm text-muted">Metas</h3>
          <button type="button" className="text-sm" onClick={() => setGoalOpen(true)}>
            Nova
          </button>
        </div>
        {bundle.goals.length === 0 ? <p className="text-sm text-muted">Uma meta de cada vez. O progresso é seu.</p> : null}
        {bundle.goals.map((goal) => (
          <GoalRow key={goal.id} goal={goal} hidden={hidden} />
        ))}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm text-muted">Dados</h3>
        <div className="flex flex-wrap gap-2">
          <Button
            tone="line"
            className="h-10"
            onClick={() => downloadText(`bankai-${ym.year}-${ym.month}.csv`, bundleToCsv(bundle, ym), "text/csv")}
          >
            CSV do mês
          </Button>
          <Button
            tone="line"
            className="h-10"
            onClick={() => downloadText("bankai.csv", bundleToCsv(bundle), "text/csv")}
          >
            CSV completo
          </Button>
          <Button
            tone="line"
            className="h-10"
            onClick={() => downloadText("bankai-backup.json", JSON.stringify(bundle, null, 2), "application/json")}
          >
            Baixar backup
          </Button>
        </div>
        <label className="flex h-12 items-center justify-center rounded-full text-sm ring-1 ring-line">
          Importar backup
          <input
            type="file"
            accept="application/json"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              void file.text().then((text) => {
                try {
                  const snapshot = JSON.parse(text) as typeof bundle;
                  return commit({ op: "import", snapshot });
                } catch {
                  return null;
                }
              });
            }}
          />
        </label>
        <button type="button" className="text-sm text-muted" onClick={() => setPurgeOpen(true)}>
          Limpar lançamentos encerrados
        </button>
      </section>

      <section>
        <Button tone="line" className="w-full" onClick={() => void signOut()}>
          Sair da conta
        </Button>
      </section>

      {goalOpen ? <GoalForm onClose={() => setGoalOpen(false)} /> : null}
      {purgeOpen ? (
        <Modal title="Limpar encerrados" onClose={() => setPurgeOpen(false)}>
          <p className="text-sm text-muted">Remove parcelas já quitadas e gastos avulsos de meses passados. Recorrentes ficam.</p>
          <Button
            className="mt-5 w-full"
            disabled={busy}
            onClick={() => void commit({ op: "purge" }).then(() => setPurgeOpen(false))}
          >
            Limpar
          </Button>
        </Modal>
      ) : null}
      <p className="sr-only">{monthTitle(ym)}</p>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between py-2 text-left text-sm"
    >
      {label}
      <span className={`relative h-6 w-11 rounded-full ring-1 ring-line transition ${checked ? "bg-accent" : "bg-surface-2"}`}>
        <span className={`absolute top-0.5 size-5 rounded-full transition ${checked ? "left-5 bg-accent-fg" : "left-0.5 bg-muted"}`} />
      </span>
    </button>
  );
}

function GoalRow({ goal, hidden }: { goal: Goal; hidden: boolean }) {
  const { commit, busy } = useFinance();
  const [digits, setDigits] = useState("");
  const pct = Math.min(100, Math.round((goal.savedCents / Math.max(1, goal.targetCents)) * 100));
  const extra = centsFromText(digits);
  return (
    <div className="rounded-2xl p-4 ring-1 ring-line">
      <div className="flex items-baseline justify-between gap-3">
        <p className={goal.done ? "text-ok" : ""}>{goal.name}</p>
        <span className="text-xs text-muted tabular-nums">{hidden ? "••••" : `${pct}%`}</span>
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-line">
        <div className="h-full bg-accent transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted">
        <Money cents={goal.savedCents} hidden={hidden} /> de <Money cents={goal.targetCents} hidden={hidden} />
        {goal.done ? " · concluída" : ` · até ${monthTitle({ year: goal.year, month: goal.month })}`}
      </p>
      {goal.done ? null : (
        <div className="mt-3 flex gap-2">
          <input
            className="h-11 min-w-0 flex-1 rounded-full bg-surface-2 px-4 text-sm outline-none ring-1 ring-line"
            inputMode="numeric"
            placeholder="Guardar"
            aria-label={`Guardar em ${goal.name}`}
            value={digits ? brl(extra) : ""}
            onChange={(event) => setDigits(event.target.value.replace(/\D/g, "").slice(0, 11))}
          />
          <button
            type="button"
            disabled={busy || extra <= 0}
            className="h-11 rounded-full px-4 text-sm ring-1 ring-line disabled:opacity-40"
            onClick={() => {
              void commit({
                op: "save-goal",
                id: goal.id,
                data: { ...goal, savedCents: goal.savedCents + extra },
              }).then(() => setDigits(""));
            }}
          >
            Guardar
          </button>
        </div>
      )}
      <button type="button" className="mt-2 text-xs text-muted" onClick={() => void commit({ op: "delete-goal", id: goal.id })}>
        Excluir
      </button>
    </div>
  );
}

function GoalForm({ onClose }: { onClose: () => void }) {
  const { commit, busy, ym } = useFinance();
  const [name, setName] = useState("");
  const [digits, setDigits] = useState("");
  const [month, setMonth] = useState(`${ym.year}-${String(ym.month).padStart(2, "0")}`);
  const [error, setError] = useState("");

  return (
    <Modal title="Nova meta" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Nome">
          <input className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Valor">
          <input
            className={fieldClass}
            inputMode="numeric"
            value={digits ? brl(centsFromText(digits)) : ""}
            onChange={(event) => setDigits(event.target.value.replace(/\D/g, "").slice(0, 11))}
          />
        </Field>
        <Field label="Até">
          <input type="month" className={fieldClass} value={month} onChange={(event) => setMonth(event.target.value)} />
        </Field>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button
          className="w-full"
          disabled={busy}
          onClick={() => {
            const [year, mon] = month.split("-").map(Number);
            if (!name.trim() || centsFromText(digits) <= 0) {
              setError("Dê um nome e um valor.");
              return;
            }
            void commit({
              op: "save-goal",
              data: { name: name.trim(), targetCents: centsFromText(digits), savedCents: 0, year, month: mon },
            }).then((saved) => {
              if (saved) onClose();
            });
          }}
        >
          Criar meta
        </Button>
      </div>
    </Modal>
  );
}
