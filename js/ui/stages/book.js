// Vue d'ensemble d'un livre : carte du livre, pipeline en phases, division en parties.
import { h, button, icon, badge, blobImg, toast, confirmDialog, dialog, textInput, field, kv, select } from "../dom.js";
import { PIPELINE, STAGES, STAGE_BY_NAME, STAGE_DESCRIPTIONS } from "../../pipeline.js";
import { STATUS_LABELS, runStages, cancelRun } from "../../pipeline/runner.js";
import { runButton, startStage } from "../screens/book-layout.js";
import { formatDuration, downloadBlob, formatDate } from "../../util.js";
import { exportProject } from "../../packaging/exports.js";
import { navigate } from "../../router.js";
import { languageName } from "../../config.js";

const PHASES = [
  { title: "Extraire", stages: ["extract"], connector: "Continuer" }, { title: "Sectionnement", stages: ["sectioning"], connector: "Continuer" }, { title: "Scénarimage", stages: ["storyboard"], connector: "Explorer" },
  { title: "Enrichissements (facultatifs)", stages: ["captions", "quizzes", "glossary", "toc", "easy-read"], optional: true, connector: "Puis" },
  { title: "Localisation", stages: ["translate", "speech"], connector: "Publier" }, { title: "Paquet", stages: ["package"] },
];

export async function renderBook(ctx, container) {
  const s = ctx.summary; const meta = await ctx.storage.getNodeData("metadata", "book"); const summary = await ctx.storage.getNodeData("book-summary", "book");
  const extraction = await ctx.storage.getNodeData("extraction", "book");
  const pdfRow = await ctx.storage.getBlobRow("source.pdf");
  const bookCard = h("div", { class: "card" }, h("div", { class: "card-body row", style: { gap: "18px", alignItems: "flex-start", flexWrap: "wrap" } },
    h("div", { class: "cover", style: { width: "120px", flex: "none" } }, s.coverPageId ? blobImg(ctx.storage.getImageBlob(`${s.coverPageId}_page`)) : h("span", {}, icon("book"))),
    h("div", { class: "grow stack", style: { gap: "6px" } }, h("span", { class: "muted small" }, "Votre livre"), h("h2", { style: { margin: 0 } }, s.title ?? ctx.label), h("div", { class: "muted small" }, [s.authors?.length ? s.authors.join(", ") : null, s.publisher, s.languageCode ? languageName(s.languageCode) : null, `${ctx.pages.length} pages${extraction?.pageCount && extraction.pageCount !== ctx.pages.length ? ` sur ${extraction.pageCount}` : ""}`].filter(Boolean).join(" · ")), summary?.summary ? h("p", { class: "small", style: { margin: "4px 0 0" } }, summary.summary) : null, h("div", { class: "row row-wrap" }, pdfRow ? button("Ouvrir le PDF", { size: "sm", variant: "secondary", iconName: "external", onClick: async () => { const b = await ctx.storage.getBlob("source.pdf"); window.open(URL.createObjectURL(b), "_blank"); } }) : null, button("Modifier les détails", { size: "sm", variant: "secondary", iconName: "edit", onClick: () => editDetails(ctx, meta) }), button("Exporter le projet (.zip)", { size: "sm", variant: "secondary", iconName: "download", onClick: async () => { toast("Préparation de l'archive…"); const r = await exportProject(ctx.label); downloadBlob(r.blob, r.filename); } }), button("Supprimer le livre", { size: "sm", variant: "ghost", iconName: "trash", onClick: async () => { if (await confirmDialog({ title: `Supprimer « ${s.title ?? ctx.label} » ?`, text: "Toutes les données extraites, les rendus, les audios et l'historique seront effacés de ce navigateur.", confirmLabel: "Supprimer", danger: true })) { await ctx.storage.deleteAll(); toast("Livre supprimé", { kind: "success" }); navigate("/library"); } } }))),
    h("div", { class: "callout", style: { maxWidth: "320px" } }, icon("info"), h("div", { class: "small" }, h("strong", {}, "Comment ça marche"), h("p", { style: { margin: "4px 0 0" } }, "Chaque phase produit des entités versionnées (jamais écrasées). Relancer une phase sert les appels d'IA inchangés depuis le cache. Vous pouvez exporter dès que le scénarimage est prêt.")))));
  const phases = h("div", { class: "stack", style: { gap: "4px" } });
  PHASES.forEach((ph, i) => {
    const allDone = ph.stages.every((st) => ctx.statuses[st]?.status === "done"); const anyDone = ph.stages.some((st) => ctx.statuses[st]?.status === "done");
    const cards = ph.stages.map((stName) => stageCard(ctx, stName));
    phases.appendChild(h("div", { class: "phase" }, h("div", { class: ["phase-num", allDone && "done"] }, allDone ? icon("check", "icon-sm") : i + 1), h("div", { class: "stack" }, h("div", { class: "row" }, h("strong", {}, `Phase ${i + 1} · ${ph.title}`), ph.optional ? badge("Facultatif") : null, anyDone && !allDone ? badge("Partiel", "warning") : null), ph.optional ? h("div", { class: "grid grid-2" }, cards) : cards)));
    if (i < PHASES.length - 1) phases.appendChild(h("div", { class: "row", style: { gap: "12px" } }, h("div", { class: "phase-line" }), h("span", { class: "muted small" }, ph.connector)));
  });
  const runAll = h("div", { class: "row row-wrap" }, button(ctx.run?.running ? "Annuler l'exécution" : "Tout lancer", { size: "lg", variant: ctx.run?.running ? "danger" : "primary", iconName: ctx.run?.running ? "x" : "zap", onClick: () => { if (ctx.run?.running) cancelRun(ctx.label); else runStages(ctx.label, "extract", "package", { allStages: true }).catch((e) => toast(e.message, { kind: "error" })); } }), h("span", { class: "muted small" }, "Exécute toutes les phases dans l'ordre, enrichissements compris."));
  container.appendChild(h("div", { class: "stack", style: { gap: "22px" } }, bookCard, await partsPanel(ctx), h("div", { class: "row between" }, h("h2", { style: { margin: 0 } }, "Pipeline"), runAll), phases));
}

