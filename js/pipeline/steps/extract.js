// Étape « Extraire » : extraction PDF, métadonnées, résumé, plan du livre,
// filtrage / pertinence / segmentation / recadrage des images.
import { extractBook, blobToCanvas, imageStats, cropCanvas, suggestSpreads } from "../../pdf/extract.js";
import { callLLM } from "../../llm/client.js";
import { canvasToBlob, pad3, sha256, blobToArrayBuffer, nowIso } from "../../util.js";
import { pageImageForLlm, imageBlobForLlm, languageContext, stepModel, stepTimeout, stepRetries, forEachPage, SCHEMAS } from "./common.js";

// ── Extraction PDF ────────────────────────────────────────────────────────
export async function extract(ctx) {
  const { storage, config } = ctx;
  const pdf = await storage.getBlob("source.pdf");
  if (!pdf) throw new Error("PDF source introuvable pour ce livre.");
  // Nettoyage des données d'extraction précédentes
  for (const p of await storage.getPages()) await storage.deletePage(p.pageId);
  for (const im of await storage.getImages()) await storage.deleteImage(im.imageId);
  const minSide = Math.max(16, Math.min(config.image_filters?.min_side ?? 100, 64));
  const positionedByPage = {};
  const result = await extractBook(pdf, {
    startPage: config.start_page ?? 1, endPage: config.end_page ?? Infinity, minSide, signal: ctx.signal,
    onProgress: ({ current, total, pageId }) => ctx.progress(current, total, pageId),
    onPage: async (p) => {
      positionedByPage[p.pageId] = p.positioned;
      await storage.putImage({ imageId: `${p.pageId}_page`, pageId: p.pageId, width: p.width, height: p.height, source: "page", renderMethod: "raster", bounds: { x: 0, y: 0, w: 1, h: 1 } }, p.pageBlob);
      let n = 0;
      for (const im of p.images) {
        n++;
        const imageId = `${p.pageId}_im${pad3(n)}`;
        const hash = (await sha256(await blobToArrayBuffer(im.blob))).slice(0, 16);
        await storage.putImage({ imageId, pageId: p.pageId, width: im.width, height: im.height, source: "extract", renderMethod: "raster", bounds: im.bounds, hash, repeats: im.repeats }, im.blob);
      }
      await storage.putPage({ pageId: p.pageId, pageNumber: p.pageNumber, text: p.text, positioned: p.positioned, width: p.width, height: p.height, pdfWidth: p.pdfWidth, pdfHeight: p.pdfHeight, imageCount: p.images.length });
      delete p.pageCanvas; delete p.pageBlob; p.images = [];
    },
  });
  // Filigranes / textes répétés
  const repeated = [...result.repeated];
  await storage.putNodeData("extraction", "book", { generatedAt: nowIso(), pageCount: result.pageCount, extractedPages: result.pages.length, typeScale: result.typeScale, repeatedText: repeated, spreadSuggestion: suggestSpreads(result.pages) });
  if (config.remove_watermarks && repeated.length) {
    for (const p of await storage.getPages()) {
      const kept = p.positioned.filter((b) => !repeated.includes(b.text.trim().toLowerCase()));
      if (kept.length !== p.positioned.length) await storage.putPage({ ...p, text: kept.map((b) => b.text).join("\n\n"), positioned: kept, watermarks: p.positioned.filter((b) => repeated.includes(b.text.trim().toLowerCase())).map((b) => b.text) });
    }
  }
  // Doubles pages
  await applySpreads(storage, config);
  const pages = await storage.getPages();
  const emptyText = pages.filter((p) => !p.text.trim()).length;
  return { message: `${pages.length} pages extraites${emptyText ? ` · ${emptyText} sans texte (PDF scanné ?)` : ""}` };
}

