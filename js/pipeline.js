// Définition unique du pipeline (DAG à deux niveaux : étapes → sous-étapes).
// Tout le reste (barre latérale, cartes, exécuteur) en dérive.

export const PIPELINE = [
  {
    name: "extract", label: "Extraire", runningLabel: "Extraction", dependsOn: [],
    steps: [
      { name: "extract", label: "Extraction PDF", pageProgress: true },
      { name: "metadata", label: "Métadonnées", modelDefault: "llm", dependsOn: ["extract"] },
      { name: "book-summary", label: "Résumé du livre", modelDefault: "llm", dependsOn: ["metadata"] },
      { name: "book-outline", label: "Plan du livre", modelDefault: "llm", dependsOn: ["book-summary"] },
      { name: "image-filtering", label: "Filtrage des images", dependsOn: ["extract"], pageProgress: true },
      { name: "image-meaningfulness", label: "Pertinence des images", modelDefault: "llm", dependsOn: ["image-filtering"], pageProgress: true },
      { name: "image-segmentation", label: "Segmentation des images", modelDefault: "llm", dependsOn: ["image-meaningfulness"], pageProgress: true },
      { name: "image-cropping", label: "Recadrage des images", modelDefault: "llm", dependsOn: ["image-segmentation"], pageProgress: true },
    ],
  },
  {
    name: "sectioning", label: "Sectionnement", runningLabel: "Structuration des pages", dependsOn: ["extract"],
    steps: [
      { name: "page-sectioning", label: "Structuration des pages", modelDefault: "llm", pageProgress: true },
      { name: "translation", label: "Traduction", modelDefault: "llm", dependsOn: ["page-sectioning"], pageProgress: true },
    ],
  },
  {
    name: "storyboard", label: "Scénarimage", runningLabel: "Construction du scénarimage", dependsOn: ["sectioning"],
    steps: [{ name: "web-rendering", label: "Rendu web", modelDefault: "llm", pageProgress: true }],
  },
  {
    name: "quizzes", label: "Quiz", runningLabel: "Génération des quiz", dependsOn: ["storyboard"],
    steps: [{ name: "quiz-generation", label: "Génération de quiz", modelDefault: "llm" }],
  },
  {
    name: "captions", label: "Légendes d'images", runningLabel: "Description des images", dependsOn: ["storyboard"],
    steps: [{ name: "image-captioning", label: "Légendes d'images", modelDefault: "llm" }],
  },
  {
    name: "glossary", label: "Glossaire", runningLabel: "Génération du glossaire", dependsOn: ["storyboard"],
    steps: [{ name: "glossary", label: "Génération du glossaire", modelDefault: "llm" }],
  },
  {
    name: "toc", label: "Table des matières", runningLabel: "Génération de la table des matières", dependsOn: ["storyboard"],
    steps: [{ name: "toc-generation", label: "Génération de la table des matières", modelDefault: "llm" }],
  },
  {
    name: "easy-read", label: "Lecture facile", runningLabel: "Génération de la lecture facile", dependsOn: ["storyboard"],
    steps: [
      { name: "text-catalog", label: "Catalogue de texte" },
      { name: "easy-read", label: "Lecture facile", modelDefault: "llm", dependsOn: ["text-catalog"] },
    ],
  },
  {
    name: "translate", label: "Traduire", runningLabel: "Traduction", dependsOn: ["easy-read", "quizzes", "captions", "glossary", "toc"],
    steps: [
      { name: "catalog-translation", label: "Traduction du catalogue", modelDefault: "llm" },
      { name: "core-tts-catalog", label: "Normalisation TTS", modelDefault: "llm", dependsOn: ["catalog-translation"] },
      { name: "image-translation", label: "Traduction d'images", modelDefault: "image-generation", dependsOn: ["catalog-translation"] },
    ],
  },
  {
    name: "speech", label: "Parole", runningLabel: "Synthèse vocale", dependsOn: ["translate"],
    steps: [
      { name: "tts", label: "Synthèse vocale", modelDefault: "speech-generation" },
      { name: "word-timestamps", label: "Surlignage des mots", dependsOn: ["tts"] },
    ],
  },
  {
    name: "package", label: "Paquet", runningLabel: "Empaquetage", dependsOn: ["speech"],
    steps: [
      { name: "package-web", label: "Package web" },
      { name: "accessibility-assessment", label: "Évaluation de l'accessibilité", dependsOn: ["package-web"] },
    ],
  },
];

export const STAGE_ORDER = PIPELINE.map((s) => s.name);
export const STAGE_BY_NAME = Object.fromEntries(PIPELINE.map((s) => [s.name, s]));
export const STEP_TO_STAGE = Object.fromEntries(PIPELINE.flatMap((s) => s.steps.map((st) => [st.name, s.name])));
export const ALL_STEPS = PIPELINE.flatMap((s) => s.steps);
export const STEP_BY_NAME = Object.fromEntries(ALL_STEPS.map((s) => [s.name, s]));
export const ALL_STEP_NAMES = new Set(ALL_STEPS.map((s) => s.name));
export const PAGE_PROGRESS_STEPS = new Set(ALL_STEPS.filter((s) => s.pageProgress).map((s) => s.name));
export const BOOK_LEVEL_STAGES = new Set(PIPELINE.filter((s) => !s.steps.some((st) => st.pageProgress)).map((s) => s.name));
export const STEPS_BY_DEFAULT_MODEL_KIND = {
  llm: ALL_STEPS.filter((s) => s.modelDefault === "llm"),
  "image-generation": ALL_STEPS.filter((s) => s.modelDefault === "image-generation"),
  "speech-generation": ALL_STEPS.filter((s) => s.modelDefault === "speech-generation"),
};

