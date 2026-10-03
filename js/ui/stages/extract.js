// Vue « Extraire » : page d'accueil de l'étape, vignettes, détail d'une page (texte, images, élagage, recadrage, segmentation).
import { h, button, icon, badge, blobImg, toast, dialog, confirmDialog, segmented, switchRow, textInput, field, select } from "../dom.js";
import { runCard, pageThumbs, pageImage, patchBookConfig, lightbox, versionPicker } from "./common.js";
import { effectiveImages, setImageKept, applySegmentation, applyCrop, cropFromPage, mergeSpread, splitSpread } from "../../pipeline/steps/extract.js";
import { callLLM } from "../../llm/client.js";
import { pageImageForLlm, imageBlobForLlm, SCHEMAS, stepModel } from "../../pipeline/steps/common.js";
import { blobToDataUrl } from "../../util.js";

export async function renderExtract(ctx, container) {
  if (ctx.pageId) return renderPage(ctx, container);
  const cfg = ctx.config; const extraction = await ctx.storage.getNodeData("extraction", "book");
  const rangeRow = h("div", { class: "row row-wrap" }, field("Page initiale", textInput({ type: "number", min: 1, value: cfg.start_page ?? "", placeholder: "1", style: "width:100px", onChange: (e) => patchBookConfig(ctx, { start_page: e.target.value ? Number(e.target.value) : undefined }) })), field("Page finale", textInput({ type: "number", min: 1, value: cfg.end_page ?? "", placeholder: String(extraction?.pageCount ?? ""), style: "width:100px", onChange: (e) => patchBookConfig(ctx, { end_page: e.target.value ? Number(e.target.value) : undefined }) })));
  const settings = h("div", { class: "card" }, h("div", { class: "card-body stack" },
    h("h3", { style: { margin: 0 } }, "Réglages de l'extraction"),
    h("div", { class: "field" }, h("span", { class: "field-label" }, "Plage de pages"), rangeRow, h("span", { class: "field-hint" }, "Laissez vide pour traiter tout le livre. Relancez l'extraction après modification.")),
    h("div", { class: "field" }, h("span", { class: "field-label" }, "Mode de regroupement des pages"), segmented([["single", "Page unique"], ["spread", "Double page"]], cfg.spread_mode ? "spread" : "single", (v) => patchBookConfig(ctx, { spread_mode: v === "spread" }))),
    h("div", { class: "field" }, h("span", { class: "field-label" }, "Extraction de figures"), segmented([["off", "Désactivée"], ["auto", "Automatique"], ["all", "Toutes"]], cfg.figure_extraction_mode ?? "off", (v) => patchBookConfig(ctx, { figure_extraction_mode: v }))),
    switchRow("Supprimer les filigranes", !!cfg.remove_watermarks, (v) => patchBookConfig(ctx, { remove_watermarks: v }), { hint: extraction?.repeatedText?.length ? `Textes répétés détectés : ${extraction.repeatedText.slice(0, 3).map((t) => `« ${t.slice(0, 40)} »`).join(", ")}` : "Détecte les textes identiques répétés sur la plupart des pages." })));
  container.appendChild(h("div", { class: "stack" }, settings, runCard(ctx, "extract")));
  if (!ctx.pages.length) return;
  const spreadSuggest = extraction?.spreadSuggestion;
  if (spreadSuggest && !cfg.spread_mode && spreadSuggest.pairs?.length && !ctx.book.spreadReviewed) container.appendChild(h("div", { class: "callout callout-accent" }, icon("columns"), h("div", { class: "grow" }, h("strong", {}, "Doubles pages"), h("div", { class: "small muted" }, `${spreadSuggest.pairs.length} fusions possibles détectées. Marquez les paires de pages à réunir en une double page.`)), button("Examiner les doubles pages", { size: "sm", variant: "secondary", onClick: () => spreadPicker(ctx) }), button("Ignorer", { size: "sm", variant: "ghost", onClick: async () => { await ctx.storage.updateBook({ spreadReviewed: true }); ctx.refresh(); } })));
  const grid = await pageThumbs(ctx, { onPick: (p) => ctx.go("extract", p.pageId), annotate: async (p) => { const n = (await effectiveImages(ctx.storage, p.pageId)).filter((i) => i.kept).length; return h("span", { class: "muted" }, !p.text.trim() ? badge("sans texte", "warning") : `${n} img`); } });
  container.appendChild(h("div", { class: "stack" }, h("div", { class: "row between" }, h("h2", { style: { margin: 0 } }, `${ctx.pages.length} pages extraites`), button("Doubles pages…", { size: "sm", variant: "secondary", iconName: "columns", onClick: () => spreadPicker(ctx) })), grid));
}

