// Vues « Vidéo », « Validation », « Aperçu » et « Exporter ».
import { h, button, icon, badge, toast, dialog, confirmDialog, segmented, switchRow, select, textarea, textInput, field, progressBar, tabs, kv } from "../dom.js";
import { runCard, prereqGuard, patchBookConfig, versionPicker, viewportToggle, startStage } from "./common.js";
import { outputLanguages } from "../../pipeline/steps/translate.js";
import { loadPackageFiles, buildWebPackage, storePackage, safeJson } from "../../packaging/web.js";
import { exportAdtZip, exportScormZip, exportWebpub, exportEpub, exportPnld, exportProject } from "../../packaging/exports.js";
import { buildAssetMap, revokeAssetMap, IMPACT_LABELS, DEFAULT_RUN_ONLY } from "../../a11y/assess.js";
import { REVIEWER_CATALOG, REVIEW_STATUSES } from "../../a11y/reviewer.js";
import { runStages } from "../../pipeline/runner.js";
import { downloadBlob, nowIso, uuid, pickFile, formatBytes, formatDate } from "../../util.js";
import { languageName } from "../../config.js";

// ── Vidéo ─────────────────────────────────────────────────────
export async function renderSignLanguage(ctx, container) {
  const node = (await ctx.storage.getNodeData("sign-language", "book")) ?? { assignments: {}, videos: [] };
  const videos = await ctx.storage.listBlobs("sign/");
  const sections = [];
  for (const p of ctx.pages) { const s = await ctx.storage.getNodeData("page-sectioning", p.pageId); for (const sec of s?.sections ?? []) if (!sec.isPruned) sections.push({ id: sec.sectionId, label: `Page ${p.pageNumber} · ${sec.sectionId}` }); }
  const glossary = ((await ctx.storage.getNodeData("glossary", "book"))?.items ?? []).filter((g) => !g.pruned).map((g) => ({ id: g.id, label: `Glossaire · ${g.word}` }));
  const targets = [...sections, ...glossary];
  const covered = Object.keys(node.assignments).filter((k) => videos.some((v) => v.key === node.assignments[k]));
  let filter = "all";
  const save = async () => { await ctx.storage.putNodeData("sign-language", "book", { ...node, generatedAt: nowIso() }); };
  const list = h("div", { class: "stack", style: { gap: "4px" } });
  const render = () => {
    list.innerHTML = "";
    for (const t of targets.filter((t) => filter === "all" || (filter === "covered" ? node.assignments[t.id] : !node.assignments[t.id]))) list.appendChild(h("div", { class: "row", style: { borderBottom: "1px solid var(--border)", padding: "6px 0" } }, h("span", { class: "grow small" }, t.label), node.assignments[t.id] ? badge("Couverte", "success") : badge("Manquante", "muted"), select([["", "— aucune vidéo —"], ...videos.map((v) => [v.key, v.name ?? v.key.slice(5)])], node.assignments[t.id] ?? "", { onChange: async (v) => { if (v) node.assignments[t.id] = v; else delete node.assignments[t.id]; await save(); render(); }, attrs: { style: "width:260px" } }), node.assignments[t.id] ? button("", { size: "sm", variant: "ghost", iconName: "play", title: "Lire", onClick: async () => { const b = await ctx.storage.getBlob(node.assignments[t.id]); dialog({ title: t.label, body: h("video", { src: URL.createObjectURL(b), controls: true, style: "width:100%" }) }); } }) : null));
  };
  container.appendChild(h("div", { class: "stack" },
    h("div", { class: "card" }, h("div", { class: "card-body stack" }, h("div", { class: "row between row-wrap" }, h("h3", { style: { margin: 0 } }, `Couverture : ${covered.length}/${targets.length} sections`), h("div", { class: "row" }, button("Ajouter des vidéos", { iconName: "upload", onClick: async () => { const fs = await pickFile({ accept: "video/mp4,video/webm", multiple: true }); for (const f of fs ?? []) await ctx.storage.putBlob(`sign/${uuid()}`, f, { name: f.name }); toast(`${(fs ?? []).length} vidéo(s) ajoutée(s)`, { kind: "success" }); ctx.refresh(); } }), button("Section manquante suivante", { variant: "secondary", size: "sm", onClick: () => { filter = "missing"; render(); } }))), progressBar(targets.length ? covered.length / targets.length : 0, "Couverture"), h("p", { class: "muted small" }, "Téléversez des vidéos (MP4/WebM) puis associez-les aux sections ou aux termes du glossaire. Elles s'affichent dans le lecteur en incrustation déplaçable."))),
    videos.length ? h("div", { class: "card" }, h("div", { class: "card-body stack" }, h("h3", { style: { margin: 0 } }, `${videos.length} vidéo(s)`), h("div", { class: "row row-wrap" }, videos.map((v) => h("span", { class: "chip" }, v.name ?? v.key.slice(5), h("span", { class: "muted" }, ` ${formatBytes(v.size)}`), h("button", { type: "button", "aria-label": "Supprimer", onClick: async () => { await ctx.storage.deleteBlob(v.key); for (const k of Object.keys(node.assignments)) if (node.assignments[k] === v.key) delete node.assignments[k]; await save(); ctx.refresh(); } }, icon("x", "icon-sm"))))), button("Tout retirer", { size: "sm", variant: "ghost", onClick: async () => { if (await confirmDialog({ title: "Retirer toutes les vidéos ?", confirmLabel: "Retirer", danger: true })) { for (const v of videos) await ctx.storage.deleteBlob(v.key); node.assignments = {}; await save(); ctx.refresh(); } } }))) : null,
    h("div", { class: "card" }, h("div", { class: "card-body stack" }, h("div", { class: "row between" }, h("h3", { style: { margin: 0 } }, "Affectation par section"), segmented([["all", "Toutes"], ["covered", "Couvertes"], ["missing", "Manquantes"]], filter, (v) => { filter = v; render(); })), list))));
  render();
}

