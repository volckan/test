// Vue « Sectionnement » : réglages, pages, éditeur d'arbre de sections.
import { h, button, icon, badge, toast, dialog, confirmDialog, segmented, switchRow, select, textInput, field, promptDialog } from "../dom.js";
import { runCard, prereqGuard, pageThumbs, pageImage, patchBookConfig, versionPicker, startStage } from "./common.js";
import { SECTION_TYPE_LABELS, ROLE_LABELS, STRUCTURE_LABELS } from "../../config.js";
import { duplicateSection, splitSection, mergeSections, deleteSection, setSectionPruned, mergeCrossPage, walkNodes, findNode, findParent, removeNode, newTextNode, newGroupNode, newImageNode, cloneDeep, nextSectionId, sectionText } from "../../pipeline/section-tree.js";
import { effectiveImages } from "../../pipeline/steps/extract.js";
import { runStages } from "../../pipeline/runner.js";
import { nowIso } from "../../util.js";

export async function renderSectioning(ctx, container) {
  if (ctx.pageId) return renderPage(ctx, container);
  const cfg = ctx.config;
  const outline = await ctx.storage.getNodeData("book-outline", "book");
  const settings = h("div", { class: "card" }, h("div", { class: "card-body stack" }, h("h3", { style: { margin: 0 } }, "Réglages du sectionnement"),
    h("div", { class: "field" }, h("span", { class: "field-label" }, "Mode de sectionnement"), segmented([["dynamic", "Dynamique"], ["page", "Par page"]], cfg.page_sectioning?.mode ?? "dynamic", (v) => patchBookConfig(ctx, { page_sectioning: { mode: v } })), h("span", { class: "field-hint" }, "Dynamique : la page est scindée quand plusieurs mécaniques d'activité distinctes sont détectées.")),
    switchRow("Détection des activités", cfg.generate_activities !== false, (v) => patchBookConfig(ctx, { generate_activities: v }), { hint: "Classe les exercices (QCM, vrai/faux, texte à trous, association…) en sections d'activité interactives." }),
    !outline?.entries?.length && ctx.statuses.extract?.status === "done" ? h("div", { class: "callout callout-warning small" }, icon("alert"), h("div", {}, "La hiérarchie du livre (plan) n'est pas construite : les niveaux de titres seront déduits page par page. ", button("Construire le plan", { size: "sm", variant: "secondary", onClick: () => runStages(ctx.label, "extract", "extract", { onlySteps: ["book-outline"] }) }))) : null));
  container.appendChild(h("div", { class: "stack" }, settings, runCard(ctx, "sectioning")));
  if (prereqGuard(ctx, "sectioning", container)) return;
  const grid = await pageThumbs(ctx, { onPick: (p) => ctx.go("sectioning", p.pageId), annotate: async (p) => { const s = await ctx.storage.getNodeData("page-sectioning", p.pageId); return s ? badge(`${s.sections.length} section${s.sections.length > 1 ? "s" : ""}${s.manualEdit ? " · édité" : ""}`, "accent") : badge("—"); } });
  container.appendChild(h("div", { class: "stack" }, h("h2", {}, "Pages"), grid));
}

async function renderPage(ctx, container) {
  const page = await ctx.storage.getPage(ctx.pageId);
  const sectioning = await ctx.storage.getNodeData("page-sectioning", ctx.pageId);
  const idx = ctx.pages.findIndex((p) => p.pageId === ctx.pageId);
  const nav = h("div", { class: "row between row-wrap" }, button("Précédente", { variant: "ghost", iconName: "chevron-left", disabled: idx <= 0, onClick: () => ctx.go("sectioning", ctx.pages[idx - 1].pageId) }), h("h2", { style: { margin: 0 } }, `Page ${page.pageNumber}`), h("div", { class: "row" }, button("Restructurer cette page (IA)", { size: "sm", variant: "secondary", iconName: "sparkles", onClick: async () => { if (sectioning?.manualEdit && !(await confirmDialog({ title: "Remplacer vos modifications ?", text: "La page sera restructurée par l'IA ; vos modifications manuelles restent dans l'historique des versions.", confirmLabel: "Restructurer" }))) return; runStages(ctx.label, "sectioning", "sectioning", { onlySteps: ["page-sectioning"], pageIds: [ctx.pageId], force: true }); } }), button("Suivante", { variant: "ghost", iconName: "chevron-right", disabled: idx >= ctx.pages.length - 1, onClick: () => ctx.go("sectioning", ctx.pages[idx + 1].pageId) })));
  container.appendChild(nav);
  if (!sectioning) { container.appendChild(h("div", { class: "empty" }, h("h3", {}, "Page non structurée"), button("Structurer cette page", { iconName: "play", onClick: () => runStages(ctx.label, "sectioning", "sectioning", { onlySteps: ["page-sectioning"], pageIds: [ctx.pageId] }) }))); return; }
  const editor = new TreeEditor(ctx, page, sectioning);
  container.appendChild(h("div", { class: "split split-1-2" }, h("div", { class: "stack" }, pageImage(ctx, page.pageId), h("details", { class: "acc" }, h("summary", {}, "Raisonnement du modèle"), h("p", { class: "small muted" }, sectioning.reasoning))), editor.el));
}

