// Étape « Sectionnement » : structuration des pages par le LLM (+ raffinement), traduction vers la langue d'édition.
import { callLLM } from "../../llm/client.js";
import { nowIso, baseLanguage } from "../../util.js";
import { pageImageForLlm, imageBlobForLlm, languageContext, stepModel, stepTimeout, stepRetries, forEachPage, SECTIONING_SCHEMA, REFINEMENT_SCHEMA, SCHEMAS, typesList } from "./common.js";
import { effectiveImages } from "./extract.js";
import { fromLlmOutput, walkNodes } from "../section-tree.js";

function validateLlmTree(out, availableImages, sectionTypes) {
  const errs = []; const used = new Set();
  if (!Array.isArray(out?.sections) || !out.sections.length) return ["aucune section renvoyée"];
  for (const s of out.sections) {
    if (!sectionTypes.has(s.section_type)) errs.push(`type de section inconnu : ${s.section_type}`);
    const walk = (n, depth) => {
      if (depth > 12) { errs.push("arbre trop profond"); return; }
      if (n.structure && n.role) errs.push("nœud avec structure ET rôle");
      if (n.role === "image") { if (!n.image_id) errs.push("feuille image sans image_id"); else if (!availableImages.has(n.image_id)) errs.push(`image_id inconnu : ${n.image_id}`); else if (used.has(n.image_id)) errs.push(`image_id dupliqué : ${n.image_id}`); else used.add(n.image_id); }
      else if (n.role && !String(n.text ?? "").trim()) errs.push(`feuille ${n.role} sans texte`);
      if (n.structure && n.structure !== "table_cell" && !(n.children?.length)) errs.push(`conteneur ${n.structure} vide`);
      if (!n.structure && !n.role) errs.push("nœud sans structure ni rôle");
      for (const c of n.children ?? []) walk(c, depth + 1);
    };
    for (const n of s.nodes ?? []) walk(n, 0);
  }
  return [...new Set(errs)].slice(0, 12);
}

export async function pageSectioning(ctx) {
  const { storage, config } = ctx;
  const pages = await storage.getActivePages(config);
  const disabled = new Set(config.disabled_section_types ?? []);
  if (config.generate_activities === false) for (const k of Object.keys(config.section_types ?? {})) if (k.startsWith("activity_")) disabled.add(k);
  const sectionTypes = typesList(config.section_types, [...disabled]);
  const sectionTypeSet = new Set(sectionTypes.map((t) => t.key));
  const outline = await storage.getNodeData("book-outline", "book");
  const mode = config.page_sectioning?.mode ?? "dynamic";
  const maxRef = config.page_sectioning?.max_refinements ?? 0;
  const strategy = config.render_strategies?.[config.default_render_strategy ?? ""];
  const fixed = strategy?.render_type === "fixed_layout";
  const onlyPages = ctx.options?.pageIds ? new Set(ctx.options.pageIds) : null;
  await forEachPage(ctx, pages.filter((p) => !onlyPages || onlyPages.has(p.pageId)), async (page) => {
    const existing = await storage.getNodeData("page-sectioning", page.pageId);
    if (existing?.manualEdit && !ctx.options?.force && !onlyPages) return; // édition manuelle conservée
    const imgs = (await effectiveImages(storage, page.pageId)).filter((im) => im.kept);
    const images = [];
    for (const im of imgs.slice(0, 24)) images.push({ imageId: im.imageId, width: im.width, height: im.height, imageBase64: await imageBlobForLlm(storage, im.imageId, { maxSide: 600 }) });
    const available = new Set(images.map((i) => i.imageId));
    const outlineForPage = outline?.entries?.length ? { entries: outline.entries.filter((e) => e.pageId === page.pageId || (page.spreadOf && e.pageNumber && page.spreadOf.includes(e.pageNumber))), ancestors: ancestorsFor(outline.entries, page) } : null;
    const vars = { page_id: page.pageId, page_number: page.pageNumber, page_image_base64: await pageImageForLlm(storage, page.pageId, { maxSide: 1600 }), page_text: page.text.slice(0, 12000), images, structure_types: typesList(config.structure_types), role_types: typesList(config.role_types), section_types: sectionTypes, book_outline: outlineForPage && outlineForPage.entries.length ? outlineForPage : null, mode, user_instructions: config.page_sectioning?.user_instructions ?? "" };
    const res = await callLLM({ storage, step: "page-sectioning", itemId: page.pageId, promptName: config.page_sectioning?.prompt ?? "page_sectioning", variables: vars, schema: SECTIONING_SCHEMA, config, modelId: stepModel(config, "page_sectioning"), timeoutMs: stepTimeout(config, "page_sectioning", 240), maxRetries: stepRetries(config, "page_sectioning"), temperature: config.page_sectioning?.temperature, signal: ctx.signal, validate: (out) => validateLlmTree(out, available, sectionTypeSet) });
    let llmOut = res.parsed;
    for (let i = 0; i < maxRef; i++) {
      const ref = await callLLM({ storage, step: "page-sectioning", itemId: `${page.pageId}/raffinement-${i + 1}`, promptName: "page_sectioning_refinement", variables: { page_image_base64: vars.page_image_base64, page_text: vars.page_text, proposal_json: JSON.stringify(llmOut, null, 1).slice(0, 60000) }, schema: REFINEMENT_SCHEMA, config, modelId: stepModel(config, "page_sectioning"), timeoutMs: stepTimeout(config, "page_sectioning", 240), signal: ctx.signal });
      if (ref.parsed.approved || !ref.parsed.nodes_and_sections) break;
      if (!validateLlmTree(ref.parsed.nodes_and_sections, available, sectionTypeSet).length) llmOut = ref.parsed.nodes_and_sections;
    }
    const output = fromLlmOutput(page.pageId, page.pageNumber, llmOut, { availableImageIds: available, config });
    if (fixed) output.sections = output.sections.map((s) => ({ ...s, renderType: "fixed_layout" }));
    if (!output.sections.length) output.sections.push({ sectionId: `${page.pageId}_sec001`, sectionType: "other", backgroundColor: "#ffffff", textColor: "#000000", pageNumber: page.pageNumber, isPruned: false, nodes: page.text.trim() ? [{ nodeId: `${page.pageId}_tx001`, isPruned: false, role: "text", text: page.text.slice(0, 2000) }] : [] });
    await storage.putNodeData("page-sectioning", page.pageId, { ...output, generatedAt: nowIso(), mode });
  });
  return { message: "Pages structurées" };
}

