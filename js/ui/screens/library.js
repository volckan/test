// Bibliothèque : recherche, tri, regroupement, vue grille/liste, détail d'un livre.
import { h, button, icon, badge, dialog, confirmDialog, toast, blobImg, select, segmented, kv, textInput } from "../dom.js";
import { renderAppLayout, mount, pageHead } from "../app-layout.js";
import { navigate } from "../../router.js";
import { listBooks, bookSummary, BookStorage, getUiPrefs, setUiPrefs } from "../../storage.js";
import { stageStatuses, getRun } from "../../pipeline/runner.js";
import { bookCards, bookStatus } from "./home.js";
import { formatDate, relativeDate, downloadBlob } from "../../util.js";
import { STAGES } from "../../pipeline.js";
import { exportProject } from "../../packaging/exports.js";
import { languageName } from "../../config.js";
import { folderStatus } from "../../local-folder.js";

export async function renderLibrary() {
  const prefs = await getUiPrefs();
  const lib = { sort: "recent", group: "none", view: "grid", ...(prefs.library ?? {}), ...(prefs.libraryView ? { view: prefs.libraryView } : {}) };
  let query = "";
  const books = await listBooks();
  let summaries = (await Promise.all(books.map((b) => bookSummary(b.label)))).filter(Boolean);
  for (const s of summaries) { const st = new BookStorage(s.label); s.runs = await st.getStepRuns(); s.status = bookStatus(s, s.runs, getRun(s.label)); s.progress = Object.values(stageStatuses(s.runs, null)).filter((x) => x.status === "done").length / 11; }
  const body = h("div", { class: "stack" });
  const save = () => setUiPrefs({ library: { sort: lib.sort, group: lib.group, view: lib.view } });
  const render = async () => {
    body.innerHTML = "";
    let list = summaries.filter((s) => !query || (s.title ?? "").toLowerCase().includes(query) || s.label.toLowerCase().includes(query) || (s.authors ?? []).join(" ").toLowerCase().includes(query));
    const sorters = { recent: (a, b) => (b.modifiedAt ?? "").localeCompare(a.modifiedAt ?? ""), title: (a, b) => (a.title ?? a.label).localeCompare(b.title ?? b.label, "fr"), progress: (a, b) => b.progress - a.progress, pages: (a, b) => b.pageCount - a.pageCount, created: (a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "") };
    list.sort(sorters[lib.sort] ?? sorters.recent);
    if (!list.length) { body.appendChild(h("div", { class: "empty" }, h("h3", {}, summaries.length ? "Aucun résultat" : "Aucun livre pour l'instant"), h("div", { class: "row" }, button("Ajouter votre premier livre", { iconName: "plus", onClick: () => navigate("/books/new") }), button("Importer un projet", { variant: "secondary", iconName: "upload", onClick: () => navigate("/books/import") })))); return; }
    const groups = lib.group === "attention" ? [["À corriger", list.filter((s) => s.status.kind === "danger")], ["En cours", list.filter((s) => s.status.kind !== "danger" && s.status.kind !== "success")], ["Prêts", list.filter((s) => s.status.kind === "success")]] : [[null, list]];
    for (const [title, items] of groups) {
      if (!items.length) continue;
      if (title) body.appendChild(h("h2", {}, title, " ", badge(items.length)));
      if (lib.view === "grid") { const grid = await bookCards(items); grid.querySelectorAll(".book-card").forEach((card, i) => { card.onclick = () => bookDetail(items[i]); }); body.appendChild(grid); }
      else body.appendChild(h("table", { class: "book-list" }, h("thead", {}, h("tr", {}, ["Livre", "Langue", "Pages", "Progression", "Dernière modification", ""].map((c) => h("th", {}, c)))), h("tbody", {}, items.map((s) => h("tr", { onClick: () => bookDetail(s) }, h("td", {}, h("div", { class: "row" }, h("div", { class: "cover", style: { width: "34px", aspectRatio: "3/4", borderRadius: "4px" } }, s.coverPageId ? blobImg(new BookStorage(s.label).getImageBlob(`${s.coverPageId}_page`)) : null), h("div", {}, h("strong", {}, s.title ?? s.label), h("div", { class: "muted small" }, s.authors?.join(", ") || s.label))), ), h("td", {}, languageName(s.languageCode) || "—"), h("td", {}, s.pageCount), h("td", {}, h("div", { class: "row" }, h("div", { class: "progress", style: { width: "90px" } }, h("div", { class: "progress-bar", style: { width: `${Math.round(s.progress * 100)}%` } })), badge(s.status.label, s.status.kind))), h("td", { class: "muted" }, relativeDate(s.modifiedAt)), h("td", {}, button("Ouvrir", { size: "sm", variant: "secondary", onClick: (e) => { e.stopPropagation(); navigate(`/books/${s.label}/book`); } })))))));
    }
  };
  const search = textInput({ placeholder: "Rechercher par titre ou auteur…", "aria-label": "Rechercher", onInput: (e) => { query = e.target.value.trim().toLowerCase(); render(); } });
  const toolbar = h("div", { class: "row row-wrap", style: { gap: "10px" } }, h("div", { class: "grow", style: { minWidth: "220px" } }, search),
    select([["recent", "Récemment modifié"], ["title", "Titre (A–Z)"], ["progress", "Progression"], ["pages", "Pages"], ["created", "Date de création"]], lib.sort, { onChange: (v) => { lib.sort = v; save(); render(); }, attrs: { style: "width:auto", "aria-label": "Trier" } }),
    select([["none", "Sans regroupement"], ["attention", "Regrouper par attention"]], lib.group, { onChange: (v) => { lib.group = v; save(); render(); }, attrs: { style: "width:auto", "aria-label": "Regrouper" } }),
    segmented([["grid", "Grille"], ["list", "Liste"]], lib.view, (v) => { lib.view = v; save(); render(); }, { ariaLabel: "Affichage" }));
  await render();
  const fs = await folderStatus().catch(() => null);
  const folderBanner = fs?.connected ? h("div", { class: "callout" }, icon("library"), h("div", { class: "grow small" }, h("strong", {}, `Dossier local : ${fs.name}`), fs.permission === "granted" ? ` · sauvegarde automatique ${fs.autoSave ? "activée" : "désactivée"}` : " · autorisation à renouveler"), button("Gérer", { size: "sm", variant: "secondary", onClick: () => navigate("/settings/storage") })) : null;
  mount(renderAppLayout(h("div", { class: "stack" }, folderBanner, pageHead("Bibliothèque", `${summaries.length} livre${summaries.length > 1 ? "s" : ""} stocké${summaries.length > 1 ? "s" : ""} localement dans ce navigateur.`, [button("Ajouter un livre", { iconName: "plus", onClick: () => navigate("/books/new") }), button("Importer", { variant: "secondary", iconName: "upload", onClick: () => navigate("/books/import") })]), toolbar, body)));
}

