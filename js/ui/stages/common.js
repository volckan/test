// Composants partagés des vues d'étapes : carte d'exécution, sélecteur de versions, aperçus, garde de prérequis.
import { h, button, icon, badge, select, dialog, confirmDialog, toast, blobImg, progressBar, clear, textarea, field } from "../dom.js";
import { STAGE_BY_NAME, STAGE_BY_SLUG, STAGE_DESCRIPTIONS, upstreamStages } from "../../pipeline.js";
import { STATUS_LABELS, runStages } from "../../pipeline/runner.js";
import { runButton, startStage } from "../screens/book-layout.js";
import { formatDuration, formatDate, blobToDataUrl } from "../../util.js";
import { buildPreviewDocument } from "../../pipeline/screenshot.js";
import { getTypography, typographyCss } from "../../pipeline/typography.js";
import { runEvents } from "../../pipeline/runner.js";

/** Carte de lancement d'une étape avec sous-étapes et progression en direct. */
export function runCard(ctx, stageName, { extra } = {}) {
  const stage = STAGE_BY_NAME[stageName]; const slug = Object.values(STAGE_BY_SLUG).find((s) => s.pipeline === stageName)?.slug ?? stageName;
  const wrap = h("div", { class: "run-card" });
  const render = () => {
    clear(wrap);
    const st = ctx.statuses[stageName];
    wrap.appendChild(h("div", { class: "row between row-wrap" }, h("div", {}, h("h3", { style: { margin: 0 } }, stage.label, " ", badge(STATUS_LABELS[st?.status] ?? "Non démarré", st?.status === "done" ? "success" : st?.status === "error" ? "danger" : st?.status === "running" ? "accent" : st?.status === "stale" ? "warning" : "muted")), h("p", { class: "muted small", style: { margin: "4px 0 0" } }, STAGE_DESCRIPTIONS[slug] ?? "")), runButton(ctx, stageName)));
    const pills = h("div", { class: "substeps" });
    for (const step of stage.steps) { const r = ctx.stepRuns[step.name]; const prog = ctx.run?.progress?.[step.name]; pills.appendChild(h("span", { class: "pill", title: r?.error ?? r?.message ?? "" }, h("span", { class: ["status-dot", r?.status === "running" ? "running" : r?.status ?? ""] }), step.label, r?.status === "running" && prog ? h("span", { class: "muted" }, ` ${prog.current}/${prog.total}`) : r?.durationMs ? h("span", { class: "muted" }, ` ${formatDuration(r.durationMs)}`) : null)); }
    wrap.appendChild(pills);
    const running = stage.steps.find((s) => ctx.run?.running && ctx.run.currentStep === s.name);
    if (running) { const p = ctx.run.progress[running.name]; wrap.appendChild(h("div", {}, progressBar(p ? p.current / Math.max(1, p.total) : 0, running.label), h("div", { class: "muted small" }, p?.message ?? ""))); }
    const errors = stage.steps.map((s) => ctx.stepRuns[s.name]).filter((r) => r?.status === "error" && r.error);
    for (const e of errors) wrap.appendChild(h("div", { class: "callout callout-danger" }, icon("alert"), h("div", { class: "grow" }, h("strong", {}, "Erreur : "), e.error), button("Copier", { size: "sm", variant: "ghost", onClick: () => navigator.clipboard?.writeText(e.error) })));
    const messages = stage.steps.map((s) => ctx.stepRuns[s.name]).filter((r) => r?.status === "done" && r.message).map((r) => r.message);
    if (messages.length && !running) wrap.appendChild(h("div", { class: "muted small" }, messages.join(" · ")));
    if (extra) wrap.appendChild(extra);
  };
  render();
  const off = runEvents.on("*", (evt, p) => { if (p?.label === ctx.label && wrap.isConnected) { ctx.storage.getStepRuns().then((r) => { ctx.stepRuns = r; render(); }); } });
  wrap.addEventListener("DOMNodeRemoved", () => off(), { once: true });
  return wrap;
}

