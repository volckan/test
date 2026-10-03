// Aides communes aux étapes du pipeline.
import { languageName } from "../../config.js";
import { baseLanguage } from "../../util.js";
import { blobToDataUrl, canvasToBlob, processWithConcurrency } from "../../util.js";
import { blobToCanvas } from "../../pdf/extract.js";
import { resolveStepModel } from "../../llm/client.js";

const dataUrlCache = new Map();

/** Image (blob) → data URL JPEG réduite pour l'envoi au modèle. */
export async function imageForLlm(blob, { maxSide = 1400, quality = 0.85, key } = {}) {
  const k = key ? `${key}:${maxSide}` : null;
  if (k && dataUrlCache.has(k)) return dataUrlCache.get(k);
  const c = await blobToCanvas(blob);
  const s = Math.min(1, maxSide / Math.max(c.width, c.height));
  let out = c;
  if (s < 1) { out = document.createElement("canvas"); out.width = Math.round(c.width * s); out.height = Math.round(c.height * s); out.getContext("2d").drawImage(c, 0, 0, out.width, out.height); }
  const hasAlpha = blob.type === "image/png" && await canvasHasTransparency(out);
  const jpg = await canvasToBlob(out, hasAlpha ? "image/png" : "image/jpeg", quality);
  const url = await blobToDataUrl(jpg);
  if (k) { if (dataUrlCache.size > 300) dataUrlCache.clear(); dataUrlCache.set(k, url); }
  return url;
}
async function canvasHasTransparency(c) {
  if (c.width * c.height > 4e6) return false;
  const d = c.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data;
  for (let i = 3; i < d.length; i += 4 * 37) if (d[i] < 250) return true;
  return false;
}

export async function pageImageForLlm(storage, pageId, opts = {}) {
  const blob = await storage.getImageBlob(`${pageId}_page`);
  if (!blob) throw new Error(`Image de page manquante : ${pageId}`);
  return imageForLlm(blob, { key: `${storage.label}/${pageId}_page`, ...opts });
}
export async function imageBlobForLlm(storage, imageId, opts = {}) {
  const blob = await storage.getImageBlob(imageId);
  if (!blob) return null;
  return imageForLlm(blob, { key: `${storage.label}/${imageId}`, maxSide: 900, ...opts });
}

/** Contexte linguistique : code + nom de la langue, pour les prompts. */
export function languageContext(code) {
  const c = String(code ?? "fr").trim() || "fr";
  return { code: c, name: languageName(c) || c, base: baseLanguage(c) };
}

/** Langue du livre : métadonnées détectées, sinon langue d'édition, sinon « fr ». */
export async function bookLanguage(storage, config) {
  const meta = await storage.getNodeData("metadata", "book");
  return config?.editing_language || meta?.language_code || "fr";
}
export async function sourceLanguage(storage) {
  const meta = await storage.getNodeData("metadata", "book");
  return meta?.language_code || (await storage.getConfigOverrides()).editing_language || "fr";
}

export function stepModel(config, key, kind) { return resolveStepModel(config, key, kind); }
export function stepTimeout(config, key, fallback = 180) { return (config?.[key]?.timeout ?? fallback) * 1000; }
export function stepRetries(config, key, fallback = 5) { return config?.[key]?.max_retries ?? fallback; }
export function stepTemperature(config, key) { return config?.[key]?.temperature; }

/** Traite les pages avec concurrence et gestion d'erreur par page. */
export async function forEachPage(ctx, pages, worker, { concurrency } = {}) {
  const limit = concurrency ?? Math.max(1, Math.min(ctx.config.concurrency ?? 4, 8));
  let done = 0; const skipped = [];
  ctx.progress(0, pages.length);
  await processWithConcurrency(pages, limit, async (page) => {
    if (ctx.signal?.aborted) throw new DOMException("Annulé", "AbortError");
    try { await worker(page); }
    catch (e) { if (e?.name === "AbortError") throw e; await ctx.onPageError(page.pageId, e); skipped.push(page.pageId); }
    done++; ctx.progress(done, pages.length, page.pageId);
  }, { signal: ctx.signal });
  return { skipped };
}

/** Pages actives + sections non élaguées de la structuration. */
export async function pagesWithSectioning(storage, config) {
  const pages = await storage.getActivePages(config);
  const out = [];
  for (const p of pages) { const s = await storage.getNodeData("page-sectioning", p.pageId); if (s) out.push({ page: p, sectioning: s }); }
  return out;
}

/** Types de section désactivés / élagués. */
export function isSectionPruned(section, config) {
  if (section.isPruned) return true;
  return (config.pruned_section_types ?? []).includes(section.sectionType);
}