/** Fusionne les paires de pages en doubles pages selon la configuration. */
export async function applySpreads(storage, config) {
  const pages = await storage.getPages();
  let leaders = [];
  if (config.spread_mode) { for (let i = 1; i + 1 < pages.length; i += 2) leaders.push(pages[i].pageNumber); }
  else if (config.spread_pairs?.length) leaders = config.spread_pairs.slice();
  for (const lead of leaders) {
    const a = pages.find((p) => p.pageNumber === lead), b = pages.find((p) => p.pageNumber === lead + 1);
    if (!a || !b || a.spreadOf || b.spreadOf) continue;
    await mergeSpread(storage, a, b);
  }
}

export async function mergeSpread(storage, a, b) {
  const [ba, bb] = await Promise.all([storage.getImageBlob(`${a.pageId}_page`), storage.getImageBlob(`${b.pageId}_page`)]);
  const [ca, cb] = await Promise.all([blobToCanvas(ba), blobToCanvas(bb)]);
  const h = Math.max(ca.height, cb.height); const sa = h / ca.height, sb = h / cb.height;
  const canvas = document.createElement("canvas"); canvas.width = Math.round(ca.width * sa + cb.width * sb); canvas.height = h;
  const g = canvas.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(ca, 0, 0, ca.width * sa, h); g.drawImage(cb, ca.width * sa, 0, cb.width * sb, h);
  const blob = await canvasToBlob(canvas, "image/png");
  const wa = (ca.width * sa) / canvas.width;
  await storage.putImage({ imageId: `${a.pageId}_page`, pageId: a.pageId, width: canvas.width, height: canvas.height, source: "page", renderMethod: "raster", bounds: { x: 0, y: 0, w: 1, h: 1 } }, blob);
  for (const im of await storage.getPageImages(b.pageId)) {
    if (im.imageId.endsWith("_page")) { await storage.deleteImage(im.imageId); continue; }
    await storage.updateImage(im.imageId, { pageId: a.pageId, bounds: im.bounds ? { x: wa + im.bounds.x * (1 - wa), y: im.bounds.y, w: im.bounds.w * (1 - wa), h: im.bounds.h } : null, originPageId: b.pageId });
  }
  const positioned = [...a.positioned.map((p) => ({ ...p, left: p.left * wa, width: p.width * wa })), ...b.positioned.map((p) => ({ ...p, id: `b${p.id}`, left: wa + p.left * (1 - wa), width: p.width * (1 - wa) }))];
  await storage.putPage({ ...a, text: `${a.text}\n\n${b.text}`.trim(), positioned, width: canvas.width, height: canvas.height, pdfWidth: a.pdfWidth + b.pdfWidth, spreadOf: [a.pageNumber, b.pageNumber], secondPage: { pageId: b.pageId, pageNumber: b.pageNumber, text: b.text, positioned: b.positioned, width: b.width, height: b.height, pdfWidth: b.pdfWidth, pdfHeight: b.pdfHeight } });
  await storage.deletePage(b.pageId);
}

