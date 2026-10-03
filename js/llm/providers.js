// Fournisseurs d'IA appelés directement depuis le navigateur avec les clés de l'utilisateur.
// Modalités : structured-text (texte structuré JSON + images en entrée), tts, stt, image.

export const PROVIDERS = [
  { id: "openai", displayName: "OpenAI", modalities: ["structured-text", "tts", "stt", "image"], docsUrl: "https://platform.openai.com/api-keys",
    fields: [{ key: "apiKey", kind: "secret", label: "Clé API", required: true, placeholder: "sk-…" }, { key: "baseUrl", kind: "url", label: "URL de base (facultatif)", required: false, placeholder: "https://api.openai.com/v1" }],
    defaultModels: { "structured-text": "gpt-5.4", image: "gpt-image-2", tts: "gpt-4o-mini-tts", stt: "whisper-1" },
    models: ["gpt-5.4", "gpt-5.4-mini", "gpt-5.1", "gpt-5", "gpt-5-mini", "gpt-4.1", "gpt-4.1-mini", "gpt-4o", "gpt-4o-mini", "o3", "o4-mini"],
    help: "Clé API OpenAI (platform.openai.com). Utilisée pour le texte, la vision, la synthèse vocale, la transcription et les images." },
  { id: "anthropic", displayName: "Anthropic", modalities: ["structured-text"], docsUrl: "https://console.anthropic.com/settings/keys",
    fields: [{ key: "apiKey", kind: "secret", label: "Clé API", required: true, placeholder: "sk-ant-…" }],
    defaultModels: { "structured-text": "claude-sonnet-5-5" },
    models: ["claude-fable-5-1", "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-4-5-20251001"],
    help: "Clé API Anthropic (console.anthropic.com). Les appels se font directement depuis le navigateur." },
  { id: "google", displayName: "Google Gemini", modalities: ["structured-text", "image", "tts"], docsUrl: "https://aistudio.google.com/app/apikey",
    fields: [{ key: "apiKey", kind: "secret", label: "Clé API", required: true, placeholder: "AIza…" }],
    defaultModels: { "structured-text": "gemini-2.5-pro", image: "gemini-3.1-flash-image", tts: "gemini-2.5-flash-preview-tts" },
    models: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-3.1-flash-image", "gemini-2.5-flash-image"],
    help: "Clé API Google AI Studio. Couvre Gemini (texte, vision), Nano Banana (images) et Gemini TTS." },
  { id: "mistral", displayName: "Mistral AI", modalities: ["structured-text"], docsUrl: "https://console.mistral.ai/api-keys",
    fields: [{ key: "apiKey", kind: "secret", label: "Clé API", required: true }],
    defaultModels: { "structured-text": "mistral-large-latest" }, models: ["mistral-large-latest", "mistral-medium-latest", "mistral-small-latest", "pixtral-large-latest", "magistral-medium-latest"],
    help: "Clé API Mistral (console.mistral.ai). Compatible OpenAI ; les modèles Pixtral acceptent les images." },
  { id: "openrouter", displayName: "OpenRouter", modalities: ["structured-text", "image", "tts", "stt"], docsUrl: "https://openrouter.ai/keys",
    fields: [{ key: "apiKey", kind: "secret", label: "Clé API", required: true, placeholder: "sk-or-…" }],
    defaultModels: { "structured-text": "openai/gpt-5.4", image: "google/gemini-2.5-flash-image", tts: "openai/gpt-4o-mini-tts", stt: "openai/whisper-1" },
    models: ["openai/gpt-5.4", "anthropic/claude-sonnet-5.5", "google/gemini-2.5-pro", "meta-llama/llama-4-maverick", "qwen/qwen3-vl-235b-a22b-instruct"],
    modelsByKind: { image: ["google/gemini-2.5-flash-image", "openai/gpt-5-image", "openai/gpt-5-image-mini", "black-forest-labs/flux.2-pro"], tts: ["openai/gpt-4o-mini-tts", "google/gemini-2.5-flash-preview-tts", "mistralai/voxtral-mini-tts-2603"], stt: ["openai/whisper-1", "openai/whisper-large-v3", "openai/whisper-large-v3-turbo"] },
    help: "Passerelle multi-modèles compatible OpenAI : texte et vision, génération d'images, synthèse vocale et transcription (horodatages Whisper) avec une seule clé." },
  { id: "custom", displayName: "Personnalisé (compatible OpenAI)", modalities: ["structured-text"], docsUrl: "",
    fields: [{ key: "baseUrl", kind: "url", label: "URL de base", required: true, placeholder: "https://mon-serveur/v1" }, { key: "apiKey", kind: "secret", label: "Clé API", required: false }],
    defaultModels: {}, models: [],
    help: "Tout point de terminaison compatible OpenAI (vLLM, LM Studio, Groq, Together…). Le serveur doit autoriser les requêtes CORS depuis cette page." },
  { id: "ollama", displayName: "Ollama (local)", modalities: ["structured-text"], docsUrl: "https://ollama.com",
    fields: [{ key: "baseUrl", kind: "url", label: "URL de base", required: false, placeholder: "http://localhost:11434/v1" }],
    defaultModels: {}, models: [],
    help: "Ollama en local. Lancez-le avec OLLAMA_ORIGINS=* pour autoriser l'accès depuis le navigateur." },
  { id: "elevenlabs", displayName: "ElevenLabs", modalities: ["tts", "stt"], docsUrl: "https://elevenlabs.io/app/settings/api-keys",
    fields: [{ key: "apiKey", kind: "secret", label: "Clé API", required: true }],
    defaultModels: { tts: "eleven_multilingual_v2" }, models: ["eleven_multilingual_v2", "eleven_turbo_v2_5", "eleven_flash_v2_5", "eleven_v3"],
    help: "Voix de haute qualité avec horodatages de mots natifs." },
  { id: "azure", displayName: "Azure Speech", modalities: ["tts"], docsUrl: "https://portal.azure.com",
    fields: [{ key: "apiKey", kind: "secret", label: "Clé de ressource", required: true }, { key: "region", kind: "text", label: "Région", required: true, placeholder: "westeurope" }],
    defaultModels: { tts: "neural" }, models: ["neural"],
    help: "Voix neuronales Azure (Microsoft). Indiquez la clé et la région de votre ressource Speech." },
];
export const PROVIDER_BY_ID = Object.fromEntries(PROVIDERS.map((p) => [p.id, p]));