async function renderPage(ctx, container) {
  const page = await ctx.storage.getPage(ctx.pageId);
  if (!page) { container.appendChild(h("p", {}, "Page introuvable.")); return; }
  const images = await effectiveImages(ctx.storage, page.pageId);
  const idx = ctx.pages.findIndex((p) => p.pageId === page.pageId);
  const nav = h("div", { class: "row between" }, button("Page précédente", { variant: "ghost", iconName: "chevron-left", disabled: idx <= 0, onClick: () => ctx.go("extract", ctx.pages[idx - 1].pageId) }), h("h2", { style: { margin: 0 } }, `Page ${page.pageNumber}${page.spreadOf ? `–${page.spreadOf[1]} (double page)` : ""}`), button("Page suivante", { variant: "ghost", iconName: "chevron-right", disabled: idx >= ctx.pages.length - 1, onClick: () => ctx.go("extract", ctx.pages[idx + 1].pageId) }));
  const fonts = [...new Set((page.positioned ?? []).map((b) => b.family).filter(Boolean))].slice(0, 6);
  const serif = (page.positioned ?? []).filter((b) => b.serif).reduce((n, b) => n + b.text.length, 0), total = (page.positioned ?? []).reduce((n, b) => n + b.text.length, 0) || 1;
  const left = h("div", { class: "stack" }, pageImage(ctx, page.pageId, { onClick: async () => lightbox(await blobToDataUrl(await ctx.storage.getImageBlob(`${page.pageId}_page`))) }), h("div", { class: "row row-wrap" }, button("Recadrer une image depuis la page", { size: "sm", variant: "secondary", iconName: "crop", onClick: () => cropDialog(ctx, page) }), page.spreadOf ? button("Scinder la double page", { size: "sm", variant: "secondary", iconName: "split", onClick: async () => { await splitSpread(ctx.storage, page.pageId); toast("Double page scindée", { kind: "success" }); ctx.refresh(); } }) : (ctx.pages[idx + 1] ? button(`Fusionner avec la page ${ctx.pages[idx + 1].pageNumber}`, { size: "sm", variant: "secondary", iconName: "columns", onClick: async () => { await mergeSpread(ctx.storage, page, ctx.pages[idx + 1]); await patchBookConfig(ctx, { spread_pairs: [...new Set([...(ctx.config.spread_pairs ?? []), page.pageNumber])] }, { silent: true }); toast("Double page créée", { kind: "success" }); ctx.refresh(); } }) : null)));
  const textBox = h("textarea", { class: "input textarea mono", rows: 18, value: page.text, readOnly: true });
  const right = h("div", { class: "stack" },
    h("div", { class: "card" }, h("div", { class: "card-body stack" }, h("div", { class: "row between" }, h("h3", { style: { margin: 0 } }, "Texte extrait"), h("span", { class: "muted small" }, `${page.text.length} caractères · ${(page.positioned ?? []).length} blocs`)), !page.text.trim() ? h("div", { class: "callout callout-warning small" }, icon("alert"), "Aucun texte dans ce PDF pour cette page (document scanné ?). La structuration par IA lira l'image de la page.") : null, textBox, page.watermarks?.length ? h("div", { class: "muted small" }, `Filigranes retirés : ${page.watermarks.join(" · ")}`) : null)),
    h("div", { class: "card" }, h("div", { class: "card-body stack" }, h("h3", { style: { margin: 0 } }, "Polices détectées"), h("div", { class: "row row-wrap" }, badge(serif / total > 0.5 ? "Serif dominant" : "Sans-serif dominant", "accent"), fonts.map((f) => badge(f))))),
    h("div", { class: "card" }, h("div", { class: "card-body stack" }, h("div", { class: "row between" }, h("h3", { style: { margin: 0 } }, `Images extraites (${images.length})`), h("span", { class: "muted small" }, `${images.filter((i) => i.kept).length} conservées`)), images.length ? h("div", { class: "thumb-grid" }, images.map((im) => imageCard(ctx, page, im))) : h("p", { class: "muted small" }, "Aucune image intégrée sur cette page. Utilisez « Recadrer une image depuis la page » pour en créer une."))));
  container.appendChild(h("div", { class: "stack" }, nav, h("div", { class: "split split-1-2" }, left, right)));
}

