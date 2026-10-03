// Paramètres globaux : fournisseurs IA, modèles, prompts, langue, apparence, notifications, à propos.
import { h, button, icon, badge, toast, textInput, field, select, switchRow, segmented, tabs, confirmDialog, dialog, textarea, md, card, copyToClipboard } from "../dom.js";
import { renderAppLayout, mount, pageHead } from "../app-layout.js";
import { navigate, href } from "../../router.js";
import { getCredentials, setCredentials, getGlobalConfig, patchGlobalConfig, getUiPrefs, setUiPrefs, listBooks } from "../../storage.js";
import { PROVIDERS, checkProvider, listModels, hasCredentials, parseModelId, qualifyModelId, fetchElevenLabsVoices, fetchAzureVoices, configuredProviders } from "../../llm/providers.js";
import { DEFAULT_PROMPTS, PROMPT_DESCRIPTIONS, listPromptNames, setGlobalPrompt } from "../../llm/prompts.js";
import { DEFAULT_TEMPLATES, TEMPLATE_LABELS, setGlobalTemplate } from "../../pipeline/render-template.js";
import { getSetting, setSetting, estimateUsage, deleteSetting } from "../../db.js";
import { DEFAULT_CONFIG, LANGUAGES, DEFAULT_SPEECH_INSTRUCTIONS, DEFAULT_CORE_TTS_PROFILES, DEFAULT_VOICES } from "../../config.js";
import { promptVariables } from "../../llm/prompt-engine.js";
import { formatBytes, downloadBlob } from "../../util.js";
import { APP_VERSION } from "../../main.js";

const SECTIONS = [
  { group: "Préférences", items: [["language", "Langue", "languages"], ["theme", "Apparence", "palette"], ["notifications", "Notifications", "bell"]] },
  { group: "Intelligence artificielle", items: [["providers", "Fournisseurs IA", "key"], ["models", "Modèles", "cpu"], ["prompts", "Prompts", "terminal"], ["speech", "Parole (voix et consignes)", "mic"]] },
  { group: "Application", items: [["storage", "Stockage", "package"], ["about", "À propos", "info"]] },
];

export async function renderSettings({ params }) {
  const section = params.section;
  const nav = h("nav", { class: "stack", style: { gap: "4px" } }, SECTIONS.map((g) => h("div", {}, h("div", { class: "nav-section" }, g.group), g.items.map(([key, label, ico]) => h("a", { class: ["nav-link", key === section && "active"], href: href(`/settings/${key}`) }, icon(ico), label)))));
  const body = h("div", { class: "stack" });
  const renderers = { language: renderLanguage, theme: renderTheme, notifications: renderNotifications, providers: renderProviders, models: renderModels, prompts: renderPrompts, speech: renderSpeech, storage: renderStorage, about: renderAbout };
  body.appendChild((await (renderers[section] ?? renderAbout)()));
  mount(renderAppLayout(h("div", { class: "stack" }, pageHead("Paramètres", "Préférences de l'application, fournisseurs d'IA, modèles et prompts."), h("div", { class: "two-pane", style: { gridTemplateColumns: "240px 1fr" } }, nav, body))));
}

async function renderLanguage() {
  const cfg = await getGlobalConfig();
  return card("Langue", h("div", { class: "stack" }, h("p", { class: "muted" }, "L'interface d'ADT Studio Web est en français. Les réglages ci-dessous définissent les langues par défaut des nouveaux livres."),
    field("Langue d'édition par défaut", select([["", "Langue détectée du livre"], ...LANGUAGES], cfg.editing_language ?? "", { onChange: (v) => patchGlobalConfig({ editing_language: v || undefined }) }), { hint: "Appliquée aux nouveaux livres ; modifiable par livre." }),
    field("Langues de sortie par défaut (codes séparés par des virgules)", textInput({ value: (cfg.output_languages ?? []).join(", "), placeholder: "en, es", onChange: (e) => patchGlobalConfig({ output_languages: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) }) }))));
}