export function stageCard(ctx, stageName) {
  const stage = STAGE_BY_NAME[stageName]; const ui = STAGES.find((x) => x.pipeline === stageName); const st = ctx.statuses[stageName];
  const kind = st?.status === "done" ? "success" : st?.status === "error" ? "danger" : st?.status === "running" ? "accent" : st?.status === "stale" ? "warning" : st?.status === "queued" ? "accent" : "muted";
  return h("div", { class: "stage-card" }, h("span", { class: "stage-icon", style: { background: ui?.hex } }, icon(ui?.icon ?? "layers")), h("div", { class: "grow" }, h("h3", {}, stage.label, badge(STATUS_LABELS[st?.status] ?? "Non démarré", kind), stageName === "storyboard" && st?.status === "done" ? badge("Exportable", "accent") : null), h("p", {}, STAGE_DESCRIPTIONS[ui?.slug] ?? ""), h("div", { class: "substeps" }, stage.steps.map((s) => h("span", { class: "pill" }, h("span", { class: ["status-dot", ctx.stepRuns[s.name]?.status ?? ""] }), s.label))), st?.status === "error" ? h("div", { class: "callout callout-danger small", style: { marginTop: "8px" } }, Object.values(st.steps).find((r) => r?.error)?.error) : null), h("div", { class: "col" }, runButton(ctx, stageName, { size: "sm" }), button(`Ouvrir`, { size: "sm", variant: "ghost", iconName: "arrow-right", onClick: () => ctx.go(ui?.slug ?? stageName) })));
}

async function editDetails(ctx, meta) {
  const m = { title: meta?.title ?? "", authors: (meta?.authors ?? []).join(", "), publisher: meta?.publisher ?? "", language_code: meta?.language_code ?? "", cover_page_number: meta?.cover_page_number ?? "" };
  dialog({ title: "Modifier les détails du livre", body: h("div", { class: "stack" }, field("Titre", textInput({ value: m.title, onInput: (e) => { m.title = e.target.value; } })), field("Auteurs (séparés par des virgules)", textInput({ value: m.authors, onInput: (e) => { m.authors = e.target.value; } })), field("Éditeur", textInput({ value: m.publisher, onInput: (e) => { m.publisher = e.target.value; } })), field("Langue d'origine (code)", textInput({ value: m.language_code, placeholder: "fr", onInput: (e) => { m.language_code = e.target.value.trim().toLowerCase(); } }), { hint: "Changer la langue invalide les traductions et audios déjà produits." }), field("Page de couverture (numéro)", textInput({ type: "number", value: m.cover_page_number, onInput: (e) => { m.cover_page_number = e.target.value; } }))),
    actions: [{ label: "Annuler", variant: "ghost" }, { label: "Enregistrer", onClick: async () => { await ctx.storage.putNodeData("metadata", "book", { ...(meta ?? { reasoning: "" }), title: m.title.trim() || null, authors: m.authors.split(",").map((s) => s.trim()).filter(Boolean), publisher: m.publisher.trim() || null, language_code: m.language_code || null, cover_page_number: m.cover_page_number ? Number(m.cover_page_number) : null, source: "manual" }); toast("Détails enregistrés", { kind: "success" }); ctx.refresh(); } }] });
}