/** Tarifs indicatifs ($ par million de jetons entrée/sortie) pour estimer les coûts. */
const PRICING = [
  [/gpt-5\.4-mini|gpt-5-mini|gpt-4\.1-mini|gpt-4o-mini/, 0.4, 1.6], [/gpt-5|gpt-4\.1|gpt-4o/, 2.5, 10], [/o3|o4/, 2, 8],
  [/claude.*opus|fable/, 15, 75], [/claude.*sonnet/, 3, 15], [/claude.*haiku/, 1, 5],
  [/gemini.*pro/, 1.25, 10], [/gemini.*flash-lite/, 0.1, 0.4], [/gemini.*flash/, 0.3, 2.5],
  [/mistral-large|pixtral-large/, 2, 6], [/mistral-medium|magistral/, 0.4, 2], [/mistral-small/, 0.1, 0.3],
];
export function estimateCost(modelId, inputTokens = 0, outputTokens = 0) {
  const m = String(modelId).split(":").pop();
  const row = PRICING.find(([re]) => re.test(m));
  if (!row) return null;
  return (inputTokens * row[1] + outputTokens * row[2]) / 1e6;
}

export function parseModelId(qualified) {
  const s = String(qualified ?? "").trim();
  const idx = s.indexOf(":");
  if (idx < 0) return { provider: "openai", model: s };
  return { provider: s.slice(0, idx), model: s.slice(idx + 1) };
}
export function qualifyModelId(provider, model) { return `${provider}:${model}`; }

export class ProviderError extends Error {
  constructor(message, { status, provider, retryable = false, body } = {}) { super(message); this.name = "ProviderError"; this.status = status; this.provider = provider; this.retryable = retryable; this.body = body; }
}

async function fetchJson(url, init, provider, timeoutMs = 180000, signal) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new DOMException("Délai dépassé", "TimeoutError")), timeoutMs);
  const onAbort = () => ctrl.abort(signal.reason);
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    let body; try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
    if (!res.ok) {
      const msg = body?.error?.message ?? body?.message ?? body?.error ?? text?.slice(0, 300) ?? res.statusText;
      throw new ProviderError(`${provider} : HTTP ${res.status} — ${typeof msg === "string" ? msg : JSON.stringify(msg)}`, { status: res.status, provider, retryable: res.status === 429 || res.status >= 500, body });
    }
    return body;
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    if (e?.name === "AbortError" && signal?.aborted) throw e;
    if (e?.name === "TimeoutError" || ctrl.signal.aborted) throw new ProviderError(`${provider} : délai de ${Math.round(timeoutMs / 1000)} s dépassé`, { provider, retryable: true });
    throw new ProviderError(`${provider} : requête impossible (${e.message}). Vérifiez la clé, l'URL et l'autorisation CORS.`, { provider, retryable: true });
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); }
}

