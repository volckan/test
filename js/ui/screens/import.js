// Import d'un projet (.zip) ou d'une partie renvoyée (fusion).
import { h, button, icon, badge, dropZone, toast, textInput, field, spinner, kv } from "../dom.js";
import { renderAppLayout, mount, pageHead } from "../app-layout.js";
import { navigate } from "../../router.js";
import { previewImport, importProject } from "../../packaging/exports.js";
import { listBooks } from "../../storage.js";
import { STAGE_BY_NAME, STEP_TO_STAGE } from "../../pipeline.js";
import { LABEL_RE } from "../../util.js";

export async function renderImport({ query }) {
  const mergeInto = query.merge ?? null;
  const box = h("div", { class: "stack" });
  const render = (content) => { box.innerHTML = ""; box.appendChild(content); };
  const start = () => render(h("div", { class: "stack" }, dropZone({ accept: ".zip,application/zip", label: "Déposez une archive .zip ou cliquez pour parcourir", hint: "Archive de projet ADT Studio ou partie de livre renvoyée", onFiles: (fs) => analyze(fs[0]) }), h("p", { class: "muted small" }, "Ou ", h("a", { href: "#/books/new" }, "créez un nouveau livre à partir d'un PDF"), ".")));
  const analyze = async (file) => {
    render(spinner("Lecture de l'archive…"));
    try {
      const info = await previewImport(file);
      const existing = (await listBooks()).map((b) => b.label);
      let label = info.label; if (!mergeInto) { let i = 2; while (existing.includes(label)) label = `${info.label}-${i++}`; }
      const labelInput = textInput({ value: label, onInput: (e) => { label = e.target.value.trim(); } });
      const stages = [...new Set(info.completedSteps.map((s) => STEP_TO_STAGE[s]).filter(Boolean))].map((s) => STAGE_BY_NAME[s]?.label);
      render(h("div", { class: "stack" },
        h("div", { class: "card" }, h("div", { class: "card-body row", style: { gap: "16px", alignItems: "flex-start", flexWrap: "wrap" } }, h("div", { class: "cover", style: { width: "96px", aspectRatio: "3/4" } }, info.cover ? h("img", { src: URL.createObjectURL(info.cover), alt: "" }) : null), h("div", { class: "grow stack" }, h("h2", {}, info.book?.title ?? info.label), kv([["Type", info.part ? `Partie de livre (pages ${info.part.range.startPage}–${info.part.range.endPage} de ${info.part.sourceLabel})` : "Projet complet"], ["Pages", info.pageCount], ["Images", info.imageCount], ["Étapes terminées", stages.length ? stages.join(", ") : "aucune"]]), h("div", { class: "substeps" }, info.features.filter((f) => ["page-sectioning", "web-rendering", "quiz-generation", "glossary", "image-captioning", "toc-generation", "text-catalog-translation", "tts"].includes(f)).map((f) => badge(f, "accent")))))),
        mergeInto ? h("div", { class: "callout callout-accent" }, icon("git-merge"), h("div", {}, h("strong", {}, `Fusion dans « ${mergeInto} »`), h("p", { class: "muted small", style: { margin: 0 } }, "Les pages de cette partie remplaceront celles du livre coordinateur (nouvelles versions, l'historique est conservé)."))) : field("Nom du projet (identifiant)", labelInput, { hint: "Lettres, chiffres, « . », « - », « _ »." }),
        h("div", { class: "row" }, button("Essayer un autre fichier", { variant: "ghost", onClick: start }), h("div", { class: "grow" }), button(mergeInto ? "Fusionner la partie" : "Importer", { iconName: mergeInto ? "git-merge" : "download", onClick: async () => { if (!mergeInto && !LABEL_RE.test(label)) return toast("Nom de projet invalide", { kind: "error" }); if (!mergeInto && existing.includes(label)) return toast("Un livre porte déjà ce nom", { kind: "error" }); render(spinner(mergeInto ? "Fusion en cours…" : "Import en cours…")); try { const r = await importProject(file, { label: mergeInto ?? label, merge: !!mergeInto }); toast(mergeInto ? `Partie fusionnée (${r.pageCount} pages)` : `Projet importé (${r.pageCount} pages)`, { kind: "success" }); navigate(`/books/${r.label}/book`); } catch (e) { toast(e.message, { kind: "error" }); start(); } } }))));
    } catch (e) { toast(e.message, { kind: "error" }); start(); }
  };
  start();
  mount(renderAppLayout(h("div", { class: "stack" }, pageHead(mergeInto ? "Importer une partie renvoyée" : "Importer un projet", "Reprenez un projet exporté depuis ADT Studio (web ou bureau) ou une partie de livre traitée par un contributeur.", [button("Retour", { variant: "ghost", iconName: "arrow-left", onClick: () => history.back() })]), box)));
}