export async function splitSpread(storage, pageId) {
  const a = await storage.getPage(pageId);
  if (!a?.spreadOf || !a.secondPage) return;
  const b = a.secondPage;
  const blob = await storage.getImageBlob(`${a.pageId}_page`);
  const c = await blobToCanvas(blob);
  const wa = a.positioned.find((p) => !p.id.startsWith("b")) ? Math.max(...a.positioned.filter((p) => !p.id.startsWith("b")).map((p) => p.left + p.width), 0.5) : 0.5;
  const split = Math.round(c.width * (a.secondPage.width ? a.width - a.secondPage.width * (c.height / a.secondPage.height) : c.width * wa)) / c.width;
  const left = cropCanvas(c, { x: 0, y: 0, w: split, h: 1 }), right = cropCanvas(c, { x: split, y: 0, w: 1 - split, h: 1 });
  await storage.putImage({ imageId: `${a.pageId}_page`, pageId: a.pageId, width: left.width, height: left.height, source: "page", renderMethod: "raster", bounds: { x: 0, y: 0, w: 1, h: 1 } }, await canvasToBlob(left));
  await storage.putImage({ imageId: `${b.pageId}_page`, pageId: b.pageId, width: right.width, height: right.height, source: "page", renderMethod: "raster", bounds: { x: 0, y: 0, w: 1, h: 1 } }, await canvasToBlob(right));
  for (const im of await storage.getPageImages(a.pageId)) if (im.originPageId === b.pageId) await storage.updateImage(im.imageId, { pageId: b.pageId, originPageId: undefined, bounds: im.bounds ? { x: (im.bounds.x - split) / (1 - split), y: im.bounds.y, w: im.bounds.w / (1 - split), h: im.bounds.h } : null });
  const { secondPage, spreadOf, ...rest } = a;
  const aText = a.positioned.filter((p) => !p.id.startsWith("b"));
  await storage.putPage({ ...rest, text: aText.map((p) => p.text).join("\n\n"), positioned: aText.map((p) => ({ ...p, left: p.left / split, width: p.width / split })), width: left.width, height: left.height, pdfWidth: a.pdfWidth - (b.pdfWidth ?? a.pdfWidth / 2) });
  await storage.putPage({ pageId: b.pageId, pageNumber: b.pageNumber, text: b.text, positioned: b.positioned, width: right.width, height: right.height, pdfWidth: b.pdfWidth, pdfHeight: b.pdfHeight, imageCount: 0 });
}

// ── Métadonnées ───────────────────────────────────────────────────────────
export async function metadata(ctx) {
  const { storage, config } = ctx;
  const pages = (await storage.getActivePages(config)).slice(0, 4);
  if (!pages.length) throw new Error("Aucune page extraite.");
  const vars = { pages: [] };
  for (const p of pages) vars.pages.push({ pageNumber: p.pageNumber, text: p.text.slice(0, 4000), imageBase64: await pageImageForLlm(storage, p.pageId, { maxSide: 1000 }) });
  const res = await callLLM({ storage, step: "metadata", itemId: "book", promptName: config.metadata?.prompt ?? "metadata_extraction", variables: vars, schema: SCHEMAS.metadata, config, modelId: stepModel(config, "metadata"), timeoutMs: stepTimeout(config, "metadata"), maxRetries: stepRetries(config, "metadata"), signal: ctx.signal });
  const data = res.parsed;
  const prev = await storage.getNodeData("metadata", "book");
  // Les modifications manuelles (source: manual) sont conservées.
  const merged = prev?.source === "manual" ? { ...data, ...prev, reasoning: data.reasoning } : { ...data, language_code: data.language_code ? String(data.language_code).toLowerCase() : null };
  await storage.putNodeData("metadata", "book", merged);
  return { message: merged.title ? `« ${merged.title} »` : "Titre non détecté" };
}

// ── Résumé ────────────────────────────────────────────────────────────────
export async function bookSummary(ctx) {
  const { storage, config } = ctx;
  const pages = await storage.getActivePages(config);
  const lang = languageContext(config.editing_language || (await storage.getNodeData("metadata", "book"))?.language_code || "fr");
  let budget = 60000;
  const texts = [];
  for (const p of pages) { if (budget <= 0) break; const t = p.text.slice(0, Math.min(3000, budget)); budget -= t.length; texts.push({ pageNumber: p.pageNumber, text: t }); }
  const res = await callLLM({ storage, step: "book-summary", itemId: "book", promptName: config.book_summary?.prompt ?? "book_summary", variables: { pages: texts, output_language: lang.name, output_language_code: lang.code }, schema: SCHEMAS.summary, config, modelId: stepModel(config, "book_summary"), timeoutMs: stepTimeout(config, "book_summary"), signal: ctx.signal });
  await storage.putNodeData("book-summary", "book", { summary: res.parsed.summary, language: lang.code, generatedAt: nowIso() });
  return { message: "Résumé généré" };
}