async function renderTheme() {
  const prefs = await getUiPrefs();
  return card("Apparence", h("div", { class: "stack" },
    h("div", { class: "field" }, h("span", { class: "field-label" }, "Thème"), h("div", { class: "grid grid-3" }, [["light", "Clair", "sun"], ["dark", "Sombre", "moon"], ["system", "Système", "monitor"]].map(([v, l, ic]) => h("button", { type: "button", class: ["option-card", (prefs.theme ?? "system") === v && "selected"], onClick: async () => { await setUiPrefs({ theme: v }); renderSettings({ params: { section: "theme" } }); } }, icon(ic), h("strong", {}, l))))),
    switchRow("Réduire les animations", !!prefs.reduceMotion, (v) => { setUiPrefs({ reduceMotion: v }); document.documentElement.dataset.reduceMotion = v ? "true" : ""; }, { hint: "Désactive les transitions de l'interface du Studio." })));
}

async function renderNotifications() {
  const prefs = await getUiPrefs();
  return card("Notifications", h("div", { class: "stack" },
    field("Position des notifications", select([["top-left", "Haut gauche"], ["top-center", "Haut centre"], ["top-right", "Haut droite"], ["bottom-left", "Bas gauche"], ["bottom-center", "Bas centre"], ["bottom-right", "Bas droite"]], prefs.toastPosition ?? "bottom-right", { onChange: (v) => setUiPrefs({ toastPosition: v }) })),
    switchRow("Jouer un son", prefs.sound !== false, (v) => setUiPrefs({ sound: v })),
    switchRow("Fermeture automatique", prefs.autoDismiss !== false, (v) => setUiPrefs({ autoDismiss: v })),
    field("Délai de fermeture", select([[4000, "4 s"], [6000, "6 s"], [10000, "10 s"]], prefs.autoDismissMs ?? 4000, { onChange: (v) => setUiPrefs({ autoDismissMs: Number(v) }) })),
    switchRow("Alertes du système (onglet en arrière-plan)", prefs.desktopAlerts !== false, async (v) => { if (v && "Notification" in window && Notification.permission === "default") await Notification.requestPermission(); setUiPrefs({ desktopAlerts: v }); }, { hint: "Notification du navigateur à la fin d'une exécution quand l'onglet n'est pas visible." }),
    h("div", {}, button("Tester une notification", { variant: "secondary", iconName: "bell", onClick: () => toast("Ceci est une notification de test", { kind: "success", title: "ADT Studio" }) }))));
}

/**
 * Après l'enregistrement d'une clé : si le modèle par défaut pointe vers un fournisseur sans clé,
 * on bascule sur le modèle par défaut du fournisseur qui vient d'être configuré.
 */
async function alignDefaultModel(p, creds) {
  if (!hasCredentials(p.id, creds)) { toast(`${p.displayName} : clé effacée`, { kind: "info" }); return; }
  const cfg = await getGlobalConfig();
  const patch = {};
  const current = cfg.default_model ?? DEFAULT_CONFIG.default_model;
  if (p.modalities.includes("structured-text") && !hasCredentials(parseModelId(current).provider, creds)) patch.default_model = qualifyModelId(p.id, p.defaultModels?.["structured-text"] ?? p.models?.[0] ?? "");
  const img = cfg.default_image_generation_model ?? DEFAULT_CONFIG.default_image_generation_model;
  if (p.modalities.includes("image") && !hasCredentials(parseModelId(img).provider, creds)) patch.default_image_generation_model = qualifyModelId(p.id, p.defaultModels?.image ?? "");
  if (Object.keys(patch).length) {
    await patchGlobalConfig(patch);
    toast(`${p.displayName} enregistré. Modèle par défaut réglé sur ${Object.values(patch).join(", ")} (modifiable dans Paramètres → Modèles).`, { kind: "success", duration: 9000 });
  } else toast(`${p.displayName} enregistré`, { kind: "success" });
}

