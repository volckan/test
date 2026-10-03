// Enrichissements : quiz, légendes d'images, glossaire, table des matières, catalogue de texte, lecture facile.
import { callLLM } from "../../llm/client.js";
import { nowIso, pad3, quizIdOf, processWithConcurrency } from "../../util.js";
import { pageImageForLlm, imageBlobForLlm, languageContext, stepModel, stepTimeout, stepRetries, SCHEMAS, bookLanguage, isSectionPruned } from "./common.js";
import { parseHtml } from "../validate-html.js";
import { walkNodes, sectionHeading, headingLevelOf, sectionText } from "../section-tree.js";

const HEADING_ROLES = new Set(["chapter_title", "section_heading", "subheading", "heading"]);

/** Pages rendues avec leur structuration : [{ page, sectioning, rendering }]. */
export async function renderedPages(storage, config) {
  const pages = await storage.getActivePages(config);
  const out = [];
  for (const page of pages) {
    const sectioning = await storage.getNodeData("page-sectioning", page.pageId);
    const rendering = await storage.getNodeData("web-rendering", page.pageId);
    if (sectioning && rendering) out.push({ page, sectioning, rendering });
  }
  return out;
}

function sectionsText(sectioning, rendering, config, allowedTypes) {
  const parts = [];
  for (const s of rendering.sections) {
    const sec = sectioning.sections.find((x) => x.sectionId === s.sectionId) ?? sectioning.sections[s.sectionIndex];
    if (!sec || isSectionPruned(sec, config)) continue;
    if (allowedTypes && !allowedTypes.includes(sec.sectionType)) continue;
    const t = sectionText(sec, config);
    if (t.trim()) parts.push(t);
  }
  return parts.join("\n");
}

// ── Quiz ──────────────────────────────────────────────────────────────────
function shuffleOptions(options, answerIndex) {
  const arr = options.map((o, i) => ({ o, correct: i === answerIndex }));
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return { options: arr.map((e, i) => ({ text: `${i + 1}) ${e.o.text.replace(/^\s*\d+\)\s*/, "").trim()}`, explanation: e.o.explanation })), answerIndex: arr.findIndex((e) => e.correct) };
}

export async function generateOneQuiz({ storage, config, pageTexts, signal, itemId }) {
  const lang = languageContext(await bookLanguage(storage, config));
  const qc = config.quiz_generation ?? {};
  const res = await callLLM({ storage, step: "quiz-generation", itemId, promptName: qc.prompt ?? "quiz_generation", variables: { page_texts: pageTexts, language: lang.name, language_code: lang.code }, schema: SCHEMAS.quiz, config, modelId: stepModel(config, "quiz_generation"), timeoutMs: stepTimeout(config, "quiz_generation"), maxRetries: stepRetries(config, "quiz_generation"), signal,
    validate: (out) => { const e = []; if (out.options?.length !== 3) e.push("exactement 3 options attendues"); if (!(out.answer_index >= 0 && out.answer_index < 3)) e.push("answer_index doit valoir 0, 1 ou 2"); if (!out.question?.trim()) e.push("question vide"); return e; } });
  const sh = shuffleOptions(res.parsed.options, res.parsed.answer_index);
  return { question: res.parsed.question, options: sh.options, answerIndex: sh.answerIndex, reasoning: res.parsed.reasoning };
}

