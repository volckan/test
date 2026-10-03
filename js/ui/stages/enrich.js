// Vues « Légendes », « Quiz », « Glossaire », « Table des matières », « Lecture facile ».
import { h, button, icon, badge, toast, dialog, confirmDialog, segmented, switchRow, select, textarea, textInput, field, blobImg, promptDialog } from "../dom.js";
import { runCard, prereqGuard, patchBookConfig, versionPicker, customInstructions, lightbox } from "./common.js";
import { GLOSSARY_AMOUNTS, CAPTION_GRADE_LEVELS, SECTION_TYPE_LABELS } from "../../config.js";
import { generateOneQuiz, generateGlossaryItem, renderedPages, collectHeadings } from "../../pipeline/steps/enrich.js";
import { callLLM } from "../../llm/client.js";
import { SCHEMAS, stepModel, languageContext, bookLanguage } from "../../pipeline/steps/common.js";
import { nowIso, pad3, quizIdOf, blobToDataUrl } from "../../util.js";
import { runStages } from "../../pipeline/runner.js";
import { sectionText } from "../../pipeline/section-tree.js";

// ── Légendes d'images ─────────────────────────────────────────────────────
export async function renderCaptions(ctx, container) {
  const cfg = ctx.config;
  const settings = h("div", { class: "card" }, h("div", { class: "card-body stack" }, h("h3", { style: { margin: 0 } }, "Réglages des légendes"), h("div", { class: "field" }, h("span", { class: "field-label" }, "Niveau scolaire"), segmented(Object.entries(CAPTION_GRADE_LEVELS), cfg.image_captioning_grade_level ?? "early", (v) => patchBookConfig(ctx, { image_captioning_grade_level: v }))), customInstructions(ctx, cfg.image_captioning_user_prompt, (v) => patchBookConfig(ctx, { image_captioning_user_prompt: v }, { silent: true }))));
  container.appendChild(h("div", { class: "stack" }, settings, runCard(ctx, "captions")));
  if (prereqGuard(ctx, "captions", container)) return;
  const data = await ctx.storage.getNodeData("image-captioning", "book");
  if (!data) return;
  let filter = "all", q = "";
  const list = h("div", { class: "thumb-grid" });
  const render = async () => {
    list.innerHTML = "";
    let caps = data.captions.filter((c) => filter === "all" || (filter === "captioned" ? !c.decorative : c.decorative)).filter((c) => !q || c.caption.toLowerCase().includes(q) || c.imageId.includes(q));
    for (const c of caps) {
      const im = await ctx.storage.getImage(c.imageId);
      const ta = textarea({ value: c.caption, rows: 3, onChange: async (e) => { c.caption = e.target.value; c.source = "manual"; await ctx.storage.putNodeData("image-captioning", "book", { ...data, generatedAt: nowIso() }); toast("Légende enregistrée", { kind: "success", duration: 1200 }); } });
      list.appendChild(h("div", { class: "thumb-card" }, blobImg(ctx.storage.getImageBlob(c.imageId), { alt: c.caption, onClick: async () => lightbox(await blobToDataUrl(await ctx.storage.getImageBlob(c.imageId)), c.caption) }), h("div", { class: "row between small" }, h("span", { class: "mono muted" }, c.imageId, im ? ` · p.${im.pageId.replace("pg", "")}` : ""), badge(c.source === "manual" ? "Modifiée" : "IA", c.source === "manual" ? "warning" : "muted")), c.decorative ? h("div", { class: "muted small" }, "Décorative (ignorée par les lecteurs d'écran)") : ta, switchRow("Décorative", !!c.decorative, async (v) => { c.decorative = v; c.source = "manual"; if (v) c.caption = ""; await ctx.storage.putNodeData("image-captioning", "book", { ...data, generatedAt: nowIso() }); render(); }), c.reasoning ? h("details", {}, h("summary", { class: "small muted" }, "Raisonnement"), h("p", { class: "small muted" }, c.reasoning)) : null));
    }
    if (!caps.length) list.appendChild(h("p", { class: "muted" }, "Aucune image."));
  };
  container.appendChild(h("div", { class: "stack" }, h("div", { class: "row row-wrap between" }, h("h2", { style: { margin: 0 } }, `${data.captions.length} images`), h("div", { class: "row" }, textInput({ placeholder: "Rechercher…", onInput: (e) => { q = e.target.value.toLowerCase(); render(); } }), segmented([["all", "Toutes"], ["captioned", "Décrites"], ["decorative", "Décoratives"]], filter, (v) => { filter = v; render(); }), await versionPicker(ctx.storage, "image-captioning", "book", { onChange: () => ctx.refresh() }))), list));
  await render();
}