async function renderProviders() {
  const creds = await getCredentials();
  const prefs = await getUiPrefs();
  const wrap = h("div", { class: "stack" });
  const groups = [["Modèles et raisonnement", PROVIDERS.filter((p) => p.modalities.includes("structured-text"))], ["Parole et voix", PROVIDERS.filter((p) => !p.modalities.includes("structured-text"))]];
  for (const [title, list] of groups) {
    wrap.appendChild(h("h2", {}, title));
    for (const p of list) {
      creds[p.id] ??= {};
      const status = h("span", { class: "muted small" }, hasCredentials(p.id, creds) ? "Clé enregistrée · non vérifiée" : "Non configuré");
      const inputs = p.fields.map((f) => { const inp = textInput({ type: f.kind === "secret" ? "password" : "text", placeholder: f.placeholder ?? "", value: creds[p.id][f.key] ?? "", autocomplete: "off", onInput: (e) => { creds[p.id][f.key] = e.target.value.trim(); } }); const toggle = f.kind === "secret" ? button("", { variant: "ghost", size: "sm", iconName: "eye", title: "Afficher / masquer", onClick: () => { inp.type = inp.type === "password" ? "text" : "password"; } }) : null; return field(`${f.label} ${f.required ? "" : "(facultatif)"}`, h("div", { class: "row" }, h("div", { class: "grow" }, inp), toggle)); });
      wrap.appendChild(h("div", { class: "card" }, h("div", { class: "card-body stack" },
        h("div", { class: "row between row-wrap" }, h("div", { class: "row" }, h("strong", {}, p.displayName), p.modalities.map((m) => badge({ "structured-text": "Texte + vision", image: "Images", tts: "Parole", stt: "Transcription" }[m] ?? m))), h("div", { class: "row" }, p.docsUrl ? h("a", { class: "small", href: p.docsUrl, target: "_blank", rel: "noopener" }, "Documentation ", icon("external", "icon-sm")) : null)),
        h("p", { class: "muted small" }, p.help), h("div", { class: p.fields.length > 1 ? "grid grid-2" : "" }, inputs),
        h("div", { class: "row row-wrap" }, button("Enregistrer", { size: "sm", onClick: async () => { await setCredentials(creds); status.textContent = "Clé enregistrée"; await alignDefaultModel(p, creds); } }), button("Tester la connexion", { size: "sm", variant: "secondary", onClick: async () => { await setCredentials(creds); status.textContent = "Vérification…"; const r = await checkProvider(p.id, creds); status.textContent = r.message; status.style.color = r.status === "connected" ? "var(--success)" : r.status === "rejected" ? "var(--danger)" : ""; } }), button("Retirer", { size: "sm", variant: "ghost", onClick: async () => { creds[p.id] = {}; await setCredentials(creds); renderSettings({ params: { section: "providers" } }); } }), h("span", { class: "grow" }), status))));
    }
  }
  wrap.appendChild(card("Vérification de l'état", h("div", { class: "stack" }, h("p", { class: "muted small" }, "Les appels partent directement de votre navigateur vers chaque fournisseur. Les clés sont stockées dans IndexedDB de ce navigateur uniquement."), button("Rafraîchir tous les fournisseurs", { variant: "secondary", iconName: "refresh", onClick: async () => { for (const p of PROVIDERS) if (hasCredentials(p.id, creds)) { const r = await checkProvider(p.id, creds); toast(`${p.displayName} : ${r.message}`, { kind: r.status === "connected" ? "success" : "warning" }); } } }))));
  return wrap;
}