function openAiBase(provider, creds) {
  const c = creds?.[provider] ?? {};
  switch (provider) {
    case "openai": return (c.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
    case "mistral": return "https://api.mistral.ai/v1";
    case "openrouter": return "https://openrouter.ai/api/v1";
    case "ollama": return (c.baseUrl || "http://localhost:11434/v1").replace(/\/$/, "");
    case "custom": return (c.baseUrl || "").replace(/\/$/, "");
    default: return "";
  }
}
function authHeaders(provider, creds) {
  const c = creds?.[provider] ?? {};
  const h = { "Content-Type": "application/json" };
  if (c.apiKey) h.Authorization = `Bearer ${c.apiKey}`;
  if (provider === "openrouter") { h["HTTP-Referer"] = location.origin; h["X-Title"] = "ADT Studio Web"; }
  return h;
}
export function hasCredentials(provider, creds) {
  const p = PROVIDER_BY_ID[provider]; if (!p) return false;
  const c = creds?.[provider] ?? {};
  return p.fields.filter((f) => f.required).every((f) => String(c[f.key] ?? "").trim());
}

/** Fournisseurs disposant d'une clé pour une modalité donnée, dans l'ordre du manifeste. */
export function configuredProviders(creds, modality = "structured-text") {
  // Un fournisseur sans champ obligatoire (Ollama) ne compte comme configuré que si l'utilisateur a saisi quelque chose.
  const explicit = (p) => p.fields.some((f) => f.required) || Object.values(creds?.[p.id] ?? {}).some((v) => String(v ?? "").trim());
  return PROVIDERS.filter((p) => p.modalities.includes(modality) && hasCredentials(p.id, creds) && explicit(p));
}

/**
 * Modèle effectivement utilisable : si le fournisseur du modèle demandé n'a pas de clé mais qu'un autre
 * fournisseur de la même modalité en a une, on bascule sur son modèle par défaut.
 * Retourne { modelId, fallback: bool, from, to }.
 */
export function resolveUsableModel(modelId, creds, modality = "structured-text") {
  const { provider } = parseModelId(modelId);
  if (hasCredentials(provider, creds)) return { modelId, fallback: false };
  const alt = configuredProviders(creds, modality)[0];
  if (!alt) return { modelId, fallback: false };
  const to = qualifyModelId(alt.id, alt.defaultModels?.[modality] ?? alt.models?.[0] ?? "");
  return { modelId: to, fallback: true, from: modelId, to };
}

export function missingKeyMessage(provider, modelId) {
  const name = PROVIDER_BY_ID[provider]?.displayName ?? provider;
  return `Aucune clé configurée pour ${name}${modelId ? ` (modèle « ${modelId} »)` : ""}. Ajoutez la clé dans Paramètres → Fournisseurs IA, ou choisissez un modèle d'un fournisseur déjà configuré dans Paramètres → Modèles.`;
}

/** Supprime les mots-clés JSON Schema non supportés par certains fournisseurs. */
function sanitizeSchemaForGemini(schema) {
  if (Array.isArray(schema)) return schema.map(sanitizeSchemaForGemini);
  if (!schema || typeof schema !== "object") return schema;
  const out = {};
  for (const [k, v] of Object.entries(schema)) {
    if (["additionalProperties", "$schema", "$id", "title", "default", "examples", "strict"].includes(k)) continue;
    if (k === "type" && Array.isArray(v)) { const t = v.filter((x) => x !== "null"); out.type = t[0] ?? "string"; if (v.includes("null")) out.nullable = true; continue; }
    out[k] = sanitizeSchemaForGemini(v);
  }
  return out;
}
function schemaIsRecursive(schema) { return JSON.stringify(schema).includes('"$ref"'); }

/** Rend un schéma strict pour OpenAI (tous les champs requis, additionalProperties:false). */
function strictifySchema(schema) {
  if (Array.isArray(schema)) return schema.map(strictifySchema);
  if (!schema || typeof schema !== "object") return schema;
  const out = { ...schema };
  if (out.type === "object" || out.properties) {
    out.properties = Object.fromEntries(Object.entries(out.properties ?? {}).map(([k, v]) => [k, strictifySchema(v)]));
    out.required = Object.keys(out.properties); out.additionalProperties = false;
  }
  if (out.items) out.items = strictifySchema(out.items);
  if (out.anyOf) out.anyOf = out.anyOf.map(strictifySchema);
  if (out.$defs) out.$defs = Object.fromEntries(Object.entries(out.$defs).map(([k, v]) => [k, strictifySchema(v)]));
  delete out.nullable;
  return out;
}

function partsToOpenAi(parts) {
  return parts.map((p) => p.type === "image" ? { type: "image_url", image_url: { url: p.data.startsWith("data:") ? p.data : `data:image/png;base64,${p.data}`, detail: "high" } } : { type: "text", text: p.text });
}
function extractJson(text) {
  if (text == null) throw new ProviderError("Réponse vide du modèle");
  let s = String(text).trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(s); if (fence) s = fence[1].trim();
  try { return JSON.parse(s); } catch { /* suite */ }
  const start = s.search(/[{[]/); if (start >= 0) { const end = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]")); if (end > start) { try { return JSON.parse(s.slice(start, end + 1)); } catch { /* suite */ } } }
  throw new ProviderError(`Le modèle n'a pas renvoyé de JSON valide : ${s.slice(0, 200)}`);
}

function noTemperature(model) { return /^(gpt-5|o\d|gpt-4\.1-nano)/.test(model) && !/chat/.test(model); }

/**
 * Appel texte structuré. messages : [{ role, parts }]. schema : JSON Schema (objet).
 * Retourne { parsed, rawText, usage: { input, output }, model }.
 */
export async function chatStructured({ modelId, messages, schema, temperature, maxOutputTokens, timeoutMs = 180000, signal, credentials, schemaName = "reponse" }) {
  const { provider, model } = parseModelId(modelId);
  const creds = credentials ?? {};
  if (!PROVIDER_BY_ID[provider]) throw new ProviderError(`Fournisseur inconnu : ${provider}`);
  if (!hasCredentials(provider, creds)) throw new ProviderError(missingKeyMessage(provider, modelId), { provider, status: 401 });
  const recursive = schema && schemaIsRecursive(schema);
  const schemaHint = schema ? `\n\nRéponds UNIQUEMENT avec un objet JSON valide conforme à ce schéma JSON (sans Markdown) :\n${JSON.stringify(schema)}` : "";

  if (provider === "anthropic") {
    const sys = messages.filter((m) => m.role === "system").flatMap((m) => m.parts.filter((p) => p.type === "text").map((p) => p.text)).join("\n\n");
    const msgs = messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.parts.map((p) => p.type === "image" ? { type: "image", source: { type: "base64", media_type: mimeOf(p.data), data: stripDataUrl(p.data) } } : { type: "text", text: p.text }) }));
    const body = { model, max_tokens: maxOutputTokens ?? 16000, messages: msgs };
    if (sys) body.system = sys;
    if (temperature !== undefined) body.temperature = temperature;
    if (schema) { body.tools = [{ name: "repondre", description: "Renvoie la réponse structurée.", input_schema: schema }]; body.tool_choice = { type: "tool", name: "repondre" }; }
    const res = await fetchJson("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": creds.anthropic.apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" }, body: JSON.stringify(body) }, "Anthropic", timeoutMs, signal);
    const tool = res.content?.find((c) => c.type === "tool_use");
    const text = res.content?.filter((c) => c.type === "text").map((c) => c.text).join("\n") ?? "";
    const parsed = schema ? (tool?.input ?? extractJson(text)) : null;
    return { parsed, rawText: tool ? JSON.stringify(tool.input) : text, usage: { input: res.usage?.input_tokens ?? 0, output: res.usage?.output_tokens ?? 0 }, model: res.model ?? model };
  }

  if (provider === "google") {
    const sys = messages.filter((m) => m.role === "system").flatMap((m) => m.parts.filter((p) => p.type === "text").map((p) => p.text)).join("\n\n");
    const contents = messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: m.parts.map((p) => p.type === "image" ? { inline_data: { mime_type: mimeOf(p.data), data: stripDataUrl(p.data) } } : { text: p.text }) }));
    const generationConfig = { maxOutputTokens: maxOutputTokens ?? 32768 };
    if (temperature !== undefined) generationConfig.temperature = temperature;
    if (schema) { generationConfig.responseMimeType = "application/json"; if (!recursive) generationConfig.responseSchema = sanitizeSchemaForGemini(schema); else contents[contents.length - 1].parts.push({ text: schemaHint }); }
    const body = { contents, generationConfig };
    if (sys) body.systemInstruction = { parts: [{ text: sys }] };
    const res = await fetchJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(creds.google.apiKey)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, "Google", timeoutMs, signal);
    const text = res.candidates?.[0]?.content?.parts?.filter((p) => p.text).map((p) => p.text).join("") ?? "";
    if (!text && res.promptFeedback?.blockReason) throw new ProviderError(`Google : requête bloquée (${res.promptFeedback.blockReason})`);
    return { parsed: schema ? extractJson(text) : null, rawText: text, usage: { input: res.usageMetadata?.promptTokenCount ?? 0, output: res.usageMetadata?.candidatesTokenCount ?? 0 }, model };
  }

  // Compatibles OpenAI : openai, mistral, openrouter, custom, ollama
  const base = openAiBase(provider, creds);
  const oaMessages = messages.map((m) => ({ role: m.role, content: m.role === "system" ? m.parts.filter((p) => p.type === "text").map((p) => p.text).join("\n") : partsToOpenAi(m.parts) }));
  const body = { model, messages: oaMessages };
  const useJsonSchema = schema && (provider === "openai" || provider === "mistral" || provider === "openrouter") && !recursive;
  if (schema) {
    if (useJsonSchema) body.response_format = { type: "json_schema", json_schema: { name: schemaName, strict: provider === "openai", schema: provider === "openai" ? strictifySchema(schema) : schema } };
    else { body.response_format = { type: "json_object" }; const last = oaMessages[oaMessages.length - 1]; if (Array.isArray(last.content)) last.content.push({ type: "text", text: schemaHint }); else last.content += schemaHint; }
  }
  if (temperature !== undefined && !(provider === "openai" && noTemperature(model))) body.temperature = temperature;
  if (maxOutputTokens) { if (provider === "openai") body.max_completion_tokens = maxOutputTokens; else body.max_tokens = maxOutputTokens; }
  let res;
  try {
    res = await fetchJson(`${base}/chat/completions`, { method: "POST", headers: authHeaders(provider, creds), body: JSON.stringify(body) }, PROVIDER_BY_ID[provider].displayName, timeoutMs, signal);
  } catch (e) {
    // Certains modèles (passerelles OpenRouter, serveurs compatibles) refusent response_format json_schema :
    // on réessaie en mode JSON libre avec le schéma rappelé dans le prompt.
    const unsupported = useJsonSchema && e instanceof ProviderError && (e.status === 400 || e.status === 404 || e.status === 422) && /response_format|json_schema|structured|schema/i.test(`${e.message} ${JSON.stringify(e.body ?? "")}`);
    if (!unsupported) throw e;
    const last = oaMessages[oaMessages.length - 1]; if (Array.isArray(last.content)) last.content.push({ type: "text", text: schemaHint }); else last.content += schemaHint;
    body.response_format = { type: "json_object" };
    res = await fetchJson(`${base}/chat/completions`, { method: "POST", headers: authHeaders(provider, creds), body: JSON.stringify(body) }, PROVIDER_BY_ID[provider].displayName, timeoutMs, signal);
  }
  const choice = res.choices?.[0];
  if (choice?.finish_reason === "length") throw new ProviderError("Réponse tronquée (limite de jetons atteinte)", { retryable: true });
  if (choice?.message?.refusal) throw new ProviderError(`Refus du modèle : ${choice.message.refusal}`);
  const text = typeof choice?.message?.content === "string" ? choice.message.content : (choice?.message?.content ?? []).map((c) => c.text ?? "").join("");
  return { parsed: schema ? extractJson(text) : null, rawText: text, usage: { input: res.usage?.prompt_tokens ?? 0, output: res.usage?.completion_tokens ?? 0 }, model: res.model ?? model };
}

