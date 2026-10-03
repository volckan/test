// Vue « Scénarimage » : réglages, aperçu des pages rendues, actions par section (édition IA, re-rendu, HTML, activités).
import { h, button, icon, badge, toast, dialog, confirmDialog, segmented, switchRow, select, textarea, field, promptDialog, textInput } from "../dom.js";
import { runCard, prereqGuard, pageThumbs, pageImage, patchBookConfig, versionPicker, sectionPreview, viewportToggle, imageIdsInHtml, startStage } from "./common.js";
import { RENDER_STRATEGIES, SECTION_TYPE_LABELS } from "../../config.js";
import { renderSection, aiEditSection, resolveStrategy } from "../../pipeline/steps/rendering.js";
import { runStages } from "../../pipeline/runner.js";
import { validateSectionHtml, sanitizeHtml } from "../../pipeline/validate-html.js";
import { toRenderNodes, leafTexts, imageRefs, groupIds, sectionText } from "../../pipeline/section-tree.js";
import { callLLM } from "../../llm/client.js";
import { SCHEMAS, stepModel, languageContext, bookLanguage, pageImageForLlm } from "../../pipeline/steps/common.js";
import { generateImage, resolveUsableModel } from "../../llm/providers.js";
import { getCredentials } from "../../storage.js";
import { imageDimensions, nowIso, pad3 } from "../../util.js";
import { renderPrompt } from "../../llm/prompt-engine.js";
import { getPromptSource } from "../../llm/prompts.js";
import { modelPicker } from "../screens/settings.js";

export async function renderStoryboard(ctx, container) {
  if (ctx.pageId) return renderPage(ctx, container);
  const cfg = ctx.config;
  const strategies = RENDER_STRATEGIES.map((r) => [r.id, r.title]);
  const settings = h("div", { class: "card" }, h("div", { class: "card-body stack" }, h("h3", { style: { margin: 0 } }, "Réglages du rendu"),
    field("Stratégie de rendu par défaut", select(strategies, cfg.default_render_strategy, { onChange: (v) => patchBookConfig(ctx, { default_render_strategy: v }) }), { hint: RENDER_STRATEGIES.find((r) => r.id === cfg.default_render_strategy)?.description }),
    h("div", { class: "field" }, h("span", { class: "field-label" }, "Types d'activités"), segmented([["dynamic", "Générées par IA"], ["match_source", "Fidèles à la source"], ["template", "Gabarit"]], cfg.storyboard_activity_mode ?? "dynamic", (v) => patchBookConfig(ctx, { storyboard_activity_mode: v }))),
    h("div", { class: "field" }, h("span", { class: "field-label" }, "Effort"), segmented([["relaxed", "Détendu"], ["medium", "Moyen"], ["high", "Élevé"]], cfg.storyboard_effort ?? "medium", (v) => patchBookConfig(ctx, { storyboard_effort: v, render_strategies: { llm: { config: { visual_refinement: { enabled: v === "high", max_iterations: v === "high" ? 3 : 1 } } }, "llm-overlay": { config: { visual_refinement: { enabled: v === "high" } } } } })), h("span", { class: "field-hint" }, "Élevé : active la revue visuelle par captures d'écran (plus lent, plus coûteux)."))));
  container.appendChild(h("div", { class: "stack" }, settings, runCard(ctx, "storyboard")));
  if (prereqGuard(ctx, "storyboard", container)) return;
  const grid = await pageThumbs(ctx, { onPick: (p) => ctx.go("storyboard", p.pageId), annotate: async (p) => { const r = await ctx.storage.getNodeData("web-rendering", p.pageId); return r ? badge(`${r.sections.length} rendue${r.sections.length > 1 ? "s" : ""}`, "accent") : badge("non rendue"); } });
  container.appendChild(h("div", { class: "stack" }, h("div", { class: "row between" }, h("h2", { style: { margin: 0 } }, "Pages"), button("Plan du livre", { size: "sm", variant: "secondary", iconName: "list", onClick: () => outlineAudit(ctx) })), grid));
}