export async function modelPicker(value, onChange, { kind = "structured-text", attrs = {} } = {}) {
  const creds = await getCredentials();
  const providers = PROVIDERS.filter((p) => p.modalities.includes(kind));
  const { provider: curP, model: curM } = parseModelId(value ?? "");
  let prov = providers.some((p) => p.id === curP) ? curP : providers[0].id;
  const modelSel = h("select", { class: "input select", "aria-label": "Modèle" });
  const custom = textInput({ placeholder: "ou saisir un identifiant de modèle…", value: "", style: "max-width:260px", onChange: (e) => { if (e.target.value.trim()) onChange(qualifyModelId(prov, e.target.value.trim())); } });
  const status = h("span", { class: "field-hint", role: "status" });
  const KIND_LABEL = { "structured-text": "de texte", image: "d'images", tts: "de parole", stt: "de transcription" };
  const fill = async (force = false) => {
    modelSel.innerHTML = ""; modelSel.appendChild(h("option", {}, "Chargement…")); modelSel.disabled = true;
    const p = PROVIDERS.find((x) => x.id === prov); const withKey = hasCredentials(prov, creds);
    const live = withKey ? await listModels(prov, creds, kind, { force: force === true }) : [];
    const embedded = kind === "structured-text" ? (p?.models ?? []) : (p?.modelsByKind?.[kind] ?? [p?.defaultModels?.[kind]].filter(Boolean));
    const list = [...new Set([...live, ...(live.length ? [] : embedded)])];
    const configured = prov === curP ? curM : "";
    if (configured && !list.includes(configured)) list.unshift(configured);
    modelSel.innerHTML = ""; for (const m of list) modelSel.appendChild(h("option", { value: m, selected: prov === curP && m === curM }, m));
    if (!list.length) modelSel.appendChild(h("option", { value: "" }, "— saisir ci-contre —"));
    modelSel.disabled = false;
    status.textContent = withKey ? (live.length ? `${live.length} modèle${live.length > 1 ? "s" : ""} ${KIND_LABEL[kind] ?? ""} chez ${p?.displayName ?? prov} (liste lue depuis l'API).` : `Liste indisponible chez ${p?.displayName ?? prov} : modèles embarqués.`) : `Aucune clé pour ${p?.displayName ?? prov} : liste embarquée. Ajoutez la clé dans Paramètres → Fournisseurs IA.`;
    if (configured && live.length && !live.includes(configured)) status.textContent += ` Le modèle configuré « ${configured} » n'apparaît pas dans la liste du fournisseur.`;
    if (!(prov === curP && list.includes(curM)) && list.length) onChange(qualifyModelId(prov, list[0]));
  };
  const provSel = select(providers.map((p) => [p.id, `${p.displayName}${hasCredentials(p.id, creds) ? "" : " (sans clé)"}`]), prov, { onChange: async (v) => { prov = v; await fill(); }, attrs: { style: "max-width:220px", "aria-label": "Fournisseur" } });
  modelSel.addEventListener("change", () => onChange(qualifyModelId(prov, modelSel.value)));
  const refresh = button("", { variant: "ghost", size: "sm", iconName: "refresh", title: "Recharger la liste des modèles", onClick: () => fill(true) });
  await fill();
  return h("div", { class: "stack", style: { gap: "4px" }, ...attrs }, h("div", { class: "row row-wrap" }, provSel, h("div", { class: "grow", style: { minWidth: "200px" } }, modelSel), refresh, custom), status);
}

async function renderModels() {
  const cfg = await getGlobalConfig();
  const defaults = { default_model: cfg.default_model ?? DEFAULT_CONFIG.default_model, default_image_generation_model: cfg.default_image_generation_model ?? DEFAULT_CONFIG.default_image_generation_model, default_speech_generation_model: cfg.default_speech_generation_model ?? DEFAULT_CONFIG.default_speech_generation_model };
  const warn = h("p", { class: "muted small", hidden: defaults.default_model === DEFAULT_CONFIG.default_model }, icon("alert", "icon-sm"), " Les prompts par défaut sont optimisés pour ", h("code", {}, DEFAULT_CONFIG.default_model), ". Un autre modèle peut exiger d'ajuster certains prompts.");
  const creds = await getCredentials();
  const keyWarn = h("p", { class: "muted small", role: "status" });
  const refreshKeyWarn = () => {
    const prov = parseModelId(defaults.default_model).provider;
    if (hasCredentials(prov, creds)) { keyWarn.hidden = true; keyWarn.textContent = ""; return; }
    const alts = configuredProviders(creds, "structured-text");
    keyWarn.hidden = false; keyWarn.replaceChildren(icon("alert", "icon-sm"), ` Aucune clé enregistrée pour ${PROVIDERS.find((x) => x.id === prov)?.displayName ?? prov}. `, alts.length ? `À l'exécution, le fournisseur configuré ${alts[0].displayName} sera utilisé à sa place ; choisissez-le ici pour lever cet avertissement.` : "Ajoutez une clé dans Paramètres → Fournisseurs IA.");
  };
  refreshKeyWarn();
  return h("div", { class: "stack" },
    card("LLM par défaut", h("div", { class: "stack" }, h("p", { class: "muted small" }, "Modèle de repli pour la génération de texte et l'analyse visuelle. Chaque étape et chaque livre peuvent le surcharger."), await modelPicker(defaults.default_model, (v) => { defaults.default_model = v; refreshKeyWarn(); warn.hidden = v === DEFAULT_CONFIG.default_model; }), keyWarn, warn)),
    card("Modèles par défaut propres à chaque tâche", h("div", { class: "stack" }, field("Génération et retouche d'images", await modelPicker(defaults.default_image_generation_model, (v) => { defaults.default_image_generation_model = v; }, { kind: "image" })), field("Synthèse vocale (modèle OpenAI par défaut)", select([["gpt-4o-mini-tts", "gpt-4o-mini-tts (consignes de style)"], ["tts-1", "tts-1"], ["tts-1-hd", "tts-1-hd"]], defaults.default_speech_generation_model, { onChange: (v) => { defaults.default_speech_generation_model = v; } })))),
    h("div", { class: "row end" }, button("Enregistrer les modifications", { iconName: "check", onClick: async () => { await patchGlobalConfig(defaults); toast("Modèles enregistrés", { kind: "success" }); } })));
}

