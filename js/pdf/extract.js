// Extraction PDF dans le navigateur avec pdf.js : rendu des pages, texte,
// blocs de texte positionnés (avec taille/graisse de police), images intégrées
// (XObjects) avec leur position sur la page, détection de filigranes répétés.
import { canvasToBlob, pageIdOf, pad3, tokenizeWords } from "../util.js";

let pdfjsPromise = null;
export function loadPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("../../vendor/pdf.min.mjs").then((mod) => {
      mod.GlobalWorkerOptions.workerSrc = new URL("../../vendor/pdf.worker.min.mjs", import.meta.url).href;
      return mod;
    });
  }
  return pdfjsPromise;
}

export async function openPdf(blob) {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await blob.arrayBuffer());
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: true }).promise;
  return doc;
}

export async function pdfInfo(blob) {
  const doc = await openPdf(blob);
  const meta = await doc.getMetadata().catch(() => ({}));
  const info = { pageCount: doc.numPages, title: meta?.info?.Title ?? null, author: meta?.info?.Author ?? null };
  await doc.destroy();
  return info;
}

/** Rend une page en PNG (échelle choisie pour une largeur cible). */
export async function renderPage(page, { scale = 2, maxWidth = 1800 } = {}) {
  const vp1 = page.getViewport({ scale: 1 });
  const s = Math.min(scale, maxWidth / vp1.width);
  const viewport = page.getViewport({ scale: s });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width); canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  await page.render({ canvasContext: ctx, viewport, intent: "display" }).promise;
  return { canvas, viewport, scale: s, width: canvas.width, height: canvas.height, pdfWidth: vp1.width, pdfHeight: vp1.height };
}

function fontFlags(styles, fontName) {
  const st = styles?.[fontName];
  const name = (st?.fontFamily ?? fontName ?? "").toLowerCase();
  const bold = /bold|black|heavy|semibold|demibold/.test(name) || /[-,]b(d|old)?\b/.test(name);
  const italic = /italic|oblique/.test(name);
  const serif = st ? !!st.serif : /serif|times|georgia|garamond|book|roman/.test(name) && !/sans/.test(name);
  return { bold, italic, serif, family: st?.fontFamily ?? fontName ?? "" };
}

/**
 * Texte de la page : chaîne brute + blocs positionnés regroupés par lignes puis blocs.
 * Coordonnées en fraction de la page (0–1), origine en haut à gauche.
 */
