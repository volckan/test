// Vues « Langues » (traduction, révision, normalisation TTS, images) et « Parole » (audio par entrée, horodatages).
import { h, button, icon, badge, toast, dialog, confirmDialog, segmented, switchRow, select, textarea, textInput, field, blobImg, progressBar } from "../dom.js";
import { runCard, prereqGuard, patchBookConfig, versionPicker } from "./common.js";
import { LANGUAGES, languageName, TEXT_CATALOG_CATEGORIES } from "../../config.js";
import { outputLanguages, catalogForLanguage, fullSourceCatalog } from "../../pipeline/steps/translate.js";
import { TEXT_CATEGORY, isTtsExcluded, synthesizeEntry, audioKey, resolveProvider, resolveVoice, estimateTimestamps, audioDuration } from "../../pipeline/steps/speech.js";
import { callLLM } from "../../llm/client.js";
import { SCHEMAS, stepModel, languageContext, bookLanguage } from "../../pipeline/steps/common.js";
import { getCredentials } from "../../storage.js";
import { hasCredentials, transcribeWithTimestamps, PROVIDERS } from "../../llm/providers.js";
import { speechProviderPicker, transcriptionPicker } from "../speech-picker.js";
import { OPENAI_TTS_VOICES as OV, GEMINI_TTS_VOICES } from "../../config.js";
import { nowIso, baseLanguage, pickFile, sha256 } from "../../util.js";
import { DEFAULT_TRANSLATION_EVALUATION_JUDGE_INSTRUCTIONS } from "../../pipeline/translation-eval.js";