// ── Validation ────────────────────────────────────────────────────────────
export async function renderValidation(ctx, container) {
  const report = await ctx.storage.getNodeData("accessibility-assessment", "book");
  const tab = ctx.query.tab ?? "a11y";
  container.appendChild(tabs([{ key: "a11y", label: "Résumé d'accessibilité", badge: report?.summary.violationCount }, { key: "reviewer", label: "Validation par réviseur" }], tab, (k) => ctx.go("validation", null, { tab: k })));
  if (tab === "reviewer") return renderReviewerSummary(ctx, container);
  container.appendChild(h("div", { class: "row between row-wrap" }, h("p", { class: "muted", style: { margin: 0 } }, "Analyse automatique (axe-core, règles WCAG 2.1 A/AA + bonnes pratiques) de chaque page du paquet web."), button("Rafraîchir la validation", { iconName: "refresh", onClick: () => runStages(ctx.label, "package", "package", { onlySteps: ["accessibility-assessment"] }) })));
  if (!report) { container.appendChild(h("div", { class: "empty" }, h("h3", {}, "Aucune évaluation"), h("p", { class: "muted" }, "Empaquetez le livre (étape « Aperçu ») : l'évaluation d'accessibilité s'exécute automatiquement après."), button("Empaqueter et évaluer", { iconName: "play", onClick: () => startStage(ctx, "package") }))); return; }
  const s = report.summary;
  const tile = (l, v, cls) => h("div", { class: "card" }, h("div", { class: "card-body" }, h("div", { class: "muted small" }, l), h("div", { class: cls, style: { fontSize: "22px", fontWeight: 700 } }, v)));
  container.appendChild(h("div", { class: "grid grid-3" }, tile("Pages analysées", s.pageCount), tile("Pages avec problèmes", s.pagesWithViolations, s.pagesWithViolations ? "a11y-impact-serious" : ""), tile("Problèmes", s.violationCount, s.violationCount ? "a11y-impact-critical" : ""), ...Object.entries(IMPACT_LABELS).map(([k, l]) => tile(l, s.byImpact?.[k] ?? 0, `a11y-impact-${k}`)), tile("Revue manuelle", s.incompleteCount)));
  const byRule = new Map();
  for (const p of report.pages) for (const v of p.violations) { const r = byRule.get(v.id) ?? { ...v, pages: new Set(), count: 0 }; r.pages.add(p.href); r.count += v.nodes.length; byRule.set(v.id, r); }
  const rules = [...byRule.values()].sort((a, b) => b.count - a.count);
  container.appendChild(h("div", { class: "stack" }, h("h3", {}, "Problèmes par règle"), rules.length ? rules.map((r) => h("details", { class: "acc" }, h("summary", {}, badge(IMPACT_LABELS[r.impact] ?? r.impact ?? "—", r.impact === "critical" || r.impact === "serious" ? "danger" : "warning"), " ", h("strong", {}, r.help), h("span", { class: "muted small" }, ` · ${r.count} occurrence(s) sur ${r.pages.size} page(s)`)), h("p", { class: "small" }, r.description, " ", h("a", { href: r.helpUrl, target: "_blank", rel: "noopener" }, "Documentation", icon("external", "icon-sm"))), h("div", { class: "row row-wrap" }, [...r.pages].slice(0, 30).map((href) => badge(href))), h("ul", { class: "small" }, r.nodes.slice(0, 5).map((n) => h("li", {}, h("code", {}, n.target.join(" ")), n.failureSummary ? h("div", { class: "muted" }, n.failureSummary) : null))))) : h("div", { class: "callout callout-success" }, icon("check"), "Aucun problème détecté automatiquement."),
    h("h3", {}, "Pages"), h("table", { class: "table" }, h("thead", {}, h("tr", {}, ["Page", "Problèmes", "Revue manuelle", "Réussites", ""].map((c) => h("th", {}, c)))), h("tbody", {}, report.pages.map((p) => h("tr", {}, h("td", {}, p.href, p.pageNumber != null ? h("span", { class: "muted small" }, ` (p. ${p.pageNumber})`) : null, p.error ? badge("erreur", "danger") : null), h("td", { class: p.violationCount ? "a11y-impact-serious" : "" }, p.violationCount), h("td", {}, p.incompleteCount), h("td", {}, p.passCount), h("td", {}, button("Aperçu", { size: "sm", variant: "ghost", onClick: () => ctx.go("preview", null, { page: p.sectionId }) }))))))));
  container.appendChild(h("p", { class: "muted small" }, `Généré le ${formatDate(report.generatedAt)} · ${report.tool} · étiquettes : ${report.runOnlyTags.join(", ")}`));
}

