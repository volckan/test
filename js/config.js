// Configuration par défaut du pipeline (équivalent de config.yaml), en français.

export const DEFAULT_LLM_MODEL_ID = "openai:gpt-5.4";
export const DEFAULT_IMAGE_GENERATION_MODEL_ID = "openai:gpt-image-2";
export const DEFAULT_SPEECH_MODEL_ID = "gpt-4o-mini-tts";
export const DEFAULT_LLM_MAX_RETRIES = 5;

export const STRUCTURE_TYPES = {
  group: "Conteneur générique liant des feuilles de texte voisines formant une unité visuelle (paragraphe multi-phrases, groupe d'étiquettes). À utiliser dès que deux feuilles ou plus vont ensemble visuellement sans qu'un conteneur plus spécifique ne convienne.",
  heading: "Bloc de titre : contient une ou plusieurs feuilles formant ensemble un seul titre.",
  paragraph: "Paragraphe de prose. Les enfants sont des feuilles de texte (rôle « text » en général) dans l'ordre de lecture.",
  list: "Liste ordonnée ou non. Les enfants sont des conteneurs list_item.",
  list_item: "Un élément de liste. Les enfants sont la ou les feuilles composant l'élément.",
  table: "Tableau de données. Les enfants sont des conteneurs table_row, de haut en bas.",
  table_row: "Une ligne de tableau. Les enfants sont des conteneurs table_cell, de gauche à droite.",
  table_cell: "Une cellule de tableau. Peut être vide (sans enfant) pour conserver l'alignement des colonnes.",
  sidebar: "Encadré, astuce ou aparté visuellement séparé. Les enfants sont les feuilles et conteneurs internes.",
  panel: "Panneau bordé ou visuellement séparé qui n'est pas un encadré (panneau d'information décoré, mise en page encadrée pleine page).",
  activity: "Bloc d'activité ou d'exercice complet. Les enfants comprennent les feuilles d'introduction (activity_number / activity_instruction / activity_question) et un ou plusieurs conteneurs activity_option.",
  activity_option: "Une option ou un choix de réponse dans une activité. Toujours un conteneur, même pour une seule feuille de texte.",
  image_group: "Conteneur liant une image à son contenu associé (légende, étiquette, texte superposé). Le PREMIER enfant DOIT être une feuille de rôle « image » dont image_id référence une des images extraites, suivi des feuilles de légende/étiquette. Une image seule sans contenu associé est émise comme feuille « image » nue.",
  preformatted: "Bloc de texte préformaté où les retours à la ligne comptent (strophes, code, dispositions ASCII). Les enfants sont les feuilles de texte, une par ligne.",
};

export const ROLE_TYPES = {
  chapter_title: "Niveau de titre le plus élevé (H1) : numéro ou titre de chapitre, titre d'unité, ou autre titre d'affichage de premier niveau. Utiliser le même rôle pour tous les titres équivalents du livre.",
  section_heading: "Deuxième niveau de titre (H2) : section majeure du chapitre ou de l'unité courante.",
  subheading: "Troisième niveau de titre (H3) : sous-section, titre mineur, titre d'encadré ou d'activité imbriqué sous une section.",
  heading: "Titre de niveau 4, 5 ou 6 (renseigner heading_level), ou titre hérité dont la hiérarchie ne peut être déterminée. Les niveaux 1–3 utilisent chapter_title, section_heading ou subheading.",
  text: "Prose ou texte narratif ordinaire.",
  math: "Expression mathématique (notation LaTeX).",
  image: "Feuille image référençant une image extraite. Porte « image_id » (un des identifiants listés). Pas de « text ». Feuille nue dans l'ordre de lecture si l'image est seule ; dans un image_group si elle a un contenu associé.",
  caption: "Légende liée à une image ou une figure.",
  label: "Courte étiquette, mention ou annotation.",
  activity_number: "Numérotation d'une activité (ex. « 1. », « A) »).",
  activity_instruction: "Consigne générale pour l'apprenant au niveau de l'activité.",
  activity_question: "Question ou énoncé de l'activité.",
  activity_fill_in_the_blank: "Texte avec des blancs à compléter (utiliser ___ pour les blancs).",
  page_number: "Numéro de page.",
  header: "En-tête courant.",
  footer: "Pied de page courant.",
  quote: "Citation.",
  book_metadata: "Éditeur, droits d'auteur, ISBN, édition ou métadonnées d'auteur.",
  watermark: "Texte décoratif, de statut ou de restriction d'usage apposé sur la page (« BROUILLON », « SPÉCIMEN », « CONFIDENTIEL », mention de droits, étiquette diagonale répétée). Souvent pâle, teinté, incliné, identique sur chaque page. Ne fait pas partie du contenu.",
};