async function outlineAudit(ctx) {
  const outline = await ctx.storage.getNodeData("book-outline", "book");
  dialog({ title: "Plan du livre (hiérarchie des titres)", size: "lg", body: outline?.entries?.length ? h("div", { class: "stack" }, h("p", { class: "muted small" }, outline.reasoning), h("table", { class: "table" }, h("thead", {}, h("tr", {}, ["Niveau", "Titre", "Page", "Genre", "Confiance"].map((c) => h("th", {}, c)))), h("tbody", {}, outline.entries.map((e) => h("tr", {}, h("td", {}, `H${e.level}`), h("td", { style: { paddingLeft: `${(e.level - 1) * 14 + 10}px` } }, e.title), h("td", {}, e.pageNumber), h("td", {}, e.kind), h("td", {}, badge(`${Math.round((e.confidence ?? 0) * 100)} %`, e.confidence < 0.6 ? "warning" : "muted"))))))) : h("p", { class: "muted" }, "Aucun plan généré. Lancez la sous-étape « Plan du livre » de l'extraction.") });
}

async function renderPage(ctx, container) {
  const page = await ctx.storage.getPage(ctx.pageId);
  const sectioning = await ctx.storage.getNodeData("page-sectioning", ctx.pageId);
  const rendering = await ctx.storage.getNodeData("web-rendering", ctx.pageId);
  const idx = ctx.pages.findIndex((p) => p.pageId === ctx.pageId);
  let viewport = "desktop";
  const head = h("div", { class: "row between row-wrap" }, button("Précédente", { variant: "ghost", iconName: "chevron-left", disabled: idx <= 0, onClick: () => ctx.go("storyboard", ctx.pages[idx - 1].pageId) }), h("h2", { style: { margin: 0 } }, `Page ${page.pageNumber}`), h("div", { class: "row" }, viewportToggle(viewport, (v) => { viewport = v; draw(); }), button("Rendre à nouveau la page", { size: "sm", variant: "secondary", iconName: "refresh", onClick: async () => { const instr = await promptDialog({ title: "Rendre à nouveau la page", label: "Instructions facultatives pour le rendu", multiline: true, placeholder: "Ex. : « Mets l'image à droite du texte »", confirmLabel: "Rendre" }); if (instr === null) return; runStages(ctx.label, "storyboard", "storyboard", { pageIds: [ctx.pageId], force: true, userInstructions: instr }); } }), button("Suivante", { variant: "ghost", iconName: "chevron-right", disabled: idx >= ctx.pages.length - 1, onClick: () => ctx.go("storyboard", ctx.pages[idx + 1].pageId) })));
  container.appendChild(head);
  if (!sectioning) { container.appendChild(h("div", { class: "empty" }, h("h3", {}, "Page non structurée"), button("Aller au sectionnement", { onClick: () => ctx.go("sectioning", ctx.pageId) }))); return; }
  if (!rendering) { container.appendChild(h("div", { class: "empty" }, h("h3", {}, "Page non rendue"), button("Rendre cette page", { iconName: "play", onClick: () => runStages(ctx.label, "storyboard", "storyboard", { pageIds: [ctx.pageId] }) }))); return; }
  const list = h("div", { class: "stack" });
  const draw = async () => {
    list.innerHTML = "";
    list.appendChild(await versionPicker(ctx.storage, "web-rendering", ctx.pageId, { onChange: () => ctx.refresh() }));
    for (const r of rendering.sections) {
      const sec = sectioning.sections.find((s) => s.sectionId === r.sectionId) ?? sectioning.sections[r.sectionIndex];
      const box = h("div", { class: "section-box" });
      const strategy = resolveStrategy(ctx.config, sec ?? {});
      box.appendChild(h("div", { class: "section-box-head" }, h("strong", { class: "mono small" }, r.sectionId), badge(SECTION_TYPE_LABELS[r.sectionType] ?? r.sectionType, "accent"), badge(r.strategy ?? strategy.name), r.manualEdit ? badge("édité", "warning") : null, r.activityAnswers ? badge(`${Object.keys(r.activityAnswers).length} réponses`, "success") : null, h("span", { class: "grow" }),
        button("Demander à l'IA de modifier…", { size: "sm", variant: "secondary", iconName: "sparkles", onClick: () => aiEdit(ctx, page, sec, r, rendering) }),
        sectionMenu(ctx, page, sec, r, rendering, sectioning)));
      box.appendChild(h("div", { class: "section-box-body" }, await sectionPreview(ctx, r.html, { imageIds: imageIdsInHtml(r.html).concat(r.renderType === "fixed_layout" ? [`${page.pageId}_page`] : []), viewport }), r.reasoning ? h("details", { class: "acc", style: { marginTop: "10px" } }, h("summary", {}, "Raisonnement"), h("p", { class: "small muted" }, r.reasoning)) : null, r.activityAnswers ? h("details", { class: "acc", style: { marginTop: "8px" } }, h("summary", {}, "Réponses de l'activité"), h("pre", { class: "code" }, JSON.stringify(r.activityAnswers, null, 1))) : null));
      list.appendChild(box);
    }
  };
  await draw();
  container.appendChild(h("div", { class: "split split-1-2" }, h("div", { class: "stack" }, h("h3", {}, "Page d'origine"), pageImage(ctx, page.pageId)), list));
}

