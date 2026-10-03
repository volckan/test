// Palette de commandes (Ctrl+K) : navigation, actions rapides, livres.
import { h, dialog, icon, clear } from "./dom.js";
import { navigate } from "../router.js";
import { listBooks, bookSummary, getUiPrefs, setUiPrefs } from "../storage.js";

let open = false;
export async function openCommandPalette() {
  if (open) return; open = true;
  const books = await Promise.all((await listBooks()).map((b) => bookSummary(b.label)));
  const items = [
    { group: "Navigation", label: "Accueil", icon: "home", run: () => navigate("/") },
    { group: "Navigation", label: "Bibliothèque", icon: "library", run: () => navigate("/library") },
    { group: "Navigation", label: "Diviser et fusionner", icon: "scissors", run: () => navigate("/handoffs") },
    { group: "Navigation", label: "Paramètres : fournisseurs IA", icon: "key", run: () => navigate("/settings/providers") },
    { group: "Navigation", label: "Paramètres : modèles", icon: "cpu", run: () => navigate("/settings/models") },
    { group: "Navigation", label: "Paramètres : prompts", icon: "terminal", run: () => navigate("/settings/prompts") },
    { group: "Actions", label: "Ajouter un livre (convertir un PDF)", icon: "plus", run: () => navigate("/books/new") },
    { group: "Actions", label: "Importer un projet (.zip)", icon: "upload", run: () => navigate("/books/import") },
    { group: "Actions", label: "Thème clair", icon: "sun", run: () => setUiPrefs({ theme: "light" }) },
    { group: "Actions", label: "Thème sombre", icon: "moon", run: () => setUiPrefs({ theme: "dark" }) },
    { group: "Actions", label: "Thème : suivre le système", icon: "monitor", run: () => setUiPrefs({ theme: "system" }) },
    { group: "Actions", label: "Bibliothèque en grille", icon: "grid", run: () => setUiPrefs({ libraryView: "grid" }).then(() => navigate("/library")) },
    { group: "Actions", label: "Bibliothèque en liste", icon: "rows", run: () => setUiPrefs({ libraryView: "list" }).then(() => navigate("/library")) },
    ...books.filter(Boolean).map((b) => ({ group: "Livres", label: b.title ?? b.label, sub: `${b.pageCount} pages · ${b.label}`, icon: "book", run: () => navigate(`/books/${b.label}/book`) })),
  ];
  const input = h("input", { class: "input", placeholder: "Rechercher une page, une action, un livre…", "aria-label": "Rechercher" });
  const list = h("div", { class: "cmdk-list", role: "listbox" });
  let filtered = items, active = 0;
  const render = () => {
    clear(list); let lastGroup = null;
    filtered.forEach((it, i) => {
      if (it.group !== lastGroup) { list.appendChild(h("div", { class: "cmdk-group" }, it.group)); lastGroup = it.group; }
      list.appendChild(h("button", { type: "button", class: ["cmdk-item", i === active && "active"], role: "option", "aria-selected": String(i === active), onClick: () => choose(it) }, icon(it.icon), h("span", { class: "grow" }, it.label, it.sub ? h("span", { class: "muted small" }, ` — ${it.sub}`) : null)));
    });
    if (!filtered.length) list.appendChild(h("p", { class: "muted", style: { padding: "10px" } }, "Aucun résultat"));
  };
  const { close } = dialog({ title: "Palette de commandes", body: h("div", { class: "cmdk" }, input, list), onClose: () => { open = false; }, size: "md" });
  const choose = (it) => { close(); it.run(); };
  input.addEventListener("input", () => { const q = input.value.trim().toLowerCase(); filtered = q ? items.filter((it) => (it.label + " " + (it.sub ?? "")).toLowerCase().includes(q)) : items; active = 0; render(); });
  input.addEventListener("keydown", (e) => { if (e.key === "ArrowDown") { active = Math.min(filtered.length - 1, active + 1); render(); e.preventDefault(); } else if (e.key === "ArrowUp") { active = Math.max(0, active - 1); render(); e.preventDefault(); } else if (e.key === "Enter" && filtered[active]) { choose(filtered[active]); } });
  render(); setTimeout(() => input.focus(), 30);
}