async function renderReviewerSummary(ctx, container) {
  const sessions = await ctx.storage.listNodeItems("reviewer-session");
  const records = await ctx.storage.listNodeItems("reviewer-page");
  container.appendChild(h("div", { class: "stack" }, h("p", { class: "muted" }, "La validation par réviseur se fait page par page depuis l'étape « Aperçu » (fiche à droite du lecteur). Ce résumé agrège les sessions."), sessions.length ? sessions.map((s) => { const recs = records.filter((r) => r.data.session_id === s.itemId); const results = recs.flatMap((r) => r.data.results ?? []); const fails = results.filter((r) => r.status === "needs-changes"); return h("div", { class: "card" }, h("div", { class: "card-body stack" }, h("div", { class: "row between" }, h("strong", {}, s.data.reviewer_name ?? "Réviseur"), h("span", { class: "muted small" }, formatDate(s.data.started_at))), kv([["Institution", s.data.institution], ["Pages revues", recs.length], ["Critères évalués", results.filter((r) => r.status !== "not-reviewed").length], ["Modifications nécessaires", fails.length], ["Commentaires", s.data.comments]]), fails.length ? h("details", { class: "acc" }, h("summary", {}, `${fails.length} constat(s)`), h("ul", { class: "small" }, fails.map((f) => h("li", {}, h("strong", {}, f.criterion_label ?? f.criterion_id), f.page_href ? h("span", { class: "muted" }, ` (${f.page_href})`) : null, f.comment ? h("div", {}, f.comment) : null, f.suggested_modification ? h("div", { class: "muted" }, "Suggestion : ", f.suggested_modification) : null)))) : null, button("Exporter la session (JSON)", { size: "sm", variant: "secondary", iconName: "download", onClick: () => downloadBlob(new Blob([JSON.stringify({ session: s.data, pages: recs.map((r) => r.data) }, null, 1)], { type: "application/json" }), `${ctx.label}-validation-${s.itemId}.json`) }))); }) : h("div", { class: "empty" }, h("h3", {}, "Aucune session de validation"), button("Ouvrir l'aperçu", { onClick: () => ctx.go("preview") }))));
}

