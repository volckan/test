// Évaluation automatique de l'accessibilité (axe-core, en français) des pages du paquet.
import { nowIso } from "../util.js";

export const DEFAULT_RUN_ONLY = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];
export const IMPACT_LABELS = { critical: "Critique", serious: "Sérieux", moderate: "Modéré", minor: "Mineur" };

async function axeSource() { if (!axeSource.p) axeSource.p = fetch(new URL("../../vendor/axe.min.js", import.meta.url)).then((r) => r.text()); return axeSource.p; }
async function axeLocale() { if (!axeLocale.p) axeLocale.p = fetch(new URL("../../vendor/axe-fr.json", import.meta.url)).then((r) => r.json()).catch(() => null); return axeLocale.p; }

/** Analyse une page HTML (chaîne complète) dans un iframe isolé. assetMap : chemin → URL. */
export async function assessPageHtml(html, { assetMap = {}, runOnly = DEFAULT_RUN_ONLY, disabledRules = [] } = {}) {
  const [src, locale] = await Promise.all([axeSource(), axeLocale()]);
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;left:-20000px;top:0;width:1280px;height:900px;opacity:0;pointer-events:none;";
  document.body.appendChild(iframe);
  try {
    const rewritten = html.replace(/(src|href)="([^"]+)"/g, (m, a, u) => (assetMap[u] ? `${a}="${assetMap[u]}"` : m)).replace(/<script[^>]*src="[^"]*(adt-runtime|offline-preloader|scorm)\.js"[^>]*><\/script>/g, "").replace(/<link rel="manifest"[^>]*>/, "").replace(/class="opacity-0 ?/g, 'class="');
    iframe.srcdoc = rewritten;
    await new Promise((res) => { iframe.onload = res; setTimeout(res, 6000); });
    await new Promise((r) => setTimeout(r, 300));
    const win = iframe.contentWindow, doc = iframe.contentDocument;
    const s = doc.createElement("script"); s.textContent = src; doc.head.appendChild(s);
    if (!win.axe) throw new Error("axe-core n'a pas pu être chargé");
    if (locale) win.axe.configure({ locale });
    const rules = Object.fromEntries(disabledRules.map((r) => [r, { enabled: false }]));
    const result = await win.axe.run(doc, { runOnly: { type: "tag", values: runOnly }, rules, resultTypes: ["violations", "incomplete", "passes", "inapplicable"] });
    const finding = (v) => ({ id: v.id, impact: v.impact ?? null, description: v.description, help: v.help, helpUrl: v.helpUrl, tags: v.tags, nodes: v.nodes.slice(0, 20).map((n) => ({ target: n.target, html: n.html?.slice(0, 300), failureSummary: n.failureSummary })) });
    return { violations: result.violations.map(finding), incomplete: result.incomplete.filter((v) => !/internal|error/i.test(v.id)).map(finding), passCount: result.passes.length, inapplicableCount: result.inapplicable.length };
  } finally { iframe.remove(); }
}

/** Évalue toutes les pages du paquet (files : Map). */
export async function assessPackage(files, { assetMap, runOnly, disabledRules, onProgress, signal, texts = {} } = {}) {
  const pagesJson = JSON.parse(typeof files.get("content/pages.json") === "string" ? files.get("content/pages.json") : await files.get("content/pages.json").text());
  const pages = [];
  for (let i = 0; i < pagesJson.length; i++) {
    if (signal?.aborted) throw new DOMException("Annulé", "AbortError");
    const p = pagesJson[i];
    const v = files.get(p.href); const html = typeof v === "string" ? v : await v.text();
    onProgress?.(i + 1, pagesJson.length, p.href);
    try {
      const r = await assessPageHtml(html, { assetMap, runOnly, disabledRules });
      pages.push({ pageId: p.section_id.split("_")[0], sectionId: p.section_id, href: p.href, pageNumber: p.page_number ?? null, title: texts[p.section_id] ?? null, violationCount: r.violations.reduce((n, x) => n + x.nodes.length, 0), incompleteCount: r.incomplete.reduce((n, x) => n + x.nodes.length, 0), passCount: r.passCount, inapplicableCount: r.inapplicableCount, violations: r.violations, incomplete: r.incomplete });
    } catch (e) { pages.push({ pageId: p.section_id.split("_")[0], sectionId: p.section_id, href: p.href, pageNumber: p.page_number ?? null, error: e.message, violationCount: 0, incompleteCount: 0, passCount: 0, inapplicableCount: 0, violations: [], incomplete: [] }); }
  }
  const summary = { pageCount: pages.length, pagesWithViolations: pages.filter((p) => p.violationCount).length, pagesWithErrors: pages.filter((p) => p.error).length, violationCount: pages.reduce((n, p) => n + p.violationCount, 0), incompleteCount: pages.reduce((n, p) => n + p.incompleteCount, 0), byImpact: {} };
  for (const p of pages) for (const v of p.violations) summary.byImpact[v.impact ?? "unknown"] = (summary.byImpact[v.impact ?? "unknown"] ?? 0) + v.nodes.length;
  return { generatedAt: nowIso(), tool: "axe-core (navigateur)", runOnlyTags: runOnly ?? DEFAULT_RUN_ONLY, disabledRules: disabledRules ?? [], pages, summary };
}

/** Carte chemin → URL blob pour un paquet. */
export function buildAssetMap(files) {
  const map = {};
  for (const [p, v] of files) { const blob = typeof v === "string" ? new Blob([v], { type: p.endsWith(".css") ? "text/css" : p.endsWith(".js") ? "text/javascript" : p.endsWith(".json") ? "application/json" : "text/html" }) : v; map[p] = URL.createObjectURL(blob); map[`./${p}`] = map[p]; }
  return map;
}
export function revokeAssetMap(map) { for (const u of new Set(Object.values(map))) URL.revokeObjectURL(u); }
