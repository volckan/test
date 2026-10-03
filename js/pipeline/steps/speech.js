// Étape « Parole » : synthèse vocale par entrée de catalogue et horodatages de mots.
import { synthesizeSpeech, transcribeWithTimestamps, hasCredentials, transcriptionProvider } from "../../llm/providers.js";
import { getCredentials } from "../../storage.js";
import { nowIso, baseLanguage, processWithConcurrency, sha256, tokenizeWords, sleep } from "../../util.js";
import { getSetting } from "../../db.js";
import { DEFAULT_VOICES, DEFAULT_SPEECH_INSTRUCTIONS, DEFAULT_ELEVENLABS_VOICE_ID } from "../../config.js";
import { outputLanguages, catalogForLanguage } from "./translate.js";

export const TEXT_CATEGORY = (id) => (/_easy_read$/.test(id) ? "easy-read" : /_im\d{3}/.test(id) ? "captions" : /_ans(_|$)/.test(id) ? "answers" : /^gl(\d{3}|_manual_)/.test(id) ? "glossary" : "text");

export function isTtsExcluded(textId, speech) {
  if (!speech) return false;
  const base = textId.replace(/_easy_read$/, "");
  if (speech.excluded_text_ids?.some((id) => id === textId || id === base)) return true;
  const cats = speech.excluded_categories ?? [];
  if (!cats.length) return false;
  return cats.includes(TEXT_CATEGORY(textId)) || (base !== textId && cats.includes(TEXT_CATEGORY(base)));
}

export async function voiceMappings() { const custom = await getSetting("voices", {}); const out = {}; for (const p of new Set([...Object.keys(DEFAULT_VOICES), ...Object.keys(custom)])) out[p] = { ...(DEFAULT_VOICES[p] ?? {}), ...(custom[p] ?? {}) }; return out; }

export async function resolveVoice({ provider, lang, config, slot = "primary" }) {
  const sp = config.speech ?? {};
  const l = lang.toLowerCase(), b = baseLanguage(lang);
  if (slot === "secondary") { const s = sp.secondary_voices?.[lang] ?? sp.secondary_voices?.[l] ?? sp.secondary_voices?.[b]; return s ? { provider: s.provider, model: s.model, voice: s.voice, label: s.label } : null; }
  const pv = sp.primary_voices?.[provider]?.[lang] ?? sp.primary_voices?.[provider]?.[l] ?? sp.primary_voices?.[provider]?.[b];
  if (pv?.voice) return { provider, voice: pv.voice, label: pv.label };
  if (sp.voice && provider === sp.default_provider) return { provider, voice: sp.voice };
  const maps = await voiceMappings();
  const m = maps[provider] ?? {};
  const voice = m[l] ?? m[b] ?? m.default ?? (provider === "elevenlabs" ? DEFAULT_ELEVENLABS_VOICE_ID : provider === "gemini" ? "Kore" : provider === "azure" ? "fr-FR-DeniseNeural" : "alloy");
  return { provider, voice };
}

export function resolveProvider(config, lang, credentials) {
  const sp = config.speech ?? {};
  for (const [p, c] of Object.entries(sp.providers ?? {})) if ((c.languages ?? []).some((x) => x.toLowerCase() === lang.toLowerCase() || baseLanguage(x) === baseLanguage(lang)) && p !== sp.default_provider) return p;
  const def = sp.default_provider ?? "openai";
  const credKey = def === "gemini" ? "google" : def;
  if (hasCredentials(credKey, credentials)) return def;
  for (const p of ["openai", "elevenlabs", "google", "azure", "openrouter"]) if (hasCredentials(p, credentials)) return p === "google" ? "gemini" : p;
  return def;
}

export async function speechInstructions(lang) {
  const custom = await getSetting("speechInstructions", {});
  const all = { ...DEFAULT_SPEECH_INSTRUCTIONS, ...custom };
  return all[lang.toLowerCase()] ?? all[baseLanguage(lang)] ?? all.default;
}

export function audioKey(lang, textId, slot = "primary") { return `audio/${lang}/${textId}${slot === "secondary" ? "--secondary" : ""}`; }

