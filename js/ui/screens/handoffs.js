// Diviser et fusionner : livres divisés en parties, parties reçues.
import { h, button, icon, badge, toast, blobImg } from "../dom.js";
import { renderAppLayout, mount, pageHead } from "../app-layout.js";
import { navigate } from "../../router.js";
import { listBooks, bookSummary, BookStorage } from "../../storage.js";
import { downloadBlob } from "../../util.js";
import { exportProject } from "../../packaging/exports.js";

export async function renderHandoffs() {
  const books = await listBooks();
  const summaries = (await Promise.all(books.map((b) => bookSummary(b.label)))).filter(Boolean);
  const split = summaries.filter((s) => s.split || s.config?.split_mode);
  const parts = summaries.filter((s) => s.part);
  const content = h("div", { class: "stack", style: { gap: "28px" } }, pageHead("Diviser et fusionner", "Confiez des plages de pages à des contributeurs, puis réintégrez leurs parties terminées."));
  const sec1 = h("section", { class: "stack" }, h("h2", {}, "Livres que vous avez divisés"));
  if (!split.length) sec1.appendChild(h("div", { class: "empty" }, h("h3", {}, "Aucun livre divisé"), h("p", { class: "muted" }, "Dans la vue d'ensemble d'un livre, utilisez le panneau « Diviser et fusionner » pour exporter des parties."), button("Diviser un livre", { variant: "secondary", iconName: "scissors", onClick: () => navigate("/library") })));
  for (const s of split) {
    const exported = s.split?.exported ?? []; const merged = s.split?.mergedRanges ?? [];
    sec1.appendChild(h("div", { class: "card" }, h("div", { class: "card-body row", style: { gap: "14px", flexWrap: "wrap" } }, h("div", { class: "cover", style: { width: "48px", aspectRatio: "3/4" } }, s.coverPageId ? blobImg(new BookStorage(s.label).getImageBlob(`${s.coverPageId}_page`)) : null), h("div", { class: "grow" }, h("strong", {}, s.title ?? s.label), h("div", { class: "muted small" }, `${s.pageCount} pages · ${exported.length} partie(s) exportée(s) · ${merged.length} fusionnée(s)`), exported.length ? h("div", { class: "substeps", style: { marginTop: "6px" } }, exported.map((e) => { const done = merged.some((m) => m.startPage === e.startPage && m.endPage === e.endPage); return h("span", { class: "pill", style: done ? { background: "var(--success-soft)", color: "var(--success)" } : {} }, `p. ${e.startPage}–${e.endPage} · ${done ? "Fusionnée" : "Partagée"}`); })) : null, exported.length && merged.length >= exported.length ? h("div", { class: "small", style: { color: "var(--success)" } }, icon("check", "icon-sm"), " Toutes les parties sont fusionnées — livre assemblé") : null), h("div", { class: "row" }, button("Importer une partie renvoyée", { variant: "secondary", iconName: "upload", onClick: () => navigate("/books/import", { query: { merge: s.label } }) }), button("Gérer dans le livre", { onClick: () => navigate(`/books/${s.label}/book`) })))));
  }
  const sec2 = h("section", { class: "stack" }, h("h2", {}, "Parties partagées avec vous"));
  if (!parts.length) sec2.appendChild(h("div", { class: "empty" }, h("h3", {}, "Aucune partie reçue"), h("p", { class: "muted" }, "Importez l'archive .zip d'une partie qu'un coordinateur vous a confiée."), button("Importer une partie (.zip)", { variant: "secondary", iconName: "upload", onClick: () => navigate("/books/import") })));
  for (const s of parts) sec2.appendChild(h("div", { class: "card" }, h("div", { class: "card-body row", style: { gap: "14px", flexWrap: "wrap" } }, h("div", { class: "grow" }, h("strong", {}, s.title ?? s.label, " ", badge(`p. ${s.part.range.startPage}–${s.part.range.endPage}`, "accent")), h("div", { class: "muted small" }, `Partie de ${s.part.sourceLabel}`)), badge(s.completedSteps?.length ? "En cours" : "Non démarrée", s.completedSteps?.length ? "accent" : "muted"), h("div", { class: "row" }, button("Ouvrir la partie", { variant: "secondary", iconName: "book-open", onClick: () => navigate(`/books/${s.label}/book`) }), button("Exporter et renvoyer (.zip)", { iconName: "folder-up", onClick: async () => { toast("Préparation de la partie…"); const { blob, filename } = await exportProject(s.label, { pageRange: s.part.range, partOf: s.part.sourceLabel }); downloadBlob(blob, filename.replace(".zip", "-processed.zip")); } })))));
  content.appendChild(sec1); content.appendChild(sec2);
  mount(renderAppLayout(content));
}
