// Exports : archive de projet (import/export), paquet web, SCORM, WebPub (Readium), EPUB 3, PNLD.
import { zipFiles, loadJSZip, loadPackageFiles, wordSpans } from "./web.js";
import { BookStorage, createBook, bookEvents } from "../storage.js";
import { idb } from "../db.js";
import { escapeXml, escapeHtml, nowIso, uuid, slugify, baseLanguage } from "../util.js";
import { parseHtml } from "../pipeline/validate-html.js";

// ── Archive de projet ───────────────────────────────────────────────────────
export async function exportProject(label, { pageRange = null, partOf = null, onProgress } = {}) {
  const st = new BookStorage(label);
  const book = await st.getBook();
  const files = new Map();
  const inRange = (p) => !pageRange || (p.pageNumber >= pageRange.startPage && p.pageNumber <= pageRange.endPage);
  const pages = (await st.getPages()).filter(inRange);
  const pageIds = new Set(pages.map((p) => p.pageId));
  onProgress?.("Pages", 0.1);
  files.set("book.json", JSON.stringify({ adtProject: 2, label, book, exportedAt: nowIso(), part: pageRange ? { sourceLabel: partOf ?? label, range: pageRange, pageCount: (await st.getPages()).length, createdAt: nowIso() } : null }, null, 1));
  files.set("pages.json", JSON.stringify(pages));
  const images = (await st.getImages()).filter((im) => !pageRange || pageIds.has(im.pageId));
  files.set("images.json", JSON.stringify(images));
  onProgress?.("Images", 0.2);
  for (const im of images) { const b = await st.getImageBlob(im.imageId); if (b) files.set(`images/${im.imageId}.${b.type === "image/jpeg" ? "jpg" : "png"}`, b); }
  onProgress?.("Entités", 0.5);
  const nodes = await idb.getAllByIndex("node_data", "byLabel", label);
  const current = await idb.getAllByIndex("node_current", "byLabel", label);
  const keepRow = (r) => !pageRange || !/^pg\d+/.test(r.itemId) || pageIds.has(r.itemId.split("_")[0]) || pageIds.has(r.itemId);
  files.set("node_data.json", JSON.stringify(nodes.filter(keepRow).map(({ label: _l, ...r }) => r)));
  files.set("node_current.json", JSON.stringify(current.filter(keepRow).map(({ label: _l, ...r }) => r)));
  files.set("step_runs.json", JSON.stringify((await idb.getAllByIndex("step_runs", "byLabel", label)).map(({ label: _l, ...r }) => r)));
  files.set("llm_log.json", JSON.stringify((await st.getAllLlmLogs()).map(({ label: _l, id, ...r }) => r)));
  onProgress?.("Fichiers", 0.7);
  for (const row of await st.listBlobsWithData("")) { if (row.key.startsWith("images/") || row.key.startsWith("adt/")) continue; files.set(`files/${row.key}`, row.blob); }
  onProgress?.("Compression", 0.85);
  const blob = await zipFiles(files);
  onProgress?.("Terminé", 1);
  return { blob, filename: pageRange ? `${slugify(label)}-part-${pageRange.startPage}-${pageRange.endPage}.zip` : `${slugify(label)}-project.zip` };
}

export async function previewImport(zipBlob) {
  const JSZip = await loadJSZip();
  const zip = await JSZip.loadAsync(zipBlob);
  const bj = zip.file("book.json"); if (!bj) throw new Error("Archive invalide : book.json manquant");
  const book = JSON.parse(await bj.async("string"));
  const pages = zip.file("pages.json") ? JSON.parse(await zip.file("pages.json").async("string")) : [];
  const nodes = zip.file("node_data.json") ? JSON.parse(await zip.file("node_data.json").async("string")) : [];
  const stepRuns = zip.file("step_runs.json") ? JSON.parse(await zip.file("step_runs.json").async("string")) : [];
  const features = [...new Set(nodes.map((n) => n.node))];
  const imageCount = Object.keys(zip.files).filter((f) => f.startsWith("images/")).length;
  let cover = null; const coverId = book.book?.coverPageId ?? pages[0]?.pageId; const cf = coverId ? Object.keys(zip.files).find((f) => f.startsWith(`images/${coverId}_page`)) : null; if (cf) cover = await zip.file(cf).async("blob");
  return { label: book.label, book: book.book, part: book.part, pageCount: pages.length, imageCount, features, completedSteps: stepRuns.filter((r) => r.status === "done").map((r) => r.step), cover, zip };
}

