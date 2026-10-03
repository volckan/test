// Intégration : présentation des fonctionnalités puis configuration d'un fournisseur IA.
import { h, button, icon, textInput, field, toast } from "../dom.js";
import { mount } from "../app-layout.js";
import { navigate } from "../../router.js";
import { setSetting } from "../../db.js";
import { getCredentials, setCredentials } from "../../storage.js";
import { PROVIDERS, checkProvider } from "../../llm/providers.js";

const STEPS = [
  { key: "welcome", title: "Bienvenue dans ADT Studio Web", text: "Transformez n'importe quel PDF en livre numérique accessible : narration audio, traductions, lecture facile, quiz, glossaire, mises en page HTML structurées. Tout est généré à partir de votre fichier source, tout est modifiable, tout vous appartient — et tout se passe dans votre navigateur.", icon: "book-open" },
  { key: "speech", title: "Écouter", text: "Une synthèse vocale naturelle, page par page, avec surlignage des mots lus. Voix OpenAI, ElevenLabs, Gemini ou Azure.", icon: "audio-lines", color: "#e11d48" },
  { key: "translations", title: "Traduire", text: "La même édition dans toutes les langues de sortie que vous choisissez, texte, légendes, quiz et glossaire compris.", icon: "languages", color: "#db2777" },
  { key: "quizzes", title: "Quiz et activités", text: "Des questions de compréhension générées par section et des exercices du livre convertis en activités interactives accessibles.", icon: "help-circle", color: "#ea580c" },
  { key: "glossary", title: "Glossaire et lecture facile", text: "Les termes clés définis à leur place, et une version FALC (facile à lire et à comprendre) de chaque texte.", icon: "book-open", color: "#65a30d" },
  { key: "provider", title: "Choisissez votre fournisseur d'IA", text: "Collez une clé API. Elle est stockée uniquement dans ce navigateur et envoyée directement au fournisseur, jamais à un serveur tiers.", icon: "key" },
  { key: "finale", title: "Tout est prêt", text: "Ajoutez votre premier livre depuis l'accueil, ou commencez par parcourir les paramètres.", icon: "sparkles" },
];

export async function renderOnboarding() {
  let i = 0;
  const creds = await getCredentials();
  const card = h("div", { class: "onboarding-card" });
  const render = () => {
    const s = STEPS[i];
    card.innerHTML = "";
    card.appendChild(h("div", { class: "row between" }, h("div", { class: "dots" }, STEPS.map((_, k) => h("span", { class: k === i ? "on" : "" }))), button("Passer", { variant: "ghost", size: "sm", onClick: finish })));
    card.appendChild(h("div", { class: "row", style: { gap: "16px" } }, h("div", { class: "tile", style: { width: "56px", height: "56px", borderRadius: "16px", display: "grid", placeItems: "center", background: s.color ?? "var(--accent)", color: "#fff" } }, icon(s.icon, "icon-lg")), h("div", {}, h("h1", { style: { fontSize: "26px" } }, s.title), h("p", { class: "muted", style: { fontSize: "16px" } }, s.text))));
    if (s.key === "provider") card.appendChild(providerForm(creds));
    card.appendChild(h("div", { class: "row between" }, i > 0 ? button("Retour", { variant: "ghost", iconName: "arrow-left", onClick: () => { i--; render(); } }) : h("span"), i < STEPS.length - 1 ? button("Continuer", { iconName: "arrow-right", onClick: async () => { if (s.key === "provider") await setCredentials(creds); i++; render(); } }) : h("div", { class: "row" }, button("Lire la documentation", { variant: "secondary", onClick: () => window.open("https://github.com/unicef/adt-studio/wiki", "_blank") }), button("Aller à l'accueil", { onClick: finish }))));
  };
  async function finish() { await setSetting("onboarded", true); await setCredentials(creds); navigate("/"); }
  render();
  mount(h("div", { class: "onboarding" }, card));
}

export function providerForm(creds, { compact = false } = {}) {
  const wrap = h("div", { class: "stack" });
  const main = PROVIDERS.filter((p) => p.modalities.includes("structured-text") && !["custom", "ollama"].includes(p.id));
  for (const p of main) {
    creds[p.id] ??= {};
    const inputs = p.fields.map((f) => field(f.label + (f.required ? "" : " (facultatif)"), textInput({ type: f.kind === "secret" ? "password" : "text", placeholder: f.placeholder ?? "", value: creds[p.id][f.key] ?? "", autocomplete: "off", onInput: (e) => { creds[p.id][f.key] = e.target.value.trim(); } })));
    const status = h("span", { class: "muted small" });
    wrap.appendChild(h("div", { class: "card" }, h("div", { class: "card-body stack" }, h("div", { class: "row between" }, h("strong", {}, p.displayName), h("div", { class: "row" }, p.docsUrl ? h("a", { href: p.docsUrl, target: "_blank", rel: "noopener", class: "small" }, "Obtenir une clé ", icon("external", "icon-sm")) : null, button("Tester", { variant: "secondary", size: "sm", onClick: async () => { status.textContent = "Vérification…"; const r = await checkProvider(p.id, creds); status.textContent = r.message; status.className = `small ${r.status === "connected" ? "" : "muted"}`; status.style.color = r.status === "connected" ? "var(--success)" : r.status === "rejected" ? "var(--danger)" : ""; } }))), compact ? null : h("p", { class: "muted small" }, p.help), h("div", { class: p.fields.length > 1 ? "grid grid-2" : "" }, inputs), status)));
  }
  return wrap;
}
