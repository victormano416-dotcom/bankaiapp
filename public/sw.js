// BANKAI service worker: recebe comprovantes compartilhados (Android) e guarda na Caixa de Entrada.
const DB_NAME = "bankai-inbox";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.pathname !== "/compartilhar" || event.request.method !== "POST") return;
  event.respondWith(shareTarget(event.request));
});

function openInbox() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("items", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveFiles(files) {
  const db = await openInbox();
  await new Promise((resolve, reject) => {
    const tx = db.transaction("items", "readwrite");
    const store = tx.objectStore("items");
    files.forEach((file, index) => {
      store.put({
        id: crypto.randomUUID(),
        blob: file,
        name: file.name || "comprovante",
        type: file.type || "image/jpeg",
        createdAt: Date.now() + index,
        status: "pendente",
        source: "share",
      });
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function shareTarget(request) {
  let title = "";
  let text = "";
  let sharedUrl = "";
  const files = [];
  try {
    const form = await request.formData();
    title = String(form.get("title") || "");
    text = String(form.get("text") || "");
    sharedUrl = String(form.get("url") || "");
    // Aceita qualquer campo de arquivo, não só "media": alguns apps enviam com outro nome.
    for (const value of form.values()) {
      if (typeof value !== "string" && value.size > 0) files.push(value);
    }
  } catch (error) {
    console.error("share-target: não consegui ler o formulário", error);
  }

  let saved = 0;
  if (files.length) {
    try {
      await saveFiles(files);
      saved = files.length;
    } catch (error) {
      console.error("share-target: não consegui guardar o arquivo", error);
    }
  }

  const params = new URLSearchParams({ share: "1" });
  if (saved) params.set("n", String(saved));
  else if (files.length) params.set("shareError", "1");
  if (title) params.set("title", title.slice(0, 300));
  if (text) params.set("text", text.slice(0, 8000));
  if (sharedUrl) params.set("url", sharedUrl.slice(0, 500));
  return Response.redirect(`/?${params.toString()}`, 303);
}
