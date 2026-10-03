// Étape « Traduire » : traduction du catalogue, normalisation TTS, traduction d'images.
import { callLLM } from "../../llm/client.js";
import { generateImage, resolveUsableModel } from "../../llm/providers.js";
import { getCredentials } from "../../storage.js";
import { nowIso, baseLanguage, processWithConcurrency, imageDimensions } from "../../util.js";
import { languageContext, stepModel, stepTimeout, SCHEMAS, sourceLanguage, bookLanguage } from "./common.js";
import { getSetting } from "../../db.js";
import { DEFAULT_CORE_TTS_PROFILES, languageName } from "../../config.js";

/** Catalogue effectif (source + lecture facile), pour une langue : [{id,text}]. */
export async function fullSourceCatalog(storage) {
  const base = (await storage.getNodeData("text-catalog", "book"))?.entries ?? [];
  const er = (await storage.getNodeData("easy-read", "book"))?.blocks ?? [];
  const out = base.slice();
  for (const b of er) for (const e of b.entries) out.push({ id: e.easyReadId, text: e.text });
  return out;
}

export async function outputLanguages(storage, config) {
  const src = await bookLanguage(storage, config);
  const langs = [src, ...(config.output_languages ?? [])];
  return [...new Set(langs.map((l) => String(l).trim()).filter(Boolean))];
}

async function translateBatch({ storage, config, texts, srcCtx, tgtCtx, itemId, signal, depth = 0 }) {
  const res = await callLLM({ storage, step: "catalog-translation", itemId, promptName: config.translation?.prompt ?? "translation", variables: { source_language: srcCtx.name, source_language_code: srcCtx.code, target_language: tgtCtx.name, target_language_code: tgtCtx.code, texts: texts.map((t, i) => ({ index: i + 1, text: t.text })) }, schema: SCHEMAS.translation, config, modelId: stepModel(config, "translation"), timeoutMs: stepTimeout(config, "translation"), maxRetries: 2, signal }).catch((e) => { if (e?.name === "AbortError" || texts.length === 1 || depth > 4) throw e; return null; });
  if (res && res.parsed.translations?.length === texts.length) return res.parsed.translations;
  if (texts.length === 1) throw new Error("Nombre de traductions incohérent");
  const mid = Math.ceil(texts.length / 2);
  const [a, b] = await Promise.all([translateBatch({ storage, config, texts: texts.slice(0, mid), srcCtx, tgtCtx, itemId: `${itemId}a`, signal, depth: depth + 1 }), translateBatch({ storage, config, texts: texts.slice(mid), srcCtx, tgtCtx, itemId: `${itemId}b`, signal, depth: depth + 1 })]);
  return [...a, ...b];
}

export async function catalogTranslation(ctx) {
  const { storage, config } = ctx;
  const src = await bookLanguage(storage, config);
  const targets = (config.output_languages ?? []).filter((l) => baseLanguage(l) !== baseLanguage(src));
  if (!targets.length) return { skipped: true, message: "Aucune langue de sortie supplémentaire" };
  const catalog = await fullSourceCatalog(storage);
  const srcCtx = languageContext(src);
  let total = 0;
  const jobs = [];
  for (const lang of targets) {
    const prev = await storage.getNodeData("text-catalog-translation", lang);
    const prevMap = new Map((prev?.entries ?? []).map((e) => [e.id, e]));
    const result = new Map();
    const todo = [];
    for (const e of catalog) { const p = prevMap.get(e.id); if (p && (p.manual || p.sourceText === e.text)) result.set(e.id, { ...p }); else todo.push(e); }
    for (let i = 0; i < todo.length; i += 50) jobs.push({ lang, batch: todo.slice(i, i + 50), result, index: i / 50 });
    jobs.push({ lang, finalize: true, result, count: catalog.length });
  }
  ctx.progress(0, jobs.length); let done = 0;
  const finals = jobs.filter((j) => j.finalize); const work = jobs.filter((j) => !j.finalize);
  await processWithConcurrency(work, Math.min(config.concurrency ?? 4, 6), async (job) => {
    const tgtCtx = languageContext(job.lang);
    try {
      const tr = await translateBatch({ storage, config, texts: job.batch, srcCtx, tgtCtx, itemId: `${job.lang}/${job.index}`, signal: ctx.signal });
      job.batch.forEach((e, k) => job.result.set(e.id, { id: e.id, text: tr[k], sourceText: e.text }));
      total += job.batch.length;
    } catch (e) { if (e?.name === "AbortError") throw e; await ctx.onPageError(`${job.lang}/lot-${job.index}`, e); }
    done++; ctx.progress(done, jobs.length);
  }, { signal: ctx.signal });
  for (const f of finals) {
    const entries = catalog.map((e) => f.result.get(e.id)).filter(Boolean);
    await storage.putNodeData("text-catalog-translation", f.lang, { language: f.lang, entries, generatedAt: nowIso() });
    done++; ctx.progress(done, jobs.length);
  }
  return { message: `${total} segments traduits vers ${targets.map(languageName).join(", ")}` };
}