export function promptEditor({ name, source, origin, onSave, onReset, description, versions = [], onRestore }) {
  const ta = textarea({ value: source, rows: 22, class: "input textarea mono", spellcheck: "false", style: "min-height:420px;font-family:var(--mono);font-size:12.5px" });
  const vars = promptVariables(source);
  const originBadge = badge(origin === "book" ? "Surcharge du livre" : origin === "global" ? "Surcharge globale" : "Par défaut", origin === "default" ? "muted" : "accent");
  return h("div", { class: "stack" },
    h("div", { class: "row between row-wrap" }, h("div", {}, h("strong", { class: "mono" }, name), " ", originBadge, description ? h("div", { class: "muted small" }, description) : null), h("div", { class: "row" }, versions.length ? select(versions.map((v) => [v.version, `v${v.version}${v.isCurrent ? " (courante)" : ""} · ${new Date(v.createdAt).toLocaleString("fr-FR")}`]), versions.find((v) => v.isCurrent)?.version, { onChange: (v) => onRestore?.(Number(v)), attrs: { style: "width:auto" } }) : null, origin !== "default" ? button("Rétablir le défaut", { variant: "ghost", size: "sm", iconName: "history", onClick: onReset }) : null, button("Enregistrer", { size: "sm", iconName: "check", onClick: () => onSave(ta.value) }))),
    ta,
    h("details", { class: "acc" }, h("summary", {}, "Aide : syntaxe et variables disponibles"), h("p", { class: "small muted" }, "Syntaxe Liquid simplifiée : ", h("code", {}, "{{ variable }}"), ", ", h("code", {}, "{% if … %}{% elsif %}{% else %}{% endif %}"), ", ", h("code", {}, "{% for x in liste %}…{% endfor %}"), ", ", h("code", {}, "{% case %}{% when %}"), ", ", h("code", {}, '{% chat role: "system" %}…{% endchat %}'), ", ", h("code", {}, "{% image variable %}"), ", ", h("code", {}, '{% include "_partiel" %}'), ". Filtres : json, escape, default, join, upcase, downcase, size, truncate."), h("p", { class: "small" }, "Variables utilisées : ", vars.map((v) => h("code", { style: { marginRight: "6px" } }, v)))));
}