export async function importProject(zipBlob, { label: newLabel, merge = false } = {}) {
  const info = await previewImport(zipBlob);
  const zip = info.zip; const label = newLabel ?? info.label;
  let st;
  if (merge) { st = new BookStorage(label); if (!(await st.getBook())) throw new Error("Livre cible introuvable pour la fusion"); }
  else { st = await createBook({ label, config: info.book?.config ?? {}, pdfName: info.book?.pdfName, title: info.book?.title ?? null }); await st.updateBook({ ...info.book, label, part: info.part ?? null, createdAt: nowIso() }); }
  const pages = JSON.parse(await zip.file("pages.json").async("string"));
  await st.putPages(pages);
  const images = zip.file("images.json") ? JSON.parse(await zip.file("images.json").async("string")) : [];
  for (const im of images) { const f = zip.file(`images/${im.imageId}.png`) ?? zip.file(`images/${im.imageId}.jpg`); const blob = f ? await f.async("blob") : null; await st.putImage({ ...im, label }, blob ? new Blob([blob], { type: f.name.endsWith(".jpg") ? "image/jpeg" : "image/png" }) : null); }
  const nodes = zip.file("node_data.json") ? JSON.parse(await zip.file("node_data.json").async("string")) : [];
  const current = zip.file("node_current.json") ? JSON.parse(await zip.file("node_current.json").async("string")) : [];
  if (merge) {
    // fusion d'une partie : on remplace les entités des pages couvertes, en nouvelles versions
    const byItem = new Map(); for (const r of nodes) { const k = `${r.node}|${r.itemId}`; const cur = current.find((c) => c.node === r.node && c.itemId === r.itemId); if (cur ? r.version === cur.version : !byItem.has(k) || byItem.get(k).version < r.version) byItem.set(k, r); }
    for (const r of byItem.values()) if (/^pg\d+/.test(r.itemId) || r.node === "prompt") await st.putNodeData(r.node, r.itemId, r.data, { importedFrom: info.label });
  } else {
    await idb.putMany("node_data", nodes.map((r) => ({ ...r, label })));
    await idb.putMany("node_current", current.map((r) => ({ ...r, label })));
    const runs = zip.file("step_runs.json") ? JSON.parse(await zip.file("step_runs.json").async("string")) : [];
    await idb.putMany("step_runs", runs.map((r) => ({ ...r, label })));
    const logs = zip.file("llm_log.json") ? JSON.parse(await zip.file("llm_log.json").async("string")) : [];
    for (const l of logs.slice(-2000)) await idb.add("llm_log", { ...l, label });
  }
  for (const [name, entry] of Object.entries(zip.files)) if (name.startsWith("files/") && !entry.dir) { const key = name.slice(6); const blob = await entry.async("blob"); const type = key.endsWith(".pdf") ? "application/pdf" : key.endsWith(".mp3") ? "audio/mpeg" : key.endsWith(".wav") ? "audio/wav" : key.endsWith(".mp4") ? "video/mp4" : key.endsWith(".webm") ? "video/webm" : ""; await st.putBlob(key, new Blob([blob], { type })); }
  if (merge) { const b = await st.getBook(); const merged = { ...(b.split ?? {}), mergedRanges: [...(b.split?.mergedRanges ?? []), info.part?.range].filter(Boolean) }; await st.updateBook({ split: merged }); }
  bookEvents.emit("book-created", { label });
  return { label, pageCount: pages.length };
}

// ── Exports ADT ─────────────────────────────────────────────────────────────
export async function exportAdtZip(storage, title) { const files = await loadPackageFiles(storage); if (!files.size) throw new Error("Aucun paquet : lancez d'abord l'aperçu / l'empaquetage."); return { blob: await zipFiles(files), filename: `${slugify(title)}-adt.zip` }; }
export async function exportScormZip(storage, title) { const files = await loadPackageFiles(storage); if (!files.size) throw new Error("Aucun paquet : lancez d'abord l'empaquetage."); return { blob: await zipFiles(files), filename: `${slugify(title)}-scorm.zip` }; }