/** Panneau « Diviser et fusionner » (coordinateur). */
export async function partsPanel(ctx) {
  const book = ctx.book; const total = ctx.pages.length;
  if (!book.config?.split_mode && !book.split) return null;
  const exported = book.split?.exported ?? []; const merged = book.split?.mergedRanges ?? [];
  const covered = new Set(); for (const e of exported) for (let p = e.startPage; p <= e.endPage; p++) covered.add(p);
  const mergedSet = new Set(); for (const e of merged) for (let p = e.startPage; p <= e.endPage; p++) mergedSet.add(p);
  const bar = h("div", { class: "row", style: { gap: "2px", height: "12px" } }, ctx.pages.map((p) => h("span", { title: `Page ${p.pageNumber}`, style: { flex: 1, borderRadius: "2px", background: mergedSet.has(p.pageNumber) ? "var(--success)" : covered.has(p.pageNumber) ? "var(--warning)" : "var(--border-strong)" } })));
  let n = 3; let mode = "equal"; let range = { startPage: 1, endPage: Math.min(total, Math.ceil(total / 3)) };
  const nextGap = () => { for (let p = 1; p <= total; p++) if (!covered.has(p)) { let e = p; while (e + 1 <= total && !covered.has(e + 1) && e - p < Math.ceil(total / n) - 1) e++; return { startPage: p, endPage: e }; } return null; };
  const gap = nextGap(); if (gap) range = gap;
  const controls = h("div", { class: "stack" });
  const renderControls = () => { controls.innerHTML = ""; controls.appendChild(h("div", { class: "row row-wrap" }, select([["equal", "Fenêtres égales"], ["custom", "Plage personnalisée"]], mode, { onChange: (v) => { mode = v; renderControls(); }, attrs: { style: "width:auto" } }), mode === "equal" ? field("Diviser en", select([2, 3, 4, 5, 6, 8, 10].map((x) => [x, `${x} parties`]), n, { onChange: (v) => { n = Number(v); const g = nextGap(); if (g) range = g; renderControls(); }, attrs: { style: "width:auto" } })) : null, field("De la page", textInput({ type: "number", min: 1, max: total, value: range.startPage, style: "width:90px", onInput: (e) => { range.startPage = Number(e.target.value); } })), field("à la page", textInput({ type: "number", min: 1, max: total, value: range.endPage, style: "width:90px", onInput: (e) => { range.endPage = Number(e.target.value); } })), button("Télécharger la partie", { iconName: "folder-down", onClick: async () => { if (range.startPage < 1 || range.endPage > total || range.endPage < range.startPage) return toast("Plage invalide", { kind: "error" }); toast("Préparation de la partie…"); const r = await exportProject(ctx.label, { pageRange: { ...range } }); downloadBlob(r.blob, r.filename); const split = { ...(book.split ?? {}), totalPages: total, exported: [...exported.filter((e) => !(e.startPage === range.startPage && e.endPage === range.endPage)), { ...range, at: new Date().toISOString() }] }; await ctx.storage.updateBook({ split }); ctx.refresh(); } }))); };
  renderControls();
  return h("div", { class: "card" }, h("div", { class: "card-body stack" }, h("div", { class: "row between" }, h("h3", { style: { margin: 0 } }, icon("scissors", "icon-sm"), " Diviser et fusionner"), badge(`${mergedSet.size}/${total} pages fusionnées`, mergedSet.size === total ? "success" : "muted")), bar, h("div", { class: "row row-wrap small muted" }, h("span", { class: "row" }, h("span", { class: "status-dot done" }), "Fusionnée"), h("span", { class: "row" }, h("span", { class: "status-dot stale" }), "Confiée à un contributeur"), h("span", { class: "row" }, h("span", { class: "status-dot" }), "Non divisée")), exported.length ? h("div", { class: "substeps" }, exported.map((e) => h("span", { class: "pill" }, `p. ${e.startPage}–${e.endPage}`, " · ", formatDate(e.at)))) : null, controls, h("div", { class: "row" }, button("Importer une partie renvoyée (.zip)", { variant: "secondary", iconName: "upload", onClick: () => navigate("/books/import", { query: { merge: ctx.label } }) }), mergedSet.size === total && total ? button("Régénérer le résumé du livre", { variant: "ghost", onClick: () => runStages(ctx.label, "extract", "extract", { onlySteps: ["book-summary"] }) }) : null)));
}
