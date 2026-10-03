// Accueil : héros, fonctionnalités, livres récents.
import { h, button, icon, blobImg, badge } from "../dom.js";
import { renderAppLayout, mount, pageHead } from "../app-layout.js";
import { navigate } from "../../router.js";
import { listBooks, bookSummary, BookStorage } from "../../storage.js";
import { stageStatuses, getRun } from "../../pipeline/runner.js";
import { relativeDate } from "../../util.js";

export const FEATURES = [
  { key: "listen", icon: "audio-lines", color: "#e11d48", label: "Écouter", blurb: "Synthèse vocale naturelle, page par page." },
  { key: "easy-read", icon: "file-text", color: "#c026d3", label: "Lecture facile", blurb: "Texte simplifié pour les lecteurs débutants." },
  { key: "translate", icon: "languages", color: "#db2777", label: "Traduire", blurb: "La même édition dans chaque langue." },
  { key: "sign", icon: "video", color: "#0891b2", label: "Vidéo", blurb: "Vidéos (langue des signes, explications) liées aux pages." },
  { key: "captions", icon: "image", color: "#0d9488", label: "Légendes", blurb: "Visuels décrits et textes alternatifs." },
  { key: "quizzes", icon: "help-circle", color: "#ea580c", label: "Quiz", blurb: "Vérifications de compréhension par section." },
  { key: "glossary", icon: "book-open", color: "#65a30d", label: "Glossaire", blurb: "Termes clés définis à leur place." },
  { key: "contents", icon: "list", color: "#d97706", label: "Sommaire", blurb: "Navigable, généré automatiquement." },
  { key: "wcag", icon: "shield-check", color: "#059669", label: "Validé WCAG", blurb: "Vérifié avant chaque export." },
];

export function bookStatus(summary, runs, run) {
  if (run?.running) return { label: "En cours", kind: "accent", action: "Ouvrir" };
  const st = stageStatuses(runs, null);
  if (Object.values(st).some((s) => s.status === "error")) return { label: "À corriger", kind: "danger", action: "Ouvrir" };
  if (st.package?.status === "done") return { label: "Prêt", kind: "success", action: "Ouvrir" };
  if (st.storyboard?.status === "done") return { label: "Base prête", kind: "accent", action: "Continuer" };
  if (st.extract?.status === "done" || Object.values(st).some((s) => s.status !== "not-started")) return { label: "En cours", kind: "warning", action: "Continuer" };
  return { label: "Non démarré", kind: "muted", action: "Commencer" };
}
export async function bookCards(summaries, { limit } = {}) {
  const grid = h("div", { class: "book-grid" });
  for (const s of (limit ? summaries.slice(0, limit) : summaries)) {
    const st = new BookStorage(s.label); const runs = await st.getStepRuns(); const status = bookStatus(s, runs, getRun(s.label));
    grid.appendChild(h("button", { type: "button", class: "book-card", onClick: () => navigate(`/books/${s.label}/book`) },
      h("div", { class: "cover" }, s.coverPageId ? blobImg(st.getImageBlob(`${s.coverPageId}_page`), { alt: "" }) : h("span", {}, (s.title ?? s.label).slice(0, 2).toUpperCase())),
      h("div", { class: "col", style: { gap: "2px" } }, h("strong", { class: "truncate" }, s.title ?? s.label), h("span", { class: "muted small truncate" }, s.authors?.join(", ") || s.label), h("span", { class: "muted small" }, `${s.pageCount} pages · ${relativeDate(s.modifiedAt)}`)),
      h("div", { class: "row between" }, badge(status.label, status.kind), h("span", { class: "small", style: { color: "var(--accent-strong)", fontWeight: 600 } }, status.action))));
  }
  return grid;
}

export async function renderHome() {
  const books = await listBooks();
  const summaries = (await Promise.all(books.map((b) => bookSummary(b.label)))).filter(Boolean);
  const hour = new Date().getHours(); const greet = hour < 12 ? "Bonjour" : hour < 18 ? "Bon après-midi" : "Bonsoir";
  const features = h("div", { class: "features" }, FEATURES.map((f) => h("div", { class: "feature" }, h("span", { class: "tile", style: { background: f.color } }, icon(f.icon)), h("strong", {}, f.label), h("span", { class: "muted" }, f.blurb))));
  const content = h("div", { class: "stack", style: { gap: "28px" } });
  if (!summaries.length) {
    content.appendChild(h("section", { class: "hero" }, h("div", {}, h("h1", {}, "Bienvenue dans ADT Studio"), h("p", { class: "muted", style: { fontSize: "16px" } }, "Transformez n'importe quel PDF en livre numérique accessible : audio, traductions, lecture facile, quiz et glossaire — générés à partir de votre fichier, modifiables, et à vous."), h("div", { class: "row row-wrap", style: { marginTop: "14px" } }, button("Ajouter votre premier livre", { size: "lg", iconName: "plus", onClick: () => navigate("/books/new") }), button("Importer un projet existant", { size: "lg", variant: "secondary", iconName: "upload", onClick: () => navigate("/books/import") }))), features));
    content.appendChild(h("section", { class: "callout callout-accent" }, icon("info"), h("div", {}, h("strong", {}, "Comment ça marche ? "), "1. Déposez un PDF · 2. Choisissez un préréglage (manuel, album, référence) · 3. Lancez le pipeline (extraction, structuration, mise en page, enrichissements, traduction, audio) · 4. Validez l'accessibilité et exportez en Web, EPUB 3, WebPub ou SCORM.")));
  } else {
    const recent = summaries[0];
    content.appendChild(pageHead(`${greet} !`, "Reprenez là où vous vous étiez arrêté, ou ajoutez un nouveau livre.", [button("Ajouter un livre", { iconName: "plus", onClick: () => navigate("/books/new") }), button("Importer", { variant: "secondary", iconName: "upload", onClick: () => navigate("/books/import") })]));
    const st = new BookStorage(recent.label); const status = bookStatus(recent, await st.getStepRuns(), getRun(recent.label));
    content.appendChild(h("section", { class: "card" }, h("div", { class: "card-body row", style: { gap: "18px", flexWrap: "wrap" } }, h("div", { class: "cover", style: { width: "96px", aspectRatio: "3/4" } }, recent.coverPageId ? blobImg(st.getImageBlob(`${recent.coverPageId}_page`)) : null), h("div", { class: "grow" }, h("span", { class: "muted small" }, "Reprendre"), h("h2", { style: { margin: "2px 0" } }, recent.title ?? recent.label), h("p", { class: "muted" }, `${recent.pageCount} pages · modifié ${relativeDate(recent.modifiedAt)} · `, badge(status.label, status.kind))), button(status.action, { size: "lg", iconName: "arrow-right", onClick: () => navigate(`/books/${recent.label}/book`) }))));
    content.appendChild(h("section", {}, h("div", { class: "row between" }, h("h2", {}, "Récents"), h("a", { href: "#/library" }, "Toute la bibliothèque")), await bookCards(summaries, { limit: 8 })));
    content.appendChild(h("section", {}, h("h2", {}, "Ce que chaque édition apporte"), features));
  }
  mount(renderAppLayout(content));
}
