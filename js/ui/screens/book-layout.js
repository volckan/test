// Mise en page d'un livre : barre latérale des étapes, en-tête, contenu de l'étape, paramètres, débogage.
import { h, button, icon, badge, clear, toast, confirmDialog } from "../dom.js";
import { mount } from "../app-layout.js";
import { navigate, href } from "../../router.js";
import { BookStorage, bookEvents, bookSummary } from "../../storage.js";
import { STAGES, STAGE_BY_SLUG, STAGE_GROUPS, STAGE_DESCRIPTIONS, STAGES_WITH_PAGES, STAGE_BY_NAME, upstreamStages } from "../../pipeline.js";
import { runEvents, getRun, cancelRun, stageStatuses, STATUS_LABELS, runStages } from "../../pipeline/runner.js";
import { formatDuration, pageLabel } from "../../util.js";
import { STAGE_VIEWS } from "../stages/index.js";
import { renderStageSettings } from "../stages/stage-settings.js";
import { renderDebug } from "../stages/debug.js";

let unsub = [];
function cleanup() { for (const u of unsub) u(); unsub = []; }

export async function buildCtx(label, step, pageId, query) {
  const storage = new BookStorage(label);
  const book = await storage.getBook();
  if (!book) { toast(`Livre « ${label} » introuvable`, { kind: "error" }); navigate("/library", { replace: true }); return null; }
  const config = await storage.effectiveConfig();
  const pages = await storage.getActivePages(config);
  const summary = await bookSummary(label);
  const stepRuns = await storage.getStepRuns();
  return { label, storage, book, config, pages, summary, step, pageId: pageId ?? null, query: query ?? {}, stepRuns, statuses: stageStatuses(stepRuns, getRun(label)), run: getRun(label),
    go: (s, p, q) => navigate(`/books/${label}/${s}${p ? `/${p}` : ""}`, q ? { query: q } : undefined),
    refresh: () => dispatchRefresh(), reloadConfig: async () => { const c = await storage.effectiveConfig(); return c; } };
}
let refreshFn = null;
function dispatchRefresh() { refreshFn?.(); }

export async function renderBookRoute({ params, query }) {
  const step = STAGE_BY_SLUG[params.step] ? params.step : "book";
  await renderLayout(params.label, step, params.pageId ?? null, query, async (ctx, container) => {
    const view = STAGE_VIEWS[step];
    if (!view) container.appendChild(h("div", { class: "empty" }, h("h3", {}, "Vue non disponible")));
    else await view(ctx, container);
  });
}
export async function renderBookSettingsRoute({ params, query }) {
  await renderLayout(params.label, params.step, null, query, async (ctx, container) => { await renderStageSettings(ctx, container, query.tab ?? null); }, { settings: true });
}
export async function renderDebugRoute({ params, query }) {
  await renderLayout(params.label, "debug", null, query, async (ctx, container) => { await renderDebug(ctx, container, query.tab ?? "stats"); });
}

