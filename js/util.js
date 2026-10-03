// Utilitaires partagés.

export async function sha256(input) {
  const data = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0; return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function pad3(n) { return String(n).padStart(3, "0"); }
export function pageIdOf(n) { return `pg${pad3(n)}`; }
export function sectionIdOf(pageId, seq) { return `${pageId}_sec${pad3(seq)}`; }
export function parseSectionId(id) { const m = /^(.+)_sec(\d+)$/.exec(id); return m ? { pageId: m[1], seq: Number(m[2]) } : null; }
export function quizIdOf(seq) { return `qz${pad3(seq)}`; }
export function nowIso() { return new Date().toISOString(); }

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
export function escapeAttr(s) { return escapeHtml(s); }
export function escapeXml(s) { return escapeHtml(s).replace(/&#39;/g, "&apos;"); }

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
export async function blobToDataUrl(blob) {
  return `data:${blob.type || "application/octet-stream"};base64,${await blobToBase64(blob)}`;
}
export function base64ToBlob(b64, mime = "application/octet-stream") {
  const bin = atob(b64); const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
export function blobToArrayBuffer(blob) { return blob.arrayBuffer(); }
export function blobToText(blob) { return blob.text(); }

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
}

export function canvasToBlob(canvas, type = "image/png", quality) {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
}

export function loadImage(src) {
  return new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src; });
}

export async function imageDimensions(blob) {
  if (globalThis.createImageBitmap) {
    try { const bmp = await createImageBitmap(blob); const d = { width: bmp.width, height: bmp.height }; bmp.close(); return d; } catch { /* repli */ }
  }
  const url = URL.createObjectURL(blob);
  try { const img = await loadImage(url); return { width: img.naturalWidth, height: img.naturalHeight }; } finally { URL.revokeObjectURL(url); }
}

export function slugify(s) {
  return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").replace(/^[^a-zA-Z0-9]+/, "").slice(0, 80) || "livre";
}
export const LABEL_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export function debounce(fn, ms = 300) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
export function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

export function formatDuration(ms) {
  if (ms == null || !isFinite(ms)) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60), r = s % 60;
  if (m < 60) return `${m} min ${r} s`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}
export function formatBytes(n) {
  if (n < 1024) return `${n} o`; if (n < 1048576) return `${(n / 1024).toFixed(1)} Ko`;
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} Mo`; return `${(n / 1073741824).toFixed(2)} Go`;
}
export function formatDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" }); } catch { return iso; }
}
export function relativeDate(iso) {
  if (!iso) return "—";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "à l'instant"; if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`; if (diff < 86400 * 30) return `il y a ${Math.floor(diff / 86400)} j`;
  return formatDate(iso).split(" ")[0];
}
export function formatCost(usd) { return usd == null ? "—" : `${usd.toFixed(usd < 0.1 ? 4 : 2)} $`; }

export class Emitter {
  constructor() { this.listeners = new Map(); }
  on(evt, fn) { if (!this.listeners.has(evt)) this.listeners.set(evt, new Set()); this.listeners.get(evt).add(fn); return () => this.off(evt, fn); }
  off(evt, fn) { this.listeners.get(evt)?.delete(fn); }
  emit(evt, payload) { for (const fn of [...(this.listeners.get(evt) ?? [])]) { try { fn(payload); } catch (e) { console.error(e); } } for (const fn of [...(this.listeners.get("*") ?? [])]) { try { fn(evt, payload); } catch (e) { console.error(e); } } }
}

/** Exécute des tâches avec une concurrence bornée ; conserve l'ordre des résultats. */
export async function processWithConcurrency(items, limit, worker, { signal } = {}) {
  const results = new Array(items.length); let next = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      if (signal?.aborted) throw new DOMException("Annulé", "AbortError");
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

export function stableStringify(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(",")}}`;
}

export function textSimilarity(a, b) {
  a = a.replace(/\s+/g, " ").trim().toLowerCase(); b = b.replace(/\s+/g, " ").trim().toLowerCase();
  if (a === b) return 1; if (!a.length || !b.length) return 0;
  const m = a.length, n = b.length; let prev = new Array(n + 1).fill(0), cur;
  for (let i = 1; i <= m; i++) { cur = [0]; for (let j = 1; j <= n; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]); prev = cur; }
  return (2 * prev[n]) / (m + n);
}

export const WORD_PATTERN = /[\p{L}\p{N}\p{M}]+(?:[’'-][\p{L}\p{N}\p{M}]+)*/gu;
export function tokenizeWords(text) { return [...String(text).matchAll(WORD_PATTERN)].map((m) => ({ word: m[0], index: m.index })); }

export function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
export function groupBy(arr, fn) { const m = new Map(); for (const x of arr) { const k = fn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; }
export function unique(arr) { return [...new Set(arr)]; }
export function normalizeLocale(code) { return String(code ?? "").trim().toLowerCase().replace("_", "-"); }
export function baseLanguage(code) { return normalizeLocale(code).split("-")[0]; }

/** Hex → luminance relative (WCAG). */
export function relativeLuminance(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex ?? "");
  if (!m) return 1;
  const f = (c) => { c = parseInt(c, 16) / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(m[1]) + 0.7152 * f(m[2]) + 0.0722 * f(m[3]);
}
export function contrastRatio(a, b) { const la = relativeLuminance(a), lb = relativeLuminance(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); }

export function pickFile({ accept = "", multiple = false } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement("input"); input.type = "file"; input.accept = accept; input.multiple = multiple; input.style.display = "none";
    input.onchange = () => { resolve(multiple ? [...input.files] : input.files[0] ?? null); input.remove(); };
    document.body.appendChild(input); input.click();
  });
}

// ── Quiz : plusieurs questions par quiz, de types variés ─────────────────────
export const QUIZ_QUESTION_TYPES = ["multiple_choice", "true_false", "fill_in_the_blank"];
/** Questions d'un quiz (les quiz anciens, à question unique, sont normalisés). */
export function quizQuestions(q) {
  if (Array.isArray(q?.questions) && q.questions.length) return q.questions;
  return [{ type: "multiple_choice", question: q?.question ?? "", options: q?.options ?? [], answerIndex: q?.answerIndex ?? 0 }];
}
/** Préfixe des identifiants de texte d'une question : quizId pour un quiz à question unique (compatibilité), sinon quizId_qN. */
export function quizQuestionPrefix(q, k, total) { return (total ?? quizQuestions(q).length) === 1 ? q.quizId : `${q.quizId}_q${k + 1}`; }
export function quizTitle(q) { return quizQuestions(q)[0]?.question ?? ""; }
/** Normalise les marqueurs de trou d'une question à compléter en « ___ ». */
export function normalizeBlank(text) { const t = String(text ?? "").replace(/\[\[blank[^\]]*\]\]|_{3,}|…{2,}|\.{4,}/g, "___"); return t.includes("___") ? t : `${t} ___`; }

/** Libellé d'une page logique : « Page 3 », « Pages 2–3 » (double page) ou « Pages 4–9 » (découpage libre). */
export function pageLabel(p) { const span = p?.spreadOf ?? p?.groupOf; return span && span[1] !== span[0] ? `Pages ${span[0]}–${span[1]}` : `Page ${p?.pageNumber ?? "?"}`; }