export function textOfNodes(nodes, config, { includePruned = false } = {}) {
  const pruned = new Set(config?.pruned_role_types ?? []);
  const out = [];
  const walk = (n) => { if (!n) return; if (n.isPruned && !includePruned) return; if (n.role && n.role !== "image") { if (!pruned.has(n.role)) out.push(n.text ?? ""); } for (const c of n.children ?? []) walk(c); };
  for (const n of nodes ?? []) walk(n);
  return out.filter((t) => t.trim()).join("\n");
}
export function leavesOfNodes(nodes, { includePruned = false } = {}) {
  const out = [];
  const walk = (n) => { if (!n || (n.isPruned && !includePruned)) return; if (n.role) out.push(n); for (const c of n.children ?? []) walk(c); };
  for (const n of nodes ?? []) walk(n);
  return out;
}
export function imageIdsOfNodes(nodes) { return leavesOfNodes(nodes).filter((n) => n.role === "image").map((n) => n.imageId ?? n.nodeId); }

export const SCHEMAS = {
  metadata: { type: "object", properties: { reasoning: { type: "string" }, title: { type: ["string", "null"] }, authors: { type: "array", items: { type: "string" } }, publisher: { type: ["string", "null"] }, language_code: { type: ["string", "null"] }, cover_page_number: { type: ["integer", "null"] } }, required: ["reasoning", "title", "authors", "publisher", "language_code", "cover_page_number"], additionalProperties: false },
  summary: { type: "object", properties: { summary: { type: "string" } }, required: ["summary"], additionalProperties: false },
  outline: { type: "object", properties: { reasoning: { type: "string" }, entries: { type: "array", items: { type: "object", properties: { candidate_ids: { type: "array", items: { type: "string" } }, level: { type: "integer" }, kind: { type: "string" }, style_cluster_id: { type: "string" }, confidence: { type: "number" } }, required: ["candidate_ids", "level", "kind", "style_cluster_id", "confidence"], additionalProperties: false } } }, required: ["reasoning", "entries"], additionalProperties: false },
  meaningfulness: { type: "object", properties: { images: { type: "array", items: { type: "object", properties: { image_id: { type: "string" }, reasoning: { type: "string" }, is_meaningful: { type: "boolean" } }, required: ["image_id", "reasoning", "is_meaningful"], additionalProperties: false } } }, required: ["images"], additionalProperties: false },
  segmentation: { type: "object", properties: { reasoning: { type: "string" }, segments: { type: "array", items: { type: "object", properties: { label: { type: "string" }, x: { type: "number" }, y: { type: "number" }, width: { type: "number" }, height: { type: "number" } }, required: ["label", "x", "y", "width", "height"], additionalProperties: false } } }, required: ["reasoning", "segments"], additionalProperties: false },
  cropping: { type: "object", properties: { reasoning: { type: "string" }, crop: { type: ["object", "null"], properties: { x: { type: "number" }, y: { type: "number" }, width: { type: "number" }, height: { type: "number" } }, required: ["x", "y", "width", "height"], additionalProperties: false } }, required: ["reasoning", "crop"], additionalProperties: false },
  html: { type: "object", properties: { reasoning: { type: "string" }, content: { type: "string" } }, required: ["reasoning", "content"], additionalProperties: false },
  review: { type: "object", properties: { approved: { type: "boolean" }, reasoning: { type: "string" }, content: { type: "string" } }, required: ["approved", "reasoning", "content"], additionalProperties: false },
  verify: { type: "object", properties: { applied: { type: "boolean" }, reason: { type: "string" } }, required: ["applied", "reason"], additionalProperties: false },
  answers: { type: "object", properties: { reasoning: { type: "string" }, answers: { type: "array", items: { type: "object", properties: { id: { type: "string" }, value: { type: ["string", "boolean", "number"] } }, required: ["id", "value"], additionalProperties: false } } }, required: ["reasoning", "answers"], additionalProperties: false },
  quiz: { type: "object", properties: { reasoning: { type: "string" }, question: { type: "string" }, options: { type: "array", items: { type: "object", properties: { text: { type: "string" }, explanation: { type: "string" } }, required: ["text", "explanation"], additionalProperties: false } }, answer_index: { type: "integer" } }, required: ["reasoning", "question", "options", "answer_index"], additionalProperties: false },
  glossary: { type: "object", properties: { reasoning: { type: "string" }, items: { type: "array", items: { type: "object", properties: { word: { type: "string" }, definition: { type: "string" }, variations: { type: "array", items: { type: "string" } }, emojis: { type: "array", items: { type: "string" } } }, required: ["word", "definition", "variations", "emojis"], additionalProperties: false } } }, required: ["reasoning", "items"], additionalProperties: false },
  glossaryOne: { type: "object", properties: { definition: { type: "string" }, variations: { type: "array", items: { type: "string" } }, emojis: { type: "array", items: { type: "string" } } }, required: ["definition", "variations", "emojis"], additionalProperties: false },
  captions: { type: "object", properties: { captions: { type: "array", items: { type: "object", properties: { image_id: { type: "string" }, reasoning: { type: "string" }, caption: { type: "string" }, decorative: { type: "boolean" } }, required: ["image_id", "reasoning", "caption", "decorative"], additionalProperties: false } } }, required: ["captions"], additionalProperties: false },
  translation: { type: "object", properties: { translations: { type: "array", items: { type: "string" } } }, required: ["translations"], additionalProperties: false },
  toc: { type: "object", properties: { reasoning: { type: "string" }, entries: { type: "array", items: { type: "object", properties: { title: { type: "string" }, level: { type: "integer" }, sectionId: { type: "string" } }, required: ["title", "level", "sectionId"], additionalProperties: false } } }, required: ["reasoning", "entries"], additionalProperties: false },
  easyRead: { type: "object", properties: { texts: { type: "array", items: { type: "string" } } }, required: ["texts"], additionalProperties: false },
  coreTts: { type: "object", properties: { results: { type: "array", items: { type: "object", properties: { id: { type: "string" }, speech_text: { type: ["string", "null"] }, changed: { type: "boolean" }, transformation_kinds: { type: "array", items: { type: "string" } }, failure_reason: { type: ["string", "null"] } }, required: ["id", "speech_text", "changed", "transformation_kinds", "failure_reason"], additionalProperties: false } } }, required: ["results"], additionalProperties: false },
  feedback: { type: "object", properties: { steps: { type: "array", items: { type: "object", properties: { id: { type: "string" }, correct: { type: "string" }, incorrect: { type: "string" } }, required: ["id", "correct", "incorrect"], additionalProperties: false } } }, required: ["steps"], additionalProperties: false },
  styleguide: { type: "object", properties: { content: { type: "string" }, preview_html: { type: "string" } }, required: ["content", "preview_html"], additionalProperties: false },
  evaluation: { type: "object", properties: { results: { type: "array", items: { type: "object", properties: { id: { type: "string" }, acceptable: { type: "boolean" }, severity: { type: "string" }, issue_type: { type: "string" }, rationale: { type: "string" }, suggested_text: { type: ["string", "null"] } }, required: ["id", "acceptable", "severity", "issue_type", "rationale", "suggested_text"], additionalProperties: false } } }, required: ["results"], additionalProperties: false },
  generateActivity: { type: "object", properties: { reasoning: { type: "string" }, content: { type: "string" }, answers: { type: "array", items: { type: "object", properties: { id: { type: "string" }, value: { type: ["string", "boolean", "number"] } }, required: ["id", "value"], additionalProperties: false } } }, required: ["reasoning", "content", "answers"], additionalProperties: false },
};

