// Stockage d'un livre : pages, images, entités versionnées (jamais écrasées),
// journal LLM, cache LLM, exécutions d'étapes, fichiers binaires.
import { idb, tx, getSetting, setSetting } from "./db.js";
import { nowIso, sha256, Emitter, LABEL_RE } from "./util.js";
import { effectiveConfig, deepMerge, clone } from "./config.js";

export const bookEvents = new Emitter();

function reqp(req) { return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); }); }

export class BookStorage {
  constructor(label) {
    if (!LABEL_RE.test(label)) throw new Error(`Libellé de livre invalide : « ${label} »`);
    this.label = label;
  }

  // ── Livre ──────────────────────────────────────────────────────────────
  async getBook() { return idb.get("books", this.label); }
  async updateBook(patch) {
    const book = (await this.getBook()) ?? { label: this.label, createdAt: nowIso() };
    const next = { ...book, ...patch, modifiedAt: nowIso() };
    await idb.put("books", next);
    bookEvents.emit("book-updated", { label: this.label });
    return next;
  }
  async touch() { const b = await this.getBook(); if (b) { b.modifiedAt = nowIso(); await idb.put("books", b); } }

  async getConfigOverrides() { return (await this.getBook())?.config ?? {}; }
  async setConfigOverrides(cfg) { await this.updateBook({ config: cfg }); }
  async patchConfig(patch) { const cur = await this.getConfigOverrides(); await this.setConfigOverrides(deepMerge(cur, patch)); }
  async effectiveConfig() { return effectiveConfig(await getSetting("globalConfig", {}), await this.getConfigOverrides()); }

  // ── Pages ─────────────────────────────────────────────────────────────
  async putPage(page) { await idb.put("pages", { ...page, label: this.label }); }
  async putPages(pages) { await idb.putMany("pages", pages.map((p) => ({ ...p, label: this.label }))); }
  async getPages() { const rows = await idb.getAllByIndex("pages", "byLabel", this.label); return rows.sort((a, b) => a.pageNumber - b.pageNumber); }
  async getPage(pageId) { return idb.get("pages", [this.label, pageId]); }
  async deletePage(pageId) { await idb.delete("pages", [this.label, pageId]); }

  /** Pages dans la plage configurée (start_page/end_page) et hors élagage. */
  async getActivePages(config) {
    const cfg = config ?? (await this.effectiveConfig());
    const pages = await this.getPages();
    const s = cfg.start_page ?? 1, e = cfg.end_page ?? Infinity;
    return pages.filter((p) => p.pageNumber >= s && p.pageNumber <= e);
  }

  // ── Images ────────────────────────────────────────────────────────────
  async putImage(meta, blob) {
    await idb.put("images", { ...meta, label: this.label });
    if (blob) await this.putBlob(`images/${meta.imageId}`, blob);
  }
  async getImages() { return idb.getAllByIndex("images", "byLabel", this.label); }
  async getPageImages(pageId) { return idb.getAllByIndex("images", "byPage", [this.label, pageId]); }
  async getImage(imageId) { return idb.get("images", [this.label, imageId]); }
  async getImageBlob(imageId) { return this.getBlob(`images/${imageId}`); }
  async deleteImage(imageId) { await idb.delete("images", [this.label, imageId]); await this.deleteBlob(`images/${imageId}`); }
  async updateImage(imageId, patch) { const img = await this.getImage(imageId); if (img) await idb.put("images", { ...img, ...patch }); }

  // ── Fichiers binaires (PDF, audio, vidéos, polices…) ─────────────────
  async putBlob(key, blob, meta = {}) { await idb.put("blobs", { label: this.label, key, blob, size: blob.size, type: blob.type, ...meta, updatedAt: nowIso() }); }
  async getBlob(key) { return (await idb.get("blobs", [this.label, key]))?.blob ?? null; }
  async getBlobRow(key) { return idb.get("blobs", [this.label, key]); }
  async deleteBlob(key) { await idb.delete("blobs", [this.label, key]); }
  async listBlobs(prefix = "") {
    const rows = await tx("blobs", "readonly", (s) => reqp(s.blobs.index("byLabel").getAll(this.label)));
    return rows.filter((r) => r.key.startsWith(prefix)).map(({ blob, ...rest }) => rest);
  }
  async listBlobsWithData(prefix = "") {
    const rows = await tx("blobs", "readonly", (s) => reqp(s.blobs.index("byLabel").getAll(this.label)));
    return rows.filter((r) => r.key.startsWith(prefix));
  }

