// Point d'entrée : coquille, navigation, palette de commandes, notifications d'exécution.
import { addRoute, startRouter, navigate, routerEvents, parseHash } from "./router.js";
import { h, clear, icon, toast, dialog, button } from "./ui/dom.js";
import { getSetting, setSetting, openDb, requestPersistence } from "./db.js";
import { listBooks, bookEvents, getUiPrefs, bookSummary } from "./storage.js";
import { runEvents } from "./pipeline/runner.js";
import { STAGE_BY_NAME, PIPELINE } from "./pipeline.js";
import { renderAppLayout } from "./ui/app-layout.js";
import { openCommandPalette } from "./ui/command-palette.js";

export const APP_VERSION = "1.0.0";
const app = document.getElementById("app");

export async function applyTheme() {
  const prefs = await getUiPrefs();
  const t = prefs.theme ?? "system";
  const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  try { localStorage.setItem("adt-studio:theme", JSON.stringify(t)); } catch { /* ignore */ }
  window.__uiPrefs = prefs;
}
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);
bookEvents.on("ui-prefs", applyTheme);

function lazy(loader, name) { return async (ctx) => { const mod = await loader(); await mod[name](ctx); }; }

// ── Routes ──────────────────────────────────────────────────────────────────
addRoute("/", lazy(() => import("./ui/screens/home.js"), "renderHome"));
addRoute("/onboarding", lazy(() => import("./ui/screens/onboarding.js"), "renderOnboarding"));
addRoute("/library", lazy(() => import("./ui/screens/library.js"), "renderLibrary"));
addRoute("/handoffs", lazy(() => import("./ui/screens/handoffs.js"), "renderHandoffs"));
addRoute("/settings", (ctx) => navigate("/settings/providers", { replace: true }));
addRoute("/settings/:section", lazy(() => import("./ui/screens/settings.js"), "renderSettings"));
addRoute("/prompts/settings", () => navigate("/settings/prompts", { replace: true }));
addRoute("/books/new", lazy(() => import("./ui/screens/wizard.js"), "renderWizard"));
addRoute("/books/import", lazy(() => import("./ui/screens/import.js"), "renderImport"));
addRoute("/books/:label", ({ params }) => navigate(`/books/${params.label}/book`, { replace: true }));
addRoute("/books/:label/debug", lazy(() => import("./ui/screens/book-layout.js"), "renderDebugRoute"));
addRoute("/books/:label/:step", lazy(() => import("./ui/screens/book-layout.js"), "renderBookRoute"));
addRoute("/books/:label/:step/settings", lazy(() => import("./ui/screens/book-layout.js"), "renderBookSettingsRoute"));
addRoute("/books/:label/:step/:pageId", lazy(() => import("./ui/screens/book-layout.js"), "renderBookRoute"));

routerEvents.on("notfound", ({ path }) => { clear(app); app.appendChild(renderAppLayout(h("div", { class: "empty" }, h("h3", {}, "Page introuvable"), h("p", { class: "muted" }, path), button("Retour à l'accueil", { onClick: () => navigate("/") })))); });
routerEvents.on("error", ({ error }) => { toast(error.message ?? String(error), { kind: "error", title: "Erreur" }); clear(app); app.appendChild(renderAppLayout(h("div", { class: "empty" }, h("h3", {}, "Une erreur est survenue"), h("pre", { class: "code" }, String(error?.stack ?? error)), button("Retour à l'accueil", { onClick: () => navigate("/") })))); });

// ── Notifications d'exécution ────────────────────────────────────────────────
const stageLabel = (s) => STAGE_BY_NAME[s]?.label ?? s;
runEvents.on("complete", async ({ label, aborted, errors, stages }) => {
  const prefs = await getUiPrefs();
  const summary = await bookSummary(label).catch(() => null);
  const title = summary?.title ?? label;
  if (aborted) toast(`Exécution annulée pour « ${title} »`, { kind: "warning" });
  else if (errors.length) toast(`Erreur pendant ${stages.map(stageLabel).join(" → ")} : ${errors[0]}`, { kind: "error", title });
  else toast(`${stages.map(stageLabel).join(" → ")} terminé`, { kind: "success", title });
  if (prefs.desktopAlerts !== false && "Notification" in window && Notification.permission === "granted" && document.hidden) { try { new Notification(`ADT Studio — ${title}`, { body: aborted ? "Exécution annulée" : errors.length ? `Erreur : ${errors[0]}` : `${stages.map(stageLabel).join(" → ")} terminé` }); } catch { /* ignore */ } }
});
runEvents.on("page-error", ({ info, decision }) => {
  const applyAll = h("input", { type: "checkbox" });
  dialog({ title: `Une page a échoué dans « ${info.step} »`, closable: false, body: h("div", { class: "stack" }, h("p", {}, `Page ${info.pageId} : ${info.message}`), h("label", { class: "row" }, applyAll, " Appliquer à toutes les erreurs de cette exécution")), actions: [{ label: "Arrêter l'étape", variant: "danger", onClick: () => decision.resolve("stop", applyAll.checked) }, { label: "Ignorer la page et continuer", variant: "primary", onClick: () => decision.resolve("skip", applyAll.checked) }] });
});

// ── Raccourcis globaux ───────────────────────────────────────────────────────
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openCommandPalette(); }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "d") { const r = parseHash(); const m = /^\/books\/([^/]+)/.exec(r.path); if (m) { e.preventDefault(); navigate(`/books/${m[1]}/debug`); } }
});
window.addEventListener("beforeunload", (e) => { if (window.__adtRunning || window.__adtDirty) { e.preventDefault(); e.returnValue = ""; } });
runEvents.on("start", () => { window.__adtRunning = true; }); runEvents.on("complete", () => { window.__adtRunning = false; });

// ── Démarrage ───────────────────────────────────────────────────────────────
(async function boot() {
  try {
    await openDb();
    await applyTheme();
    requestPersistence();
    const onboarded = await getSetting("onboarded", false);
    const books = await listBooks();
    if (!onboarded && !books.length && !location.hash.startsWith("#/onboarding") && !location.hash.startsWith("#/settings")) navigate("/onboarding", { replace: true });
    startRouter();
  } catch (e) {
    console.error(e);
    clear(app); app.appendChild(h("div", { class: "boot" }, icon("alert", "icon-lg"), h("h2", {}, "Impossible de démarrer"), h("p", { class: "muted" }, e.message), h("p", { class: "small muted" }, "Vérifiez que IndexedDB est disponible (mode navigation privée restreint ?).")));
  }
})();
export { setSetting };