// ── Langues ────────────────────────────────────────────────────────────────
export async function renderTranslate(ctx, container) {
  const cfg = ctx.config;
  const chips = h("div", { class: "row row-wrap" });
  const renderChips = () => { chips.innerHTML = ""; for (const l of cfg.output_languages ?? []) chips.appendChild(h("span", { class: "chip" }, languageName(l), h("button", { type: "button", "aria-label": `Retirer ${l}`, onClick: async () => { await patchBookConfig(ctx, { output_languages: (cfg.output_languages ?? []).filter((x) => x !== l) }); renderChips(); } }, icon("x", "icon-sm")))); if (!(cfg.output_languages ?? []).length) chips.appendChild(h("span", { class: "muted small" }, "Aucune langue supplémentaire")); };
  renderChips();
  const settings = h("div", { class: "card" }, h("div", { class: "card-body stack" }, h("h3", { style: { margin: 0 } }, "Langues de sortie"), h("div", { class: "row" }, select([["", "Ajouter une langue…"], ...LANGUAGES], "", { onChange: async (v) => { if (v && !(cfg.output_languages ?? []).includes(v)) { await patchBookConfig(ctx, { output_languages: [...(cfg.output_languages ?? []), v] }); renderChips(); } }, attrs: { style: "width:auto" } })), chips,
    switchRow("Normalisation du texte pour la parole (nombres, abréviations, LaTeX)", cfg.core_tts?.language_normalization !== false, (v) => patchBookConfig(ctx, { core_tts: { language_normalization: v, latex_to_speech: v } })),
    switchRow("Traduction des images (régénération par IA du texte incrusté)", !!cfg.image_translation?.enabled, (v) => patchBookConfig(ctx, { image_translation: { enabled: v } }), { hint: `${(cfg.image_translation?.selected_image_ids ?? []).length} image(s) sélectionnée(s)` }), cfg.image_translation?.enabled ? button("Choisir les images…", { size: "sm", variant: "secondary", onClick: () => pickTranslatedImages(ctx) }) : null));
  container.appendChild(h("div", { class: "stack" }, settings, runCard(ctx, "translate")));
  if (prereqGuard(ctx, "translate", container)) return;
  const langs = await outputLanguages(ctx.storage, ctx.config);
  const source = await fullSourceCatalog(ctx.storage);
  if (!source.length) return;
  let lang = ctx.query.lang ?? langs[1] ?? langs[0]; let cat = "all", q = "", onlyIssues = false; const PAGE = 60; let pageN = 0;
  const list = h("div", { class: "stack" });
  const srcLang = langs[0];
  const render = async () => {
    list.innerHTML = "";
    const isSource = baseLanguage(lang) === baseLanguage(srcLang);
    const trNode = isSource ? null : await ctx.storage.getNodeData("text-catalog-translation", lang);
    const trMap = new Map((trNode?.entries ?? []).map((e) => [e.id, e]));
    const core = new Map(((await ctx.storage.getNodeData("core-tts-catalog", lang))?.entries ?? []).map((e) => [e.id, e]));
    const evalNode = await ctx.storage.getNodeData("translation-evaluation", lang); const evalMap = new Map((evalNode?.results ?? []).map((r) => [r.id, r]));
    const ttsNode = await ctx.storage.getNodeData("tts", lang); const ttsMap = new Map((ttsNode?.entries ?? []).filter((e) => (e.voiceSlot ?? "primary") === "primary").map((e) => [e.textId, e]));
    let entries = source.filter((e) => cat === "all" || TEXT_CATEGORY(e.id) === cat).filter((e) => !q || e.text.toLowerCase().includes(q) || (trMap.get(e.id)?.text ?? "").toLowerCase().includes(q) || e.id.includes(q)).filter((e) => !onlyIssues || (evalMap.get(e.id) && !evalMap.get(e.id).acceptable && !evalMap.get(e.id).accepted));
    const total = entries.length; entries = entries.slice(pageN * PAGE, (pageN + 1) * PAGE);
    list.appendChild(h("div", { class: "row between" }, h("span", { class: "muted small" }, `${total} entrées${!isSource && trNode ? ` · ${trNode.entries.length} traduites` : ""}`), h("div", { class: "row" }, button("Précédent", { size: "sm", variant: "ghost", disabled: pageN === 0, onClick: () => { pageN--; render(); } }), h("span", { class: "small" }, `${pageN + 1}/${Math.max(1, Math.ceil(total / PAGE))}`), button("Suivant", { size: "sm", variant: "ghost", disabled: (pageN + 1) * PAGE >= total, onClick: () => { pageN++; render(); } }))));
    for (const e of entries) {
      const tr = trMap.get(e.id); const ev = evalMap.get(e.id); const c = core.get(e.id); const excluded = isTtsExcluded(e.id, cfg.speech); const tts = ttsMap.get(e.id);
      const row = h("div", { class: "section-box" }, h("div", { class: "section-box-head" }, h("span", { class: "mono small muted" }, e.id), badge(TEXT_CATALOG_CATEGORIES[TEXT_CATEGORY(e.id)]), tr?.manual ? badge("Modifié", "warning") : null, ev ? badge(ev.accepted ? "Accepté malgré tout" : ev.acceptable ? "Acceptable" : `À revoir (${ev.severity})`, ev.accepted ? "muted" : ev.acceptable ? "success" : ev.severity === "high" ? "danger" : "warning") : null, excluded ? badge("Muet", "muted") : null, c?.changed ? badge("TTS normalisé", "accent") : null, h("span", { class: "grow" }),
        button(excluded ? "Inclure dans la lecture" : "Exclure de la lecture", { size: "sm", variant: "ghost", iconName: excluded ? "volume" : "eye-off", onClick: async () => { const ids = new Set(cfg.speech?.excluded_text_ids ?? []); if (excluded) ids.delete(e.id); else ids.add(e.id); await patchBookConfig(ctx, { speech: { excluded_text_ids: [...ids] } }, { silent: true }); render(); } }),
        tts ? h("audio", { controls: true, preload: "none", style: "height:30px;width:200px", src: "" , onPlay: async (ev2) => { if (!ev2.target.src || ev2.target.src === location.href) { const b = await ctx.storage.getBlob(audioKey(lang, e.id)); if (b) { ev2.target.src = URL.createObjectURL(b); ev2.target.play(); } } } }) : null,
        button(tts ? "Régénérer l'audio" : "Générer l'audio", { size: "sm", variant: "ghost", iconName: "mic", onClick: () => generateOne(ctx, lang, e.id, c?.speechText ?? tr?.text ?? e.text, render) }),
        button("Téléverser un audio", { size: "sm", variant: "ghost", iconName: "upload", onClick: () => uploadAudio(ctx, lang, e.id, render) })),
        h("div", { class: "section-box-body split" }, h("div", { class: "small", style: { padding: "8px", background: "var(--bg-sunken)", borderRadius: "8px" } }, e.text), isSource ? h("div", { class: "stack" }, c ? field("Texte lu (normalisation TTS)", textarea({ value: c.speechText ?? "", rows: 2, onChange: async (ev2) => { c.speechText = ev2.target.value; c.changed = c.speechText !== c.displayText; c.manual = true; c.status = "ready"; const node = await ctx.storage.getNodeData("core-tts-catalog", lang); await ctx.storage.putNodeData("core-tts-catalog", lang, { ...node, entries: node.entries.map((x) => x.id === c.id ? c : x) }); toast("Enregistré", { kind: "success", duration: 1000 }); } })) : h("span", { class: "muted small" }, "Langue source")) : h("div", { class: "stack" }, textarea({ value: tr?.text ?? "", rows: 2, placeholder: "Non traduit", onChange: async (ev2) => { const node = (await ctx.storage.getNodeData("text-catalog-translation", lang)) ?? { language: lang, entries: [] }; const ex = node.entries.find((x) => x.id === e.id); if (ex) { ex.text = ev2.target.value; ex.manual = true; } else node.entries.push({ id: e.id, text: ev2.target.value, sourceText: e.text, manual: true }); await ctx.storage.putNodeData("text-catalog-translation", lang, { ...node, generatedAt: nowIso() }); toast("Traduction enregistrée", { kind: "success", duration: 1000 }); } }), ev && !ev.acceptable && !ev.accepted ? h("div", { class: "callout callout-warning small" }, h("div", { class: "grow" }, h("strong", {}, ev.issue_type), " — ", ev.rationale, ev.suggested_text ? h("div", { style: { marginTop: "4px" } }, "Suggestion : ", h("em", {}, ev.suggested_text)) : null), h("div", { class: "col" }, ev.suggested_text ? button("Appliquer", { size: "sm", onClick: async () => { const node = await ctx.storage.getNodeData("text-catalog-translation", lang); const ex = node.entries.find((x) => x.id === e.id); if (ex) { ex.text = ev.suggested_text; ex.manual = true; } await ctx.storage.putNodeData("text-catalog-translation", lang, node); ev.acceptable = true; await ctx.storage.putNodeData("translation-evaluation", lang, evalNode); render(); } }) : null, button("Accepter malgré tout", { size: "sm", variant: "ghost", onClick: async () => { ev.accepted = true; await ctx.storage.putNodeData("translation-evaluation", lang, evalNode); render(); } }))) : null)));
      list.appendChild(row);
    }
  };
  container.appendChild(h("div", { class: "stack" }, h("div", { class: "row row-wrap between" }, h("h2", { style: { margin: 0 } }, "Catalogue de texte"), h("div", { class: "row row-wrap" }, select(langs.map((l) => [l, `${languageName(l)}${l === srcLang ? " (source)" : ""}`]), lang, { onChange: (v) => { lang = v; pageN = 0; render(); }, attrs: { style: "width:auto" } }), select([["all", "Toutes les catégories"], ...Object.entries(TEXT_CATALOG_CATEGORIES)], cat, { onChange: (v) => { cat = v; pageN = 0; render(); }, attrs: { style: "width:auto" } }), textInput({ placeholder: "Rechercher…", onInput: (e) => { q = e.target.value.toLowerCase(); pageN = 0; render(); } }), button("Réviser les traductions visibles (IA)", { size: "sm", variant: "secondary", iconName: "shield-check", onClick: () => reviewTranslations(ctx, lang, srcLang, render) }), switchRow("Problèmes seulement", onlyIssues, (v) => { onlyIssues = v; pageN = 0; render(); }), button("Tout rendre muet (numéros de page)", { size: "sm", variant: "ghost", onClick: async () => { const pages = await ctx.storage.getPages(); const ids = new Set(cfg.speech?.excluded_text_ids ?? []); for (const p of pages) { const s = await ctx.storage.getNodeData("page-sectioning", p.pageId); for (const sec of s?.sections ?? []) (function walk(nodes) { for (const n of nodes) { if (n.role === "page_number") ids.add(n.nodeId); if (n.children) walk(n.children); } })(sec.nodes); } await patchBookConfig(ctx, { speech: { excluded_text_ids: [...ids] } }); render(); } }))), list));
  await render();
}