function sectionMenu(ctx, page, sec, r, rendering, sectioning) {
  return button("", { size: "sm", variant: "ghost", iconName: "more", title: "Actions", onClick: () => {
    const items = [
      ["Voir / modifier le code HTML", () => editHtml(ctx, page, sec, r, rendering)],
      ["Rendre à nouveau cette section (avec instructions)", async () => { const instr = await promptDialog({ title: "Rendre à nouveau la section", label: "Instructions facultatives", multiline: true, confirmLabel: "Rendre" }); if (instr === null) return; runStages(ctx.label, "storyboard", "storyboard", { pageIds: [page.pageId], sectionIndex: r.sectionIndex, force: true, userInstructions: instr }); }],
      ["Copier la mise en page d'une autre section…", () => mirrorLayout(ctx, page, sec, r, rendering)],
      ["Générer une activité à partir de cette section…", () => generateActivity(ctx, page, sec, r, rendering, sectioning)],
      ["Ajouter / remplacer une image par IA…", () => aiImage(ctx, page, sec, r, rendering)],
      ["Essayer l'activité (aperçu interactif)", () => ctx.go("preview", null, { page: r.sectionId })],
      [sec?.isPruned ? "Restaurer la section" : "Élaguer la section (exclure du livre)", async () => { const s = await ctx.storage.getNodeData("page-sectioning", page.pageId); const target = s.sections.find((x) => x.sectionId === r.sectionId); if (target) { target.isPruned = !target.isPruned; await ctx.storage.putNodeData("page-sectioning", page.pageId, { ...s, manualEdit: true }); toast("Enregistré", { kind: "success" }); ctx.refresh(); } }],
      ["Modifier la structure (sectionnement)", () => ctx.go("sectioning", page.pageId)],
    ];
    const { close } = dialog({ title: `Section ${r.sectionId}`, size: "sm", body: h("div", { class: "stack", style: { gap: "4px" } }, items.map(([l, fn]) => button(l, { variant: "secondary", onClick: () => { close(); fn(); } }))) });
  } });
}

async function saveRendering(ctx, page, rendering, sectionId, patch) {
  const next = { ...rendering, sections: rendering.sections.map((s) => s.sectionId === sectionId ? { ...s, ...patch, manualEdit: true, editedAt: nowIso() } : s), generatedAt: nowIso() };
  await ctx.storage.putNodeData("web-rendering", page.pageId, next, { manualEdit: true });
  const { invalidateDownstream } = await import("../../pipeline/runner.js"); await invalidateDownstream(ctx.label, "storyboard");
  ctx.refresh();
}

