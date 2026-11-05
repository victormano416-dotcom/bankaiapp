import { useState } from "react";
import { CARD_TONES, type Card, type CardTone } from "@/lib/finance/types";
import { brl, centsFromText } from "@/lib/finance/money";
import { chargeInMonth, dateLabel, daysUntilDue, invoiceTotal, openBalance } from "@/lib/finance/period";
import { useFinance } from "./provider";
import { Button, Empty, Field, Modal, Money, PlasticCard, fieldClass } from "./ui";

export function CardsView() {
  const { bundle, commit, busy } = useFinance();
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const current = bundle.cards.find((card) => card.id === openId) ?? bundle.cards[0] ?? null;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <h2 className="text-2xl font-medium">Cartões</h2>
        <button type="button" className="text-sm text-muted" onClick={() => setCreating(true)}>
          Novo
        </button>
      </div>
      {bundle.cards.length === 0 ? (
        <Empty
          title="Nenhum cartão ainda"
          body="O limite usado soma as parcelas em aberto, inclusive a deste mês."
          action={<Button onClick={() => setCreating(true)}>Adicionar cartão</Button>}
        />
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto">
            {bundle.cards.map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() => setOpenId(card.id)}
                className={`h-10 shrink-0 rounded-full px-4 text-sm ring-1 ${current?.id === card.id ? "bg-accent text-accent-fg ring-accent" : "ring-line"}`}
              >
                {card.name}
              </button>
            ))}
          </div>
          {current ? <CardDetail card={current} /> : null}
        </>
      )}
      {creating ? (
        <CardForm
          title="Novo cartão"
          busy={busy}
          onClose={() => setCreating(false)}
          onSave={async (data) => {
            const saved = await commit({ op: "launch", items: [], newCard: data });
            if (saved) setCreating(false);
          }}
        />
      ) : null}
    </div>
  );
}

function CardDetail({ card }: { card: Card }) {
  const { bundle, ym, openQuick, commit, busy } = useFinance();
  const hidden = bundle.profile.privacyHidden;
  const start = bundle.profile.monthStartDay;
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const used = bundle.purchases.filter((row) => row.cardId === card.id).reduce((sum, row) => sum + openBalance(row, ym, start), 0);
  const invoice = invoiceTotal(bundle.purchases, ym, start, card.id);
  const ratio = card.limitCents > 0 ? used / card.limitCents : 0;
  const days = daysUntilDue(card.dueDay);
  const purchases = bundle.purchases.filter((row) => row.cardId === card.id && chargeInMonth(row, ym, start) > 0);
  const alert = ratio >= 1 ? "Limite esgotado." : ratio >= 0.8 ? "Uso acima de 80%." : null;

  return (
    <div className="space-y-5">
      <PlasticCard card={card} used={used} invoice={invoice} hidden={hidden} alert={alert} />
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-xs text-muted">Limite</p>
          <Money cents={card.limitCents} hidden={hidden} />
        </div>
        <div>
          <p className="text-xs text-muted">Em aberto</p>
          <Money cents={used} hidden={hidden} />
        </div>
        <div>
          <p className="text-xs text-muted">Vence dia {card.dueDay}</p>
          <p>{days === 0 ? "Hoje" : `${days} dias`}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button className="h-10" onClick={() => openQuick({ method: "credito" })}>
          Compra
        </Button>
        <Button tone="line" className="h-10" onClick={() => setEditing(true)}>
          Editar
        </Button>
        <Button tone="ghost" className="h-10 text-danger" onClick={() => setConfirm(true)}>
          Excluir
        </Button>
      </div>
      {purchases.length === 0 ? (
        <p className="text-sm text-muted">Nada nesta fatura.</p>
      ) : (
        <ul className="divide-y divide-line">
          {purchases.map((row) => (
            <li key={row.id} className="flex items-center gap-3 py-4">
              <div className="min-w-0 flex-1">
                <p className="truncate">{row.description}</p>
                <p className="text-xs text-muted">
                  {row.category} · {dateLabel(row)}
                  {row.installments > 1 ? ` · ${row.installments}x` : ""}
                </p>
              </div>
              <div className="text-right">
                <Money cents={chargeInMonth(row, ym, start)} hidden={hidden} />
                <button type="button" className="block text-xs text-muted" onClick={() => void commit({ op: "delete-purchase", id: row.id })}>
                  Excluir
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing ? (
        <CardForm
          title="Editar cartão"
          busy={busy}
          initial={card}
          onClose={() => setEditing(false)}
          onSave={async (data) => {
            const saved = await commit({ op: "save-card", id: card.id, data });
            if (saved) setEditing(false);
          }}
        />
      ) : null}
      {confirm ? (
        <Modal title="Excluir cartão" onClose={() => setConfirm(false)}>
          <p className="text-sm text-muted">As compras deste cartão também saem.</p>
          <Button
            className="mt-5 w-full"
            disabled={busy}
            onClick={() =>
              void commit({ op: "delete-card", id: card.id }).then((saved) => {
                if (saved) setConfirm(false);
              })
            }
          >
            Excluir
          </Button>
        </Modal>
      ) : null}
    </div>
  );
}

function CardForm({
  title,
  initial,
  busy,
  onClose,
  onSave,
}: {
  title: string;
  initial?: Card;
  busy: boolean;
  onClose: () => void;
  onSave: (data: { name: string; limitCents: number; dueDay: number; tone: CardTone }) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [limit, setLimit] = useState(initial ? String(initial.limitCents) : "");
  const [due, setDue] = useState(String(initial?.dueDay ?? 10));
  const [tone, setTone] = useState<CardTone>(initial?.tone ?? "ink");
  const [error, setError] = useState("");

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Nome">
          <input className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Limite">
          <input
            className={fieldClass}
            inputMode="numeric"
            value={limit ? brl(centsFromText(limit)) : ""}
            onChange={(event) => setLimit(event.target.value.replace(/\D/g, "").slice(0, 11))}
          />
        </Field>
        <Field label="Dia de vencimento">
          <input className={fieldClass} inputMode="numeric" value={due} onChange={(event) => setDue(event.target.value.replace(/\D/g, "").slice(0, 2))} />
        </Field>
        <div className="flex gap-2">
          {CARD_TONES.map((item) => (
            <button key={item} type="button" aria-label={item} onClick={() => setTone(item)} className={`tone-${item} size-11 rounded-full ring-1 ring-line ${tone === item ? "ring-2 ring-accent" : ""}`} />
          ))}
        </div>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button
          className="w-full"
          disabled={busy}
          onClick={() => {
            if (!name.trim() || centsFromText(limit) <= 0) {
              setError("Nome e limite são obrigatórios.");
              return;
            }
            void onSave({ name: name.trim(), limitCents: centsFromText(limit), dueDay: Number(due) || 1, tone });
          }}
        >
          Salvar
        </Button>
      </div>
    </Modal>
  );
}