async function text(v) { return typeof v === "string" ? v : v.text(); }
function stripRuntime(html) { return html.replace(/<script[^>]*src="assets\/(adt-runtime|offline-preloader|scorm)\.js"[^>]*><\/script>\s*/g, "").replace(/<link rel="manifest"[^>]*>\s*/, ""); }

/** WebPub (Readium Web Publication Manifest). */
export async function exportWebpub(storage, title) {
  const files = await loadPackageFiles(storage); if (!files.size) throw new Error("Aucun paquet.");
  const out = new Map();
  const pages = JSON.parse(await text(files.get("content/pages.json")));
  const toc = JSON.parse(await text(files.get("content/toc.json")));
  const cfg = JSON.parse(await text(files.get("assets/config.json")));
  const meta = await storage.getNodeData("metadata", "book");
  for (const [p, v] of files) { if (p === "imsmanifest.xml" || p === "assets/scorm.js" || p === "assets/offline-preloader.js") continue; out.set(p, p.endsWith(".html") ? stripRuntime(await text(v)).replace("</head>", `<style>body{padding:0 !important}</style></head>`) : v); }
  cfg.features.showNavigationControls = false; cfg.features.showTutorial = false; out.set("assets/config.json", JSON.stringify(cfg));
  const resources = [...out.keys()].filter((p) => !p.endsWith(".html") && p !== "manifest.json").map((p) => ({ href: p, type: mimeOf(p) }));
  const nest = (entries) => { const root = []; const stack = []; for (const e of entries) { const node = { href: e.href, title: e.title }; while (stack.length && stack[stack.length - 1].level >= (e.level ?? 1)) stack.pop(); if (stack.length) (stack[stack.length - 1].node.children ??= []).push(node); else root.push(node); stack.push({ level: e.level ?? 1, node }); } return root; };
  const manifest = { "@context": "https://readium.org/webpub-manifest/context.jsonld", metadata: { "@type": "http://schema.org/Book", conformsTo: ["https://readium.org/webpub-manifest/profiles/epub"], title, language: cfg.languages.available, modified: nowIso(), ...(cfg.fixedLayout ? { layout: "fixed", presentation: { fit: "contain", spread: "none" } } : { presentation: { overflow: "scrolled", spread: "none" } }), ...(meta?.authors?.length ? { author: meta.authors } : {}), ...(meta?.publisher ? { publisher: meta.publisher } : {}), accessibility: { accessMode: ["textual", "visual", ...(cfg.features.readAloud ? ["auditory"] : [])], accessModeSufficient: [["textual", "visual"]], feature: ["readingOrder", ...(toc.length ? ["tableOfContents"] : []), ...(cfg.features.glossary ? ["index"] : []), "alternativeText", ...(cfg.features.highlight ? ["synchronizedAudioText"] : []), ...(cfg.features.signLanguage ? ["signLanguage"] : [])], hazard: ["none"], summary: "Livre numérique accessible produit par ADT Studio Web." } }, links: [{ rel: "self", href: "manifest.json", type: "application/webpub+json" }, ...(out.has("cover.png") ? [{ rel: "cover", href: "cover.png", type: "image/png" }] : [])], readingOrder: pages.map((p) => ({ href: p.href, type: "text/html", title: p.page_number != null ? String(p.page_number) : p.section_id })), resources, toc: nest(toc), pageList: pages.filter((p) => p.page_number != null).map((p) => ({ href: p.href, title: String(p.page_number) })) };
  out.set("manifest.json", JSON.stringify(manifest, null, 1));
  return { blob: await zipFiles(out), filename: `${slugify(title)}.webpub` };
}
function mimeOf(p) { const ext = p.split(".").pop().toLowerCase(); return { json: "application/json", css: "text/css", js: "text/javascript", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", mp3: "audio/mpeg", wav: "audio/wav", mp4: "video/mp4", webm: "video/webm", html: "text/html", xhtml: "application/xhtml+xml", xml: "application/xml", txt: "text/plain", smil: "application/smil+xml", woff2: "font/woff2" }[ext] ?? "application/octet-stream"; }

/** EPUB 3 (avec overlays SMIL si horodatages, glossaire en popup/pages). */
export async function exportEpub(storage, title, { glossaryMode = "word", placements = ["end"] } = {}) {
  const files = await loadPackageFiles(storage); if (!files.size) throw new Error("Aucun paquet.");
  const cfg = JSON.parse(await text(files.get("assets/config.json")));
  const pages = JSON.parse(await text(files.get("content/pages.json")));
  const toc = JSON.parse(await text(files.get("content/toc.json")));
  const lang = cfg.languages.default; const i18n = `content/i18n/${lang}/`;
  const texts = JSON.parse(await text(files.get(`${i18n}texts.json`)) ?? "{}");
  const audios = JSON.parse(await text(files.get(`${i18n}audios.json`)) ?? "{}");
  const tcs = JSON.parse(await text(files.get(`${i18n}timecode/timecode_output.json`)) ?? "{}");
  const glossary = files.has(`${i18n}glossary.json`) ? JSON.parse(await text(files.get(`${i18n}glossary.json`))) : {};
  const meta = await storage.getNodeData("metadata", "book");
  const out = new Map();
  out.set("mimetype", "application/epub+zip");
  out.set("META-INF/container.xml", `<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oasis.opendocument.package+xml"/></rootfiles></container>`.replace("application/oasis.opendocument.package+xml", "application/oebps-package+xml"));
  if (cfg.fixedLayout) out.set("META-INF/com.apple.ibooks.display-options.xml", `<?xml version="1.0" encoding="UTF-8"?><display_options><platform name="*"><option name="fixed-layout">true</option></platform></display_options>`);
  const manifestItems = []; const spine = []; const durations = {}; let totalDur = 0;
  const glossEntries = Object.values(glossary);
  const useAudio = cfg.features.readAloud;
  // Ressources statiques
  for (const [p, v] of files) { if (p.endsWith(".html") || p === "imsmanifest.xml" || p === "manifest.json" || p === "README.txt" || p.startsWith("assets/scorm") || p.startsWith("assets/offline") || p.startsWith("assets/adt-runtime") || p.startsWith("assets/interface_translations") || p.endsWith(".json") || p.startsWith("assets/sounds")) continue; if (p.startsWith(`${i18n}audio/`) && !useAudio) continue; if (p.includes("--secondary")) continue; out.set(`OEBPS/${p}`, v); manifestItems.push({ id: idFor(p), href: p, type: mimeOf(p), props: p === "cover.png" ? "cover-image" : "" }); }
  // Pages XHTML
  const usedTerms = new Set();
  for (const pg of pages) {
    const html = await text(files.get(pg.href));
    const doc = parseHtml(html.replace(/^[\s\S]*?<body[^>]*>/i, "").replace(/<\/body>[\s\S]*$/i, ""));
    const main = doc.body.querySelector("main") ?? doc.body;
    for (const s of main.querySelectorAll("script")) s.remove();
    const smilRefs = [];
    for (const el of main.querySelectorAll("[data-id]")) {
      const id = el.getAttribute("data-id"); el.id = el.id || id;
      if (el.tagName.toLowerCase() === "img") continue;
      const t = texts[id] ?? el.textContent;
      if (useAudio && audios[id] && tcs[id]) { const words = tcs[id].timecodes?.[1]?.word_timestamps ?? []; const n = (t.match(/[\p{L}\p{N}\p{M}]+(?:[’'-][\p{L}\p{N}\p{M}]+)*/gu) ?? []).length; if (words.length === n && n > 0 && !el.querySelector("*")) el.innerHTML = wordSpans(t, id); smilRefs.push({ id, words: words.length === n ? words : null, dur: tcs[id].duration ?? (words.at(-1)?.end ?? 0), audio: audios[id] }); }
      if (glossaryMode !== "page" && glossEntries.length && !el.querySelector("*") && !/^H[1-6]$/.test(el.tagName)) {
        let changed = false; let htmlText = el.innerHTML;
        for (const g of glossEntries) { if (usedTerms.has(g.id)) continue; const forms = [g.word, ...(g.variations ?? [])].filter(Boolean).sort((a, b) => b.length - a.length); const re = new RegExp(`(^|[^\\p{L}\\p{N}>])(${forms.map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![\\p{L}\\p{N}])`, "iu"); if (re.test(htmlText)) { htmlText = htmlText.replace(re, (m, pre, w) => `${pre}<a epub:type="glossref" class="glossref" href="glossary.xhtml#${g.id}">${w}</a>`); usedTerms.add(g.id); changed = true; } }
        if (changed) el.innerHTML = htmlText;
      }
    }
    const scripted = /data-section-type="activity_/.test(html);
    const xhtmlName = pg.href.replace(/\.html$/, ".xhtml");
    const bodyHtml = new XMLSerializer().serializeToString(main).replace(/ xmlns="http:\/\/www.w3.org\/1999\/xhtml"/g, "");
    out.set(`OEBPS/${xhtmlName}`, `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${lang}" xml:lang="${lang}"><head><meta charset="utf-8"/><title>${escapeXml(texts[pg.section_id] ?? title)}</title><link rel="stylesheet" type="text/css" href="content/tailwind_output.css"/><link rel="stylesheet" type="text/css" href="assets/temml.css"/><style>body{padding:0}</style></head><body>${bodyHtml}</body></html>`);
    const item = { id: idFor(xhtmlName), href: xhtmlName, type: "application/xhtml+xml", props: scripted ? "scripted" : "" };
    if (useAudio && smilRefs.length) {
      const smilName = `smil/${pg.section_id}.smil`; let dur = 0;
      const pars = smilRefs.map((r, i) => { const start = 0; const seqs = r.words?.length ? r.words.map((w, k) => `<par id="par${String(i + 1).padStart(3, "0")}_${String(k + 1).padStart(3, "0")}"><text src="../${xhtmlName}#${r.id}_w${String(k + 1).padStart(3, "0")}"/><audio src="../${i18n}audio/${r.audio}" clipBegin="${clock(w.start)}" clipEnd="${clock(w.end)}"/></par>`).join("") : `<par id="par${String(i + 1).padStart(4, "0")}"><text src="../${xhtmlName}#${r.id}"/><audio src="../${i18n}audio/${r.audio}" clipBegin="0s" clipEnd="${clock(r.dur)}"/></par>`; dur += r.dur; return `<seq epub:textref="../${xhtmlName}#${r.id}" epub:type="bodymatter">${seqs}</seq>`; }).join("\n");
      out.set(`OEBPS/${smilName}`, `<?xml version="1.0" encoding="UTF-8"?><smil xmlns="http://www.w3.org/ns/SMIL" xmlns:epub="http://www.idpf.org/2007/ops" version="3.0"><body>${pars}</body></smil>`);
      manifestItems.push({ id: `overlay-${pg.section_id}`, href: smilName, type: "application/smil+xml" }); item.overlay = `overlay-${pg.section_id}`; durations[`overlay-${pg.section_id}`] = dur; totalDur += dur;
    }
    manifestItems.push(item); spine.push({ idref: item.id });
  }
  // Glossaire
  if (glossEntries.length && glossaryMode !== "none") {
    const dl = glossEntries.map((g) => `<dt id="${g.id}" epub:type="glossterm"><dfn>${escapeXml(g.word)}</dfn></dt><dd epub:type="glossdef">${escapeXml(g.definition)}${g.image ? `<img src="${g.image}" alt="${escapeXml(g.word)}"/>` : ""}</dd>`).join("\n");
    out.set("OEBPS/glossary.xhtml", `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${lang}"><head><meta charset="utf-8"/><title>Glossaire</title><link rel="stylesheet" type="text/css" href="content/tailwind_output.css"/></head><body><section epub:type="glossary" class="p-8 space-y-4"><h1 class="adt-h1">Glossaire</h1><dl epub:type="glossary">${dl}</dl></section></body></html>`);
    manifestItems.push({ id: "glossary", href: "glossary.xhtml", type: "application/xhtml+xml" });
    spine.push({ idref: "glossary", linear: glossaryMode === "word" ? "no" : "yes" });
  }
  // Navigation
  const navLis = (toc.length ? toc : pages.filter((p) => texts[p.section_id]).slice(0, 50).map((p) => ({ href: p.href, title: texts[p.section_id] ?? p.section_id, level: 1 }))).map((e) => `<li><a href="${e.href.replace(/\.html$/, ".xhtml")}">${escapeXml(e.title)}</a></li>`).join("");
  out.set("OEBPS/toc.xhtml", `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${lang}"><head><meta charset="utf-8"/><title>Table des matières</title></head><body><nav epub:type="toc" id="toc"><h1>Table des matières</h1><ol>${navLis || `<li><a href="${pages[0].href.replace(/\.html$/, ".xhtml")}">${escapeXml(title)}</a></li>`}</ol></nav><nav epub:type="landmarks" hidden=""><ol><li><a epub:type="bodymatter" href="${pages[0].href.replace(/\.html$/, ".xhtml")}">Début</a></li>${glossEntries.length ? `<li><a epub:type="glossary" href="glossary.xhtml">Glossaire</a></li>` : ""}</ol></nav></body></html>`);
  manifestItems.push({ id: "nav", href: "toc.xhtml", type: "application/xhtml+xml", props: "nav" });
  const ncx = `<?xml version="1.0" encoding="UTF-8"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="urn:uuid:${uuid()}"/></head><docTitle><text>${escapeXml(title)}</text></docTitle><navMap>${(toc.length ? toc : pages.slice(0, 1).map((p) => ({ href: p.href, title }))).map((e, i) => `<navPoint id="np${i + 1}" playOrder="${i + 1}"><navLabel><text>${escapeXml(e.title)}</text></navLabel><content src="${e.href.replace(/\.html$/, ".xhtml")}"/></navPoint>`).join("")}</navMap></ncx>`;
  out.set("OEBPS/toc.ncx", ncx); manifestItems.push({ id: "ncx", href: "toc.ncx", type: "application/x-dtbncx+xml" });
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" prefix="rendition: http://www.idpf.org/vocab/rendition/#">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="pub-id">urn:uuid:${uuid()}</dc:identifier><dc:title>${escapeXml(title)}</dc:title><dc:language>${lang}</dc:language><meta property="dcterms:modified">${nowIso().replace(/\.\d+Z$/, "Z")}</meta>
${(meta?.authors ?? []).map((a, i) => `<dc:creator id="creator${i}">${escapeXml(a)}</dc:creator>`).join("")}${meta?.publisher ? `<dc:publisher>${escapeXml(meta.publisher)}</dc:publisher>` : ""}
<meta name="cover" content="${idFor("cover.png")}"/>
<meta property="schema:accessMode">textual</meta><meta property="schema:accessMode">visual</meta>${useAudio ? `<meta property="schema:accessMode">auditory</meta>` : ""}<meta property="schema:accessibilityFeature">alternativeText</meta><meta property="schema:accessibilityFeature">readingOrder</meta>${totalDur ? `<meta property="schema:accessibilityFeature">synchronizedAudioText</meta>` : ""}<meta property="schema:accessibilityHazard">none</meta><meta property="schema:accessibilitySummary">Livre numérique accessible produit par ADT Studio Web.</meta>
${cfg.fixedLayout ? `<meta property="rendition:layout">pre-paginated</meta><meta property="rendition:spread">none</meta>` : ""}
${totalDur ? `<meta property="media:duration">${clock(totalDur)}</meta>${Object.entries(durations).map(([k, d]) => `<meta property="media:duration" refines="#${k}">${clock(d)}</meta>`).join("")}<meta property="media:active-class">-epub-media-overlay-active</meta><meta property="media:playback-active-class">-epub-media-overlay-playing</meta>` : ""}
</metadata>
<manifest>
${manifestItems.map((m) => `<item id="${m.id}" href="${escapeXml(m.href)}" media-type="${m.type}"${m.props ? ` properties="${m.props}"` : ""}${m.overlay ? ` media-overlay="${m.overlay}"` : ""}/>`).join("\n")}
</manifest>
<spine toc="ncx">
${spine.map((s) => `<itemref idref="${s.idref}"${s.linear === "no" ? ' linear="no"' : ""}/>`).join("\n")}
</spine>
</package>`;
  out.set("OEBPS/content.opf", opf);
  return { blob: await zipFiles(out, { mimetypeFirst: true }), filename: `${slugify(title)}.epub` };
}
function clock(s) { return `${(Math.max(0, s) || 0).toFixed(3)}s`; }
function idFor(p) { return "r_" + p.replace(/[^A-Za-z0-9]/g, "_"); }

/** PNLD / FNDE « Obra digital » (Brésil) : structure simplifiée. */
export async function exportPnld(storage, title) {
  const files = await loadPackageFiles(storage); if (!files.size) throw new Error("Aucun paquet.");
  const pages = JSON.parse(await text(files.get("content/pages.json")));
  const toc = JSON.parse(await text(files.get("content/toc.json")));
  const cfg = JSON.parse(await text(files.get("assets/config.json")));
  const out = new Map();
  for (const [p, v] of files) {
    if (p.endsWith(".html") && p !== "index.html") { let h = stripRuntime(await text(v)).replace(/href="content\/tailwind_output.css"/, 'href="../resources/styles/tailwind_output.css"').replace(/href="assets\/adt-runtime.css"/, 'href="../resources/styles/adt-runtime.css"').replace(/href="assets\/temml.css"/, 'href="../resources/styles/temml.css"').replace(/src="images\//g, 'src="../resources/images/').replace("</head>", `<meta name="robots" content="noindex,nofollow"><meta name="adt-base" content="../resources/data/"></head>`); const pn = pages.find((x) => x.href === p)?.page_number; if (pn != null) h = h.replace("<main", `<p role="doc-pagebreak" class="sr-only"><span>Página </span><span class="page_number" data-book="pagina">${pn}</span></p><main`); out.set(`content/${p}`, h); continue; }
    if (p.startsWith("images/")) out.set(`resources/${p}`, v); else if (p.endsWith(".css")) out.set(`resources/styles/${p.split("/").pop()}`, v); else if (p.startsWith("assets/sounds/")) out.set(`resources/audios/${p.split("/").pop()}`, v); else if (/\/audio\//.test(p)) out.set(`resources/audios/${p.split("/")[2]}__${p.split("/").pop()}`, v); else if (/\/video\//.test(p)) out.set(`resources/videos/${p.split("/").pop()}`, v); else if (p.endsWith(".json")) out.set(`resources/data/${p}`, v); else if (p === "cover.png") out.set("cover.png", v); else if (p.endsWith(".js") && !/scorm|offline/.test(p)) out.set(`resources/scripts/${p.split("/").pop()}`, v);
  }
  const navItems = (toc.length ? toc : pages.map((p) => ({ href: p.href, title: p.section_id }))).map((e) => `<li><a href="content/${e.href}">${escapeHtml(e.title)}</a></li>`).join("");
  out.set("index.html", `<!doctype html><html lang="${cfg.languages.default}"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body itemscope itemtype="http://schema.org/Book"><h1 itemprop="name">${escapeHtml(title)}</h1><nav role="doc-toc" data-book="sumario"><ol>${navItems}</ol></nav></body></html>`);
  out.set("content.opf", `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="pub-id">urn:uuid:${uuid()}</dc:identifier><dc:title>${escapeXml(title)}</dc:title><dc:language>${cfg.languages.default}</dc:language><meta property="dcterms:modified">${nowIso().replace(/\.\d+Z$/, "Z")}</meta></metadata><manifest><item id="nav" href="index.html" media-type="text/html" properties="nav"/>${pages.map((p, i) => `<item id="p${i}" href="content/${p.href}" media-type="text/html"/>`).join("")}<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/></manifest><spine toc="ncx">${pages.map((p, i) => `<itemref idref="p${i}"/>`).join("")}</spine><guide><reference type="cover" title="Capa" href="cover.png"/></guide></package>`);
  out.set("toc.ncx", `<?xml version="1.0" encoding="UTF-8"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head/><docTitle><text>${escapeXml(title)}</text></docTitle><navMap>${(toc.length ? toc : pages.slice(0, 1).map((p) => ({ href: p.href, title }))).map((e, i) => `<navPoint id="np${i + 1}" playOrder="${i + 1}"><navLabel><text>${escapeXml(e.title)}</text></navLabel><content src="content/${e.href}"/></navPoint>`).join("")}</navMap></ncx>`);
  return { blob: await zipFiles(out), filename: `${slugify(title)}-pnld.zip` };
}
export { baseLanguage };
