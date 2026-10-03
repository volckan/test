// Étape « Scénarimage » : rendu web des sections (gabarit, IA, activité, mise en page fixe),
// validation, réponses des activités, revue visuelle optionnelle, édition IA d'une section.
import { callLLM } from "../../llm/client.js";
import { nowIso, escapeHtml, escapeAttr } from "../../util.js";
import { pageImageForLlm, imageBlobForLlm, languageContext, stepModel, forEachPage, SCHEMAS, bookLanguage } from "./common.js";
import { toRenderNodes, leafTexts, imageRefs, groupIds, walkNodes } from "../section-tree.js";
import { renderSectionTemplate } from "../render-template.js";
import { validateSectionHtml, sanitizeHtml } from "../validate-html.js";
import { screenshotHtml, blobMap, VIEWPORTS } from "../screenshot.js";
import { getTypography, typographyCss } from "../typography.js";

export function resolveStrategy(config, section) {
  const name = section.renderType === "fixed_layout" ? "fixed_layout" : (config.section_render_strategies?.[section.sectionType] ?? config.default_render_strategy ?? "two_column");
  const def = config.render_strategies?.[name];
  if (!def) return { name, render_type: "template", config: { template: "two_column_render" } };
  if (def.render_type === "activity" && config.generate_activities === false) return { name: config.default_render_strategy, ...(config.render_strategies?.[config.default_render_strategy] ?? { render_type: "template", config: { template: "two_column_render" } }) };
  return { name, ...def };
}

async function sectionContext(storage, page, section, config) {
  const translated = await storage.getNodeData("sectioning-translation", page.pageId);
  const renderNodes = toRenderNodes(section.nodes, { texts: translated?.texts ?? null });
  return { renderNodes, leaf_texts: leafTexts(renderNodes), image_refs: imageRefs(renderNodes), group_ids: groupIds(renderNodes) };
}