function imageCard(ctx, page, im) {
  const card = h("div", { class: ["thumb-card", "img-check"], style: { opacity: im.kept ? 1 : 0.6 } }, blobImg(ctx.storage.getImageBlob(im.imageId), { alt: im.imageId, onClick: async () => lightbox(await blobToDataUrl(await ctx.storage.getImageBlob(im.imageId))) }), badge(im.kept ? "Conservée" : im.manual ? "Élaguée" : "Filtrée", im.kept ? "success" : "muted"), h("div", { class: "small" }, h("strong", { class: "mono" }, im.imageId), h("div", { class: "muted" }, `${im.width}×${im.height} · ${im.source}`), h("div", { class: "muted", title: im.reason }, im.reason), im.meaningfulness ? h("div", { class: "muted", title: im.meaningfulness.reasoning }, im.meaningfulness.is_meaningful ? "Pertinente" : "Non pertinente") : null),
    h("div", { class: "row row-wrap" }, button(im.kept ? "Élaguer" : "Restaurer", { size: "sm", variant: "secondary", onClick: async () => { await setImageKept(ctx.storage, page.pageId, im.imageId, !im.kept); ctx.refresh(); } }), button("Segmenter", { size: "sm", variant: "ghost", title: "Découper en sous-images (IA)", onClick: () => segmentDialog(ctx, page, im) }), button("Recadrer (IA)", { size: "sm", variant: "ghost", onClick: async () => { toast("Analyse du recadrage…"); try { const res = await callLLM({ storage: ctx.storage, step: "image-cropping", itemId: `${page.pageId}/${im.imageId}`, promptName: ctx.config.image_cropping?.prompt ?? "image_cropping", variables: { page_image_base64: await pageImageForLlm(ctx.storage, page.pageId, { maxSide: 1000 }), image_base64: await imageBlobForLlm(ctx.storage, im.imageId), image_id: im.imageId, width: im.width, height: im.height }, schema: SCHEMAS.cropping, config: ctx.config, modelId: stepModel(ctx.config, "image_cropping"), noCache: true }); if (res.parsed.crop) { await applyCrop(ctx.storage, im, res.parsed.crop); toast("Image recadrée", { kind: "success" }); ctx.refresh(); } else toast("Aucun recadrage nécessaire : " + res.parsed.reasoning, { kind: "info" }); } catch (e) { toast(e.message, { kind: "error" }); } } })));
  return card;
}

async function segmentDialog(ctx, page, im) {
  const body = h("div", { class: "stack" }, h("p", { class: "muted small" }, "Le modèle propose des zones de découpe. Vérifiez puis appliquez."), h("div", { class: "spinner-wrap" }, h("span", { class: "spinner" }), "Analyse…"));
  const { close } = dialog({ title: `Segmenter ${im.imageId}`, size: "lg", body });
  try {
    const res = await callLLM({ storage: ctx.storage, step: "image-segmentation", itemId: `${page.pageId}/${im.imageId}`, promptName: ctx.config.image_segmentation?.prompt ?? "image_segmentation", variables: { page_image_base64: await pageImageForLlm(ctx.storage, page.pageId, { maxSide: 1000 }), image_base64: await imageBlobForLlm(ctx.storage, im.imageId, { maxSide: 1200 }), image_id: im.imageId, width: im.width, height: im.height, min_side: ctx.config.image_segmentation?.min_side ?? 100 }, schema: SCHEMAS.segmentation, config: ctx.config, modelId: stepModel(ctx.config, "image_segmentation"), noCache: true });
    const segs = res.parsed.segments ?? [];
    body.innerHTML = "";
    const url = await blobToDataUrl(await ctx.storage.getImageBlob(im.imageId));
    body.appendChild(h("div", { style: { position: "relative", display: "inline-block", maxWidth: "100%" } }, h("img", { src: url, alt: "", style: { maxWidth: "100%", display: "block" } }), ...segs.map((s, i) => h("div", { title: s.label, style: { position: "absolute", left: `${s.x}%`, top: `${s.y}%`, width: `${s.width}%`, height: `${s.height}%`, border: "2px solid #1CABE2", background: "rgba(28,171,226,.15)", fontSize: "11px", color: "#0e8fc0", fontWeight: 700, padding: "2px" } }, `${i + 1}. ${s.label}`))));
    body.appendChild(h("p", { class: "muted small" }, res.parsed.reasoning));
    body.appendChild(h("div", { class: "row end" }, button("Annuler", { variant: "ghost", onClick: () => close() }), button(`Appliquer la segmentation (${segs.length})`, { disabled: segs.length < 2, onClick: async () => { await applySegmentation(ctx.storage, im, segs); close(); toast("Segments créés", { kind: "success" }); ctx.refresh(); } })));
  } catch (e) { body.innerHTML = ""; body.appendChild(h("div", { class: "callout callout-danger" }, e.message)); }
}