export async function quizGeneration(ctx) {
  const { storage, config } = ctx;
  const qc = config.quiz_generation ?? {};
  const per = Math.max(1, qc.pages_per_quiz ?? 1);
  const items = await renderedPages(storage, config);
  const eligible = items.map((it) => ({ pageId: it.page.pageId, text: sectionsText(it.sectioning, it.rendering, config, qc.quiz_section_types) })).filter((x) => x.text.trim().length > 80);
  const groups = [];
  for (let i = 0; i < eligible.length; i += per) groups.push(eligible.slice(i, i + per));
  const prev = await storage.getNodeData("quiz-generation", "book");
  const manual = (prev?.quizzes ?? []).filter((q) => q.source === "manual" || q.edited);
  const lang = languageContext(await bookLanguage(storage, config));
  const quizzes = [];
  ctx.progress(0, groups.length);
  let done = 0;
  await processWithConcurrency(groups, Math.min(config.concurrency ?? 4, 6), async (group, gi) => {
    try {
      const q = await generateOneQuiz({ storage, config, pageTexts: group.map((g) => ({ pageId: g.pageId, text: g.text.slice(0, 6000) })), signal: ctx.signal, itemId: group.map((g) => g.pageId).join("+") });
      quizzes[gi] = { quizIndex: gi, afterPageId: group[group.length - 1].pageId, pageIds: group.map((g) => g.pageId), ...q, source: "ai" };
    } catch (e) { if (e?.name === "AbortError") throw e; await ctx.onPageError(group[0].pageId, e); }
    done++; ctx.progress(done, groups.length);
  }, { signal: ctx.signal });
  const list = quizzes.filter(Boolean);
  for (const m of manual) if (!list.some((q) => q.afterPageId === m.afterPageId && q.question === m.question)) list.push(m);
  list.sort((a, b) => a.afterPageId.localeCompare(b.afterPageId));
  const used = new Set(manual.map((m) => m.quizId).filter(Boolean));
  list.forEach((q, i) => { if (!q.quizId) { let seq = i + 1; while (used.has(quizIdOf(seq))) seq++; q.quizId = quizIdOf(seq); used.add(q.quizId); } q.quizIndex = i; });
  await storage.putNodeData("quiz-generation", "book", { generatedAt: nowIso(), language: lang.code, pagesPerQuiz: per, quizzes: list });
  return { message: `${list.length} quiz générés` };
}

// ── Légendes d'images ─────────────────────────────────────────────────────
export function imageIdsInHtml(html) { return [...parseHtml(html).body.querySelectorAll("img[data-id]")].map((el) => el.getAttribute("data-id")); }

export async function imageCaptioning(ctx) {
  const { storage, config } = ctx;
  const items = await renderedPages(storage, config);
  const lang = languageContext(await bookLanguage(storage, config));
  const summary = (await storage.getNodeData("book-summary", "book"))?.summary ?? "";
  const prev = await storage.getNodeData("image-captioning", "book");
  const manual = new Map((prev?.captions ?? []).filter((c) => c.source === "manual").map((c) => [c.imageId, c]));
  const captions = [...manual.values()];
  const glossaryImages = ((await storage.getNodeData("glossary", "book"))?.items ?? []).map((g) => g.imageId).filter(Boolean);
  const jobs = [];
  for (const it of items) {
    const ids = new Set();
    for (const s of it.rendering.sections) for (const id of imageIdsInHtml(s.html)) if (!id.endsWith("_page")) ids.add(id);
    const todo = [...ids].filter((id) => !manual.has(id));
    if (todo.length) jobs.push({ page: it.page, ids: todo });
  }
  if (glossaryImages.length) jobs.push({ page: null, ids: glossaryImages.filter((id) => !manual.has(id)) });
  ctx.progress(0, jobs.length); let done = 0;
  await processWithConcurrency(jobs, Math.min(config.concurrency ?? 4, 6), async (job) => {
    try {
      for (let i = 0; i < job.ids.length; i += 8) {
        const batch = job.ids.slice(i, i + 8);
        const images = [];
        for (const id of batch) { const im = await storage.getImage(id); const b64 = await imageBlobForLlm(storage, id, { maxSide: 800 }); if (b64) images.push({ imageId: id, width: im?.width, height: im?.height, imageBase64: b64 }); }
        if (!images.length) continue;
        const pageId = job.page?.pageId ?? (await storage.getImage(batch[0]))?.pageId;
        const res = await callLLM({ storage, step: "image-captioning", itemId: pageId ?? "glossaire", promptName: config.image_captioning?.prompt ?? "image_captioning", variables: { language: lang.name, language_code: lang.code, page_image_base64: pageId ? await pageImageForLlm(storage, pageId, { maxSide: 1000 }) : null, images, book_summary: summary, user_instructions: config.image_captioning_user_prompt ?? "", grade_level: config.image_captioning_grade_level ?? "" }, schema: SCHEMAS.captions, config, modelId: stepModel(config, "image_captioning"), timeoutMs: stepTimeout(config, "image_captioning"), signal: ctx.signal,
          validate: (out) => { const got = new Set((out.captions ?? []).map((c) => c.image_id)); return images.filter((i) => !got.has(i.imageId)).map((i) => `légende manquante pour ${i.imageId}`); } });
        for (const c of res.parsed.captions) captions.push({ imageId: c.image_id, caption: c.decorative ? "" : c.caption, decorative: !!c.decorative, reasoning: c.reasoning, source: "ai" });
      }
    } catch (e) { if (e?.name === "AbortError") throw e; await ctx.onPageError(job.page?.pageId ?? "glossaire", e); }
    done++; ctx.progress(done, jobs.length);
  }, { signal: ctx.signal });
  await storage.putNodeData("image-captioning", "book", { captions, language: lang.code, generatedAt: nowIso() });
  return { message: `${captions.length} images décrites` };
}