const SECTIONING_NODE = { type: "object", properties: { structure: { type: ["string", "null"] }, role: { type: ["string", "null"] }, text: { type: ["string", "null"] }, image_id: { type: ["string", "null"] }, heading_level: { type: ["integer", "null"] }, outline_entry_id: { type: ["string", "null"] }, children: { type: ["array", "null"], items: { $ref: "#/$defs/node" } } }, required: ["structure", "role", "text", "image_id", "heading_level", "outline_entry_id", "children"], additionalProperties: false };
export const SECTIONING_SCHEMA = { type: "object", $defs: { node: SECTIONING_NODE }, properties: { reasoning: { type: "string" }, sections: { type: "array", items: { type: "object", properties: { section_type: { type: "string" }, background_color: { type: "string" }, text_color: { type: "string" }, page_number: { type: ["integer", "null"] }, nodes: { type: "array", items: { $ref: "#/$defs/node" } } }, required: ["section_type", "background_color", "text_color", "page_number", "nodes"], additionalProperties: false } } }, required: ["reasoning", "sections"], additionalProperties: false };
export const REFINEMENT_SCHEMA = { type: "object", $defs: { node: SECTIONING_NODE }, properties: { approved: { type: "boolean" }, reasoning: { type: "string" }, nodes_and_sections: { type: ["object", "null"], properties: { reasoning: { type: "string" }, sections: SECTIONING_SCHEMA.properties.sections }, required: ["reasoning", "sections"], additionalProperties: false } }, required: ["approved", "reasoning", "nodes_and_sections"], additionalProperties: false };

export function typesList(record, disabled = []) { return Object.entries(record ?? {}).filter(([k]) => !disabled.includes(k)).map(([key, description]) => ({ key, description })); }
