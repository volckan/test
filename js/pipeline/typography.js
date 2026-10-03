// Échelle typographique fixe et accessible (classes adt-h1…h6, adt-body, adt-caption).
export const TYPE_ROLES = [
  { className: "adt-h1", key: "h1", label: "Titre de chapitre (H1)", mobilePx: 32, desktopPx: 44 },
  { className: "adt-h2", key: "h2", label: "Titre de section (H2)", mobilePx: 26, desktopPx: 34 },
  { className: "adt-h3", key: "h3", label: "Sous-titre (H3)", mobilePx: 22, desktopPx: 27 },
  { className: "adt-h4", key: "h4", label: "Titre H4", mobilePx: 20, desktopPx: 23 },
  { className: "adt-h5", key: "h5", label: "Titre H5", mobilePx: 18, desktopPx: 20 },
  { className: "adt-h6", key: "h6", label: "Titre H6", mobilePx: 17, desktopPx: 18 },
  { className: "adt-body", key: "body", label: "Corps de texte", mobilePx: 17, desktopPx: 19 },
  { className: "adt-caption", key: "caption", label: "Légende", mobilePx: 14, desktopPx: 15 },
];
export const REFLOWABLE_FONTS = { auto: "Automatique (selon le livre)", "atkinson-hyperlegible": "Atkinson Hyperlegible (sans-serif, accessible)", merriweather: "Merriweather (serif)", "open-dyslexic": "OpenDyslexic", lexend: "Lexend", "system-sans": "Système sans-serif", "system-serif": "Système serif" };

export async function getTypography(storage, config) {
  const saved = await storage.getNodeData("typography", "book");
  const scale = TYPE_ROLES.map((r) => ({ ...r, ...(saved?.sizes?.[r.key] ?? {}) }));
  return { scale, font: saved?.font ?? config?.reflowable_font ?? "auto", category: saved?.category ?? null };
}
export function fontFamilyCss(font, category) {
  switch (font) {
    case "merriweather": return `"Merriweather", Georgia, serif`;
    case "atkinson-hyperlegible": return `"Atkinson Hyperlegible", system-ui, sans-serif`;
    case "open-dyslexic": return `"OpenDyslexic", "Atkinson Hyperlegible", sans-serif`;
    case "lexend": return `"Lexend", system-ui, sans-serif`;
    case "system-serif": return `Georgia, "Times New Roman", serif`;
    case "system-sans": return `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    default: return category === "serif" ? `"Merriweather", Georgia, serif` : `"Atkinson Hyperlegible", system-ui, sans-serif`;
  }
}
export function typographyCss(typo) {
  const rules = typo.scale.map((r) => `.${r.className}{font-size:clamp(${r.mobilePx}px, calc(${r.mobilePx}px + (${r.desktopPx} - ${r.mobilePx}) * ((100vw - 375px) / 905)), ${r.desktopPx}px) !important; line-height:${r.key.startsWith("h") ? 1.2 : 1.6};}`).join("\n");
  return `body, #content { font-family: ${fontFamilyCss(typo.font, typo.category)}; }\n${rules}\n#content [data-fl-positioned] { font-family: inherit; }`;
}