/** Toutes les étapes qui dépendent (transitivement) d'une étape donnée. */
export function downstreamStages(stageName) {
  const out = new Set();
  const visit = (name) => {
    for (const st of PIPELINE) {
      if (st.dependsOn.includes(name) && !out.has(st.name)) { out.add(st.name); visit(st.name); }
    }
  };
  visit(stageName);
  return [...out];
}

/** Étapes prérequises (transitivement) d'une étape. */
export function upstreamStages(stageName) {
  const out = new Set();
  const visit = (name) => {
    for (const dep of STAGE_BY_NAME[name]?.dependsOn ?? []) {
      if (!out.has(dep)) { out.add(dep); visit(dep); }
    }
  };
  visit(stageName);
  return [...out];
}

// ── Configuration visuelle des vues du Studio (barre latérale) ──────────────
// Les « slugs » suivent l'application d'origine : book, puis les étapes du
// pipeline, puis les vues transverses (vidéo, validation, aperçu, export).

export const STAGE_GROUPS = [
  { key: "convert", label: "Conversion" },
  { key: "enhancements", label: "Enrichissements" },
  { key: "localization", label: "Localisation" },
  { key: "packaging", label: "Publication" },
];

export const STAGES = [
  { slug: "book", label: "Livre", runningLabel: "Chargement du livre", icon: "book-marked", hex: "#4b5563" },
  { slug: "extract", label: "Extraire", runningLabel: "Extraction", icon: "file-text", hex: "#2563eb", group: "convert", pipeline: "extract" },
  { slug: "sectioning", label: "Sectionnement", runningLabel: "Structuration des pages", icon: "network", hex: "#0284c7", group: "convert", pipeline: "sectioning" },
  { slug: "storyboard", label: "Scénarimage", runningLabel: "Construction du scénarimage", icon: "layout-grid", hex: "#7c3aed", group: "convert", pipeline: "storyboard" },
  { slug: "captions", label: "Légendes d'images", runningLabel: "Description des images", icon: "image", hex: "#0d9488", group: "enhancements", pipeline: "captions" },
  { slug: "quizzes", label: "Quiz", runningLabel: "Génération des quiz", icon: "help-circle", hex: "#ea580c", group: "enhancements", pipeline: "quizzes" },
  { slug: "glossary", label: "Glossaire", runningLabel: "Génération du glossaire", icon: "book-open", hex: "#65a30d", group: "enhancements", pipeline: "glossary" },
  { slug: "toc", label: "Table des matières", runningLabel: "Génération de la TdM", icon: "list", hex: "#d97706", group: "enhancements", pipeline: "toc" },
  { slug: "easy-read", label: "Lecture facile", runningLabel: "Génération de la lecture facile", icon: "file-text", hex: "#c026d3", group: "enhancements", pipeline: "easy-read" },
  { slug: "sign-language", label: "Vidéo", runningLabel: "Vidéo", icon: "video", hex: "#0891b2", group: "enhancements" },
  { slug: "translate", label: "Langues", runningLabel: "Traduction", icon: "languages", hex: "#db2777", group: "localization", pipeline: "translate" },
  { slug: "speech", label: "Parole", runningLabel: "Synthèse vocale", icon: "audio-lines", hex: "#e11d48", group: "localization", pipeline: "speech" },
  { slug: "validation", label: "Validation", runningLabel: "Validation", icon: "shield-check", hex: "#059669", group: "packaging" },
  { slug: "preview", label: "Aperçu", runningLabel: "Construction de l'aperçu", icon: "eye", hex: "#4b5563", group: "packaging", pipeline: "package" },
  { slug: "export", label: "Exporter", runningLabel: "Exportation", icon: "file-down", hex: "#4338ca", group: "packaging" },
];
export const STAGE_BY_SLUG = Object.fromEntries(STAGES.map((s) => [s.slug, s]));

export const STAGE_DESCRIPTIONS = {
  extract: "Extraire le texte et les images de chaque page du PDF.",
  sectioning: "Structurer chaque page en un arbre de sections et de nœuds pour le rendu.",
  storyboard: "Mettre en page le contenu extrait en pages HTML accessibles (gabarits ou IA).",
  quizzes: "Générer des quiz de compréhension à partir du contenu du livre.",
  captions: "Rédiger des descriptions d'images (texte alternatif) pour l'accessibilité.",
  glossary: "Construire un glossaire des termes clés et de leurs définitions.",
  toc: "Générer et personnaliser la table des matières de navigation.",
  "easy-read": "Générer et éditer les blocs de texte « Lecture facile » du lecteur.",
  translate: "Traduire le contenu du livre vers les langues de sortie.",
  speech: "Générer la narration audio du contenu du livre.",
  "sign-language": "Téléverser des vidéos (langue des signes, explications, compléments) et les associer aux sections et aux termes du glossaire.",
  validation: "Lancer les vérifications d'accessibilité du livre et la liste de contrôle du réviseur.",
  preview: "Empaqueter et prévisualiser l'application web finale (ADT).",
  export: "Exporter les ADT empaquetés (Web, WebPub, EPUB 3, SCORM) et le projet.",
};

export const STAGES_WITH_PAGES = new Set(["extract", "sectioning", "storyboard", "quizzes", "captions", "easy-read", "translate", "speech", "sign-language"]);
