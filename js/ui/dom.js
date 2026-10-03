// Petits utilitaires DOM : création d'éléments, dialogues, notifications, icônes.
import { escapeHtml } from "../util.js";

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = Array.isArray(v) ? v.filter(Boolean).join(" ") : v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "html") el.innerHTML = v;
    else if (k === "value" && (tag === "input" || tag === "textarea" || tag === "select")) el.value = v;
    else if (k === "checked" || k === "disabled" || k === "selected" || k === "open" || k === "hidden" || k === "readOnly" || k === "multiple") el[k] = !!v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  append(el, children);
  return el;
}
export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
export function frag(...children) { return append(document.createDocumentFragment(), children); }

const ICONS = {
  "book-marked": '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/><polyline points="10 2 10 10 13 7 16 10 16 2"/>',
  "file-text": '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  network: '<rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/><path d="M12 12V8"/>',
  "layout-grid": '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  "help-circle": '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  "book-open": '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
  video: '<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  hand: '<path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v2"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
  languages: '<path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>',
  "audio-lines": '<path d="M2 10v3"/><path d="M6 6v11"/><path d="M10 3v18"/><path d="M14 8v7"/><path d="M18 5v13"/><path d="M22 10v3"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  "shield-check": '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  "file-down": '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M12 18v-6"/><path d="m9 15 3 3 3-3"/>',
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  library: '<path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/>',
  scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  play: '<polygon points="6 4 20 12 6 20 6 4"/>', refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>', check: '<polyline points="20 6 9 17 4 12"/>',
  "chevron-right": '<polyline points="9 18 15 12 9 6"/>', "chevron-left": '<polyline points="15 18 9 12 15 6"/>', "chevron-down": '<polyline points="6 9 12 15 18 9"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  sparkles: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  bug: '<path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>', volume: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>', cpu: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/>',
  terminal: '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>', bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  palette: '<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>',
  "arrow-left": '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>', "arrow-right": '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>', rows: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 12h18"/><path d="M3 7h18"/><path d="M3 17h18"/>',
  code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>', monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>', tablet: '<rect x="4" y="2" width="16" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>', smartphone: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',
  "zoom-in": '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>', wand: '<path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8 19 13"/><path d="M15 9h.01"/><path d="M17.8 6.2 19 5"/><path d="m3 21 9-9"/><path d="M12.2 6.2 11 5"/>',
  "more": '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>', clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  "external": '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/>',
  layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
  "align-left": '<line x1="21" y1="6" x2="3" y2="6"/><line x1="15" y1="12" x2="3" y2="12"/><line x1="17" y1="18" x2="3" y2="18"/>', columns: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18"/>',
  "book": '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>', pin: '<line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>',
  "git-merge": '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/>', zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  "folder-up": '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/><path d="M12 10v6"/><path d="m9 13 3-3 3 3"/>',
  "folder-down": '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/><path d="M12 10v6"/><path d="m15 13-3 3-3-3"/>',
  type: '<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>', crop: '<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>',
  "message": '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>', "lightbulb": '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>', star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  pause: '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>', square: '<rect x="3" y="3" width="18" height="18" rx="2"/>', "wrap": '<path d="M3 6h18"/><path d="M3 12h15a3 3 0 1 1 0 6h-4"/><path d="m16 16-2 2 2 2"/><path d="M3 18h7"/>',
  split: '<path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3"/><path d="m15 9 6-6"/>', "chevrons-up-down": '<path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/>',
  "eye-off": '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/>',
  "clipboard": '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>', "arrow-up": '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>', "arrow-down": '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  "package": '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  activity: '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>',
};
export function icon(name, cls = "") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("fill", "none"); svg.setAttribute("stroke", "currentColor"); svg.setAttribute("stroke-width", "2"); svg.setAttribute("stroke-linecap", "round"); svg.setAttribute("stroke-linejoin", "round"); svg.setAttribute("aria-hidden", "true");
  svg.classList.add("icon"); if (cls) svg.classList.add(...cls.split(" "));
  svg.innerHTML = ICONS[name] ?? ICONS.info;
  return svg;
}

