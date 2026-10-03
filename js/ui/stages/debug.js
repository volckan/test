// Panneau de débogage : statistiques, journaux LLM, configuration active, versions.
import { h, button, icon, badge, tabs, select, textInput, toast, clear, copyToClipboard } from "../dom.js";
import { computeStats } from "../../llm/client.js";
import { formatDuration, formatCost, formatDate, downloadBlob } from "../../util.js";
import { navigate } from "../../router.js";

export async function renderDebug(ctx, container, tab = "stats") {
  const body = h("div", { class: "stack" });
  const nav = tabs([{ key: "stats", label: "Statistiques" }, { key: "logs", label: "Journaux LLM" }, { key: "config", label: "Configuration" }, { key: "versions", label: "Versions" }, { key: "cache", label: "Cache" }], tab, (k) => navigate(`/books/${ctx.label}/debug`, { query: { tab: k } }));
  container.appendChild(h("div", { class: "stack" }, nav, body));
  if (tab === "stats") await renderStats(ctx, body); else if (tab === "logs") await renderLogs(ctx, body); else if (tab === "config") renderConfig(ctx, body); else if (tab === "versions") await renderVersions(ctx, body); else await renderCache(ctx, body);
}
async function renderStats(ctx, body) {
  const logs = await ctx.storage.getAllLlmLogs(); const s = computeStats(logs);
  const tile = (l, v) => h("div", { class: "card" }, h("div", { class: "card-body" }, h("div", { class: "muted small" }, l), h("div", { style: { fontSize: "22px", fontWeight: 700 } }, v)));
  body.appendChild(h("div", { class: "grid grid-3" }, tile("Appels LLM", s.calls), tile("Jetons entrée / sortie", `${s.tokensIn.toLocaleString("fr-FR")} / ${s.tokensOut.toLocaleString("fr-FR")}`), tile("Taux de cache", `${Math.round(s.cacheHitRate * 100)} %`), tile("Erreurs", s.errors), tile("Coût estimé", formatCost(s.cost)), tile("Temps cumulé", formatDuration(s.durationMs))));
  body.appendChild(h("table", { class: "table" }, h("thead", {}, h("tr", {}, ["Sous-étape", "Appels", "Cache", "Erreurs", "Jetons", "Coût", "Durée"].map((c) => h("th", {}, c)))), h("tbody", {}, Object.entries(s.perStep).sort((a, b) => b[1].calls - a[1].calls).map(([k, v]) => h("tr", {}, h("td", {}, k), h("td", {}, v.calls), h("td", {}, v.cached), h("td", {}, v.errors), h("td", {}, `${v.tokensIn.toLocaleString("fr-FR")} / ${v.tokensOut.toLocaleString("fr-FR")}`), h("td", {}, formatCost(v.cost)), h("td", {}, formatDuration(v.durationMs)))))));
  body.appendChild(h("div", { class: "row" }, button("Exporter les journaux (JSON)", { variant: "secondary", iconName: "download", onClick: () => downloadBlob(new Blob([JSON.stringify(logs, null, 1)], { type: "application/json" }), `${ctx.label}-journaux-llm.json`) }), button("Vider les journaux", { variant: "ghost", iconName: "trash", onClick: async () => { await ctx.storage.clearLlmLogs(); toast("Journaux effacés", { kind: "success" }); renderDebug(ctx, body.parentElement, "stats"); } })));
}
async function renderLogs(ctx, body) {
  let step = "", page = 0; const PAGE = 25;
  const list = h("div", { class: "stack", style: { gap: "6px" } });
  const allLogs = await ctx.storage.getAllLlmLogs();
  const steps = [...new Set(allLogs.map((l) => l.step))].sort();
  // Synthèse : modèles demandés et modèles effectivement servis
  const byModel = new Map();
  for (const l of allLogs) { const d = l.data ?? {}; const key = d.servedModel ? `${d.model} → servi : ${d.servedModel}` : (d.model ?? "?"); byModel.set(key, (byModel.get(key) ?? 0) + 1); }
  body.appendChild(h("div", { class: "card" }, h("div", { class: "card-body stack", style: { gap: "4px" } }, h("div", { class: "row between" }, h("strong", {}, "Modèles utilisés"), h("span", { class: "muted small" }, "fournisseur:modèle demandé, et modèle servi quand le fournisseur en renvoie un autre")), ...[...byModel.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => h("div", { class: "row small" }, h("code", {}, k), h("span", { class: "muted" }, `${n} appel${n > 1 ? "s" : ""}`))))));
  const render = async () => {
    clear(list); const { total, logs } = await ctx.storage.getLlmLogs({ step: step || undefined, limit: PAGE, offset: page * PAGE });
    list.appendChild(h("div", { class: "row between" }, h("span", { class: "muted small" }, `${total} appels`), h("div", { class: "row" }, button("Précédent", { size: "sm", variant: "ghost", disabled: page === 0, onClick: () => { page--; render(); } }), h("span", { class: "small" }, `${page + 1} / ${Math.max(1, Math.ceil(total / PAGE))}`), button("Suivant", { size: "sm", variant: "ghost", disabled: (page + 1) * PAGE >= total, onClick: () => { page++; render(); } }))));
    for (const l of logs) {
      const d = l.data ?? {};
      list.appendChild(h("details", { class: "log-entry" }, h("summary", {}, badge(l.success ? "OK" : "Échec", l.success ? "success" : "danger"), h("strong", {}, l.step), h("span", { class: "muted" }, l.itemId), h("span", { class: "grow" }), d.cached ? badge("cache", "accent") : null, h("span", { class: "muted small", title: d.requestedModel ? `Demandé : ${d.requestedModel}` : "" }, d.model, d.servedModel ? h("span", { class: "muted small", title: "Modèle effectivement servi par le fournisseur" }, ` → servi : ${d.servedModel}`) : null), h("span", { class: "muted small" }, formatDuration(d.durationMs)), d.usage ? h("span", { class: "muted small" }, `${d.usage.input}↑ ${d.usage.output}↓`) : null, d.cost ? h("span", { class: "muted small" }, formatCost(d.cost)) : null, h("span", { class: "muted small" }, formatDate(l.timestamp))),
        h("div", { class: "stack", style: { marginTop: "8px" } }, d.promptName ? h("div", { class: "small" }, "Prompt : ", h("code", {}, d.promptName), " · tentatives : ", d.attempts ?? 1) : null, d.errors?.length ? h("div", { class: "callout callout-danger small" }, h("ul", { style: { margin: 0 } }, d.errors.map((e) => h("li", {}, `Tentative ${e.attempt} (${e.kind}) : ${e.message}`)))) : null,
          h("details", {}, h("summary", { class: "small" }, "Messages envoyés"), ...(d.messages ?? []).map((m) => h("div", { class: "stack", style: { gap: "2px", marginTop: "6px" } }, badge(m.role), ...m.parts.map((p) => p.type === "image" ? h("span", { class: "muted small" }, `[image ~${Math.round((p.bytes ?? 0) / 1024)} Ko]`) : h("pre", { class: "code" }, p.text))))),
          h("details", { open: !l.success }, h("summary", { class: "small" }, "Réponse"), h("pre", { class: "code" }, d.response ?? "—"), button("Copier", { size: "sm", variant: "ghost", iconName: "copy", onClick: () => copyToClipboard(d.response ?? "") })))));
    }
  };
  body.appendChild(h("div", { class: "row" }, select([["", "Toutes les sous-étapes"], ...steps.map((s) => [s, s])], step, { onChange: (v) => { step = v; page = 0; render(); }, attrs: { style: "width:auto" } })));
  body.appendChild(list);
  await render();
}
function renderConfig(ctx, body) { body.appendChild(h("div", { class: "stack" }, h("p", { class: "muted small" }, "Configuration effective = défauts ⊕ réglages globaux ⊕ réglages du livre."), h("div", { class: "row" }, button("Copier", { size: "sm", variant: "secondary", iconName: "copy", onClick: () => copyToClipboard(JSON.stringify(ctx.config, null, 2)) }), button("Télécharger", { size: "sm", variant: "secondary", iconName: "download", onClick: () => downloadBlob(new Blob([JSON.stringify(ctx.config, null, 2)], { type: "application/json" }), `${ctx.label}-config.json`) })), h("pre", { class: "code", style: { maxHeight: "70vh" } }, JSON.stringify(ctx.config, null, 2)), h("h3", {}, "Surcharges du livre"), h("pre", { class: "code" }, JSON.stringify(ctx.book.config ?? {}, null, 2)))); }
async function renderVersions(ctx, body) {
  const nodes = await ctx.storage.listNodes(); let node = nodes[0]?.node ?? ""; let item = nodes[0]?.items[0] ?? "";
  const out = h("div", { class: "stack" });
  const itemSel = h("select", { class: "input select", style: "width:auto" });
  const fill = () => { itemSel.innerHTML = ""; for (const it of nodes.find((n) => n.node === node)?.items ?? []) itemSel.appendChild(h("option", { value: it, selected: it === item }, it)); item = itemSel.value; };
  itemSel.addEventListener("change", () => { item = itemSel.value; show(); });
  const show = async () => { clear(out); const versions = await ctx.storage.getVersions(node, item); for (const v of versions) out.appendChild(h("details", { class: "log-entry" }, h("summary", {}, h("strong", {}, `v${v.version}`), v.isCurrent ? badge("courante", "accent") : null, h("span", { class: "muted small" }, formatDate(v.createdAt)), h("span", { class: "grow" }), v.isCurrent ? null : button("Restaurer", { size: "sm", variant: "secondary", onClick: async () => { await ctx.storage.setCurrentVersion(node, item, v.version); toast(`v${v.version} restaurée`, { kind: "success" }); show(); } })), h("pre", { class: "code" }, JSON.stringify(v.data, null, 1).slice(0, 30000)))); };
  fill(); body.appendChild(h("div", { class: "row row-wrap" }, select(nodes.map((n) => [n.node, `${n.node} (${n.items.length})`]), node, { onChange: (v) => { node = v; fill(); show(); }, attrs: { style: "width:auto" } }), itemSel), out); await show();
}
async function renderCache(ctx, body) {
  const st = await ctx.storage.cacheStats();
  body.appendChild(h("div", { class: "stack" }, h("p", {}, `${st.entries} réponses LLM en cache. Les réexécutions avec des entrées identiques (prompt, modèle, images) sont servies instantanément sans coût.`), h("div", { class: "row" }, button("Vider le cache LLM", { variant: "danger", iconName: "trash", onClick: async () => { await ctx.storage.clearCache(); toast("Cache vidé", { kind: "success" }); renderDebug(ctx, body.parentElement, "cache"); } }))));
}
