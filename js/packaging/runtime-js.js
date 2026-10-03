// Lecteur ADT embarqué dans le paquet web (JavaScript autonome, sans dépendance).
// Exporté sous forme de chaîne pour être écrit dans assets/adt-runtime.js.
export const RUNTIME_JS = String.raw`
(function () {
  "use strict";
  var ASSET_MAP = window.__ADT_ASSET_MAP || null;
  var INLINE = window.__ADT_INLINE || null;
  function url(p) { if (ASSET_MAP && ASSET_MAP[p]) return ASSET_MAP[p]; return p; }
  function fetchJson(p) {
    if (INLINE && INLINE[p] !== undefined) return Promise.resolve(typeof INLINE[p] === "string" ? JSON.parse(INLINE[p]) : INLINE[p]);
    if (INLINE && /\.json$/.test(p)) return Promise.resolve(null);
    return fetch(url(p)).then(function (r) { if (!r.ok) throw new Error(p); return r.json(); }).catch(function () { return null; });
  }
  function fetchText(p) {
    if (INLINE && INLINE[p] !== undefined) return Promise.resolve(String(INLINE[p]));
    return fetch(url(p)).then(function (r) { return r.ok ? r.text() : null; }).catch(function () { return null; });
  }
  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem("adt:" + k)); localStorage.setItem("adt:" + k, JSON.stringify(v)); } catch (e) { return undefined; } }
  function el(tag, attrs, children) { var e = document.createElement(tag); if (attrs) Object.keys(attrs).forEach(function (k) { if (k === "class") e.className = attrs[k]; else if (k === "text") e.textContent = attrs[k]; else if (k === "html") e.innerHTML = attrs[k]; else if (k.indexOf("on") === 0) e.addEventListener(k.slice(2), attrs[k]); else if (attrs[k] != null) e.setAttribute(k, attrs[k]); }); (children || []).forEach(function (c) { if (c) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); }); return e; }
  var ICONS = {
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
    volume: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>',
    volumeX: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>',
    hand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v2"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>',
    languages: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="4" width="4" height="16"/><rect x="15" y="4" width="4" height="16"/></svg>',
    stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>',
    skipBack: '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" stroke-width="2"/></svg>',
    skipFwd: '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" stroke-width="2"/></svg>',
    notepad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    bulb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
  };

  var state = { config: null, pages: [], toc: [], texts: {}, speechTexts: {}, audios: {}, timecodes: {}, glossary: {}, videos: {}, images: {}, ui: {}, lang: null, pageId: null, pageIndex: -1, openPanel: null, player: null, activities: [] };
  var UI_FR = { toc: "Table des matières", glossary: "Glossaire", listen: "Écouter", stopListening: "Arrêter la lecture", sign: "Langue des signes", language: "Langue", settings: "Paramètres", prev: "Page précédente", next: "Page suivante", pageOf: "Page {n} sur {m}", submit: "Valider", nextActivity: "Suivant", reset: "Réinitialiser", allCorrect: "Tout est correct !", review: "{c} correctes · {w} à revoir · {e} vides", easyRead: "Lecture facile", readAloud: "Lecture à voix haute", autoplay: "Lecture automatique", describeImages: "Décrire les images", highlight: "Surlignage", word: "Mot", sentence: "Phrase", theme: "Thème", light: "Clair", dark: "Sombre", system: "Système", iconSize: "Taille des icônes", reduceMotion: "Réduire les animations", dockLayout: "Barre d'outils", compact: "Compacte", full: "Pleine largeur", top: "Haut", bottom: "Bas", center: "Centrée", spread: "Étalée", autoHide: "Masquer automatiquement les menus", shortcuts: "Raccourcis clavier", speed: "Vitesse", volume: "Volume", slow: "Lent", normal: "Normal", fast: "Rapide", veryFast: "Très rapide", onThisPage: "Sur cette page", bookGlossary: "Tout le glossaire", search: "Rechercher", highlightTerms: "Surligner les mots du glossaire", viewInGlossary: "Voir dans le glossaire", variations: "Variantes", notepad: "Bloc-notes", notes: "Mes notes", eli5: "Explique-moi simplement", correct: "Bonne réponse", incorrect: "Essaie encore", checkSpelling: "Vérifie l'orthographe", inappropriate: "Langage inapproprié", remaining: "{n} restants", positionOf: "Position {n} sur {m}", moveUp: "Monter", moveDown: "Descendre", skip: "Aller au contenu", narrator: "Voix du narrateur", tutorial: "Visite guidée", tutorialText: "Utilisez les flèches pour changer de page, le haut-parleur pour écouter, le livre pour le glossaire et l'engrenage pour les paramètres d'accessibilité.", ok: "Compris", trueLabel: "Vrai", falseLabel: "Faux" };
  function t(k, vars) { var s = (state.ui && state.ui[k]) || UI_FR[k] || k; if (vars) Object.keys(vars).forEach(function (v) { s = s.replace("{" + v + "}", vars[v]); }); return s; }
  function prefersDark() { return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches; }
  function setting(k, def) { var cfg = state.config || {}; var locked = (cfg.lockedSettings || []).indexOf(k) >= 0; var d = cfg.defaultSettings || {}; var fromCfg = k === "dockLayout" ? d.dockLayout : d[k]; if (locked && fromCfg !== undefined) return fromCfg; var s = store(k); return s === undefined || s === null ? (fromCfg !== undefined ? fromCfg : def) : s; }
  function isLocked(k) { return ((state.config || {}).lockedSettings || []).indexOf(k) >= 0; }

  // ── Chargement ───────────────────────────────────────────────────────────
  function i18nPath(p) { return "content/i18n/" + state.lang + "/" + p; }
  function loadLanguageData() {
    return Promise.all([fetchJson(i18nPath("texts.json")), fetchJson(i18nPath("speech_texts.json")), fetchJson(i18nPath("audios.json")), fetchJson(i18nPath("timecode/timecode_output.json")), fetchJson(i18nPath("glossary.json")), fetchJson(i18nPath("videos.json")), fetchJson(i18nPath("images.json")), fetchJson("assets/interface_translations/" + state.lang + "/interface_translations.json")]).then(function (r) {
      state.texts = r[0] || {}; state.speechTexts = r[1] || {}; state.audios = r[2] || {}; state.timecodes = r[3] || {}; state.glossary = r[4] || {}; state.videos = r[5] || {}; state.images = r[6] || {}; state.ui = r[7] || {};
      document.documentElement.lang = state.lang;
    });
  }
  function boot() {
    fetchJson("assets/config.json").then(function (cfg) {
      state.config = cfg || { features: {}, languages: { available: ["fr"], default: "fr" } };
      var avail = (state.config.languages && state.config.languages.available) || ["fr"];
      var saved = store("currentLanguage");
      state.lang = avail.indexOf(saved) >= 0 ? saved : (state.config.languages && state.config.languages.default) || avail[0];
      return Promise.all([fetchJson("content/pages.json"), fetchJson("content/toc.json"), loadLanguageData()]);
    }).then(function (r) {
      state.pages = r[0] || []; state.toc = r[1] || [];
      var meta = document.querySelector('meta[name="title-id"]'); state.pageId = meta ? meta.content : null;
      state.pageIndex = state.pages.findIndex(function (p) { return p.section_id === state.pageId; });
      applyTheme(); buildChrome(); initPage(); if (state.config.features && state.config.features.showTutorial && !store("tutorialSeen")) showTutorial();
    }).catch(function (e) { console.error("ADT runtime", e); var c = document.getElementById("content"); if (c) c.classList.remove("opacity-0"); });
  }

  // ── Texte, traduction, lecture facile ────────────────────────────────────
  function easyReadOn() { return !!store("easyReadMode") && state.config.features && state.config.features.easyRead; }
  function textFor(id, forSpeech) {
    var src = forSpeech ? state.speechTexts : state.texts;
    if (easyReadOn() && state.texts[id + "_easy_read"] !== undefined) { var e = (forSpeech && state.speechTexts[id + "_easy_read"]) || state.texts[id + "_easy_read"]; return { text: e, easy: true }; }
    var v = src[id]; if (v === undefined) v = state.texts[id]; return v === undefined ? null : { text: v, easy: false };
  }
  function isHeading(elm) { return /^H[1-6]$/.test(elm.tagName); }
  function applyTranslations() {
    var content = document.getElementById("content"); if (!content) return;
    content.querySelectorAll("[data-id]").forEach(function (elm) {
      var id = elm.getAttribute("data-id"); if (elm.closest("[data-stepper-root]")) return; if (elm.tagName === "SECTION" || elm.querySelector("[data-id]")) return;
      var tr = textFor(id);
      if (elm.tagName === "IMG") { if (tr && !elm.hasAttribute("aria-hidden")) elm.alt = tr.text; var variant = state.images[id]; if (variant) { if (!elm.getAttribute("data-original-src")) elm.setAttribute("data-original-src", elm.getAttribute("src")); elm.src = url("images/" + variant); } else if (elm.getAttribute("data-original-src")) elm.src = elm.getAttribute("data-original-src"); return; }
      if (!tr) return;
      if (tr.easy && (isHeading(elm) || elm.closest(".word-card, [data-activity-item], .activity-text, nav"))) tr = { text: state.texts[id], easy: false };
      if (elm.getAttribute("data-tts-original-html")) elm.removeAttribute("data-tts-original-html");
      if (elm.querySelector("[data-toc-title]")) { var tt = elm.querySelector("[data-toc-title]"); if (tt) tt.textContent = tr.text.replace(/[\s.]*\d+$/, ""); return; }
      if (elm.querySelector(".activity-underline-option")) { var opts = elm.querySelectorAll(".activity-underline-option"); var words = tr.text.split(/\s+/); if (opts.length === words.length) opts.forEach(function (o, i) { o.textContent = words[i]; }); return; }
      if (elm.querySelector(".fitb-inline-input")) return;
      if (tr.easy) { elm.textContent = tr.text; elm.style.whiteSpace = "pre-line"; elm.setAttribute("data-easy-read", "true"); } else { elm.style.whiteSpace = ""; elm.removeAttribute("data-easy-read"); if (elm.getAttribute("data-math") === "true") elm.innerHTML = tr.text; else elm.textContent = tr.text; }
    });
    var titleId = state.pageId; if (titleId && state.texts[titleId]) document.title = state.texts[titleId];
    content.querySelectorAll("[data-placeholder-id]").forEach(function (elm) { var tr = textFor(elm.getAttribute("data-placeholder-id")); if (tr) elm.placeholder = tr.text; });
  }

  // ── Chrome : barre d'outils ──────────────────────────────────────────────
  var dock, panelHost, liveRegion, audioBar, activityDock;
  function iconBtn(icon, label, onClick, extra) { var b = el("button", { class: "adt-dock-btn" + (extra ? " " + extra : ""), type: "button", "aria-label": label, title: label, onclick: onClick }); b.innerHTML = ICONS[icon]; return b; }
  function buildChrome() {
    var host = document.getElementById("nav-container") || document.body.appendChild(el("div", { id: "nav-container" }));
    host.innerHTML = ""; host.setAttribute("role", "region"); host.setAttribute("aria-label", "Outils du lecteur");
    liveRegion = el("div", { class: "sr-only", "aria-live": "polite", "aria-atomic": "true", id: "adt-live" }); host.appendChild(liveRegion);
    var skip = el("a", { href: "#content", class: "adt-skip", text: t("skip") }); host.appendChild(skip);
    panelHost = el("div", { class: "adt-panel-host" }); host.appendChild(panelHost);
    audioBar = el("div", { class: "adt-audio-bar", hidden: "" }); host.appendChild(audioBar);
    activityDock = el("div", { class: "adt-activity-dock", hidden: "" }); host.appendChild(activityDock);
    dock = el("nav", { class: "adt-dock", "aria-label": "Commandes du lecteur" });
    var f = state.config.features || {};
    var left = el("div", { class: "adt-dock-left" });
    var tocBtn = iconBtn("list", t("toc"), function () { togglePanel("toc"); }); tocBtn.appendChild(el("span", { class: "adt-dock-title", text: currentTocTitle() })); left.appendChild(tocBtn);
    var center = el("div", { class: "adt-dock-center" });
    if (f.showNavigationControls !== false) {
      center.appendChild(iconBtn("prev", t("prev"), function () { go(-1); }, "adt-nav-btn"));
      center.appendChild(el("span", { class: "adt-page-indicator", text: t("pageOf", { n: state.pageIndex + 1, m: state.pages.length }) }));
      center.appendChild(iconBtn("next", t("next"), function () { go(1); }, "adt-nav-btn"));
    }
    var right = el("div", { class: "adt-dock-right" });
    if (f.glossary) right.appendChild(iconBtn("book", t("glossary"), function () { togglePanel("glossary"); }));
    if (f.readAloud) { var tts = iconBtn(store("isPlaying") ? "volumeX" : "volume", t("listen"), function () { toggleReadAloud(); }); tts.setAttribute("data-tts-toggle", ""); right.appendChild(tts); }
    if (f.signLanguage && state.videos[state.pageId]) right.appendChild(iconBtn("hand", t("sign"), function () { toggleSignLanguage(); }));
    if (f.notepad) right.appendChild(iconBtn("notepad", t("notepad"), function () { togglePanel("notepad"); }));
    if (f.eli5 && state.texts[state.pageId + "_eli5"]) right.appendChild(iconBtn("bulb", t("eli5"), function () { togglePanel("eli5"); }));
    right.appendChild(iconBtn("languages", t("language"), function () { togglePanel("language"); }));
    right.appendChild(iconBtn("settings", t("settings"), function () { togglePanel("settings"); }));
    dock.appendChild(left); dock.appendChild(center); dock.appendChild(right);
    host.appendChild(dock);
    applyDockLayout();
    document.addEventListener("keydown", onKey);
    setupAutoHide();
    if (store("isPlaying") && f.readAloud && store("autoplayMode") !== false) setTimeout(function () { startReadAloud(); }, 400);
  }
  function currentTocTitle() { var best = null; for (var i = 0; i < state.toc.length; i++) { var e = state.toc[i]; var idx = state.pages.findIndex(function (p) { return p.section_id === e.section_id; }); if (idx <= state.pageIndex && idx >= 0) best = e; } return best ? (state.texts[best.chapter_id] || best.title || "") : ((state.config && state.config.title) || ""); }
  function applyDockLayout() {
    var d = setting("dockLayout", {}) || {}; var body = document.body;
    body.setAttribute("nav-position", d.position || "bottom"); body.setAttribute("nav-size", d.width || "full"); body.setAttribute("nav-align", d.align || "spread");
    body.setAttribute("icon-size", setting("iconSize", "md")); body.setAttribute("reduce-motion", setting("reduceMotion", false) ? "true" : "false");
    requestAnimationFrame(function () { body.style.setProperty("--dock-height", dock.offsetHeight + "px"); });
  }
  function applyTheme() { var th = setting("theme", "system"); var dark = th === "dark" || (th === "system" && prefersDark()); document.body.setAttribute("adt-theme", dark ? "dark" : "light"); }
  function announce(msg) { if (liveRegion) { liveRegion.textContent = ""; setTimeout(function () { liveRegion.textContent = msg; }, 30); } }
  function setupAutoHide() {
    var timer = null, moved = 0, lastX = 0, lastY = 0;
    function hide() { if (!store("stateMode") || state.openPanel || dock.contains(document.activeElement)) return; dock.classList.add("adt-dock-hidden"); }
    function show() { dock.classList.remove("adt-dock-hidden"); clearTimeout(timer); timer = setTimeout(hide, 2000); }
    document.addEventListener("mousemove", function (e) { moved += Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY); lastX = e.clientX; lastY = e.clientY; if (moved > 100) { moved = 0; show(); } });
    document.addEventListener("touchstart", show, { passive: true }); dock.addEventListener("focusin", show);
    if (store("stateMode")) timer = setTimeout(hide, 2000);
  }
  function onKey(e) {
    var tag = (e.target.tagName || "").toLowerCase(); var typing = tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable;
    if (e.key === "Escape") { if (state.openPanel) { closePanel(); e.preventDefault(); } return; }
    if (typing) return;
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      var k = e.key.toLowerCase();
      if (k === "x") { togglePanel("toc"); e.preventDefault(); return; } if (k === "a") { togglePanel("settings"); e.preventDefault(); return; } if (k === "l") { togglePanel("language"); e.preventDefault(); return; }
      if (state.openPanel && state.openPanel !== "audio") return;
      if (e.key === "ArrowRight" || e.key === "PageDown") { go(1); e.preventDefault(); } else if (e.key === "ArrowLeft" || e.key === "PageUp") { go(-1); e.preventDefault(); } else if (e.key === "Home") { goTo(0); e.preventDefault(); } else if (e.key === "End") { goTo(state.pages.length - 1); e.preventDefault(); }
    }
  }

  // ── Navigation ───────────────────────────────────────────────────────────
  function go(delta) { goTo(state.pageIndex + delta); }
  function goTo(idx) { if (idx < 0 || idx >= state.pages.length) return; navigate(state.pages[idx].href); }
  function navigate(href, hash) {
    var target = href + (hash || "");
    if (location.protocol === "file:" || !window.history.pushState || INLINE === null && ASSET_MAP) { location.href = url(href) + (hash || ""); return; }
    fetchText(href).then(function (html) {
      if (!html) { location.href = target; return; }
      var doc = new DOMParser().parseFromString(html, "text/html");
      swapPage(doc, target);
    }).catch(function (e) { console.error("ADT navigation", e); location.href = target; });
  }
  function swapPage(doc, target, noPush) {
    stopReadAloud(true); closePanel(); disposeActivities();
    var newMain = doc.querySelector("main"); var curMain = document.querySelector("main");
    if (!newMain || !curMain) { location.href = target; return; }
    ["title-id", "page-section-id", "viewport"].forEach(function (n) { var o = document.querySelector('meta[name="' + n + '"]'); var nn = doc.querySelector('meta[name="' + n + '"]'); if (o && nn) o.content = nn.content; });
    document.querySelectorAll("style[data-page-style]").forEach(function (s) { s.remove(); }); doc.querySelectorAll("style[data-page-style]").forEach(function (s) { document.head.appendChild(s.cloneNode(true)); });
    document.title = doc.title;
    var bg = doc.body.getAttribute("style"); if (bg) document.body.setAttribute("style", bg);
    curMain.replaceWith(newMain);
    var answers = doc.querySelector("script[data-correct-answers]"); window.correctAnswers = answers ? JSON.parse(answers.textContent) : {};
    try { if (!noPush) history.pushState({ adt: target }, "", target); } catch (e) { }
    var meta = document.querySelector('meta[name="title-id"]'); state.pageId = meta ? meta.content : null; state.pageIndex = state.pages.findIndex(function (p) { return p.section_id === state.pageId; });
    buildChrome(); initPage(); window.scrollTo(0, 0);
    newMain.setAttribute("tabindex", "-1"); newMain.focus({ preventScroll: true });
    var h = newMain.querySelector("h1, h2, h3"); announce(t("pageOf", { n: state.pageIndex + 1, m: state.pages.length }) + (h ? ", " + h.textContent : ""));
    document.dispatchEvent(new CustomEvent("adt:page-changed", { detail: { sectionId: state.pageId } }));
    if (location.hash.indexOf("#glossary=") === 0) locateGlossaryHint();
  }
  window.addEventListener("popstate", function (e) { if (e.state && e.state.adt) fetchText(e.state.adt.split("#")[0]).then(function (html) { if (html) swapPage(new DOMParser().parseFromString(html, "text/html"), e.state.adt, true); }); });

  function initPage() {
    var content = document.getElementById("content");
    applyTranslations(); applyMath();
    if (store("glossaryMode") !== false && state.config.features && state.config.features.glossary) highlightGlossary();
    if (content) content.classList.remove("opacity-0");
    initActivities();
    var hint = /#glossary=(.+)$/.exec(location.hash); if (hint) locateGlossaryHint();
    if (store("signLanguageMode") && state.videos[state.pageId]) showSignVideo();
    document.body.setAttribute("data-activity-dock", activityDock.hidden ? "false" : "true");
  }
  function applyMath() { if (!window.temml) return; document.querySelectorAll('#content [data-id][data-math="true"]').forEach(function (e) { try { e.innerHTML = temml.renderToString(e.textContent, { displayMode: true }); } catch (err) { } }); }

  // ── Panneaux ─────────────────────────────────────────────────────────────
  function closePanel() { state.openPanel = null; panelHost.innerHTML = ""; panelHost.hidden = true; document.querySelectorAll(".adt-dock-btn[aria-expanded]").forEach(function (b) { b.setAttribute("aria-expanded", "false"); }); }
  function togglePanel(name) { if (state.openPanel === name) { closePanel(); return; } openPanel(name); }
  function openPanel(name) {
    panelHost.innerHTML = ""; panelHost.hidden = false; state.openPanel = name;
    var panel = el("div", { class: "adt-panel", role: "dialog", "aria-modal": "false", "aria-label": t(name === "toc" ? "toc" : name) });
    var head = el("div", { class: "adt-panel-head" }, [el("h2", { text: t(name === "toc" ? "toc" : name) }), iconBtn("close", "Fermer", closePanel, "adt-close")]);
    panel.appendChild(head);
    var body = el("div", { class: "adt-panel-body" }); panel.appendChild(body);
    if (name === "toc") renderToc(body); else if (name === "glossary") renderGlossaryPanel(body); else if (name === "language") renderLanguagePanel(body); else if (name === "settings") renderSettingsPanel(body); else if (name === "notepad") renderNotepad(body); else if (name === "eli5") body.appendChild(el("p", { class: "adt-eli5", text: state.texts[state.pageId + "_eli5"] || "" }));
    panelHost.appendChild(panel);
    var focusable = panel.querySelector("input, button:not(.adt-close), a, select"); if (focusable) focusable.focus();
  }
  function renderToc(body) {
    var list = el("ol", { class: "adt-toc" });
    state.toc.forEach(function (e) { var li = el("li", { class: "adt-toc-l" + (e.level || 1) }); var a = el("a", { href: e.href, text: state.texts[e.chapter_id] || e.title, onclick: function (ev) { ev.preventDefault(); closePanel(); navigate(e.href); } }); if (e.section_id === state.pageId) a.setAttribute("aria-current", "page"); li.appendChild(a); list.appendChild(li); });
    if (!state.toc.length) state.pages.forEach(function (p, i) { var li = el("li"); li.appendChild(el("a", { href: p.href, text: t("pageOf", { n: i + 1, m: state.pages.length }), onclick: function (ev) { ev.preventDefault(); closePanel(); navigate(p.href); } })); list.appendChild(li); });
    body.appendChild(list);
  }
  function renderLanguagePanel(body) {
    var avail = (state.config.languages && state.config.languages.available) || [state.lang];
    var list = el("div", { class: "adt-lang-list", role: "radiogroup" });
    avail.forEach(function (code) {
      var b = el("button", { type: "button", role: "radio", "aria-checked": code === state.lang ? "true" : "false", class: "adt-choice" + (code === state.lang ? " adt-choice-on" : ""), text: languageLabel(code), onclick: function () { setLanguage(code); } });
      list.appendChild(b);
    });
    body.appendChild(list);
    if (state.config.features && state.config.features.easyRead) body.appendChild(toggleRow(t("easyRead"), easyReadOn(), function (v) { store("easyReadMode", v); initPage(); }));
  }
  var LANG_NAMES = { fr: "Français", en: "English", es: "Español", pt: "Português", "pt-br": "Português (Brasil)", de: "Deutsch", it: "Italiano", nl: "Nederlands", sq: "Shqip", ar: "العربية", zh: "中文", ja: "日本語", ko: "한국어", ru: "Русский", uk: "Українська", pl: "Polski", ro: "Română", tr: "Türkçe", hi: "हिन्दी", bn: "বাংলা", ur: "اردو", fa: "فارسی", sw: "Kiswahili", am: "አማርኛ", vi: "Tiếng Việt", th: "ไทย", id: "Bahasa Indonesia", el: "Ελληνικά", he: "עברית", ca: "Català", eu: "Euskara", ht: "Kreyòl ayisyen", wo: "Wolof", ln: "Lingála", mg: "Malagasy", dz: "རྫོང་ཁ", si: "සිංහල", ta: "தமிழ்", ne: "नेपाली" };
  function languageLabel(code) { var k = code.toLowerCase(); return (window.__ADT_LANGUAGE_NAMES && window.__ADT_LANGUAGE_NAMES[code]) || LANG_NAMES[k] || LANG_NAMES[k.split("-")[0]] || code; }
  function setLanguage(code) { if (code === state.lang) return; stopReadAloud(true); state.lang = code; store("currentLanguage", code); loadLanguageData().then(function () { closePanel(); buildChrome(); initPage(); announce(languageLabel(code)); }); }
  function toggleRow(label, value, onChange, locked) {
    var id = "adt-t" + Math.random().toString(36).slice(2, 8);
    var row = el("label", { class: "adt-row", for: id }, [el("span", { text: label })]);
    var input = el("input", { type: "checkbox", id: id, role: "switch", class: "adt-switch" }); input.checked = !!value; if (locked) input.disabled = true;
    input.addEventListener("change", function () { onChange(input.checked); }); row.appendChild(input); return row;
  }
  function segmented(label, options, value, onChange) {
    var wrap = el("div", { class: "adt-row adt-row-col" }, [el("span", { text: label })]);
    var group = el("div", { class: "adt-segmented", role: "radiogroup", "aria-label": label });
    options.forEach(function (o) { group.appendChild(el("button", { type: "button", role: "radio", "aria-checked": o[0] === value ? "true" : "false", class: "adt-seg" + (o[0] === value ? " adt-seg-on" : ""), text: o[1], onclick: function () { onChange(o[0]); openPanel("settings"); } })); });
    wrap.appendChild(group); return wrap;
  }
  function renderSettingsPanel(body) {
    var f = state.config.features || {};
    var s1 = el("section", { class: "adt-settings-section" }, [el("h3", { text: "Lecture" })]);
    if (f.easyRead) s1.appendChild(toggleRow(t("easyRead"), easyReadOn(), function (v) { store("easyReadMode", v); initPage(); }));
    if (f.readAloud) {
      s1.appendChild(toggleRow(t("readAloud"), store("readAloudMode") !== false, function (v) { store("readAloudMode", v); if (!v) stopReadAloud(); }));
      s1.appendChild(toggleRow(t("autoplay"), store("autoplayMode") !== false, function (v) { store("autoplayMode", v); }));
      if (f.describeImages) s1.appendChild(toggleRow(t("describeImages"), !!store("describeImagesMode"), function (v) { store("describeImagesMode", v); }));
      if (f.highlight) s1.appendChild(segmented(t("highlight"), [["word", t("word")], ["sentence", t("sentence")]], store("wordHighlightMode") === false ? "sentence" : "word", function (v) { store("wordHighlightMode", v === "word"); }));
      if (state.voices) s1.appendChild(segmented(t("narrator"), Object.keys(state.voices.voices).map(function (k) { return [k, state.voices.voices[k].label || k]; }), store("narratorVoice") || state.voices.defaultVoice, function (v) { store("narratorVoice", v); }));
    }
    body.appendChild(s1);
    if (!isLocked("dockLayout")) {
      var d = setting("dockLayout", {}) || {};
      var s2 = el("section", { class: "adt-settings-section" }, [el("h3", { text: t("dockLayout") })]);
      s2.appendChild(segmented("Largeur", [["compact", t("compact")], ["full", t("full")]], d.width || "full", function (v) { store("dockLayout", Object.assign({}, d, { width: v })); applyDockLayout(); }));
      s2.appendChild(segmented("Position", [["top", t("top")], ["bottom", t("bottom")]], d.position || "bottom", function (v) { store("dockLayout", Object.assign({}, d, { position: v })); applyDockLayout(); }));
      s2.appendChild(segmented("Alignement", [["center", t("center")], ["spread", t("spread")]], d.align || "spread", function (v) { store("dockLayout", Object.assign({}, d, { align: v })); applyDockLayout(); }));
      body.appendChild(s2);
    }
    var s3 = el("section", { class: "adt-settings-section" }, [el("h3", { text: "Accessibilité" })]);
    if (!isLocked("theme")) s3.appendChild(segmented(t("theme"), [["light", t("light")], ["dark", t("dark")], ["system", t("system")]], setting("theme", "system"), function (v) { store("theme", v); applyTheme(); }));
    if (!isLocked("iconSize")) s3.appendChild(segmented(t("iconSize"), [["sm", "S"], ["md", "M"], ["lg", "L"]], setting("iconSize", "md"), function (v) { store("iconSize", v); applyDockLayout(); }));
    if (!isLocked("reduceMotion")) s3.appendChild(toggleRow(t("reduceMotion"), !!setting("reduceMotion", false), function (v) { store("reduceMotion", v); applyDockLayout(); }));
    s3.appendChild(toggleRow(t("autoHide"), !!store("stateMode"), function (v) { store("stateMode", v); if (!v) dock.classList.remove("adt-dock-hidden"); }));
    body.appendChild(s3);
    var s4 = el("section", { class: "adt-settings-section" }, [el("h3", { text: t("shortcuts") }), el("ul", { class: "adt-shortcuts", html: "<li><kbd>X</kbd> " + t("toc") + "</li><li><kbd>A</kbd> " + t("settings") + "</li><li><kbd>L</kbd> " + t("language") + "</li><li><kbd>←</kbd> <kbd>→</kbd> Pages</li><li><kbd>Échap</kbd> Fermer</li>" })]);
    body.appendChild(s4);
    body.appendChild(el("button", { type: "button", class: "adt-btn adt-btn-ghost", text: t("tutorial"), onclick: function () { closePanel(); showTutorial(); } }));
  }
  function renderNotepad(body) { var ta = el("textarea", { class: "adt-notepad", "aria-label": t("notes"), placeholder: t("notes") + "…" }); ta.value = store("notepad-content") || ""; ta.addEventListener("input", function () { store("notepad-content", ta.value); }); body.appendChild(ta); }
  function showTutorial() {
    var ov = el("div", { class: "adt-tutorial", role: "dialog", "aria-modal": "true", "aria-label": t("tutorial") }, [el("div", { class: "adt-tutorial-card" }, [el("h2", { text: t("tutorial") }), el("p", { text: t("tutorialText") }), el("button", { type: "button", class: "adt-btn", text: t("ok"), onclick: function () { ov.remove(); store("tutorialSeen", true); } })])]);
    (document.getElementById("nav-container") || document.body).appendChild(ov); ov.querySelector("button").focus();
  }

  // ── Glossaire ────────────────────────────────────────────────────────────
  function glossaryEntries() { return Object.keys(state.glossary).map(function (k) { return Object.assign({ key: k }, state.glossary[k]); }); }
  function escapeRe(s) { return s.replace(/[.*+?^\${}()|[\]\\]/g, "\\$&"); }
  function highlightGlossary() {
    var content = document.getElementById("content"); if (!content) return;
    content.querySelectorAll(".glossary-term").forEach(function (sp) { sp.replaceWith(document.createTextNode(sp.textContent)); });
    var entries = glossaryEntries(); if (!entries.length) return;
    var forms = [];
    entries.forEach(function (e) { [e.word].concat(e.variations || []).forEach(function (v) { if (v && v.trim()) forms.push({ form: v.trim(), key: e.key }); }); });
    forms.sort(function (a, b) { return b.form.length - a.form.length; });
    var re = new RegExp("(^|[^\\p{L}\\p{N}])(" + forms.map(function (f) { return escapeRe(f.form); }).join("|") + ")(?![\\p{L}\\p{N}])", "giu");
    var seenBase = {};
    var walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, { acceptNode: function (n) { var p = n.parentElement; if (!p || p.closest("h1,h2,h3,h4,h5,h6,.activity-text,[data-activity-item],script,style,.glossary-term,input,textarea,button,select,label.activity-option")) return NodeFilter.FILTER_REJECT; return n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT; } });
    var nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (node) {
      var text = node.nodeValue; var m; var last = 0; var frag = null; re.lastIndex = 0;
      while ((m = re.exec(text))) {
        var form = m[2]; var f = forms.find(function (x) { return x.form.toLowerCase() === form.toLowerCase(); }); if (!f) continue;
        var base = form.toLowerCase().replace(/(es|s)$/, "");
        if (seenBase[f.key + ":" + base]) continue; seenBase[f.key + ":" + base] = true;
        if (!frag) frag = document.createDocumentFragment();
        var start = m.index + m[1].length;
        frag.appendChild(document.createTextNode(text.slice(last, start)));
        var span = el("span", { class: "glossary-term", role: "button", tabindex: "0", "data-glossary-key": f.key, text: form, style: "font: inherit" });
        span.addEventListener("click", function (ev) { openTermPopover(ev.currentTarget, ev.currentTarget.getAttribute("data-glossary-key")); });
        span.addEventListener("keydown", function (ev) { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); openTermPopover(ev.currentTarget, ev.currentTarget.getAttribute("data-glossary-key")); } });
        frag.appendChild(span); last = start + form.length;
      }
      if (frag) { frag.appendChild(document.createTextNode(text.slice(last))); node.replaceWith(frag); }
    });
  }
  function openTermPopover(anchor, key) {
    var e = state.glossary[key]; if (!e) return;
    document.querySelectorAll(".adt-popover").forEach(function (p) { p.remove(); });
    var pop = el("div", { class: "adt-popover", role: "dialog", "aria-label": e.word }, [el("div", { class: "adt-popover-head" }, [el("span", { class: "adt-emoji", text: e.emoji || "" }), el("strong", { text: e.word }), iconBtn("close", "Fermer", function () { pop.remove(); anchor.focus(); }, "adt-close")]), el("p", { text: e.definition })]);
    if (e.image) pop.appendChild(el("img", { src: url(e.image), alt: e.word, class: "adt-popover-img" }));
    if (e.video) { var v = el("video", { src: url(e.video), class: "adt-popover-video", muted: "", loop: "", autoplay: "", playsinline: "" }); pop.appendChild(v); }
    pop.appendChild(el("button", { type: "button", class: "adt-btn adt-btn-ghost", text: t("viewInGlossary"), onclick: function () { pop.remove(); openPanel("glossary"); var d = panelHost.querySelector('[data-term="' + key.replace(/"/g, "") + '"]'); if (d) { d.open = true; d.scrollIntoView(); } } }));
    (document.getElementById("nav-container") || document.body).appendChild(pop);
    var r = anchor.getBoundingClientRect(); pop.style.top = (window.scrollY + r.bottom + 8) + "px"; pop.style.left = Math.max(8, Math.min(window.innerWidth - pop.offsetWidth - 8, window.scrollX + r.left)) + "px";
    pop.querySelector("button").focus();
    var onDoc = function (ev) { if (!pop.contains(ev.target) && ev.target !== anchor) { pop.remove(); document.removeEventListener("mousedown", onDoc); } }; document.addEventListener("mousedown", onDoc);
  }
  function renderGlossaryPanel(body) {
    var entries = glossaryEntries().sort(function (a, b) { return a.word.localeCompare(b.word, state.lang); });
    var content = document.getElementById("content"); var pageText = content ? content.textContent.toLowerCase() : "";
    var onPage = entries.filter(function (e) { return [e.word].concat(e.variations || []).some(function (f) { return f && pageText.indexOf(f.toLowerCase()) >= 0; }); });
    var tabs = el("div", { class: "adt-tabs", role: "tablist" }); var listHost = el("div", { class: "adt-glossary-list" });
    var search = el("input", { type: "search", class: "adt-input", placeholder: t("search"), "aria-label": t("search") });
    var mode = onPage.length ? "page" : "book";
    function render() {
      listHost.innerHTML = ""; var q = search.value.trim().toLowerCase();
      var src = (mode === "page" ? onPage : entries).filter(function (e) { return !q || e.word.toLowerCase().indexOf(q) >= 0 || (e.definition || "").toLowerCase().indexOf(q) >= 0; });
      src.forEach(function (e) {
        var d = el("details", { class: "adt-term", "data-term": e.key }, [el("summary", {}, [el("span", { class: "adt-emoji", text: e.emoji || "" }), el("span", { text: e.word })]), el("p", { text: e.definition })]);
        if (e.image) d.appendChild(el("img", { src: url(e.image), alt: e.word, class: "adt-term-img" }));
        if (e.video) d.appendChild(el("video", { src: url(e.video), controls: "", class: "adt-term-video", playsinline: "" }));
        if (e.variations && e.variations.length) d.appendChild(el("p", { class: "adt-muted", text: t("variations") + " : " + e.variations.join(", ") }));
        if (mode === "page") { var btn = el("button", { type: "button", class: "adt-btn adt-btn-ghost adt-btn-sm", text: "Voir dans la page", onclick: function () { closePanel(); flashTerm(e.key); } }); d.appendChild(btn); }
        listHost.appendChild(d);
      });
      if (!src.length) listHost.appendChild(el("p", { class: "adt-muted", text: "Aucun terme." }));
    }
    [["page", t("onThisPage")], ["book", t("bookGlossary")]].forEach(function (tb) { var b = el("button", { type: "button", role: "tab", "aria-selected": mode === tb[0] ? "true" : "false", class: "adt-tab" + (mode === tb[0] ? " adt-tab-on" : ""), text: tb[1], onclick: function () { mode = tb[0]; tabs.querySelectorAll(".adt-tab").forEach(function (x) { x.classList.remove("adt-tab-on"); x.setAttribute("aria-selected", "false"); }); b.classList.add("adt-tab-on"); b.setAttribute("aria-selected", "true"); render(); } }); tabs.appendChild(b); });
    body.appendChild(tabs); body.appendChild(search); search.addEventListener("input", render);
    body.appendChild(toggleRow(t("highlightTerms"), store("glossaryMode") !== false, function (v) { store("glossaryMode", v); if (v) highlightGlossary(); else document.querySelectorAll(".glossary-term").forEach(function (sp) { sp.replaceWith(document.createTextNode(sp.textContent)); }); }));
    body.appendChild(listHost); render();
  }
  function flashTerm(key) { var sp = document.querySelector('.glossary-term[data-glossary-key="' + key.replace(/"/g, "") + '"]'); if (sp) { sp.scrollIntoView({ block: "center" }); sp.classList.add("glossary-flash"); setTimeout(function () { sp.classList.remove("glossary-flash"); }, 3500); sp.focus(); } }
  function locateGlossaryHint() { var m = /#glossary=(.+)$/.exec(location.hash); if (m) setTimeout(function () { flashTerm(decodeURIComponent(m[1])); }, 200); }

  // ── Lecture à voix haute ─────────────────────────────────────────────────
  var player = { queue: [], index: 0, audio: null, playing: false, raf: null };
  function speakableItems() {
    var content = document.getElementById("content"); if (!content) return [];
    var items = []; var describe = !!store("describeImagesMode"); var audios = currentAudios();
    content.querySelectorAll("[data-id]").forEach(function (elm) {
      if (elm.querySelector("[data-id]")) return;
      var id = elm.getAttribute("data-id"); if (elm.tagName === "IMG" && !describe) return;
      var useEasy = easyReadOn() && audios[id + "_easy_read"] && !isHeading(elm) && !elm.closest(".word-card, [data-activity-item], .activity-text, nav");
      var aid = useEasy ? id + "_easy_read" : id;
      if (audios[aid]) items.push({ el: elm, id: id, audioId: aid, file: audios[aid] });
    });
    return items;
  }
  function currentAudios() { if (state.voices) { var v = store("narratorVoice") || state.voices.defaultVoice; return (state.voices.voices[v] && state.voices.voices[v].audios) || state.audios; } return state.audios; }
  function toggleReadAloud() { if (player.playing) stopReadAloud(); else startReadAloud(); }
  function setTtsIcon(on) { var b = dock && dock.querySelector("[data-tts-toggle]"); if (b) { b.innerHTML = on ? ICONS.volumeX : ICONS.volume; b.setAttribute("aria-label", on ? t("stopListening") : t("listen")); b.setAttribute("aria-pressed", on ? "true" : "false"); } }
  function startReadAloud(fromIndex) {
    player.queue = speakableItems(); if (!player.queue.length) { if (store("isPlaying")) { if (state.pageIndex < state.pages.length - 1 && store("autoplayMode") !== false) go(1); else store("isPlaying", false); } return; }
    player.index = fromIndex || 0; player.playing = true; store("isPlaying", true); setTtsIcon(true); renderAudioBar(); playCurrent();
  }
  function stopReadAloud(silent) { player.playing = false; if (!silent) store("isPlaying", false); if (player.audio) { player.audio.pause(); player.audio = null; } clearHighlight(); setTtsIcon(false); audioBar.hidden = true; if (player.raf) cancelAnimationFrame(player.raf); }
  function playCurrent() {
    if (!player.playing) return;
    if (player.index >= player.queue.length) { stopReadAloud(true); if (store("autoplayMode") !== false && state.pageIndex < state.pages.length - 1) setTimeout(function () { go(1); }, 600); else store("isPlaying", false); return; }
    var item = player.queue[player.index];
    var a = new Audio(url(i18nPath("audio/" + item.file))); player.audio = a;
    a.playbackRate = Number(store("audioSpeed") || 1); a.volume = Number(store("audioVolume") == null ? 1 : store("audioVolume"));
    prepareHighlight(item);
    a.addEventListener("ended", function () { clearHighlight(); player.index++; playCurrent(); });
    a.addEventListener("error", function () { clearHighlight(); player.index++; playCurrent(); });
    a.addEventListener("timeupdate", function () { updateHighlight(item, a.currentTime); });
    item.el.scrollIntoView({ block: "center", behavior: setting("reduceMotion", false) ? "auto" : "smooth" });
    a.play().catch(function () { });
    renderAudioBar();
  }
  var hl = { el: null, spans: null, words: null, lastIdx: -1 };
  function tokenizeForHighlight(text) { var re = /[\p{L}\p{N}\p{M}]+(?:[’'-][\p{L}\p{N}\p{M}]+)*/gu; var out = []; var m; while ((m = re.exec(text))) out.push({ word: m[0], index: m.index }); return out; }
  function prepareHighlight(item) {
    clearHighlight(); hl.el = item.el;
    var wordMode = store("wordHighlightMode") !== false && state.config.features && state.config.features.highlight;
    var tc = currentTimecodes()[item.audioId];
    if (!wordMode || !tc || item.el.tagName === "IMG" || item.el.querySelector("input, textarea, select, img, .fitb-inline-input")) { item.el.classList.add("tts-active-block"); hl.spans = null; return; }
    var words = (tc.timecodes && tc.timecodes[1] && tc.timecodes[1].word_timestamps) || tc.word_timestamps || tc.words || [];
    var text = item.el.textContent; var toks = tokenizeForHighlight(text);
    if (!toks.length) { item.el.classList.add("tts-active-block"); return; }
    item.el.setAttribute("data-tts-original-html", item.el.innerHTML);
    var frag = document.createDocumentFragment(); var last = 0;
    toks.forEach(function (tk, i) { frag.appendChild(document.createTextNode(text.slice(last, tk.index))); frag.appendChild(el("span", { class: "tts-word", "data-word-index": i, text: tk.word })); last = tk.index + tk.word.length; });
    frag.appendChild(document.createTextNode(text.slice(last)));
    item.el.innerHTML = ""; item.el.appendChild(frag);
    hl.spans = item.el.querySelectorAll(".tts-word");
    // alignement : si le nombre de mots diffère, répartition proportionnelle
    if (words.length && words.length !== toks.length) { var dur = words[words.length - 1].end || 0; var total = toks.reduce(function (n, w) { return n + w.word.length + 1; }, 0); var tt = 0; words = toks.map(function (w) { var d = ((w.word.length + 1) / total) * dur; var o = { start: tt, end: tt + d }; tt += d; return o; }); }
    hl.words = words; hl.lastIdx = -1;
  }
  function updateHighlight(item, time) {
    if (!hl.spans || !hl.words) return;
    var idx = -1; for (var i = 0; i < hl.words.length; i++) { if (time >= hl.words[i].start - 0.05) idx = i; else break; }
    if (idx === hl.lastIdx) return; hl.lastIdx = idx;
    hl.spans.forEach(function (s, i) { s.classList.toggle("tts-word-active", i === idx); });
  }
  function clearHighlight() { if (hl.el) { hl.el.classList.remove("tts-active-block"); var orig = hl.el.getAttribute("data-tts-original-html"); if (orig !== null) { hl.el.innerHTML = orig; hl.el.removeAttribute("data-tts-original-html"); } } hl.el = null; hl.spans = null; hl.words = null; }
  function currentTimecodes() { if (state.voiceTimecodes) { var v = store("narratorVoice") || (state.voices && state.voices.defaultVoice); return state.voiceTimecodes[v] || state.timecodes; } return state.timecodes; }
  function renderAudioBar() {
    audioBar.hidden = false; audioBar.innerHTML = "";
    var speed = Number(store("audioSpeed") || 1), vol = store("audioVolume") == null ? 1 : Number(store("audioVolume"));
    audioBar.appendChild(iconBtn("skipBack", "Précédent", function () { if (player.index > 0) { player.index--; if (player.audio) player.audio.pause(); clearHighlight(); playCurrent(); } }));
    var pp = iconBtn(player.audio && !player.audio.paused ? "pause" : "play", player.audio && !player.audio.paused ? "Pause" : "Lecture", function () { if (!player.audio) return; if (player.audio.paused) { player.audio.play(); } else { player.audio.pause(); } renderAudioBar(); }); audioBar.appendChild(pp);
    audioBar.appendChild(iconBtn("skipFwd", "Suivant", function () { if (player.audio) player.audio.pause(); clearHighlight(); player.index++; playCurrent(); }));
    audioBar.appendChild(iconBtn("stop", "Stop", function () { stopReadAloud(); }));
    var sp = el("select", { class: "adt-select", "aria-label": t("speed") }); [[0.5, t("slow")], [1, t("normal")], [1.5, t("fast")], [2, t("veryFast")]].forEach(function (o) { var op = el("option", { value: o[0], text: o[1] }); if (Number(o[0]) === speed) op.selected = true; sp.appendChild(op); }); sp.addEventListener("change", function () { store("audioSpeed", Number(sp.value)); if (player.audio) player.audio.playbackRate = Number(sp.value); }); audioBar.appendChild(sp);
    var vl = el("input", { type: "range", min: "0", max: "1", step: "0.05", value: vol, class: "adt-range", "aria-label": t("volume") }); vl.addEventListener("input", function () { store("audioVolume", Number(vl.value)); if (player.audio) player.audio.volume = Number(vl.value); }); audioBar.appendChild(vl);
    audioBar.appendChild(el("span", { class: "adt-audio-pos", text: (player.index + 1) + " / " + player.queue.length }));
  }

  // ── Langue des signes ────────────────────────────────────────────────────
  function toggleSignLanguage() { var on = !store("signLanguageMode"); store("signLanguageMode", on); if (on) showSignVideo(); else { var v = document.querySelector(".adt-sl-video"); if (v) v.remove(); } }
  function showSignVideo() {
    var file = state.videos[state.pageId]; if (!file) return; var old = document.querySelector(".adt-sl-video"); if (old) old.remove();
    var pos = store("slVideoPosition") || { right: 16, bottom: 90 };
    var box = el("div", { class: "adt-sl-video", role: "region", "aria-label": t("sign") }, [el("video", { src: url(i18nPath("video/" + file)), controls: "", autoplay: "", playsinline: "" }), iconBtn("close", "Fermer", function () { store("signLanguageMode", false); box.remove(); }, "adt-close")]);
    box.style.right = pos.right + "px"; box.style.bottom = pos.bottom + "px"; (document.getElementById("nav-container") || document.body).appendChild(box);
    var dragging = false, sx = 0, sy = 0, sr = 0, sb = 0;
    box.addEventListener("pointerdown", function (e) { if (e.target.tagName === "VIDEO" || e.target.closest("button")) return; dragging = true; sx = e.clientX; sy = e.clientY; sr = parseFloat(box.style.right); sb = parseFloat(box.style.bottom); box.setPointerCapture(e.pointerId); });
    box.addEventListener("pointermove", function (e) { if (!dragging) return; box.style.right = (sr - (e.clientX - sx)) + "px"; box.style.bottom = (sb - (e.clientY - sy)) + "px"; });
    box.addEventListener("pointerup", function () { dragging = false; store("slVideoPosition", { right: parseFloat(box.style.right), bottom: parseFloat(box.style.bottom) }); });
  }

  // ── Activités ────────────────────────────────────────────────────────────
  var SOUNDS = { drop: "assets/sounds/drop.wav", reset: "assets/sounds/reset.wav", success: "assets/sounds/success.wav", error: "assets/sounds/error.wav" };
  function play(sound) { if (store("soundsOff") === true) return; try { var a = new Audio(url(SOUNDS[sound])); a.volume = 0.5; a.play().catch(function () { }); } catch (e) { } }
  function toast(msg, kind) { var tt = el("div", { class: "adt-toast adt-toast-" + (kind || "info"), role: "status", text: msg }); (document.getElementById("nav-container") || document.body).appendChild(tt); setTimeout(function () { tt.classList.add("adt-toast-out"); setTimeout(function () { tt.remove(); }, 400); }, kind === "success" ? 4000 : 5000); }
  function confetti() {
    if (setting("reduceMotion", false)) return;
    var c = el("canvas", { class: "adt-confetti" }); document.body.appendChild(c); c.width = innerWidth; c.height = innerHeight; var g = c.getContext("2d");
    var parts = []; for (var i = 0; i < 120; i++) parts.push({ x: innerWidth / 2 + (Math.random() - 0.5) * 200, y: innerHeight / 2, vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 14 - 4, c: "hsl(" + Math.floor(Math.random() * 360) + ",85%,60%)", s: 5 + Math.random() * 6, r: Math.random() * 6 });
    var t0 = performance.now();
    (function frame(now) { var dt = (now - t0) / 1000; g.clearRect(0, 0, c.width, c.height); parts.forEach(function (p) { p.x += p.vx; p.y += p.vy; p.vy += 0.35; p.r += 0.1; g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.fillRect(-p.s / 2, -p.s / 2, p.s, p.s); g.restore(); }); if (dt < 2.4) requestAnimationFrame(frame); else c.remove(); })(t0);
  }
  function feedback(elm, verdict, msg) {
    elm.classList.remove("adt-correct", "adt-incorrect", "adt-gibberish", "adt-profanity");
    var fc = elm.parentElement && elm.parentElement.querySelector(":scope > .feedback-container.adt-auto"); if (fc) fc.remove();
    if (!verdict) { elm.removeAttribute("aria-invalid"); return; }
    elm.classList.add("adt-" + verdict); elm.setAttribute("aria-invalid", verdict === "correct" ? "false" : "true");
    var icon = verdict === "correct" ? "✓" : verdict === "gibberish" ? "?" : "✗";
    var box = el("span", { class: "feedback-container adt-auto adt-fb-" + verdict, role: "status" }, [el("span", { class: "feedback-icon", text: icon, "aria-hidden": "true" }), el("span", { class: "feedback-text", text: msg || (verdict === "correct" ? t("correct") : verdict === "gibberish" ? t("checkSpelling") : verdict === "profanity" ? t("inappropriate") : t("incorrect")) })]);
    if (elm.parentElement) elm.parentElement.insertBefore(box, elm.nextSibling);
  }
  var PROFANITY = /\b(merde|putain|connard|connasse|salope|enculé|encule|pute|bite|couille|nique|fuck|shit|bitch|asshole|cunt|puta|mierda|cabr[oó]n|coño|pendejo)\b/i;
  function isGibberish(s) { var w = s.trim(); if (w.length < 4) return false; if (/(.)\1{3,}/.test(w)) return true; if (/(qwert|asdf|zxcv|azer|qsdf|wxcv|hjkl)/i.test(w)) return true; var letters = w.replace(/[^\p{L}]/gu, ""); if (letters.length < 4) return false; var vowels = (letters.match(/[aeiouyàâäéèêëîïôöùûüœ]/gi) || []).length / letters.length; return vowels < 0.1 || vowels > 0.85 || /[bcdfghjklmnpqrstvwxz]{5,}/i.test(letters); }
  function classifyText(v) { v = (v || "").trim(); if (!v) return "empty"; if (PROFANITY.test(v)) return "profanity"; if (isGibberish(v)) return "gibberish"; return "clean"; }
  function normalizeAnswer(s) { return String(s == null ? "" : s).trim().toLowerCase().replace(/\s+/g, " ").normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  function matchesAnswer(value, expected) { if (expected === "" || expected == null) return value.trim() !== ""; var alts = String(expected).split("|").map(normalizeAnswer); return alts.indexOf(normalizeAnswer(value)) >= 0; }
  var activityState = { section: null, type: null, submit: null, handlers: [] };
  function pageKey(k) { return (state.pageId || "page") + "_" + k; }
  function setSubmitEnabled(on) { if (activityState.submit) activityState.submit.disabled = !on; }
  function showDock(onSubmit, label) {
    activityDock.hidden = false; activityDock.innerHTML = "";
    var btn = el("button", { type: "button", class: "adt-btn adt-submit", text: label || t("submit"), onclick: onSubmit }); activityState.submit = btn; activityDock.appendChild(btn);
    var reset = el("button", { type: "button", class: "adt-btn adt-btn-ghost", text: t("reset"), onclick: function () { play("reset"); resetActivity(); } }); activityDock.appendChild(reset);
    document.body.setAttribute("data-activity-dock", "true");
  }
  function showNext() { activityDock.innerHTML = ""; activityDock.appendChild(el("button", { type: "button", class: "adt-btn adt-next", text: t("nextActivity"), onclick: function () { go(1); } })); }
  function finish(correct, total, empty) { if (correct === total) { play("success"); confetti(); toast("🎉 " + t("allCorrect"), "success"); markCompleted(); showNext(); } else { play("error"); toast("✍️ " + t("review", { c: correct, w: total - correct - (empty || 0), e: empty || 0 }), "warning"); } }
  function markCompleted() { var done = store("completedActivities") || []; var k = state.pageId; if (done.indexOf(k) < 0) { done.push(k); store("completedActivities", done); try { localStorage.setItem("completedActivities", JSON.stringify(done)); } catch (e) { } } document.dispatchEvent(new CustomEvent("adt:activity-completed", { detail: { sectionId: state.pageId } })); }
  function on(elm, evt, fn) { elm.addEventListener(evt, fn); activityState.handlers.push([elm, evt, fn]); }
  function disposeActivities() { activityState.handlers.forEach(function (h) { h[0].removeEventListener(h[1], h[2]); }); activityState.handlers = []; activityDock.hidden = true; activityDock.innerHTML = ""; document.body.setAttribute("data-activity-dock", "false"); }
  function resetActivity() { initActivities(true); }
  function answers() { return window.correctAnswers || {}; }
  function initActivities(reset) {
    disposeActivities();
    var section = document.querySelector('#content section[data-section-type^="activity_"]'); if (!section) return;
    var type = section.getAttribute("data-section-type"); activityState.section = section; activityState.type = type;
    if (section.getAttribute("data-activity-variant") === "stepper") { initStepper(section); return; }
    if (type === "activity_quiz") { initQuiz(section); return; }
    initWordBank(section);
    if (type === "activity_multiple_choice" || type === "activity_multi_select") initChoice(section, type === "activity_multi_select");
    else if (type === "activity_true_false") initTrueFalse(section);
    else if (type === "activity_fill_in_the_blank" || type === "activity_fill_in_a_table") initFitb(section, reset);
    else if (type === "activity_open_ended_answer") initOpenEnded(section, reset);
    else if (type === "activity_matching") initMatching(section);
    else if (type === "activity_sorting") initSorting(section);
    else if (type === "activity_ordering") initOrdering(section);
    else if (type === "activity_underline_text") initUnderline(section);
    else if (section.querySelector("input, textarea, select")) initGeneric(section, reset);
  }
  // Choix multiple / sélection multiple
  function initChoice(section, multi) {
    var inputs = section.querySelectorAll('input[type="radio"], input[type="checkbox"]');
    section.querySelectorAll(".activity-option").forEach(function (lab) { lab.classList.remove("selected-option", "adt-correct", "adt-incorrect"); var b = lab.querySelector("[data-mc-status-badge]"); if (b) b.remove(); });
    inputs.forEach(function (inp) { inp.checked = false; on(inp, "change", function () { play("drop"); var group = inp.name || inp.getAttribute("data-question-group"); section.querySelectorAll('input[name="' + group + '"]').forEach(function (o) { var l = o.closest(".activity-option"); if (l) l.classList.toggle("selected-option", o.checked); }); var l = inp.closest(".activity-option"); if (l) l.classList.toggle("selected-option", inp.checked); setSubmitEnabled(true); }); });
    showDock(function () {
      var ans = answers(); var groups = {}; inputs.forEach(function (inp) { var g = inp.name || inp.getAttribute("data-question-group") || "g"; (groups[g] = groups[g] || []).push(inp); });
      var correct = 0, total = 0;
      Object.keys(groups).forEach(function (g) {
        total++; var ok = true;
        groups[g].forEach(function (inp) { var id = inp.getAttribute("data-activity-item"); var exp = ans[id]; var isCorrect = exp === true || exp === "true" || exp === 1; var lab = inp.closest(".activity-option"); if (inp.checked !== isCorrect) ok = false; if (lab) { lab.classList.remove("adt-correct", "adt-incorrect"); var badge = lab.querySelector("[data-mc-status-badge]"); if (badge) badge.remove(); if (inp.checked) { lab.classList.add(isCorrect ? "adt-correct" : "adt-incorrect"); var ol = lab.querySelector(".option-letter"); if (ol) ol.appendChild(el("span", { "data-mc-status-badge": "", class: "adt-badge " + (isCorrect ? "adt-badge-ok" : "adt-badge-ko"), text: isCorrect ? "✓" : "✗", "aria-hidden": "true" })); var fc = lab.querySelector(".feedback-container"); if (fc) { fc.classList.remove("hidden"); var ic = fc.querySelector(".feedback-icon"), ft = fc.querySelector(".feedback-text"); if (ic) ic.textContent = isCorrect ? "✓" : "✗"; if (ft) ft.textContent = isCorrect ? t("correct") : t("incorrect"); } } } });
        if (ok) correct++;
      });
      finish(correct, total, 0);
    }); setSubmitEnabled(false);
  }
  function initTrueFalse(section) {
    var inputs = section.querySelectorAll('input[type="radio"]'); inputs.forEach(function (i) { i.checked = false; on(i, "change", function () { play("drop"); setSubmitEnabled(true); }); });
    section.querySelectorAll(".validation-mark").forEach(function (v) { v.classList.add("hidden"); v.textContent = ""; });
    showDock(function () {
      var ans = answers(); var items = {}; inputs.forEach(function (i) { var id = i.getAttribute("data-activity-item"); (items[id] = items[id] || []).push(i); });
      var correct = 0, total = 0, empty = 0;
      Object.keys(items).forEach(function (id) { total++; var sel = items[id].find(function (i) { return i.checked; }); if (!sel) { empty++; return; } var ok = String(ans[id]).toLowerCase() === String(sel.value).toLowerCase(); if (ok) correct++; var lab = sel.closest("label") || sel.parentElement; var mark = lab && lab.querySelector(".validation-mark"); if (mark) { mark.classList.remove("hidden"); mark.textContent = ok ? "✓" : "✗"; mark.className = "validation-mark " + (ok ? "adt-correct" : "adt-incorrect"); } items[id].forEach(function (i) { var l = i.closest("label"); if (l) l.classList.toggle("adt-correct", i === sel && ok); if (l) l.classList.toggle("adt-incorrect", i === sel && !ok); }); });
      finish(correct, total, empty);
    }); setSubmitEnabled(false);
  }
  function initFitb(section, reset) {
    // marqueurs [[blank:item-N(:indice)]] → champs en ligne
    var counter = 0;
    section.querySelectorAll("[data-id]").forEach(function (elm) {
      if (elm.querySelector(".fitb-inline-input")) return;
      var html = elm.innerHTML; if (!/\[\[blank:item-\d+/.test(html)) return;
      elm.innerHTML = html.replace(/\[\[blank:(item-\d+)(?::([^\]]+))?\]\]/g, function (m, id, hint) { counter++; var ans = (answers()[id] || ""); var width = Math.max(4, Math.min(24, String(ans).split("|")[0].length + 2)); return '<input type="text" class="fitb-inline-input" id="fitb-input-' + counter + '" data-activity-item="' + id + '" data-aria-id="aria-' + counter + '-0-0" aria-label="' + (hint ? hint.replace(/"/g, "&quot;") : "Réponse " + counter) + '" placeholder="' + (hint ? hint.replace(/"/g, "&quot;") : "") + '" style="width:' + width + 'ch" autocomplete="off">'; });
    });
    var fields = section.querySelectorAll("input[data-activity-item]:not([type=radio]):not([type=checkbox]), textarea[data-activity-item], select[data-activity-item]");
    fields.forEach(function (f) { var saved = store(pageKey(f.getAttribute("data-aria-id") || f.getAttribute("data-activity-item"))); if (reset) { f.value = ""; store(pageKey(f.getAttribute("data-aria-id") || f.getAttribute("data-activity-item")), ""); } else if (saved && !f.value) f.value = saved; feedback(f, null); on(f, "input", function () { store(pageKey(f.getAttribute("data-aria-id") || f.getAttribute("data-activity-item")), f.value); setSubmitEnabled(true); }); });
    showDock(function () {
      var ans = answers(); var correct = 0, total = 0, empty = 0; var usedValues = {};
      fields.forEach(function (f) { total++; var id = f.getAttribute("data-activity-item"); if (!f.value.trim()) { empty++; feedback(f, "incorrect"); return; } var ok = matchesAnswer(f.value, ans[id]); if (window.interchangeablePairs && ok) { var nv = normalizeAnswer(f.value); if (usedValues[nv]) ok = false; usedValues[nv] = true; } if (ok) correct++; feedback(f, ok ? "correct" : "incorrect"); });
      finish(correct, total, empty);
    }); setSubmitEnabled(fields.length > 0 && Array.prototype.some.call(fields, function (f) { return f.value.trim(); }));
  }
  function initOpenEnded(section, reset) {
    var fields = section.querySelectorAll("input[type=text], textarea");
    fields.forEach(function (f) { var k = pageKey(f.getAttribute("data-aria-id") || f.getAttribute("data-activity-item") || f.id); if (reset) { f.value = ""; store(k, ""); } else { var s = store(k); if (s && !f.value) f.value = s; } feedback(f, null); on(f, "input", function () { store(k, f.value); setSubmitEnabled(Array.prototype.some.call(fields, function (x) { return x.value.trim(); })); }); });
    showDock(function () {
      var correct = 0, total = 0, empty = 0;
      fields.forEach(function (f) { total++; var c = classifyText(f.value); if (c === "empty") { empty++; feedback(f, "incorrect", "Réponse vide"); } else if (c === "clean") { correct++; feedback(f, "correct", "Merci pour ta réponse !"); } else feedback(f, c); });
      finish(correct, total, empty);
    }); setSubmitEnabled(Array.prototype.some.call(fields, function (x) { return x.value.trim(); }));
  }
  function initGeneric(section, reset) { initFitb(section, reset); }
  // Association (glisser-déposer + clavier)
  function initMatching(section) {
    var cards = section.querySelectorAll(".activity-item[data-activity-item]"); var slots = section.querySelectorAll(".dropzone-slot, .dropzone [role=region]");
    var bank = cards.length ? cards[0].parentElement : null; var selected = null; var status = section.querySelector("[data-activity-status]");
    cards.forEach(function (c) { if (bank && c.parentElement !== bank) bank.appendChild(c); c.classList.remove("placed-in-dropzone", "adt-correct", "adt-incorrect", "adt-selected"); c.setAttribute("draggable", "true"); c.setAttribute("tabindex", "0"); if (!c.getAttribute("role")) c.setAttribute("role", "button"); on(c, "dragstart", function (e) { e.dataTransfer.setData("text/plain", c.getAttribute("data-activity-item")); selected = c; }); on(c, "click", function () { cards.forEach(function (x) { x.classList.remove("adt-selected"); }); selected = c; c.classList.add("adt-selected"); announce(c.textContent.trim()); }); on(c, "keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); c.click(); } }); });
    function place(slot, card) { if (!card) return; var prev = slot.querySelector(".activity-item"); if (prev && prev !== card && bank) { bank.appendChild(prev); prev.classList.remove("placed-in-dropzone"); } slot.appendChild(card); card.classList.add("placed-in-dropzone"); card.classList.remove("adt-selected"); selected = null; play("drop"); var remaining = Array.prototype.filter.call(cards, function (c) { return !c.classList.contains("placed-in-dropzone"); }).length; if (status) status.textContent = t("remaining", { n: remaining }); announce(card.textContent.trim() + " → " + (slot.getAttribute("aria-label") || slot.id)); setSubmitEnabled(true); }
    slots.forEach(function (s) { s.setAttribute("tabindex", "0"); s.classList.remove("adt-correct", "adt-incorrect"); on(s, "dragover", function (e) { e.preventDefault(); s.classList.add("adt-dragover"); }); on(s, "dragleave", function () { s.classList.remove("adt-dragover"); }); on(s, "drop", function (e) { e.preventDefault(); s.classList.remove("adt-dragover"); var id = e.dataTransfer.getData("text/plain"); place(s, section.querySelector('.activity-item[data-activity-item="' + id + '"]')); }); on(s, "click", function () { if (selected) place(s, selected); }); on(s, "keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && selected) { e.preventDefault(); place(s, selected); } }); });
    if (bank) { on(bank, "dragover", function (e) { e.preventDefault(); }); on(bank, "drop", function (e) { e.preventDefault(); var id = e.dataTransfer.getData("text/plain"); var c = section.querySelector('.activity-item[data-activity-item="' + id + '"]'); if (c) { bank.appendChild(c); c.classList.remove("placed-in-dropzone"); } }); }
    showDock(function () { var ans = answers(); var correct = 0, total = 0, empty = 0; cards.forEach(function (c) { total++; var id = c.getAttribute("data-activity-item"); var slot = c.closest(".dropzone-slot, .dropzone [role=region]"); if (!slot) { empty++; c.classList.add("adt-incorrect"); return; } var ok = String(ans[id]) === slot.id || String(ans[id]) === slot.getAttribute("data-dropzone-id"); if (ok) correct++; c.classList.add(ok ? "adt-correct" : "adt-incorrect"); slot.classList.add(ok ? "adt-correct" : "adt-incorrect"); }); finish(correct, total, empty); }); setSubmitEnabled(false);
  }
  function initSorting(section) {
    var cards = section.querySelectorAll(".word-card[data-activity-item]"); var cats = section.querySelectorAll(".category[data-activity-category]"); var bank = section.querySelector(".word-bank") || (cards[0] && cards[0].parentElement); var selected = null;
    cards.forEach(function (c) { if (bank && c.parentElement !== bank) bank.appendChild(c); c.classList.remove("placed-word", "adt-correct", "adt-incorrect", "adt-selected"); c.setAttribute("draggable", "true"); c.setAttribute("tabindex", "0"); on(c, "dragstart", function (e) { e.dataTransfer.setData("text/plain", c.getAttribute("data-activity-item")); }); on(c, "click", function () { cards.forEach(function (x) { x.classList.remove("adt-selected"); }); selected = c; c.classList.add("adt-selected"); }); on(c, "keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); c.click(); } }); });
    function place(cat, card) { if (!card) return; var list = cat.querySelector(".word-list") || cat; list.appendChild(card); card.classList.add("placed-word"); card.classList.remove("adt-selected"); selected = null; play("drop"); setSubmitEnabled(true); announce(card.textContent.trim() + " → " + (cat.getAttribute("aria-label") || cat.textContent.trim().slice(0, 40))); }
    cats.forEach(function (cat) { cat.setAttribute("tabindex", "0"); cat.classList.remove("adt-correct", "adt-incorrect"); on(cat, "dragover", function (e) { e.preventDefault(); cat.classList.add("adt-dragover"); }); on(cat, "dragleave", function () { cat.classList.remove("adt-dragover"); }); on(cat, "drop", function (e) { e.preventDefault(); cat.classList.remove("adt-dragover"); place(cat, section.querySelector('.word-card[data-activity-item="' + e.dataTransfer.getData("text/plain") + '"]')); }); on(cat, "click", function (e) { if (selected && !e.target.closest(".word-card")) place(cat, selected); }); on(cat, "keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && selected) { e.preventDefault(); place(cat, selected); } }); });
    if (bank) { on(bank, "dragover", function (e) { e.preventDefault(); }); on(bank, "drop", function (e) { e.preventDefault(); var c = section.querySelector('.word-card[data-activity-item="' + e.dataTransfer.getData("text/plain") + '"]'); if (c) { bank.appendChild(c); c.classList.remove("placed-word"); } }); }
    showDock(function () { var ans = answers(); var correct = 0, total = 0, empty = 0; cards.forEach(function (c) { total++; var cat = c.closest("[data-activity-category]"); if (!cat) { empty++; c.classList.add("adt-incorrect"); return; } var ok = String(ans[c.getAttribute("data-activity-item")]) === cat.getAttribute("data-activity-category"); if (ok) correct++; c.classList.add(ok ? "adt-correct" : "adt-incorrect"); }); finish(correct, total, empty); }); setSubmitEnabled(false);
  }
  function initOrdering(section) {
    var list = section.querySelector("[data-activity-order-list]") || section.querySelector("ol"); if (!list) return;
    var items = Array.prototype.slice.call(list.querySelectorAll("[data-activity-item]"));
    var correctOrder = (section.getAttribute("data-correct-order") || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    if (!correctOrder.length) { var ans = answers(); correctOrder = items.map(function (i) { return i.getAttribute("data-activity-item"); }).sort(function (a, b) { return Number(ans[a]) - Number(ans[b]); }); }
    var verdict = section.querySelector("[data-order-verdict]"); if (verdict) verdict.textContent = "";
    items.forEach(function (li) { li.classList.remove("adt-correct", "adt-incorrect"); li.setAttribute("tabindex", "0"); li.setAttribute("draggable", "true"); if (!li.querySelector("[data-order-move]")) { var ctr = el("span", { class: "adt-order-controls" }, [el("button", { type: "button", "data-order-move": "up", "aria-label": t("moveUp"), text: "▲" }), el("button", { type: "button", "data-order-move": "down", "aria-label": t("moveDown"), text: "▼" })]); li.appendChild(ctr); } });
    function move(li, dir) { var sib = dir < 0 ? li.previousElementSibling : li.nextElementSibling; if (!sib) return; if (dir < 0) list.insertBefore(li, sib); else list.insertBefore(sib, li); play("drop"); li.focus(); var pos = Array.prototype.indexOf.call(list.children, li) + 1; announce(t("positionOf", { n: pos, m: list.children.length })); setSubmitEnabled(true); }
    on(list, "click", function (e) { var b = e.target.closest("[data-order-move]"); if (!b) return; move(b.closest("[data-activity-item]"), b.getAttribute("data-order-move") === "up" ? -1 : 1); });
    on(list, "keydown", function (e) { var li = e.target.closest("[data-activity-item]"); if (!li) return; if (e.key === "ArrowUp") { e.preventDefault(); move(li, -1); } if (e.key === "ArrowDown") { e.preventDefault(); move(li, 1); } });
    var dragged = null; items.forEach(function (li) { on(li, "dragstart", function () { dragged = li; }); on(li, "dragover", function (e) { e.preventDefault(); }); on(li, "drop", function (e) { e.preventDefault(); if (dragged && dragged !== li) { var r = li.getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) list.insertBefore(dragged, li); else list.insertBefore(dragged, li.nextSibling); play("drop"); setSubmitEnabled(true); } }); });
    showDock(function () { var current = Array.prototype.map.call(list.querySelectorAll("[data-activity-item]"), function (i) { return i.getAttribute("data-activity-item"); }); var correct = 0; current.forEach(function (id, i) { var ok = correctOrder[i] === id; if (ok) correct++; var li = list.querySelector('[data-activity-item="' + id + '"]'); li.classList.add(ok ? "adt-correct" : "adt-incorrect"); }); if (verdict) verdict.textContent = correct === current.length ? t("allCorrect") : ""; finish(correct, current.length, 0); }); setSubmitEnabled(true);
  }
  function initUnderline(section) {
    var opts = section.querySelectorAll(".activity-underline-option");
    if (!document.getElementById("underline-text-activity-style")) document.head.appendChild(el("style", { id: "underline-text-activity-style", text: ".activity-underline-option{cursor:pointer;border-bottom:2px dotted transparent;border-radius:3px;padding:0 1px;transition:background .15s}.activity-underline-option:hover,.activity-underline-option:focus-visible{background:rgba(59,130,246,.12);outline:2px solid #3b82f6;outline-offset:1px}.activity-underline-option[aria-checked=true]{text-decoration:underline;text-decoration-thickness:3px;text-decoration-color:#2563eb;background:rgba(37,99,235,.08)}.activity-underline-option.adt-correct{text-decoration-color:#16a34a;background:rgba(22,163,74,.15)}.activity-underline-option.adt-incorrect{text-decoration-color:#dc2626;background:rgba(220,38,38,.15)}" }));
    opts.forEach(function (o) { o.setAttribute("aria-checked", "false"); o.setAttribute("role", "checkbox"); o.setAttribute("tabindex", "0"); o.classList.remove("adt-correct", "adt-incorrect"); function tog() { o.setAttribute("aria-checked", o.getAttribute("aria-checked") === "true" ? "false" : "true"); play("drop"); setSubmitEnabled(true); } on(o, "click", tog); on(o, "keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tog(); } }); });
    showDock(function () { var ans = answers(); var groups = {}; opts.forEach(function (o) { var g = o.getAttribute("data-question-group") || "g"; (groups[g] = groups[g] || []).push(o); }); var correct = 0, total = 0; Object.keys(groups).forEach(function (g) { total++; var ok = true; groups[g].forEach(function (o) { var exp = ans[o.getAttribute("data-activity-item")]; var isC = exp === true || exp === "true"; var sel = o.getAttribute("aria-checked") === "true"; if (sel !== isC) ok = false; if (sel || isC) o.classList.add(sel === isC ? "adt-correct" : "adt-incorrect"); }); if (ok) correct++; }); finish(correct, total, 0); }); setSubmitEnabled(false);
  }
  function initWordBank(section) {
    var chips = section.querySelectorAll("[data-word-bank-chip]"); if (!chips.length) return; var targets = section.querySelectorAll("[data-word-bank-target]"); var sel = null;
    chips.forEach(function (c) { c.setAttribute("tabindex", "0"); c.setAttribute("draggable", "true"); on(c, "click", function () { chips.forEach(function (x) { x.classList.remove("adt-selected"); }); sel = c; c.classList.add("adt-selected"); announce(c.getAttribute("data-word-bank-chip")); }); on(c, "keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); c.click(); } }); on(c, "dragstart", function (e) { e.dataTransfer.setData("text/plain", c.getAttribute("data-word-bank-chip")); }); });
    function set(tg, v) { tg.value = v; tg.dispatchEvent(new Event("input", { bubbles: true })); tg.dispatchEvent(new Event("change", { bubbles: true })); tg.classList.add("bg-emerald-50", "border-emerald-600"); play("drop"); var st = section.querySelector("[data-word-bank-status]"); if (st) st.textContent = v + " placé"; announce(v + " placé"); if (sel) sel.classList.remove("adt-selected"); sel = null; }
    targets.forEach(function (tg) { on(tg, "dragover", function (e) { e.preventDefault(); }); on(tg, "drop", function (e) { e.preventDefault(); set(tg, e.dataTransfer.getData("text/plain")); }); on(tg, "focus", function () { if (sel) set(tg, sel.getAttribute("data-word-bank-chip")); }); on(tg, "keydown", function (e) { if (e.key === "Enter" && sel) { e.preventDefault(); set(tg, sel.getAttribute("data-word-bank-chip")); } }); });
  }
  // Quiz
  function initQuiz(section) {
    var ansEl = document.getElementById("quiz-correct-answers"), expEl = document.getElementById("quiz-explanations");
    var ans = ansEl ? JSON.parse(ansEl.textContent) : (section.getAttribute("data-correct-answers") ? JSON.parse(section.getAttribute("data-correct-answers")) : answers());
    var exps = expEl ? JSON.parse(expEl.textContent) : {};
    var options = section.querySelectorAll(".activity-option"); var done = false;
    options.forEach(function (lab) {
      lab.classList.remove("adt-correct", "adt-incorrect", "selected-option"); var fc = lab.querySelector(".feedback-container"); if (fc) fc.classList.add("hidden");
      var inp = lab.querySelector("input"); if (inp) inp.checked = false;
      function choose() {
        if (done) return; var id = lab.getAttribute("data-activity-item"); var ok = ans[id] === true; if (inp) inp.checked = true;
        lab.classList.add("selected-option"); lab.classList.add(ok ? "adt-correct" : "adt-incorrect");
        var f = lab.querySelector(".feedback-container"); if (f) { f.classList.remove("hidden"); var ft = f.querySelector(".feedback-text"); var expl = lab.getAttribute("data-explanation") || exps[lab.getAttribute("data-explanation-id")] || (state.texts[id + "_exp"]); if (ft && expl) ft.textContent = textFor(id + "_exp") ? textFor(id + "_exp").text : expl; var ic = f.querySelector(".feedback-icon"); if (ic) ic.textContent = ok ? "✓" : "✗"; }
        var vm = lab.querySelector(".validation-mark"); if (vm) vm.textContent = ok ? "✓" : "✗";
        if (ok) { done = true; play("success"); confetti(); markCompleted(); activityDock.hidden = false; showNext(); document.body.setAttribute("data-activity-dock", "true"); } else play("error");
      }
      on(lab, "click", function (e) { e.preventDefault(); choose(); }); on(lab, "keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(); } }); lab.setAttribute("tabindex", "0");
    });
    on(document, "keydown", function (e) { var n = Number(e.key); if (n >= 1 && n <= options.length && !/input|textarea/i.test(e.target.tagName)) options[n - 1].click(); });
  }
  // Activité pas à pas
  function initStepper(section) {
    var data = section.querySelector("script[data-editable-activity]"); if (!data) return; var act; try { act = JSON.parse(data.textContent).activity; } catch (e) { return; }
    var root = section.querySelector("[data-stepper-root]"); if (!root) return; root.innerHTML = ""; var step = 0; var results = [];
    function render() {
      root.innerHTML = ""; var s = act.steps[step]; if (!s) { root.appendChild(el("p", { class: "adt-stepper-done", text: t("allCorrect") })); markCompleted(); activityDock.hidden = false; showNext(); return; }
      root.appendChild(el("p", { class: "adt-muted", text: "Étape " + (step + 1) + " / " + act.steps.length }));
      if (act.instructions && step === 0) root.appendChild(el("p", { text: act.instructions }));
      var prompt = el("div", { class: "adt-step-prompt" }); root.appendChild(prompt);
      var check;
      if (act.kind === "multiple-choice") { prompt.appendChild(el("p", { text: s.prompt || s.question || "" })); var chosen = null; (s.options || []).forEach(function (o, i) { var lab = el("label", { class: "activity-option adt-choice" }, [el("input", { type: "radio", name: "step", value: i }), el("span", { text: o.text || o })]); lab.querySelector("input").addEventListener("change", function () { chosen = o; setSubmitEnabled(true); }); prompt.appendChild(lab); }); check = function () { return !!(chosen && chosen.correct); }; }
      else if (act.kind === "fill-in-the-blank") { var html = (s.prompt || s.text || "").replace(/\[\[blank:[^\]]*\]\]|___+/g, '<input type="text" class="fitb-inline-input" aria-label="Réponse" style="width:10ch">'); prompt.appendChild(el("p", { html: html })); var inputs = prompt.querySelectorAll("input"); inputs.forEach(function (i) { i.addEventListener("input", function () { setSubmitEnabled(true); }); }); check = function () { var ok = true; inputs.forEach(function (i, k) { var exp = (s.answers && s.answers[k]) || (s.answer ? [s.answer] : []); var good = exp.length ? exp.some(function (a) { return normalizeAnswer(a) === normalizeAnswer(i.value); }) : i.value.trim() !== ""; feedback(i, good ? "correct" : "incorrect"); if (!good) ok = false; }); return ok; }; }
      else { prompt.appendChild(el("p", { text: s.prompt || s.question || "" })); var ta = el("textarea", { class: "adt-notepad", "aria-label": "Réponse" }); ta.addEventListener("input", function () { setSubmitEnabled(!!ta.value.trim()); }); prompt.appendChild(ta); check = function () { return classifyText(ta.value) === "clean"; }; }
      var fb = el("p", { class: "adt-step-feedback", role: "status" }); root.appendChild(fb);
      showDock(function () { var ok = check(); fb.textContent = ok ? ((s.feedback && s.feedback.correct) || t("correct")) : ((s.feedback && s.feedback.incorrect) || t("incorrect")); fb.className = "adt-step-feedback " + (ok ? "adt-fb-correct" : "adt-fb-incorrect"); if (ok) { play("success"); results.push(true); setTimeout(function () { step++; render(); }, 1200); } else play("error"); }); setSubmitEnabled(false);
    }
    render();
  }

  // ── Chargement des voix secondaires / horodatages multi-voix ─────────────
  function loadVoices() { return Promise.all([fetchJson(i18nPath("audio_voices.json")), fetchJson(i18nPath("timecode/timecode_voices.json"))]).then(function (r) { state.voices = r[0]; state.voiceTimecodes = r[1]; }); }
  var _ld = loadLanguageData; loadLanguageData = function () { return _ld().then(loadVoices); };

  window.adtRegisterCustomActivity = function (section, api) { showDock(function () { Promise.resolve(api.validate()).then(function (ok) { finish(ok ? 1 : 0, 1, 0); }); }); setSubmitEnabled(true); };
  if (window.__adtPendingCustomActivities) window.__adtPendingCustomActivities.forEach(function (p) { window.adtRegisterCustomActivity(p[0], p[1]); });
  window.ADT = { state: state, player: player, navigate: navigate, openPanel: openPanel, startReadAloud: startReadAloud, stopReadAloud: stopReadAloud, setLanguage: setLanguage };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
`;