export async function synthesizeEntry({ storage, config, lang, entry, slot = "primary", credentials, signal, provider: forcedProvider, voiceOverride }) {
  const sp = config.speech ?? {};
  const provider = forcedProvider ?? resolveProvider(config, lang, credentials);
  const v = voiceOverride ?? (await resolveVoice({ provider, lang, config, slot }));
  if (!v) return null;
  const prov = v.provider ?? provider;
  const model = v.model ?? sp.providers?.[prov]?.model ?? (prov === "openai" ? (config.default_speech_generation_model ?? "gpt-4o-mini-tts") : prov === "elevenlabs" ? "eleven_multilingual_v2" : prov === "gemini" ? "gemini-2.5-flash-preview-tts" : prov === "openrouter" ? "openai/gpt-4o-mini-tts" : "neural");
  const instructions = await speechInstructions(lang);
  const res = await synthesizeSpeech({ provider: prov, model, voice: v.voice, text: entry.speechText ?? entry.text, language: lang, instructions, format: sp.format ?? "mp3", credentials, signal, options: { stability: sp.elevenlabs_stability, similarity_boost: sp.elevenlabs_similarity_boost, style: sp.elevenlabs_style, use_speaker_boost: sp.elevenlabs_use_speaker_boost, speed: sp.elevenlabs_speed, apply_text_normalization: sp.elevenlabs_apply_text_normalization, temperature: sp.temperature, seed: sp.seed } });
  const fileName = `${entry.id}${slot === "secondary" ? "--secondary" : ""}.${res.ext}`;
  await storage.putBlob(audioKey(lang, entry.id, slot), res.blob, { fileName });
  return { textId: entry.id, language: lang, fileName, voice: v.voice, model, provider: prov, voiceSlot: slot, voiceLabel: v.label, cached: false, textHash: (await sha256(`${model}|${v.voice}|${entry.speechText ?? entry.text}`)).slice(0, 16), alignment: res.alignment ?? null };
}

export async function tts(ctx) {
  const { storage, config } = ctx;
  const credentials = await getCredentials();
  const langs = await outputLanguages(storage, config);
  const sp = config.speech ?? {};
  const jobs = [];
  for (const lang of langs) {
    const catalog = await catalogForLanguage(storage, config, lang);
    const core = await storage.getNodeData("core-tts-catalog", lang);
    const coreMap = new Map((core?.entries ?? []).map((e) => [e.id, e]));
    const prev = await storage.getNodeData("tts", lang);
    const prevMap = new Map((prev?.entries ?? []).map((e) => [`${e.textId}|${e.voiceSlot ?? "primary"}`, e]));
    const provider = resolveProvider(config, lang, credentials);
    const primaryVoice = await resolveVoice({ provider, lang, config });
    const secondaryVoice = await resolveVoice({ provider, lang, config, slot: "secondary" });
    const entries = []; const failed = [];
    const work = [];
    for (const e of catalog) {
      if (isTtsExcluded(e.id, sp)) continue;
      const c = coreMap.get(e.id);
      if (c && c.status === "failed") { failed.push({ textId: e.id, error: `Normalisation TTS échouée : ${c.failureReason ?? ""}` }); continue; }
      const text = c?.speechText ?? e.text;
      if (!text.trim()) continue;
      for (const slot of secondaryVoice ? ["primary", "secondary"] : ["primary"]) {
        const v = slot === "primary" ? primaryVoice : secondaryVoice;
        const model = v.model ?? sp.providers?.[v.provider ?? provider]?.model ?? "";
        const hash = (await sha256(`${model}|${v.voice}|${text}`)).slice(0, 16);
        const p = prevMap.get(`${e.id}|${slot}`);
        if (p && p.textHash === hash && !ctx.options?.force && (await storage.getBlobRow(audioKey(lang, e.id, slot)))) { entries.push({ ...p, cached: true }); continue; }
        if (p?.manual && (await storage.getBlobRow(audioKey(lang, e.id, slot)))) { entries.push(p); continue; }
        work.push({ entry: { id: e.id, text, speechText: text }, slot });
      }
    }
    jobs.push({ lang, work, entries, failed, provider });
  }
  const total = jobs.reduce((n, j) => n + j.work.length, 0);
  ctx.progress(0, total); let done = 0;
  for (const job of jobs) {
    const conc = job.provider === "elevenlabs" ? 2 : job.provider === "gemini" ? 3 : Math.min(config.concurrency ?? 4, 6);
    await processWithConcurrency(job.work, conc, async ({ entry, slot }) => {
      let attempt = 0;
      for (;;) {
        try { const r = await synthesizeEntry({ storage, config, lang: job.lang, entry, slot, credentials, signal: ctx.signal }); if (r) job.entries.push(r); break; }
        catch (e) {
          if (e?.name === "AbortError") throw e;
          if (e.status === 429 && attempt < 4) { attempt++; await sleep(2000 * 2 ** attempt); continue; }
          if (attempt < 2 && e.retryable) { attempt++; await sleep(1500 * attempt); continue; }
          job.failed.push({ textId: entry.id, error: e.message, voiceSlot: slot }); break;
        }
      }
      done++; ctx.progress(done, total, `${job.lang} · ${entry.id}`);
    }, { signal: ctx.signal });
    await storage.putNodeData("tts", job.lang, { language: job.lang, entries: job.entries, failed: job.failed, generatedAt: nowIso(), provider: job.provider });
  }
  const failed = jobs.reduce((n, j) => n + j.failed.length, 0);
  return { message: `${total} fichiers audio générés${failed ? ` · ${failed} échecs` : ""}` };
}

