// Captures d'écran d'un HTML rendu (iframe + html2canvas) pour la revue visuelle.
import { blobToDataUrl } from "../util.js";

let h2cPromise = null;
function loadHtml2Canvas() {
  if (!h2cPromise) h2cPromise = new Promise((res, rej) => { if (window.html2canvas) return res(window.html2canvas); const s = document.createElement("script"); s.src = new URL("../../vendor/html2canvas.min.js", import.meta.url).href; s.onload = () => res(window.html2canvas); s.onerror = rej; document.head.appendChild(s); });
  return h2cPromise;
}

export const VIEWPORTS = [{ label: "Bureau", width: 1280, tailwind_prefix: "" }, { label: "Tablette", width: 768, tailwind_prefix: "max-lg:" }, { label: "Mobile", width: 375, tailwind_prefix: "max-sm:" }];

/** Document HTML complet pour un aperçu (Tailwind navigateur + typographie + remplacement des URLs d'images). */
export function buildPreviewDocument(sectionHtml, { assetMap = {}, typographyCss = "", extraCss = "", bodyClass = "" } = {}) {
  const html = sectionHtml.replace(/(src|href)="([^"]+)"/g, (m, attr, url) => assetMap[url] ? `${attr}="${assetMap[url]}"` : m);
  const tw = new URL("../../vendor/tailwind-browser.js", import.meta.url).href;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><script src="${tw}"></script><script>document.addEventListener("DOMContentLoaded",function(){var s=document.createElement("style");s.type="text/tailwindcss";s.textContent='@import "tailwindcss"; @layer base { :root { --page-height: 100vh; } body { margin: 0; font-family: "Atkinson Hyperlegible", system-ui, sans-serif; } img { max-width: 100%; height: auto; } }';document.head.appendChild(s);});</script><style>${typographyCss}${extraCss}</style></head><body class="${bodyClass}">${html}</body></html>`;
}

/** Capture `html` à plusieurs largeurs. Retourne [{ label, width, base64 }]. */
export async function screenshotHtml(sectionHtml, { assetMap = {}, typographyCss = "", viewports = VIEWPORTS, signal } = {}) {
  const html2canvas = await loadHtml2Canvas();
  const out = [];
  for (const vp of viewports) {
    if (signal?.aborted) throw new DOMException("Annulé", "AbortError");
    const iframe = document.createElement("iframe");
    iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${vp.width}px;height:900px;border:0;opacity:0;pointer-events:none;`;
    document.body.appendChild(iframe);
    try {
      iframe.srcdoc = buildPreviewDocument(sectionHtml, { assetMap, typographyCss });
      await new Promise((res) => { iframe.onload = res; setTimeout(res, 4000); });
      await new Promise((r) => setTimeout(r, 700));
      const doc = iframe.contentDocument;
      const h = Math.min(4000, Math.max(400, doc.documentElement.scrollHeight));
      iframe.style.height = `${h}px`;
      const canvas = await html2canvas(doc.body, { width: vp.width, height: h, windowWidth: vp.width, useCORS: true, allowTaint: true, logging: false, scale: Math.min(1, 1600 / h) });
      out.push({ label: vp.label, width: vp.width, base64: canvas.toDataURL("image/jpeg", 0.8) });
    } catch (e) { console.warn("capture", e); }
    finally { iframe.remove(); }
  }
  return out;
}

export async function blobMap(storage, imageIds) {
  const map = {};
  for (const id of imageIds) { const b = await storage.getImageBlob(id); if (b) map[`images/${id}.png`] = await blobToDataUrl(b); }
  return map;
}