async function aiEdit(ctx, page, sec, r, rendering) {
  const history = r.aiEdits ?? [];
  const ta = textarea({ rows: 3, placeholder: "Ex. : « Place la légende sous l'image et agrandis le titre »" });
  const status = h("div", { class: "muted small" });
  const { close } = dialog({ title: "Demander à l'IA de modifier la section", body: h("div", { class: "stack" }, field("Instruction", ta), history.length ? h("details", { class: "acc" }, h("summary", {}, `Historique des modifications IA (${history.length})`), h("ul", { class: "small" }, history.map((e) => h("li", {}, h("strong", {}, e.instruction), " — ", e.reasoning)))) : null, status), actions: [{ label: "Annuler", variant: "ghost" }, { label: "Appliquer", closeOn: false, onClick: async () => { const instruction = ta.value.trim(); if (!instruction) return false; status.textContent = "Modification en cours…"; try { const res = await aiEditSection({ storage: ctx.storage, config: ctx.config, page, section: sec, rendering: r, instruction }); await saveRendering(ctx, page, rendering, r.sectionId, { html: res.html, aiEdits: [...history, { instruction, reasoning: res.reasoning, at: nowIso(), verified: res.verified }] }); toast(res.verified ? "Modification appliquée" : "Modification appliquée (vérification incertaine)", { kind: "success" }); close(); } catch (e) { status.textContent = `Erreur : ${e.message}`; } return false; } }] });
}

async function editHtml(ctx, page, sec, r, rendering) {
  const ta = textarea({ value: r.html, class: "input html-editor", spellcheck: "false" });
  const errBox = h("div");
  const { close } = dialog({ title: `Code HTML — ${r.sectionId}`, size: "xl", body: h("div", { class: "stack" }, h("p", { class: "muted small" }, "Conservez les attributs data-id ; les textes sont vérifiés par rapport à la structure de la page."), ta, errBox), actions: [{ label: "Annuler", variant: "ghost" }, { label: "Enregistrer", closeOn: false, onClick: async () => { const nodes = toRenderNodes(sec.nodes); const check = validateSectionHtml(ta.value, leafTexts(nodes).map((t) => t.text_id), imageRefs(nodes).map((i) => i.image_id), { allowedContainerIds: groupIds(nodes), expectedTexts: new Map(leafTexts(nodes).map((t) => [t.text_id, t.text])), expectedSectionId: sec.sectionId, allowGeneratedIds: true, optionalTextIds: new Set(leafTexts(nodes).map((t) => t.text_id)) }); if (!check.valid) { errBox.innerHTML = ""; errBox.appendChild(h("div", { class: "callout callout-warning small" }, h("ul", { style: { margin: 0 } }, check.errors.slice(0, 8).map((e) => h("li", {}, e)))), h("div", { class: "row end", style: { marginTop: "6px" } }, button("Enregistrer malgré tout", { size: "sm", variant: "danger", onClick: async () => { await saveRendering(ctx, page, rendering, r.sectionId, { html: sanitizeHtml(ta.value) }); close(); } }))); return false; } await saveRendering(ctx, page, rendering, r.sectionId, { html: sanitizeHtml(check.sectionHtml ?? ta.value) }); toast("HTML enregistré", { kind: "success" }); close(); return false; } }] });
}