// ── Aperçu ────────────────────────────────────────────────────────────────
let currentAssetMap = null;
export async function renderPreview(ctx, container) {
  const pkg = await ctx.storage.getNodeData("package-web", "book");
  const head = h("div", { class: "row between row-wrap" }, h("div", {}, h("h2", { style: { margin: 0 } }, "Aperçu de l'ADT"), pkg ? h("span", { class: "muted small" }, `Empaqueté le ${formatDate(pkg.generatedAt)} · ${pkg.stats.pages} pages · ${pkg.stats.files} fichiers · ${formatBytes(pkg.stats.bytes)} · ${pkg.stats.languages.map(languageName).join(", ")}`) : null), h("div", { class: "row" }, runCardCompact(ctx)));
  container.appendChild(head);
  if (pkg?.warnings?.length) container.appendChild(h("details", { class: "acc" }, h("summary", {}, `${pkg.warnings.length} avertissement(s) d'empaquetage`), h("ul", { class: "small" }, pkg.warnings.map((w) => h("li", {}, w)))));
  if (!pkg) { container.appendChild(h("div", { class: "empty" }, h("h3", {}, "Aucun paquet"), h("p", { class: "muted" }, "L'empaquetage assemble pages, données par langue, audios et lecteur dans une application web autonome."), button("Empaqueter maintenant", { iconName: "package", disabled: ctx.statuses.storyboard?.status !== "done", onClick: () => startStage(ctx, "package") }), ctx.statuses.storyboard?.status !== "done" ? h("p", { class: "muted small" }, "Le scénarimage doit être terminé.") : null)); return; }
  const files = await loadPackageFiles(ctx.storage);
  if (currentAssetMap) revokeAssetMap(currentAssetMap);
  currentAssetMap = buildAssetMap(files);
  const pages = JSON.parse(await files.get("content/pages.json").text());
  let current = ctx.query.page ?? pages[0]?.section_id; let viewport = "desktop";
  const frame = h("iframe", { class: "preview-frame", title: "Aperçu du livre", style: { minHeight: "720px", height: "78vh" }, sandbox: "allow-scripts allow-same-origin allow-forms allow-popups" });
  const load = async () => {
    const item = pages.find((p) => p.section_id === current) ?? pages[0]; if (!item) return;
    const html = await files.get(item.href).text();
    const inline = {}; for (const [p, v] of files) if (p.endsWith(".json") || p.endsWith(".html")) inline[p] = await v.text();
    const injected = html.replace(/<script src="assets\/offline-preloader.js"><\/script>/, () => `<script>window.__ADT_ASSET_MAP=${safeJson(currentAssetMap)};window.__ADT_INLINE=${safeJson(inline)};</script>`).replace(/(href|src)="(assets\/[^"]+|content\/[^"]+|images\/[^"]+|manifest\.json)"/g, (m, a, p) => currentAssetMap[p] ? `${a}="${currentAssetMap[p]}"` : m);
    frame.srcdoc = injected;
  };
  frame.addEventListener("load", () => { try { frame.contentWindow.addEventListener("adt:page-changed", (e) => { current = e.detail.sectionId; sel.value = current; }); frame.contentDocument.addEventListener("adt:page-changed", (e) => { current = e.detail.sectionId; sel.value = current; reviewerPanel.dataset.page = current; renderReviewer(); }); } catch { /* ignore */ } });
  const sel = select(pages.map((p, i) => [p.section_id, `${i + 1}. ${p.section_id}${p.page_number != null ? ` (p. ${p.page_number})` : ""}`]), current, { onChange: (v) => { current = v; load(); renderReviewer(); }, attrs: { style: "width:auto;max-width:280px" } });
  const toolbar = h("div", { class: "row row-wrap between" }, h("div", { class: "row" }, sel, viewportToggle(viewport, (v) => { viewport = v; wrap.className = `viewport-${v}`; })), h("div", { class: "row" }, button("Ouvrir dans un onglet", { size: "sm", variant: "secondary", iconName: "external", onClick: () => { const w = window.open("", "_blank"); w.document.write(frame.srcdoc); w.document.close(); } }), button("Exporter", { size: "sm", iconName: "file-down", onClick: () => ctx.go("export") })));
  const wrap = h("div", { class: `viewport-${viewport}` }, frame);
  const reviewerPanel = h("div", { class: "stack" });
  const renderReviewer = () => reviewerCard(ctx, reviewerPanel, current, pages);
  container.appendChild(h("div", { class: "stack" }, toolbar, h("div", { class: "two-pane", style: { gridTemplateColumns: "1fr 340px" } }, wrap, h("div", { class: "stack" }, await a11yCard(ctx, () => current), reviewerPanel))));
  await load(); renderReviewer();
}
function runCardCompact(ctx) { const st = ctx.statuses.package; return h("div", { class: "row" }, badge(st?.status === "done" ? "Paquet à jour" : st?.status === "stale" ? "À mettre à jour" : st?.status === "running" ? "Empaquetage…" : "Non empaqueté", st?.status === "done" ? "success" : st?.status === "stale" ? "warning" : "muted"), button(st?.status === "done" ? "Ré-empaqueter" : "Empaqueter", { size: "sm", iconName: "package", disabled: ctx.run?.running, onClick: () => startStage(ctx, "package", { skipConfirm: true }) })); }
async function a11yCard(ctx, getCurrent) {
  const report = await ctx.storage.getNodeData("accessibility-assessment", "book");
  const box = h("div", { class: "card" });
  const render = () => { box.innerHTML = ""; const p = report?.pages.find((x) => x.sectionId === getCurrent()); box.appendChild(h("div", { class: "card-body stack" }, h("h3", { style: { margin: 0 } }, "Accessibilité de cette page"), !report ? h("p", { class: "muted small" }, "Aucune évaluation.") : !p ? h("p", { class: "muted small" }, "Page non évaluée.") : h("div", { class: "stack" }, h("div", { class: "row" }, badge(`${p.violationCount} problème(s)`, p.violationCount ? "danger" : "success"), badge(`${p.incompleteCount} à vérifier`, "muted")), p.violations.slice(0, 6).map((v) => h("div", { class: "small" }, badge(IMPACT_LABELS[v.impact] ?? "—", "warning"), " ", v.help))), button("Voir le rapport complet", { size: "sm", variant: "ghost", onClick: () => ctx.go("validation") }))); };
  render(); box.refresh = render; return box;
}
async function reviewerCard(ctx, panel, sectionId, pages) {
  panel.innerHTML = "";
  const cfg = ctx.config.reviewer_validation ?? {};
  if (cfg.enabled === false) { panel.appendChild(h("div", { class: "card" }, h("div", { class: "card-body" }, h("p", { class: "muted small" }, "Validation par réviseur désactivée (Paramètres → Validation).")))); return; }
  const catalog = { ...REVIEWER_CATALOG, ...(cfg.catalog ?? {}) };
  let sessionId = ctx.query.session ?? sessionStorage.getItem(`adt:review:${ctx.label}`);
  const sessions = await ctx.storage.listNodeItems("reviewer-session");
  const body = h("div", { class: "card-body stack" });
  panel.appendChild(h("div", { class: "card" }, body));
  if (!sessionId || !sessions.some((s) => s.itemId === sessionId)) {
    const data = {};
    body.appendChild(h("h3", { style: { margin: 0 } }, "Validation par réviseur"));
    body.appendChild(h("p", { class: "muted small" }, catalog.instructions[0].body));
    for (const f of catalog.identification_fields) body.appendChild(field(f.label + (f.required ? " *" : ""), f.type === "textarea" ? textarea({ rows: 2, onInput: (e) => { data[f.id] = e.target.value; } }) : textInput({ type: f.type === "number" ? "number" : f.type === "date" ? "date" : "text", onInput: (e) => { data[f.id] = e.target.value; } }), { hint: f.description }));
    body.appendChild(h("div", { class: "row" }, button("Démarrer la session", { onClick: async () => { if (!data["reviewer-name"]) return toast("Le nom du réviseur est requis", { kind: "warning" }); const id = uuid(); await ctx.storage.putNodeData("reviewer-session", id, { session_id: id, reviewer_name: data["reviewer-name"], institution: data.institution, start_page: data["start-page"], end_page: data["end-page"], start_date: data["start-date"], end_date: data["end-date"], comments: data.comments, started_at: nowIso() }); sessionStorage.setItem(`adt:review:${ctx.label}`, id); reviewerCard(ctx, panel, sectionId, pages); } }), sessions.length ? select([["", "Reprendre une session…"], ...sessions.map((s) => [s.itemId, `${s.data.reviewer_name} · ${formatDate(s.data.started_at)}`])], "", { onChange: (v) => { if (v) { sessionStorage.setItem(`adt:review:${ctx.label}`, v); reviewerCard(ctx, panel, sectionId, pages); } }, attrs: { style: "width:auto" } }) : null));
    return;
  }
  const session = sessions.find((s) => s.itemId === sessionId).data;
  const page = pages.find((p) => p.section_id === sectionId);
  const recKey = `${sessionId}:${sectionId}`;
  const rec = (await ctx.storage.getNodeData("reviewer-page", recKey)) ?? { session_id: sessionId, page_id: sectionId.split("_")[0], page_number: page?.page_number, href: page?.href, results: [], overall_comment: "" };
  const resMap = new Map(rec.results.map((r) => [r.criterion_id, r]));
  body.appendChild(h("div", { class: "row between" }, h("h3", { style: { margin: 0 } }, "Fiche de validation"), button("Terminer", { size: "sm", variant: "ghost", onClick: () => { sessionStorage.removeItem(`adt:review:${ctx.label}`); reviewerCard(ctx, panel, sectionId, pages); } })));
  body.appendChild(h("p", { class: "muted small" }, `${session.reviewer_name} · ${page?.href ?? sectionId}`));
  let defaultNa = false;
  body.appendChild(switchRow("N/A par défaut", defaultNa, (v) => { defaultNa = v; }));
  const scroll = h("div", { class: "scroll-y stack", style: { maxHeight: "50vh" } });
  for (const sec of catalog.sections) {
    const det = h("details", { class: "acc" }, h("summary", {}, sec.label, " ", badge(`${sec.criteria.filter((c) => resMap.get(c.id)?.status && resMap.get(c.id).status !== "not-reviewed").length}/${sec.criteria.length}`)));
    for (const c of sec.criteria) {
      const r = resMap.get(c.id) ?? { criterion_id: c.id, status: "not-reviewed" }; resMap.set(c.id, r);
      const extra = h("div", { class: "stack", hidden: r.status !== "needs-changes" }, textarea({ value: r.comment ?? "", rows: 2, placeholder: "Commentaire (requis)", onInput: (e) => { r.comment = e.target.value; } }), c.requires_suggested_modification_on_failure ? textarea({ value: r.suggested_modification ?? "", rows: 2, placeholder: "Modification suggérée (requise)", onInput: (e) => { r.suggested_modification = e.target.value; } }) : null);
      det.appendChild(h("div", { class: "stack", style: { gap: "4px", padding: "6px 0", borderBottom: "1px solid var(--border)" } }, h("div", { class: "small", title: c.guidance }, c.label), segmented([["pass", "Réussite"], ["needs-changes", "À modifier"], ["not-applicable", "N/A"]], r.status, (v) => { r.status = v; r.criterion_label = c.label; r.page_href = page?.href; extra.hidden = v !== "needs-changes"; }), extra));
    }
    scroll.appendChild(det);
  }
  body.appendChild(scroll);
  body.appendChild(field("Remarque générale sur la page", textarea({ value: rec.overall_comment ?? "", rows: 2, onInput: (e) => { rec.overall_comment = e.target.value; } })));
  body.appendChild(h("div", { class: "row" }, button("Enregistrer la revue de la page", { iconName: "check", onClick: async () => { rec.results = [...resMap.values()].map((r) => (defaultNa && r.status === "not-reviewed" ? { ...r, status: "not-applicable" } : r)); const missing = rec.results.filter((r) => r.status === "needs-changes" && !r.comment?.trim()); if (missing.length) return toast(`${missing.length} constat(s) sans commentaire`, { kind: "warning" }); rec.reviewed_count = rec.results.filter((r) => r.status !== "not-reviewed").length; rec.criteria_count = rec.results.length; rec.updated_at = nowIso(); await ctx.storage.putNodeData("reviewer-page", recKey, rec); toast("Revue enregistrée", { kind: "success" }); } }), h("span", { class: "muted small" }, `${rec.reviewed_count ?? 0} critères déjà évalués`)));
}