async function renderLayout(label, step, pageId, query, renderContent, { settings = false } = {}) {
  cleanup();
  const ctx = await buildCtx(label, step, pageId, query);
  if (!ctx) return;
  const sidebar = h("aside", { class: "stage-sidebar" });
  const main = h("main", { id: "main", class: "book-main", tabindex: -1 });
  const container = h("div", { class: "stage-content" });
  const stage = STAGE_BY_SLUG[step] ?? { slug: step, label: step === "debug" ? "Débogage" : step, hex: "#4b5563", icon: "bug" };
  const head = h("div", { class: "stage-head" });
  const renderHead = () => {
    clear(head);
    head.appendChild(h("h1", {}, h("span", { class: "stage-icon", style: { background: stage.hex } }, icon(stage.icon)), settings ? h("span", {}, stage.label, h("span", { class: "muted" }, " / Paramètres")) : stage.label));
    const st = ctx.statuses[stage.pipeline];
    if (st && !settings) head.appendChild(badge(STATUS_LABELS[st.status] ?? st.status, st.status === "done" ? "success" : st.status === "error" ? "danger" : st.status === "running" ? "accent" : st.status === "stale" ? "warning" : "muted"));
    head.appendChild(h("div", { class: "grow" }));
    if (settings) head.appendChild(button("Fermer", { variant: "secondary", iconName: "x", onClick: () => ctx.go(step) }));
    else {
      if (stage.pipeline) head.appendChild(runButton(ctx, stage.pipeline));
      if (["book", "extract", "sectioning", "storyboard", "quizzes", "glossary", "toc", "easy-read", "captions", "translate", "speech", "validation", "preview", "export", "sign-language"].includes(step)) head.appendChild(button("Paramètres", { variant: "secondary", iconName: "settings", onClick: () => navigate(`/books/${label}/${step}/settings`) }));
      head.appendChild(button("", { variant: "ghost", iconName: "bug", title: "Débogage (Ctrl+Maj+D)", onClick: () => navigate(`/books/${label}/debug`) }));
    }
  };
  renderHead();
  main.appendChild(head); main.appendChild(container);
  const renderSidebar = () => buildSidebar(ctx, sidebar, step, pageId);
  renderSidebar();
  mount(h("div", { class: "book-layout" }, sidebar, main));
  let renderToken = 0; let refreshTimer = null;
  const doRender = async () => {
    const token = ++renderToken; const temp = h("div", { class: "stage-content-inner" });
    try { await renderContent(ctx, temp); } catch (e) { console.error(e); temp.appendChild(h("div", { class: "callout callout-danger" }, icon("alert"), h("div", {}, h("strong", {}, "Erreur d'affichage"), h("pre", { class: "code" }, e.stack ?? e.message)))); }
    if (token !== renderToken) return;
    const scrollY = window.scrollY; clear(container); container.appendChild(temp); window.scrollTo(0, scrollY);
  };
  await doRender();
  const refreshStatus = async () => { ctx.stepRuns = await ctx.storage.getStepRuns(); ctx.run = getRun(label); ctx.statuses = stageStatuses(ctx.stepRuns, ctx.run); renderSidebar(); renderHead(); };
  refreshFn = () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(async () => { const fresh = await buildCtx(label, step, pageId, query); if (!fresh) return; Object.assign(ctx, fresh); renderSidebar(); renderHead(); await doRender(); }, 250); };
  unsub.push(runEvents.on("*", (evt, p) => { if (p?.label !== label) return; refreshStatus(); if (["complete", "step-complete", "step-skipped"].includes(evt) && !settings) { const relevant = step === "book" || STAGE_BY_SLUG[step]?.pipeline === STAGE_BY_NAME[p.step ? Object.keys(STAGE_BY_NAME).find((s) => STAGE_BY_NAME[s].steps.some((x) => x.name === p.step)) : ""]?.name || evt === "complete"; if (relevant) refreshFn(); } }));
  unsub.push(bookEvents.on("step-run", (p) => { if (p.label === label) refreshStatus(); }));
  unsub.push(bookEvents.on("book-updated", (p) => { if (p.label === label) refreshStatus(); }));
}

export function runButton(ctx, stageName, { size } = {}) {
  const st = ctx.statuses[stageName]; const running = ctx.run?.running;
  if (running && ctx.run.currentStage === stageName) return button("Annuler l'exécution", { variant: "danger", size, iconName: "x", onClick: () => cancelRun(ctx.label) });
  const label = st?.status === "done" ? "Relancer" : st?.status === "error" ? "Réessayer" : "Lancer";
  return button(label, { size, iconName: st?.status === "done" ? "refresh" : "play", disabled: running, onClick: () => startStage(ctx, stageName) });
}