async function pickTranslatedImages(ctx) {
  const captions = (await ctx.storage.getNodeData("image-captioning", "book"))?.captions ?? [];
  const imgs = (await ctx.storage.getImages()).filter((im) => !im.imageId.endsWith("_page") && !im.supersededBy && im.source !== "translate");
  const selected = new Set(ctx.config.image_translation?.selected_image_ids ?? []);
  const grid = h("div", { class: "thumb-grid scroll-y" }, imgs.map((im) => { const card = h("button", { type: "button", class: ["thumb-card", selected.has(im.imageId) && "active"], onClick: () => { if (selected.has(im.imageId)) selected.delete(im.imageId); else selected.add(im.imageId); card.classList.toggle("active"); } }, blobImg(ctx.storage.getImageBlob(im.imageId), { alt: im.imageId }), h("span", { class: "small mono" }, im.imageId), h("span", { class: "muted small" }, captions.find((c) => c.imageId === im.imageId)?.caption?.slice(0, 60) ?? "")); return card; }));
  dialog({ title: "Images à traduire", size: "lg", body: h("div", { class: "stack" }, h("p", { class: "muted small" }, "Sélectionnez les images contenant du texte incrusté à régénérer dans chaque langue de sortie."), grid), actions: [{ label: "Annuler", variant: "ghost" }, { label: `Enregistrer`, onClick: () => patchBookConfig(ctx, { image_translation: { selected_image_ids: [...selected] } }) }] });
}