  // ── Entités versionnées ───────────────────────────────────────────────
  /** Insère une nouvelle version (jamais d'écrasement) et la rend courante. */
  async putNodeData(node, itemId, data, meta = {}) {
    return tx(["node_data", "node_current"], "readwrite", async (s) => {
      const rows = await reqp(s.node_data.index("byItem").getAll([this.label, node, itemId]));
      const version = rows.reduce((m, r) => Math.max(m, r.version), 0) + 1;
      s.node_data.put({ label: this.label, node, itemId, version, data, createdAt: nowIso(), ...meta });
      s.node_current.put({ label: this.label, node, itemId, version });
      return version;
    }).then((v) => { bookEvents.emit("node-updated", { label: this.label, node, itemId, version: v }); return v; });
  }
  async getNodeData(node, itemId) {
    return tx(["node_data", "node_current"], "readonly", async (s) => {
      const cur = await reqp(s.node_current.get([this.label, node, itemId]));
      if (cur) { const row = await reqp(s.node_data.get([this.label, node, itemId, cur.version])); if (row) return row.data; }
      const rows = await reqp(s.node_data.index("byItem").getAll([this.label, node, itemId]));
      if (!rows.length) return null;
      return rows.sort((a, b) => b.version - a.version)[0].data;
    });
  }
  async getNodeRow(node, itemId) {
    return tx(["node_data", "node_current"], "readonly", async (s) => {
      const cur = await reqp(s.node_current.get([this.label, node, itemId]));
      const rows = await reqp(s.node_data.index("byItem").getAll([this.label, node, itemId]));
      if (!rows.length) return null;
      const row = cur ? rows.find((r) => r.version === cur.version) : null;
      return row ?? rows.sort((a, b) => b.version - a.version)[0];
    });
  }
  async getVersions(node, itemId) {
    const rows = await idb.getAllByIndex("node_data", "byItem", [this.label, node, itemId]);
    const cur = await idb.get("node_current", [this.label, node, itemId]);
    const curV = cur?.version ?? rows.reduce((m, r) => Math.max(m, r.version), 0);
    return rows.sort((a, b) => b.version - a.version).map((r) => ({ ...r, isCurrent: r.version === curV }));
  }
  async getVersionData(node, itemId, version) { return (await idb.get("node_data", [this.label, node, itemId, version]))?.data ?? null; }
  async setCurrentVersion(node, itemId, version) {
    await idb.put("node_current", { label: this.label, node, itemId, version });
    bookEvents.emit("node-updated", { label: this.label, node, itemId, version });
  }
  async listNodeItems(node) {
    const rows = await idb.getAllByIndex("node_data", "byNode", [this.label, node]);
    const byItem = new Map();
    for (const r of rows) { const cur = byItem.get(r.itemId); if (!cur || r.version > cur.version) byItem.set(r.itemId, r); }
    return [...byItem.values()];
  }
  async listNodes() {
    const rows = await idb.getAllByIndex("node_data", "byLabel", this.label);
    const m = new Map();
    for (const r of rows) { const k = r.node; if (!m.has(k)) m.set(k, new Set()); m.get(k).add(r.itemId); }
    return [...m.entries()].map(([node, items]) => ({ node, items: [...items].sort() }));
  }
  async deleteNode(node) {
    await idb.deleteByIndex("node_data", "byNode", [this.label, node]);
    const curs = await idb.getAllByIndex("node_current", "byLabel", this.label);
    for (const c of curs.filter((c) => c.node === node)) await idb.delete("node_current", [this.label, c.node, c.itemId]);
    bookEvents.emit("node-updated", { label: this.label, node });
  }
  async deleteNodeItem(node, itemId) {
    await idb.deleteByIndex("node_data", "byItem", [this.label, node, itemId]);
    await idb.delete("node_current", [this.label, node, itemId]);
    bookEvents.emit("node-updated", { label: this.label, node, itemId });
  }

  // ── Exécutions d'étapes ───────────────────────────────────────────────
  async setStepRun(step, patch) {
    const cur = (await idb.get("step_runs", [this.label, step])) ?? { label: this.label, step };
    const next = { ...cur, ...patch };
    await idb.put("step_runs", next);
    bookEvents.emit("step-run", { label: this.label, step, run: next });
    return next;
  }
  async getStepRuns() { const rows = await idb.getAllByIndex("step_runs", "byLabel", this.label); return Object.fromEntries(rows.map((r) => [r.step, r])); }
  async clearStepRun(step) { await idb.delete("step_runs", [this.label, step]); bookEvents.emit("step-run", { label: this.label, step, run: null }); }