// ── Plan du livre ─────────────────────────────────────────────────────────
export async function bookOutline(ctx) {
  const { storage, config } = ctx;
  const pages = await storage.getActivePages(config);
  const extraction = await storage.getNodeData("extraction", "book");
  const typeScale = extraction?.typeScale ?? null;
  const bodyPx = typeScale?.bodyPx ?? 10;
  const candidates = []; const byId = new Map();
  for (const p of pages) {
    for (const b of p.positioned ?? []) {
      const ratio = b.fontSize / bodyPx;
      const short = b.text.length <= 120 && b.lineCount <= 3;
      const score = Math.min(1, (ratio >= 1.15 ? 0.5 : 0) + (b.bold ? 0.25 : 0) + (short ? 0.2 : 0) + (b.centered ? 0.1 : 0) + (b.top < 0.2 ? 0.05 : 0));
      if (score < 0.45 || !short || /^\d+$/.test(b.text.trim())) continue;
      const id = `${p.pageId}_c${b.id}`;
      const c = { candidateId: id, pageId: p.pageId, pageNumber: p.pageNumber, text: b.text, fontSizePx: b.fontSize, sizeToBodyRatio: Math.round(ratio * 100) / 100, fontWeight: b.bold ? "bold" : "normal", centered: b.centered, topRatio: Math.round(b.top * 100) / 100, headingLikelihood: Math.round(score * 100) / 100 };
      candidates.push(c); byId.set(id, c);
    }
  }
  if (!candidates.length) { await storage.putNodeData("book-outline", "book", { entries: [], reasoning: "Aucun candidat de titre détecté (PDF sans texte ?)", generatedAt: nowIso() }); return { message: "Aucun titre détecté" }; }
  const tocHierarchy = [];
  const res = await callLLM({ storage, step: "book-outline", itemId: "book", promptName: config.book_outline?.prompt ?? "book_outline", variables: { type_scale: typeScale, toc_hierarchy: tocHierarchy, candidates: candidates.slice(0, 600), pages: pages.map((p) => ({ pageId: p.pageId, pageNumber: p.pageNumber, text: p.text.slice(0, 1200) })) }, schema: SCHEMAS.outline, config, modelId: stepModel(config, "book_outline"), timeoutMs: stepTimeout(config, "book_outline", 300), maxRetries: stepRetries(config, "book_outline", 3), signal: ctx.signal,
    validate: (out) => { const errs = []; for (const e of out.entries ?? []) { if (!e.candidate_ids?.length) errs.push("entrée sans candidate_ids"); for (const id of e.candidate_ids ?? []) if (!byId.has(id)) errs.push(`candidat inconnu ${id}`); if (e.level < 1 || e.level > 6) errs.push(`niveau invalide ${e.level}`); } return errs.slice(0, 10); } });
  const entries = (res.parsed.entries ?? []).map((e, i) => {
    const cs = e.candidate_ids.map((id) => byId.get(id)).filter(Boolean);
    return { outlineId: `ol${pad3(i + 1)}`, level: e.level, kind: e.kind, title: cs.map((c) => c.text).join(" ").trim(), pageId: cs[0]?.pageId, pageNumber: cs[0]?.pageNumber, candidateIds: e.candidate_ids, styleClusterId: e.style_cluster_id, confidence: e.confidence };
  }).filter((e) => e.pageId);
  // parent dérivé : entrée précédente la plus proche de niveau inférieur
  for (let i = 0; i < entries.length; i++) { let parent = null; for (let j = i - 1; j >= 0; j--) if (entries[j].level < entries[i].level) { parent = entries[j].outlineId; break; } entries[i].parentId = parent; }
  await storage.putNodeData("book-outline", "book", { entries, reasoning: res.parsed.reasoning, generatedAt: nowIso() });
  return { message: `${entries.length} entrées de plan` };
}