function stripDataUrl(d) { return d.startsWith("data:") ? d.slice(d.indexOf(",") + 1) : d; }
function mimeOf(d) { const m = /^data:([^;]+);/.exec(d); return m ? m[1] : "image/png"; }

/** Liste des modèles disponibles pour un fournisseur (en ligne si possible, sinon liste embarquée). */
/** Correspondance modalité interne → filtre `output_modalities` de l'API Modèles d'OpenRouter. */
const OPENROUTER_OUTPUT_MODALITY = { "structured-text": "text", image: "image", tts: "speech", stt: "transcription" };
/** Fiches des modèles OpenRouter déjà consultés (voix prises en charge, modalités). */
export const OPENROUTER_MODEL_INFO = new Map();

async function fetchOpenRouterModels(creds, kind) {
  const q = OPENROUTER_OUTPUT_MODALITY[kind] ?? "text";
  const res = await fetchJson(`${openAiBase("openrouter", creds)}/models?output_modalities=${q}`, { headers: authHeaders("openrouter", creds) }, "OpenRouter", 20000);
  const list = res.data ?? [];
  for (const m of list) if (m?.id) OPENROUTER_MODEL_INFO.set(m.id, { voices: m.supported_voices ?? m.architecture?.supported_voices ?? null, input: m.architecture?.input_modalities ?? [], output: m.architecture?.output_modalities ?? [], name: m.name });
  return list.map((m) => m.id).filter(Boolean).sort();
}

const OPENROUTER_FETCHED_KINDS = new Set();
async function ensureOpenRouterCatalog(credentials, kind) {
  if (OPENROUTER_FETCHED_KINDS.has(kind) || !hasCredentials("openrouter", credentials)) return;
  try { await fetchOpenRouterModels(credentials, kind); OPENROUTER_FETCHED_KINDS.add(kind); } catch (e) { console.warn("OpenRouter catalogue", e); }
}
/** Voix prises en charge par un modèle de parole OpenRouter (liste vide si inconnue). */
export async function openRouterVoices(model, credentials) {
  if (!OPENROUTER_MODEL_INFO.has(model)) await ensureOpenRouterCatalog(credentials, "tts");
  return OPENROUTER_MODEL_INFO.get(model)?.voices ?? [];
}
/** Identifiants des modèles OpenRouter d'une modalité déjà consultés. */
export function openRouterModelsOf(kind) {
  const want = OPENROUTER_OUTPUT_MODALITY[kind] ?? "text";
  return [...OPENROUTER_MODEL_INFO.entries()].filter(([, v]) => (v.output ?? []).includes(want)).map(([id]) => id);
}
/**
 * Modèle de parole OpenRouter réellement disponible : le modèle demandé s'il figure au catalogue, sinon sa
 * variante datée (ex. openai/gpt-4o-mini-tts → openai/gpt-4o-mini-tts-2025-12-15), sinon le premier modèle de parole.
 */