function ancestorsFor(entries, page) {
  const before = entries.filter((e) => e.pageNumber != null && e.pageNumber < page.pageNumber);
  const out = []; let level = 7;
  for (let i = before.length - 1; i >= 0 && level > 1; i--) if (before[i].level < level) { out.unshift(before[i]); level = before[i].level; }
  return out;
}

/** Traduction de l'arbre vers la langue d'édition (si elle diffère de la langue détectée). */
export async function translation(ctx) {
  const { storage, config } = ctx;
  const meta = await storage.getNodeData("metadata", "book");
  const src = meta?.language_code ?? "fr"; const target = config.editing_language;
  if (!target || baseLanguage(target) === baseLanguage(src)) return { skipped: true, message: "Langue d'édition identique à la langue du livre" };
  const srcCtx = languageContext(src), tgtCtx = languageContext(target);
  const pages = await storage.getActivePages(config);
  await forEachPage(ctx, pages, async (page) => {
    const sectioning = await storage.getNodeData("page-sectioning", page.pageId);
    if (!sectioning) return;
    const leaves = [];
    for (const s of sectioning.sections) walkNodes(s.nodes, (n) => { if (n.role && n.role !== "image" && n.text) leaves.push(n); });
    if (!leaves.length) return;
    const translated = {};
    for (let i = 0; i < leaves.length; i += 40) {
      const batch = leaves.slice(i, i + 40);
      const res = await callLLM({ storage, step: "translation", itemId: `${page.pageId}/${i}`, promptName: config.translation?.prompt ?? "translation", variables: { source_language: srcCtx.name, source_language_code: srcCtx.code, target_language: tgtCtx.name, target_language_code: tgtCtx.code, texts: batch.map((n, k) => ({ index: k + 1, text: n.text })) }, schema: SCHEMAS.translation, config, modelId: stepModel(config, "translation"), signal: ctx.signal, validate: (out) => (out.translations?.length === batch.length ? [] : [`attendu ${batch.length} traductions, reçu ${out.translations?.length ?? 0}`]) });
      batch.forEach((n, k) => { translated[n.nodeId] = res.parsed.translations[k]; });
    }
    await storage.putNodeData("sectioning-translation", page.pageId, { language: target, texts: translated, generatedAt: nowIso() });
  });
  return { message: `Traduit vers ${tgtCtx.name}` };
}

export const sectioningSteps = { "page-sectioning": pageSectioning, translation };