// ── Filtrage des images (règles) ──────────────────────────────────────────
export async function imageFiltering(ctx) {
  const { storage, config } = ctx;
  const f = config.image_filters ?? {};
  const pages = await storage.getActivePages(config);
  const allImages = await storage.getImages();
  const hashCount = new Map();
  for (const im of allImages) if (im.hash) hashCount.set(im.hash, (hashCount.get(im.hash) ?? 0) + 1);
  const repeatedHash = new Set([...hashCount.entries()].filter(([, c]) => c >= 3 && c >= pages.length * 0.3).map(([h]) => h));
  await forEachPage(ctx, pages, async (page) => {
    const images = (await storage.getPageImages(page.pageId)).filter((im) => im.source === "extract" || im.source === "upload");
    const decisions = [];
    for (const im of images) {
      let kept = true, reason = "conservée";
      const minS = Math.min(im.width, im.height), maxS = Math.max(im.width, im.height);
      if (f.min_side != null && minS < f.min_side) { kept = false; reason = `trop petite (${minS} px < ${f.min_side})`; }
      else if (f.max_side != null && maxS > f.max_side) { kept = false; reason = `trop grande (${maxS} px > ${f.max_side})`; }
      else if (im.hash && repeatedHash.has(im.hash)) { kept = false; reason = "répétée sur de nombreuses pages (logo, ornement)"; }
      else if (im.bounds && (im.bounds.w < 0.015 || im.bounds.h < 0.015)) { kept = false; reason = "surface négligeable sur la page"; }
      else if ((f.min_stddev ?? 0) > 0) {
        const blob = await storage.getImageBlob(im.imageId);
        if (blob) { const st = imageStats(await blobToCanvas(blob)); if (st.stddev < f.min_stddev) { kept = false; reason = `trop uniforme (écart-type ${st.stddev.toFixed(1)})`; } else if (st.meanAlpha < 8) { kept = false; reason = "image transparente"; } }
      }
      decisions.push({ imageId: im.imageId, kept, reason });
    }
    const prev = await storage.getNodeData("image-filtering", page.pageId);
    // conserver les décisions manuelles (pruned/unpruned)
    for (const d of decisions) { const m = prev?.images?.find((x) => x.imageId === d.imageId); if (m?.manual) { d.kept = m.kept; d.manual = true; d.reason = m.reason; } }
    await storage.putNodeData("image-filtering", page.pageId, { images: decisions, generatedAt: nowIso() });
  });
  return { message: "Images filtrées" };
}

/** Images effectivement conservées pour une page (filtrage + pertinence + manuel). */
export async function effectiveImages(storage, pageId) {
  const imgs = (await storage.getPageImages(pageId)).filter((im) => !im.imageId.endsWith("_page"));
  const filt = await storage.getNodeData("image-filtering", pageId);
  const meaning = await storage.getNodeData("image-meaningfulness", pageId);
  const out = [];
  for (const im of imgs) {
    const d = filt?.images?.find((x) => x.imageId === im.imageId);
    const m = meaning?.images?.find((x) => x.image_id === im.imageId);
    let kept = d ? d.kept : true;
    let reason = d?.reason ?? "conservée";
    if (kept && m && m.is_meaningful === false && !d?.manual) { kept = false; reason = "jugée non signifiante"; }
    if (im.supersededBy) { kept = false; reason = `remplacée par ${im.supersededBy}`; }
    out.push({ ...im, kept, reason, manual: !!d?.manual, meaningfulness: m ?? null });
  }
  return out;
}

export async function setImageKept(storage, pageId, imageId, kept) {
  const filt = (await storage.getNodeData("image-filtering", pageId)) ?? { images: [] };
  const list = filt.images.filter((x) => x.imageId !== imageId);
  list.push({ imageId, kept, reason: kept ? "conservée manuellement" : "élaguée manuellement", manual: true });
  await storage.putNodeData("image-filtering", pageId, { ...filt, images: list, generatedAt: nowIso() });
}