export async function extractText(page) {
  const vp = page.getViewport({ scale: 1 });
  const content = await page.getTextContent({ includeMarkedContent: false });
  const items = [];
  for (const it of content.items) {
    if (!("str" in it)) continue;
    const [a, b, c, d, e, f] = it.transform;
    const fontSize = Math.hypot(c, d) || Math.hypot(a, b) || 10;
    const x = e, yTop = vp.height - f - fontSize * 0.8;
    const w = it.width || fontSize * it.str.length * 0.5, h = it.height || fontSize;
    const ff = fontFlags(content.styles, it.fontName);
    items.push({ str: it.str, x, y: yTop, w, h, fontSize, ...ff, hasEOL: it.hasEOL });
  }
  // regroupement en lignes
  items.sort((p, q) => (Math.abs(p.y - q.y) < Math.min(p.h, q.h) * 0.5 ? p.x - q.x : p.y - q.y));
  const lines = [];
  for (const it of items) {
    if (!it.str.trim() && !it.hasEOL) continue;
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - it.y) < Math.max(last.h, it.h) * 0.5 && it.x >= last.x + last.w - last.h * 0.5 && it.x - (last.x + last.w) < last.h * 1.5) {
      const gap = it.x - (last.x + last.w);
      last.str += (gap > last.fontSize * 0.15 && !last.str.endsWith(" ") && !it.str.startsWith(" ") ? " " : "") + it.str;
      last.w = Math.max(last.x + last.w, it.x + it.w) - last.x; last.h = Math.max(last.h, it.h);
      last.fontSize = Math.max(last.fontSize, it.fontSize); last.bold = last.bold || it.bold;
    } else lines.push({ ...it });
  }
  // regroupement en blocs (lignes consécutives proches, même taille approximative)
  const blocks = [];
  for (const ln of lines) {
    if (!ln.str.trim()) continue;
    const last = blocks[blocks.length - 1];
    const lastLine = last?.lines[last.lines.length - 1];
    if (last && lastLine && ln.y - (lastLine.y + lastLine.h) < ln.fontSize * 0.9 && Math.abs(ln.fontSize - lastLine.fontSize) < 1.5 && Math.abs(ln.x - last.x) < vp.width * 0.25 && ln.bold === last.bold) {
      last.lines.push(ln);
      last.x = Math.min(last.x, ln.x); last.w = Math.max(last.x2, ln.x + ln.w) - Math.min(last.x, ln.x); last.x2 = Math.max(last.x2, ln.x + ln.w);
      last.y2 = ln.y + ln.h;
    } else blocks.push({ x: ln.x, y: ln.y, x2: ln.x + ln.w, y2: ln.y + ln.h, w: ln.w, lines: [ln], fontSize: ln.fontSize, bold: ln.bold, italic: ln.italic, serif: ln.serif, family: ln.family });
  }
  const text = blocks.map((b) => b.lines.map((l) => l.str.trim()).join("\n")).join("\n\n");
  const positioned = blocks.map((b, i) => {
    const t = b.lines.map((l) => l.str.trim()).join(" ").replace(/\s+/g, " ").trim();
    const cx = (b.x + b.x2) / 2 / vp.width;
    return { id: `${pad3(i + 1)}`, text: t, left: b.x / vp.width, top: b.y / vp.height, width: (b.x2 - b.x) / vp.width, height: (b.y2 - b.y) / vp.height, fontSize: Math.round(b.fontSize * 10) / 10, bold: b.bold, italic: b.italic, serif: b.serif, family: b.family, centered: Math.abs(cx - 0.5) < 0.06 && (b.x2 - b.x) / vp.width < 0.8, lineCount: b.lines.length, lineHeight: b.lines.length > 1 ? ((b.y2 - b.y) / b.lines.length) / vp.height : (b.fontSize * 1.2) / vp.height };
  });
  return { text, positioned, pdfWidth: vp.width, pdfHeight: vp.height };
}

/** Extrait les images intégrées (XObjects) de la page avec leur position. */
export async function extractImages(page, pdfjs, { minSide = 24, maxImages = 60 } = {}) {
  const vp = page.getViewport({ scale: 1 });
  const ops = await page.getOperatorList();
  const results = [];
  // Suivi de la matrice de transformation courante (CTM)
  let ctm = [1, 0, 0, 1, 0, 0]; const stack = [];
  const mul = (m1, m2) => [m1[0] * m2[0] + m1[2] * m2[1], m1[1] * m2[0] + m1[3] * m2[1], m1[0] * m2[2] + m1[2] * m2[3], m1[1] * m2[2] + m1[3] * m2[3], m1[0] * m2[4] + m1[2] * m2[5] + m1[4], m1[1] * m2[4] + m1[3] * m2[5] + m1[5]];
  const seen = new Map();
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i], args = ops.argsArray[i];
    if (fn === pdfjs.OPS.save) stack.push(ctm.slice());
    else if (fn === pdfjs.OPS.restore) ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0];
    else if (fn === pdfjs.OPS.transform) ctm = mul(ctm, args);
    else if (fn === pdfjs.OPS.paintImageXObject || fn === pdfjs.OPS.paintImageXObjectRepeat || fn === pdfjs.OPS.paintInlineImageXObject) {
      const name = fn === pdfjs.OPS.paintInlineImageXObject ? `inline_${i}` : args[0];
      // Boîte englobante de l'unité carrée transformée par la CTM
      const pts = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]]);
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      const bx = Math.min(...xs), bw = Math.max(...xs) - bx, byPdf = Math.min(...ys), bh = Math.max(...ys) - byPdf;
      const bounds = { x: bx / vp.width, y: (vp.height - byPdf - bh) / vp.height, w: bw / vp.width, h: bh / vp.height };
      if (seen.has(name) && fn !== pdfjs.OPS.paintInlineImageXObject) { seen.get(name).repeats++; continue; }
      let imgObj = null;
      try {
        if (fn === pdfjs.OPS.paintInlineImageXObject) imgObj = args[0];
        else imgObj = await resolveObj(page, name);
      } catch { imgObj = null; }
      const entry = { name, imgObj, bounds, repeats: 1, order: results.length };
      seen.set(name, entry); results.push(entry);
      if (results.length >= maxImages) break;
    }
  }
  const out = [];
  for (const r of results) {
    const img = r.imgObj;
    if (!img || !img.width || !img.height) continue;
    if (Math.min(img.width, img.height) < minSide) continue;
    try {
      const canvas = imageObjToCanvas(img);
      if (!canvas) continue;
      const blob = await canvasToBlob(canvas, "image/png");
      out.push({ blob, width: canvas.width, height: canvas.height, bounds: r.bounds, name: r.name, repeats: r.repeats });
    } catch (e) { console.warn("image extraction", r.name, e); }
  }
  return out;
}