export async function resolveOpenRouterModel(model, kind, credentials) {
  await ensureOpenRouterCatalog(credentials, kind);
  const list = openRouterModelsOf(kind);
  if (!list.length || list.includes(model)) return model;
  const variant = list.find((id) => id.startsWith(`${model}-`) || id.split("/").pop() === model.split("/").pop());
  const preferred = PROVIDER_BY_ID.openrouter.defaultModels[kind];
  return variant ?? (preferred && list.includes(preferred) ? preferred : null) ?? list.find((id) => id.startsWith("openai/") || id.startsWith("google/")) ?? list[0];
}
export const resolveOpenRouterSpeechModel = (model, credentials) => resolveOpenRouterModel(model, "tts", credentials);

export async function listModels(provider, credentials, kind = "structured-text") {
  const p = PROVIDER_BY_ID[provider]; const creds = credentials ?? {};
  if (!p) return [];
  try {
    if (provider === "openrouter" && hasCredentials(provider, creds)) {
      const ids = await fetchOpenRouterModels(creds, kind); OPENROUTER_FETCHED_KINDS.add(kind);
      return kind === "structured-text" ? ids.filter((id) => (OPENROUTER_MODEL_INFO.get(id)?.output ?? ["text"]).includes("text")) : ids;
    }
    if (["openai", "mistral", "custom", "ollama"].includes(provider) && hasCredentials(provider, creds)) {
      const res = await fetchJson(`${openAiBase(provider, creds)}/models`, { headers: authHeaders(provider, creds) }, p.displayName, 20000);
      const ids = (res.data ?? []).map((m) => m.id).filter(Boolean).sort();
      if (provider === "openai") return kind === "image" ? ids.filter((id) => /gpt-image|dall-e/.test(id)) : kind === "tts" ? ids.filter((id) => /tts/.test(id)) : kind === "stt" ? ids.filter((id) => /whisper|transcribe/.test(id)) : ids.filter((id) => /^(gpt|o\d|chatgpt)/.test(id) && !/realtime|audio|transcribe|tts|embedding|moderation|search|image|dall-e|whisper|instruct|codex/.test(id));
      return ids;
    }
    if (provider === "anthropic" && hasCredentials(provider, creds)) {
      const res = await fetchJson("https://api.anthropic.com/v1/models?limit=100", { headers: { "x-api-key": creds.anthropic.apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" } }, "Anthropic", 20000);
      return (res.data ?? []).map((m) => m.id);
    }
    if (provider === "google" && hasCredentials(provider, creds)) {
      const res = await fetchJson(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(creds.google.apiKey)}`, {}, "Google", 20000);
      const ids = (res.models ?? []).filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent")).map((m) => m.name.replace(/^models\//, ""));
      return kind === "image" ? ids.filter((id) => /image/i.test(id)) : kind === "tts" ? ids.filter((id) => /tts/i.test(id)) : ids.filter((id) => !/image|tts|embedding|aqa/i.test(id));
    }
  } catch (e) { console.warn("listModels", e); }
  return p.modelsByKind?.[kind] ?? (kind === "structured-text" ? p.models : [p.defaultModels?.[kind]].filter(Boolean));
}

/** Vérifie la connexion (statut : connected | rejected | unreachable | not-configured). */
export async function checkProvider(provider, credentials) {
  const p = PROVIDER_BY_ID[provider]; const creds = credentials ?? {};
  if (!p) return { status: "unknown" };
  if (!hasCredentials(provider, creds)) return { status: "not-configured", message: "Non configuré" };
  try {
    if (provider === "elevenlabs") { await fetchJson("https://api.elevenlabs.io/v1/user", { headers: { "xi-api-key": creds.elevenlabs.apiKey } }, "ElevenLabs", 15000); return { status: "connected", message: "Connecté" }; }
    if (provider === "azure") { await fetchAzureVoices(creds); return { status: "connected", message: "Connecté" }; }
    const models = await listModelsStrict(provider, creds);
    return { status: "connected", message: `Connecté (${models.length} modèles)`, models };
  } catch (e) {
    if (e.status === 401 || e.status === 403) return { status: "rejected", message: "Clé refusée" };
    return { status: "unreachable", message: e.message };
  }
}
async function listModelsStrict(provider, creds) {
  const p = PROVIDER_BY_ID[provider];
  if (["openai", "mistral", "openrouter", "custom", "ollama"].includes(provider)) { const res = await fetchJson(`${openAiBase(provider, creds)}/models`, { headers: authHeaders(provider, creds) }, p.displayName, 20000); return (res.data ?? []).map((m) => m.id); }
  if (provider === "anthropic") { const res = await fetchJson("https://api.anthropic.com/v1/models?limit=100", { headers: { "x-api-key": creds.anthropic.apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" } }, "Anthropic", 20000); return (res.data ?? []).map((m) => m.id); }
  if (provider === "google") { const res = await fetchJson(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=50&key=${encodeURIComponent(creds.google.apiKey)}`, {}, "Google", 20000); return (res.models ?? []).map((m) => m.name); }
  return [];
}

// ── Synthèse vocale ───────────────────────────────────────────────────────

/**
 * Synthétise `text`. Retourne { blob, mime, ext, alignment? } où alignment = [{word,start,end}] si natif.
 */
export async function synthesizeSpeech({ provider, model, voice, text, language, instructions, format = "mp3", credentials, signal, options = {} }) {
  const creds = credentials ?? {};
  if (provider === "openai") {
    if (!hasCredentials("openai", creds)) throw new ProviderError("Clé OpenAI absente pour la synthèse vocale. Ajoutez-la dans Paramètres → Fournisseurs IA ou choisissez un autre fournisseur de parole dans Paramètres → Parole.", { status: 401, provider });
    const body = { model: model || "gpt-4o-mini-tts", voice: voice || "alloy", input: text, response_format: format === "wav" ? "wav" : "mp3" };
    if (instructions && /gpt-4o-mini-tts|gpt-.*tts/.test(body.model)) body.instructions = instructions;
    if (options.speed) body.speed = options.speed;
    const blob = await fetchBlob(`${openAiBase("openai", creds)}/audio/speech`, { method: "POST", headers: authHeaders("openai", creds), body: JSON.stringify(body) }, "OpenAI TTS", signal);
    return { blob, mime: blob.type || "audio/mpeg", ext: format === "wav" ? "wav" : "mp3" };
  }
  if (provider === "openrouter") {
    if (!hasCredentials("openrouter", creds)) throw new ProviderError("Clé OpenRouter absente pour la synthèse vocale. Ajoutez-la dans Paramètres → Fournisseurs IA ou choisissez un autre fournisseur de parole dans Paramètres → Parole.", { status: 401, provider });
    const m = await resolveOpenRouterSpeechModel(model || PROVIDER_BY_ID.openrouter.defaultModels.tts, creds);
    const v = await pickOpenRouterVoice(m, voice, language, creds);
    const body = { model: m, input: text, voice: v, response_format: format === "wav" ? "wav" : "mp3" };
    if (options.speed) body.speed = options.speed;
    const url = `${openAiBase("openrouter", creds)}/audio/speech`;
    let blob;
    try {
      // Les consignes de style ne sont acceptées que par certains modèles : premier essai avec, repli sans.
      blob = await fetchBlob(url, { method: "POST", headers: authHeaders("openrouter", creds), body: JSON.stringify(instructions && /tts/.test(m) && m.startsWith("openai/") ? { ...body, instructions } : body) }, "OpenRouter TTS", signal);
    } catch (e) {
      if (!(e instanceof ProviderError) || !instructions || ![400, 422].includes(e.status)) throw e;
      blob = await fetchBlob(url, { method: "POST", headers: authHeaders("openrouter", creds), body: JSON.stringify(body) }, "OpenRouter TTS", signal);
    }
    const wav = format === "wav" || /wav/.test(blob.type);
    return { blob, mime: blob.type || (wav ? "audio/wav" : "audio/mpeg"), ext: wav ? "wav" : "mp3" };
  }
  if (provider === "elevenlabs") {
    if (!hasCredentials("elevenlabs", creds)) throw new ProviderError("Clé ElevenLabs absente", { status: 401 });
    const voiceId = voice || "21m00Tcm4TlvDq8ikWAM";
    const body = { text, model_id: model || "eleven_multilingual_v2", voice_settings: { stability: options.stability ?? 0.7, similarity_boost: options.similarity_boost ?? 0.5, style: options.style ?? 0, use_speaker_boost: options.use_speaker_boost ?? true, ...(options.speed ? { speed: options.speed } : {}) } };
    if (language && /turbo_v2_5|flash_v2_5|v3/.test(body.model_id)) body.language_code = language.split("-")[0];
    if (options.apply_text_normalization) body.apply_text_normalization = options.apply_text_normalization;
    if (options.previous_text) body.previous_text = options.previous_text;
    if (options.next_text) body.next_text = options.next_text;
    const res = await fetchJson(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`, { method: "POST", headers: { "Content-Type": "application/json", "xi-api-key": creds.elevenlabs.apiKey }, body: JSON.stringify(body) }, "ElevenLabs", 180000, signal);
    const blob = b64ToBlob(res.audio_base64, "audio/mpeg");
    const alignment = res.alignment ? charsToWords(res.alignment.characters, res.alignment.character_start_times_seconds, res.alignment.character_end_times_seconds) : null;
    return { blob, mime: "audio/mpeg", ext: "mp3", alignment };
  }
  if (provider === "gemini" || provider === "google") {
    if (!hasCredentials("google", creds)) throw new ProviderError("Clé Google absente", { status: 401 });
    const m = model || "gemini-2.5-flash-preview-tts";
    const prompt = instructions ? `${instructions}\n\nTexte à lire exactement :\n${text}` : text;
    const body = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice || "Kore" } } }, ...(options.temperature !== undefined ? { temperature: options.temperature } : {}), ...(options.seed !== undefined ? { seed: options.seed } : {}) } };
    const res = await fetchJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${encodeURIComponent(creds.google.apiKey)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, "Gemini TTS", 180000, signal);
    const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
    if (!part) throw new ProviderError("Gemini TTS : aucun audio renvoyé", { retryable: true });
    const mime = part.inlineData.mimeType ?? "audio/L16;codec=pcm;rate=24000";
    const raw = b64ToBytes(part.inlineData.data);
    const rate = Number(/rate=(\d+)/.exec(mime)?.[1] ?? 24000);
    const blob = /pcm|L16/i.test(mime) ? pcm16ToWav(raw, rate, 1) : new Blob([raw], { type: mime });
    return { blob, mime: blob.type, ext: blob.type.includes("wav") ? "wav" : "mp3" };
  }
  if (provider === "azure") {
    if (!hasCredentials("azure", creds)) throw new ProviderError("Clé/région Azure absentes", { status: 401 });
    const region = creds.azure.region.trim();
    const v = voice || "fr-FR-DeniseNeural";
    const lang = /^([a-z]{2,3}-[A-Za-z]{2,4})/.exec(v)?.[1] ?? (language || "fr-FR");
    const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}"><voice name="${v}">${escapeXml(text)}</voice></speak>`;
    const blob = await fetchBlob(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, { method: "POST", headers: { "Ocp-Apim-Subscription-Key": creds.azure.apiKey, "Content-Type": "application/ssml+xml", "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3", "User-Agent": "ADT-Studio-Web" }, body: ssml }, "Azure Speech", signal);
    return { blob, mime: "audio/mpeg", ext: "mp3" };
  }
  throw new ProviderError(`Fournisseur de synthèse vocale inconnu : ${provider}`);
}

const OPENAI_VOICE_NAMES = ["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer", "verse"];
/**
 * Choisit une voix valide pour un modèle de parole OpenRouter : la voix demandée si le modèle la connaît,
 * sinon une voix du modèle correspondant à la langue (préfixe « fr_ » pour Voxtral), sinon la première.
 */
export async function pickOpenRouterVoice(model, voice, language, creds) {
  const known = await openRouterVoices(model, creds);
  if (voice && (!known.length || known.includes(voice))) return voice;
  if (known.length) {
    const lang = (language || "").toLowerCase().split("-")[0];
    const byLang = known.find((v) => lang && v.toLowerCase().startsWith(`${lang}_`)) ?? known.find((v) => lang && v.toLowerCase().includes(`-${lang}-`));
    return byLang ?? (voice && OPENAI_VOICE_NAMES.includes(voice) && model.startsWith("openai/") ? voice : known[0]);
  }
  if (model.startsWith("openai/")) return voice || "alloy";
  if (model.startsWith("google/")) return voice && !OPENAI_VOICE_NAMES.includes(voice) ? voice : "Kore";
  return voice || "alloy";
}

export async function fetchElevenLabsVoices(credentials) {
  const res = await fetchJson("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": credentials.elevenlabs.apiKey } }, "ElevenLabs", 20000);
  return (res.voices ?? []).map((v) => ({ id: v.voice_id, name: v.name, labels: v.labels ?? {}, category: v.category }));
}
export async function fetchAzureVoices(credentials) {
  const region = credentials.azure.region.trim();
  const res = await fetchJson(`https://${region}.tts.speech.microsoft.com/cognitiveservices/voices/list`, { headers: { "Ocp-Apim-Subscription-Key": credentials.azure.apiKey } }, "Azure Speech", 20000);
  return (Array.isArray(res) ? res : []).map((v) => ({ id: v.ShortName, name: v.DisplayName ?? v.LocalName, locale: v.Locale, gender: v.Gender }));
}

/** Transcription avec horodatages de mots (Whisper). Retourne { words:[{word,start,end}], duration, text }. */
export function transcriptionProvider(creds, preferred) {
  if (preferred && hasCredentials(preferred === "whisper" ? "openai" : preferred, creds)) return preferred === "whisper" ? "openai" : preferred;
  if (hasCredentials("openai", creds)) return "openai";
  if (hasCredentials("openrouter", creds)) return "openrouter";
  return null;
}

export async function transcribeWithTimestamps({ blob, language, credentials, signal, prompt, provider, model }) {
  const creds = credentials ?? {};
  const prov = transcriptionProvider(creds, provider);
  if (!prov) throw new ProviderError("La transcription des horodatages requiert une clé OpenAI (Whisper) ou OpenRouter.", { status: 401 });
  if (prov === "openrouter") {
    const fmt = blob.type.includes("wav") ? "wav" : blob.type.includes("ogg") ? "ogg" : blob.type.includes("webm") ? "webm" : "mp3";
    const body = { model: model || PROVIDER_BY_ID.openrouter.defaultModels.stt, input_audio: { data: await blobToB64(blob), format: fmt }, response_format: "verbose_json", timestamp_granularities: ["word"] };
    if (language) body.language = language.split("-")[0];
    if (prompt) body.prompt = prompt.slice(0, 800);
    const res = await fetchJson(`${openAiBase("openrouter", creds)}/audio/transcriptions`, { method: "POST", headers: authHeaders("openrouter", creds), body: JSON.stringify(body) }, "OpenRouter transcription", 180000, signal);
    return normalizeTranscription(res);
  }
  const fd = new FormData();
  fd.append("file", blob, `audio.${blob.type.includes("wav") ? "wav" : "mp3"}`);
  const oaModel = model || "whisper-1"; fd.append("model", oaModel);
  if (/whisper/i.test(oaModel)) { fd.append("response_format", "verbose_json"); fd.append("timestamp_granularities[]", "word"); } else fd.append("response_format", "json");
  if (language) fd.append("language", language.split("-")[0]);
  if (prompt) fd.append("prompt", prompt.slice(0, 800));
  const headers = authHeaders("openai", creds); delete headers["Content-Type"];
  const res = await fetchJson(`${openAiBase("openai", creds)}/audio/transcriptions`, { method: "POST", headers, body: fd }, "OpenAI Whisper", 180000, signal);
  return normalizeTranscription(res);
}
/** Uniformise une réponse verbose_json : mots natifs, sinon mots répartis dans chaque segment. */
function normalizeTranscription(res) {
  let words = (res.words ?? []).map((w) => ({ word: w.word, start: w.start, end: w.end }));
  if (!words.length && Array.isArray(res.segments)) {
    for (const seg of res.segments) {
      const toks = String(seg.text ?? "").trim().split(/\s+/).filter(Boolean); if (!toks.length) continue;
      const total = toks.reduce((n, t) => n + t.length + 1, 0); let t0 = seg.start ?? 0; const dur = (seg.end ?? t0) - t0;
      for (const tk of toks) { const d = dur * ((tk.length + 1) / total); words.push({ word: tk, start: t0, end: t0 + d }); t0 += d; }
    }
  }
  return { words, duration: res.duration ?? (words.at(-1)?.end ?? 0), text: res.text ?? "" };
}

// ── Génération / retouche d'images ───────────────────────────────────────

/** Retourne { blob, mime, width?, height? }. */
export async function generateImage({ modelId, prompt, referenceImages = [], aspectRatio, size, credentials, signal }) {
  const { provider, model } = parseModelId(modelId);
  const creds = credentials ?? {};
  if (provider === "openai") {
    if (!hasCredentials("openai", creds)) throw new ProviderError(missingKeyMessage("openai", modelId), { status: 401, provider });
    const base = openAiBase("openai", creds);
    const sz = size ?? pickOpenAiSize(aspectRatio, model);
    if (referenceImages.length) {
      const fd = new FormData(); fd.append("model", model); fd.append("prompt", prompt); fd.append("size", sz);
      for (const ref of referenceImages) fd.append("image[]", ref.blob, "ref.png");
      const headers = authHeaders("openai", creds); delete headers["Content-Type"];
      const res = await fetchJson(`${base}/images/edits`, { method: "POST", headers, body: fd }, "OpenAI Images", 300000, signal);
      return imageFromB64(res.data?.[0]?.b64_json, "image/png");
    }
    const res = await fetchJson(`${base}/images/generations`, { method: "POST", headers: authHeaders("openai", creds), body: JSON.stringify({ model, prompt, size: sz, n: 1, ...(model.startsWith("gpt-image") ? { quality: "medium" } : { response_format: "b64_json" }) }) }, "OpenAI Images", 300000, signal);
    return imageFromB64(res.data?.[0]?.b64_json, "image/png");
  }
  if (provider === "google") {
    if (!hasCredentials("google", creds)) throw new ProviderError(missingKeyMessage("google", modelId), { status: 401, provider });
    const parts = [{ text: prompt }];
    for (const ref of referenceImages) parts.push({ inline_data: { mime_type: ref.blob.type || "image/png", data: await blobToB64(ref.blob) } });
    const body = { contents: [{ parts }], generationConfig: { responseModalities: ["IMAGE", "TEXT"], ...(aspectRatio ? { imageConfig: { aspectRatio: nearestGoogleRatio(aspectRatio) } } : {}) } };
    const res = await fetchJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(creds.google.apiKey)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, "Google Images", 300000, signal);
    const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
    if (!part) throw new ProviderError("Aucune image renvoyée par Google", { retryable: true });
    return imageFromB64(part.inlineData.data, part.inlineData.mimeType || "image/jpeg");
  }
  if (provider === "openrouter") {
    if (!hasCredentials("openrouter", creds)) throw new ProviderError(missingKeyMessage("openrouter", modelId), { status: 401, provider });
    const content = [{ type: "text", text: prompt }];
    for (const ref of referenceImages) content.push({ type: "image_url", image_url: { url: `data:${ref.blob.type || "image/png"};base64,${await blobToB64(ref.blob)}` } });
    const body = { model: await resolveOpenRouterModel(model || PROVIDER_BY_ID.openrouter.defaultModels.image, "image", creds), messages: [{ role: "user", content }], modalities: ["image", "text"], ...(aspectRatio ? { image_config: { aspect_ratio: nearestGoogleRatio(aspectRatio) } } : {}) };
    const res = await fetchJson(`${openAiBase("openrouter", creds)}/chat/completions`, { method: "POST", headers: authHeaders("openrouter", creds), body: JSON.stringify(body) }, "OpenRouter images", 180000, signal);
    const img = res.choices?.[0]?.message?.images?.[0];
    const url = img?.image_url?.url ?? img?.url ?? (typeof img === "string" ? img : null);
    if (!url) throw new ProviderError(`Aucune image renvoyée par OpenRouter (${body.model})`, { retryable: true });
    if (url.startsWith("data:")) return { ...imageFromB64(stripDataUrl(url), mimeOf(url)), model: `openrouter:${res.model ?? body.model}` };
    const blob = await fetchBlob(url, {}, "OpenRouter images", signal);
    return { blob, mime: blob.type || "image/png", model: `openrouter:${res.model ?? body.model}` };
  }
  throw new ProviderError(`La génération d'images n'est pas prise en charge pour ${provider}`);
}
function pickOpenAiSize(ratio, model) {
  if (!ratio) return "1024x1024";
  if (model.startsWith("gpt-image")) return ratio > 1.2 ? "1536x1024" : ratio < 0.83 ? "1024x1536" : "1024x1024";
  return ratio > 1.2 ? "1792x1024" : ratio < 0.83 ? "1024x1792" : "1024x1024";
}
function nearestGoogleRatio(r) { const opts = [["1:1", 1], ["3:4", 0.75], ["4:3", 1.333], ["9:16", 0.5625], ["16:9", 1.778], ["2:3", 0.667], ["3:2", 1.5], ["4:5", 0.8], ["5:4", 1.25], ["21:9", 2.333]]; return opts.sort((a, b) => Math.abs(a[1] - r) - Math.abs(b[1] - r))[0][0]; }
function imageFromB64(b64, mime) { if (!b64) throw new ProviderError("Image vide renvoyée", { retryable: true }); return { blob: b64ToBlob(b64, mime), mime }; }

// ── Outils ───────────────────────────────────────────────────────────────
async function fetchBlob(url, init, label, signal) {
  let res;
  try { res = await fetch(url, { ...init, signal }); } catch (e) { if (signal?.aborted) throw e; throw new ProviderError(`${label} : requête impossible (${e.message})`, { retryable: true }); }
  if (!res.ok) {
    const t = await res.text(); let msg = t.slice(0, 300);
    try { const j = JSON.parse(t); const m = j?.error?.message ?? j?.message ?? j?.error; if (m) msg = typeof m === "string" ? m : JSON.stringify(m); } catch { /* texte brut */ }
    throw new ProviderError(`${label} : HTTP ${res.status} — ${msg}`, { status: res.status, retryable: res.status === 429 || res.status >= 500, body: t });
  }
  return res.blob();
}
export function b64ToBytes(b64) { const bin = atob(b64); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); return arr; }
export function b64ToBlob(b64, mime) { return new Blob([b64ToBytes(b64)], { type: mime }); }
export function blobToB64(blob) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(blob); }); }
function escapeXml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c])); }
export function pcm16ToWav(pcm, sampleRate, channels) {
  const header = new ArrayBuffer(44); const v = new DataView(header);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + pcm.length, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * channels * 2, true); v.setUint16(32, channels * 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, pcm.length, true);
  return new Blob([header, pcm], { type: "audio/wav" });
}
function charsToWords(chars, starts, ends) {
  const words = []; let cur = null;
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (/\s/.test(c)) { if (cur) { words.push(cur); cur = null; } continue; }
    if (!cur) cur = { word: c, start: starts[i], end: ends[i] }; else { cur.word += c; cur.end = ends[i]; }
  }
  if (cur) words.push(cur);
  return words;
}