// ── Glossaire ─────────────────────────────────────────────────────────────
export async function glossary(ctx) {
  const { storage, config } = ctx;
  const items = await renderedPages(storage, config);
  const lang = languageContext(await bookLanguage(storage, config));
  const prev = await storage.getNodeData("glossary", "book");
  const manualItems = (prev?.items ?? []).filter((g) => g.source === "manual");
  const rejected = (prev?.items ?? []).filter((g) => g.pruned).map((g) => g.word);
  const seeds = config.glossary_seed_terms ?? [];
  const pageTexts = items.map((it) => ({ pageNumber: it.page.pageNumber, text: sectionsText(it.sectioning, it.rendering, config) })).filter((p) => p.text.trim());
  const batches = []; for (let i = 0; i < pageTexts.length; i += 6) batches.push(pageTexts.slice(i, i + 6));
  const collected = [];
  ctx.progress(0, batches.length); let done = 0;
  await processWithConcurrency(batches, Math.min(config.concurrency ?? 4, 6), async (batch, bi) => {
    try {
      const res = await callLLM({ storage, step: "glossary", itemId: `lot-${bi + 1}`, promptName: config.glossary?.prompt ?? "glossary", variables: { language: lang.name, language_code: lang.code, pages: batch.map((p) => ({ ...p, text: p.text.slice(0, 8000) })), excluded_words: rejected, amount: config.glossary_amount ?? "standard", seed_terms: seeds.map((s) => s.word), user_instructions: config.glossary_user_prompt ?? "" }, schema: SCHEMAS.glossary, config, modelId: stepModel(config, "glossary"), timeoutMs: stepTimeout(config, "glossary"), signal: ctx.signal });
      collected.push(...(res.parsed.items ?? []).map((it) => ({ ...it, batch: bi })));
    } catch (e) { if (e?.name === "AbortError") throw e; await ctx.onPageError(`lot-${bi + 1}`, e); }
    done++; ctx.progress(done, batches.length);
  }, { signal: ctx.signal });
  // dédoublonnage par mot normalisé, conservation des identifiants existants
  const prevByWord = new Map((prev?.items ?? []).map((g) => [g.word.trim().toLowerCase(), g]));
  const seen = new Map();
  const norm = (w) => w.trim().toLowerCase();
  for (const s of seeds) seen.set(norm(s.word), { id: s.id || `gl_manual_${norm(s.word).replace(/\W+/g, "_")}`, source: "manual", word: s.word, definition: s.definition, variations: s.variations ?? [], emojis: s.emojis ?? [] });
  for (const m of manualItems) if (!seen.has(norm(m.word))) seen.set(norm(m.word), m);
  const rejectedSet = new Set(rejected.map(norm));
  collected.sort((a, b) => a.batch - b.batch);
  for (const it of collected) {
    const k = norm(it.word);
    if (!k || seen.has(k) || rejectedSet.has(k)) continue;
    const p = prevByWord.get(k);
    seen.set(k, { id: p?.id, source: "ai", word: it.word.trim(), definition: it.definition, variations: (it.variations ?? []).filter((v) => norm(v) !== k), emojis: (it.emojis ?? []).slice(0, 3), imageId: p?.imageId });
  }
  const list = [...seen.values()];
  const usedIds = new Set(list.map((g) => g.id).filter(Boolean));
  let seq = 1;
  for (const g of list) if (!g.id) { while (usedIds.has(`gl${pad3(seq)}`)) seq++; g.id = `gl${pad3(seq)}`; usedIds.add(g.id); }
  for (const r of (prev?.items ?? []).filter((g) => g.pruned)) if (!seen.has(norm(r.word))) list.push(r);
  await storage.putNodeData("glossary", "book", { items: list, pageCount: items.length, language: lang.code, generatedAt: nowIso() });
  return { message: `${list.filter((g) => !g.pruned).length} termes` };
}