// ── Pertinence des images (LLM) ───────────────────────────────────────────
export async function imageMeaningfulness(ctx) {
  const { storage, config } = ctx;
  if (config.image_filters?.meaningfulness === false) return { skipped: true, message: "Désactivé dans les filtres d'images" };
  const pages = await storage.getActivePages(config);
  let evaluated = 0;
  await forEachPage(ctx, pages, async (page) => {
    const imgs = (await effectiveImages(storage, page.pageId)).filter((im) => im.kept && !im.manual);
    if (!imgs.length) return;
    const images = [];
    for (const im of imgs.slice(0, 20)) images.push({ imageId: im.imageId, width: im.width, height: im.height, renderMethod: im.renderMethod, imageBase64: await imageBlobForLlm(storage, im.imageId) });
    const res = await callLLM({ storage, step: "image-meaningfulness", itemId: page.pageId, promptName: config.image_meaningfulness?.prompt ?? "image_meaningfulness", variables: { page_image_base64: await pageImageForLlm(storage, page.pageId), page_text: page.text.slice(0, 3000), images, figure_extraction_mode: config.figure_extraction_mode ?? "off" }, schema: SCHEMAS.meaningfulness, config, modelId: stepModel(config, "image_meaningfulness"), timeoutMs: stepTimeout(config, "image_meaningfulness"), signal: ctx.signal,
      validate: (out) => { const ids = new Set(images.map((i) => i.imageId)); const got = new Set((out.images ?? []).map((i) => i.image_id)); return [...ids].filter((i) => !got.has(i)).map((i) => `image ${i} non évaluée`); } });
    evaluated += images.length;
    await storage.putNodeData("image-meaningfulness", page.pageId, { images: res.parsed.images, generatedAt: nowIso() });
  });
  return { message: `${evaluated} images évaluées` };
}

// ── Segmentation des images (LLM) ─────────────────────────────────────────
export async function imageSegmentation(ctx) {
  const { storage, config } = ctx;
  if (!config.image_filters?.segmentation) return { skipped: true, message: "Désactivée dans les filtres d'images" };
  const minSide = config.image_segmentation?.min_side ?? 100;
  const pages = await storage.getActivePages(config);
  let created = 0;
  await forEachPage(ctx, pages, async (page) => {
    const imgs = (await effectiveImages(storage, page.pageId)).filter((im) => im.kept && im.source === "extract" && Math.min(im.width, im.height) >= Math.max(minSide * 2, 200));
    const results = [];
    for (const im of imgs) {
      const res = await callLLM({ storage, step: "image-segmentation", itemId: `${page.pageId}/${im.imageId}`, promptName: config.image_segmentation?.prompt ?? "image_segmentation", variables: { page_image_base64: await pageImageForLlm(storage, page.pageId, { maxSide: 1000 }), image_base64: await imageBlobForLlm(storage, im.imageId, { maxSide: 1200 }), image_id: im.imageId, width: im.width, height: im.height, min_side: minSide }, schema: SCHEMAS.segmentation, config, modelId: stepModel(config, "image_segmentation"), timeoutMs: stepTimeout(config, "image_segmentation"), signal: ctx.signal });
      const segs = (res.parsed.segments ?? []).filter((s) => s.width > 2 && s.height > 2 && s.width <= 100 && s.height <= 100);
      if (segs.length >= 2) { created += await applySegmentation(storage, im, segs); }
      results.push({ imageId: im.imageId, reasoning: res.parsed.reasoning, segments: segs, applied: segs.length >= 2 });
    }
    await storage.putNodeData("image-segmentation", page.pageId, { images: results, generatedAt: nowIso() });
  });
  return { message: `${created} segments créés` };
}

export async function applySegmentation(storage, im, segments) {
  const blob = await storage.getImageBlob(im.imageId);
  const c = await blobToCanvas(blob);
  let n = 0;
  for (const s of segments) {
    const crop = cropCanvas(c, { x: s.x / 100, y: s.y / 100, w: s.width / 100, h: s.height / 100 });
    n++;
    const id = `${im.imageId}_s${pad3(n)}`;
    const b = im.bounds ? { x: im.bounds.x + (s.x / 100) * im.bounds.w, y: im.bounds.y + (s.y / 100) * im.bounds.h, w: (s.width / 100) * im.bounds.w, h: (s.height / 100) * im.bounds.h } : null;
    await storage.putImage({ imageId: id, pageId: im.pageId, width: crop.width, height: crop.height, source: "segment", renderMethod: "raster", bounds: b, parentImageId: im.imageId, label: s.label }, await canvasToBlob(crop));
  }
  await storage.updateImage(im.imageId, { supersededBy: `${n} segments` });
  return n;
}

