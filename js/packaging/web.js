// Empaquetage web : produit l'arborescence du paquet ADT (fichiers en mémoire).
import { RUNTIME_JS } from "./runtime-js.js";
import { RUNTIME_CSS } from "./runtime-css.js";
import { uiStringsFor } from "./ui-strings.js";
import { compileTailwind } from "./tailwind-compile.js";
import { escapeHtml, escapeAttr, escapeXml, nowIso, baseLanguage, tokenizeWords, quizQuestions, quizQuestionPrefix, quizTitle } from "../util.js";
import { parseHtml } from "../pipeline/validate-html.js";
import { walkNodes } from "../pipeline/section-tree.js";
import { getTypography, typographyCss } from "../pipeline/typography.js";
import { outputLanguages, catalogForLanguage } from "../pipeline/steps/translate.js";
import { audioKey, isTtsExcluded } from "../pipeline/steps/speech.js";
import { pcm16ToWav } from "../llm/providers.js";
import { languageName } from "../config.js";

let temmlPromise = null;
function loadTemml() {
  if (!temmlPromise) temmlPromise = new Promise((res) => { if (window.temml) return res(window.temml); const s = document.createElement("script"); s.src = new URL("../../vendor/temml.min.js", import.meta.url).href; s.onload = () => res(window.temml); s.onerror = () => res(null); document.head.appendChild(s); });
  return temmlPromise;
}
export function latexToMathML(temml, tex) { if (!temml) return null; try { return temml.renderToString(tex, { displayMode: !/\$/.test(tex), throwOnError: false }); } catch { return null; } }

/** Petits sons synthétisés (WAV) pour les activités. */
function tone(freqs, duration = 0.18, type = "sine") {
  const rate = 22050, n = Math.floor(rate * duration), pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) { const t = i / rate; let v = 0; for (const f of freqs) v += Math.sin(2 * Math.PI * f * t) * (type === "square" ? 0.5 : 1); v /= freqs.length; const env = Math.min(1, i / 400) * Math.exp(-3 * t / duration); pcm[i] = Math.round(v * env * 12000); }
  return pcm16ToWav(new Uint8Array(pcm.buffer), rate, 1);
}
export const SOUND_FILES = () => ({ "assets/sounds/drop.wav": tone([660], 0.12), "assets/sounds/reset.wav": tone([440, 330], 0.2), "assets/sounds/success.wav": tone([523, 659, 784], 0.45), "assets/sounds/error.wav": tone([220, 185], 0.35, "square") });

const DEFAULT_FEATURES = { glossary: true, quizzes: true, readAloud: true, signLanguage: true, easyRead: true, captions: true, toc: true, activities: true, notepad: false, eli5: false };

/**
 * Construit le paquet web. Retourne { files: Map<path, Blob|string>, readingOrder, warnings, stats }.
 * options : { features, languages (sous-ensemble des langues de sortie), defaultSettings, lockedSettings, onProgress }
 */
