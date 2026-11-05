import { useRef, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, ChartColumn, ChevronLeft, ChevronRight, CreditCard, Eye, EyeOff, House, Inbox, Plus, UserRound } from "lucide-react";
import { addMonths } from "@/lib/finance/period";
import { CardsView } from "./cards-view";
import { HomeView } from "./home";
import { InboxView } from "./inbox";
import { MoneyLists } from "./lists";
import { MonitorView } from "./monitor";
import { MoreView } from "./more";
import { useFinance, type Tab } from "./provider";
import { QuickAdd } from "./quick-add";
import { monthTitle } from "./ui";

const TABS: { id: Tab; label: string; icon: typeof House }[] = [
  { id: "home", label: "Início", icon: House },
  { id: "in", label: "Entradas", icon: ArrowDownLeft },
  { id: "out", label: "Gastos", icon: ArrowUpRight },
  { id: "cards", label: "Cartões", icon: CreditCard },
  { id: "monitor", label: "Monitor", icon: ChartColumn },
  { id: "more", label: "Mais", icon: UserRound },
];

export function AppShell() {
  const finance = useFinance();
  const { bundle, tab, setTab, ym, setYm, togglePrivacy, quick, inboxCount } = finance;
  const name = bundle.profile.displayName || finance.user.displayName || "você";
  const initial = name.charAt(0).toUpperCase();

  return (
    <div className="mx-auto min-h-dvh w-full max-w-2xl px-5 pt-6 pb-36">
      <header className="flex items-center gap-3">
        <button type="button" onClick={() => setTab("more")} className="size-11 overflow-hidden rounded-full bg-surface ring-1 ring-line" aria-label="Perfil">
          {bundle.profile.avatar ? (
            <img src={bundle.profile.avatar} alt="" className="size-full object-cover" />
          ) : (
            <span className="grid size-full place-items-center text-sm">{initial}</span>
          )}
        </button>
        <div className="min-w-0 flex-1">
          <p className="wordmark truncate text-xs text-muted">{bundle.profile.appName || "Bankai"}</p>
          <h1 className="truncate text-lg font-medium">Olá, {name}</h1>
        </div>
        <button
          type="button"
          onClick={() => setTab("inbox")}
          className="relative grid size-11 place-items-center rounded-full ring-1 ring-line"
          aria-label={inboxCount ? `Caixa de Entrada, ${inboxCount} pendente${inboxCount > 1 ? "s" : ""}` : "Caixa de Entrada"}
          aria-current={tab === "inbox" ? "page" : undefined}
        >
          <Inbox strokeWidth={1.5} />
          {inboxCount ? (
            <span className="absolute -top-1 -right-1 grid min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] leading-5 text-accent-fg">
              {inboxCount}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={togglePrivacy}
          className="grid size-11 place-items-center rounded-full ring-1 ring-line"
          aria-pressed={bundle.profile.privacyHidden}
          aria-label={bundle.profile.privacyHidden ? "Mostrar valores" : "Ocultar valores"}
        >
          {bundle.profile.privacyHidden ? <EyeOff strokeWidth={1.5} /> : <Eye strokeWidth={1.5} />}
        </button>
      </header>

      {tab !== "more" && tab !== "inbox" ? (
        <div className="mt-8 flex justify-center">
          <div className="flex items-center rounded-full ring-1 ring-line">
            <button type="button" className="grid size-11 place-items-center rounded-full text-muted" aria-label="Mês anterior" onClick={() => setYm(addMonths(ym, -1))}>
              <ChevronLeft strokeWidth={1.5} className="size-5" />
            </button>
            <p className="min-w-36 text-center text-sm">{monthTitle(ym)}</p>
            <button type="button" className="grid size-11 place-items-center rounded-full text-muted" aria-label="Próximo mês" onClick={() => setYm(addMonths(ym, 1))}>
              <ChevronRight strokeWidth={1.5} className="size-5" />
            </button>
          </div>
        </div>
      ) : null}

      <div key={tab} className="rise mt-8">
        {tab === "home" ? <HomeView /> : null}
        {tab === "in" ? <MoneyLists kind="income" /> : null}
        {tab === "out" ? <MoneyLists kind="expense" /> : null}
        {tab === "cards" ? <CardsView /> : null}
        {tab === "monitor" ? <MonitorView /> : null}
        {tab === "more" ? <MoreView /> : null}
        {tab === "inbox" ? <InboxView /> : null}
      </div>

      {quick ? null : <Fab onOpen={() => finance.openQuick()} />}
      <nav
        className={`glass fixed bottom-4 left-1/2 z-30 flex w-[min(100%-1.5rem,28rem)] -translate-x-1/2 items-center justify-between rounded-full px-1.5 py-1 ${quick ? "pointer-events-none opacity-0" : ""}`}
        aria-label="Seções"
      >
        {TABS.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              aria-current={active ? "page" : undefined}
              className={`flex h-12 min-w-11 items-center justify-center gap-1.5 rounded-full ${active ? "bg-surface-2 px-3 text-fg" : "px-1 text-subtle"}`}
            >
              <Icon strokeWidth={1.5} className="size-5 shrink-0" />
              <span className={active ? "text-xs" : "sr-only"}>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <QuickAdd />
    </div>
  );
}

function Fab({ onOpen }: { onOpen: () => void }) {
  const moved = useRef(false);
  const offset = useRef({ dx: 0, dy: 0 });
  const point = useRef<{ x: number; y: number } | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => {
    try {
      const raw = localStorage.getItem("bankai-fab");
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { x: number; y: number };
      if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) return parsed;
    } catch {
      /* ignore */
    }
    return null;
  });

  return (
    <button
      type="button"
      aria-label="Lançamento rápido"
      className="fixed z-40 grid size-14 touch-none place-items-center rounded-full bg-accent text-accent-fg select-none"
      style={pos ? { left: pos.x, top: pos.y } : { right: 20, bottom: 108 }}
      onPointerDown={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        offset.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
        moved.current = false;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        const x = Math.min(window.innerWidth - 64, Math.max(8, event.clientX - offset.current.dx));
        const y = Math.min(window.innerHeight - 72, Math.max(8, event.clientY - offset.current.dy));
        if (!point.current || Math.abs(x - point.current.x) + Math.abs(y - point.current.y) > 6) moved.current = true;
        point.current = { x, y };
        setPos({ x, y });
      }}
      onPointerUp={() => {
        if (!moved.current) onOpen();
        else if (point.current) localStorage.setItem("bankai-fab", JSON.stringify(point.current));
      }}
    >
      <span className="fab-ripple" aria-hidden="true" />
      <Plus strokeWidth={1.5} className="relative size-6" />
    </button>
  );
}
