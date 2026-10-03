// Routeur par hachage (#/chemin?requête).
import { Emitter } from "./util.js";

export const routerEvents = new Emitter();
const routes = [];

export function addRoute(pattern, handler) {
  const keys = []; const re = new RegExp("^" + pattern.replace(/\//g, "\\/").replace(/:(\w+)/g, (m, k) => { keys.push(k); return "([^\\/]+)"; }) + "$");
  routes.push({ re, keys, handler });
}
export function parseHash() {
  const raw = location.hash.replace(/^#/, "") || "/";
  const [path, qs] = raw.split("?");
  const query = Object.fromEntries(new URLSearchParams(qs ?? ""));
  return { path: path.startsWith("/") ? path : `/${path}`, query };
}
export function navigate(path, { replace = false, query } = {}) {
  const q = query ? `?${new URLSearchParams(query).toString()}` : "";
  const hash = `#${path}${q}`;
  if (replace) history.replaceState(null, "", hash); else location.hash = hash;
  if (replace) dispatch();
}
export function href(path, query) { return `#${path}${query ? `?${new URLSearchParams(query)}` : ""}`; }
let current = null;
export async function dispatch() {
  const { path, query } = parseHash();
  for (const r of routes) {
    const m = r.re.exec(path);
    if (!m) continue;
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    current = { path, params, query };
    routerEvents.emit("change", current);
    try { await r.handler({ params, query, path }); } catch (e) { console.error(e); routerEvents.emit("error", { error: e, path }); }
    return;
  }
  routerEvents.emit("notfound", { path });
}
export function currentRoute() { return current; }
export function startRouter() { window.addEventListener("hashchange", dispatch); dispatch(); }