async function reviewTranslations(ctx, lang, srcLang, rerender) {
  if (baseLanguage(lang) === baseLanguage(srcLang)) return toast("Choisissez une langue de sortie", { kind: "warning" });
  const te = ctx.config.translation_evaluation ?? {};
  const source = await fullSourceCatalog(ctx.storage); const tr = await ctx.storage.getNodeData("text-catalog-translation", lang);
  if (!tr) return toast("Aucune traduction pour cette langue", { kind: "warning" });
  const map = new Map(tr.entries.map((e) => [e.id, e.text]));
  const entries = source.filter((e) => map.has(e.id)).slice(0, 400);
  const meta = await ctx.storage.getNodeData("metadata", "book");
  toast(`Révision de ${entries.length} entrées…`);
  const results = [];
  try {
    for (let i = 0; i < entries.length; i += 40) {
      const batch = entries.slice(i, i + 40);
      const res = await callLLM({ storage: ctx.storage, step: "translation-evaluation", itemId: `${lang}/${i}`, promptName: "translation_evaluation", variables: { judge_instructions: te.judge_instructions ?? DEFAULT_TRANSLATION_EVALUATION_JUDGE_INSTRUCTIONS, strictness: te.strictness ?? "balanced", issue_types: te.issue_types ?? ["meaning", "fluency", "terminology", "omission-or-addition", "formatting", "context"], additional_guidance: te.additional_guidance ?? "", source_language: languageName(srcLang), target_language: languageName(lang), book_metadata: meta?.title ?? "", entries: batch.map((e) => ({ id: e.id, source: e.text, target: map.get(e.id) })) }, schema: SCHEMAS.evaluation, config: ctx.config, modelId: te.judge_model ?? stepModel(ctx.config, "translation"), temperature: te.temperature ?? 0, maxRetries: te.max_retries ?? 3 });
      results.push(...res.parsed.results);
    }
    const prev = await ctx.storage.getNodeData("translation-evaluation", lang);
    const accepted = new Set((prev?.results ?? []).filter((r) => r.accepted).map((r) => r.id));
    await ctx.storage.putNodeData("translation-evaluation", lang, { language: lang, results: results.map((r) => ({ ...r, accepted: accepted.has(r.id) })), generatedAt: nowIso() });
    const issues = results.filter((r) => !r.acceptable).length;
    toast(`Révision terminée : ${issues} entrée(s) à revoir`, { kind: issues ? "warning" : "success" }); rerender();
  } catch (e) { toast(e.message, { kind: "error" }); }
}