export async function renderSection({ storage, config, page, section, sectionIndex, userInstructions = "", signal, styleguide = "" }) {
  const strategy = resolveStrategy(config, section);
  const rc = await sectionContext(storage, page, section, config);
  const allowedText = rc.leaf_texts.map((t) => t.text_id), allowedImages = rc.image_refs.map((i) => i.image_id);
  const expectedTexts = new Map(rc.leaf_texts.map((t) => [t.text_id, t.text]));
  const typography = await getTypography(storage, config);
  const base = { sectionIndex, sectionId: section.sectionId, sectionType: section.sectionType, strategy: strategy.name, renderType: strategy.render_type, renderedAt: nowIso() };

  if (strategy.render_type === "fixed_layout") return { ...base, reasoning: "Mise en page fixe (image de page + texte positionné)", html: await renderFixedLayout(storage, page, section, rc, config) };

  if (strategy.render_type === "template") {
    const html = await renderSectionTemplate({ templateName: strategy.config?.template ?? "two_column_render", section, renderNodes: rc.renderNodes, label: storage.label });
    const check = validateSectionHtml(html, allowedText, allowedImages, { allowedContainerIds: rc.group_ids, expectedTexts, expectedSectionType: section.sectionType, expectedSectionId: section.sectionId, strictText: true });
    if (!check.valid) throw new Error(`Le gabarit « ${strategy.config?.template} » a produit un HTML invalide : ${check.errors.join("; ")}`);
    return { ...base, reasoning: `Gabarit ${strategy.config?.template}`, html: sanitizeHtml(check.sectionHtml) };
  }

  // Rendu par IA (llm ou activité)
  const sc = strategy.config ?? {};
  const isActivity = strategy.render_type === "activity";
  const images = [];
  for (const i of rc.image_refs) { const im = await storage.getImage(i.image_id); images.push({ image_id: i.image_id, width: im?.width, height: im?.height, image_base64: await imageBlobForLlm(storage, i.image_id, { maxSide: 800 }) }); }
  const sourcePages = [];
  for (const spid of section.sourcePageIds ?? []) if (spid !== page.pageId) { try { sourcePages.push({ page_id: spid, image_base64: await pageImageForLlm(storage, spid, { maxSide: 1200 }) }); } catch { /* ignore */ } }
  const vars = { page_image_base64: await pageImageForLlm(storage, page.pageId, { maxSide: 1400 }), source_pages: sourcePages, section_id: section.sectionId, section_type: section.sectionType, images, nodes: rc.renderNodes, user_instructions: userInstructions ?? "", viewports: VIEWPORTS, styleguide: styleguide ?? "", typography: typography.scale, book_fonts: [], page_width: page.width, page_height: page.height, page_image_url: `images/${page.pageId}_page.png`, blocks: (page.positioned ?? []).map((b) => ({ id: b.id, left: Math.round(b.left * 1000) / 10, top: Math.round(b.top * 1000) / 10, width: Math.round(b.width * 1000) / 10, height: Math.round(b.height * 1000) / 10, text: b.text })) };
  const promptName = isActivity ? "activity_render" : (sc.prompt ?? "web_generation_html");
  const modelId = sc.model ?? stepModel(config, "web_rendering");
  const validate = (out) => {
    if (typeof out?.content !== "string" || !out.content.trim()) return ["champ content vide"];
    const check = validateSectionHtml(out.content, allowedText, allowedImages, { allowedContainerIds: rc.group_ids, expectedTexts, expectedSectionType: section.sectionType, expectedSectionId: section.sectionId, allowGeneratedIds: isActivity });
    return check.errors;
  };
  const res = await callLLM({ storage, step: "web-rendering", itemId: section.sectionId, promptName, variables: vars, schema: SCHEMAS.html, config, modelId, temperature: sc.temperature, timeoutMs: (sc.timeout ?? 180) * 1000, maxRetries: sc.max_retries ?? 5, signal, validate });
  let html = sanitizeHtml(validateSectionHtml(res.parsed.content, allowedText, allowedImages, { allowedContainerIds: rc.group_ids, expectedTexts, allowGeneratedIds: isActivity }).sectionHtml ?? res.parsed.content);
  let reasoning = res.parsed.reasoning;
  // Revue visuelle (facultative)
  if (sc.visual_refinement?.enabled) {
    const maxIt = sc.visual_refinement.max_iterations ?? 3;
    for (let i = 0; i < maxIt; i++) {
      const shots = await screenshotHtml(html, { assetMap: await blobMap(storage, allowedImages), typographyCss: typographyCss(typography), signal });
      if (!shots.length) break;
      const rev = await callLLM({ storage, step: "web-rendering", itemId: `${section.sectionId}/revue-${i + 1}`, promptName: sc.visual_refinement.prompt ?? "visual_review", variables: { page_image_base64: vars.page_image_base64, screenshots: shots, html }, schema: SCHEMAS.review, config, modelId, temperature: sc.visual_refinement.temperature, timeoutMs: (sc.visual_refinement.timeout ?? 180) * 1000, maxRetries: 2, signal, validate: (out) => (out.approved ? [] : validate({ content: out.content })) });
      if (rev.parsed.approved) break;
      html = sanitizeHtml(rev.parsed.content); reasoning += `\nRevue ${i + 1} : ${rev.parsed.reasoning}`;
    }
  }
  const result = { ...base, reasoning, html };
  if (isActivity && sc.answer_prompt !== null) {
    try {
      const lang = languageContext(await bookLanguage(storage, config));
      const ans = await callLLM({ storage, step: "web-rendering", itemId: `${section.sectionId}/reponses`, promptName: "activity_answers", variables: { page_image_base64: vars.page_image_base64, html, section_type: section.sectionType, language: lang.name }, schema: SCHEMAS.answers, config, modelId, timeoutMs: 180000, maxRetries: 3, signal });
      result.activityReasoning = ans.parsed.reasoning;
      result.activityAnswers = Object.fromEntries((ans.parsed.answers ?? []).map((a) => [a.id, a.value]));
    } catch (e) { if (e?.name === "AbortError") throw e; result.activityAnswersError = e.message; }
  }
  return result;
}

/** Mise en page fixe : image de page en fond, texte positionné (sr-only si superposé). */
export async function renderFixedLayout(storage, page, section, rc, config) {
  const w = page.width, h = page.height;
  const blocks = page.positioned ?? [];
  const leaves = rc.leaf_texts;
  // Associer chaque feuille au bloc positionné le plus proche textuellement.
  const used = new Set();
  const spans = leaves.map((leaf) => {
    let best = null, bestScore = 0;
    for (const b of blocks) { if (used.has(b.id)) continue; const score = similarity(leaf.text, b.text); if (score > bestScore) { bestScore = score; best = b; } }
    if (best && bestScore > 0.35) used.add(best.id);
    const pos = best && bestScore > 0.35 ? best : null;
    const fontPct = pos ? Math.max(0.8, (pos.lineHeight * 100) * 0.75) : 2;
    const style = pos ? `left:${(pos.left * 100).toFixed(2)}%;top:${(pos.top * 100).toFixed(2)}%;width:${Math.min(100 - pos.left * 100, pos.width * 100 + 1).toFixed(2)}%;font-size:${fontPct.toFixed(2)}cqh;line-height:1.15;color:transparent;` : "";
    return pos ? `<p class="absolute m-0 select-text" data-id="${escapeAttr(leaf.text_id)}" data-fl-positioned="true" style="${style}">${escapeHtml(leaf.text)}</p>` : `<p class="sr-only" data-id="${escapeAttr(leaf.text_id)}">${escapeHtml(leaf.text)}</p>`;
  });
  return `<div id="content" class="container mx-auto w-full flex items-center justify-center" style="background-color: ${escapeAttr(section.backgroundColor ?? "#ffffff")};"><section data-section-type="${escapeAttr(section.sectionType)}" data-section-id="${escapeAttr(section.sectionId)}" data-fl-reference-width="${w}" class="relative mx-auto w-full max-w-5xl" style="aspect-ratio: ${w} / ${h}; container-type: size;"><img src="images/${page.pageId}_page.png" alt="" class="absolute inset-0 w-full h-full" aria-hidden="true" data-fl-background="true">${spans.join("")}</section></div>`;
}
function similarity(a, b) { a = a.toLowerCase().replace(/\s+/g, " ").trim(); b = b.toLowerCase().replace(/\s+/g, " ").trim(); if (!a || !b) return 0; if (a === b) return 1; if (b.includes(a) || a.includes(b)) return Math.min(a.length, b.length) / Math.max(a.length, b.length) * 0.9 + 0.1; const wa = new Set(a.split(" ")), wb = new Set(b.split(" ")); let n = 0; for (const x of wa) if (wb.has(x)) n++; return (2 * n) / (wa.size + wb.size); }