export async function bookDetail(s) {
  const st = new BookStorage(s.label);
  const statuses = stageStatuses(s.runs ?? (await st.getStepRuns()), getRun(s.label));
  const pills = STAGES.filter((x) => x.pipeline).map((x) => h("span", { class: "pill", style: statuses[x.pipeline]?.status === "done" ? { background: x.hex, color: "#fff" } : {} }, x.label));
  const { close } = dialog({ title: s.title ?? s.label, size: "lg", body: h("div", { class: "split split-1-2" },
    h("div", { class: "cover" }, s.coverPageId ? blobImg(st.getImageBlob(`${s.coverPageId}_page`)) : null),
    h("div", { class: "stack" }, kv([["Identifiant", s.label], ["Auteurs", s.authors?.join(", ")], ["Éditeur", s.publisher], ["Langue", languageName(s.languageCode)], ["Pages", s.pageCount], ["Ajouté", formatDate(s.createdAt)], ["Modifié", formatDate(s.modifiedAt)], ["Partie", s.part ? `pages ${s.part.range.startPage}–${s.part.range.endPage} de ${s.part.sourceLabel}` : null]]), h("div", {}, h("strong", {}, "Contenu"), h("div", { class: "substeps", style: { marginTop: "6px" } }, pills)), s.summary ? h("p", { class: "muted small" }, s.summary) : null, h("p", { class: "muted small" }, icon("info", "icon-sm"), " Stocké localement dans ce navigateur (IndexedDB)."))),
    actions: [
      { label: "Supprimer", variant: "danger", closeOn: false, onClick: async () => { if (await confirmDialog({ title: `Supprimer « ${s.title ?? s.label} » ?`, text: "Toutes les données extraites, les rendus, les audios et l'historique de ce livre seront effacés définitivement de ce navigateur.", confirmLabel: "Supprimer", danger: true })) { await st.deleteAll(); toast("Livre supprimé", { kind: "success" }); close(); renderLibrary(); } } },
      { label: "Exporter le projet (.zip)", variant: "secondary", closeOn: false, onClick: async () => { toast("Préparation de l'archive…"); const { blob, filename } = await exportProject(s.label); downloadBlob(blob, filename); } },
      { label: "Aperçu", variant: "secondary", onClick: () => navigate(`/books/${s.label}/preview`) },
      { label: s.status?.action ?? "Ouvrir", variant: "primary", onClick: () => navigate(`/books/${s.label}/book`) },
    ] });
}