/** Garde de prérequis : affiche un message si l'étape amont n'est pas faite. */
export function prereqGuard(ctx, stageName, container, { message } = {}) {
  const missing = upstreamStages(stageName).filter((s) => !["done", "stale", "partial"].includes(ctx.statuses[s]?.status));
  if (!missing.length) return false;
  container.appendChild(h("div", { class: "empty" }, icon("info", "icon-lg"), h("h3", {}, message ?? `Terminez d'abord : ${missing.map((s) => STAGE_BY_NAME[s].label).join(", ")}`), h("p", { class: "muted" }, "Cette vue affichera les résultats dès que les étapes prérequises seront exécutées."), button(`Lancer jusqu'à « ${STAGE_BY_NAME[stageName].label} »`, { iconName: "play", onClick: () => startStage(ctx, stageName) })));
  return true;
}

/** Sélecteur de versions d'une entité (restauration, comparaison). */
export async function versionPicker(storage, node, itemId, { onChange, renderData } = {}) {
  const versions = await storage.getVersions(node, itemId);
  if (versions.length <= 1) return h("span", { class: "muted small" }, versions.length ? "v1" : "");
  const sel = select(versions.map((v) => [v.version, `v${v.version}${v.isCurrent ? " · courante" : ""} — ${formatDate(v.createdAt)}${v.manualEdit || v.data?.manualEdit ? " · édition" : ""}`]), versions.find((v) => v.isCurrent)?.version, { onChange: async (v) => { await storage.setCurrentVersion(node, itemId, Number(v)); toast(`Version v${v} restaurée`, { kind: "success" }); onChange?.(Number(v)); }, attrs: { style: "width:auto", "aria-label": "Versions" } });
  const compare = button("Comparer", { size: "sm", variant: "ghost", iconName: "history", onClick: () => {
    const a = versions[0], b = versions[1];
    dialog({ title: `Comparer les versions de ${itemId}`, size: "xl", body: h("div", { class: "split" }, ...[a, b].map((v) => h("div", {}, h("h3", {}, `v${v.version} · ${formatDate(v.createdAt)}`, v.isCurrent ? badge("courante", "accent") : null), renderData ? renderData(v.data) : h("pre", { class: "code" }, JSON.stringify(v.data, null, 1).slice(0, 20000)), button(`Utiliser v${v.version}`, { size: "sm", variant: "secondary", onClick: async () => { await storage.setCurrentVersion(node, itemId, v.version); onChange?.(v.version); } })))) });
  } });
  return h("div", { class: "row" }, icon("history", "icon-sm"), sel, compare);
}

/** Liste de vignettes de pages. */
export async function pageThumbs(ctx, { active, onPick, pages, annotate } = {}) {
  const grid = h("div", { class: "thumb-grid" });
  for (const p of pages ?? ctx.pages) {
    const card = h("button", { type: "button", class: ["thumb-card", active === p.pageId && "active"], onClick: () => onPick(p) }, blobImg(ctx.storage.getImageBlob(`${p.pageId}_page`), { alt: `Page ${p.pageNumber}` }), h("div", { class: "row between small" }, h("strong", {}, `Page ${p.pageNumber}${p.spreadOf ? `–${p.spreadOf[1]}` : ""}`), annotate ? await annotate(p) : null));
    grid.appendChild(card);
  }
  return grid;
}

/** Image d'une page (grande). */
export function pageImage(ctx, pageId, attrs = {}) { return blobImg(ctx.storage.getImageBlob(`${pageId}_page`), { class: "thumb", style: "width:100%", alt: "", ...attrs }); }