// ── Quiz ──────────────────────────────────────────────────────────────────
export async function renderQuizzes(ctx, container) {
  const cfg = ctx.config; const qc = cfg.quiz_generation ?? {};
  const settings = h("div", { class: "card" }, h("div", { class: "card-body stack" }, h("h3", { style: { margin: 0 } }, "Réglages des quiz"), h("div", { class: "field" }, h("span", { class: "field-label" }, "Fréquence des quiz"), h("div", { class: "row" }, h("span", {}, "Un quiz toutes les"), select([1, 2, 3, 4, 5, 8, 10].map((n) => [n, `${n} page${n > 1 ? "s" : ""}`]), qc.pages_per_quiz ?? 1, { onChange: (v) => patchBookConfig(ctx, { quiz_generation: { pages_per_quiz: Number(v) } }), attrs: { style: "width:auto" } }))), switchRow("Adapter le style du quiz au livre", qc.match_book_style !== false, (v) => patchBookConfig(ctx, { quiz_generation: { match_book_style: v } }))));
  container.appendChild(h("div", { class: "stack" }, settings, runCard(ctx, "quizzes")));
  if (prereqGuard(ctx, "quizzes", container)) return;
  const data = (await ctx.storage.getNodeData("quiz-generation", "book")) ?? { quizzes: [], generatedAt: null };
  const save = async () => { data.quizzes.forEach((q, i) => { q.quizIndex = i; }); await ctx.storage.putNodeData("quiz-generation", "book", { ...data, generatedAt: nowIso() }); };
  const list = h("div", { class: "stack" });
  let q = "";
  const render = () => {
    list.innerHTML = "";
    const items = data.quizzes.filter((x) => !x.deleted).filter((x) => !q || x.question.toLowerCase().includes(q));
    for (const quiz of items) {
      const box = h("div", { class: "section-box" });
      box.appendChild(h("div", { class: "section-box-head" }, h("strong", { class: "mono small" }, quiz.quizId), badge(`après la page ${quiz.afterPageId.replace("pg", "").replace(/^0+/, "")}`, "accent"), quiz.source === "manual" || quiz.edited ? badge("édité", "warning") : null, h("span", { class: "grow" }), button("Régénérer", { size: "sm", variant: "secondary", iconName: "sparkles", onClick: async () => { toast("Génération…"); try { const texts = []; for (const pid of quiz.pageIds) { const s = await ctx.storage.getNodeData("page-sectioning", pid); if (s) texts.push({ pageId: pid, text: s.sections.filter((x) => !x.isPruned).map((x) => sectionText(x, ctx.config)).join("\n").slice(0, 6000) }); } const nq = await generateOneQuiz({ storage: ctx.storage, config: ctx.config, pageTexts: texts, itemId: `${quiz.quizId}-regen-${Date.now()}` }); Object.assign(quiz, nq, { edited: false, source: "ai" }); await save(); render(); } catch (e) { toast(e.message, { kind: "error" }); } } }), button("Supprimer", { size: "sm", variant: "ghost", iconName: "trash", onClick: async () => { if (await confirmDialog({ title: "Supprimer ce quiz ?", text: "Il reste restaurable via l'historique des versions.", confirmLabel: "Supprimer", danger: true })) { data.quizzes = data.quizzes.filter((x) => x !== quiz); await save(); render(); } } })));
      const body = h("div", { class: "section-box-body stack" }, field("Question", textInput({ value: quiz.question, onChange: async (e) => { quiz.question = e.target.value; quiz.edited = true; await save(); } })),
        ...quiz.options.map((o, i) => h("div", { class: "row", style: { alignItems: "flex-start" } }, h("input", { type: "radio", name: `ans-${quiz.quizId}`, checked: quiz.answerIndex === i, title: "Bonne réponse", "aria-label": `Option ${i + 1} correcte`, onChange: async () => { quiz.answerIndex = i; quiz.edited = true; await save(); } }), h("div", { class: "grow stack", style: { gap: "4px" } }, textInput({ value: o.text, onChange: async (e) => { o.text = e.target.value; quiz.edited = true; await save(); } }), textInput({ value: o.explanation, class: "input small", onChange: async (e) => { o.explanation = e.target.value; quiz.edited = true; await save(); } })))),
        quiz.reasoning ? h("details", {}, h("summary", { class: "small muted" }, "Raisonnement"), h("p", { class: "small muted" }, quiz.reasoning)) : null);
      box.appendChild(body); list.appendChild(box);
    }
    if (!items.length) list.appendChild(h("p", { class: "muted" }, "Aucun quiz."));
  };
  container.appendChild(h("div", { class: "stack" }, h("div", { class: "row row-wrap between" }, h("h2", { style: { margin: 0 } }, `${data.quizzes.length} quiz`), h("div", { class: "row" }, textInput({ placeholder: "Rechercher…", onInput: (e) => { q = e.target.value.toLowerCase(); render(); } }), button("Ajouter un quiz", { size: "sm", iconName: "plus", onClick: () => addQuiz(ctx, data, save, render) }), await versionPicker(ctx.storage, "quiz-generation", "book", { onChange: () => ctx.refresh() }))), list));
  render();
}
async function addQuiz(ctx, data, save, render) {
  const pageSel = select(ctx.pages.map((p) => [p.pageId, `Page ${p.pageNumber}`]), ctx.pages[0]?.pageId, { attrs: { multiple: true, size: 6 } });
  dialog({ title: "Ajouter un quiz", body: h("div", { class: "stack" }, field("Pages sources (Ctrl+clic pour plusieurs)", pageSel), h("p", { class: "muted small" }, "Le quiz sera placé après la dernière page sélectionnée.")), actions: [{ label: "Annuler", variant: "ghost" }, { label: "Générer", onClick: async () => { const ids = [...pageSel.selectedOptions].map((o) => o.value); if (!ids.length) return; toast("Génération…"); try { const texts = []; for (const pid of ids) { const s = await ctx.storage.getNodeData("page-sectioning", pid); if (s) texts.push({ pageId: pid, text: s.sections.filter((x) => !x.isPruned).map((x) => sectionText(x, ctx.config)).join("\n").slice(0, 6000) }); } const nq = await generateOneQuiz({ storage: ctx.storage, config: ctx.config, pageTexts: texts, itemId: `manual-${Date.now()}` }); const used = new Set(data.quizzes.map((x) => x.quizId)); let seq = data.quizzes.length + 1; while (used.has(quizIdOf(seq))) seq++; data.quizzes.push({ quizId: quizIdOf(seq), quizIndex: data.quizzes.length, afterPageId: ids[ids.length - 1], pageIds: ids, ...nq, source: "manual" }); data.quizzes.sort((a, b) => a.afterPageId.localeCompare(b.afterPageId)); await save(); render(); toast("Quiz ajouté", { kind: "success" }); } catch (e) { toast(e.message, { kind: "error" }); } } }] });
}

