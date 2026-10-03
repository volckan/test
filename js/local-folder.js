// Stockage des livres dans un dossier de l'ordinateur (File System Access API : Chrome, Edge, Opera).
// Le dossier reçoit une archive de projet par livre (<label>.adt-project.zip), mise à jour automatiquement.
import { getSetting, setSetting, deleteSetting } from "./db.js";
import { bookEvents, listBooks } from "./storage.js";
import { Emitter, nowIso } from "./util.js";

export const folderEvents = new Emitter();
export const isFolderSupported = () => typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
export const archiveName = (label) => `${label}.adt-project.zip`;
const ARCHIVE_RE = /\.adt-project\.zip$|-project\.zip$/i;

let cached = undefined;
export async function getFolderHandle() { if (cached === undefined) cached = (await getSetting("localFolder", null)) ?? null; return cached; }
async function permissionOf(handle) { try { return await handle.queryPermission({ mode: "readwrite" }); } catch { return "denied"; } }

/** État du dossier : { supported, connected, name, permission ("granted"|"prompt"|"denied"), autoSave, lastSaved: {label: iso} }. */
export async function folderStatus() {
  const handle = await getFolderHandle();
  const autoSave = (await getSetting("localFolderAutoSave", true)) !== false;
  if (!handle) return { supported: isFolderSupported(), connected: false, autoSave, lastSaved: {} };
  return { supported: true, connected: true, name: handle.name, permission: await permissionOf(handle), autoSave, lastSaved: await getSetting("localFolderSaved", {}) };
}
export async function chooseFolder() {
  if (!isFolderSupported()) throw new Error("Ce navigateur ne permet pas d'accéder à un dossier de l'ordinateur (utilisez Chrome, Edge ou Opera).");
  const handle = await window.showDirectoryPicker({ mode: "readwrite", id: "adt-studio-livres", startIn: "documents" });
  try { await setSetting("localFolder", handle); } catch (e) { console.warn("Dossier local : descripteur non persistant", e); }
  cached = handle; folderEvents.emit("change");
  return handle;
}
/** À appeler depuis un geste utilisateur : redemande l'autorisation d'écriture après un redémarrage. */
export async function reconnectFolder() {
  const handle = await getFolderHandle(); if (!handle) return "none";
  let p = "denied"; try { p = await handle.requestPermission({ mode: "readwrite" }); } catch (e) { console.warn("reconnectFolder", e); }
  folderEvents.emit("change"); return p;
}
export async function disconnectFolder() { await deleteSetting("localFolder"); cached = null; folderEvents.emit("change"); }
export async function setFolderAutoSave(on) { await setSetting("localFolderAutoSave", !!on); folderEvents.emit("change"); }

async function readyHandle() { const handle = await getFolderHandle(); if (!handle) return null; return (await permissionOf(handle)) === "granted" ? handle : null; }

/** Écrit l'archive de projet d'un livre dans le dossier. Retourne la taille écrite. */
export async function saveBookToFolder(label, { onProgress } = {}) {
  const handle = await readyHandle(); if (!handle) throw new Error("Dossier local non connecté ou autorisation manquante.");
  const { exportProject } = await import("./packaging/exports.js");
  const { blob } = await exportProject(label, { onProgress });
  const fh = await handle.getFileHandle(archiveName(label), { create: true });
  const w = await fh.createWritable(); await w.write(blob); await w.close();
  const saved = await getSetting("localFolderSaved", {}); saved[label] = nowIso(); await setSetting("localFolderSaved", saved);
  folderEvents.emit("saved", { label, size: blob.size });
  return blob.size;
}
export async function saveAllBooksToFolder({ onProgress } = {}) {
  const books = await listBooks(); let i = 0; const out = [];
  for (const b of books) { onProgress?.(b.label, i / books.length); try { out.push({ label: b.label, size: await saveBookToFolder(b.label) }); } catch (e) { out.push({ label: b.label, error: e.message }); } i++; }
  onProgress?.("Terminé", 1); return out;
}
/** Archives présentes dans le dossier : [{ name, label, size, modified, file }]. */
export async function listFolderArchives() {
  const handle = await readyHandle(); if (!handle) return [];
  const out = [];
  for await (const [name, entry] of handle.entries()) {
    if (entry.kind !== "file" || !ARCHIVE_RE.test(name)) continue;
    const file = await entry.getFile();
    out.push({ name, label: name.replace(ARCHIVE_RE, ""), size: file.size, modified: file.lastModified, file });
  }
  return out.sort((a, b) => b.modified - a.modified);
}
export async function deleteFolderArchive(name) { const handle = await readyHandle(); if (!handle) return; await handle.removeEntry(name); folderEvents.emit("change"); }

// ── Sauvegarde automatique (anti-rebond par livre, hors exécution en cours) ──
const timers = new Map(); let saving = false; let started = false;
const DELAY_MS = 20000;
async function schedule(label) {
  if (!label) return;
  if ((await getSetting("localFolderAutoSave", true)) === false) return;
  if (!(await readyHandle())) return;
  clearTimeout(timers.get(label)); timers.set(label, setTimeout(() => flush(label), DELAY_MS));
}
async function flush(label) {
  const { isRunning } = await import("./pipeline/runner.js");
  if (saving || isRunning(label)) { timers.set(label, setTimeout(() => flush(label), 5000)); return; }
  saving = true;
  try { if ((await listBooks()).some((b) => b.label === label)) await saveBookToFolder(label); }
  catch (e) { console.warn("Sauvegarde dans le dossier", e); folderEvents.emit("error", { label, message: e.message }); }
  finally { saving = false; }
}
export function startFolderAutoSave() {
  if (started || !isFolderSupported()) return; started = true;
  bookEvents.on("node-updated", (p) => schedule(p?.label));
  bookEvents.on("book-updated", (p) => schedule(p?.label));
  bookEvents.on("step-run", (p) => { if (p?.run?.status === "done" || p?.run?.status === "skipped") schedule(p?.label); });
  bookEvents.on("book-deleted", (p) => { clearTimeout(timers.get(p?.label)); timers.delete(p?.label); });
}