export const SECTION_TYPES = {
  front_cover: "Toute première page du livre montrant le titre, l'auteur et l'illustration de couverture. Seule la première page est admissible.",
  inside_cover: "Page juste après la couverture ou avant la quatrième de couverture : éditeur, ISBN, droits, édition.",
  back_cover: "Toute dernière page du livre, souvent avec un résumé, un code-barres ou le logo de l'éditeur.",
  separator: "Page de séparation entre les grandes parties du livre : titre, numéro de chapitre ou élément décoratif seulement.",
  credits: "Page listant les contributeurs, remerciements, crédits photo ou financeurs. Distincte d'inside_cover.",
  foreword: "Page d'introduction : préface, mot de l'auteur, « à propos de ce livre ». Avant le contenu principal.",
  table_of_contents: "Page listant les titres de chapitres ou de sections avec leurs numéros de page.",
  boxed_text: "Texte présenté dans un cadre, une bordure ou une zone colorée visible : astuces, définitions, faits clés.",
  text_only: "Section de lecture ne contenant que du texte : ni image, ni activité.",
  text_and_single_image: "Section de lecture contenant du texte accompagné d'exactement une image.",
  text_and_images: "Section de lecture contenant du texte accompagné de deux images ou plus.",
  images_only: "Section ne contenant que des images, sans texte signifiant (les légendes seules ne comptent pas).",
  activity_matching: "Associer des éléments en relation stricte un-à-un. Chaque élément d'un côté correspond à exactement un élément de l'autre ; même nombre des deux côtés.",
  activity_fill_in_a_table: "Compléter un tableau en remplissant des cellules manquantes.",
  activity_multiple_choice: "Choisir la bonne réponse parmi des options prédéfinies ; une réponse par question.",
  activity_multi_select: "Cocher toutes les options qui s'appliquent ; plusieurs options peuvent être correctes (cases à cocher).",
  activity_underline_text: "Souligner un ou plusieurs mots, expressions ou phrases directement dans le texte ; l'apprenant sélectionne des segments de texte.",
  activity_true_false: "Décider si chaque affirmation est vraie ou fausse.",
  activity_open_ended_answer: "Rédiger une réponse libre sans options prédéfinies (phrase, explication, court texte).",
  activity_fill_in_the_blank: "Compléter des phrases en fournissant les mots ou valeurs manquants.",
  activity_sorting: "Classer plusieurs éléments dans des catégories (plus d'éléments que de catégories ; relation plusieurs-à-un).",
  activity_ordering: "Ranger tous les éléments dans une seule séquence correcte (chronologique, numérique, procédurale…).",
  activity_other: "Activité interactive ne correspondant à aucun type spécifique. À utiliser SEULEMENT quand la mécanique d'apprentissage est réellement unique (dessin libre, bricolage, mouvement).",
  other: "Toute section ne correspondant clairement à aucun type ci-dessus. En dernier recours seulement.",
};

export const ACTIVITY_SECTION_TYPES = Object.keys(SECTION_TYPES).filter((k) => k.startsWith("activity_"));

export const SECTION_TYPE_LABELS = {
  front_cover: "Couverture", inside_cover: "Page de garde", back_cover: "Quatrième de couverture", separator: "Séparateur",
  credits: "Crédits", foreword: "Avant-propos", table_of_contents: "Table des matières", boxed_text: "Texte encadré",
  text_only: "Texte seul", text_and_single_image: "Texte et une image", text_and_images: "Texte et images", images_only: "Images seules",
  activity_matching: "Activité : association", activity_fill_in_a_table: "Activité : compléter un tableau",
  activity_multiple_choice: "Activité : choix multiple", activity_multi_select: "Activité : sélection multiple",
  activity_underline_text: "Activité : souligner le texte", activity_true_false: "Activité : vrai ou faux",
  activity_open_ended_answer: "Activité : réponse libre", activity_fill_in_the_blank: "Activité : texte à trous",
  activity_sorting: "Activité : classement", activity_ordering: "Activité : mise en ordre", activity_other: "Activité : autre",
  other: "Autre", "fixed-layout-page": "Page à mise en page fixe",
};