// ── Exporter ───────────────────────────────────────────────────────────────
export async function renderExport(ctx, container) {
  const pkg = await ctx.storage.getNodeData("package-web", "book");
  const title = pkg?.title ?? ctx.summary.title ?? ctx.label;
  const langs = await outputLanguages(ctx.storage, ctx.config);
  const opts = (await ctx.storage.getNodeData("package-options", "book")) ?? { features: { glossary: true, quizzes: true, readAloud: true, signLanguage: true, easyRead: true, captions: true, toc: true, activities: true, notepad: false, eli5: false }, languages: langs, defaultSettings: ctx.config.default_settings ?? {}, lockedSettings: ctx.config.locked_settings ?? [] };
  const saveOpts = async () => { await ctx.storage.putNodeData("package-options", "book", opts); };
  const formats = [
    { id: "adt", title: "Export web (recommandé)", desc: "Application web autonome : HTML, CSS, JS, images, audios. Fonctionne hors ligne, se dépose sur tout hébergement statique.", icon: "monitor", run: () => exportAdtZip(ctx.storage, title) },
    { id: "project", title: ctx.book.part ? "Partie terminée (à renvoyer)" : "Archive du projet", desc: ctx.book.part ? "Archive .zip de cette partie à renvoyer au coordinateur pour fusion." : "Toutes les données du livre (PDF, extraction, versions, audios, journaux) pour sauvegarde ou reprise dans ADT Studio.", icon: "package", run: () => exportProject(ctx.label, ctx.book.part ? { pageRange: ctx.book.part.range, partOf: ctx.book.part.sourceLabel } : {}) },
    { id: "scorm", title: "SCORM 1.2", desc: "Paquet web avec manifeste IMS et adaptateur SCORM : dépôt direct dans un LMS (Moodle, Canvas…). Suit la progression des activités.", icon: "shield-check", run: () => exportScormZip(ctx.storage, title) },
    { id: "webpub", title: "Readium Web Publication", desc: "Manifeste .webpub conforme à Readium, avec ordre de lecture, table des matières et métadonnées d'accessibilité.", icon: "book-open", run: () => exportWebpub(ctx.storage, title) },
    { id: "epub", title: "EPUB 3", desc: "EPUB 3 avec overlays SMIL (lecture synchronisée), glossaire (popups ou pages), navigation et métadonnées d'accessibilité.", icon: "book", run: () => exportEpub(ctx.storage, title, { glossaryMode: ctx.config.epub_glossary?.mode ?? "word", placements: ctx.config.epub_glossary?.page_placements ?? ["end"] }) },
    { id: "pnld", title: "PNLD / FNDE (bêta)", desc: "Structure « obra digital » du programme brésilien PNLD : content/, resources/, OPF et NCX.", icon: "layers", run: () => exportPnld(ctx.storage, title) },
  ];
  const featureLabels = { glossary: "Glossaire", quizzes: "Quiz", readAloud: "Lecture audio", signLanguage: "Vidéos (langue des signes ou autres)", easyRead: "Lecture facile", captions: "Légendes d'images", toc: "Table des matières", activities: "Activités interactives", notepad: "Bloc-notes", eli5: "Explique-moi simplement" };
  const dl = h("div", { class: "field" }, h("span", { class: "field-label" }, "Barre d'outils du lecteur"), h("div", { class: "row row-wrap" }, segmented([["compact", "Compacte"], ["full", "Pleine largeur"]], opts.defaultSettings.dock_layout?.width ?? "full", (v) => { (opts.defaultSettings.dock_layout ??= {}).width = v; saveOpts(); }), segmented([["top", "Haut"], ["bottom", "Bas"]], opts.defaultSettings.dock_layout?.position ?? "bottom", (v) => { (opts.defaultSettings.dock_layout ??= {}).position = v; saveOpts(); }), segmented([["center", "Centrée"], ["spread", "Étalée"]], opts.defaultSettings.dock_layout?.align ?? "spread", (v) => { (opts.defaultSettings.dock_layout ??= {}).align = v; saveOpts(); })));
  const options = h("div", { class: "card" }, h("div", { class: "card-body stack" }, h("h3", { style: { margin: 0 } }, "Options d'exportation"),
    h("div", { class: "field" }, h("span", { class: "field-label" }, "Fonctionnalités incluses"), h("div", { class: "grid grid-2" }, Object.entries(featureLabels).map(([k, l]) => { const speechOff = k === "readAloud" && ctx.config.speech?.enabled === false; return switchRow(l, speechOff ? false : opts.features[k] !== false, (v) => { opts.features[k] = v; saveOpts(); }, { disabled: speechOff, hint: speechOff ? "Module Parole désactivé pour ce livre (réglages de l'étape Parole)." : undefined }); }))),
    h("div", { class: "field" }, h("span", { class: "field-label" }, "Langues de sortie (la première est la langue par défaut)"), h("div", { class: "row row-wrap" }, langs.map((l) => switchRow(languageName(l), opts.languages.includes(l), (v) => { opts.languages = v ? langs.filter((x) => opts.languages.includes(x) || x === l) : opts.languages.filter((x) => x !== l); saveOpts(); })))),
    dl,
    h("div", { class: "row row-wrap" }, field("Thème", select([["system", "Système"], ["light", "Clair"], ["dark", "Sombre"]], opts.defaultSettings.theme ?? "system", { onChange: (v) => { opts.defaultSettings.theme = v; saveOpts(); } })), field("Taille des icônes", select([["sm", "Petites"], ["md", "Moyennes"], ["lg", "Grandes"]], opts.defaultSettings.icon_size ?? "md", { onChange: (v) => { opts.defaultSettings.icon_size = v; saveOpts(); } })), switchRow("Réduire les animations", !!opts.defaultSettings.reduce_motion, (v) => { opts.defaultSettings.reduce_motion = v; saveOpts(); })),
    h("div", { class: "field" }, h("span", { class: "field-label" }, "Réglages verrouillés (masqués au lecteur)"), h("div", { class: "row row-wrap" }, [["dockLayout", "Barre d'outils"], ["theme", "Thème"], ["iconSize", "Taille des icônes"], ["reduceMotion", "Animations"]].map(([k, l]) => switchRow(l, opts.lockedSettings.includes(k), (v) => { opts.lockedSettings = v ? [...new Set([...opts.lockedSettings, k])] : opts.lockedSettings.filter((x) => x !== k); saveOpts(); })))),
    h("div", { class: "field" }, h("span", { class: "field-label" }, "Glossaire EPUB"), h("div", { class: "row row-wrap" }, segmented([["word", "Définitions contextuelles"], ["page", "Pages de glossaire"], ["both", "Les deux"]], ctx.config.epub_glossary?.mode ?? "word", (v) => patchBookConfig(ctx, { epub_glossary: { mode: v } })))),
    h("div", { class: "row" }, button("Appliquer et ré-empaqueter", { iconName: "package", disabled: ctx.run?.running || ctx.statuses.storyboard?.status !== "done", onClick: async () => { await saveOpts(); runStages(ctx.label, "package", "package", { packageOptions: opts }); } }), h("span", { class: "muted small" }, "Les options s'appliquent au prochain empaquetage."))));
  const status = h("div");
  const grid = h("div", { class: "grid grid-2" }, formats.map((f) => h("div", { class: "stage-card" }, h("span", { class: "stage-icon", style: { background: "#4338ca" } }, icon(f.icon)), h("div", { class: "grow" }, h("h3", {}, f.title), h("p", {}, f.desc)), button("Télécharger", { size: "sm", iconName: "download", disabled: f.id !== "project" && !pkg, onClick: async () => { status.innerHTML = ""; status.appendChild(h("div", { class: "spinner-wrap" }, h("span", { class: "spinner" }), `Préparation : ${f.title}…`)); try { const r = await f.run(); downloadBlob(r.blob, r.filename); status.innerHTML = ""; status.appendChild(h("div", { class: "callout callout-success" }, icon("check"), `${r.filename} (${formatBytes(r.blob.size)}) téléchargé.`)); } catch (e) { status.innerHTML = ""; status.appendChild(h("div", { class: "callout callout-danger" }, icon("alert"), h("div", { class: "grow" }, e.message), button("Réessayer", { size: "sm", variant: "secondary", onClick: () => ctx.refresh() }))); } } }))));
  container.appendChild(h("div", { class: "stack" }, pkg ? h("p", { class: "muted" }, `Dernier paquet : ${formatDate(pkg.generatedAt)} · ${pkg.stats.pages} pages · ${formatBytes(pkg.stats.bytes)}.`) : h("div", { class: "callout callout-warning" }, icon("alert"), h("div", { class: "grow" }, "Aucun paquet web : empaquetez d'abord le livre pour activer les exports ADT, SCORM, WebPub, EPUB et PNLD."), button("Empaqueter", { size: "sm", onClick: () => startStage(ctx, "package", { skipConfirm: true }) })), options, h("h2", {}, "Formats"), grid, status, h("div", { class: "callout" }, icon("info"), h("div", { class: "small" }, h("strong", {}, "Héberger le résultat : "), "décompressez l'export web et déposez le dossier sur GitHub Pages, Netlify, Cloudflare Pages, un serveur nginx ou une clé USB (ouvrez index.html). Le paquet SCORM se dépose tel quel dans un LMS."))));
}