export async function generateGlossaryItem({ storage, config, word, signal }) {
  const lang = languageContext(await bookLanguage(storage, config));
  const summary = (await storage.getNodeData("book-summary", "book"))?.summary ?? "";
  const items = await renderedPages(storage, config);
  const ctxText = items.map((it) => sectionsText(it.sectioning, it.rendering, config)).join("\n").split(/(?<=[.!?])\s+/).filter((s) => s.toLowerCase().includes(word.toLowerCase())).slice(0, 6).join("\n");
  const res = await callLLM({ storage, step: "glossary", itemId: word, promptName: "glossary_one", variables: { word, language: lang.name, language_code: lang.code, book_summary: summary, context_text: ctxText }, schema: SCHEMAS.glossaryOne, config, modelId: stepModel(config, "glossary"), signal, noCache: true });
  return res.parsed;
}

// ── Table des matières ────────────────────────────────────────────────────
export async function collectHeadings(storage, config) {
  const items = await renderedPages(storage, config);
  const outline = await storage.getNodeData("book-outline", "book");
  const headings = []; let originalToc = null;
  for (const it of items) {
    for (const s of it.sectioning.sections) {
      if (isSectionPruned(s, config) || !it.rendering.sections.some((r) => r.sectionId === s.sectionId)) continue;
      if (s.sectionType === "table_of_contents") originalToc = (originalToc ?? "") + sectionText(s, config) + "\n";
      const h = sectionHeading(s);
      if (!h) continue;
      const outlineLevel = h.outlineEntryId ? outline?.entries?.find((e) => e.outlineId === h.outlineEntryId)?.level : null;
      headings.push({ sectionId: s.sectionId, title: h.text, textType: h.role, headingLevel: outlineLevel ?? headingLevelOf(h), chapterId: h.nodeId, pageId: it.page.pageId });
    }
  }
  return { headings, originalToc };
}

export async function tocGeneration(ctx) {
  const { storage, config } = ctx;
  const lang = languageContext(await bookLanguage(storage, config));
  const { headings, originalToc } = await collectHeadings(storage, config);
  const items = await renderedPages(storage, config);
  if (!headings.length) { await storage.putNodeData("toc-generation", "book", { entries: [], pageCount: items.length, generatedAt: nowIso() }); return { message: "Aucun titre détecté" }; }
  const mode = config.toc_mode ?? "extract";
  const res = await callLLM({ storage, step: "toc-generation", itemId: "book", promptName: config.toc_generation?.prompt ?? "toc_generation", variables: { language: lang.name, language_code: lang.code, headings: headings.map(({ sectionId, title, textType, headingLevel }) => ({ sectionId, title, textType, headingLevel: headingLevel ?? "" })), mode, has_original_toc: mode === "extract" && !!originalToc, original_toc_text: originalToc ?? "" }, schema: SCHEMAS.toc, config, modelId: stepModel(config, "toc_generation"), timeoutMs: stepTimeout(config, "toc_generation"), signal: ctx.signal,
    validate: (out) => { const ids = new Set(headings.map((h) => h.sectionId)); return (out.entries ?? []).filter((e) => !ids.has(e.sectionId)).map((e) => `sectionId inconnu : ${e.sectionId}`).slice(0, 5); } });
  const byId = new Map(headings.map((h) => [h.sectionId, h]));
  const entries = (res.parsed.entries ?? []).map((e, i) => { const h = byId.get(e.sectionId); return { id: `toc${pad3(i + 1)}`, title: e.title?.trim() || h.title, sectionId: e.sectionId, href: `${e.sectionId}.html`, chapterId: h.chapterId, level: Math.min(6, Math.max(1, e.level ?? 1)), pageId: h.pageId }; });
  await storage.putNodeData("toc-generation", "book", { entries, pageCount: items.length, mode, generatedAt: nowIso() });
  return { message: `${entries.length} entrées` };
}