// ── Glossaire ─────────────────────────────────────────────────────────────
export async function renderGlossary(ctx, container) {
  const cfg = ctx.config;
  const seeds = (cfg.glossary_seed_terms ?? []).map((s) => s.word).join(", ");
  const settings = h("div", { class: "card" }, h("div", { class: "card-body stack" }, h("h3", { style: { margin: 0 } }, "Réglages du glossaire"), h("div", { class: "field" }, h("span", { class: "field-label" }, "Couverture"), segmented(Object.entries(GLOSSARY_AMOUNTS), cfg.glossary_amount ?? "standard", (v) => patchBookConfig(ctx, { glossary_amount: v }))), field("Termes imposés (séparés par des virgules)", textInput({ value: seeds, onChange: (e) => patchBookConfig(ctx, { glossary_seed_terms: e.target.value.split(",").map((w) => w.trim()).filter(Boolean).map((w) => ({ id: `gl_manual_${w.toLowerCase().replace(/\W+/g, "_")}`, word: w, definition: "", variations: [], emojis: [] })) }) }), { hint: "Ces termes seront toujours présents ; définissez-les dans la liste ci-dessous." }), customInstructions(ctx, cfg.glossary_user_prompt, (v) => patchBookConfig(ctx, { glossary_user_prompt: v }, { silent: true }))));
  container.appendChild(h("div", { class: "stack" }, settings, runCard(ctx, "glossary")));
  if (prereqGuard(ctx, "glossary", container)) return;
  const data = (await ctx.storage.getNodeData("glossary", "book")) ?? { items: [] };
  const save = async () => { await ctx.storage.putNodeData("glossary", "book", { ...data, generatedAt: nowIso() }); };
  const pageTexts = (await renderedPages(ctx.storage, ctx.config)).map((it) => ({ n: it.page.pageNumber, text: it.sectioning.sections.map((s) => sectionText(s, ctx.config)).join(" ").toLowerCase() }));
  const occurrences = (g) => pageTexts.filter((p) => [g.word, ...(g.variations ?? [])].some((f) => f && p.text.includes(f.toLowerCase()))).map((p) => p.n);
  let sort = "az", filter = "all", q = "";
  const list = h("div", { class: "stack" });
  const render = () => {
    list.innerHTML = "";
    let items = data.items.filter((g) => filter === "all" ? !g.pruned : filter === "manual" ? g.source === "manual" && !g.pruned : g.pruned).filter((g) => !q || g.word.toLowerCase().includes(q) || g.definition.toLowerCase().includes(q));
    const occ = new Map(items.map((g) => [g.id, occurrences(g)]));
    items.sort(sort === "az" ? (a, b) => a.word.localeCompare(b.word, "fr") : sort === "book" ? (a, b) => (occ.get(a.id)[0] ?? 9999) - (occ.get(b.id)[0] ?? 9999) : sort === "most" ? (a, b) => occ.get(b.id).length - occ.get(a.id).length : (a, b) => occ.get(a.id).length - occ.get(b.id).length);
    for (const g of items) {
      list.appendChild(h("div", { class: "section-box" }, h("div", { class: "section-box-head" }, h("span", {}, (g.emojis ?? []).join(" ")), textInput({ value: g.word, style: "max-width:220px;font-weight:700", onChange: async (e) => { g.word = e.target.value; g.source = "manual"; await save(); } }), badge(g.source === "manual" ? "Manuel" : "IA", g.source === "manual" ? "warning" : "muted"), h("span", { class: "muted small" }, occ.get(g.id).length ? `pages ${occ.get(g.id).slice(0, 8).join(", ")}${occ.get(g.id).length > 8 ? "…" : ""}` : "aucune occurrence trouvée"), h("span", { class: "grow" }), button("Régénérer", { size: "sm", variant: "ghost", iconName: "sparkles", title: "Régénérer la définition", onClick: async () => { toast("Génération…"); try { const r = await generateGlossaryItem({ storage: ctx.storage, config: ctx.config, word: g.word }); Object.assign(g, r); await save(); render(); } catch (e) { toast(e.message, { kind: "error" }); } } }), button(g.pruned ? "Restaurer" : "Rejeter", { size: "sm", variant: "ghost", iconName: g.pruned ? "refresh" : "trash", onClick: async () => { g.pruned = !g.pruned; await save(); render(); } })),
        h("div", { class: "section-box-body stack" }, textarea({ value: g.definition, rows: 2, onChange: async (e) => { g.definition = e.target.value; g.source = "manual"; await save(); } }), h("div", { class: "row row-wrap" }, field("Variantes", textInput({ value: (g.variations ?? []).join(", "), onChange: async (e) => { g.variations = e.target.value.split(",").map((s) => s.trim()).filter(Boolean); await save(); } })), field("Emojis", textInput({ value: (g.emojis ?? []).join(" "), style: "width:120px", onChange: async (e) => { g.emojis = e.target.value.split(/\s+/).filter(Boolean); await save(); } })), field("Image", h("div", { class: "row" }, g.imageId ? blobImg(ctx.storage.getImageBlob(g.imageId), { style: "height:48px;border-radius:6px" }) : null, button(g.imageId ? "Changer" : "Ajouter une image", { size: "sm", variant: "secondary", onClick: () => pickImage(ctx, async (id) => { g.imageId = id; await save(); render(); }) }), g.imageId ? button("", { size: "sm", variant: "ghost", iconName: "x", onClick: async () => { delete g.imageId; await save(); render(); } }) : null))))));
    }
    if (!items.length) list.appendChild(h("p", { class: "muted" }, "Aucun terme."));
  };
  container.appendChild(h("div", { class: "stack" }, h("div", { class: "row row-wrap between" }, h("h2", { style: { margin: 0 } }, `${data.items.filter((g) => !g.pruned).length} termes`), h("div", { class: "row row-wrap" }, textInput({ placeholder: "Rechercher…", onInput: (e) => { q = e.target.value.toLowerCase(); render(); } }), select([["az", "A → Z"], ["book", "Ordre du livre"], ["most", "Plus utilisés"], ["least", "Moins utilisés"]], sort, { onChange: (v) => { sort = v; render(); }, attrs: { style: "width:auto" } }), segmented([["all", "Tous"], ["manual", "Manuels"], ["pruned", "Rejetés"]], filter, (v) => { filter = v; render(); }), button("Ajouter un terme", { size: "sm", iconName: "plus", onClick: () => addTerm(ctx, data, save, render) }), await versionPicker(ctx.storage, "glossary", "book", { onChange: () => ctx.refresh() }))), list));
  render();
}
async function addTerm(ctx, data, save, render) {
  const g = { word: "", definition: "", variations: [], emojis: [], source: "manual" };
  const defTa = textarea({ rows: 3, onInput: (e) => { g.definition = e.target.value; } }); const varIn = textInput({ onInput: (e) => { g.variations = e.target.value.split(",").map((s) => s.trim()).filter(Boolean); } }); const emIn = textInput({ onInput: (e) => { g.emojis = e.target.value.split(/\s+/).filter(Boolean); } });
  dialog({ title: "Ajouter un terme", body: h("div", { class: "stack" }, field("Mot", h("div", { class: "row" }, textInput({ onInput: (e) => { g.word = e.target.value; } }), button("Générer", { variant: "secondary", size: "sm", iconName: "sparkles", onClick: async () => { if (!g.word.trim()) return; toast("Génération…"); try { const r = await generateGlossaryItem({ storage: ctx.storage, config: ctx.config, word: g.word }); defTa.value = r.definition; varIn.value = r.variations.join(", "); emIn.value = r.emojis.join(" "); Object.assign(g, r); } catch (e) { toast(e.message, { kind: "error" }); } } }))), field("Définition", defTa), field("Variantes", varIn), field("Emojis", emIn)), actions: [{ label: "Annuler", variant: "ghost" }, { label: "Ajouter", onClick: async () => { if (!g.word.trim()) return false; g.id = `gl_manual_${g.word.toLowerCase().replace(/\W+/g, "_")}_${Date.now().toString(36)}`; data.items.push(g); await save(); render(); } }] });
}
async function pickImage(ctx, onPick) {
  const imgs = (await ctx.storage.getImages()).filter((im) => !im.imageId.endsWith("_page") && !im.supersededBy).slice(0, 300);
  const { close } = dialog({ title: "Choisir une image du livre", size: "lg", body: h("div", { class: "thumb-grid scroll-y" }, imgs.map((im) => h("button", { type: "button", class: "thumb-card", onClick: () => { close(); onPick(im.imageId); } }, blobImg(ctx.storage.getImageBlob(im.imageId), { alt: im.imageId }), h("span", { class: "small mono" }, im.imageId)))) });
}