export async function buildWebPackage(storage, options = {}) {
  const warnings = [];
  const progress = options.onProgress ?? (() => {});
  const config = await storage.effectiveConfig();
  const features = { ...DEFAULT_FEATURES, ...(options.features ?? {}) };
  if (config.speech?.enabled === false) features.readAloud = false; // module Parole désactivé : pas de lecture audio
  const meta = await storage.getNodeData("metadata", "book");
  const book = await storage.getBook();
  const title = book?.titleOverride ?? meta?.title ?? book?.title ?? storage.label;
  const pages = await storage.getActivePages(config);
  const allLangs = await outputLanguages(storage, config);
  const langs = options.languages?.length ? allLangs.filter((l) => options.languages.includes(l)) : allLangs;
  const defaultLang = langs[0] ?? "fr";
  const files = new Map();
  const temml = await loadTemml();
  const typography = await getTypography(storage, config);
  const captions = (features.captions ? (await storage.getNodeData("image-captioning", "book"))?.captions : null) ?? [];
  const capMap = new Map(captions.map((c) => [c.imageId, c]));
  const quizzes = features.quizzes ? ((await storage.getNodeData("quiz-generation", "book"))?.quizzes ?? []) : [];
  const glossary = features.glossary ? ((await storage.getNodeData("glossary", "book"))?.items ?? []).filter((g) => !g.pruned) : [];
  const toc = (await storage.getNodeData("toc-generation", "book"))?.entries ?? [];
  const easyRead = features.easyRead ? ((await storage.getNodeData("easy-read", "book"))?.blocks ?? []) : [];
  const fixedLayout = Object.values(config.render_strategies ?? {}).some((s) => s.render_type === "fixed_layout" && (config.default_render_strategy && config.render_strategies[config.default_render_strategy] === s));

  // ── Ordre de lecture et pages ────────────────────────────────────────────
  const readingOrder = []; const pageHtmls = []; const usedImages = new Set(); const mathIds = new Map(); const sectionRoles = new Map();
  progress("Assemblage des pages", 0.05);
  for (const page of pages) {
    const sectioning = await storage.getNodeData("page-sectioning", page.pageId);
    const rendering = await storage.getNodeData("web-rendering", page.pageId);
    if (!sectioning || !rendering) { warnings.push(`Page ${page.pageNumber} non rendue : ignorée`); continue; }
    for (const sec of sectioning.sections) walkNodes(sec.nodes, (n) => { if (n.role === "math") mathIds.set(n.nodeId, n.text); if (n.role) sectionRoles.set(n.nodeId, n.role); });
    for (const r of rendering.sections) {
      const sec = sectioning.sections.find((s) => s.sectionId === r.sectionId);
      if (!sec || sec.isPruned || (config.pruned_section_types ?? []).includes(sec.sectionType)) continue;
      if (sec.sectionType.startsWith("activity_") && !features.activities) continue;
      const { html, images } = prepareSectionHtml(r.html, { capMap, mathIds, temml });
      images.forEach((i) => usedImages.add(i));
      readingOrder.push({ section_id: r.sectionId, href: `${r.sectionId}.html`, page_number: sec.pageNumber ?? page.pageNumber, pageId: page.pageId, sectionType: sec.sectionType, html, answers: r.activityAnswers ?? null, stepper: r.stepper ?? null, fixed: r.renderType === "fixed_layout" });
    }
    for (const q of quizzes.filter((q) => q.afterPageId === page.pageId)) readingOrder.push({ section_id: q.quizId, href: `${q.quizId}.html`, quiz: q, pageId: page.pageId, sectionType: "activity_quiz" });
  }
  if (!readingOrder.length) throw new Error("Aucune section rendue : lancez d'abord le scénarimage.");

  // ── Images ───────────────────────────────────────────────────────────────
  progress("Copie des images", 0.15);
  const imageFiles = new Map();
  const addImage = async (id) => {
    if (imageFiles.has(id)) return imageFiles.get(id);
    const im = await storage.getImage(id); const blob = await storage.getImageBlob(id);
    if (!blob) { warnings.push(`Image manquante : ${id}`); return null; }
    const ext = blob.type === "image/jpeg" ? "jpg" : blob.type === "image/webp" ? "webp" : "png";
    const name = `${id}.${ext}`; files.set(`images/${name}`, blob); imageFiles.set(id, name); return name;
  };
  for (const id of usedImages) await addImage(id);
  for (const g of glossary) if (g.imageId) await addImage(g.imageId);
  for (const item of readingOrder) if (item.fixed) await addImage(`${item.pageId}_page`);
  const coverId = meta?.cover_page_number ? `pg${String(meta.cover_page_number).padStart(3, "0")}_page` : `${pages[0]?.pageId}_page`;
  const coverBlob = await storage.getImageBlob(coverId); if (coverBlob) files.set("cover.png", coverBlob);

  // ── Données par langue ───────────────────────────────────────────────────
  const sourceLang = allLangs[0];
  const signVideos = features.signLanguage ? await storage.listBlobsWithData("sign/") : [];
  const videoAssign = (await storage.getNodeData("sign-language", "book"))?.assignments ?? {};
  let anyAudio = false, anyTimecodes = false;
  for (let li = 0; li < langs.length; li++) {
    const lang = langs[li];
    progress(`Données pour ${languageName(lang)}`, 0.2 + 0.4 * (li / langs.length));
    const catalog = await catalogForLanguage(storage, config, lang);
    const texts = {};
    for (const e of catalog) texts[e.id] = mathIds.has(e.id) ? (latexToMathML(temml, e.text) ?? e.text) : e.text;
    if (!features.easyRead) for (const k of Object.keys(texts)) if (k.endsWith("_easy_read")) delete texts[k];
    for (const e of readingOrder) if (e.quiz) { texts[`${e.quiz.quizId}`] ??= texts[`${quizQuestionPrefix(e.quiz, 0)}_que`] ?? quizTitle(e.quiz); }
    for (const item of readingOrder) if (!item.quiz) texts[item.section_id] ??= title;
    const i18n = `content/i18n/${lang}/`;
    files.set(`${i18n}texts.json`, JSON.stringify(texts));
    const core = (await storage.getNodeData("core-tts-catalog", lang))?.entries ?? [];
    const speechTexts = {}; for (const c of core) if (c.status === "ready" && c.changed) speechTexts[c.id] = c.speechText;
    files.set(`${i18n}speech_texts.json`, JSON.stringify(speechTexts));
    const audios = {}; const secondary = {}; let secondaryLabel = null, primaryLabel = null;
    if (features.readAloud) {
      const tts = await storage.getNodeData("tts", lang);
      for (const e of tts?.entries ?? []) {
        if (isTtsExcluded(e.textId, config.speech)) continue;
        const blob = await storage.getBlob(audioKey(lang, e.textId, e.voiceSlot));
        if (!blob) continue;
        files.set(`${i18n}audio/${e.fileName}`, blob);
        if (e.voiceSlot === "secondary") { secondary[e.textId] = e.fileName; secondaryLabel = e.voiceLabel ?? "Voix 2"; } else { audios[e.textId] = e.fileName; primaryLabel = e.voiceLabel ?? "Voix 1"; }
        anyAudio = true;
      }
    }
    files.set(`${i18n}audios.json`, JSON.stringify(audios));
    if (Object.keys(secondary).length) files.set(`${i18n}audio_voices.json`, JSON.stringify({ defaultVoice: "primary", voices: { primary: { label: primaryLabel, audios }, secondary: { label: secondaryLabel, audios: secondary } } }));
    const ts = await storage.getNodeData("tts-timestamps", lang);
    const tcPrimary = {}, tcSecondary = {};
    for (const [key, e] of Object.entries(ts?.entries ?? {})) {
      const target = e.voiceSlot === "secondary" ? tcSecondary : tcPrimary;
      target[e.textId] = { timecodes: [null, { word_timestamps: e.words.map((w) => ({ text: w.word, start: w.start, end: w.end })) }], duration: e.duration };
      anyTimecodes = true;
    }
    files.set(`${i18n}timecode/timecode_output.json`, JSON.stringify(tcPrimary));
    if (Object.keys(tcSecondary).length) files.set(`${i18n}timecode/timecode_voices.json`, JSON.stringify({ primary: tcPrimary, secondary: tcSecondary }));
    const videos = {};
    for (const [sectionId, key] of Object.entries(videoAssign)) { const row = signVideos.find((v) => v.key === key); if (!row) continue; const ext = (row.type || "video/mp4").includes("webm") ? "webm" : "mp4"; const name = `sl_${sectionId}.${ext}`; files.set(`${i18n}video/${name}`, row.blob); videos[sectionId] = name; }
    files.set(`${i18n}videos.json`, JSON.stringify(videos));
    const imgTr = (await storage.getNodeData("image-translation", lang))?.images ?? {};
    const imagesJson = {}; for (const [orig, variant] of Object.entries(imgTr)) { const name = await addImage(variant); if (name) imagesJson[orig] = name; }
    files.set(`${i18n}images.json`, JSON.stringify(imagesJson));
    if (features.glossary) {
      const gj = {};
      for (const g of glossary) { const word = texts[g.id] ?? g.word; gj[word] = { word, definition: texts[`${g.id}_def`] ?? g.definition, variations: g.variations ?? [], emoji: (g.emojis ?? []).join(" "), id: g.id, ...(g.imageId && imageFiles.get(g.imageId) ? { image: `images/${imageFiles.get(g.imageId)}` } : {}), ...(videos[g.id] ? { video: `${i18n}video/${videos[g.id]}` } : {}) }; }
      files.set(`${i18n}glossary.json`, JSON.stringify(gj));
    }
    files.set(`assets/interface_translations/${lang}/interface_translations.json`, JSON.stringify({ ...uiStringsFor(lang), "language-name": languageName(lang) || uiStringsFor(lang)["language-name"] }));
  }

  // ── pages.json / toc.json / config.json ───────────────────────────────────
  const pagesJson = readingOrder.map((e) => ({ section_id: e.section_id, href: e.href, ...(e.page_number != null ? { page_number: e.page_number } : {}) }));
  files.set("content/pages.json", JSON.stringify(pagesJson));
  const tocJson = (features.toc ? toc : []).filter((e) => readingOrder.some((r) => r.section_id === e.sectionId)).map((e) => ({ section_id: e.sectionId, href: e.href, title: e.title, chapter_id: e.chapterId, level: e.level }));
  files.set("content/toc.json", JSON.stringify(tocJson));
  const ds = options.defaultSettings ?? config.default_settings ?? {};
  const configJson = { title, bundleVersion: "adt-studio-web-1", languages: { available: langs, default: defaultLang }, features: { signLanguage: !!features.signLanguage && signVideos.length > 0, easyRead: !!features.easyRead && easyRead.length > 0, glossary: !!features.glossary && glossary.length > 0, eli5: !!features.eli5, readAloud: !!features.readAloud && anyAudio, autoplay: true, showTutorial: true, showNavigationControls: true, describeImages: true, notepad: !!features.notepad, state: true, characterDisplay: false, highlight: !!features.readAloud && anyTimecodes && config.speech?.word_highlighting !== false, activities: !!features.activities }, analytics: { enabled: false }, defaultSettings: { dockLayout: ds.dock_layout ?? ds.dockLayout, theme: ds.theme, iconSize: ds.icon_size ?? ds.iconSize, reduceMotion: ds.reduce_motion ?? ds.reduceMotion }, lockedSettings: options.lockedSettings ?? config.locked_settings ?? [], ...(fixedLayout ? { fixedLayout: true } : {}) };
  files.set("assets/config.json", JSON.stringify(configJson, null, 1));

  // ── CSS (Tailwind compilé + typographie) ─────────────────────────────────
  progress("Compilation des styles", 0.65);
  const tcss = typographyCss(typography);
  let tailwindCss = "";
  try { tailwindCss = await compileTailwind(readingOrder.map((e) => e.html ?? quizHtmlBody(e.quiz, defaultLang)), { extraCss: "" }); } catch (e) { warnings.push(`Tailwind : ${e.message} — repli sur une feuille minimale`); tailwindCss = FALLBACK_CSS; }
  files.set("content/tailwind_output.css", `${tailwindCss}\n/* typographie */\n${tcss}\n${PAGE_BASE_CSS}`);
  files.set("assets/adt-runtime.css", RUNTIME_CSS);
  files.set("assets/adt-runtime.js", RUNTIME_JS);
  try { const [tj, tc] = await Promise.all([fetch(new URL("../../vendor/temml.min.js", import.meta.url)).then((r) => r.text()), fetch(new URL("../../vendor/temml.css", import.meta.url)).then((r) => r.text())]); files.set("assets/temml.min.js", tj); files.set("assets/temml.css", tc); } catch { warnings.push("Temml non copié (mathématiques affichées en LaTeX brut)"); }
  for (const [k, v] of Object.entries(SOUND_FILES())) files.set(k, v);

  // ── Pages HTML ───────────────────────────────────────────────────────────
  progress("Écriture des pages", 0.8);
  const imgRename = (html) => html.replace(/src="images\/([^".]+)\.png"/g, (m, id) => imageFiles.has(id) ? `src="images/${imageFiles.get(id)}"` : m).replace(/url\('images\/([^'.]+)\.png'\)/g, (m, id) => imageFiles.has(id) ? `url('images/${imageFiles.get(id)}')` : m);
  readingOrder.forEach((item, idx) => {
    const body = item.quiz ? quizHtmlBody(item.quiz, defaultLang) : imgRename(item.html);
    files.set(item.href, renderPageHtml({ title, lang: defaultLang, sectionId: item.section_id, position: idx + 1, body, answers: item.quiz ? null : item.answers, fixed: item.fixed, page: item.fixed ? pages.find((p) => p.pageId === item.pageId) : null, hasH1: /<h1[\s>]/i.test(body) }));
  });
  files.set("index.html", `<!doctype html><html lang="${defaultLang}"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><meta http-equiv="refresh" content="0; url=${readingOrder[0].href}"><script>location.replace(${JSON.stringify(readingOrder[0].href)});</script></head><body><a href="${readingOrder[0].href}">${escapeHtml(title)}</a></body></html>`);

  // ── Préchargeur hors ligne, SCORM, manifeste ─────────────────────────────
  const inline = {};
  for (const [p, v] of files) if (typeof v === "string" && (p.endsWith(".json") || p.endsWith(".html"))) inline[p] = v;
  files.set("assets/offline-preloader.js", `window.__ADT_INLINE=${safeJson(inline)};(function(){var I=window.__ADT_INLINE;var f=window.fetch;window.fetch=function(u,o){var p=String(u).replace(/^\\.\\//,"").split(/[?#]/)[0];var base=document.querySelector("base");if(location.protocol!=="file:"&&!window.__ADT_ASSET_MAP){try{var abs=new URL(String(u),location.href);var here=new URL(".",location.href);if(abs.href.indexOf(here.href)===0)p=abs.href.slice(here.href.length);}catch(e){}}if(I[p]!==undefined){return Promise.resolve(new Response(I[p],{status:200,headers:{"Content-Type":p.endsWith(".json")?"application/json":"text/html"}}));}return f.apply(this,arguments);};})();`);
  files.set("assets/scorm.js", SCORM_JS);
  files.set("imsmanifest.xml", imsManifest(storage.label, title, readingOrder.map((e) => e.href)));
  files.set("manifest.json", JSON.stringify({ name: title, short_name: title.slice(0, 20), start_url: "index.html", display: "standalone", lang: defaultLang, icons: coverBlob ? [{ src: "cover.png", sizes: "any", type: "image/png" }] : [] }));
  files.set("README.txt", `${title}\n\nLivre numérique accessible (ADT) généré par ADT Studio Web le ${nowIso()}.\nOuvrez index.html dans un navigateur, ou déposez ce dossier sur n'importe quel hébergement statique.\nLangues : ${langs.join(", ")}.`);
  progress("Terminé", 1);
  const bytes = [...files.values()].reduce((n, v) => n + (typeof v === "string" ? v.length : v.size), 0);
  return { files, readingOrder: pagesJson, warnings, stats: { files: files.size, bytes, pages: readingOrder.length, languages: langs, images: imageFiles.size }, config: configJson, title };
}