/** Aperçu d'un HTML de section dans un iframe (Tailwind navigateur + images du livre). */
export async function sectionPreview(ctx, html, { imageIds = [], viewport = "desktop", minHeight = 480, extraCss = "" } = {}) {
  const assetMap = {};
  for (const id of imageIds) { const b = await ctx.storage.getImageBlob(id); if (b) assetMap[`images/${id}.png`] = await blobToDataUrl(b); }
  const typo = await getTypography(ctx.storage, ctx.config);
  const iframe = h("iframe", { class: "preview-frame", title: "Aperçu de la section", sandbox: "allow-scripts allow-same-origin", style: { minHeight: `${minHeight}px` } });
  iframe.srcdoc = buildPreviewDocument(html, { assetMap, typographyCss: typographyCss(typo), extraCss });
  iframe.addEventListener("load", () => { try { const hgt = iframe.contentDocument?.documentElement?.scrollHeight; if (hgt) iframe.style.height = `${Math.min(2400, Math.max(minHeight, hgt + 20))}px`; } catch { /* ignore */ } });
  return h("div", { class: `viewport-${viewport}` }, iframe);
}
export function viewportToggle(value, onChange) { return h("div", { class: "segmented", role: "radiogroup", "aria-label": "Largeur d'aperçu" }, [["desktop", "monitor", "Bureau"], ["tablet", "tablet", "Tablette"], ["mobile", "smartphone", "Mobile"]].map(([v, ic, l]) => h("button", { type: "button", role: "radio", "aria-checked": String(v === value), class: ["seg", v === value && "seg-on"], title: l, onClick: () => onChange(v) }, icon(ic)))); }

export function imageIdsInHtml(html) { return [...new DOMParser().parseFromString(html, "text/html").querySelectorAll("img[data-id]")].map((e) => e.getAttribute("data-id")); }

/** Barre flottante d'enregistrement. */
export function floatingSave({ onSave, onDiscard, label = "Modifications non enregistrées", saveLabel = "Enregistrer", extra }) {
  const bar = h("div", { class: "floating-save" }, h("span", { class: "row" }, icon("alert"), label), h("div", { class: "row" }, extra ?? null, button("Abandonner", { variant: "ghost", onClick: onDiscard }), button(saveLabel, { iconName: "check", onClick: onSave })));
  window.__adtDirty = true; bar.addEventListener("DOMNodeRemoved", () => { window.__adtDirty = false; }, { once: true });
  return bar;
}

/** Zone d'instructions personnalisées (avec remplissage automatique depuis le contexte du livre). */
export function customInstructions(ctx, value, onChange, { label = "Instructions personnalisées" } = {}) {
  const ta = textarea({ value: value ?? "", rows: 3, placeholder: "Ex. : « Privilégie le vocabulaire du programme de CE2 »", onInput: (e) => onChange(e.target.value) });
  return field(label, h("div", { class: "stack", style: { gap: "4px" } }, ta, h("div", {}, button("Remplir depuis le contexte du livre", { size: "sm", variant: "ghost", iconName: "sparkles", onClick: async () => { const s = await ctx.storage.getNodeData("book-summary", "book"); const m = await ctx.storage.getNodeData("metadata", "book"); const txt = [m?.title ? `Livre : « ${m.title} »` : "", s?.summary ?? ""].filter(Boolean).join("\n"); ta.value = txt; onChange(txt); } }))));
}

export function stageLanding(ctx, stageName, settingsNodes, { afterRun } = {}) {
  return h("div", { class: "stack" }, h("div", { class: "card" }, h("div", { class: "card-body stack" }, h("h3", { style: { margin: 0 } }, "Réglages rapides"), ...settingsNodes)), runCard(ctx, stageName), afterRun ?? null);
}

/** Met à jour la configuration du livre et rafraîchit le contexte. */
export async function patchBookConfig(ctx, patch, { silent = false } = {}) { await ctx.storage.patchConfig(patch); ctx.config = await ctx.storage.effectiveConfig(); if (!silent) toast("Réglage enregistré", { kind: "success", duration: 1500 }); }

export function lightbox(src, alt = "") { const lb = h("div", { class: "lightbox", role: "dialog", "aria-label": alt || "Image", onClick: () => lb.remove() }, h("img", { src, alt })); document.body.appendChild(lb); document.addEventListener("keydown", function esc(e) { if (e.key === "Escape") { lb.remove(); document.removeEventListener("keydown", esc); } }); }
export { STATUS_LABELS, startStage };