export async function startStage(ctx, stageName, options = {}) {
  const missing = upstreamStages(stageName).filter((s) => ctx.statuses[s]?.status !== "done" && ctx.statuses[s]?.status !== "stale");
  let from = stageName;
  if (missing.length) {
    const ok = await confirmDialog({ title: "Prérequis non terminés", text: `Les étapes suivantes doivent être terminées d'abord : ${missing.map((s) => STAGE_BY_NAME[s].label).join(", ")}. Les lancer maintenant puis enchaîner avec « ${STAGE_BY_NAME[stageName].label} » ?`, confirmLabel: "Tout lancer" });
    if (!ok) return;
    from = "extract";
  }
  if (ctx.statuses[stageName]?.status === "done" && !options.skipConfirm) {
    const downstream = Object.entries(ctx.statuses).filter(([s, v]) => v.status === "done" && upstreamStages(s).includes(stageName)).map(([s]) => STAGE_BY_NAME[s].label);
    const ok = await confirmDialog({ title: `Relancer « ${STAGE_BY_NAME[stageName].label} » ?`, text: `Les résultats existants sont conservés comme versions précédentes (restaurables). Les appels d'IA inchangés seront servis depuis le cache.${downstream.length ? ` Les étapes en aval (${downstream.join(", ")}) seront marquées « à mettre à jour ».` : ""}`, confirmLabel: "Relancer" });
    if (!ok) return;
    const { invalidateDownstream } = await import("../../pipeline/runner.js"); await invalidateDownstream(ctx.label, stageName);
  }
  runStages(ctx.label, from, stageName, options).catch((e) => toast(e.message, { kind: "error" }));
}

function buildSidebar(ctx, sidebar, step, pageId) {
  clear(sidebar);
  sidebar.appendChild(h("div", { class: "stage-sidebar-head" }, h("a", { class: "btn btn-ghost btn-sm btn-icon", href: "#/", title: "Accueil", "aria-label": "Accueil" }, icon("home")), h("div", { class: "grow truncate" }, h("div", { class: "title truncate" }, ctx.summary?.title ?? ctx.label), h("div", { class: "muted small truncate" }, `${ctx.pages.length} pages · ${ctx.label}`))));
  const run = ctx.run;
  if (run?.running) sidebar.appendChild(h("div", { style: { padding: "8px 12px" } }, h("div", { class: "row between small" }, h("span", { class: "row" }, h("span", { class: "spinner", style: { width: "14px", height: "14px", borderWidth: "2px" } }), STAGE_BY_NAME[run.currentStage]?.runningLabel ?? "Exécution"), button("Annuler", { size: "sm", variant: "ghost", onClick: () => cancelRun(ctx.label) })), run.currentStep && run.progress[run.currentStep] ? h("div", { class: "muted small" }, `${run.currentStep} : ${run.progress[run.currentStep].current}/${run.progress[run.currentStep].total}`) : null));
  const item = (s) => {
    const st = s.pipeline ? ctx.statuses[s.pipeline] : null;
    const active = s.slug === step;
    const disabled = s.slug === "speech" && ctx.config?.speech?.enabled === false;
    const btn = h("button", { type: "button", class: ["stage-item", active && "active", disabled && "stage-disabled"], title: disabled ? "Module désactivé pour ce livre" : undefined, onClick: () => ctx.go(s.slug) }, h("span", { class: "stage-icon", style: { background: disabled ? "#94a3b8" : s.hex } }, icon(s.icon)), h("span", { class: "truncate" }, s.label), h("span", { class: "meta" }, disabled ? h("span", { class: "badge badge-muted", style: { fontSize: "10px" } }, "désactivé") : null, st?.durationMs ? h("span", {}, formatDuration(st.durationMs)) : null, st ? h("span", { class: ["status-dot", st.status], title: STATUS_LABELS[st.status] }) : null));
    const wrap = h("div", {}, btn);
    if (active && STAGES_WITH_PAGES.has(s.slug) && ctx.pages.length) {
      const list = h("div", { class: "page-list" });
      for (const p of ctx.pages.slice(0, 400)) list.appendChild(h("button", { type: "button", class: pageId === p.pageId ? "active" : "", onClick: () => ctx.go(s.slug, p.pageId) }, pageLabel(p)));
      wrap.appendChild(list);
    }
    return wrap;
  };
  sidebar.appendChild(h("div", { class: "stage-group" }, item(STAGE_BY_SLUG.book)));
  for (const g of STAGE_GROUPS) sidebar.appendChild(h("div", { class: "stage-group" }, h("div", { class: "stage-group-title" }, g.label), STAGES.filter((s) => s.group === g.key).map(item)));
  sidebar.appendChild(h("div", { class: "stage-group" }, h("button", { type: "button", class: ["stage-item", step === "debug" && "active"], onClick: () => navigate(`/books/${ctx.label}/debug`) }, h("span", { class: "stage-icon", style: { background: "#334155" } }, icon("bug")), h("span", {}, "Débogage"))));
}
export { STAGE_DESCRIPTIONS };