/** Prépare le HTML d'une section : alt des images, images décoratives, mathématiques, nettoyage. */
export function safeJson(v) { return JSON.stringify(v).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029"); }

export function prepareSectionHtml(html, { capMap, mathIds, temml }) {
  const doc = parseHtml(html);
  const images = [];
  for (const img of doc.body.querySelectorAll("img[data-id]")) {
    const id = img.getAttribute("data-id");
    if (!img.getAttribute("src")) img.setAttribute("src", `images/${id}.png`);
    const m = /images\/([^/."]+)/.exec(img.getAttribute("src") ?? ""); if (m) images.push(m[1]);
    const cap = capMap.get(id);
    if (cap?.decorative || img.hasAttribute("data-fl-background")) { img.setAttribute("alt", ""); img.setAttribute("role", "presentation"); img.setAttribute("aria-hidden", "true"); }
    else img.setAttribute("alt", cap?.caption ?? img.getAttribute("alt") ?? "");
  }
  for (const el of doc.body.querySelectorAll("[data-id]")) {
    const id = el.getAttribute("data-id");
    if (mathIds.has(id) && el.tagName.toLowerCase() !== "img") { el.setAttribute("data-math", "true"); const mml = latexToMathML(temml, mathIds.get(id)); if (mml) el.innerHTML = mml; }
    el.removeAttribute("contenteditable");
  }
  for (const s of doc.body.querySelectorAll("script, iframe, object, embed")) s.remove();
  const content = doc.body.querySelector("#content") ?? doc.body.firstElementChild;
  if (content && content.id !== "content") { content.id = "content"; }
  const bg = content?.getAttribute("data-background-color") ?? (content?.style?.backgroundColor || "");
  return { html: doc.body.innerHTML, images, backgroundColor: bg };
}

export function renderPageHtml({ title, lang, sectionId, position, body, answers, fixed, page, hasH1 }) {
  const bgMatch = /background-color:\s*([^;"]+)/.exec(body);
  const bg = bgMatch ? bgMatch[1].trim() : "#ffffff";
  const viewport = fixed && page ? `width=device-width, initial-scale=1` : "width=device-width, initial-scale=1";
  return `<!doctype html>
<html lang="${escapeAttr(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="${viewport}">
<title>${escapeHtml(title)}</title>
<meta name="title-id" content="${escapeAttr(sectionId)}">
<meta name="page-section-id" content="${position}">
<link rel="manifest" href="manifest.json">
<link rel="stylesheet" href="content/tailwind_output.css">
<link rel="stylesheet" href="assets/adt-runtime.css">
<link rel="stylesheet" href="assets/temml.css">
</head>
<body class="min-h-screen" style="background-color: ${escapeAttr(bg)}">
<main class="w-full" id="main" tabindex="-1">
${hasH1 ? "" : `<h1 class="sr-only" id="page-heading">${escapeHtml(title)}</h1>`}
<div id="content-wrapper">${body.replace(/id="content"/, 'id="content" class="opacity-0"').replace(/class="opacity-0"([^>]*)class="/, 'class="opacity-0 $1')}</div>
</main>
${answers ? `<script type="application/json" data-correct-answers>${JSON.stringify(answers).replace(/</g, "\\u003c")}</script><script>window.correctAnswers=JSON.parse(document.querySelector("script[data-correct-answers]").textContent);</script>` : "<script>window.correctAnswers={};</script>"}
<div class="relative z-50" id="interface-container"></div>
<div class="relative z-50" id="nav-container"></div>
<script src="assets/offline-preloader.js"></script>
<script src="assets/temml.min.js"></script>
<script src="assets/scorm.js"></script>
<script src="assets/adt-runtime.js"></script>
</body>
</html>`;
}

export function quizHtmlBody(q, lang) {
  const qs = quizQuestions(q); const correct = {}; const expl = {};
  const blocks = qs.map((qu, k) => {
    const p = quizQuestionPrefix(q, k, qs.length); const type = qu.type ?? "multiple_choice";
    if (type === "fill_in_the_blank") {
      correct[`${p}_ans`] = (qu.answers ?? []).join("|"); expl[`${p}_ans_exp`] = qu.explanation ?? "";
      return `<div class="quiz-question space-y-3" data-quiz-question data-qtype="fill_in_the_blank" data-prefix="${escapeAttr(p)}">
<h2 class="adt-h2 font-bold">${qs.length > 1 ? `<span class="quiz-num">${k + 1}. </span>` : ""}<span class="sr-only" aria-hidden="true" data-id="${escapeAttr(p)}_que">${escapeHtml(qu.question)}</span><span class="quiz-fitb-render adt-body font-normal"></span></h2>
<div class="quiz-fitb-controls flex items-center gap-3"><button type="button" class="adt-btn quiz-check">Vérifier</button></div>
<p class="quiz-feedback feedback-text" role="status" hidden></p>
</div>`;
    }
    (qu.options ?? []).forEach((o, i) => { correct[`${p}_o${i}`] = i === qu.answerIndex; expl[`${p}_o${i}_exp`] = o.explanation; });
    return `<div class="quiz-question space-y-3" data-quiz-question data-qtype="${escapeAttr(type)}" data-prefix="${escapeAttr(p)}">
<h2 class="adt-h2 font-bold">${qs.length > 1 ? `<span class="quiz-num">${k + 1}. </span>` : ""}<span data-id="${escapeAttr(p)}_que">${escapeHtml(qu.question)}</span></h2>
<div class="space-y-3" role="group" aria-label="Options">
${(qu.options ?? []).map((o, i) => `<label class="activity-option flex items-start gap-4 p-4 rounded-xl border-2 border-slate-200 hover:bg-slate-50 cursor-pointer min-h-11" data-activity-item="${p}_o${i}" data-explanation-id="${p}_o${i}_exp"><input type="radio" name="quiz-${escapeAttr(p)}" value="${i}" class="sr-only"><span class="option-letter w-8 h-8 flex-none rounded-full border-2 border-slate-300 flex items-center justify-center text-slate-600 font-bold" aria-hidden="true">${i + 1}</span><span class="flex-1"><span class="option-text adt-body" data-id="${p}_o${i}">${escapeHtml(o.text)}</span><span class="feedback-container hidden mt-2 text-sm"><span class="feedback-icon mr-1"></span><span class="feedback-text"></span></span></span><span class="validation-mark w-6 text-center" aria-hidden="true"></span></label>`).join("\n")}
</div>
</div>`;
  });
  return `<div id="content" class="container mx-auto w-full max-w-3xl px-6 py-10 min-h-screen flex items-center" style="background-color:#f8fafc">
<section id="simple-main" class="w-full rounded-2xl bg-white shadow-sm p-6 md:p-10 space-y-8" data-section-type="activity_quiz" data-section-id="${escapeAttr(q.quizId)}" data-id="${escapeAttr(q.quizId)}" data-area-id="${escapeAttr(q.quizId)}" data-correct-answers='${escapeAttr(JSON.stringify(correct))}' data-option-explanations='${escapeAttr(JSON.stringify(expl))}'>
${blocks.join("\n")}
<div data-submit-target></div>
<script type="application/json" id="quiz-correct-answers">${JSON.stringify(correct).replace(/</g, "\\u003c")}</script>
<script type="application/json" id="quiz-explanations">${JSON.stringify(expl).replace(/</g, "\\u003c")}</script>
</section></div>`;
}

export function imsManifest(label, title, hrefs) {
  const id = `ADT_${label.replace(/[^A-Za-z0-9_]/g, "_").toUpperCase()}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${id}" version="1.0" xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd http://www.imsglobal.org/xsd/imsmd_rootv1p2p1 imsmd_rootv1p2p1.xsd http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>
  <organizations default="ADT_ORG"><organization identifier="ADT_ORG"><title>${escapeXml(title)}</title><item identifier="ITEM_1" identifierref="RESOURCE_1"><title>${escapeXml(title)}</title></item></organization></organizations>
  <resources><resource identifier="RESOURCE_1" type="webcontent" adlcp:scormtype="sco" href="index.html">
    <file href="index.html"/>
${hrefs.map((h) => `    <file href="${escapeXml(h)}"/>`).join("\n")}
    <file href="assets/adt-runtime.js"/><file href="assets/adt-runtime.css"/><file href="assets/scorm.js"/><file href="assets/offline-preloader.js"/><file href="assets/config.json"/><file href="content/pages.json"/><file href="content/toc.json"/><file href="content/tailwind_output.css"/>
  </resource></resources>
</manifest>`;
}

const SCORM_JS = String.raw`(function(){var api=null;function find(w){var n=0;while(w&&n<7){if(w.API)return w.API;if(w.parent===w)break;w=w.parent;n++;}return null;}try{api=find(window)||(window.opener?find(window.opener):null);}catch(e){}if(!api)return;var inited=false;function init(){if(inited)return;try{api.LMSInitialize("");inited=true;}catch(e){}}function pageId(){var m=document.querySelector('meta[name="title-id"]');return m?m.content:"";}function ids(){return JSON.parse(localStorage.getItem("adt:activityIds")||"[]");}function report(){init();try{api.LMSSetValue("cmi.core.lesson_location",pageId());var all=ids();var done=JSON.parse(localStorage.getItem("completedActivities")||"[]");if(!all.length){api.LMSSetValue("cmi.core.lesson_status","passed");api.LMSSetValue("cmi.core.score.raw","100");}else{var c=done.filter(function(d){return all.indexOf(d)>=0;}).length;api.LMSSetValue("cmi.core.score.raw",String(Math.round(c/all.length*100)));api.LMSSetValue("cmi.core.lesson_status",c>=all.length?"passed":"incomplete");}api.LMSCommit("");}catch(e){}}fetch("content/pages.json").then(function(r){return r.json();}).then(function(p){var all=p.filter(function(x){return /^qz/.test(x.section_id);}).map(function(x){return x.section_id;});document.querySelectorAll("[data-area-id]").forEach(function(e){if(all.indexOf(e.getAttribute("data-area-id"))<0)all.push(e.getAttribute("data-area-id"));});localStorage.setItem("adt:activityIds",JSON.stringify(all));report();}).catch(report);document.addEventListener("adt:page-changed",report);document.addEventListener("adt:activity-completed",report);window.addEventListener("beforeunload",function(){report();try{api.LMSFinish("");}catch(e){}});})();`;

const PAGE_BASE_CSS = `html{-webkit-text-size-adjust:100%}body{margin:0}img{max-width:100%;height:auto}#content{transition:opacity .2s}#content.opacity-0{opacity:0}[data-fl-positioned]{color:transparent}[data-fl-positioned]::selection{background:rgba(28,171,226,.35)}main:focus{outline:none}`;
const FALLBACK_CSS = `*,::before,::after{box-sizing:border-box}.container{width:100%}.mx-auto{margin-left:auto;margin-right:auto}.w-full{width:100%}.flex{display:flex}.flex-col{flex-direction:column}.items-center{align-items:center}.items-start{align-items:flex-start}.justify-center{justify-content:center}.gap-4{gap:1rem}.gap-8{gap:2rem}.p-4{padding:1rem}.px-6{padding-left:1.5rem;padding-right:1.5rem}.px-8{padding-left:2rem;padding-right:2rem}.py-8{padding-top:2rem;padding-bottom:2rem}.py-10{padding-top:2.5rem;padding-bottom:2.5rem}.py-12{padding-top:3rem;padding-bottom:3rem}.min-h-screen{min-height:100vh}.max-w-3xl{max-width:48rem}.max-w-5xl{max-width:64rem}.max-w-6xl{max-width:72rem}.space-y-3>*+*{margin-top:.75rem}.space-y-4>*+*{margin-top:1rem}.space-y-6>*+*{margin-top:1.5rem}.space-y-8>*+*{margin-top:2rem}.rounded-lg{border-radius:.5rem}.rounded-xl{border-radius:.75rem}.rounded-2xl{border-radius:1rem}.border{border:1px solid #e5e7eb}.border-2{border-width:2px}.font-bold{font-weight:700}.font-semibold{font-weight:600}.text-center{text-align:center}.hidden{display:none}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.list-disc{list-style:disc}.pl-4{padding-left:1rem}.my-4{margin-top:1rem;margin-bottom:1rem}.cursor-pointer{cursor:pointer}.relative{position:relative}.absolute{position:absolute}.inset-0{inset:0}.h-full{height:100%}.bg-white{background:#fff}@media(min-width:1024px){.lg\\:flex-row{flex-direction:row}.lg\\:basis-1\\/2{flex-basis:50%}}`;

/** Zip du paquet (Blob). */
export async function zipFiles(files, { mimetypeFirst = false } = {}) {
  const JSZip = await loadJSZip();
  const zip = new JSZip();
  if (mimetypeFirst && files.has("mimetype")) zip.file("mimetype", files.get("mimetype"), { compression: "STORE" });
  for (const [p, v] of files) { if (mimetypeFirst && p === "mimetype") continue; zip.file(p, v); }
  return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
}
let jszipPromise = null;
export function loadJSZip() {
  if (!jszipPromise) jszipPromise = new Promise((res, rej) => { if (window.JSZip) return res(window.JSZip); const s = document.createElement("script"); s.src = new URL("../../vendor/jszip.min.js", import.meta.url).href; s.onload = () => res(window.JSZip); s.onerror = rej; document.head.appendChild(s); });
  return jszipPromise;
}

/** Enregistre le paquet dans le stockage du livre (clés adt/<chemin>). */
export async function storePackage(storage, files) {
  for (const row of await storage.listBlobs("adt/")) await storage.deleteBlob(row.key);
  for (const [p, v] of files) await storage.putBlob(`adt/${p}`, typeof v === "string" ? new Blob([v], { type: p.endsWith(".json") ? "application/json" : p.endsWith(".html") ? "text/html" : p.endsWith(".css") ? "text/css" : p.endsWith(".js") ? "text/javascript" : p.endsWith(".xml") ? "application/xml" : "text/plain" }) : v);
}
export async function loadPackageFiles(storage) {
  const rows = await storage.listBlobsWithData("adt/");
  const files = new Map();
  for (const r of rows) files.set(r.key.slice(4), r.blob);
  return files;
}
export function wordSpans(text, dataId) { const toks = tokenizeWords(text); let out = "", last = 0; toks.forEach((t, i) => { out += escapeHtml(text.slice(last, t.index)) + `<span id="${dataId}_w${String(i + 1).padStart(3, "0")}">${escapeHtml(t.word)}</span>`; last = t.index + t.word.length; }); return out + escapeHtml(text.slice(last)); }
export { baseLanguage };
