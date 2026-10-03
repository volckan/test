// Compilation Tailwind dans le navigateur : on charge le HTML de toutes les pages dans un iframe
// avec la version navigateur de Tailwind v4, puis on récupère la feuille générée.
export async function compileTailwind(htmlFragments, { extraCss = "" } = {}) {
  const tw = new URL("../../vendor/tailwind-browser.js", import.meta.url).href;
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;left:-20000px;top:0;width:1280px;height:800px;opacity:0;pointer-events:none;";
  document.body.appendChild(iframe);
  try {
    const body = htmlFragments.map((h) => h.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/src="[^"]*"/g, 'src=""')).join("\n");
    iframe.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><script src="${tw}"></script><script>document.addEventListener("DOMContentLoaded",function(){var s=document.createElement("style");s.type="text/tailwindcss";s.textContent='@import "tailwindcss";';document.head.appendChild(s);});</script></head><body>${body}</body></html>`;
    await new Promise((res) => { iframe.onload = res; setTimeout(res, 8000); });
    let css = "";
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 150));
      const styles = [...iframe.contentDocument.head.querySelectorAll("style")].filter((s) => s.getAttribute("type") !== "text/tailwindcss");
      const best = styles.map((s) => s.textContent).sort((a, b) => b.length - a.length)[0] ?? "";
      if (best.length > 500 && best === css) break;
      css = best;
    }
    if (!css) throw new Error("Tailwind n'a produit aucune feuille de style");
    return `${css}\n${extraCss}`;
  } finally { iframe.remove(); }
}
