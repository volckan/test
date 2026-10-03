// Client LLM : rendu du prompt, cache par hachage des entrées, journal inspectable,
// nouvelles tentatives avec validation, limitation de débit, suivi des coûts.
import { chatStructured, estimateCost, parseModelId, ProviderError } from "./providers.js";
import { renderPrompt } from "./prompt-engine.js";
import { getPromptSource, getPartials } from "./prompts.js";
import { getCredentials } from "../storage.js";
import { sha256, uuid, sleep, Emitter } from "../util.js";

export const llmEvents = new Emitter();

class RateLimiter {
  constructor() { this.timestamps = []; this.rpm = Infinity; }
  configure(rpm) { this.rpm = rpm && rpm > 0 ? rpm : Infinity; }
  async acquire(signal) {
    if (this.rpm === Infinity) return;
    for (;;) {
      const now = Date.now();
      this.timestamps = this.timestamps.filter((t) => now - t < 60000);
      if (this.timestamps.length < this.rpm) { this.timestamps.push(now); return; }
      if (signal?.aborted) throw new DOMException("Annulé", "AbortError");
      await sleep(Math.max(50, 60000 - (now - this.timestamps[0]) + 10));
    }
  }
  backoff() { const now = Date.now(); for (let i = 0; i < 5; i++) this.timestamps.push(now); }
}
export const rateLimiter = new RateLimiter();

/** Hachage d'une image (base64) pour la clé de cache sans stocker l'image dans le journal. */
async function imageDigest(data) { return (await sha256(data)).slice(0, 16); }

async function messagesForCache(messages) {
  const out = [];
  for (const m of messages) out.push({ role: m.role, parts: await Promise.all(m.parts.map(async (p) => p.type === "image" ? { type: "image", hash: await imageDigest(p.data) } : p)) });
  return out;
}
function messagesForLog(messages) {
  return messages.map((m) => ({ role: m.role, parts: m.parts.map((p) => p.type === "image" ? { type: "image", bytes: Math.round(p.data.length * 0.75) } : p) }));
}

/**
 * Appel LLM structuré, mis en cache et journalisé.
 * @param {object} o
 *  storage — BookStorage ; step — nom de la sous-étape ; itemId — page/section
 *  promptName — nom du prompt (dans prompts.js ou surchargé) ; variables — contexte du gabarit
 *  schema — JSON Schema ; validate(parsed) → string[] d'erreurs (vide = ok)
 *  modelId — "fournisseur:modèle" ; temperature ; maxRetries ; timeoutMs ; signal ; config (livre)
 *  messages — messages déjà rendus (remplace promptName/variables)
 */
