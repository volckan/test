// Opérations sur l'arbre de sections (identifiants de nœuds, conversion LLM → modèle,
// dupliquer / scinder / fusionner / supprimer / élaguer, fusions inter-pages).
import { pad3, sectionIdOf } from "../util.js";

/** Convertit la sortie du LLM en PageSectioningOutput avec identifiants stables. */
export function fromLlmOutput(pageId, pageNumber, llm, { availableImageIds = new Set(), config = {} } = {}) {
  let tx = 0, gp = 0;
  const usedImages = new Set();
  const prunedRoles = new Set(config.pruned_role_types ?? []);
  const convert = (n) => {
    if (!n) return null;
    if (n.structure) {
      const children = (n.children ?? []).map(convert).filter(Boolean);
      const node = { nodeId: ["group", "activity", "sidebar", "panel", "image_group", "paragraph", "list", "table", "preformatted", "heading"].includes(n.structure) ? `${pageId}_gp${pad3(++gp)}` : `${pageId}_gp${pad3(++gp)}`, isPruned: false, structure: n.structure, children };
      if (!children.length && n.structure !== "table_cell") return null;
      return node;
    }
    if (n.role === "image") {
      const id = n.image_id;
      if (!id || !availableImageIds.has(id) || usedImages.has(id)) return null;
      usedImages.add(id);
      return { nodeId: id, imageId: id, isPruned: false, role: "image" };
    }
    if (!n.role) return null;
    const text = String(n.text ?? "").trim();
    if (!text) return null;
    const node = { nodeId: `${pageId}_tx${pad3(++tx)}`, isPruned: prunedRoles.has(n.role), role: n.role, text };
    if (n.heading_level) node.headingLevel = n.heading_level;
    if (n.outline_entry_id) node.outlineEntryId = n.outline_entry_id;
    if (n.heading_style_cluster_id) node.headingStyleClusterId = n.heading_style_cluster_id;
    return node;
  };
  const sections = (llm.sections ?? []).map((s, i) => ({
    sectionId: sectionIdOf(pageId, i + 1), sectionType: s.section_type || "other", backgroundColor: normalizeHex(s.background_color, "#ffffff"), textColor: normalizeHex(s.text_color, "#000000"),
    pageNumber: s.page_number ?? pageNumber, isPruned: (config.pruned_section_types ?? []).includes(s.section_type), nodes: (s.nodes ?? []).map(convert).filter(Boolean),
  })).filter((s) => s.nodes.length);
  return { reasoning: llm.reasoning ?? "", sections };
}
function normalizeHex(v, d) { const m = /^#?([0-9a-fA-F]{6})$/.exec(String(v ?? "").trim()); if (m) return `#${m[1].toLowerCase()}`; const m3 = /^#?([0-9a-fA-F]{3})$/.exec(String(v ?? "").trim()); if (m3) return `#${[...m3[1]].map((c) => c + c).join("").toLowerCase()}`; return d; }

/** Réattribue des identifiants de section séquentiels en conservant ceux existants quand c'est possible. */
export function renumberSections(pageId, sections) {
  const used = new Set();
  return sections.map((s) => { let id = s.sectionId; if (!id || used.has(id) || !id.startsWith(pageId)) { let seq = sections.length + 1; while (used.has(sectionIdOf(pageId, seq))) seq++; id = sectionIdOf(pageId, seq); } used.add(id); return { ...s, sectionId: id }; }).map((s, i, arr) => s);
}
export function nextSectionId(pageId, sections) { let seq = 1; const ids = new Set(sections.map((s) => s.sectionId)); while (ids.has(sectionIdOf(pageId, seq))) seq++; return sectionIdOf(pageId, seq); }

export function walkNodes(nodes, fn, parent = null) { for (const n of nodes ?? []) { fn(n, parent); if (n.children) walkNodes(n.children, fn, n); } }
export function findNode(nodes, nodeId) { let found = null; walkNodes(nodes, (n) => { if (n.nodeId === nodeId) found = n; }); return found; }
export function findParent(nodes, nodeId) { let found = null; walkNodes(nodes, (n, p) => { if (n.nodeId === nodeId) found = p; }); return found; }
export function removeNode(nodes, nodeId) {
  const idx = nodes.findIndex((n) => n.nodeId === nodeId);
  if (idx >= 0) return nodes.splice(idx, 1)[0];
  for (const n of nodes) if (n.children) { const r = removeNode(n.children, nodeId); if (r) return r; }
  return null;
}
export function maxTxSeq(sectioning) { let m = 0; for (const s of sectioning.sections) walkNodes(s.nodes, (n) => { const mm = /_tx(\d+)$/.exec(n.nodeId); if (mm) m = Math.max(m, Number(mm[1])); }); return m; }
export function maxGpSeq(sectioning) { let m = 0; for (const s of sectioning.sections) walkNodes(s.nodes, (n) => { const mm = /_gp(\d+)$/.exec(n.nodeId); if (mm) m = Math.max(m, Number(mm[1])); }); return m; }
export function newTextNode(pageId, sectioning, text = "Nouveau texte", role = "text") { return { nodeId: `${pageId}_tx${pad3(maxTxSeq(sectioning) + 1)}`, isPruned: false, role, text }; }
export function newGroupNode(pageId, sectioning, structure = "group", children = []) { return { nodeId: `${pageId}_gp${pad3(maxGpSeq(sectioning) + 1)}`, isPruned: false, structure, children }; }
export function newImageNode(imageId) { return { nodeId: imageId, imageId, isPruned: false, role: "image" }; }

export function cloneDeep(v) { return JSON.parse(JSON.stringify(v)); }

/** Duplique une section (nouveaux identifiants de nœuds). */
export function duplicateSection(pageId, sectioning, index) {
  const out = cloneDeep(sectioning);
  const src = out.sections[index];
  const copy = cloneDeep(src);
  let tx = maxTxSeq(out), gp = maxGpSeq(out);
  walkNodes(copy.nodes, (n) => { if (n.role === "image") { n.nodeId = `${n.nodeId}_dup${tx}`; } else if (n.role) n.nodeId = `${pageId}_tx${pad3(++tx)}`; else n.nodeId = `${pageId}_gp${pad3(++gp)}`; });
  copy.sectionId = nextSectionId(pageId, out.sections);
  out.sections.splice(index + 1, 0, copy);
  return out;
}
/** Scinde une section au nœud de premier niveau `nodeIndex` (il commence la nouvelle section). */
export function splitSection(pageId, sectioning, index, nodeIndex) {
  const out = cloneDeep(sectioning);
  const s = out.sections[index];
  if (nodeIndex <= 0 || nodeIndex >= s.nodes.length) return out;
  const tail = s.nodes.splice(nodeIndex);
  out.sections.splice(index + 1, 0, { ...cloneDeep(s), nodes: tail, sectionId: nextSectionId(pageId, out.sections) });
  return out;
}
/** Fusionne la section `index` avec la suivante (direction "next") ou la précédente ("prev"). */
export function mergeSections(sectioning, index, direction = "next") {
  const out = cloneDeep(sectioning);
  const j = direction === "next" ? index + 1 : index - 1;
  if (j < 0 || j >= out.sections.length) return out;
  const [a, b] = index < j ? [out.sections[index], out.sections[j]] : [out.sections[j], out.sections[index]];
  a.nodes = [...a.nodes, ...b.nodes];
  if (a.sectionType !== b.sectionType && b.sectionType.startsWith("activity_")) a.sectionType = b.sectionType;
  out.sections.splice(out.sections.indexOf(b), 1);
  return out;
}
export function deleteSection(sectioning, index) { const out = cloneDeep(sectioning); out.sections.splice(index, 1); return out; }
export function setSectionPruned(sectioning, index, pruned) { const out = cloneDeep(sectioning); out.sections[index].isPruned = pruned; return out; }

/** Fusion inter-pages : déplace les nœuds de la première section de `next` vers la dernière de `prev`. */
export function mergeCrossPage(prevSectioning, nextSectioning, { sourcePageId, direction = "pull-next" } = {}) {
  const a = cloneDeep(prevSectioning), b = cloneDeep(nextSectioning);
  if (!a.sections.length || !b.sections.length) return { prev: a, next: b };
  if (direction === "pull-next") {
    const target = a.sections[a.sections.length - 1], src = b.sections[0];
    target.nodes = [...target.nodes, ...src.nodes]; target.sourcePageIds = [...new Set([...(target.sourcePageIds ?? []), sourcePageId])];
    b.sections.shift();
  } else {
    const target = b.sections[0], src = a.sections[a.sections.length - 1];
    target.nodes = [...src.nodes, ...target.nodes]; target.sourcePageIds = [...new Set([...(target.sourcePageIds ?? []), sourcePageId])];
    a.sections.pop();
  }
  return { prev: a, next: b };
}

/** Texte lisible d'une section (hors élagués), pour la recherche et les quiz. */
export function sectionText(section, config = {}) {
  const pruned = new Set(config.pruned_role_types ?? []);
  const out = [];
  walkNodes(section.nodes, (n) => { if (n.role && n.role !== "image" && !n.isPruned && !pruned.has(n.role)) out.push(n.text); });
  return out.join(" ");
}

/** Premier titre d'une section (pour la table des matières). */
export function sectionHeading(section) {
  let h = null;
  walkNodes(section.nodes, (n) => { if (!h && n.role && ["chapter_title", "section_heading", "subheading", "heading"].includes(n.role) && !n.isPruned) h = n; });
  return h;
}
export function headingLevelOf(node) {
  if (!node) return null;
  if (node.headingLevel) return node.headingLevel;
  return { chapter_title: 1, section_heading: 2, subheading: 3, heading: 4 }[node.role] ?? null;
}

/** Arbre de rendu (format attendu par les gabarits et prompts) : node_id, text, role/structure, image_url, children. */
export function toRenderNodes(nodes, { imageUrl = (id) => `images/${id}.png`, texts = null, includePruned = false } = {}) {
  const conv = (n) => {
    if (!n || (n.isPruned && !includePruned)) return null;
    if (n.role === "image") return { node_id: n.nodeId, role: "image", image_id: n.imageId ?? n.nodeId, image_url: imageUrl(n.imageId ?? n.nodeId) };
    if (n.role) return { node_id: n.nodeId, role: n.role, text: texts?.[n.nodeId] ?? n.text, heading_level: n.headingLevel ?? null };
    const children = (n.children ?? []).map(conv).filter(Boolean);
    if (!children.length && n.structure !== "table_cell") return null;
    return { node_id: n.nodeId, structure: n.structure, children };
  };
  return (nodes ?? []).map(conv).filter(Boolean);
}
export function leafTexts(renderNodes) { const out = []; const walk = (n) => { if (n.role && n.role !== "image") out.push({ text_id: n.node_id, text: n.text }); for (const c of n.children ?? []) walk(c); }; renderNodes.forEach(walk); return out; }
export function imageRefs(renderNodes) { const out = []; const walk = (n) => { if (n.role === "image") out.push({ image_id: n.image_id }); for (const c of n.children ?? []) walk(c); }; renderNodes.forEach(walk); return out; }
export function groupIds(renderNodes) { const out = []; const walk = (n) => { if (n.structure && ["group", "activity"].includes(n.structure)) out.push(n.node_id); for (const c of n.children ?? []) walk(c); }; renderNodes.forEach(walk); return out; }