export const ROLE_LABELS = {
  chapter_title: "Titre de chapitre (H1)", section_heading: "Titre de section (H2)", subheading: "Sous-titre (H3)", heading: "Titre (H4–H6)",
  text: "Texte", math: "Mathématiques", image: "Image", caption: "Légende", label: "Étiquette", activity_number: "Numéro d'activité",
  activity_instruction: "Consigne", activity_question: "Question", activity_fill_in_the_blank: "Texte à trous", page_number: "Numéro de page",
  header: "En-tête", footer: "Pied de page", quote: "Citation", book_metadata: "Métadonnées", watermark: "Filigrane",
};
export const STRUCTURE_LABELS = {
  group: "Groupe", heading: "Bloc de titre", paragraph: "Paragraphe", list: "Liste", list_item: "Élément de liste", table: "Tableau",
  table_row: "Ligne", table_cell: "Cellule", sidebar: "Encadré", panel: "Panneau", activity: "Activité", activity_option: "Option",
  image_group: "Groupe image", preformatted: "Préformaté",
};

function activityStrategy(name, withAnswers = true) {
  const cfg = { prompt: name, max_retries: 5, timeout: 180, temperature: 0.3, visual_refinement: { enabled: false, max_iterations: 3 } };
  if (withAnswers) cfg.answer_prompt = `${name}_answers`;
  return { render_type: "activity", config: cfg };
}

export const DEFAULT_RENDER_STRATEGIES = {
  llm: { render_type: "llm", config: { prompt: "web_generation_html", max_retries: 5, timeout: 180, temperature: 0.3, visual_refinement: { enabled: false, max_iterations: 3 } } },
  "llm-overlay": { render_type: "llm", config: { prompt: "web_generation_html_overlay", max_retries: 25, timeout: 180, temperature: 0.3, visual_refinement: { enabled: false, max_iterations: 3 } } },
  two_column: { render_type: "template", config: { template: "two_column_render" } },
  two_column_story: { render_type: "template", config: { template: "two_column_story" } },
  one_column: { render_type: "template", config: { template: "one_column_render" } },
  single_column: { render_type: "template", config: { template: "one_column_render" } },
  fixed_layout: { render_type: "fixed_layout" },
  activity_multiple_choice: activityStrategy("activity_multiple_choice"),
  activity_multi_select: activityStrategy("activity_multi_select"),
  activity_underline_text: activityStrategy("activity_underline_text"),
  activity_true_false: activityStrategy("activity_true_false"),
  activity_fill_in_the_blank: activityStrategy("activity_fill_in_the_blank"),
  activity_fill_in_a_table: activityStrategy("activity_fill_in_a_table"),
  activity_matching: activityStrategy("activity_matching"),
  activity_sorting: activityStrategy("activity_sorting"),
  activity_ordering: activityStrategy("activity_ordering", false),
  activity_open_ended_answer: activityStrategy("activity_open_ended_answer", false),
};

export const DEFAULT_SECTION_RENDER_STRATEGIES = Object.fromEntries(
  ACTIVITY_SECTION_TYPES.filter((t) => t !== "activity_other").map((t) => [t, t]),
);