/** Récupère un objet (image) de la page, en attendant sa résolution par le worker si nécessaire. */
function resolveObj(page, name) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 8000);
    const done = (v) => { clearTimeout(timer); resolve(v ?? null); };
    try {
      const store = name.startsWith("g_") ? page.commonObjs : page.objs;
      if (store.has(name)) { try { return done(store.get(name)); } catch { /* non résolu : callback */ } }
      store.get(name, done);
    } catch { done(null); }
  });
}

function imageObjToCanvas(img) {
  const canvas = document.createElement("canvas");
  canvas.width = img.width; canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (img.bitmap) { ctx.drawImage(img.bitmap, 0, 0); return canvas; }
  if (!img.data) return null;
  const kind = img.kind; // 1 = GRAYSCALE_1BPP, 2 = RGB_24BPP, 3 = RGBA_32BPP
  const n = img.width * img.height;
  const rgba = new Uint8ClampedArray(n * 4);
  if (kind === 3 || img.data.length === n * 4) rgba.set(img.data.subarray(0, n * 4));
  else if (kind === 2 || img.data.length === n * 3) { for (let i = 0, j = 0; i < n; i++, j += 3) { rgba[i * 4] = img.data[j]; rgba[i * 4 + 1] = img.data[j + 1]; rgba[i * 4 + 2] = img.data[j + 2]; rgba[i * 4 + 3] = 255; } }
  else if (kind === 1) { const rowBytes = Math.ceil(img.width / 8); for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) { const bit = (img.data[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1; const v = bit ? 255 : 0; const i = (y * img.width + x) * 4; rgba[i] = rgba[i + 1] = rgba[i + 2] = v; rgba[i + 3] = 255; } }
  else if (img.data.length === n) { for (let i = 0; i < n; i++) { rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = img.data[i]; rgba[i * 4 + 3] = 255; } }
  else return null;
  ctx.putImageData(new ImageData(rgba, img.width, img.height), 0, 0);
  return canvas;
}

/** Écart-type des niveaux de gris (complexité) et détection d'images quasi uniformes. */
export function imageStats(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const step = Math.max(1, Math.floor(Math.sqrt((canvas.width * canvas.height) / 20000)));
  let sum = 0, sum2 = 0, n = 0, alpha = 0;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y += step) for (let x = 0; x < canvas.width; x += step) {
    const i = (y * canvas.width + x) * 4; const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    sum += g; sum2 += g * g; n++; alpha += data[i + 3];
  }
  const mean = sum / n; const std = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
  return { stddev: std, mean, meanAlpha: alpha / n };
}

export async function blobToCanvas(blob) {
  const bmp = await createImageBitmap(blob);
  const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
  c.getContext("2d").drawImage(bmp, 0, 0); bmp.close();
  return c;
}

/** Recadre une zone (fractions 0–1) d'un canevas vers un nouveau canevas. */
export function cropCanvas(src, { x, y, w, h }, { pad = 0 } = {}) {
  const X = Math.max(0, Math.floor((x - pad) * src.width)), Y = Math.max(0, Math.floor((y - pad) * src.height));
  const W = Math.min(src.width - X, Math.ceil((w + 2 * pad) * src.width)), H = Math.min(src.height - Y, Math.ceil((h + 2 * pad) * src.height));
  const c = document.createElement("canvas"); c.width = Math.max(1, W); c.height = Math.max(1, H);
  c.getContext("2d").drawImage(src, X, Y, W, H, 0, 0, W, H);
  return c;
}