async function mirrorLayout(ctx, page, sec, r, rendering) {
  const pageSel = select(ctx.pages.map((p) => [p.pageId, `Page ${p.pageNumber}`]), ctx.pages[0].pageId, {});
  const secSel = h("select", { class: "input select" });
  const fill = async () => { const rr = await ctx.storage.getNodeData("web-rendering", pageSel.value); secSel.innerHTML = ""; for (const s of rr?.sections ?? []) secSel.appendChild(h("option", { value: s.sectionId }, `${s.sectionId} (${SECTION_TYPE_LABELS[s.sectionType] ?? s.sectionType})`)); };
  pageSel.addEventListener("change", fill); await fill();
  const instr = textInput({ placeholder: "Instruction complémentaire (facultatif)" });
  dialog({ title: "Copier la mise en page d'une autre section", body: h("div", { class: "stack" }, field("Page source", pageSel), field("Section source", secSel), field("Instruction", instr)), actions: [{ label: "Annuler", variant: "ghost" }, { label: "Appliquer", onClick: async () => { const rr = await ctx.storage.getNodeData("web-rendering", pageSel.value); const src = rr?.sections.find((s) => s.sectionId === secSel.value); if (!src) return; toast("Application de la mise en page…"); try { const res = await aiEditSection({ storage: ctx.storage, config: ctx.config, page, section: sec, rendering: r, instruction: `Reproduis fidèlement la MISE EN PAGE (structure, classes Tailwind, disposition) de la section de référence ci-dessous en l'appliquant au contenu actuel, sans changer les textes ni les data-id. ${instr.value}\n\nSection de référence :\n${src.html.slice(0, 30000)}` }); await saveRendering(ctx, page, rendering, r.sectionId, { html: res.html }); toast("Mise en page copiée", { kind: "success" }); } catch (e) { toast(e.message, { kind: "error" }); } } }] });
}

async function generateActivity(ctx, page, sec, r, rendering, sectioning) {
  const kinds = [["auto", "Automatique (l'IA choisit)"], ["activity_multiple_choice", "Choix multiple"], ["activity_true_false", "Vrai / faux"], ["activity_fill_in_the_blank", "Texte à trous"], ["activity_open_ended_answer", "Réponse libre"], ["activity_matching", "Association"], ["activity_sorting", "Classement"], ["activity_ordering", "Mise en ordre"]];
  const kindSel = select(kinds, "auto", {}); const instr = textarea({ rows: 2, placeholder: "Consignes pour l'auteur de l'activité (facultatif)" }); let inclusive = true;
  dialog({ title: "Générer une activité", body: h("div", { class: "stack" }, h("p", { class: "muted small" }, "Une nouvelle section d'activité est créée après cette section, à partir de son contenu."), field("Type d'activité", kindSel), field("Consignes", instr), switchRow("Conception inclusive (consignes explicites, vocabulaire simple)", inclusive, (v) => { inclusive = v; })), actions: [{ label: "Annuler", variant: "ghost" }, { label: "Générer", onClick: async () => {
    toast("Génération de l'activité…");
    try {
      const lang = languageContext(await bookLanguage(ctx.storage, ctx.config));
      const kind = kindSel.value === "auto" ? "activity_multiple_choice" : kindSel.value;
      const newId = nextId(sectioning, page.pageId);
      const res = await callLLM({ storage: ctx.storage, step: "generate-activity", itemId: newId, promptName: "generate_activity", variables: { activity_kind: kind, language: lang.name, section_id: newId, section_text: sectionText(sec, ctx.config).slice(0, 8000), instructions: instr.value, inclusive }, schema: SCHEMAS.generateActivity, config: ctx.config, modelId: stepModel(ctx.config, "web_rendering"), noCache: true, validate: (out) => (/<section[\s>]/.test(out.content ?? "") && /data-activity-item/.test(out.content) ? [] : ["Le HTML doit contenir une <section> avec des contrôles data-activity-item"]) });
      const html = sanitizeHtml(res.parsed.content.includes('id="content"') ? res.parsed.content : `<div id="content" class="container mx-auto w-full max-w-5xl px-8 py-10">${res.parsed.content}</div>`).replace(/data-section-id="[^"]*"/, `data-section-id="${newId}"`).replace(/data-section-type="[^"]*"/, `data-section-type="${kind}"`);
      const s = await ctx.storage.getNodeData("page-sectioning", page.pageId);
      const si = s.sections.findIndex((x) => x.sectionId === sec.sectionId);
      const genNodes = [...sanitizeHtml(html).matchAll(/data-id="(activity_gen_\d+)"[^>]*>([^<]*)</g)].map((m, k) => ({ nodeId: `${page.pageId}_ac${pad3(k + 1)}`, isPruned: false, role: "text", text: m[2].trim() || `Texte généré ${k + 1}` }));
      s.sections.splice(si + 1, 0, { sectionId: newId, sectionType: kind, backgroundColor: "#ffffff", textColor: "#000000", pageNumber: sec.pageNumber, isPruned: false, nodes: genNodes.length ? genNodes : [{ nodeId: `${page.pageId}_ac001`, isPruned: false, role: "activity_instruction", text: "Activité générée" }], generated: true });
      await ctx.storage.putNodeData("page-sectioning", page.pageId, { ...s, manualEdit: true }, { manualEdit: true });
      const rr = await ctx.storage.getNodeData("web-rendering", page.pageId);
      const ri = rr.sections.findIndex((x) => x.sectionId === sec.sectionId);
      let k = 0; const html2 = html.replace(/data-id="activity_gen_\d+"/g, () => `data-id="${page.pageId}_ac${pad3(++k)}"`);
      rr.sections.splice(ri + 1, 0, { sectionIndex: si + 1, sectionId: newId, sectionType: kind, strategy: "generated", renderType: "activity", reasoning: res.parsed.reasoning, html: html2, activityAnswers: Object.fromEntries((res.parsed.answers ?? []).map((a) => [a.id, a.value])), manualEdit: true, renderedAt: nowIso() });
      rr.sections.forEach((x, i) => { x.sectionIndex = i; });
      await ctx.storage.putNodeData("web-rendering", page.pageId, rr, { manualEdit: true });
      toast("Activité générée", { kind: "success" }); ctx.refresh();
    } catch (e) { toast(e.message, { kind: "error" }); }
  } }] });
}
function nextId(sectioning, pageId) { let seq = sectioning.sections.length + 1; const ids = new Set(sectioning.sections.map((s) => s.sectionId)); while (ids.has(`${pageId}_sec${pad3(seq)}`)) seq++; return `${pageId}_sec${pad3(seq)}`; }