export const DEFAULT_CONFIG = {
  default_model: DEFAULT_LLM_MODEL_ID,
  default_image_generation_model: DEFAULT_IMAGE_GENERATION_MODEL_ID,
  default_speech_generation_model: DEFAULT_SPEECH_MODEL_ID,
  book_outline: { prompt: "book_outline", timeout: 300 },
  core_tts: { prompt: "core_tts_preparation", latex_to_speech: true, language_normalization: true },
  structure_types: STRUCTURE_TYPES,
  role_types: ROLE_TYPES,
  section_types: SECTION_TYPES,
  metadata: { prompt: "metadata_extraction" },
  book_summary: { prompt: "book_summary" },
  page_sectioning: { prompt: "page_sectioning", max_refinements: 0, mode: "dynamic" },
  translation: { prompt: "translation" },
  image_meaningfulness: { prompt: "image_meaningfulness" },
  image_cropping: { prompt: "image_cropping" },
  image_segmentation: { prompt: "image_segmentation", min_side: 100 },
  default_render_strategy: "two_column",
  render_strategies: DEFAULT_RENDER_STRATEGIES,
  section_render_strategies: DEFAULT_SECTION_RENDER_STRATEGIES,
  storyboard_effort: "medium",
  storyboard_activity_mode: "dynamic",
  reflowable_font: "auto",
  quiz_generation: { prompt: "quiz_generation", match_book_style: true, pages_per_quiz: 1, questions_per_quiz: 1, question_types: ["multiple_choice"], quiz_section_types: ["boxed_text", "text_only", "text_and_single_image", "text_and_images", "images_only"] },
  glossary: { prompt: "glossary" },
  glossary_amount: "standard",
  glossary_user_prompt: "",
  glossary_seed_terms: [],
  toc_generation: { prompt: "toc_generation" },
  toc_mode: "extract",
  easy_read: { prompt: "easy_read", enabled: true, batch_size: 12, tts: true },
  image_captioning: { prompt: "image_captioning" },
  image_captioning_grade_level: "early",
  image_captioning_user_prompt: "",
  image_translation: { prompt: "image_translation", enabled: false, selected_image_ids: [] },
  pruned_role_types: ["header", "footer", "page_number", "watermark"],
  pruned_section_types: ["back_cover", "credits", "inside_cover"],
  disabled_section_types: [],
  concurrency: 4,
  image_filters: { min_side: 100, max_side: 5000, min_stddev: 2, meaningfulness: true, cropping: false, segmentation: false },
  figure_extraction_mode: "off",
  remove_watermarks: false,
  apply_body_background: true,
  generate_activities: true,
  spread_mode: false,
  spread_pairs: [],
  editing_language: "fr",
  output_languages: [],
  book_format: ["web"],
  speech: {
    enabled: true,
    default_provider: "openai",
    model: DEFAULT_SPEECH_MODEL_ID,
    format: "mp3",
    word_highlighting: true,
    batch_by_page: false,
    excluded_categories: [],
    excluded_text_ids: [],
    providers: { openai: { model: DEFAULT_SPEECH_MODEL_ID }, gemini: { model: "gemini-2.5-flash-preview-tts" }, elevenlabs: { model: "eleven_multilingual_v2" }, azure: {}, openrouter: { model: "openai/gpt-4o-mini-tts" } },
    primary_voices: {},
    secondary_voices: {},
    elevenlabs_stability: 0.7, elevenlabs_similarity_boost: 0.5, elevenlabs_style: 0, elevenlabs_use_speaker_boost: true,
  },
  default_settings: { dock_layout: { width: "full", position: "bottom", align: "spread" }, theme: "system", icon_size: "md", reduce_motion: false },
  locked_settings: [],
  accessibility_assessment: { run_only_tags: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"], disabled_rules: [] },
  reviewer_validation: {},
  translation_evaluation: { enable_translation_evaluation: false, strictness: "balanced", severity_threshold: "medium", temperature: 0, max_retries: 3 },
  epub_glossary: { mode: "word", page_placements: ["end"] },
  agents: {},
  layout_type: "textbook",
  styleguide: "",
};

export const LANGUAGES = [
  ["fr", "Français"], ["en", "Anglais"], ["es", "Espagnol"], ["pt", "Portugais"], ["pt-BR", "Portugais (Brésil)"], ["de", "Allemand"],
  ["it", "Italien"], ["nl", "Néerlandais"], ["sq", "Albanais"], ["ar", "Arabe"], ["zh", "Chinois"], ["ja", "Japonais"], ["ko", "Coréen"],
  ["ru", "Russe"], ["uk", "Ukrainien"], ["pl", "Polonais"], ["ro", "Roumain"], ["tr", "Turc"], ["hi", "Hindi"], ["bn", "Bengali"],
  ["ur", "Ourdou"], ["fa", "Persan"], ["sw", "Swahili"], ["am", "Amharique"], ["ha", "Haoussa"], ["yo", "Yoruba"], ["zu", "Zoulou"],
  ["af", "Afrikaans"], ["id", "Indonésien"], ["ms", "Malais"], ["vi", "Vietnamien"], ["th", "Thaï"], ["fil", "Filipino"], ["ta", "Tamoul"],
  ["te", "Télougou"], ["si", "Singhalais"], ["ne", "Népalais"], ["dz", "Dzongkha"], ["el", "Grec"], ["he", "Hébreu"], ["hu", "Hongrois"],
  ["cs", "Tchèque"], ["sk", "Slovaque"], ["sv", "Suédois"], ["no", "Norvégien"], ["da", "Danois"], ["fi", "Finnois"], ["ca", "Catalan"],
  ["eu", "Basque"], ["ht", "Créole haïtien"], ["wo", "Wolof"], ["ln", "Lingala"], ["mg", "Malgache"],
];
export const LANGUAGE_NAMES = Object.fromEntries(LANGUAGES);
export function languageName(code) {
  if (!code) return "";
  return LANGUAGE_NAMES[code] ?? LANGUAGE_NAMES[code.split("-")[0]] ?? code;
}

export const OPENAI_TTS_VOICES = ["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer", "verse"];
export const GEMINI_TTS_VOICES = ["Achernar", "Achird", "Algenib", "Algieba", "Alnilam", "Aoede", "Autonoe", "Callirrhoe", "Charon", "Despina", "Enceladus", "Erinome", "Fenrir", "Gacrux", "Iapetus", "Kore", "Laomedeia", "Leda", "Orus", "Puck", "Pulcherrima", "Rasalgethi", "Sadachbia", "Sadaltager", "Schedar", "Sulafat", "Umbriel", "Vindemiatrix", "Zephyr", "Zubenelgenubi"];
export const DEFAULT_ELEVENLABS_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
export const ELEVENLABS_SHIPPED_VOICE_NAMES = { "21m00Tcm4TlvDq8ikWAM": "Rachel", QK4xDwo9ESPHA4JNUpX3: "Tomás" };

export const DEFAULT_VOICES = {
  openai: { default: "alloy", en: "alloy", fr: "coral", es: "coral", pt: "coral", "pt-br": "coral", de: "coral", it: "coral", ar: "coral", sq: "coral" },
  azure: { default: "en-US-JennyNeural", fr: "fr-FR-DeniseNeural", "fr-ca": "fr-CA-SylvieNeural", en: "en-US-JennyNeural", es: "es-MX-DaliaNeural", "es-es": "es-ES-ElviraNeural", pt: "pt-PT-RaquelNeural", "pt-br": "pt-BR-FranciscaNeural", de: "de-DE-KatjaNeural", it: "it-IT-ElsaNeural", ar: "ar-SA-ZariyahNeural", sq: "sq-AL-AnilaNeural", sw: "sw-KE-ZuriNeural", wo: "en-US-JennyNeural" },
  gemini: { default: "Kore" },
  openrouter: { default: "alloy", en: "alloy", fr: "coral", es: "coral", pt: "coral", "pt-br": "coral", de: "coral", it: "coral" },
  elevenlabs: { default: DEFAULT_ELEVENLABS_VOICE_ID, "es-uy": "QK4xDwo9ESPHA4JNUpX3" },
};

export const DEFAULT_SPEECH_INSTRUCTIONS = {
  default: "Parle d'un ton enjoué et positif, à un rythme calme adapté à des enfants.",
  fr: "Parle en français avec un ton chaleureux et positif, articulation claire, rythme calme adapté à l'éducation.",
  "fr-ca": "Parle en français québécois avec la prononciation et l'intonation typiques du Québec. Ton chaleureux et positif.",
  en: "Speak in a cheerful and positive tone.",
  es: "Habla con un tono alegre y positivo, con una pronunciación clara.",
  "pt-br": "Fale com sotaque brasileiro, em tom alegre e positivo.",
  pt: "Fale com sotaque de Portugal, em tom alegre e positivo. NÃO ALTERE O TEXTO.",
  sq: "Fol me një theks autentik shqip të Prishtinës, me ton të ngrohtë dhe miqësor për fëmijë. NUK DUHET TË NDRYSHOSH TEKSTIN.",
};

export const DEFAULT_CORE_TTS_PROFILES = {
  default: "Normaliser les formes écrites ambiguës (nombres, dates, abréviations, symboles, plages, étiquettes de liste) en une parole naturelle et concise dans la langue de l'entrée. Conserver la prose ordinaire inchangée.",
  fr: "Lire les nombres, dates, heures, pourcentages (« pour cent »), fractions, unités et montants en mots français complets selon leur sens. Développer les abréviations courantes (ex. « p. » → « page », « etc. » → « et cætera », « M. » → « Monsieur »). Lire les plages avec « à » (« pages 3 à 5 »). Lire les étiquettes d'énumération « a) » comme « a ». Conserver la prose ordinaire inchangée.",
};

export const PRESETS = [
  {
    id: "textbook", title: "Manuels et activités", description: "Chapitres structurés, exercices. Idéal pour les contenus pédagogiques à mise en page complexe.",
    color: "#2563eb", renderStrategies: ["llm", "llm-overlay", "two_column", "two_column_story", "single_column"], recommendedStrategies: ["llm"],
    recommendedFor: ["Manuels scolaires et cahiers d'exercices", "Publications universitaires", "Articles scientifiques", "Manuels techniques avec schémas"],
    recommendations: { renderStrategy: "llm", pageGrouping: "single", sectioningMode: "dynamic", activitiesGenerator: true, imageCropping: false, imageSegmentation: true, figureExtraction: "auto" },
    formDefaults: { imageFilterMinSide: 50, imageFilterMaxSide: 3500 },
    baseConfig: { pruned_role_types: ["header", "footer", "page_number", "watermark"], pruned_section_types: [], image_filters: { min_stddev: 2 } },
  },
  {
    id: "storybook", title: "Livre d'histoires", description: "Grandes images, flux narratif. Idéal pour les livres illustrés avec des voix TTS de haute qualité.",
    color: "#d97706", renderStrategies: ["llm", "llm-overlay", "two_column", "two_column_story", "fixed_layout"], recommendedStrategies: ["llm-overlay", "two_column_story"],
    recommendedFor: ["Albums jeunesse illustrés", "Romans pour adolescents", "Livres à chapitres illustrés", "Premières lectures"],
    recommendations: { renderStrategy: "two_column_story", pageGrouping: "spread", sectioningMode: "page", activitiesGenerator: false, imageCropping: false, imageSegmentation: false, figureExtraction: "off" },
    formDefaults: { imageFilterMinSide: 150, imageFilterMaxSide: 3500 },
    baseConfig: { pruned_role_types: ["header", "footer", "page_number", "watermark"], pruned_section_types: ["back_cover", "credits", "inside_cover"], image_filters: { min_stddev: 2 } },
  },
  {
    id: "reference", title: "Référence", description: "Texte dense, colonne unique. Idéal pour la documentation, les rapports et les ouvrages de référence.",
    color: "#059669", renderStrategies: ["single_column", "llm", "two_column"], recommendedStrategies: ["single_column"],
    recommendedFor: ["Rapports et documents institutionnels", "Guides et documentation", "Dictionnaires et encyclopédies", "Textes juridiques"],
    recommendations: { renderStrategy: "single_column", pageGrouping: "single", sectioningMode: "dynamic", activitiesGenerator: false, imageCropping: false, imageSegmentation: false, figureExtraction: "auto" },
    formDefaults: { imageFilterMinSide: 100, imageFilterMaxSide: 5000 },
    baseConfig: { pruned_role_types: ["header", "footer", "page_number", "watermark"], pruned_section_types: [], image_filters: { min_stddev: 2 } },
  },
  {
    id: "custom", title: "Personnalisé", description: "Partez de zéro et configurez chaque option vous-même.",
    color: "#6b7280", renderStrategies: ["llm", "llm-overlay", "two_column", "two_column_story", "single_column", "fixed_layout"], recommendedStrategies: [],
    recommendedFor: ["Tout type de document"], recommendations: {}, formDefaults: {}, baseConfig: {},
  },
];

export const RENDER_STRATEGIES = [
  { id: "llm", title: "Dynamique", category: "ai", description: "Adapte automatiquement la mise en page au contenu de chaque page grâce à l'IA." },
  { id: "llm-overlay", title: "Superposition dynamique", category: "ai", description: "Mise en page par IA conservant la page d'origine en arrière-plan avec le texte superposé." },
  { id: "single_column", title: "Colonne unique", category: "template", description: "Colonne unique pleine largeur. Idéal pour la documentation et les contenus techniques denses." },
  { id: "two_column", title: "Deux colonnes", category: "template", description: "Texte et images côte à côte ; lecture continue et épurée." },
  { id: "two_column_story", title: "Histoire en deux colonnes", category: "template", description: "Parfait pour les livres jeunesse : grandes images associées à peu de texte." },
  { id: "fixed_layout", title: "Mise en page fixe", category: "template", description: "Image de la page en fond avec le texte positionné par-dessus. Conserve la composition d'origine ; idéal pour les albums illustrés." },
];
export const STRATEGY_CATEGORIES = {
  template: { label: "Basé sur un gabarit", description: "Résultats rapides et cohérents, sans coût d'IA" },
  ai: { label: "Assisté par IA", description: "Mises en page adaptées à chaque page (plus lent, consomme des crédits API)" },
};

export function deepMerge(base, override) {
  if (Array.isArray(override)) return override.slice();
  if (override && typeof override === "object") {
    const out = { ...(base && typeof base === "object" && !Array.isArray(base) ? base : {}) };
    for (const [k, v] of Object.entries(override)) {
      if (v === undefined) { delete out[k]; continue; }
      out[k] = deepMerge(out[k], v);
    }
    return out;
  }
  return override === undefined ? base : override;
}

export function clone(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }

/** Configuration effective = défaut ⊕ globale ⊕ livre. */
export function effectiveConfig(globalOverrides, bookOverrides) {
  return deepMerge(deepMerge(clone(DEFAULT_CONFIG), globalOverrides ?? {}), bookOverrides ?? {});
}

/** Construit les surcharges de configuration d'un livre à partir des valeurs de l'assistant. */
export function buildConfigOverrides(v) {
  const preset = PRESETS.find((p) => p.id === v.selectedPreset);
  const base = clone(preset?.baseConfig ?? {});
  const cfg = {
    ...base,
    default_render_strategy: v.renderStrategy,
    page_sectioning: { mode: v.sectioningMode || "dynamic" },
    spread_mode: v.pageGrouping === "spread",
    figure_extraction_mode: v.figureExtraction ?? "off",
    remove_watermarks: !!v.removeWatermarks,
    apply_body_background: true,
    image_filters: {
      ...(base.image_filters ?? {}),
      min_side: Number(v.imageFilterMinSide ?? 0),
      max_side: Number(v.imageFilterMaxSide ?? 5000),
      cropping: !!v.imageCropping,
      segmentation: !!v.imageSegmentation,
      ...(v.renderStrategy === "fixed_layout" ? { min_side: 0, max_side: undefined, min_stddev: 0, meaningfulness: false } : {}),
    },
  };
  if (!v.activitiesGenerator || v.renderStrategy === "fixed_layout") cfg.generate_activities = false;
  if (v.selectedPreset && v.selectedPreset !== "custom") cfg.layout_type = v.selectedPreset;
  if (v.styleguide?.trim()) cfg.styleguide = v.styleguide.trim();
  if (v.editingLanguage?.trim()) cfg.editing_language = v.editingLanguage.trim();
  if (v.outputLanguages?.length) cfg.output_languages = v.outputLanguages.slice();
  const s = parseInt(v.startPage, 10), e = parseInt(v.endPage, 10);
  if (v.scope === "range") {
    if (Number.isInteger(s) && s >= 1) cfg.start_page = s;
    if (Number.isInteger(e) && e >= 1 && (!Number.isInteger(s) || e >= s)) cfg.end_page = e;
  }
  if (v.scope === "split") cfg.split_mode = true;
  if (v.imageSegmentation && String(v.segmentationMinSide ?? "").trim()) {
    const n = Number(v.segmentationMinSide);
    if (Number.isInteger(n) && n >= 0) cfg.image_segmentation = { min_side: n };
  }
  return cfg;
}

export const GLOSSARY_AMOUNTS = { concise: "Concis (5–10 termes)", standard: "Standard", comprehensive: "Exhaustif" };
export const CAPTION_GRADE_LEVELS = { early: "Jeunes lecteurs (maternelle–CM2)", middle: "Collège et lycée", advanced: "Supérieur et adultes" };
export const QUIZ_QUESTION_TYPE_LABELS = { multiple_choice: "Choix multiple", true_false: "Vrai / faux", fill_in_the_blank: "Texte à trous" };
export const TEXT_CATALOG_CATEGORIES = { text: "Texte", captions: "Légendes", answers: "Réponses", glossary: "Glossaire", "easy-read": "Lecture facile" };