// ── Boutons et champs ──────────────────────────────────────────────────────
export function button(label, { onClick, variant = "primary", iconName, size, disabled, title, type = "button", cls = "" } = {}) {
  return h("button", { type, class: ["btn", `btn-${variant}`, size ? `btn-${size}` : "", cls], onClick, disabled, title }, iconName ? icon(iconName) : null, label ? h("span", {}, label) : null);
}
export function field(label, input, { hint, id } = {}) {
  if (id) input.id = id;
  return h("label", { class: "field", for: id }, h("span", { class: "field-label" }, label), input, hint ? h("span", { class: "field-hint" }, hint) : null);
}
export function textInput(attrs = {}) { return h("input", { type: "text", class: "input", ...attrs }); }
export function textarea(attrs = {}) { return h("textarea", { class: "input textarea", rows: 4, ...attrs }); }
export function select(options, value, { onChange, attrs = {} } = {}) {
  const s = h("select", { class: "input select", ...attrs, onChange: (e) => onChange?.(e.target.value, e) });
  for (const o of options) { const [v, l] = Array.isArray(o) ? o : [o, o]; s.appendChild(h("option", { value: v, selected: String(v) === String(value) }, l)); }
  return s;
}
export function switchRow(label, checked, onChange, { hint, disabled } = {}) {
  const input = h("input", { type: "checkbox", role: "switch", class: "switch", checked, disabled, onChange: (e) => onChange(e.target.checked) });
  return h("label", { class: "switch-row" }, h("span", { class: "switch-text" }, h("span", { class: "switch-label" }, label), hint ? h("span", { class: "field-hint" }, hint) : null), input);
}
export function segmented(options, value, onChange, { ariaLabel } = {}) {
  const wrap = h("div", { class: "segmented", role: "radiogroup", "aria-label": ariaLabel });
  const render = () => { clear(wrap); for (const o of options) { const [v, l, desc] = Array.isArray(o) ? o : [o, o]; wrap.appendChild(h("button", { type: "button", role: "radio", "aria-checked": String(v === value), class: ["seg", v === value && "seg-on"], title: desc, onClick: () => { value = v; render(); onChange(v); } }, l)); } };
  render(); return wrap;
}
export function tabs(items, active, onChange) {
  const nav = h("div", { class: "tabs", role: "tablist" });
  for (const it of items) nav.appendChild(h("button", { type: "button", role: "tab", "aria-selected": String(it.key === active), class: ["tab", it.key === active && "tab-on"], onClick: () => onChange(it.key) }, it.label, it.badge != null ? h("span", { class: "badge badge-muted" }, it.badge) : null));
  return nav;
}
export function badge(text, kind = "muted") { return h("span", { class: `badge badge-${kind}` }, text); }
export function card(title, body, { actions, cls, description } = {}) {
  return h("section", { class: ["card", cls] }, (title || actions) ? h("header", { class: "card-head" }, h("div", {}, title ? h("h3", { class: "card-title" }, title) : null, description ? h("p", { class: "muted small" }, description) : null), actions ? h("div", { class: "card-actions" }, actions) : null) : null, h("div", { class: "card-body" }, body));
}
export function empty(title, text, action) { return h("div", { class: "empty" }, icon("info", "icon-lg"), h("h3", {}, title), text ? h("p", { class: "muted" }, text) : null, action ?? null); }
export function spinner(label = "Chargement…") { return h("div", { class: "spinner-wrap", role: "status" }, h("span", { class: "spinner" }), h("span", {}, label)); }
export function progressBar(fraction, label) { return h("div", { class: "progress", role: "progressbar", "aria-valuenow": Math.round(fraction * 100), "aria-valuemin": 0, "aria-valuemax": 100, "aria-label": label }, h("div", { class: "progress-bar", style: { width: `${Math.round(fraction * 100)}%` } })); }

// ── Dialogues ──────────────────────────────────────────────────────────────
export function dialog({ title, body, actions = [], size = "md", onClose, closable = true }) {
  const dlg = h("dialog", { class: ["dialog", `dialog-${size}`] });
  const close = (value) => { if (!dlg.open) return; dlg.close(); dlg.remove(); onClose?.(value); };
  dlg.appendChild(h("div", { class: "dialog-inner" },
    h("header", { class: "dialog-head" }, h("h2", {}, title), closable ? button("", { variant: "ghost", iconName: "x", onClick: () => close(null), title: "Fermer" }) : null),
    h("div", { class: "dialog-body" }, body),
    actions.length ? h("footer", { class: "dialog-foot" }, actions.map((a) => button(a.label, { variant: a.variant ?? "secondary", iconName: a.icon, onClick: async () => { const r = await a.onClick?.(close); if (a.closeOn !== false && r !== false) close(a.value ?? a.label); } }))) : null));
  dlg.addEventListener("cancel", (e) => { e.preventDefault(); if (closable) close(null); });
  dlg.addEventListener("click", (e) => { if (e.target === dlg && closable) close(null); });
  document.body.appendChild(dlg); dlg.showModal();
  return { close, el: dlg };
}
export function confirmDialog({ title, text, confirmLabel = "Confirmer", cancelLabel = "Annuler", danger = false, body }) {
  return new Promise((resolve) => dialog({ title, body: body ?? h("p", {}, text), onClose: (v) => resolve(v === "ok"), actions: [{ label: cancelLabel, variant: "ghost", value: "cancel" }, { label: confirmLabel, variant: danger ? "danger" : "primary", value: "ok" }] }));
}
export function promptDialog({ title, label, value = "", multiline = false, placeholder, confirmLabel = "Valider" }) {
  return new Promise((resolve) => {
    const input = multiline ? textarea({ value, placeholder, rows: 6 }) : textInput({ value, placeholder });
    dialog({ title, body: field(label, input), onClose: (v) => resolve(v === "ok" ? input.value : null), actions: [{ label: "Annuler", variant: "ghost", value: "cancel" }, { label: confirmLabel, variant: "primary", value: "ok" }] });
    setTimeout(() => input.focus(), 50);
  });
}