export async function webRendering(ctx) {
  const { storage, config } = ctx;
  const pages = await storage.getActivePages(config);
  const only = ctx.options?.pageIds ? new Set(ctx.options.pageIds) : null;
  const styleguide = config.styleguide ? ((await storage.getNodeData("styleguide", config.styleguide))?.content ?? "") : "";
  let count = 0;
  await forEachPage(ctx, pages.filter((p) => !only || only.has(p.pageId)), async (page) => {
    const sectioning = await storage.getNodeData("page-sectioning", page.pageId);
    if (!sectioning) return;
    const prev = await storage.getNodeData("web-rendering", page.pageId);
    const sections = [];
    for (let i = 0; i < sectioning.sections.length; i++) {
      const s = sectioning.sections[i];
      if (s.isPruned || (config.pruned_section_types ?? []).includes(s.sectionType)) continue;
      const kept = prev?.sections?.find((x) => x.sectionId === s.sectionId);
      if (kept?.manualEdit && !ctx.options?.force && ctx.options?.sectionIndex == null) { sections.push({ ...kept, sectionIndex: i }); continue; }
      if (ctx.options?.sectionIndex != null && ctx.options.sectionIndex !== i && kept) { sections.push({ ...kept, sectionIndex: i }); continue; }
      sections.push(await renderSection({ storage, config, page, section: s, sectionIndex: i, userInstructions: ctx.options?.userInstructions ?? "", signal: ctx.signal, styleguide }));
      count++;
    }
    await storage.putNodeData("web-rendering", page.pageId, { sections, generatedAt: nowIso() });
  }, { concurrency: Math.min(config.concurrency ?? 4, 4) });
  return { message: `${count} sections rendues` };
}

/** Édition d'une section par instruction en langage naturel. Retourne le nouveau HTML. */
export async function aiEditSection({ storage, config, page, section, rendering, instruction, signal }) {
  const rc = await sectionContext(storage, page, section, config);
  const allowedText = rc.leaf_texts.map((t) => t.text_id), allowedImages = rc.image_refs.map((i) => i.image_id);
  const expectedTexts = new Map(rc.leaf_texts.map((t) => [t.text_id, t.text]));
  const typography = await getTypography(storage, config);
  let shots = [];
  try { shots = await screenshotHtml(rendering.html, { assetMap: await blobMap(storage, allowedImages), typographyCss: typographyCss(typography), viewports: [VIEWPORTS[0], VIEWPORTS[2]], signal }); } catch { /* facultatif */ }
  const modelId = stepModel(config, "web_rendering");
  let failure = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await callLLM({ storage, step: "ai-edit", itemId: section.sectionId, promptName: "html_edit", variables: { instruction, current_html: rendering.html, screenshots: shots, previous_attempt_failure: failure }, schema: SCHEMAS.html, config, modelId, timeoutMs: 180000, maxRetries: 3, signal, noCache: attempt > 0,
      validate: (out) => validateSectionHtml(out.content, allowedText, allowedImages, { allowedContainerIds: rc.group_ids, expectedTexts, expectedSectionId: section.sectionId, expectedSectionType: section.sectionType, allowGeneratedIds: true, optionalTextIds: new Set(allowedText) }).errors });
    const html = sanitizeHtml(res.parsed.content);
    const ver = await callLLM({ storage, step: "ai-edit", itemId: `${section.sectionId}/verification`, promptName: "html_edit_verify", variables: { instruction, before_html: rendering.html.slice(0, 40000), after_html: html.slice(0, 40000) }, schema: SCHEMAS.verify, config, modelId, timeoutMs: 120000, maxRetries: 1, signal }).catch(() => ({ parsed: { applied: true, reason: "" } }));
    if (ver.parsed.applied || attempt === 1) return { html, reasoning: res.parsed.reasoning, verified: ver.parsed.applied };
    failure = ver.parsed.reason;
  }
}

export const renderingSteps = { "web-rendering": webRendering };
