// Sélecteur partagé « fournisseur → modèle de parole → voix par défaut », alimenté en direct par les API
// des fournisseurs (OpenRouter : modèles de parole et voix prises en charge lus depuis l'API Modèles).
import { h, select, field, textInput, button } from "./dom.js";
import { patchBookConfig } from "./stages/common.js";
import { getCredentials } from "../storage.js";
import { PROVIDERS, hasCredentials, listModels, openRouterVoices, fetchElevenLabsVoices, fetchAzureVoices, resolveOpenRouterSpeechModel } from "../llm/providers.js";
import { OPENAI_TTS_VOICES, GEMINI_TTS_VOICES } from "../config.js";

export const SPEECH_PROVIDERS = [["openai", "OpenAI"], ["openrouter", "OpenRouter"], ["gemini", "Google Gemini"], ["elevenlabs", "ElevenLabs"], ["azure", "Azure Speech"]];
/** Clé d'identifiants correspondant à un fournisseur de parole (la config dit « gemini », les clés disent « google »). */
export const credKeyOf = (prov) => (prov === "gemini" ? "google" : prov);

const DEFAULT_SPEECH_MODEL = { openai: "gpt-4o-mini-tts", openrouter: "openai/gpt-4o-mini-tts", gemini: "gemini-2.5-flash-preview-tts", elevenlabs: "eleven_multilingual_v2", azure: "neural" };

/** Liste des modèles de parole d'un fournisseur (en ligne si une clé existe, sinon liste embarquée). */
export async function speechModels(prov, creds) {
  const key = credKeyOf(prov);
  const live = await listModels(key, creds, "tts").catch(() => []);
  const p = PROVIDERS.find((x) => x.id === key);
  const fallback = p?.modelsByKind?.tts ?? (p?.defaultModels?.tts ? [p.defaultModels.tts] : (p?.models ?? []));
  return [...new Set([...(live ?? []), ...(live?.length ? [] : fallback)])];
}

/** Voix proposées pour un modèle : [{ id, label }] ou null si saisie libre. */
export async function speechVoices(prov, model, creds) {
  if (prov === "openai") return OPENAI_TTS_VOICES.map((v) => ({ id: v, label: v }));
  if (prov === "gemini") return GEMINI_TTS_VOICES.map((v) => ({ id: v, label: v }));
  if (prov === "openrouter") {
    const known = await openRouterVoices(model, creds);
    if (known.length) return known.map((v) => ({ id: v, label: v }));
    if (model.startsWith("openai/")) return OPENAI_TTS_VOICES.map((v) => ({ id: v, label: v }));
    if (model.startsWith("google/")) return GEMINI_TTS_VOICES.map((v) => ({ id: v, label: v }));
    return null;
  }
  if (prov === "elevenlabs" && hasCredentials("elevenlabs", creds)) return (await fetchElevenLabsVoices(creds).catch(() => [])).map((v) => ({ id: v.id, label: `${v.name}${v.labels?.language ? ` (${v.labels.language})` : ""}` }));
  if (prov === "azure" && hasCredentials("azure", creds)) return (await fetchAzureVoices(creds).catch(() => [])).map((v) => ({ id: v.id, label: `${v.name} · ${v.locale}` }));
  return null;
}

/**
 * Carte de réglages : fournisseur, modèle (liste en direct), voix par défaut. Les valeurs sont écrites dans
 * config.speech du livre (default_provider, providers[prov].model, voice).
 * @param ctx contexte du livre ; onChange() est appelé après chaque enregistrement.
 */