// ── Catalogue de texte ────────────────────────────────────────────────────
export function catalogEntriesFromHtml(pageId, html, captionMap, sectionId, section, startActivity = 0) {
  const entries = []; let ac = startActivity;
  const doc = parseHtml(html);
  const els = [...doc.body.querySelectorAll("[data-id]")].filter((el) => !el.querySelector("[data-id]"));
  for (const el of els) {
    const id = el.getAttribute("data-id");
    if (el.tagName.toLowerCase() === "img") { const cap = captionMap.get(id); if (cap) entries.push({ id, text: cap }); continue; }
    const text = el.textContent.replace(/\s+/g, " ").trim();
    if (!text) continue;
    const realId = id.startsWith("activity_gen_") ? `${pageId}_ac${pad3(++ac)}` : id;
    entries.push({ id: realId, text });
  }
  return { entries, activityCounter: ac };
}

export async function textCatalog(ctx) {
  const { storage, config } = ctx;
  const items = await renderedPages(storage, config);
  const captions = (await storage.getNodeData("image-captioning", "book"))?.captions ?? [];
  const capMap = new Map(captions.filter((c) => !c.decorative && c.caption).map((c) => [c.imageId, c.caption]));
  const entries = []; const seen = new Set();
  const push = (e) => { if (!seen.has(e.id)) { seen.add(e.id); entries.push(e); } };
  for (const it of items) {
    let ac = 0;
    for (const s of it.rendering.sections) {
      const sec = it.sectioning.sections.find((x) => x.sectionId === s.sectionId);
      if (sec && isSectionPruned(sec, config)) continue;
      const r = catalogEntriesFromHtml(it.page.pageId, s.html, capMap, s.sectionId, sec, ac); ac = r.activityCounter;
      r.entries.forEach(push);
      for (const [k, v] of Object.entries(s.activityAnswers ?? {})) if (typeof v === "string" && v.trim() && !/^(true|false|dropzone-\d+|cat-\d+)$/.test(v)) push({ id: `${s.sectionId}_ans_${k}`, text: v });
    }
  }
  for (const g of ((await storage.getNodeData("glossary", "book"))?.items ?? []).filter((g) => !g.pruned)) { push({ id: g.id, text: g.word }); push({ id: `${g.id}_def`, text: g.definition }); }
  for (const q of (await storage.getNodeData("quiz-generation", "book"))?.quizzes ?? []) { push({ id: `${q.quizId}_que`, text: q.question }); q.options.forEach((o, i) => { push({ id: `${q.quizId}_o${i}`, text: o.text }); push({ id: `${q.quizId}_o${i}_exp`, text: o.explanation }); }); }
  for (const e of ((await storage.getNodeData("toc-generation", "book"))?.entries ?? [])) if (e.title) push({ id: `${e.id}_title`, text: e.title });
  await storage.putNodeData("text-catalog", "book", { entries, generatedAt: nowIso() });
  return { message: `${entries.length} entrées de texte` };
}