async function renderPrompts() {
  const globals = await getSetting("prompts", {});
  const templates = await getSetting("templates", {});
  let selected = "page_sectioning"; let mode = "prompts";
  const wrap = h("div", { class: "two-pane" });
  const list = h("div", { class: "stack scroll-y", style: { gap: "2px" } });
  const editor = h("div");
  const filter = textInput({ placeholder: "Filtrer…", onInput: () => renderList() });
  const renderList = () => {
    list.innerHTML = "";
    const names = mode === "prompts" ? listPromptNames() : Object.keys(DEFAULT_TEMPLATES);
    for (const n of names.filter((x) => x.includes(filter.value.trim().toLowerCase()))) list.appendChild(h("button", { type: "button", class: ["nav-link", n === selected && "active"], style: { fontFamily: "var(--mono)", fontSize: "12.5px", fontWeight: 500 }, onClick: () => { selected = n; renderList(); renderEditor(); } }, n, (mode === "prompts" ? globals[n] : templates[n]) ? badge("modifié", "accent") : null));
  };
  const renderEditor = () => {
    editor.innerHTML = "";
    const isPrompt = mode === "prompts";
    const src = isPrompt ? (globals[selected] ?? DEFAULT_PROMPTS[selected]) : (templates[selected] ?? DEFAULT_TEMPLATES[selected]);
    editor.appendChild(promptEditor({ name: selected, source: src, origin: (isPrompt ? globals[selected] : templates[selected]) ? "global" : "default", description: isPrompt ? PROMPT_DESCRIPTIONS[selected] : TEMPLATE_LABELS[selected],
      onSave: async (val) => { if (isPrompt) { await setGlobalPrompt(selected, val); globals[selected] = val; } else { await setGlobalTemplate(selected, val); templates[selected] = val; } toast("Enregistré", { kind: "success" }); renderList(); renderEditor(); },
      onReset: async () => { if (isPrompt) { await setGlobalPrompt(selected, null); delete globals[selected]; } else { await setGlobalTemplate(selected, null); delete templates[selected]; } toast("Valeur par défaut rétablie", { kind: "success" }); renderList(); renderEditor(); } }));
  };
  renderList(); renderEditor();
  wrap.appendChild(h("div", { class: "stack" }, segmented([["prompts", "Prompts"], ["templates", "Gabarits HTML"]], mode, (v) => { mode = v; selected = v === "prompts" ? "page_sectioning" : "two_column_render"; renderList(); renderEditor(); }), filter, list));
  wrap.appendChild(editor);
  return h("div", { class: "stack" }, h("p", { class: "muted" }, "Les prompts globaux s'appliquent à tous les livres ; chaque livre peut les surcharger depuis les paramètres de l'étape concernée (avec historique des versions)."), wrap);
}