  // ── Journal LLM ───────────────────────────────────────────────────────
  async appendLlmLog(entry) { await idb.add("llm_log", { label: this.label, timestamp: nowIso(), ...entry }); }
  async getLlmLogs({ step, limit = 50, offset = 0 } = {}) {
    const rows = step ? await idb.getAllByIndex("llm_log", "byLabelStep", [this.label, step]) : await idb.getAllByIndex("llm_log", "byLabel", this.label);
    rows.sort((a, b) => b.id - a.id);
    return { total: rows.length, logs: rows.slice(offset, offset + limit) };
  }
  async getAllLlmLogs() { return idb.getAllByIndex("llm_log", "byLabel", this.label); }
  async clearLlmLogs() { await idb.deleteByIndex("llm_log", "byLabel", this.label); }

  // ── Cache LLM ─────────────────────────────────────────────────────────
  async cacheGet(hash) { return (await idb.get("llm_cache", [this.label, hash]))?.response ?? null; }
  async cacheSet(hash, response, meta = {}) { await idb.put("llm_cache", { label: this.label, hash, response, createdAt: nowIso(), ...meta }); }
  async clearCache() { await idb.deleteByIndex("llm_cache", "byLabel", this.label); }
  async cacheStats() { return { entries: await idb.countByIndex("llm_cache", "byLabel", this.label) }; }

  // ── Suppression complète ─────────────────────────────────────────────
  async deleteAll() {
    for (const [store, index] of [["pages", "byLabel"], ["images", "byLabel"], ["blobs", "byLabel"], ["node_data", "byLabel"], ["node_current", "byLabel"], ["llm_log", "byLabel"], ["llm_cache", "byLabel"], ["step_runs", "byLabel"]]) {
      await idb.deleteByIndex(store, index, this.label);
    }
    await idb.delete("books", this.label);
    bookEvents.emit("book-deleted", { label: this.label });
  }
}

export async function listBooks() {
  const rows = await idb.getAll("books");
  return rows.sort((a, b) => (b.modifiedAt ?? "").localeCompare(a.modifiedAt ?? ""));
}

export async function createBook({ label, pdfBlob, pdfName, config, title = null }) {
  if (!LABEL_RE.test(label)) throw new Error("Le nom du projet ne doit contenir que des lettres, chiffres, « . », « - » et « _ » et commencer par une lettre ou un chiffre.");
  if (await idb.get("books", label)) throw new Error("Un livre portant ce nom existe déjà.");
  const now = nowIso();
  const book = { label, createdAt: now, modifiedAt: now, config: config ?? {}, pdfName: pdfName ?? null, title, part: null, split: null };
  await idb.put("books", book);
  const st = new BookStorage(label);
  if (pdfBlob) await st.putBlob("source.pdf", pdfBlob, { name: pdfName });
  bookEvents.emit("book-created", { label });
  return st;
}

/** Résumé d'un livre pour la bibliothèque (titre, auteurs, étapes terminées…). */
export async function bookSummary(label) {
  const st = new BookStorage(label);
  const book = await st.getBook();
  if (!book) return null;
  const [metadata, summary, runs, pages] = await Promise.all([
    st.getNodeData("metadata", "book"), st.getNodeData("book-summary", "book"), st.getStepRuns(), st.getPages(),
  ]);
  const completedSteps = Object.values(runs).filter((r) => r.status === "done").map((r) => r.step);
  return {
    ...book,
    title: book.titleOverride ?? metadata?.title ?? book.title ?? null,
    authors: metadata?.authors ?? [],
    publisher: metadata?.publisher ?? null,
    languageCode: metadata?.language_code ?? book.config?.editing_language ?? null,
    pageCount: pages.length,
    coverPageId: metadata?.cover_page_number ? `pg${String(metadata.cover_page_number).padStart(3, "0")}` : pages[0]?.pageId ?? null,
    summary: summary?.summary ?? null,
    completedSteps,
    hasSourcePdf: !!(await st.getBlobRow("source.pdf")),
  };
}

// ── Paramètres globaux ────────────────────────────────────────────────────
export async function getGlobalConfig() { return getSetting("globalConfig", {}); }
export async function setGlobalConfig(cfg) { await setSetting("globalConfig", cfg); bookEvents.emit("global-config", cfg); }
export async function patchGlobalConfig(patch) { await setGlobalConfig(deepMerge(await getGlobalConfig(), patch)); }

export async function getCredentials() { return getSetting("credentials", {}); }
export async function setCredentials(creds) { await setSetting("credentials", creds); bookEvents.emit("credentials", creds); }

export async function getUiPrefs() { return getSetting("uiPrefs", {}); }
export async function setUiPrefs(patch) { const cur = await getUiPrefs(); const next = { ...cur, ...patch }; await setSetting("uiPrefs", next); bookEvents.emit("ui-prefs", next); return next; }

/** Clé de cache : hachage stable des entrées ordonnées. */
export async function cacheKey(parts) { return sha256(JSON.stringify(parts)); }
export { clone };
