/**
 * Caixa de Entrada: comprovantes guardados no aparelho (IndexedDB) para lançar depois.
 * O service worker (public/sw.js) grava aqui os arquivos compartilhados de outros apps.
 */
export type InboxItem = {
  id: string;
  blob: Blob;
  name: string;
  type: string;
  createdAt: number;
  status: "pendente" | "lancado";
  source: "share" | "upload";
  uid?: string;
};

const DB_NAME = "bankai-inbox";
const STORE = "items";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = work(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

const byNewest = (a: InboxItem, b: InboxItem) => b.createdAt - a.createdAt;

/** Itens da conta atual (mais novos primeiro). Itens recebidos pelo service worker, ainda sem dono, passam a ser desta conta. */
export async function listInbox(uid: string): Promise<InboxItem[]> {
  const all = await run<InboxItem[]>("readonly", (store) => store.getAll());
  const mine: InboxItem[] = [];
  for (const item of all) {
    if (item.uid && item.uid !== uid) continue;
    if (!item.uid) {
      item.uid = uid;
      await run("readwrite", (store) => store.put(item));
    }
    mine.push(item);
  }
  return mine.sort(byNewest);
}

export async function addToInbox(uid: string, file: File, source: InboxItem["source"] = "upload"): Promise<InboxItem> {
  const item: InboxItem = {
    id: crypto.randomUUID(),
    blob: file,
    name: file.name || "comprovante",
    type: file.type || "image/jpeg",
    createdAt: Date.now(),
    status: "pendente",
    source,
    uid,
  };
  await run("readwrite", (store) => store.put(item));
  return item;
}

export async function markLaunched(id: string): Promise<void> {
  const item = await run<InboxItem | undefined>("readonly", (store) => store.get(id));
  if (item) await run("readwrite", (store) => store.put({ ...item, status: "lancado" }));
}

export async function removeInbox(id: string): Promise<void> {
  await run("readwrite", (store) => store.delete(id));
}

export async function clearLaunched(uid: string): Promise<void> {
  const mine = await listInbox(uid);
  for (const item of mine) if (item.status === "lancado") await removeInbox(item.id);
}

export const inboxFile = (item: InboxItem) => new File([item.blob], item.name, { type: item.type });
