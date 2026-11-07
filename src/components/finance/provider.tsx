import { inboxFile, listInbox, markLaunched } from "@/lib/finance/inbox";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { AppUser } from "@/auth/session";
import { loadFinance, mutateFinance } from "@/lib/finance/api";
import { todayYm, type Ym } from "@/lib/finance/period";
import { THEMES, type Bundle, type PayMethod, type ThemeId } from "@/lib/finance/types";
import type { Mutation } from "@/lib/finance/validate";
import { Onboarding } from "./onboarding";
import { Boot, Confetti, Notice } from "./ui";

export type Tab = "home" | "in" | "out" | "cards" | "monitor" | "more" | "inbox";

export type QuickSeed = {
  method?: PayMethod;
  text?: string;
  image?: File | null;
  inboxId?: string;
};

type Ctx = {
  user: AppUser;
  bundle: Bundle;
  ym: Ym;
  setYm: (ym: Ym) => void;
  tab: Tab;
  setTab: (tab: Tab) => void;
  busy: boolean;
  notice: string | null;
  setNotice: (value: string | null) => void;
  confetti: boolean;
  setConfetti: (value: boolean) => void;
  quick: QuickSeed | null;
  openQuick: (seed?: QuickSeed) => void;
  closeQuick: () => void;
  commit: (mutation: Mutation) => Promise<Bundle | null>;
  togglePrivacy: () => void;
  selectTheme: (theme: ThemeId) => void;
  inboxCount: number;
  refreshInbox: () => void;
  markInboxLaunched: (id: string) => void;
};

const FinanceCtx = createContext<Ctx | null>(null);

export function useFinance() {
  const ctx = useContext(FinanceCtx);
  if (!ctx) throw new Error("useFinance fora do provider");
  return ctx;
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Algo deu errado.";
}

function storedTheme(): ThemeId | null {
  try {
    const value = localStorage.getItem("bankai-theme");
    if ((THEMES as readonly string[]).includes(value ?? "")) return value as ThemeId;
  } catch {
    /* ignore */
  }
  return null;
}

function paintTheme(theme: ThemeId) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem("bankai-theme", theme);
  } catch {
    /* ignore */
  }
}