export async function speechProviderPicker(ctx, { onChange } = {}) {
  const creds = await getCredentials();
  let sp = ctx.config.speech ?? {};
  let prov = sp.default_provider ?? "openai";
  const modelSel = h("select", { class: "input select", "aria-label": "Modèle de parole" });
  const voiceHost = h("div", {});
  const status = h("span", { class: "field-hint" });
  const save = async (patch) => { await patchBookConfig(ctx, { speech: patch }); sp = ctx.config.speech ?? sp; onChange?.(); };

  const fillVoices = async (model) => {
    voiceHost.innerHTML = "";
    const voices = await speechVoices(prov, model, creds);
    const current = sp.voice ?? "";
    if (voices?.length) {
      const opts = [["", "Automatique (selon la langue)"], ...voices.map((v) => [v.id, v.label])];
      if (current && !voices.some((v) => v.id === current)) opts.push([current, `${current} (hors liste)`]);
      voiceHost.appendChild(select(opts, current, { onChange: (v) => save({ voice: v || undefined }), attrs: { "aria-label": "Voix par défaut" } }));
    } else voiceHost.appendChild(textInput({ value: current, placeholder: "identifiant de voix (vide = automatique)", onChange: (e) => save({ voice: e.target.value.trim() || undefined }), "aria-label": "Voix par défaut" }));
  };

  const fillModels = async () => {
    modelSel.innerHTML = ""; modelSel.appendChild(h("option", {}, "Chargement…")); modelSel.disabled = true;
    status.textContent = hasCredentials(credKeyOf(prov), creds) ? "Liste lue depuis l'API du fournisseur…" : "Aucune clé pour ce fournisseur : liste embarquée.";
    const models = await speechModels(prov, creds);
    const current = sp.providers?.[prov]?.model ?? DEFAULT_SPEECH_MODEL[prov];
    const list = [...models]; if (current && !list.includes(current)) list.unshift(current);
    modelSel.innerHTML = ""; for (const m of list) modelSel.appendChild(h("option", { value: m, selected: m === current }, m)); modelSel.disabled = false;
    status.textContent = hasCredentials(credKeyOf(prov), creds) ? `${models.length} modèle${models.length > 1 ? "s" : ""} de parole disponible${models.length > 1 ? "s" : ""} chez ${SPEECH_PROVIDERS.find(([id]) => id === prov)?.[1] ?? prov}.` : "Aucune clé pour ce fournisseur : liste embarquée, ajoutez la clé dans Paramètres → Fournisseurs IA.";
    if (models.length && !models.includes(current)) {
      const alt = prov === "openrouter" ? await resolveOpenRouterSpeechModel(current, creds) : null;
      status.textContent += ` Le modèle configuré « ${current} » n'apparaît pas dans la liste du fournisseur${alt && alt !== current ? ` : « ${alt} » sera utilisé à sa place, ou choisissez un modèle ci-dessus` : ""}.`;
    }
    await fillVoices(current);
  };
  modelSel.addEventListener("change", async () => { await save({ providers: { [prov]: { model: modelSel.value } }, voice: undefined }); await fillVoices(modelSel.value); });

  const provSel = select(SPEECH_PROVIDERS.map(([id, l]) => [id, `${l}${hasCredentials(credKeyOf(id), creds) ? "" : " (sans clé)"}`]), prov, { onChange: async (v) => { prov = v; await save({ default_provider: v, voice: undefined }); await fillModels(); }, attrs: { "aria-label": "Fournisseur de parole" } });
  const custom = textInput({ placeholder: "ou saisir un identifiant de modèle…", value: "", style: "max-width:260px", onChange: async (e) => { const m = e.target.value.trim(); if (!m) return; await save({ providers: { [prov]: { model: m } }, voice: undefined }); e.target.value = ""; await fillModels(); } });
  const refresh = button("", { variant: "ghost", size: "sm", iconName: "refresh", title: "Recharger la liste des modèles", onClick: fillModels });
  await fillModels();
  return h("div", { class: "stack" },
    h("div", { class: "row row-wrap" }, field("Fournisseur", provSel), field("Modèle de parole", h("div", { class: "row" }, h("div", { class: "grow", style: { minWidth: "240px" } }, modelSel), refresh, custom), { hint: "" })),
    status,
    field("Voix par défaut", voiceHost, { hint: "« Automatique » choisit la voix selon la langue (Paramètres → Parole → correspondances). Les voix par langue de ce livre se règlent dans l'onglet Voix." }));
}