// ── Table des matières ────────────────────────────────────────────────────
export async function renderToc(ctx, container) {
  const cfg = ctx.config;
  const settings = h("div", { class: "card" }, h("div", { class: "card-body stack" }, h("h3", { style: { margin: 0 } }, "Réglages de la table des matières"), h("div", { class: "field" }, h("span", { class: "field-label" }, "Mode"), segmented([["extract", "Extraire (titres tels quels)"], ["dynamic", "Dynamique (titres reformulés)"]], cfg.toc_mode ?? "extract", (v) => patchBookConfig(ctx, { toc_mode: v })))));
  container.appendChild(h("div", { class: "stack" }, settings, runCard(ctx, "toc")));
  if (prereqGuard(ctx, "toc", container)) return;
  const data = (await ctx.storage.getNodeData("toc-generation", "book")) ?? { entries: [] };
  const { headings } = await collectHeadings(ctx.storage, ctx.config);
  const save = async () => { await ctx.storage.putNodeData("toc-generation", "book", { ...data, generatedAt: nowIso(), manualEdit: true }); };
  const list = h("div", { class: "stack", style: { gap: "4px" } });
  const render = () => {
    list.innerHTML = "";
    data.entries.forEach((e, i) => list.appendChild(h("div", { class: "row", style: { paddingLeft: `${(e.level - 1) * 24}px` } }, badge(`N${e.level}`), textInput({ value: e.title, onChange: async (ev) => { e.title = ev.target.value; await save(); } }), select(headings.map((hd) => [hd.sectionId, `${hd.sectionId} · ${hd.title.slice(0, 40)}`]), e.sectionId, { onChange: async (v) => { e.sectionId = v; e.href = `${v}.html`; e.chapterId = headings.find((hd) => hd.sectionId === v)?.chapterId ?? e.chapterId; await save(); }, attrs: { style: "max-width:260px", "aria-label": "Section liée" } }), button("", { size: "sm", variant: "ghost", iconName: "chevron-left", title: "Diminuer le retrait", disabled: e.level <= 1, onClick: async () => { e.level--; await save(); render(); } }), button("", { size: "sm", variant: "ghost", iconName: "chevron-right", title: "Augmenter le retrait", disabled: e.level >= 6, onClick: async () => { e.level++; await save(); render(); } }), button("", { size: "sm", variant: "ghost", iconName: "arrow-up", disabled: i === 0, onClick: async () => { [data.entries[i - 1], data.entries[i]] = [data.entries[i], data.entries[i - 1]]; await save(); render(); } }), button("", { size: "sm", variant: "ghost", iconName: "arrow-down", disabled: i === data.entries.length - 1, onClick: async () => { [data.entries[i + 1], data.entries[i]] = [data.entries[i], data.entries[i + 1]]; await save(); render(); } }), button("", { size: "sm", variant: "ghost", iconName: "plus", title: "Ajouter une entrée dessous", onClick: async () => { data.entries.splice(i + 1, 0, { id: `toc${pad3(data.entries.length + 1)}_${Date.now().toString(36)}`, title: "Nouvelle entrée", sectionId: e.sectionId, href: e.href, chapterId: e.chapterId, level: e.level }); await save(); render(); } }), button("", { size: "sm", variant: "ghost", iconName: "trash", title: "Supprimer", onClick: async () => { data.entries.splice(i, 1); await save(); render(); } }))));
    if (!data.entries.length) list.appendChild(h("p", { class: "muted" }, "Aucune entrée. Lancez la génération ou ajoutez des entrées manuellement."));
  };
  container.appendChild(h("div", { class: "stack" }, h("div", { class: "row between" }, h("h2", { style: { margin: 0 } }, `${data.entries.length} entrées`), h("div", { class: "row" }, button("Ajouter une entrée", { size: "sm", iconName: "plus", onClick: async () => { const hd = headings[0]; data.entries.push({ id: `toc${pad3(data.entries.length + 1)}_${Date.now().toString(36)}`, title: hd?.title ?? "Nouvelle entrée", sectionId: hd?.sectionId ?? "", href: hd ? `${hd.sectionId}.html` : "", chapterId: hd?.chapterId ?? "", level: 1 }); await save(); render(); } }), await versionPicker(ctx.storage, "toc-generation", "book", { onChange: () => ctx.refresh() }))), list));
  render();
}

