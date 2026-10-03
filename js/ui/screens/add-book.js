import { h, dialog, icon } from "../dom.js";
import { navigate } from "../../router.js";
export function addBookDialog() {
  const opt = (title, desc, ico, path, badge) => h("button", { type: "button", class: "option-card", onClick: () => { close(); navigate(path); } }, icon(ico, "icon-lg"), h("span", {}, h("strong", {}, title, badge ? h("span", { class: "badge badge-accent", style: { marginLeft: "8px" } }, badge) : null), h("span", { class: "muted" }, desc)));
  const { close } = dialog({ title: "Ajouter un livre", body: h("div", { class: "stack" }, opt("Convertir un PDF", "Créer un nouveau livre numérique accessible à partir d'un fichier PDF.", "file-text", "/books/new", "Le plus courant"), opt("Importer un projet", "Reprendre un projet exporté (.zip) ou une partie de livre renvoyée par un contributeur.", "upload", "/books/import")) });
}