export function FinanceProvider({ user, children }: { user: AppUser; children: ReactNode }) {
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [ym, setYm] = useState<Ym>({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 });
  const [tab, setTab] = useState<Tab>("home");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confetti, setConfetti] = useState(false);
  const [quick, setQuick] = useState<QuickSeed | null>(null);
  const [pendingShare, setPendingShare] = useState<QuickSeed | null>(null);
  const [inboxCount, setInboxCount] = useState(0);

  function refreshInbox() {
    void listInbox(user.id)
      .then((items) => setInboxCount(items.filter((i) => i.status === "pendente").length))
      .catch(() => undefined);
  }

  function markInboxLaunched(id: string) {
    void markLaunched(user.id, id).then(refreshInbox);
  }

  useEffect(() => {
    refreshInbox();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancel = false;
    loadFinance()
      .then((next) => {
        if (cancel) return;
        setBundle(next);
        setYm(todayYm(next.profile.monthStartDay));
        const theme = !next.profile.onboarded ? (storedTheme() ?? next.profile.theme) : next.profile.theme;
        paintTheme(theme);
      })
      .catch((error: unknown) => {
        if (!cancel) setFailed(errorText(error));
      });
    return () => {
      cancel = true;
    };
  }, [user.id]);

  useEffect(() => {
    if (!bundle) return;
    const params = new URLSearchParams(window.location.search);
    const text = [params.get("title"), params.get("text"), params.get("url")].filter(Boolean).join("\n");
    const wants = params.get("share") || params.get("text") || params.get("title") || params.get("image");
    if (!wants) return;
    const url = new URL(window.location.href);
    ["share", "title", "text", "url", "image", "n", "shareError"].forEach((key) => url.searchParams.delete(key));
    window.history.replaceState({}, "", url.pathname + url.search);
    const finish = (seed: QuickSeed) => {
      if (bundle.profile.onboarded) setQuick(seed);
      else setPendingShare(seed);
    };
    const count = Number(params.get("n") || 0);
    if (params.get("shareError")) setNotice("Não consegui receber o arquivo compartilhado. Tente de novo ou use o botão +.");
    if (count > 0) {
      void listInbox(user.id).then((items) => {
        const fresh = items.filter((item) => item.source === "share" && item.status === "pendente").slice(0, count);
        refreshInbox();
        if (fresh.length === 1) finish({ text, image: inboxFile(fresh[0]), inboxId: fresh[0].id });
        else if (fresh.length > 1) setTab("inbox");
      });
      return;
    }
    if (text.trim()) finish({ text });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle]);

  async function commit(mutation: Mutation) {
    if (!bundle) return null;
    setBusy(true);
    try {
      const before = bundle.goals.filter((goal) => goal.done).map((goal) => goal.id);
      if (mutation.op === "profile") {
        setBundle((cur) =>
          cur
            ? {
                ...cur,
                profile: {
                  ...cur.profile,
                  ...mutation.profile,
                  legalName:
                    mutation.profile.legalName !== undefined
                      ? mutation.profile.legalName
                      : cur.profile.legalName,
                  cpfHint:
                    mutation.profile.cpfHint !== undefined
                      ? mutation.profile.cpfHint
                      : cur.profile.cpfHint,
                },
              }
            : cur,
        );
      }
      const next = await mutateFinance({ data: mutation });
      setBundle(next);
      paintTheme(next.profile.theme);
      const finished = next.goals.some((goal) => goal.done && !before.includes(goal.id));
      if (finished && next.profile.celebrate) setConfetti(true);
      return next;
    } catch (error) {
      setNotice(errorText(error));
      return null;
    } finally {
      setBusy(false);
    }
  }

  if (failed) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
        <h1 className="text-2xl font-medium">Não abriu o caixa.</h1>
        <p className="mt-2 text-sm text-muted">{failed}</p>
        <button type="button" className="mt-6 text-sm underline" onClick={() => window.location.reload()}>
          Tentar de novo
        </button>
      </main>
    );
  }

  if (!bundle) return <Boot />;

  const value: Ctx = {
    user,
    bundle,
    ym,
    setYm,
    tab,
    setTab,
    busy,
    notice,
    setNotice,
    confetti,
    setConfetti,
    quick,
    openQuick: (seed) => setQuick(seed ?? {}),
    closeQuick: () => setQuick(null),
    commit,
    togglePrivacy: () => {
      void commit({ op: "profile", profile: { privacyHidden: !bundle.profile.privacyHidden } });
    },
    selectTheme: (next) => {
      void commit({ op: "profile", profile: { theme: next } });
    },
    inboxCount,
    refreshInbox,
    markInboxLaunched,
  };

  if (!bundle.profile.onboarded) {
    return (
      <div className={bundle.profile.ambient ? "ambient" : undefined}>
        <Onboarding
          defaultName={bundle.profile.displayName || user.displayName || ""}
          onTheme={(next) => {
            void commit({ op: "profile", profile: { theme: next } });
          }}
          onDone={(name) => {
            void commit({
              op: "profile",
              profile: {
                displayName: name,
                onboarded: true,
              },
            }).then(() => {
              if (pendingShare) {
                setQuick(pendingShare);
                setPendingShare(null);
              }
            });
          }}
        />
      </div>
    );
  }

  return (
    <FinanceCtx.Provider value={value}>
      <div className={bundle.profile.ambient ? "ambient relative z-10" : "relative z-10"}>{children}</div>
      {notice ? <Notice message={notice} onClose={() => setNotice(null)} /> : null}
      {confetti ? <Confetti onDone={() => setConfetti(false)} /> : null}
    </FinanceCtx.Provider>
  );
}