async function generateOne(ctx, lang, textId, text, rerender) {
  toast("Synthèse…");
  try {
    const credentials = await getCredentials();
    const r = await synthesizeEntry({ storage: ctx.storage, config: ctx.config, lang, entry: { id: textId, text, speechText: text }, credentials });
    const node = (await ctx.storage.getNodeData("tts", lang)) ?? { language: lang, entries: [], failed: [] };
    node.entries = node.entries.filter((e) => !(e.textId === textId && (e.voiceSlot ?? "primary") === "primary")); node.entries.push({ ...r, manual: false }); node.failed = (node.failed ?? []).filter((f) => f.textId !== textId);
    await ctx.storage.putNodeData("tts", lang, { ...node, generatedAt: nowIso() }); toast("Audio généré", { kind: "success" }); rerender();
  } catch (e) { toast(e.message, { kind: "error" }); }
}
async function uploadAudio(ctx, lang, textId, rerender) {
  const f = await pickFile({ accept: "audio/*" }); if (!f) return;
  const ext = f.name.split(".").pop().toLowerCase();
  await ctx.storage.putBlob(audioKey(lang, textId), f, { fileName: `${textId}.${ext}` });
  const node = (await ctx.storage.getNodeData("tts", lang)) ?? { language: lang, entries: [], failed: [] };
  node.entries = node.entries.filter((e) => !(e.textId === textId && (e.voiceSlot ?? "primary") === "primary")); node.entries.push({ textId, language: lang, fileName: `${textId}.${ext}`, voice: "upload", model: "upload", provider: "upload", voiceSlot: "primary", manual: true, textHash: (await sha256(`upload|${f.size}|${f.name}`)).slice(0, 16) });
  await ctx.storage.putNodeData("tts", lang, { ...node, generatedAt: nowIso() }); toast("Audio importé", { kind: "success" }); rerender();
}