/** Détecte les textes identiques répétés sur ≥ 60 % des pages (filigranes / en-têtes). */
export function detectRepeatedText(pagesPositioned) {
  const counts = new Map();
  for (const blocks of pagesPositioned) {
    const seen = new Set();
    for (const b of blocks) { const k = b.text.trim().toLowerCase(); if (k.length < 6 || seen.has(k)) continue; seen.add(k); counts.set(k, (counts.get(k) ?? 0) + 1); }
  }
  const threshold = Math.max(3, Math.ceil(pagesPositioned.length * 0.6));
  return new Set([...counts.entries()].filter(([, c]) => c >= threshold).map(([k]) => k));
}

/** Histogramme des tailles de police pondéré par nombre de caractères → échelle typographique. */
export function computeTypeScale(pagesPositioned) {
  const hist = new Map();
  for (const blocks of pagesPositioned) for (const b of blocks) { const k = Math.round(b.fontSize); hist.set(k, (hist.get(k) ?? 0) + b.text.length); }
  if (!hist.size) return null;
  const sorted = [...hist.entries()].sort((a, b) => b[1] - a[1]);
  const bodyPx = sorted[0][0];
  const larger = [...hist.keys()].filter((k) => k > bodyPx * 1.15).sort((a, b) => b - a);
  return { bodyPx, h1Px: larger[0] ?? Math.round(bodyPx * 2), h2Px: larger[1] ?? Math.round(bodyPx * 1.6), h3Px: larger[2] ?? Math.round(bodyPx * 1.3), observed: [...hist.entries()].sort((a, b) => a[0] - b[0]).map(([px, chars]) => ({ px, chars })) };
}

/** Détection heuristique des doubles pages : pages larges (ratio > 1.2) ou paires consécutives de même hauteur après la couverture. */
export function suggestSpreads(pages) {
  const wide = pages.filter((p) => p.pdfWidth / p.pdfHeight > 1.2).map((p) => p.pageNumber);
  if (wide.length >= pages.length * 0.5) return { mode: "wide", wide, pairs: [] };
  const pairs = [];
  for (let i = 1; i + 1 < pages.length; i += 2) pairs.push(pages[i].pageNumber);
  return { mode: "pairs", wide, pairs };
}

/**
 * Extraction complète d'un livre. onProgress({ current, total, pageId }).
 * Retourne { pages: [{ pageId, pageNumber, text, positioned, width, height, pdfWidth, pdfHeight, pageBlob, images:[...] }], typeScale, repeated }
 */
export async function extractBook(pdfBlob, { startPage = 1, endPage = Infinity, minSide = 24, onProgress, onPage, signal, renderScale = 2 } = {}) {
  const pdfjs = await loadPdfJs();
  const doc = await openPdf(pdfBlob);
  const total = doc.numPages;
  const first = Math.max(1, startPage), last = Math.min(total, endPage);
  const positionedAll = [];
  const pages = [];
  try {
    for (let n = first; n <= last; n++) {
      if (signal?.aborted) throw new DOMException("Annulé", "AbortError");
      const page = await doc.getPage(n);
      const pageId = pageIdOf(n);
      const [textRes, rendered] = await Promise.all([extractText(page), renderPage(page, { scale: renderScale })]);
      const pageBlob = await canvasToBlob(rendered.canvas, "image/png");
      let images = [];
      try { images = await extractImages(page, pdfjs, { minSide }); } catch (e) { console.warn("extractImages", e); }
      const entry = { pageId, pageNumber: n, text: textRes.text, positioned: textRes.positioned, width: rendered.width, height: rendered.height, pdfWidth: rendered.pdfWidth, pdfHeight: rendered.pdfHeight, pageBlob, pageCanvas: rendered.canvas, images };
      positionedAll.push(textRes.positioned);
      pages.push(entry);
      onProgress?.({ current: n - first + 1, total: last - first + 1, pageId });
      if (onPage) await onPage(entry);
      page.cleanup();
    }
  } finally { await doc.destroy(); }
  return { pages, typeScale: computeTypeScale(positionedAll), repeated: detectRepeatedText(positionedAll), pageCount: total };
}

/** Enlève du texte les blocs répétés (filigranes) ; retourne le texte filtré. */
export function stripRepeated(positioned, repeated) {
  if (!repeated?.size) return positioned;
  return positioned.filter((b) => !repeated.has(b.text.trim().toLowerCase()));
}
export function positionedToText(positioned) { return positioned.map((b) => b.text).join("\n\n"); }
export function wordCount(text) { return tokenizeWords(text).length; }