// ── Recadrage des images (LLM) ────────────────────────────────────────────
export async function imageCropping(ctx) {
  const { storage, config } = ctx;
  if (!config.image_filters?.cropping) return { skipped: true, message: "Désactivé dans les filtres d'images" };
  const pages = await storage.getActivePages(config);
  let cropped = 0;
  await forEachPage(ctx, pages, async (page) => {
    const imgs = (await effectiveImages(storage, page.pageId)).filter((im) => im.kept && ["extract", "segment"].includes(im.source));
    const results = [];
    for (const im of imgs) {
      const res = await callLLM({ storage, step: "image-cropping", itemId: `${page.pageId}/${im.imageId}`, promptName: config.image_cropping?.prompt ?? "image_cropping", variables: { page_image_base64: await pageImageForLlm(storage, page.pageId, { maxSide: 1000 }), image_base64: await imageBlobForLlm(storage, im.imageId, { maxSide: 1200 }), image_id: im.imageId, width: im.width, height: im.height }, schema: SCHEMAS.cropping, config, modelId: stepModel(config, "image_cropping"), timeoutMs: stepTimeout(config, "image_cropping"), signal: ctx.signal });
      const cr = res.parsed.crop;
      if (cr && cr.width > 10 && cr.height > 10 && (cr.width < 97 || cr.height < 97)) { await applyCrop(storage, im, cr); cropped++; }
      results.push({ imageId: im.imageId, reasoning: res.parsed.reasoning, crop: cr });
    }
    await storage.putNodeData("image-cropping", page.pageId, { images: results, generatedAt: nowIso() });
  });
  return { message: `${cropped} images recadrées` };
}

export async function applyCrop(storage, im, cr) {
  const blob = await storage.getImageBlob(im.imageId);
  const c = await blobToCanvas(blob);
  const crop = cropCanvas(c, { x: cr.x / 100, y: cr.y / 100, w: cr.width / 100, h: cr.height / 100 });
  const id = `${im.imageId}c`;
  const b = im.bounds ? { x: im.bounds.x + (cr.x / 100) * im.bounds.w, y: im.bounds.y + (cr.y / 100) * im.bounds.h, w: (cr.width / 100) * im.bounds.w, h: (cr.height / 100) * im.bounds.h } : null;
  await storage.putImage({ imageId: id, pageId: im.pageId, width: crop.width, height: crop.height, source: "crop", renderMethod: "raster", bounds: b, parentImageId: im.imageId }, await canvasToBlob(crop));
  await storage.updateImage(im.imageId, { supersededBy: id });
  return id;
}

/** Recadrage manuel depuis l'image de page (fractions 0–1). */
export async function cropFromPage(storage, pageId, rect, { source = "crop" } = {}) {
  const blob = await storage.getImageBlob(`${pageId}_page`);
  const c = await blobToCanvas(blob);
  const crop = cropCanvas(c, rect);
  const existing = (await storage.getPageImages(pageId)).filter((im) => !im.imageId.endsWith("_page")).length;
  const id = `${pageId}_im${pad3(existing + 1)}`;
  await storage.putImage({ imageId: id, pageId, width: crop.width, height: crop.height, source, renderMethod: "page-crop", bounds: { x: rect.x, y: rect.y, w: rect.w, h: rect.h } }, await canvasToBlob(crop));
  return id;
}

export const extractSteps = { extract, metadata, "book-summary": bookSummary, "book-outline": bookOutline, "image-filtering": imageFiltering, "image-meaningfulness": imageMeaningfulness, "image-segmentation": imageSegmentation, "image-cropping": imageCropping };
