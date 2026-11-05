import { useEffect, useRef, useState } from "react";
import { FileText, Plus, Trash2 } from "lucide-react";
import { addToInbox, clearLaunched, inboxFile, listInbox, removeInbox, type InboxItem } from "@/lib/finance/inbox";
import { useFinance } from "./provider";

function Thumb({ item }: { item: InboxItem }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!item.type.startsWith("image/")) return;
    const url = URL.createObjectURL(item.blob);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [item]);
  return (
    <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-surface-2">
      {src ? <img src={src} alt="" className="size-full object-cover" /> : <FileText strokeWidth={1.5} className="size-6 text-muted" />}
    </div>
  );
}

const when = (time: number) =>
  new Date(time).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export function InboxView() {
  const { user, openQuick, refreshInbox, inboxTick } = useFinance();
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancel = false;
    listInbox(user.id)
      .then((list) => !cancel && setItems(list))
      .catch(() => !cancel && setItems([]));
    return () => {
      cancel = true;
    };
  }, [user.id, inboxTick]);

  async function pick(files: FileList | null) {
    if (!files?.length) return;
    for (const file of Array.from(files)) await addToInbox(user.id, file, "upload");
    if (input.current) input.current.value = "";
    refreshInbox();
  }

  const launched = (items ?? []).filter((item) => item.status === "lancado").length;

  return (
    <section aria-label="Caixa de Entrada" className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-medium">Caixa de Entrada</h2>
          <p className="mt-1 text-sm text-muted">Comprovantes para lançar depois. O que você compartilhar do banco cai aqui.</p>
        </div>
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-accent px-4 text-sm text-accent-fg"
        >
          <Plus strokeWidth={1.5} className="size-4" />
          Comprovante
        </button>
        <input ref={input} type="file" accept="image/*,application/pdf" multiple hidden onChange={(event) => void pick(event.target.files)} />
      </div>

      {items === null ? null : items.length === 0 ? (
        <div className="rounded-3xl bg-surface p-8 text-center ring-1 ring-line">
          <p className="text-sm text-muted">Nada por aqui. Compartilhe um comprovante do app do banco para o BANKAI ou toque em Comprovante.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 rounded-3xl bg-surface p-3 ring-1 ring-line">
              <Thumb item={item} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{item.name}</p>
                <p className="text-xs text-muted">
                  {when(item.createdAt)} · {item.status === "lancado" ? "Lançado" : "Pendente"}
                </p>
              </div>
              {item.status === "pendente" ? (
                <button
                  type="button"
                  onClick={() => openQuick({ image: inboxFile(item), inboxId: item.id })}
                  className="h-10 rounded-full bg-accent px-4 text-sm text-accent-fg"
                >
                  Lançar
                </button>
              ) : null}
              <button
                type="button"
                aria-label="Excluir comprovante"
                onClick={() => void removeInbox(item.id).then(refreshInbox)}
                className="grid size-10 place-items-center rounded-full text-muted ring-1 ring-line"
              >
                <Trash2 strokeWidth={1.5} className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {launched > 0 ? (
        <button
          type="button"
          onClick={() => void clearLaunched(user.id).then(refreshInbox)}
          className="h-11 w-full rounded-full text-sm text-muted ring-1 ring-line"
        >
          Limpar {launched} já lançado{launched > 1 ? "s" : ""}
        </button>
      ) : null}
    </section>
  );
}
