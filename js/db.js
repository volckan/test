// Couche IndexedDB : une base « adt-studio », toutes les données d'un livre sont
// isolées par son libellé (label) et exportables en un seul zip.

const DB_NAME = "adt-studio";
const DB_VERSION = 1;

let dbPromise = null;

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const mk = (name, opts, indexes = []) => {
        const store = db.objectStoreNames.contains(name) ? req.transaction.objectStore(name) : db.createObjectStore(name, opts);
        for (const [idx, keyPath, o] of indexes) if (!store.indexNames.contains(idx)) store.createIndex(idx, keyPath, o ?? {});
        return store;
      };
      mk("books", { keyPath: "label" });
      mk("pages", { keyPath: ["label", "pageId"] }, [["byLabel", "label"]]);
      mk("images", { keyPath: ["label", "imageId"] }, [["byLabel", "label"], ["byPage", ["label", "pageId"]]]);
      mk("blobs", { keyPath: ["label", "key"] }, [["byLabel", "label"]]);
      mk("node_data", { keyPath: ["label", "node", "itemId", "version"] }, [["byLabel", "label"], ["byItem", ["label", "node", "itemId"]], ["byNode", ["label", "node"]]]);
      mk("node_current", { keyPath: ["label", "node", "itemId"] }, [["byLabel", "label"]]);
      mk("llm_log", { keyPath: "id", autoIncrement: true }, [["byLabel", "label"], ["byLabelStep", ["label", "step"]]]);
      mk("llm_cache", { keyPath: ["label", "hash"] }, [["byLabel", "label"]]);
      mk("step_runs", { keyPath: ["label", "step"] }, [["byLabel", "label"]]);
      mk("settings", { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("Base de données bloquée par un autre onglet"));
  });
  return dbPromise;
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
}

export async function tx(stores, mode, fn) {
  const db = await openDb();
  const t = db.transaction(stores, mode);
  const s = Object.fromEntries((Array.isArray(stores) ? stores : [stores]).map((n) => [n, t.objectStore(n)]));
  const result = await fn(s, t);
  await new Promise((resolve, reject) => { t.oncomplete = () => resolve(); t.onerror = () => reject(t.error); t.onabort = () => reject(t.error ?? new Error("Transaction annulée")); });
  return result;
}

export const idb = {
  get: (store, key) => tx(store, "readonly", (s) => reqToPromise(s[store].get(key))),
  put: (store, value) => tx(store, "readwrite", (s) => reqToPromise(s[store].put(value))),
  add: (store, value) => tx(store, "readwrite", (s) => reqToPromise(s[store].add(value))),
  delete: (store, key) => tx(store, "readwrite", (s) => reqToPromise(s[store].delete(key))),
  getAll: (store, query, count) => tx(store, "readonly", (s) => reqToPromise(s[store].getAll(query, count))),
  getAllByIndex: (store, index, query, count) => tx(store, "readonly", (s) => reqToPromise(s[store].index(index).getAll(query, count))),
  getAllKeysByIndex: (store, index, query) => tx(store, "readonly", (s) => reqToPromise(s[store].index(index).getAllKeys(query))),
  count: (store, query) => tx(store, "readonly", (s) => reqToPromise(s[store].count(query))),
  countByIndex: (store, index, query) => tx(store, "readonly", (s) => reqToPromise(s[store].index(index).count(query))),
  putMany: (store, values) => tx(store, "readwrite", async (s) => { for (const v of values) s[store].put(v); }),
  deleteByIndex: (store, index, query) => tx(store, "readwrite", async (s) => {
    const keys = await reqToPromise(s[store].index(index).getAllKeys(query));
    for (const k of keys) s[store].delete(k);
    return keys.length;
  }),
};

export async function getSetting(key, fallback = undefined) {
  const row = await idb.get("settings", key);
  return row ? row.value : fallback;
}
export async function setSetting(key, value) { await idb.put("settings", { key, value }); }
export async function deleteSetting(key) { await idb.delete("settings", key); }

export async function estimateUsage() {
  if (navigator.storage?.estimate) { const e = await navigator.storage.estimate(); return { usage: e.usage ?? 0, quota: e.quota ?? 0 }; }
  return { usage: 0, quota: 0 };
}
export async function requestPersistence() {
  if (navigator.storage?.persist) { try { return await navigator.storage.persist(); } catch { return false; } }
  return false;
}
