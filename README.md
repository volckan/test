# ADT Studio Web — version statique, en français

Réécriture complète d'[ADT Studio](https://github.com/unicef/adt-studio) (UNICEF) sous la forme d'une
**application web statique** : aucun serveur, aucun Node.js, aucune étape de compilation. Tout s'exécute
dans le navigateur, en français, et peut être hébergé sur n'importe quel hébergeur de fichiers
statiques (GitHub Pages, Netlify, un simple `python3 -m http.server`…).

L'application transforme un manuel scolaire au format PDF en **manuel numérique accessible** (ADT,
*Accessible Digital Textbook*) : extraction, structuration par IA, rendu HTML accessible, activités
interactives, quiz, glossaire, lecture facile, traduction, lecture à voix haute avec surlignage des mots,
langue des signes, validation WCAG, puis export vers plusieurs formats.

## Fonctionnalités

**Pipeline en 24 étapes** (graphe de dépendances, exécution par étape ou « Tout lancer », reprise,
réexécution sélective des étapes en aval) :

| Groupe | Étapes |
| --- | --- |
| Livre | extraction PDF (pdf.js), métadonnées, résumé, plan du livre |
| Images | filtrage, pertinence, segmentation, recadrage, légendes, traduction d'images |
| Structure | découpage en sections par page (avec raffinement), fusion inter-pages, storyboard |
| Contenu | rendu web (gabarits Liquid ou IA, mise en page fixe), activités, quiz, glossaire, table des matières, lecture facile |
| Langues | catalogue de textes, traduction, évaluation des traductions, préparation TTS, synthèse vocale, horodatage des mots |
| Publication | empaquetage web, évaluation d'accessibilité (axe-core), aperçu, exports |

**Édition** : correction manuelle de chaque sortie d'étape, versionnage de chaque donnée (jamais
d'écrasement, retour à une version antérieure), édition des gabarits HTML et des *prompts* (globalement
ou par livre), découpage et fusion de livres en parties, archive de projet (import/export).

**Transparence IA** : cache des appels LLM (clé SHA-256 du modèle, de la température, du schéma et des
messages), journal consultable de tous les appels avec coût estimé, statistiques par étape.

**Lecteur ADT embarqué** dans chaque export : barre d'outils, table des matières, glossaire avec
surlignage, lecture à voix haute avec surlignage mot à mot, vidéo en langue des signes, lecture facile,
bloc-notes, « explique-moi simplement », réglages d'accessibilité (thème, taille des icônes, animations,
vitesse de lecture), tous les types d'activités (vrai/faux, choix multiple, texte à trous, glisser-déposer,
appariement, tri, remise en ordre, texte libre, pas à pas…), quiz, visite guidée, mode hors ligne.

**Exports** : site web ADT (zip), SCORM 1.2, WebPub (manifeste W3C), EPUB 3 (avec *media overlays*
SMIL, navigation, NCX, glossaire), PNLD, archive de projet.

**Accessibilité** : audit automatique axe-core (règles en français) de chaque page générée, liste de
vérification pour relecteur·rice, rapport stocké avec le livre.

## Fournisseurs d'IA pris en charge

Les appels sont faits **directement depuis le navigateur** avec vos propres clés :

- OpenAI (texte structuré, synthèse vocale, horodatage Whisper, génération d'images)
- Anthropic (Claude, via l'accès direct navigateur)
- Google Gemini (texte structuré, synthèse vocale, images)
- Mistral AI, OpenRouter, tout point d'accès compatible OpenAI, Ollama (local)
- ElevenLabs (voix avec alignement des mots), Azure Speech (SSML)

## Utilisation

1. Ouvrez `index.html` depuis un serveur HTTP (les modules ES et pdf.js ne fonctionnent pas en `file://`).
   En local :
   ```bash
   python3 -m http.server 8000
   # puis http://localhost:8000/
   ```
2. Dans **Paramètres → Fournisseurs IA**, saisissez vos clés API et testez la connexion. Le modèle par défaut
   est `openai:gpt-5.4` ; si vous n'enregistrez qu'un autre fournisseur (OpenRouter, Anthropic, Gemini…), le
   modèle par défaut bascule automatiquement sur ce fournisseur. Vous pouvez le changer à tout moment dans
   **Paramètres → Modèles**, globalement ou par étape.
3. **Ajouter un livre** : déposez un PDF, renseignez le titre, la langue et les options, puis lancez
   l'extraction.
4. Suivez les étapes dans la barre latérale (chaque étape propose un aperçu, une édition manuelle et
   un historique des versions), ou cliquez sur **Tout lancer**.
5. Dans **Publication**, prévisualisez le manuel, consultez le rapport d'accessibilité et téléchargez les
   exports.

Raccourcis : `Ctrl+K` palette de commandes, `Ctrl+Shift+D` vue de débogage du livre.

## Hébergement sur GitHub Pages

Le dépôt contient un workflow (`.github/workflows/pages.yml`) qui publie la racine du dépôt à chaque
push sur `main`. Dans **Settings → Pages**, choisissez la source **GitHub Actions**. Aucune compilation
n'est nécessaire ; le fichier `.nojekyll` désactive le traitement Jekyll.

## Données et confidentialité

- Les clés API, la configuration, les livres, les images, les fichiers audio et le cache IA sont stockés
  **uniquement dans votre navigateur** (IndexedDB). Rien n'est envoyé ailleurs qu'aux fournisseurs d'IA
  que vous avez configurés.
- Vider les données du site efface tout : exportez une **archive de projet** pour sauvegarder un livre.
- Les clés sont transmises directement aux API des fournisseurs depuis votre navigateur ; utilisez des
  clés dédiées avec des limites de dépense.

## Limites connues

- Les appels directs depuis le navigateur dépendent de la prise en charge CORS des fournisseurs
  (OpenAI, Anthropic, Gemini, Mistral, OpenRouter, ElevenLabs et Azure l'acceptent ; pour Ollama,
  lancez-le avec `OLLAMA_ORIGINS=*`).
- Le stockage dépend du quota du navigateur (plusieurs centaines de Mo en général). Les gros manuels
  gagnent à être découpés en parties.
- Les traitements longs (synthèse vocale, rendu de nombreuses pages) tournent dans l'onglet : laissez-le
  ouvert.
- Pas de collaboration multi-utilisateurs : chaque navigateur a ses propres données.

## Structure du code

```
index.html              coquille de l'application
css/app.css             styles du Studio (thèmes clair/sombre)
js/main.js              démarrage, routes, palette de commandes
js/pipeline.js          définition des étapes et de leurs dépendances
js/config.js            configuration par défaut, types de sections, langues, voix
js/db.js, js/storage.js IndexedDB, versionnage, cache et journal IA
js/llm/                 fournisseurs, client LLM, moteur de prompts Liquid, prompts en français
js/pdf/extract.js       extraction PDF (texte positionné, images, filigranes)
js/pipeline/            exécuteur du graphe et implémentation des 24 étapes
js/packaging/           lecteur ADT (JS/CSS/chaînes), compilation Tailwind, exports
js/a11y/                audit axe-core et liste de vérification
js/ui/                  écrans, vues d'étapes, composants
vendor/                 bibliothèques embarquées (pdf.js, JSZip, axe-core, html2canvas, Temml, Tailwind)
```

## Licence

Même licence que le projet d'origine ADT Studio (voir le dépôt UNICEF). Les bibliothèques du dossier
`vendor/` conservent leurs licences respectives.