async function renderSpeech() {
  const instr = { ...DEFAULT_SPEECH_INSTRUCTIONS, ...(await getSetting("speechInstructions", {})) };
  const profiles = { ...DEFAULT_CORE_TTS_PROFILES, ...(await getSetting("coreTtsProfiles", {})) };
  const voices = await getSetting("voices", {});
  const creds = await getCredentials();
  const instrBox = h("div", { class: "stack" });
  const renderInstr = () => { instrBox.innerHTML = ""; for (const [lang, text] of Object.entries(instr)) instrBox.appendChild(h("div", { class: "row", style: { alignItems: "flex-start" } }, h("code", { style: { minWidth: "60px", marginTop: "10px" } }, lang), h("div", { class: "grow" }, textarea({ value: text, rows: 2, onChange: (e) => { instr[lang] = e.target.value; } })), lang !== "default" ? button("", { variant: "ghost", iconName: "trash", onClick: () => { delete instr[lang]; renderInstr(); } }) : null)); };
  renderInstr();
  const profBox = h("div", { class: "stack" });
  const renderProf = () => { profBox.innerHTML = ""; for (const [lang, text] of Object.entries(profiles)) profBox.appendChild(h("div", { class: "row", style: { alignItems: "flex-start" } }, h("code", { style: { minWidth: "60px", marginTop: "10px" } }, lang), h("div", { class: "grow" }, textarea({ value: text, rows: 3, onChange: (e) => { profiles[lang] = e.target.value; } })), lang !== "default" ? button("", { variant: "ghost", iconName: "trash", onClick: () => { delete profiles[lang]; renderProf(); } }) : null)); };
  renderProf();
  const voiceBox = h("div", { class: "stack" });
  const renderVoices = () => { voiceBox.innerHTML = ""; for (const prov of ["openai", "azure", "gemini", "elevenlabs", "openrouter"]) { const map = { ...(DEFAULT_VOICES[prov] ?? {}), ...(voices[prov] ?? {}) }; voiceBox.appendChild(h("details", { class: "acc" }, h("summary", {}, PROVIDERS.find((p) => p.id === (prov === "gemini" ? "google" : prov))?.displayName ?? prov, " ", badge(`${Object.keys(map).length} langues`)), h("div", { class: "stack", style: { gap: "4px" } }, Object.entries(map).map(([lang, voice]) => h("div", { class: "row" }, h("code", { style: { minWidth: "60px" } }, lang), textInput({ value: typeof voice === "string" ? voice : voice.primary?.voice ?? "", onChange: (e) => { (voices[prov] ??= {})[lang] = e.target.value.trim(); } }), button("", { variant: "ghost", iconName: "trash", onClick: () => { if (voices[prov]) delete voices[prov][lang]; renderVoices(); } }))), h("div", { class: "row" }, textInput({ placeholder: "code langue (ex. fr-ca)", id: `nv-${prov}`, style: "max-width:160px" }), button("Ajouter", { size: "sm", variant: "secondary", onClick: () => { const l = document.getElementById(`nv-${prov}`).value.trim().toLowerCase(); if (l) { (voices[prov] ??= {})[l] = map.default ?? ""; renderVoices(); } } }), prov === "elevenlabs" && hasCredentials("elevenlabs", creds) ? button("Lister mes voix ElevenLabs", { size: "sm", variant: "secondary", onClick: async () => { const vs = await fetchElevenLabsVoices(creds); dialog({ title: "Voix ElevenLabs", body: h("ul", {}, vs.map((v) => h("li", {}, h("code", {}, v.id), " — ", v.name, " ", h("span", { class: "muted small" }, Object.values(v.labels ?? {}).join(", "))))) }); } }) : null, prov === "azure" && hasCredentials("azure", creds) ? button("Lister les voix Azure", { size: "sm", variant: "secondary", onClick: async () => { const vs = await fetchAzureVoices(creds); dialog({ title: "Voix Azure", size: "lg", body: h("div", { class: "scroll-y" }, h("ul", {}, vs.map((v) => h("li", {}, h("code", {}, v.id), ` — ${v.name} (${v.locale}, ${v.gender})`)))) }); } }) : null)))); } };
  renderVoices();
  return h("div", { class: "stack" },
    card("Consignes de lecture par langue", h("div", { class: "stack" }, h("p", { class: "muted small" }, "Instructions de style transmises aux modèles de synthèse vocale qui les acceptent (ex. gpt-4o-mini-tts, Gemini)."), instrBox, h("div", { class: "row" }, textInput({ placeholder: "code langue", id: "new-instr", style: "max-width:160px" }), button("Ajouter une langue", { size: "sm", variant: "secondary", onClick: () => { const l = document.getElementById("new-instr").value.trim().toLowerCase(); if (l) { instr[l] = instr.default; renderInstr(); } } }), h("span", { class: "grow" }), button("Enregistrer", { size: "sm", onClick: async () => { await setSetting("speechInstructions", instr); toast("Consignes enregistrées", { kind: "success" }); } })))),
    card("Profils de normalisation TTS", h("div", { class: "stack" }, h("p", { class: "muted small" }, "Guident la préparation du texte pour la parole (nombres, abréviations, LaTeX…)."), profBox, h("div", { class: "row" }, textInput({ placeholder: "code langue", id: "new-prof", style: "max-width:160px" }), button("Ajouter une langue", { size: "sm", variant: "secondary", onClick: () => { const l = document.getElementById("new-prof").value.trim().toLowerCase(); if (l) { profiles[l] = profiles.default; renderProf(); } } }), h("span", { class: "grow" }), button("Enregistrer", { size: "sm", onClick: async () => { await setSetting("coreTtsProfiles", profiles); toast("Profils enregistrés", { kind: "success" }); } })))),
    card("Correspondances de voix par langue", h("div", { class: "stack" }, h("p", { class: "muted small" }, "Voix utilisée par fournisseur et par langue quand le livre n'en précise pas."), voiceBox, h("div", { class: "row end" }, button("Enregistrer", { size: "sm", onClick: async () => { await setSetting("voices", voices); toast("Voix enregistrées", { kind: "success" }); } })))));
}