async function cropDialog(ctx, page) {
  const url = await blobToDataUrl(await ctx.storage.getImageBlob(`${page.pageId}_page`));
  const img = h("img", { src: url, alt: "", style: { maxWidth: "100%", display: "block", userSelect: "none" }, draggable: false });
  const box = h("div", { style: { position: "absolute", border: "2px dashed #1CABE2", background: "rgba(28,171,226,.2)", display: "none", pointerEvents: "none" } });
  const wrap = h("div", { style: { position: "relative", display: "inline-block", maxWidth: "100%", cursor: "crosshair" } }, img, box);
  let start = null, rect = null;
  const pos = (e) => { const r = img.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) }; };
  wrap.addEventListener("pointerdown", (e) => { start = pos(e); box.style.display = "block"; wrap.setPointerCapture(e.pointerId); });
  wrap.addEventListener("pointermove", (e) => { if (!start) return; const p = pos(e); rect = { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) }; Object.assign(box.style, { left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }); });
  wrap.addEventListener("pointerup", () => { start = null; });
  dialog({ title: "Recadrer une image depuis la page", size: "lg", body: h("div", { class: "stack" }, h("p", { class: "muted small" }, "Dessinez un rectangle sur la page pour créer une nouvelle image."), wrap), actions: [{ label: "Annuler", variant: "ghost" }, { label: "Créer l'image", onClick: async () => { if (!rect || rect.w < 0.02 || rect.h < 0.02) { toast("Dessinez d'abord une zone", { kind: "warning" }); return false; } const id = await cropFromPage(ctx.storage, page.pageId, rect, { source: "upload" }); toast(`Image ${id} créée`, { kind: "success" }); ctx.refresh(); } }] });
}

export async function spreadPicker(ctx) {
  const pages = ctx.pages; const pairs = new Set(ctx.config.spread_pairs ?? []);
  const strip = h("div", { class: "row", style: { overflowX: "auto", gap: "6px", padding: "6px 0" } });
  const render = () => { strip.innerHTML = ""; pages.forEach((p, i) => { const next = pages[i + 1]; strip.appendChild(h("div", { class: "col", style: { alignItems: "center", gap: "4px", flex: "none" } }, blobImg(ctx.storage.getImageBlob(`${p.pageId}_page`), { style: "height:120px;border-radius:4px;border:1px solid var(--border)" }), h("span", { class: "small" }, p.spreadOf ? `${p.spreadOf[0]}–${p.spreadOf[1]}` : p.pageNumber), p.spreadOf ? badge("Fusionnée", "accent") : next && !next.spreadOf ? button(pairs.has(p.pageNumber) ? "Délier" : "Lier →", { size: "sm", variant: pairs.has(p.pageNumber) ? "primary" : "secondary", onClick: () => { if (pairs.has(p.pageNumber)) pairs.delete(p.pageNumber); else { pairs.delete(p.pageNumber - 1); pairs.delete(p.pageNumber + 1); pairs.add(p.pageNumber); } render(); } }) : null)); }); };
  render();
  dialog({ title: "Doubles pages", size: "xl", body: h("div", { class: "stack" }, h("p", { class: "muted small" }, "Liez deux pages en vis-à-vis pour les réunir en un écran large. Les fusions sont appliquées sur les images et le texte extraits."), strip), actions: [{ label: "Annuler", variant: "ghost" }, { label: "Appliquer", onClick: async () => { await patchBookConfig(ctx, { spread_pairs: [...pairs].sort((a, b) => a - b) }, { silent: true }); for (const lead of pairs) { const a = (await ctx.storage.getPages()).find((p) => p.pageNumber === lead); const b = (await ctx.storage.getPages()).find((p) => p.pageNumber === lead + 1); if (a && b && !a.spreadOf) await mergeSpread(ctx.storage, a, b); } for (const p of await ctx.storage.getPages()) if (p.spreadOf && !pairs.has(p.pageNumber)) await splitSpread(ctx.storage, p.pageId); await ctx.storage.updateBook({ spreadReviewed: true }); toast("Doubles pages appliquées", { kind: "success" }); ctx.refresh(); } }] });
}