async function aiImage(ctx, page, sec, r, rendering) {
  const imgs = imageIdsInHtml(r.html);
  const target = select([["", "Nouvelle image (ajoutée à la fin de la section)"], ...imgs.map((i) => [i, `Remplacer ${i}`])], "", {});
  const types = ["Automatique", "Photographie", "Illustration", "Schéma", "Graphique", "Carte", "Infographie", "Dessin animé", "Aquarelle", "Croquis au crayon", "Pixel art", "Vectoriel plat", "Collage papier", "Album classique"];
  const typeSel = select(types, "Automatique", {}); const prompt = textarea({ rows: 3, placeholder: "Décrivez l'image souhaitée" });
  const credentials0 = await getCredentials();
  let modelId = resolveUsableModel(ctx.config.default_image_generation_model ?? "openai:gpt-image-2", credentials0, "image").modelId;
  let remember = false;
  const picker = await modelPicker(modelId, (v) => { modelId = v; }, { kind: "image" });
  dialog({ title: "Image par IA", body: h("div", { class: "stack" }, field("Cible", target), field("Type d'image", typeSel), field("Description", prompt), field("Modèle d'images", picker), switchRow("Mémoriser comme modèle d'images de ce livre", remember, (v) => { remember = v; })), actions: [{ label: "Annuler", variant: "ghost" }, { label: "Générer", onClick: async () => {
    toast("Génération de l'image…");
    let text = "";
    try {
      const credentials = await getCredentials(); const summary = (await ctx.storage.getNodeData("book-summary", "book"))?.summary ?? "";
      if (remember && modelId !== ctx.config.default_image_generation_model) await patchBookConfig(ctx, { default_image_generation_model: modelId });
      const refBlob = target.value ? await ctx.storage.getImageBlob(target.value) : null; const refMeta = target.value ? await ctx.storage.getImage(target.value) : null;
      const tpl = await getPromptSource(target.value ? "ai_image_edit" : "ai_image_generation", { label: ctx.label });
      text = renderPrompt(tpl, { prompt: prompt.value, image_type: typeSel.value, book_summary: summary, aspect_ratio: refMeta ? `${refMeta.width}:${refMeta.height}` : "4:3" }).text;
      const out = await generateImage({ modelId: resolveUsableModel(modelId, credentials, "image").modelId, prompt: text, referenceImages: refBlob ? [{ blob: refBlob }] : [], aspectRatio: refMeta ? refMeta.width / refMeta.height : 4 / 3, credentials });
      const dims = await imageDimensions(out.blob);
      const existing = (await ctx.storage.getPageImages(page.pageId)).length;
      const id = target.value ? `${target.value}_ai${Date.now().toString(36)}` : `${page.pageId}_im${pad3(existing + 1)}`;
      await ctx.storage.putImage({ imageId: id, pageId: page.pageId, width: dims.width, height: dims.height, source: "upload", renderMethod: "raster", bounds: refMeta?.bounds ?? null, parentImageId: target.value || undefined }, out.blob);
      await ctx.storage.appendLlmLog({ requestId: id, step: "ai-image", itemId: r.sectionId, success: 1, errorCount: 0, data: { model: modelId, servedModel: out.model && out.model !== modelId ? out.model : undefined, promptName: target.value ? "ai_image_edit" : "ai_image_generation", messages: [{ role: "user", parts: [{ type: "text", text }] }], response: `image ${dims.width}×${dims.height}`, usage: { input: 0, output: 0 } } });
      let html = r.html;
      if (target.value) html = html.replace(new RegExp(`data-id="${target.value}"([^>]*)src="[^"]*"`), `data-id="${id}"$1src="images/${id}.png"`).replace(new RegExp(`src="images/${target.value}\\.png"([^>]*)data-id="${target.value}"`), `src="images/${id}.png"$1data-id="${id}"`);
      else html = html.replace(/<\/section>/, `<figure class="my-6 flex justify-center"><img data-id="${id}" src="images/${id}.png" alt="" class="max-w-full h-auto rounded-lg"></figure></section>`);
      // Mettre à jour l'arbre de section pour référencer la nouvelle image
      const s = await ctx.storage.getNodeData("page-sectioning", page.pageId); const sx = s.sections.find((x) => x.sectionId === sec.sectionId);
      if (sx) { let replaced = false; (function walk(nodes) { for (const n of nodes) { if (n.role === "image" && (n.imageId ?? n.nodeId) === target.value) { n.imageId = id; n.nodeId = id; replaced = true; } if (n.children) walk(n.children); } })(sx.nodes); if (!replaced) sx.nodes.push({ nodeId: id, imageId: id, isPruned: false, role: "image" }); await ctx.storage.putNodeData("page-sectioning", page.pageId, { ...s, manualEdit: true }, { manualEdit: true }); }
      await saveRendering(ctx, page, rendering, r.sectionId, { html });
      toast("Image générée", { kind: "success" });
    } catch (e) {
      toast(e.message, { kind: "error", title: "Génération d'image" });
      await ctx.storage.appendLlmLog({ requestId: `img-${Date.now().toString(36)}`, step: "ai-image", itemId: r.sectionId, success: 0, errorCount: 1, data: { model: modelId, promptName: target.value ? "ai_image_edit" : "ai_image_generation", messages: text ? [{ role: "user", parts: [{ type: "text", text }] }] : [], errors: [{ attempt: 1, kind: "provider", message: e.message }], usage: { input: 0, output: 0 } } }).catch(() => {});
    }
  } }] });
}
