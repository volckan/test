// Mise en page de l'application (barre latérale Accueil / Bibliothèque / Diviser et fusionner / Paramètres).
import { h, icon, clear, button } from "./dom.js";
import { href, parseHash, navigate } from "../router.js";
import { openCommandPalette } from "./command-palette.js";
import { addBookDialog } from "./screens/add-book.js";

const NAV = [
  { path: "/", label: "Accueil", icon: "home" },
  { path: "/library", label: "Bibliothèque", icon: "library" },
  { path: "/handoffs", label: "Diviser et fusionner", icon: "scissors" },
  { path: "/settings", label: "Paramètres", icon: "settings", match: (p) => p.startsWith("/settings") },
];

export function renderAppLayout(content, { wide = false } = {}) {
  const { path } = parseHash();
  const sidebar = h("aside", { class: "app-sidebar" },
    h("a", { class: "logo", href: "#/" }, h("img", { src: "assets/favicon.svg", alt: "" }), h("span", {}, "ADT Studio", h("small", {}, "Édition web · français"))),
    ...NAV.map((n) => h("a", { class: ["nav-link", (n.match ? n.match(path) : path === n.path) && "active"], href: href(n.path) }, icon(n.icon), n.label)),
    h("div", { class: "grow" }),
    button("Ajouter un livre", { iconName: "plus", onClick: () => addBookDialog() }),
    button("Rechercher", { variant: "secondary", iconName: "search", onClick: () => openCommandPalette(), title: "Ctrl+K" }),
    h("p", { class: "small muted", style: { padding: "8px 10px 0" } }, "Vos livres et vos clés restent dans ce navigateur."),
  );
  const main = h("main", { id: "main", class: "app-main", tabindex: -1 }, content);
  return h("div", { class: "app" }, sidebar, main);
}

export function mount(node) { const app = document.getElementById("app"); clear(app); app.appendChild(node); return app; }
export function pageHead(title, subtitle, actions) { return h("div", { class: "page-head" }, h("div", {}, h("h1", {}, title), subtitle ? h("p", {}, subtitle) : null), actions ? h("div", { class: "row row-wrap" }, actions) : null); }
export { navigate };
