// Validation du HTML d'une section rendue : identifiants, textes, sécurité.
import { textSimilarity } from "../util.js";

const DISALLOWED_TAGS = new Set(["script", "iframe", "object", "embed", "link", "meta", "base", "form"]);
const TEXT_SIMILARITY_THRESHOLD = 0.7;
const BLANK_MARKER_RE = /\[\[blank:item-\d+(?::[^\]]+)?\]\]/g;

export function parseHtml(html) { return new DOMParser().parseFromString(`<!doctype html><html><body>${html}</body></html>`, "text/html"); }

export function sanitizeHtml(html) {
  const doc = parseHtml(html);
  for (const el of [...doc.body.querySelectorAll("*")]) {
    if (DISALLOWED_TAGS.has(el.tagName.toLowerCase()) && !(el.tagName.toLowerCase() === "link")) { el.remove(); continue; }
    for (const a of [...el.attributes]) {
      if (/^on/i.test(a.name)) el.removeAttribute(a.name);
      else if (["src", "href", "xlink:href", "formaction"].includes(a.name) && /^\s*javascript:/i.test(a.value)) el.removeAttribute(a.name);
      else if (a.name === "contenteditable") el.removeAttribute(a.name);
    }
  }
  return doc.body.innerHTML;
}

/**
 * Valide le HTML d'une section.
 * options : { expectedTexts: Map(id→text), expectedSectionType, expectedSectionId, allowedContainerIds, strictText, optionalTextIds, allowGeneratedIds }
 */
export function validateSectionHtml(html, allowedTextIds, allowedImageIds, options = {}) {
  const errors = [];
  const doc = parseHtml(html);
  const sections = [...doc.body.querySelectorAll("section")];
  if (!sections.length) return { valid: false, errors: ["Aucune balise <section> dans la sortie"] };
  if (sections.length > 1) errors.push(`Une seule <section> attendue, ${sections.length} trouvées`);
  const section = sections[0];
  if (options.expectedSectionType && section.getAttribute("data-section-type") !== options.expectedSectionType) errors.push(`data-section-type doit valoir « ${options.expectedSectionType} »`);
  if (options.expectedSectionId && section.getAttribute("data-section-id") !== options.expectedSectionId) errors.push(`data-section-id doit valoir « ${options.expectedSectionId} »`);
  if (section.getAttribute("role")) errors.push("La <section> ne doit pas porter d'attribut role");
  const allowed = new Set([...allowedTextIds, ...allowedImageIds, ...(options.allowedContainerIds ?? [])]);
  const imageSet = new Set(allowedImageIds);
  const seen = new Map();
  for (const el of section.querySelectorAll("*")) {
    const tag = el.tagName.toLowerCase();
    if (DISALLOWED_TAGS.has(tag)) errors.push(`Balise interdite : <${tag}>`);
    for (const a of el.attributes) if (/^on/i.test(a.name)) errors.push(`Attribut d'événement interdit : ${a.name}`);
    const id = el.getAttribute("data-id");
    if (id == null) continue;
    if (!allowed.has(id) && !(options.allowGeneratedIds && id.startsWith("activity_gen_"))) { errors.push(`data-id non fourni : ${id}`); continue; }
    seen.set(id, (seen.get(id) ?? 0) + 1);
    if (tag === "img") { if (!imageSet.has(id)) errors.push(`L'image ${id} ne fait pas partie des images fournies`); }
    else if (imageSet.has(id)) errors.push(`L'identifiant d'image ${id} est utilisé sur un élément <${tag}>`);
    else if (["input", "textarea", "select", "button"].includes(tag)) errors.push(`Le contrôle <${tag}> ne doit pas porter de data-id (${id})`);
    else if (options.expectedTexts?.has(id)) {
      const expected = options.expectedTexts.get(id);
      const actual = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      const exp = expected.replace(/\s+/g, " ").trim();
      const actualNoBlank = actual.replace(BLANK_MARKER_RE, "___").replace(/\[placeholder:([^\]]+)\]/g, "$1");
      const expNoBlank = exp.replace(/\[placeholder:([^\]]+)\]/g, "$1").replace(/_{3,}|\.{3,}/g, "___");
      if (actual !== exp && actualNoBlank !== expNoBlank) {
        const sim = textSimilarity(actualNoBlank, expNoBlank);
        if (options.strictText || sim < TEXT_SIMILARITY_THRESHOLD) errors.push(`Texte modifié pour ${id} : attendu « ${exp.slice(0, 60)} », obtenu « ${actual.slice(0, 60)} »`);
      }
      if (el.querySelector("[data-id]")) errors.push(`L'élément ${id} contient un autre data-id imbriqué`);
    }
  }
  for (const [id, n] of seen) if (n > 1) errors.push(`data-id dupliqué : ${id} (${n} fois)`);
  const optional = options.optionalTextIds ?? new Set();
  for (const id of allowedTextIds) if (!seen.has(id) && !optional.has(id)) errors.push(`Texte manquant : ${id}`);
  // Activités : au moins un contrôle
  const st = section.getAttribute("data-section-type") ?? "";
  if (st.startsWith("activity_") && !["activity_other"].includes(st)) {
    const controls = section.querySelectorAll("input, textarea, select, [data-activity-item]").length + ((section.textContent ?? "").match(BLANK_MARKER_RE)?.length ?? 0);
    if (!controls) errors.push("Aucun contrôle de réponse (data-activity-item, input, textarea) dans l'activité");
  }
  const content = doc.body.querySelector("#content");
  return { valid: errors.length === 0, errors: [...new Set(errors)], sectionHtml: (content ?? section).outerHTML };
}

/** Normalisation : promouvoir le premier titre en h1 si absent, retirer contenteditable, décoder entités. */
export function normalizeSectionHtml(html) {
  const doc = parseHtml(html);
  for (const el of doc.body.querySelectorAll("[contenteditable]")) el.removeAttribute("contenteditable");
  return doc.body.innerHTML;
}

export function extractDataIds(html) { const doc = parseHtml(html); return [...doc.body.querySelectorAll("[data-id]")].map((el) => ({ id: el.getAttribute("data-id"), tag: el.tagName.toLowerCase(), text: el.tagName.toLowerCase() === "img" ? null : el.textContent.replace(/\s+/g, " ").trim() })); }