// ── Parole ─────────────────────────────────────────────────────────────────
export async function renderSpeech(ctx, container) {
  const cfg = ctx.config; const sp = cfg.speech ?? {}; const credentials = await getCredentials();
  const settings = h("div", { class: "card" }, h("div", { class: "card-body stack" }, h("h3", { style: { margin: 0 } }, "Réglages de la parole"), await speechProviderPicker(ctx), await transcriptionPicker(ctx), h("div", { class: "field" }, h("span", { class: "field-label" }, "Surlignage dans le lecteur"), segmented([["sentence", "Par phrase"], ["word", "Par mot"]], sp.word_highlighting === false ? "sentence" : "word", (v) => patchBookConfig(ctx, { speech: { word_highlighting: v === "word" } })), h("span", { class: "field-hint" }, "Le surlignage par mot nécessite des horodatages (ElevenLabs natif, ou Whisper via une clé OpenAI ou OpenRouter ; sinon estimation).")), button("Configurer les voix et accents", { size: "sm", variant: "secondary", iconName: "mic", onClick: () => ctx.go("speech", null, { tab: "voices" }) })));
  container.appendChild(h("div", { class: "stack" }, settings, runCard(ctx, "speech")));
  if (prereqGuard(ctx, "speech", container)) return;
  const langs = await outputLanguages(ctx.storage, ctx.config);
  let lang = langs[0]; let onlyMissing = false;
  const list = h("div", { class: "stack" });
  const render = async () => {
    list.innerHTML = "";
    const tts = await ctx.storage.getNodeData("tts", lang); const ts = await ctx.storage.getNodeData("tts-timestamps", lang);
    const catalog = await catalogForLanguage(ctx.storage, ctx.config, lang);
    const entries = new Map((tts?.entries ?? []).filter((e) => (e.voiceSlot ?? "primary") === "primary").map((e) => [e.textId, e]));
    const failed = new Map((tts?.failed ?? []).map((f) => [f.textId, f]));
    const rows = catalog.filter((e) => !isTtsExcluded(e.id, sp)).filter((e) => !onlyMissing || !entries.has(e.id));
    const provider = resolveProvider(ctx.config, lang, credentials); const voice = await resolveVoice({ provider, lang, config: ctx.config });
    list.appendChild(h("div", { class: "row between row-wrap" }, h("span", { class: "muted small" }, `${entries.size}/${catalog.filter((e) => !isTtsExcluded(e.id, sp)).length} entrées avec audio · fournisseur ${provider} · voix ${voice?.voice ?? "—"}${failed.size ? ` · ${failed.size} échecs` : ""}`), h("div", { class: "row" }, button("Générer les horodatages manquants", { size: "sm", variant: "secondary", iconName: "activity", onClick: async () => { const { runStages } = await import("../../pipeline/runner.js"); runStages(ctx.label, "speech", "speech", { onlySteps: ["word-timestamps"] }); } }), button("Supprimer tous les audios", { size: "sm", variant: "ghost", iconName: "trash", onClick: async () => { if (!(await confirmDialog({ title: `Supprimer les audios (${languageName(lang)}) ?`, text: "Les fichiers audio de cette langue seront effacés. L'étape devra être relancée.", confirmLabel: "Supprimer", danger: true }))) return; for (const row of await ctx.storage.listBlobs(`audio/${lang}/`)) await ctx.storage.deleteBlob(row.key); await ctx.storage.deleteNodeItem("tts", lang); await ctx.storage.deleteNodeItem("tts-timestamps", lang); toast("Audios supprimés", { kind: "success" }); render(); } }))));
    const PAGE = 80;
    for (const e of rows.slice(0, PAGE)) {
      const tts1 = entries.get(e.id); const t = ts?.entries?.[e.id]; const f = failed.get(e.id);
      list.appendChild(h("div", { class: "row", style: { padding: "6px 0", borderBottom: "1px solid var(--border)", gap: "10px" } }, h("span", { class: "mono small muted", style: { minWidth: "130px" } }, e.id), h("span", { class: "grow small" }, e.text.slice(0, 160)), f ? h("span", { class: "row", style: { gap: "6px" }, title: f.error ?? "" }, badge("Échec", "danger"), h("span", { class: "small", style: { color: "var(--danger)", maxWidth: "360px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, f.error ?? "")) : tts1 ? badge(tts1.provider ?? "audio", "success") : badge("Manquant", "muted"), t ? badge(t.method === "estimated" ? "horodatage estimé" : "horodatage", t.method === "estimated" ? "warning" : "accent") : null, tts1 ? button("", { size: "sm", variant: "ghost", iconName: "play", title: "Écouter", onClick: async () => { const b = await ctx.storage.getBlob(audioKey(lang, e.id)); if (b) new Audio(URL.createObjectURL(b)).play(); } }) : null, button("", { size: "sm", variant: "ghost", iconName: tts1 ? "refresh" : "mic", title: tts1 ? "Régénérer" : "Générer", onClick: () => generateOne(ctx, lang, e.id, e.text, render) })));
    }
    if (rows.length > PAGE) list.appendChild(h("p", { class: "muted small" }, `… et ${rows.length - PAGE} autres entrées (utilisez la vue Langues pour parcourir tout le catalogue).`));
  };
  container.appendChild(h("div", { class: "stack" }, h("div", { class: "row between row-wrap" }, h("h2", { style: { margin: 0 } }, "Audio par entrée"), h("div", { class: "row" }, select(langs.map((l) => [l, languageName(l)]), lang, { onChange: (v) => { lang = v; render(); }, attrs: { style: "width:auto" } }), switchRow("Entrées sans audio seulement", onlyMissing, (v) => { onlyMissing = v; render(); }))), list));
  await render();
}