export async function callLLM(o) {
  const { storage, step = "", itemId = "", promptName, variables = {}, schema, validate, signal } = o;
  const config = o.config ?? {};
  const modelId = o.modelId ?? config.default_model ?? "openai:gpt-5.4";
  const maxRetries = o.maxRetries ?? 5;
  const timeoutMs = (o.timeoutMs ?? 180) > 10000 ? o.timeoutMs : (o.timeoutMs ?? 180) * 1000;
  const credentials = await getCredentials();
  rateLimiter.configure(config.rate_limit?.requests_per_minute);

  let messages = o.messages;
  let promptSource = null;
  if (!messages) {
    promptSource = await getPromptSource(promptName, { label: storage?.label, modelId });
    const partials = await getPartials({ label: storage?.label, modelId });
    messages = renderPrompt(promptSource, variables, partials).messages;
  }
  const requestId = uuid();
  const cacheInput = { v: 3, modelId, temperature: o.temperature, schema, messages: await messagesForCache(messages) };
  const hash = await sha256(JSON.stringify(cacheInput));
  const started = Date.now();

  if (storage && !o.noCache) {
    const cached = await storage.cacheGet(hash);
    if (cached) {
      const errors = validate ? await validate(cached.parsed) : [];
      if (!errors?.length) {
        await storage.appendLlmLog({ requestId, step, itemId, success: 1, errorCount: 0, data: { model: modelId, promptName, cached: true, hash, durationMs: Date.now() - started, usage: cached.usage ?? { input: 0, output: 0 }, cost: 0, messages: messagesForLog(messages), response: cached.rawText, parsed: cached.parsed, errors: [] } });
        llmEvents.emit("call", { label: storage.label, step, itemId, cached: true });
        return { ...cached, cached: true, requestId };
      }
    }
  }

  const errors = [];
  let attempt = 0;
  let totalUsage = { input: 0, output: 0 };
  let feedbackMessages = messages;
  for (;;) {
    if (signal?.aborted) throw new DOMException("Annulé", "AbortError");
    attempt++;
    try {
      await rateLimiter.acquire(signal);
      const res = await chatStructured({ modelId, messages: feedbackMessages, schema, temperature: o.temperature, maxOutputTokens: o.maxOutputTokens, timeoutMs, signal, credentials, schemaName: (promptName ?? "reponse").replace(/[^a-zA-Z0-9_]/g, "_") });
      totalUsage = { input: totalUsage.input + (res.usage?.input ?? 0), output: totalUsage.output + (res.usage?.output ?? 0) };
      const vErrors = validate ? (await validate(res.parsed)) ?? [] : [];
      if (vErrors.length) {
        errors.push({ attempt, kind: "validation", message: vErrors.join("; ") });
        if (attempt > maxRetries) throw new ProviderError(`Validation échouée après ${attempt} tentatives : ${vErrors.slice(0, 5).join("; ")}`);
        // On renvoie la réponse fautive et les erreurs au modèle pour correction.
        feedbackMessages = [...messages, { role: "assistant", parts: [{ type: "text", text: res.rawText?.slice(0, 60000) ?? "" }] }, { role: "user", parts: [{ type: "text", text: `Ta réponse précédente est invalide :\n- ${vErrors.slice(0, 20).join("\n- ")}\n\nCorrige ces problèmes et renvoie uniquement la réponse JSON complète et conforme.` }] }];
        continue;
      }
      const cost = estimateCost(modelId, totalUsage.input, totalUsage.output);
      const result = { parsed: res.parsed, rawText: res.rawText, usage: totalUsage, model: res.model, cost, cached: false, requestId, attempts: attempt };
      if (storage) {
        await storage.cacheSet(hash, { parsed: res.parsed, rawText: res.rawText, usage: totalUsage, model: res.model, cost }, { step, itemId, promptName });
        await storage.appendLlmLog({ requestId, step, itemId, success: 1, errorCount: errors.length, data: { model: modelId, promptName, cached: false, hash, durationMs: Date.now() - started, usage: totalUsage, cost, attempts: attempt, messages: messagesForLog(messages), response: res.rawText, parsed: res.parsed, errors } });
        llmEvents.emit("call", { label: storage.label, step, itemId, cached: false, cost, usage: totalUsage });
      }
      return result;
    } catch (e) {
      if (e?.name === "AbortError") throw e;
      const retryable = e instanceof ProviderError ? e.retryable : true;
      errors.push({ attempt, kind: e instanceof ProviderError && e.status ? `http-${e.status}` : "error", message: e.message });
      if (e.status === 429) rateLimiter.backoff();
      if (!retryable || attempt > maxRetries) {
        if (storage) await storage.appendLlmLog({ requestId, step, itemId, success: 0, errorCount: errors.length, data: { model: modelId, promptName, cached: false, hash, durationMs: Date.now() - started, usage: totalUsage, cost: estimateCost(modelId, totalUsage.input, totalUsage.output), attempts: attempt, messages: messagesForLog(messages), response: null, errors } });
        llmEvents.emit("error", { label: storage?.label, step, itemId, message: e.message });
        throw e;
      }
      await sleep(Math.min(30000, 1000 * 2 ** (attempt - 1)) + Math.random() * 500);
    }
  }
}

/** Modèle effectif d'une sous-étape : config.<clé>.model ?? défaut de la tâche ?? default_model. */
export function resolveStepModel(config, stepKey, kind = "llm") {
  const stepCfg = stepKey ? config?.[stepKey] : null;
  if (stepCfg?.model) return stepCfg.model;
  if (kind === "image-generation") return config?.default_image_generation_model ?? "openai:gpt-image-2";
  if (kind === "speech-generation") return config?.default_speech_generation_model ?? "gpt-4o-mini-tts";
  return config?.default_model ?? "openai:gpt-5.4";
}

export function providerOfModel(modelId) { return parseModelId(modelId).provider; }

/** Agrégats du journal LLM (statistiques de débogage). */
export function computeStats(logs) {
  const s = { calls: logs.length, cached: 0, errors: 0, tokensIn: 0, tokensOut: 0, cost: 0, durationMs: 0, perStep: {} };
  for (const l of logs) {
    const d = l.data ?? {};
    if (d.cached) s.cached++;
    if (!l.success) s.errors++;
    s.tokensIn += d.usage?.input ?? 0; s.tokensOut += d.usage?.output ?? 0; s.cost += d.cost ?? 0; s.durationMs += d.durationMs ?? 0;
    const p = (s.perStep[l.step] ??= { calls: 0, cached: 0, errors: 0, tokensIn: 0, tokensOut: 0, cost: 0, durationMs: 0 });
    p.calls++; if (d.cached) p.cached++; if (!l.success) p.errors++; p.tokensIn += d.usage?.input ?? 0; p.tokensOut += d.usage?.output ?? 0; p.cost += d.cost ?? 0; p.durationMs += d.durationMs ?? 0;
  }
  s.cacheHitRate = s.calls ? s.cached / s.calls : 0;
  return s;
}