// ── Notifications ──────────────────────────────────────────────────────────
let toastHost = null;
export function toast(message, { kind = "info", duration, title, action } = {}) {
  if (!toastHost) { toastHost = h("div", { class: "toast-host", "aria-live": "polite" }); document.body.appendChild(toastHost); }
  const prefs = window.__uiPrefs ?? {};
  toastHost.dataset.position = prefs.toastPosition ?? "bottom-right";
  const el = h("div", { class: ["toast", `toast-${kind}`], role: "status" }, icon(kind === "error" ? "alert" : kind === "success" ? "check" : "info"), h("div", { class: "toast-text" }, title ? h("strong", {}, title) : null, h("span", {}, message)), action ? button(action.label, { variant: "ghost", size: "sm", onClick: () => { action.onClick(); el.remove(); } }) : null, button("", { variant: "ghost", size: "sm", iconName: "x", onClick: () => el.remove(), title: "Fermer" }));
  toastHost.appendChild(el);
  const ms = duration ?? (prefs.autoDismiss === false ? 0 : (prefs.autoDismissMs ?? 4000));
  if (ms) setTimeout(() => { el.classList.add("toast-out"); setTimeout(() => el.remove(), 300); }, kind === "error" ? Math.max(ms, 8000) : ms);
  if (prefs.sound !== false && kind !== "info") beep(kind);
  return el;
}
function beep(kind) { try { const ctx = beep.ctx ??= new (window.AudioContext || window.webkitAudioContext)(); const o = ctx.createOscillator(); const g = ctx.createGain(); o.frequency.value = kind === "error" ? 220 : 660; g.gain.value = 0.04; o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.12); } catch { /* silencieux */ } }

export function copyToClipboard(text) { return navigator.clipboard?.writeText(text).then(() => toast("Copié dans le presse-papiers", { kind: "success" })).catch(() => toast("Copie impossible", { kind: "error" })); }
export function md(text) { // mini-Markdown sûr : titres, gras, listes, paragraphes, code
  const lines = escapeHtml(text ?? "").split("\n"); let html = "", inList = false, inCode = false;
  for (const l of lines) {
    if (l.startsWith("```")) { inCode = !inCode; html += inCode ? "<pre>" : "</pre>"; continue; }
    if (inCode) { html += `${l}\n`; continue; }
    const m = /^(#{1,4})\s+(.*)$/.exec(l);
    if (m) { if (inList) { html += "</ul>"; inList = false; } html += `<h${m[1].length + 1}>${m[2]}</h${m[1].length + 1}>`; continue; }
    if (/^\s*[-*]\s+/.test(l)) { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${l.replace(/^\s*[-*]\s+/, "")}</li>`; continue; }
    if (inList) { html += "</ul>"; inList = false; }
    if (!l.trim()) continue;
    html += `<p>${l}</p>`;
  }
  if (inList) html += "</ul>";
  return h("div", { class: "md", html: html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>") });
}
export function dropZone({ accept, label, hint, onFiles, multiple = false }) {
  const input = h("input", { type: "file", accept, multiple, class: "sr-only", onChange: (e) => { const fs = [...e.target.files]; if (fs.length) onFiles(fs); e.target.value = ""; } });
  const zone = h("div", { class: "dropzone", tabindex: 0, role: "button", onClick: () => input.click(), onKeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } } }, icon("upload", "icon-lg"), h("strong", {}, label), hint ? h("span", { class: "muted small" }, hint) : null, input);
  zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("dragover"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));
  zone.addEventListener("drop", (e) => { e.preventDefault(); zone.classList.remove("dragover"); const fs = [...e.dataTransfer.files]; if (fs.length) onFiles(fs); });
  return zone;
}
export function kv(pairs) { return h("dl", { class: "kv" }, pairs.filter(([, v]) => v != null && v !== "").map(([k, v]) => frag(h("dt", {}, k), h("dd", {}, v)))); }
export function blobImg(blobPromise, attrs = {}) {
  const img = h("img", { alt: "", loading: "lazy", ...attrs });
  Promise.resolve(blobPromise).then((b) => { if (b) { const u = URL.createObjectURL(b); img.src = u; img.addEventListener("load", () => setTimeout(() => URL.revokeObjectURL(u), 60000), { once: true }); } });
  return img;
}
export function debounceInput(input, fn, ms = 300) { let t; input.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => fn(input.value), ms); }); return input; }