class TreeEditor {
  constructor(ctx, page, sectioning) {
    this.ctx = ctx; this.page = page; this.original = sectioning; this.data = cloneDeep(sectioning); this.dirty = false;
    this.el = h("div", { class: "stack" }); this.render();
  }
  markDirty() { this.dirty = true; this.render(); }
  async save() {
    for (const s of this.data.sections) if (!s.nodes.length) { toast("Une section est vide : supprimez-la ou ajoutez du contenu.", { kind: "error" }); return; }
    await this.ctx.storage.putNodeData("page-sectioning", this.page.pageId, { ...this.data, manualEdit: true, editedAt: nowIso() }, { manualEdit: true });
    const { invalidateDownstream } = await import("../../pipeline/runner.js"); await invalidateDownstream(this.ctx.label, "sectioning");
    this.dirty = false; toast("Sections enregistrées. Relancez le scénarimage pour cette page.", { kind: "success", action: { label: "Rendre la page", onClick: () => runStages(this.ctx.label, "storyboard", "storyboard", { pageIds: [this.page.pageId], force: true }) } });
    this.ctx.refresh();
  }
  render() {
    const el = this.el; el.innerHTML = "";
    el.appendChild(h("div", { class: "row between row-wrap" }, h("h3", { style: { margin: 0 } }, `${this.data.sections.length} section${this.data.sections.length > 1 ? "s" : ""}`), h("div", { class: "row" }, this.dirty ? badge("Modifications non enregistrées", "warning") : null, this.dirty ? button("Abandonner", { size: "sm", variant: "ghost", onClick: () => { this.data = cloneDeep(this.original); this.dirty = false; this.render(); } }) : null, button("Enregistrer", { size: "sm", iconName: "check", disabled: !this.dirty, onClick: () => this.save() }))));
    versionPicker(this.ctx.storage, "page-sectioning", this.page.pageId, { onChange: () => this.ctx.refresh() }).then((vp) => el.insertBefore(vp, el.children[1] ?? null));
    this.data.sections.forEach((s, i) => el.appendChild(this.sectionBox(s, i)));
  }
  sectionBox(s, i) {
    const types = Object.keys(SECTION_TYPE_LABELS).filter((k) => k !== "fixed-layout-page");
    const head = h("div", { class: "section-box-head" }, h("strong", { class: "mono small" }, s.sectionId), select(types.map((t) => [t, SECTION_TYPE_LABELS[t]]), s.sectionType, { onChange: (v) => { s.sectionType = v; this.markDirty(); }, attrs: { style: "width:auto", "aria-label": "Type de section" } }), s.isPruned ? badge("Élaguée", "warning") : null, s.sourcePageIds?.length ? badge(`+ ${s.sourcePageIds.join(", ")}`, "accent") : null,
      h("span", { class: "grow" }), h("input", { type: "color", value: s.backgroundColor ?? "#ffffff", title: "Couleur de fond", "aria-label": "Couleur de fond", onInput: (e) => { s.backgroundColor = e.target.value; this.dirty = true; } }), h("input", { type: "color", value: s.textColor ?? "#000000", title: "Couleur du texte", "aria-label": "Couleur du texte", onInput: (e) => { s.textColor = e.target.value; this.dirty = true; } }),
      this.menu([["Dupliquer", () => { this.data = duplicateSection(this.page.pageId, this.data, i); this.markDirty(); }], ["Fusionner avec la précédente", () => { this.data = mergeSections(this.data, i, "prev"); this.markDirty(); }, i === 0], ["Fusionner avec la suivante", () => { this.data = mergeSections(this.data, i, "next"); this.markDirty(); }, i === this.data.sections.length - 1], ["Fusionner avec la dernière section de la page précédente", () => this.crossMerge("prev", i), i !== 0], ["Fusionner avec la première section de la page suivante", () => this.crossMerge("next", i), i !== this.data.sections.length - 1], [s.isPruned ? "Restaurer la section" : "Élaguer la section", () => { this.data = setSectionPruned(this.data, i, !s.isPruned); this.markDirty(); }], ["Ajouter un texte", () => { s.nodes.push(newTextNode(this.page.pageId, this.data)); this.markDirty(); }], ["Ajouter un groupe", () => { s.nodes.push(newGroupNode(this.page.pageId, this.data, "group", [newTextNode(this.page.pageId, this.data)])); this.markDirty(); }], ["Ajouter une image…", () => this.addImage(s)], ["Supprimer la section", () => { this.data = deleteSection(this.data, i); this.markDirty(); }]]));
    const body = h("div", { class: ["section-box-body", "tree"] }, this.nodesView(s.nodes, s, null));
    return h("div", { class: "section-box", style: { opacity: s.isPruned ? 0.6 : 1 } }, head, body);
  }
  menu(items) {
    const btn = button("", { variant: "ghost", size: "sm", iconName: "more", title: "Actions" });
    btn.addEventListener("click", () => { const { close } = dialog({ title: "Actions sur la section", size: "sm", body: h("div", { class: "stack", style: { gap: "4px" } }, items.filter(([, , hidden]) => !hidden).map(([label, fn]) => button(label, { variant: "secondary", onClick: () => { close(); fn(); } }))) }); });
    return btn;
  }
  async crossMerge(direction, i) {
    const pages = this.ctx.pages; const idx = pages.findIndex((p) => p.pageId === this.page.pageId);
    const other = direction === "prev" ? pages[idx - 1] : pages[idx + 1]; if (!other) return toast("Pas de page voisine", { kind: "warning" });
    const otherData = await this.ctx.storage.getNodeData("page-sectioning", other.pageId); if (!otherData) return toast("La page voisine n'est pas structurée", { kind: "warning" });
    if (!(await confirmDialog({ title: "Fusionner entre pages ?", text: `Le contenu de la section sera déplacé vers la page ${other.pageNumber}. Les deux pages seront enregistrées.`, confirmLabel: "Fusionner" }))) return;
    let prev, next;
    if (direction === "prev") ({ prev, next } = mergeCrossPage(otherData, this.data, { sourcePageId: this.page.pageId, direction: "pull-next" }));
    else ({ prev, next } = mergeCrossPage(this.data, otherData, { sourcePageId: this.page.pageId, direction: "push-prev" }));
    await this.ctx.storage.putNodeData("page-sectioning", other.pageId, { ...(direction === "prev" ? prev : next), manualEdit: true }, { manualEdit: true });
    this.data = direction === "prev" ? next : prev; await this.save();
  }
  async addImage(section) {
    const imgs = (await effectiveImages(this.ctx.storage, this.page.pageId)).filter((im) => im.kept);
    const used = new Set(); for (const s of this.data.sections) walkNodes(s.nodes, (n) => { if (n.role === "image") used.add(n.imageId ?? n.nodeId); });
    const avail = imgs.filter((im) => !used.has(im.imageId));
    if (!avail.length) return toast("Toutes les images conservées sont déjà placées", { kind: "info" });
    const { close } = dialog({ title: "Ajouter une image", body: h("div", { class: "thumb-grid" }, avail.map((im) => h("button", { type: "button", class: "thumb-card", onClick: () => { section.nodes.push(newImageNode(im.imageId)); close(); this.markDirty(); } }, h("img", { alt: im.imageId, src: "" }), h("span", { class: "small mono" }, im.imageId)))) });
    for (const [k, im] of avail.entries()) { const b = await this.ctx.storage.getImageBlob(im.imageId); const img = document.querySelectorAll(".dialog .thumb-card img")[k]; if (img && b) img.src = URL.createObjectURL(b); }
  }
  nodesView(nodes, section, parent) {
    const wrap = h("div", { class: parent ? "tree-children" : "" });
    nodes.forEach((n, idx) => {
      const row = h("div", { class: ["tree-node", n.isPruned && "pruned"], draggable: true, dataset: { nodeId: n.nodeId } });
      row.addEventListener("dragstart", (e) => { e.stopPropagation(); e.dataTransfer.setData("text/plain", n.nodeId); });
      row.addEventListener("dragover", (e) => { e.preventDefault(); e.stopPropagation(); row.style.outline = "2px solid var(--accent)"; });
      row.addEventListener("dragleave", () => { row.style.outline = ""; });
      row.addEventListener("drop", (e) => { e.preventDefault(); e.stopPropagation(); row.style.outline = ""; const id = e.dataTransfer.getData("text/plain"); if (id === n.nodeId) return; let moved = null; for (const s of this.data.sections) { moved = removeNode(s.nodes, id); if (moved) break; } if (!moved) return; const list = parent ? parent.children : section.nodes; const at = list.indexOf(n); list.splice(at < 0 ? list.length : at, 0, moved); this.markDirty(); });
      if (n.role === "image") row.appendChild(h("span", { class: "tree-tag" }, "image"), h("span", { class: "mono small grow" }, n.imageId ?? n.nodeId));
      else if (n.role) {
        row.appendChild(select(Object.entries(ROLE_LABELS).filter(([k]) => k !== "image").map(([k, l]) => [k, l]), n.role, { onChange: (v) => { n.role = v; if (!["heading", "chapter_title", "section_heading", "subheading"].includes(v)) delete n.headingLevel; this.dirty = true; this.render(); }, attrs: { class: "input select", style: "width:auto;min-height:26px;padding:0 6px;font-size:12px" } }));
        if (n.role === "heading") row.appendChild(select([1, 2, 3, 4, 5, 6].map((l) => [l, `H${l}`]), n.headingLevel ?? 4, { onChange: (v) => { n.headingLevel = Number(v); this.dirty = true; }, attrs: { style: "width:auto;min-height:26px;padding:0 6px;font-size:12px" } }));
        const txt = h("div", { class: "tree-text", contenteditable: "true", spellcheck: "false", title: "Cliquer pour modifier" }, n.text);
        txt.addEventListener("input", () => { n.text = txt.textContent; this.dirty = true; }); txt.addEventListener("blur", () => { if (this.dirty) this.render(); });
        txt.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); txt.blur(); } });
        row.appendChild(txt);
      } else row.appendChild(h("span", { class: "tree-tag struct" }, STRUCTURE_LABELS[n.structure] ?? n.structure), h("span", { class: "grow" }));
      const list = parent ? parent.children : section.nodes;
      row.appendChild(h("span", { class: "row", style: { gap: "2px" } }, button("", { variant: "ghost", size: "sm", iconName: "arrow-up", title: "Monter", disabled: idx === 0, onClick: () => { [list[idx - 1], list[idx]] = [list[idx], list[idx - 1]]; this.markDirty(); } }), button("", { variant: "ghost", size: "sm", iconName: "arrow-down", title: "Descendre", disabled: idx === list.length - 1, onClick: () => { [list[idx + 1], list[idx]] = [list[idx], list[idx + 1]]; this.markDirty(); } }), button("", { variant: "ghost", size: "sm", iconName: "more", title: "Actions", onClick: () => this.nodeMenu(n, list, idx, section, parent) })));
      wrap.appendChild(row);
      if (n.children) wrap.appendChild(this.nodesView(n.children, section, n));
    });
    return wrap;
  }
  nodeMenu(n, list, idx, section, parent) {
    const items = [
      [n.isPruned ? "Inclure dans le rendu" : "Exclure du rendu", () => { n.isPruned = !n.isPruned; this.markDirty(); }],
      ["Dupliquer", () => { const copy = cloneDeep(n); let k = 0; walkNodes([copy], (x) => { if (x.role === "image") x.nodeId = `${x.nodeId}_d${Date.now()}`; else if (x.role) x.nodeId = newTextNode(this.page.pageId, this.data).nodeId + String(k++); else x.nodeId = newGroupNode(this.page.pageId, this.data).nodeId + String(k++); }); list.splice(idx + 1, 0, copy); this.markDirty(); }],
      ["Envelopper dans un groupe", () => { const g = newGroupNode(this.page.pageId, this.data, "group", [n]); list.splice(idx, 1, g); this.markDirty(); }],
      parent ? ["Sortir du groupe", () => { list.splice(idx, 1); const gp = findParent(section.nodes, parent.nodeId); const plist = gp ? gp.children : section.nodes; plist.splice(plist.indexOf(parent) + 1, 0, n); if (!parent.children.length) plist.splice(plist.indexOf(parent), 1); this.markDirty(); }] : null,
      !parent && idx > 0 ? ["Scinder la section ici", () => { const si = this.data.sections.indexOf(section); this.data = splitSection(this.page.pageId, this.data, si, idx); this.markDirty(); }] : null,
      n.children ? ["Ajouter un texte dans ce conteneur", () => { n.children.push(newTextNode(this.page.pageId, this.data)); this.markDirty(); }] : null,
      n.children ? ["Changer le type de conteneur…", async () => { const { close } = dialog({ title: "Type de conteneur", size: "sm", body: h("div", { class: "stack", style: { gap: "4px" } }, Object.entries(STRUCTURE_LABELS).map(([k, l]) => button(l, { variant: k === n.structure ? "primary" : "secondary", onClick: () => { n.structure = k; close(); this.markDirty(); } }))) }); }] : null,
      ["Supprimer", () => { list.splice(idx, 1); this.markDirty(); }],
    ].filter(Boolean);
    const { close } = dialog({ title: "Actions sur le nœud", size: "sm", body: h("div", { class: "stack", style: { gap: "4px" } }, items.map(([label, fn]) => button(label, { variant: "secondary", onClick: () => { close(); fn(); } }))) });
  }
}