// ── Lecture facile ────────────────────────────────────────────────────────
export async function renderEasyRead(ctx, container) {
  const cfg = ctx.config;
  const settings = h("div", { class: "card" }, h("div", { class: "card-body stack" }, h("h3", { style: { margin: 0 } }, "Réglages de la lecture facile"), switchRow("Activer la lecture facile", cfg.easy_read?.enabled !== false, (v) => patchBookConfig(ctx, { easy_read: { enabled: v } })), switchRow("Audio pour la lecture facile", cfg.easy_read?.tts !== false, (v) => patchBookConfig(ctx, { easy_read: { tts: v } })), field("Taille des lots", select([6, 12, 20, 30].map((n) => [n, `${n} textes par appel`]), cfg.easy_read?.batch_size ?? 12, { onChange: (v) => patchBookConfig(ctx, { easy_read: { batch_size: Number(v) } }), attrs: { style: "width:auto" } }))));
  container.appendChild(h("div", { class: "stack" }, settings, runCard(ctx, "easy-read")));
  if (prereqGuard(ctx, "easy-read", container)) return;
  const data = await ctx.storage.getNodeData("easy-read", "book");
  if (!data) return;
  const save = async () => { await ctx.storage.putNodeData("easy-read", "book", { ...data, generatedAt: nowIso() }); };
  let q = "";
  const list = h("div", { class: "stack" });
  const render = () => {
    list.innerHTML = "";
    for (const b of data.blocks) {
      const entries = b.entries.filter((e) => !q || e.originalText.toLowerCase().includes(q) || e.text.toLowerCase().includes(q));
      if (!entries.length) continue;
      list.appendChild(h("div", { class: "section-box" }, h("div", { class: "section-box-head" }, h("strong", {}, `Page ${b.pageNumber}`), badge(SECTION_TYPE_LABELS[b.sectionType] ?? b.sectionType, "accent"), h("span", { class: "mono muted small" }, b.sectionId), h("span", { class: "grow" }), button("Régénérer la section", { size: "sm", variant: "secondary", iconName: "sparkles", onClick: async () => { toast("Génération…"); try { const lang = languageContext(await bookLanguage(ctx.storage, ctx.config)); const res = await callLLM({ storage: ctx.storage, step: "easy-read", itemId: `${b.sectionId}/regen-${Date.now()}`, promptName: ctx.config.easy_read?.prompt ?? "easy_read", variables: { language: lang.name, language_code: lang.code, section_text: b.entries.map((e) => e.originalText).join("\n"), texts: b.entries.map((e, i) => ({ index: i + 1, text: e.originalText })) }, schema: SCHEMAS.easyRead, config: ctx.config, modelId: stepModel(ctx.config, "easy_read"), noCache: true, validate: (out) => (out.texts?.length === b.entries.length ? [] : ["nombre incohérent"]) }); b.entries.forEach((e, i) => { e.text = res.parsed.texts[i]; e.manual = false; }); await save(); render(); } catch (e) { toast(e.message, { kind: "error" }); } } })),
        h("div", { class: "section-box-body stack" }, entries.map((e) => h("div", { class: "split" }, h("div", { class: "small", style: { padding: "8px", background: "var(--bg-sunken)", borderRadius: "8px" } }, h("div", { class: "muted small mono" }, e.sourceId), e.originalText), h("div", {}, textarea({ value: e.text, rows: 3, onChange: async (ev) => { e.text = ev.target.value; e.manual = true; await save(); toast("Enregistré", { kind: "success", duration: 1000 }); } }), e.manual ? badge("Modifié", "warning") : null))))));
    }
  };
  container.appendChild(h("div", { class: "stack" }, h("div", { class: "row between row-wrap" }, h("h2", { style: { margin: 0 } }, `${data.blocks.reduce((n, b) => n + b.entries.length, 0)} textes adaptés`), h("div", { class: "row" }, textInput({ placeholder: "Rechercher…", onInput: (e) => { q = e.target.value.toLowerCase(); render(); } }), await versionPicker(ctx.storage, "easy-read", "book", { onChange: () => ctx.refresh() }))), list));
  render();
}