/** Horodatages estimés proportionnellement à la longueur des mots (repli). */
export function estimateTimestamps(text, duration) {
  const words = tokenizeWords(text).map((w) => w.word);
  const totalLen = words.reduce((n, w) => n + w.length + 1, 0) || 1;
  let t = 0; const out = [];
  for (const w of words) { const d = ((w.length + 1) / totalLen) * duration; out.push({ word: w, start: t, end: t + d }); t += d; }
  return out;
}
export async function audioDuration(blob) {
  return new Promise((resolve) => { const a = new Audio(); const url = URL.createObjectURL(blob); a.preload = "metadata"; a.onloadedmetadata = () => { resolve(isFinite(a.duration) ? a.duration : 0); URL.revokeObjectURL(url); }; a.onerror = () => { resolve(0); URL.revokeObjectURL(url); }; a.src = url; });
}

export async function wordTimestamps(ctx) {
  const { storage, config } = ctx;
  if (config.speech?.word_highlighting === false) return { skipped: true, message: "Surlignage par phrase (désactivé)" };
  const credentials = await getCredentials();
  const whisper = transcriptionProvider(credentials, config.speech?.transcription_provider);
  const langs = await outputLanguages(storage, config);
  const jobs = [];
  for (const lang of langs) {
    const ttsOut = await storage.getNodeData("tts", lang);
    if (!ttsOut) continue;
    const prev = await storage.getNodeData("tts-timestamps", lang);
    const core = new Map(((await storage.getNodeData("core-tts-catalog", lang))?.entries ?? []).map((e) => [e.id, e]));
    const catalog = new Map((await catalogForLanguage(storage, config, lang)).map((e) => [e.id, e.text]));
    const entries = { ...(prev?.entries ?? {}) };
    for (const e of ttsOut.entries) {
      const key = e.voiceSlot === "secondary" ? `${e.textId}--secondary` : e.textId;
      if (entries[key] && entries[key].textHash === e.textHash && !ctx.options?.force) continue;
      jobs.push({ lang, e, key, text: core.get(e.textId)?.speechText ?? catalog.get(e.textId) ?? "", entries });
    }
    jobs.push({ lang, finalize: true, entries, failed: ttsOut.failed ?? [] });
  }
  const work = jobs.filter((j) => !j.finalize);
  ctx.progress(0, work.length); let done = 0; let estimated = 0;
  await processWithConcurrency(work, whisper ? 4 : 8, async (job) => {
    try {
      const blob = await storage.getBlob(audioKey(job.lang, job.e.textId, job.e.voiceSlot));
      if (!blob) return;
      let words = null, duration = 0;
      if (job.e.alignment?.length) { words = job.e.alignment; duration = words[words.length - 1].end; }
      else if (whisper) { try { const r = await transcribeWithTimestamps({ blob, language: job.lang, credentials, signal: ctx.signal, prompt: job.text, provider: whisper, model: config.speech?.transcription_model }); words = r.words; duration = r.duration; } catch (err) { if (err?.name === "AbortError") throw err; console.warn("whisper", err); } }
      if (!words?.length) { duration = duration || (await audioDuration(blob)); words = estimateTimestamps(job.text, duration); estimated++; }
      job.entries[job.key] = { textId: job.e.textId, language: job.lang, words, duration, voiceSlot: job.e.voiceSlot ?? "primary", textHash: job.e.textHash, method: job.e.alignment?.length ? "elevenlabs" : whisper && !estimated ? "whisper" : "estimated" };
    } catch (e) { if (e?.name === "AbortError") throw e; await ctx.onPageError(job.key, e); }
    done++; ctx.progress(done, work.length);
  }, { signal: ctx.signal });
  for (const f of jobs.filter((j) => j.finalize)) await storage.putNodeData("tts-timestamps", f.lang, { language: f.lang, entries: f.entries, failed: f.failed, generatedAt: nowIso() });
  return { message: `${work.length} horodatages${whisper ? ` via ${whisper}${config.speech?.transcription_model ? ` (${config.speech.transcription_model})` : ""}` : ""}${estimated ? ` (${estimated} estimés)` : ""}${!whisper ? " · ajoutez une clé OpenAI ou OpenRouter pour des horodatages Whisper précis" : ""}` };
}

export const speechSteps = { tts, "word-timestamps": wordTimestamps };