// ── Lecture facile ────────────────────────────────────────────────────────
export async function easyRead(ctx) {
  const { storage, config } = ctx;
  if (config.easy_read?.enabled === false) return { skipped: true, message: "Désactivée" };
  const items = await renderedPages(storage, config);
  const catalog = (await storage.getNodeData("text-catalog", "book"))?.entries ?? [];
  const catMap = new Map(catalog.map((e) => [e.id, e.text]));
  const lang = languageContext(await bookLanguage(storage, config));
  const prev = await storage.getNodeData("easy-read", "book");
  const manual = new Map(); for (const b of prev?.blocks ?? []) for (const e of b.entries) if (e.manual) manual.set(e.sourceId, e);
  const batchSize = config.easy_read?.batch_size ?? 12;
  const jobs = [];
  for (const it of items) {
    for (const s of it.rendering.sections) {
      const sec = it.sectioning.sections.find((x) => x.sectionId === s.sectionId);
      if (!sec || isSectionPruned(sec, config)) continue;
      const roles = new Map(); walkNodes(sec.nodes, (n) => { if (n.role) roles.set(n.nodeId, n.role); });
      const doc = parseHtml(s.html);
      const ids = [...doc.body.querySelectorAll("[data-id]")].filter((el) => !el.querySelector("[data-id]") && el.tagName.toLowerCase() !== "img" && !/^h[1-6]$/i.test(el.tagName) && !el.closest(".word-card, [data-activity-item], nav, button, input, textarea, select")).map((el) => el.getAttribute("data-id")).filter((id) => catMap.has(id) && !/_im\d{3}/.test(id) && !id.startsWith("activity_gen_") && !HEADING_ROLES.has(roles.get(id)) && !["page_number", "header", "footer", "watermark"].includes(roles.get(id)) && catMap.get(id).split(/\s+/).length >= 3);
      if (ids.length) jobs.push({ page: it.page, section: sec, sectionIndex: s.sectionIndex, ids });
    }
  }
  const blocks = [];
  ctx.progress(0, jobs.length); let done = 0;
  await processWithConcurrency(jobs, Math.min(config.concurrency ?? 4, 6), async (job) => {
    const entries = [];
    try {
      const sectionTextAll = job.ids.map((id) => catMap.get(id)).join("\n");
      for (let i = 0; i < job.ids.length; i += batchSize) {
        const batch = job.ids.slice(i, i + batchSize);
        const todo = batch.filter((id) => !manual.has(id));
        for (const id of batch.filter((id) => manual.has(id))) entries.push(manual.get(id));
        if (!todo.length) continue;
        const res = await callLLM({ storage, step: "easy-read", itemId: `${job.section.sectionId}/${i}`, promptName: config.easy_read?.prompt ?? "easy_read", variables: { language: lang.name, language_code: lang.code, section_text: sectionTextAll.slice(0, 12000), texts: todo.map((id, k) => ({ index: k + 1, text: catMap.get(id) })) }, schema: SCHEMAS.easyRead, config, modelId: stepModel(config, "easy_read"), timeoutMs: stepTimeout(config, "easy_read"), signal: ctx.signal, validate: (out) => (out.texts?.length === todo.length ? [] : [`attendu ${todo.length} textes, reçu ${out.texts?.length ?? 0}`]) });
        todo.forEach((id, k) => entries.push({ sourceId: id, easyReadId: `${id}_easy_read`, originalText: catMap.get(id), text: res.parsed.texts[k], pageId: job.page.pageId, sectionId: job.section.sectionId, sectionIndex: job.sectionIndex }));
      }
      blocks.push({ pageId: job.page.pageId, pageNumber: job.page.pageNumber, sectionId: job.section.sectionId, sectionIndex: job.sectionIndex, sectionType: job.section.sectionType, entries });
    } catch (e) { if (e?.name === "AbortError") throw e; await ctx.onPageError(job.page.pageId, e); }
    done++; ctx.progress(done, jobs.length);
  }, { signal: ctx.signal });
  blocks.sort((a, b) => a.pageNumber - b.pageNumber || a.sectionIndex - b.sectionIndex);
  await storage.putNodeData("easy-read", "book", { blocks, language: lang.code, generatedAt: nowIso() });
  return { message: `${blocks.reduce((n, b) => n + b.entries.length, 0)} textes adaptés` };
}

export const enrichSteps = { "quiz-generation": quizGeneration, "image-captioning": imageCaptioning, glossary, "toc-generation": tocGeneration, "text-catalog": textCatalog, "easy-read": easyRead };