async function renderStorage() {
  const u = await estimateUsage();
  const books = await listBooks();
  return card("Stockage local", h("div", { class: "stack" }, h("p", {}, `Espace utilisé : ${formatBytes(u.usage)}${u.quota ? ` sur ${formatBytes(u.quota)} disponibles` : ""} · ${books.length} livre(s).`), h("div", { class: "progress" }, h("div", { class: "progress-bar", style: { width: `${u.quota ? Math.min(100, (u.usage / u.quota) * 100) : 0}%` } })), h("p", { class: "muted small" }, "Toutes les données (PDF, images, rendus, audios, journaux) sont stockées dans IndexedDB de ce navigateur. Exportez régulièrement vos projets (.zip) pour les sauvegarder ou les transférer."), h("div", { class: "row row-wrap" }, button("Demander un stockage persistant", { variant: "secondary", onClick: async () => { const ok = await navigator.storage?.persist?.(); toast(ok ? "Stockage persistant accordé" : "Le navigateur n'a pas accordé la persistance", { kind: ok ? "success" : "warning" }); } }), button("Exporter les paramètres", { variant: "secondary", iconName: "download", onClick: async () => { const data = { globalConfig: await getGlobalConfig(), prompts: await getSetting("prompts", {}), templates: await getSetting("templates", {}), speechInstructions: await getSetting("speechInstructions", {}), coreTtsProfiles: await getSetting("coreTtsProfiles", {}), voices: await getSetting("voices", {}), uiPrefs: await getUiPrefs() }; downloadBlob(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }), "adt-studio-parametres.json"); } }), button("Importer des paramètres", { variant: "secondary", iconName: "upload", onClick: async () => { const { pickFile } = await import("../../util.js"); const f = await pickFile({ accept: "application/json" }); if (!f) return; const data = JSON.parse(await f.text()); for (const [k, v] of Object.entries(data)) if (v) await setSetting(k, v); toast("Paramètres importés", { kind: "success" }); } }))));
}

async function renderAbout() {
  return h("div", { class: "stack" }, card("À propos d'ADT Studio Web", h("div", { class: "stack" },
    h("p", {}, h("strong", {}, "ADT Studio Web"), ` version ${APP_VERSION} — application statique, sans serveur, entièrement en français.`),
    h("p", { class: "muted" }, "Réimplémentation web d'ADT Studio (UNICEF, licence AGPL-3.0) : extraction de PDF, structuration par IA, mises en page accessibles, quiz, légendes, glossaire, table des matières, lecture facile, traductions, synthèse vocale, validation WCAG et exports Web / WebPub / EPUB 3 / SCORM."),
    h("p", { class: "muted small" }, "Projet d'origine : ", h("a", { href: "https://github.com/unicef/adt-studio", target: "_blank", rel: "noopener" }, "github.com/unicef/adt-studio"), " · Initiative ADT : ", h("a", { href: "https://www.accessibletextbooksforall.org/", target: "_blank", rel: "noopener" }, "accessibletextbooksforall.org")),
    h("p", { class: "muted small" }, "Bibliothèques embarquées : pdf.js, JSZip, axe-core, html2canvas, Temml, Tailwind CSS (version navigateur)."),
    h("div", { class: "row row-wrap" }, button("Redémarrer la visite guidée", { variant: "secondary", onClick: async () => { await setSetting("onboarded", false); navigate("/onboarding"); } }), button("Raccourcis clavier", { variant: "secondary", onClick: () => dialog({ title: "Raccourcis clavier", body: h("ul", {}, h("li", {}, h("kbd", { class: "kbd" }, "Ctrl/⌘ + K"), " Palette de commandes"), h("li", {}, h("kbd", { class: "kbd" }, "Ctrl/⌘ + Shift + D"), " Panneau de débogage du livre"), h("li", {}, h("kbd", { class: "kbd" }, "Échap"), " Fermer les dialogues")) }) })))));
}
