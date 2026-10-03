// Assistant de création d'un livre : PDF → préréglage → informations → mise en page → traitement → langues.
import { h, button, icon, badge, dropZone, textInput, field, select, switchRow, segmented, spinner, toast } from "../dom.js";
import { renderAppLayout, mount, pageHead } from "../app-layout.js";
import { navigate } from "../../router.js";
import { pdfInfo } from "../../pdf/extract.js";
import { PRESETS, RENDER_STRATEGIES, STRATEGY_CATEGORIES, LANGUAGES, buildConfigOverrides } from "../../config.js";
import { createBook, listBooks, getCredentials } from "../../storage.js";
import { runStages } from "../../pipeline/runner.js";
import { LABEL_RE, slugify, formatBytes } from "../../util.js";
import { hasCredentials, PROVIDERS } from "../../llm/providers.js";

const STEPS = [
  { key: "info", title: "Informations de base", desc: "Nom du projet et étendue du traitement." },
  { key: "layout", title: "Mise en page visuelle", desc: "Choisissez la manière dont le contenu sera mis en forme." },
  { key: "processing", title: "Traitement du contenu", desc: "Détection des activités et traitement des images." },
  { key: "languages", title: "Langues", desc: "Langue d'édition et langues de sortie du livre." },
];

export async function renderWizard() {
  const v = { selectedPreset: null, label: "", file: null, pageCount: 0, startPage: "", endPage: "", outputLanguages: [], renderStrategy: "", pageGrouping: "", sectioningMode: "", activitiesGenerator: false, imageCropping: false, imageSegmentation: false, figureExtraction: "off", removeWatermarks: true, segmentationMinSide: "", imageFilterMinSide: 0, imageFilterMaxSide: 5000, editingLanguage: "", styleguide: "", scope: "whole" };
  const existing = (await listBooks()).map((b) => b.label);
  let phase = "upload"; let step = 0; let updateNav = () => {};
  const box = h("div", { class: "stack" });
  const applyPreset = (p) => { v.selectedPreset = p.id; Object.assign(v, p.recommendations, p.formDefaults ?? {}); if (p.id === "custom") Object.assign(v, { renderStrategy: "", pageGrouping: "", sectioningMode: "", imageFilterMinSide: 0, imageFilterMaxSide: 5000 }); };
  const render = () => { box.innerHTML = ""; if (phase === "upload") box.appendChild(uploadPhase()); else if (phase === "preset") box.appendChild(presetPhase()); else box.appendChild(stepsPhase()); };

  function uploadPhase() {
    const wrap = h("div", { class: "stack" });
    if (!v.file) wrap.appendChild(dropZone({ accept: "application/pdf,.pdf", label: "Déposez un PDF ici ou cliquez pour parcourir", hint: "PDF uniquement · les PDF natifs (non scannés) donnent les meilleurs résultats", onFiles: async (fs) => { const f = fs[0]; if (!f || !/pdf$/i.test(f.name) && f.type !== "application/pdf") return toast("Veuillez choisir un fichier PDF", { kind: "error" }); wrap.innerHTML = ""; wrap.appendChild(spinner("Lecture du PDF…")); try { const info = await pdfInfo(f); v.file = f; v.pageCount = info.pageCount; if (!v.label) v.label = slugify(info.title || f.name.replace(/\.pdf$/i, "")); if (existing.includes(v.label)) v.label += "-2"; render(); } catch (e) { toast("Impossible de lire ce PDF (fichier corrompu ou protégé par mot de passe ?)", { kind: "error" }); render(); } } }));
    else wrap.appendChild(h("div", { class: "card" }, h("div", { class: "card-body row", style: { gap: "14px", flexWrap: "wrap" } }, icon("file-text", "icon-lg"), h("div", { class: "grow" }, h("strong", {}, "PDF accepté"), h("div", { class: "muted small" }, `${v.file.name} · ${formatBytes(v.file.size)} · ${v.pageCount} pages`)), button("Remplacer le PDF", { variant: "secondary", onClick: () => { v.file = null; render(); } }), button("Retirer", { variant: "ghost", onClick: () => { v.file = null; render(); } }))));
    wrap.appendChild(h("div", { class: "row between" }, button("Retour", { variant: "ghost", iconName: "arrow-left", onClick: () => navigate("/") }), button("Continuer", { iconName: "arrow-right", disabled: !v.file, onClick: () => { phase = "preset"; render(); } })));
    return wrap;
  }
  function presetPhase() {
    const grid = h("div", { class: "grid grid-2" }, PRESETS.map((p) => h("button", { type: "button", class: ["option-card", v.selectedPreset === p.id && "selected"], onClick: () => { applyPreset(p); render(); } }, h("span", { class: "tile", style: { width: "42px", height: "42px", borderRadius: "12px", display: "grid", placeItems: "center", background: p.color, color: "#fff", flex: "none" } }, icon(p.id === "textbook" ? "book-open" : p.id === "storybook" ? "image" : p.id === "reference" ? "align-left" : "settings")), h("span", { class: "grow" }, h("strong", {}, p.title), h("span", { class: "muted" }, p.description), h("ul", { class: "small muted", style: { margin: "8px 0 0", paddingLeft: "18px" } }, p.recommendedFor.map((r) => h("li", {}, r)))))));
    return h("div", { class: "stack" }, h("h2", {}, "Choisir un préréglage"), h("p", { class: "muted" }, "Le préréglage fixe des valeurs recommandées ; vous pourrez tout ajuster aux étapes suivantes."), grid, h("div", { class: "row between" }, button("Retour", { variant: "ghost", iconName: "arrow-left", onClick: () => { phase = "upload"; render(); } }), button("Continuer", { iconName: "arrow-right", disabled: !v.selectedPreset, onClick: () => { phase = "steps"; step = 0; render(); } })));
  }
  function stepsPhase() {
    const s = STEPS[step];
    const nav = h("div", { class: "wizard-steps" }, STEPS.map((x, i) => h("span", { class: ["wizard-step", i === step && "on", i < step && "done"] }, i < step ? icon("check", "icon-sm") : h("span", {}, i + 1), x.title)));
    const content = step === 0 ? stepInfo() : step === 1 ? stepLayout() : step === 2 ? stepProcessing() : stepLanguages();
    const validity = () => { const valid = step === 0 ? LABEL_RE.test(v.label) && !existing.includes(v.label) : step === 1 ? !!(v.renderStrategy && v.pageGrouping && v.sectioningMode) : true; const hint = step === 0 ? (!LABEL_RE.test(v.label) ? "Saisissez un nom de projet valide" : existing.includes(v.label) ? "Un livre porte déjà ce nom" : null) : step === 1 ? (!v.renderStrategy ? "Choisissez une stratégie de rendu" : !v.pageGrouping ? "Choisissez un mode de regroupement" : !v.sectioningMode ? "Choisissez un mode de section" : null) : null; return { valid, hint }; };
    const hintEl = h("span", { class: "muted small" });
    const nextBtn = step < STEPS.length - 1 ? button("Étape suivante", { iconName: "arrow-right", onClick: () => { step++; render(); } }) : button("Créer l'ADT", { iconName: "sparkles", size: "lg", onClick: create });
    updateNav = () => { const { valid, hint } = validity(); nextBtn.disabled = !valid; hintEl.textContent = hint ?? ""; };
    updateNav();
    return h("div", { class: "stack" }, nav, h("div", { class: "row between" }, h("div", {}, h("h2", {}, `Étape ${step + 1} sur ${STEPS.length} · ${s.title}`), h("p", { class: "muted" }, s.desc)), h("div", { class: "muted small" }, "Préréglage : ", badge(PRESETS.find((p) => p.id === v.selectedPreset)?.title ?? "—", "accent"), " ", button("Changer", { variant: "ghost", size: "sm", onClick: () => { phase = "preset"; render(); } }))), content,
      h("div", { class: "row between" }, button("Retour", { variant: "ghost", iconName: "arrow-left", onClick: () => { if (step === 0) { phase = "preset"; } else step--; render(); } }), h("div", { class: "row" }, hintEl, nextBtn)));
  }
  function stepInfo() {
    const range = h("div", { class: "stack", hidden: v.scope !== "range" });
    const renderRange = () => { range.innerHTML = ""; range.appendChild(h("div", { class: "grid grid-2" }, field("Page initiale", textInput({ type: "number", min: 1, max: v.pageCount, value: v.startPage || 1, onInput: (e) => { v.startPage = e.target.value; } })), field("Page finale", textInput({ type: "number", min: 1, max: v.pageCount, value: v.endPage || v.pageCount, onInput: (e) => { v.endPage = e.target.value; } })))); range.hidden = v.scope !== "range"; };
    renderRange();
    return h("div", { class: "stack" },
      h("div", { class: "card" }, h("div", { class: "card-body row", style: { gap: "14px" } }, icon("file-text"), h("div", { class: "grow" }, h("strong", {}, v.file.name), h("div", { class: "muted small" }, `${v.pageCount} pages`)), button("Remplacer", { variant: "secondary", size: "sm", onClick: () => { phase = "upload"; v.file = null; render(); } }))),
      field("Nom du projet", textInput({ value: v.label, placeholder: "mon-livre", onInput: (e) => { v.label = e.target.value.trim(); updateNav(); } }), { hint: "Identifiant unique : lettres, chiffres, « . », « - » et « _ » ; commence par une lettre ou un chiffre." }),
      h("div", { class: "field" }, h("span", { class: "field-label" }, "Quelle partie du livre traiter ?"), segmented([["whole", "Tout le livre"], ["range", "Plage de pages"], ["split", "Diviser en parties"]], v.scope, (x) => { v.scope = x; renderRange(); }), h("span", { class: "field-hint" }, v.scope === "split" ? "Le livre entier est la référence ; vous distribuerez des plages de pages à des contributeurs et fusionnerez leurs parties plus tard." : v.scope === "range" ? "Seules les pages de la plage seront traitées sur cette machine." : "Toutes les pages seront traitées ici.")),
      range);
  }
  function stepLayout() {
    const preset = PRESETS.find((p) => p.id === v.selectedPreset);
    const cards = (cat) => RENDER_STRATEGIES.filter((r) => r.category === cat && (preset?.renderStrategies ?? RENDER_STRATEGIES.map((x) => x.id)).includes(r.id)).map((r) => h("button", { type: "button", class: ["option-card", v.renderStrategy === r.id && "selected"], onClick: () => { v.renderStrategy = r.id; render(); } }, icon(r.id === "llm" ? "sparkles" : r.id === "llm-overlay" ? "layers" : r.id === "single_column" ? "align-left" : r.id === "fixed_layout" ? "image" : "columns"), h("span", {}, h("strong", {}, r.title, preset?.recommendedStrategies?.includes(r.id) ? badge("Recommandé", "accent") : null), h("span", { class: "muted" }, r.description))));
    return h("div", { class: "stack" },
      h("div", { class: "field" }, h("span", { class: "field-label" }, "Stratégie de rendu"), h("p", { class: "muted small" }, STRATEGY_CATEGORIES.template.label, " — ", STRATEGY_CATEGORIES.template.description), h("div", { class: "grid grid-2" }, cards("template")), h("p", { class: "muted small", style: { marginTop: "8px" } }, STRATEGY_CATEGORIES.ai.label, " — ", STRATEGY_CATEGORIES.ai.description), h("div", { class: "grid grid-2" }, cards("ai"))),
      h("div", { class: "field" }, h("span", { class: "field-label" }, "Mode de regroupement des pages"), h("div", { class: "grid grid-2" }, [["single", "Page unique", "Chaque page devient son propre écran."], ["spread", "Double page", "Les pages en vis-à-vis sont réunies en un écran large."]].map(([id, t, d]) => h("button", { type: "button", class: ["option-card", v.pageGrouping === id && "selected"], onClick: () => { v.pageGrouping = id; render(); } }, icon(id === "spread" ? "columns" : "square"), h("span", {}, h("strong", {}, t, preset?.recommendations?.pageGrouping === id ? badge("Recommandé", "accent") : null), h("span", { class: "muted" }, d)))))),
      h("div", { class: "field" }, h("span", { class: "field-label" }, "Mode de section"), h("div", { class: "grid grid-2" }, [["page", "Par page", "La page entière forme une seule section."], ["dynamic", "Dynamique", "La page est scindée quand plusieurs activités distinctes sont détectées."]].map(([id, t, d]) => h("button", { type: "button", class: ["option-card", v.sectioningMode === id && "selected"], onClick: () => { v.sectioningMode = id; render(); } }, icon(id === "dynamic" ? "split" : "square"), h("span", {}, h("strong", {}, t, preset?.recommendations?.sectioningMode === id ? badge("Recommandé", "accent") : null), h("span", { class: "muted" }, d)))))));
  }
  function stepProcessing() {
    return h("div", { class: "stack" },
      h("div", { class: "card" }, h("div", { class: "card-body" }, h("h3", {}, "Activités"), switchRow("Convertisseur d'activités", v.activitiesGenerator, (x) => { v.activitiesGenerator = x; }, { hint: "Transforme les exercices du livre (QCM, vrai/faux, texte à trous, association…) en activités HTML interactives.", disabled: v.renderStrategy === "fixed_layout" }))),
      h("div", { class: "card" }, h("div", { class: "card-body" }, h("h3", {}, "Images"), switchRow("Recadrage intelligent", v.imageCropping, (x) => { v.imageCropping = x; }, { hint: "Un modèle de vision retire bordures et fragments autour de chaque image." }), switchRow("Segmentation des images", v.imageSegmentation, (x) => { v.imageSegmentation = x; render(); }, { hint: "Découpe les planches composites en images distinctes." }), v.imageSegmentation ? field("Dimension minimale des segments (px)", textInput({ type: "number", min: 0, value: v.segmentationMinSide, placeholder: "Aucune", onInput: (e) => { v.segmentationMinSide = e.target.value; } })) : null,
        h("div", { class: "field", style: { marginTop: "10px" } }, h("span", { class: "field-label" }, "Extraction de figures"), segmented([["off", "Désactivée"], ["auto", "Automatique"], ["all", "Toutes"]], v.figureExtraction, (x) => { v.figureExtraction = x; }), h("span", { class: "field-hint" }, "Automatique : les figures composites (texte + dessin) sont conservées en image seulement si le HTML ne peut pas les représenter fidèlement.")),
        h("div", { class: "field", style: { marginTop: "10px" } }, h("span", { class: "field-label" }, `Taille des images conservées : ${v.imageFilterMinSide} – ${v.imageFilterMaxSide} px`), h("div", { class: "grid grid-2" }, field("Taille minimale (px)", textInput({ type: "number", min: 0, max: 10000, value: v.imageFilterMinSide, onInput: (e) => { v.imageFilterMinSide = Number(e.target.value); } })), field("Taille maximale (px)", textInput({ type: "number", min: 0, max: 10000, value: v.imageFilterMaxSide, onInput: (e) => { v.imageFilterMaxSide = Number(e.target.value); } })))))),
      h("div", { class: "card" }, h("div", { class: "card-body" }, h("h3", {}, "Filigranes"), switchRow("Supprimer les filigranes", v.removeWatermarks, (x) => { v.removeWatermarks = x; }, { hint: "Détecte les textes identiques répétés sur la plupart des pages (« SPÉCIMEN », mentions de droits…) et les retire du texte extrait." }))));
  }
  function stepLanguages() {
    const langOptions = [["", "Langue du livre (détectée)"], ...LANGUAGES];
    const chips = h("div", { class: "row row-wrap" });
    const renderChips = () => { chips.innerHTML = ""; for (const l of v.outputLanguages) chips.appendChild(h("span", { class: "chip" }, LANGUAGES.find((x) => x[0] === l)?.[1] ?? l, h("button", { type: "button", "aria-label": `Retirer ${l}`, onClick: () => { v.outputLanguages = v.outputLanguages.filter((x) => x !== l); renderChips(); } }, icon("x", "icon-sm")))); if (!v.outputLanguages.length) chips.appendChild(h("span", { class: "muted small" }, "Aucune langue supplémentaire : le livre ne sera produit que dans sa langue d'origine.")); };
    renderChips();
    return h("div", { class: "stack" },
      field("Langue d'édition", select(langOptions, v.editingLanguage, { onChange: (x) => { v.editingLanguage = x; } }), { hint: "Langue dans laquelle vous éditez le contenu. Vide = langue du livre." }),
      h("div", { class: "field" }, h("span", { class: "field-label" }, "Langues de sortie"), h("div", { class: "row" }, select([["", "Ajouter une langue…"], ...LANGUAGES.filter((l) => !v.outputLanguages.includes(l[0]))], "", { onChange: (x) => { if (x && !v.outputLanguages.includes(x)) { v.outputLanguages.push(x); renderChips(); render(); } } })), chips, h("span", { class: "field-hint" }, "Chaque langue de sortie reçoit traductions, audio et glossaire.")));
  }
  async function create() {
    const btn = box.querySelector(".btn-lg"); if (btn) { btn.disabled = true; btn.textContent = "Création…"; }
    try {
      const config = buildConfigOverrides(v);
      const st = await createBook({ label: v.label, pdfBlob: v.file, pdfName: v.file.name, config, title: v.file.name.replace(/\.pdf$/i, "") });
      toast("Livre créé", { kind: "success" });
      navigate(`/books/${v.label}/book`);
      if (v.scope !== "split") { runStages(v.label, "extract", "extract", { onlySteps: ["extract"] }).catch((e) => toast(e.message, { kind: "error" })); }
    } catch (e) { toast(e.message, { kind: "error" }); if (btn) { btn.disabled = false; btn.textContent = "Créer l'ADT"; } }
  }
  render();
  mount(renderAppLayout(h("div", { class: "stack" }, pageHead("Convertir un PDF", "Créez un livre numérique accessible à partir d'un fichier PDF."), box)));
}