/** Catalogue d'une langue (source → catalogue source ; autre → traduction). */
export async function catalogForLanguage(storage, config, lang) {
  const src = await bookLanguage(storage, config);
  if (baseLanguage(lang) === baseLanguage(src)) return fullSourceCatalog(storage);
  const tr = await storage.getNodeData("text-catalog-translation", lang);
  return (tr?.entries ?? []).map(({ id, text }) => ({ id, text }));
}

const NEEDS_TTS_PREP = /\$[^$]+\$|\\[a-zA-Z]+\{|\d|%|\b[A-Z]{2,}\b|\b(p|pp|ex|cf|etc|M|Mme|Dr|n°|chap|fig|vol|art)\.|[–-]\s*\d|…/;

export async function coreTtsCatalog(ctx) {
  const { storage, config } = ctx;
  const core = config.core_tts ?? {};
  const enabled = [core.latex_to_speech !== false ? "latex-to-speech" : null, core.language_normalization !== false ? "language-normalization" : null].filter(Boolean);
  const langs = await outputLanguages(storage, config);
  const profiles = { ...DEFAULT_CORE_TTS_PROFILES, ...(await getSetting("coreTtsProfiles", {})), ...(config.core_tts?.profiles ?? {}) };
  let changed = 0;
  const jobs = [];
  for (const lang of langs) {
    const catalog = await catalogForLanguage(storage, config, lang);
    const prev = await storage.getNodeData("core-tts-catalog", lang);
    const prevMap = new Map((prev?.entries ?? []).map((e) => [e.id, e]));
    const entries = catalog.map((e) => { const p = prevMap.get(e.id); if (p && (p.manual || p.displayText === e.text)) return { ...p }; return { id: e.id, displayText: e.text, speechText: e.text, changed: false, transformations: [], status: "ready", needs: enabled.length > 0 && NEEDS_TTS_PREP.test(e.text) }; });
    const todo = entries.filter((e) => e.needs);
    for (let i = 0; i < todo.length; i += 25) jobs.push({ lang, batch: todo.slice(i, i + 25), entries, index: i / 25 });
    jobs.push({ lang, finalize: true, entries });
  }
  ctx.progress(0, jobs.length); let done = 0;
  const work = jobs.filter((j) => !j.finalize);
  await processWithConcurrency(work, Math.min(config.concurrency ?? 4, 6), async (job) => {
    const lc = languageContext(job.lang);
    const profileKey = profiles[lc.code.toLowerCase()] ? lc.code.toLowerCase() : profiles[lc.base] ? lc.base : "default";
    try {
      const idx = new Map(job.entries.map((e, i) => [e.id, i]));
      const res = await callLLM({ storage, step: "core-tts-catalog", itemId: `${job.lang}/${job.index}`, promptName: config.core_tts?.prompt ?? "core_tts_preparation", variables: { language: lc.name, profile_key: profileKey, profile_guidance: profiles[profileKey], enabled_transformations: enabled, entries: job.batch.map((e) => ({ id: e.id, display_text: e.displayText, previous_display_text: job.entries[(idx.get(e.id) ?? 0) - 1]?.displayText ?? "", next_display_text: job.entries[(idx.get(e.id) ?? 0) + 1]?.displayText ?? "" })) }, schema: SCHEMAS.coreTts, config, modelId: stepModel(config, "core_tts"), timeoutMs: 180000, signal: ctx.signal, validate: (out) => { const got = new Set((out.results ?? []).map((r) => r.id)); return job.batch.filter((e) => !got.has(e.id)).map((e) => `résultat manquant pour ${e.id}`).slice(0, 5); } });
      for (const r of res.parsed.results) { const e = job.batch.find((x) => x.id === r.id); if (!e) continue; if (r.speech_text == null) { e.status = "failed"; e.failureReason = r.failure_reason; } else { e.speechText = r.speech_text; e.changed = r.speech_text !== e.displayText; e.transformations = r.transformation_kinds ?? []; e.status = "ready"; if (e.changed) changed++; } delete e.needs; }
    } catch (e) { if (e?.name === "AbortError") throw e; await ctx.onPageError(`${job.lang}/lot-${job.index}`, e); }
    done++; ctx.progress(done, jobs.length);
  }, { signal: ctx.signal });
  for (const f of jobs.filter((j) => j.finalize)) { for (const e of f.entries) delete e.needs; await storage.putNodeData("core-tts-catalog", f.lang, { language: f.lang, entries: f.entries, generatedAt: nowIso() }); done++; ctx.progress(done, jobs.length); }
  return { message: `${changed} entrées normalisées pour la parole` };
}

export async function imageTranslation(ctx) {
  const { storage, config } = ctx;
  const it = config.image_translation ?? {};
  const selected = it.selected_image_ids ?? [];
  if (!it.enabled || !selected.length) return { skipped: true, message: "Désactivée ou aucune image sélectionnée" };
  const src = await bookLanguage(storage, config);
  const targets = (config.output_languages ?? []).filter((l) => baseLanguage(l) !== baseLanguage(src));
  if (!targets.length) return { skipped: true, message: "Aucune langue cible" };
  const modelId = it.image_model ?? config.default_image_generation_model ?? "openai:gpt-image-2";
  const credentials = await getCredentials();
  const captions = (await storage.getNodeData("image-captioning", "book"))?.captions ?? [];
  const jobs = targets.flatMap((lang) => selected.map((imageId) => ({ lang, imageId })));
  const results = {};
  ctx.progress(0, jobs.length); let done = 0;
  await processWithConcurrency(jobs, 2, async ({ lang, imageId }) => {
    try {
      const im = await storage.getImage(imageId); const blob = await storage.getImageBlob(imageId);
      if (!im || !blob) return;
      const variantId = `${imageId}_tr_${lang}`;
      const existing = await storage.getImage(variantId);
      if (existing && !ctx.options?.force) { (results[lang] ??= {})[imageId] = variantId; return; }
      const tr = await storage.getNodeData("text-catalog-translation", lang);
      const cap = captions.find((c) => c.imageId === imageId)?.caption ?? "";
      const srcTexts = (await storage.getPage(im.pageId))?.positioned?.filter((b) => im.bounds && b.left >= im.bounds.x - 0.02 && b.left <= im.bounds.x + im.bounds.w && b.top >= im.bounds.y - 0.02 && b.top <= im.bounds.y + im.bounds.h).map((b) => b.text) ?? [];
      const texts = srcTexts.map((s) => ({ source: s, target: tr?.entries?.find((e) => e.sourceText === s)?.text ?? s }));
      const { renderPrompt } = await import("../../llm/prompt-engine.js");
      const { getPromptSource } = await import("../../llm/prompts.js");
      const prompt = renderPrompt(await getPromptSource(it.prompt ?? "image_translation", { label: storage.label }), { target_language: languageName(lang), texts, caption: cap }).text;
      const out = await generateImage({ modelId: resolveUsableModel(modelId, credentials, "image").modelId, prompt, referenceImages: [{ blob }], aspectRatio: im.width / im.height, credentials, signal: ctx.signal });
      const dims = await imageDimensions(out.blob);
      await storage.putImage({ imageId: variantId, pageId: im.pageId, width: dims.width, height: dims.height, source: "translate", renderMethod: "raster", bounds: im.bounds, parentImageId: imageId, language: lang, mime: out.mime }, out.blob);
      await storage.appendLlmLog({ requestId: variantId, step: "image-translation", itemId: imageId, success: 1, errorCount: 0, data: { model: modelId, promptName: "image_translation", messages: [{ role: "user", parts: [{ type: "text", text: prompt }] }], response: `image ${dims.width}×${dims.height}`, usage: { input: 0, output: 0 } } });
      (results[lang] ??= {})[imageId] = variantId;
    } catch (e) { if (e?.name === "AbortError") throw e; await ctx.onPageError(`${lang}/${imageId}`, e); }
    done++; ctx.progress(done, jobs.length);
  }, { signal: ctx.signal });
  for (const lang of targets) await storage.putNodeData("image-translation", lang, { language: lang, images: results[lang] ?? {}, generatedAt: nowIso() });
  return { message: `${Object.values(results).reduce((n, m) => n + Object.keys(m).length, 0)} images traduites` };
}

export const translateSteps = { "catalog-translation": catalogTranslation, "core-tts-catalog": coreTtsCatalog, "image-translation": imageTranslation };
