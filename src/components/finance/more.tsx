import { useEffect, useState } from "react";
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
  const [legalName, setLegalName] = useState(profile.legalName ?? "");
  const [cpfHint, setCpfHint] = useState(profile.cpfHint ?? "");
  const [appName, setAppName] = useState(profile.appName);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  // Sincroniza com o caixa; não apaga digitação se o perfil ainda vier vazio.
  useEffect(() => {
    if (profile.displayName) setName(profile.displayName);
    if (profile.legalName) setLegalName(profile.legalName);
    if (profile.cpfHint) setCpfHint(profile.cpfHint);
    if (profile.appName) setAppName(profile.appName);
  }, [profile.displayName, profile.legalName, profile.cpfHint, profile.appName]);

  useEffect(() => {
    try {
      const key = `bankai-id:${user.id}`;
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const cached = JSON.parse(raw) as { legalName?: string; cpfHint?: string };
      const needLegal = !profile.legalName && !!cached.legalName;
      const needCpf = !profile.cpfHint && !!cached.cpfHint;
      if (!needLegal && !needCpf) return;
      if (needLegal) setLegalName(cached.legalName || "");
      if (needCpf) setCpfHint(cached.cpfHint || "");
      void commit({
        op: "profile",
        profile: {
          legalName: cached.legalName || profile.legalName || "",
          cpfHint: (cached.cpfHint || profile.cpfHint || "").replace(/\D/g, "").slice(0, 11),
        },
      });
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  async function saveProfile(extra?: Partial<typeof profile>) {
    const nextLegal = (extra && "legalName" in extra ? String(extra.legalName ?? "") : legalName).trim();
    const nextCpf = (extra && "cpfHint" in extra ? String(extra.cpfHint ?? "") : cpfHint).replace(/\D/g, "").slice(0, 11);
    const nextName = (extra && "displayName" in extra ? String(extra.displayName ?? "") : name).trim();
    const nextApp = (extra && "appName" in extra ? String(extra.appName ?? "") : appName).trim() || "BANKAI";
    const saved = await commit({
      op: "profile",
      profile: {
        displayName: nextName,
        legalName: nextLegal,
        cpfHint: nextCpf,
        appName: nextApp,
        ...extra,
      },
    });
    if (saved) {
      const finalLegal = saved.profile.legalName || nextLegal;
      const finalCpf = saved.profile.cpfHint || nextCpf;
      setName(saved.profile.displayName || nextName);
      setLegalName(finalLegal);
      setCpfHint(finalCpf);
      setAppName(saved.profile.appName || nextApp);
      try {
        localStorage.setItem(
          `bankai-id:${user.id}`,
          JSON.stringify({ legalName: finalLegal, cpfHint: finalCpf }),
        );
      } catch {
        /* ignore */
      }
      setSavedOk(true);
      window.setTimeout(() => setSavedOk(false), 2000);
    }
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
        <Field label="Como quer ser chamado">
          <input className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Nome completo no banco">
          <input
            className={fieldClass}
            value={legalName}
            onChange={(event) => setLegalName(event.target.value)}
            autoComplete="name"
          />
        </Field>
        <Field label="CPF (só números)">
          <input
            className={fieldClass}
            inputMode="numeric"
            value={cpfHint}
            onChange={(event) => setCpfHint(event.target.value.replace(/\D/g, "").slice(0, 11))}
            autoComplete="off"
          />
        </Field>
        <p className="text-xs text-muted">
          Nome completo e CPF são usados só neste aparelho para o leitor de comprovante saber se o Pix/TED é entrada (você recebeu) ou saída (você enviou). Não vão para o banco nem para terceiros.
        </p>
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
            onChange={(event) =>
              void saveProfile({
                monthStartDay: Number(event.target.value),
                displayName: name,
                legalName,
                cpfHint,
                appName,
              })
            }
          >
            {Array.from({ length: 28 }, (_, index) => (
              <option key={index + 1} value={index + 1}>
                Dia {index + 1}
              </option>
            ))}
          </select>
        </Field>
        <Button disabled={busy} onClick={() => void saveProfile()}>
          {savedOk ? "Salvo" : busy ? "Salvando…" : "Salvar perfil"}
        </Button>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm text-muted">Tema</h3>
        <div className="grid grid-cols-1 gap-2">
          {THEMES.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => void selectTheme(id)}
              className={`flex h-12 items-center justify-between rounded-2xl px-4 text-left ring-1 ${
                profile.theme === id ? "ring-accent" : "ring-line"
              }`}
            >
              <span>{THEME_LABEL[id]}</span>
              <span className={`tone-${id} size-6 rounded-full`} />
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm text-muted">Preferências</h3>
        <Toggle
          label="Ambiente suave"
          checked={profile.ambient}
          onChange={(ambient) => void commit({ op: "profile", profile: { ambient } })}
        />
        <Toggle
          label="Celebrar metas"
          checked={profile.celebrate}
          onChange={(celebrate) => void commit({ op: "profile", profile: { celebrate } })}
        />
        <Toggle
          label="Ocultar valores"
          checked={hidden}
          onChange={() => void commit({ op: "profile", profile: { privacyHidden: !hidden } })}
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <h3 className="text-sm text-muted">Metas · {monthTitle(ym)}</h3>
          <button type="button" className="text-sm text-muted" onClick={() => setGoalOpen(true)}>
            Nova
          </button>
        </div>
        {bundle.goals.length === 0 ? (
          <p className="text-sm text-muted">Nenhuma meta ainda.</p>
        ) : (
          <ul className="space-y-3">
            {bundle.goals.map((goal) => (
              <GoalRow key={goal.id} goal={goal} hidden={hidden} />
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm text-muted">Dados</h3>
        <Button
          tone="line"
          className="w-full"
          onClick={() => downloadText(`bankai-${ym.year}-${ym.month}.csv`, bundleToCsv(bundle, ym), "text/csv;charset=utf-8")}
        >
          Exportar CSV do mês
        </Button>
        <label className="block">
          <span className="mb-2 block text-xs text-muted">Importar backup</span>
          <input
            type="file"
            accept="application/json,.json"
            className={fieldClass}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              void file.text().then((raw) => {
                try {
                  const snapshot = JSON.parse(raw);
                  return commit({ op: "import", snapshot });
                } catch {
                  return null;
                }
              });
            }}
          />
        </label>
        <Button tone="line" className="w-full text-danger" onClick={() => setPurgeOpen(true)}>
          Limpar lançamentos antigos
        </Button>
        <Button tone="ghost" className="w-full" onClick={() => void signOut()}>
          Sair
        </Button>
      </section>

      {goalOpen ? <GoalForm onClose={() => setGoalOpen(false)} /> : null}
      {purgeOpen ? (
        <Modal title="Limpar antigos" onClose={() => setPurgeOpen(false)}>
          <p className="text-sm text-muted">
            Remove compras já quitadas e gastos não recorrentes de meses anteriores ao atual.
          </p>
          <Button
            className="mt-5 w-full"
            disabled={busy}
            onClick={() => void commit({ op: "purge" }).then(() => setPurgeOpen(false))}
          >
            Confirmar
          </Button>
        </Modal>
      ) : null}
    </div>
  );
}

function Toggle({
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
      className="flex h-12 w-full items-center justify-between rounded-2xl px-4 ring-1 ring-line"
      onClick={() => onChange(!checked)}
    >
      <span className="text-sm">{label}</span>
      <span className={`size-5 rounded-full ${checked ? "bg-accent" : "bg-line"}`} />
    </button>
  );
}

function GoalRow({ goal, hidden }: { goal: Goal; hidden: boolean }) {
  const { commit, busy } = useFinance();
  const [digits, setDigits] = useState("");
  const ratio = goal.targetCents > 0 ? Math.min(1, goal.savedCents / goal.targetCents) : 0;
  return (
    <li className="rounded-2xl p-4 ring-1 ring-line">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{goal.name}</p>
          <p className="text-xs text-muted">
            <Money cents={goal.savedCents} hidden={hidden} /> de <Money cents={goal.targetCents} hidden={hidden} />
          </p>
        </div>
        {goal.done ? <span className="text-xs text-accent">Feita</span> : null}
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(ratio * 100)}%` }} />
      </div>
      {!goal.done ? (
        <div className="mt-3 flex gap-2">
          <input
            className={fieldClass}
            inputMode="numeric"
            placeholder="Guardar"
            value={digits ? brl(centsFromText(digits)) : ""}
            onChange={(event) => setDigits(event.target.value.replace(/\D/g, "").slice(0, 11))}
          />
          <Button
            disabled={busy}
            onClick={() => {
              const add = centsFromText(digits);
              if (add <= 0) return;
              void commit({
                op: "save-goal",
                id: goal.id,
                data: {
                  name: goal.name,
                  targetCents: goal.targetCents,
                  savedCents: goal.savedCents + add,
                  year: goal.year,
                  month: goal.month,
                },
              }).then(() => setDigits(""));
            }}
          >
            +
          </Button>
        </div>
      ) : null}
      <button type="button" className="mt-2 text-xs text-muted" onClick={() => void commit({ op: "delete-goal", id: goal.id })}>
        Excluir
      </button>
    </li>
  );
}

function GoalForm({ onClose }: { onClose: () => void }) {
  const { commit, busy, ym } = useFinance();
  const [name, setName] = useState("");
  const [digits, setDigits] = useState("");
  const [month, setMonth] = useState(`${ym.year}-${String(ym.month).padStart(2, "0")}`);
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
        <Button
          className="w-full"
          disabled={busy}
          onClick={() => {
            const target = centsFromText(digits);
            if (!name.trim() || target <= 0) return;
            const [y, m] = month.split("-").map(Number);
            void commit({
              op: "save-goal",
              data: {
                name: name.trim(),
                targetCents: target,
                savedCents: 0,
                year: y || ym.year,
                month: m || ym.month,
              },
            }).then((saved) => {
              if (saved) onClose();
            });
          }}
        >
          Criar
        </Button>
      </div>
    </Modal>
  );
}
