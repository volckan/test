// Moteur de gabarits minimal compatible avec un sous-ensemble de Liquid :
//  {{ expr | filtre: arg }}   {% if a == b %}…{% elsif %}…{% else %}…{% endif %}
//  {% unless x %}…{% endunless %}   {% for x in liste %}…{% endfor %} (forloop.first/last/index/index0)
//  {% case x %}{% when "a" %}…{% else %}…{% endcase %}   {% assign a = b %}
//  {% chat role: "system" %}…{% endchat %}   {% image expr %}   {% include "nom" , a: b %}
//  {% comment %}…{% endcomment %}   {%- … -%} (espaces supprimés)
// Rendu → tableau de messages [{ role, parts: [{type:"text",text}|{type:"image",data}] }].

const TOKEN_RE = /(\{%-?\s*[\s\S]*?\s*-?%\})|(\{\{-?\s*[\s\S]*?\s*-?\}\})/g;

function tokenize(src) {
  const out = []; let last = 0; let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(src))) {
    if (m.index > last) out.push({ type: "text", value: src.slice(last, m.index) });
    const raw = m[0];
    const trimL = raw[2] === "-", trimR = raw[raw.length - 3] === "-";
    const inner = raw.slice(trimL ? 3 : 2, trimR ? -3 : -2).trim();
    out.push({ type: raw[1] === "%" ? "tag" : "var", value: inner, trimL, trimR });
    last = m.index + raw.length;
  }
  if (last < src.length) out.push({ type: "text", value: src.slice(last) });
  // application des tirets de suppression d'espaces
  for (let i = 0; i < out.length; i++) {
    const t = out[i];
    if (t.type === "text") continue;
    if (t.trimL && out[i - 1]?.type === "text") out[i - 1].value = out[i - 1].value.replace(/\s+$/, "");
    if (t.trimR && out[i + 1]?.type === "text") out[i + 1].value = out[i + 1].value.replace(/^\s+/, "");
  }
  return out;
}

function parse(tokens) {
  let i = 0;
  function block(enders) {
    const nodes = [];
    while (i < tokens.length) {
      const t = tokens[i];
      if (t.type === "text") { nodes.push({ kind: "text", value: t.value }); i++; continue; }
      if (t.type === "var") { nodes.push({ kind: "var", expr: t.value }); i++; continue; }
      const [name, ...restArr] = t.value.split(/\s+/); const rest = restArr.join(" ");
      if (enders.includes(name)) return { nodes, ender: name, rest };
      i++;
      switch (name) {
        case "if": case "unless": {
          const branches = []; let cond = rest; let cur = block(["elsif", "else", `end${name}`]);
          branches.push({ cond, nodes: cur.nodes, negate: name === "unless" });
          while (cur.ender === "elsif" || cur.ender === "else") {
            const isElse = cur.ender === "else"; const c = cur.rest; i++;
            cur = block(["elsif", "else", `end${name}`]);
            branches.push({ cond: isElse ? null : c, nodes: cur.nodes });
          }
          i++; nodes.push({ kind: "if", branches }); break;
        }
        case "for": {
          const m = /^(\w+)\s+in\s+(.+?)(?:\s+limit:\s*(\d+))?$/.exec(rest);
          const body = block(["endfor"]); i++;
          nodes.push({ kind: "for", item: m?.[1] ?? "item", list: m?.[2] ?? rest, limit: m?.[3] ? Number(m[3]) : null, nodes: body.nodes }); break;
        }
        case "case": {
          const whens = []; let cur = block(["when", "else", "endcase"]);
          while (cur.ender === "when" || cur.ender === "else") {
            const isElse = cur.ender === "else"; const val = cur.rest; i++;
            cur = block(["when", "else", "endcase"]);
            whens.push({ value: isElse ? null : val, nodes: cur.nodes });
          }
          i++; nodes.push({ kind: "case", expr: rest, whens }); break;
        }
        case "chat": { const role = /role:\s*"?(\w+)"?/.exec(rest)?.[1] ?? "user"; const body = block(["endchat"]); i++; nodes.push({ kind: "chat", role, nodes: body.nodes }); break; }
        case "comment": { block(["endcomment"]); i++; break; }
        case "raw": { const body = block(["endraw"]); i++; nodes.push(...body.nodes.map((n) => ({ kind: "text", value: n.value ?? "" }))); break; }
        case "image": nodes.push({ kind: "image", expr: rest }); break;
        case "assign": { const m = /^(\w+)\s*=\s*(.+)$/.exec(rest); nodes.push({ kind: "assign", name: m?.[1], expr: m?.[2] ?? "" }); break; }
        case "include": case "render": {
          const m = /^"?([\w./-]+)"?\s*,?\s*(.*)$/.exec(rest);
          const args = {};
          if (m?.[2]) for (const part of m[2].split(/,\s*/)) { const mm = /^(\w+)\s*:\s*(.+)$/.exec(part.trim()); if (mm) args[mm[1]] = mm[2]; }
          nodes.push({ kind: "include", name: m?.[1], args }); break;
        }
        default: break; // balise inconnue ignorée
      }
    }
    return { nodes, ender: null };
  }
  return block([]).nodes;
}

function getPath(ctx, path) {
  if (path === "true") return true; if (path === "false") return false; if (path === "nil" || path === "null" || path === "empty") return null;
  if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
  const q = /^"(.*)"$|^'(.*)'$/s.exec(path); if (q) return q[1] ?? q[2];
  const parts = path.split(".");
  let v = ctx;
  for (let p of parts) {
    if (v == null) return undefined;
    const idx = /^(\w+)\[(.+)\]$/.exec(p);
    if (idx) { v = v[idx[1]]; if (v == null) return undefined; const k = getPath(ctx, idx[2]); v = v[k]; continue; }
    if (p === "size") { v = Array.isArray(v) || typeof v === "string" ? v.length : typeof v === "object" ? Object.keys(v).length : 0; continue; }
    if (p === "first") { v = v[0]; continue; } if (p === "last") { v = v[v.length - 1]; continue; }
    v = v[p];
  }
  return v;
}

const FILTERS = {
  json: (v) => JSON.stringify(v), escape: (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),
  default: (v, d) => (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length) ? d : v),
  join: (v, sep = ", ") => (Array.isArray(v) ? v.join(sep) : String(v ?? "")),
  upcase: (v) => String(v ?? "").toUpperCase(), downcase: (v) => String(v ?? "").toLowerCase(), capitalize: (v) => { const s = String(v ?? ""); return s.charAt(0).toUpperCase() + s.slice(1); },
  plus: (v, n) => Number(v) + Number(n), minus: (v, n) => Number(v) - Number(n), times: (v, n) => Number(v) * Number(n),
  size: (v) => (v?.length ?? (typeof v === "object" && v ? Object.keys(v).length : 0)), strip: (v) => String(v ?? "").trim(),
  truncate: (v, n = 50) => { const s = String(v ?? ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; },
  replace: (v, a, b = "") => String(v ?? "").split(a).join(b), append: (v, s) => String(v ?? "") + s, prepend: (v, s) => s + String(v ?? ""),
  newline_to_br: (v) => String(v ?? "").replace(/\n/g, "<br>"), round: (v, n = 0) => Number(Number(v).toFixed(n)), split: (v, s) => String(v ?? "").split(s),
  map: (v, k) => (Array.isArray(v) ? v.map((x) => x?.[k]) : []), where: (v, k, val) => (Array.isArray(v) ? v.filter((x) => (val === undefined ? !!x?.[k] : x?.[k] == val)) : []),
  indent: (v, n = 2) => String(v ?? "").split("\n").map((l) => " ".repeat(Number(n)) + l).join("\n"),
};

function evalExpr(ctx, expr) {
  const [head, ...filters] = splitPipes(expr.trim());
  let v = getPath(ctx, head.trim());
  for (const f of filters) {
    const m = /^(\w+)\s*(?::\s*(.*))?$/s.exec(f.trim());
    if (!m) continue;
    const args = m[2] ? splitArgs(m[2]).map((a) => getPath(ctx, a.trim())) : [];
    const fn = FILTERS[m[1]];
    if (fn) v = fn(v, ...args);
  }
  return v;
}
function splitPipes(s) { const out = []; let cur = "", q = null; for (const ch of s) { if (q) { cur += ch; if (ch === q) q = null; } else if (ch === '"' || ch === "'") { q = ch; cur += ch; } else if (ch === "|") { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out; }
function splitArgs(s) { const out = []; let cur = "", q = null; for (const ch of s) { if (q) { cur += ch; if (ch === q) q = null; } else if (ch === '"' || ch === "'") { q = ch; cur += ch; } else if (ch === ",") { out.push(cur); cur = ""; } else cur += ch; } if (cur.trim()) out.push(cur); return out; }

function truthy(v) { return !(v === undefined || v === null || v === false || (Array.isArray(v) && v.length === 0)); }
function evalCond(ctx, cond) {
  if (!cond) return true;
  const ors = cond.split(/\s+or\s+/);
  return ors.some((part) => part.split(/\s+and\s+/).every((atom) => {
    atom = atom.trim(); let neg = false;
    if (atom.startsWith("not ")) { neg = true; atom = atom.slice(4); }
    const m = /^(.+?)\s*(==|!=|>=|<=|>|<|contains)\s*(.+)$/.exec(atom);
    let r;
    if (m) {
      const a = evalExpr(ctx, m[1]), b = evalExpr(ctx, m[3]);
      switch (m[2]) {
        case "==": r = a == b || (a == null && b === "") || (a === "" && b == null); if (b === "" && Array.isArray(a)) r = a.length === 0; break;
        case "!=": r = !(a == b || (a == null && b === "") || (a === "" && b == null)); if (b === "" && Array.isArray(a)) r = a.length > 0; break;
        case ">": r = a > b; break; case "<": r = a < b; break; case ">=": r = a >= b; break; case "<=": r = a <= b; break;
        case "contains": r = Array.isArray(a) ? a.includes(b) : String(a ?? "").includes(String(b)); break;
      }
    } else r = truthy(evalExpr(ctx, atom));
    return neg ? !r : r;
  }));
}

/**
 * Rend un gabarit. `partials` : { nom → source }. Retourne { messages, text }.
 * messages : [{ role, parts }] ; si aucun bloc chat, un seul message user.
 */
export function renderPrompt(source, context, partials = {}) {
  const ast = parse(tokenize(source));
  const messages = [];
  let current = null;
  const ensure = (role = "user") => { if (!current) { current = { role, parts: [] }; messages.push(current); } return current; };
  const pushText = (s) => { if (!s) return; const msg = ensure(); const last = msg.parts[msg.parts.length - 1]; if (last?.type === "text") last.text += s; else msg.parts.push({ type: "text", text: s }); };
  const ctx = { ...context };

  function run(nodes, scope) {
    for (const n of nodes) {
      switch (n.kind) {
        case "text": pushText(n.value); break;
        case "var": { const v = evalExpr(scope, n.expr); pushText(v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v)); break; }
        case "if": {
          for (const b of n.branches) {
            const ok = b.cond === null ? true : (b.negate ? !evalCond(scope, b.cond) : evalCond(scope, b.cond));
            if (ok) { run(b.nodes, scope); break; }
          }
          break;
        }
        case "for": {
          let list = evalExpr(scope, n.list);
          if (list && typeof list === "object" && !Array.isArray(list)) list = Object.entries(list).map(([k, v]) => ({ key: k, value: v, ...(typeof v === "object" ? v : {}) }));
          if (!Array.isArray(list)) break;
          if (n.limit) list = list.slice(0, n.limit);
          list.forEach((item, idx) => run(n.nodes, { ...scope, [n.item]: item, forloop: { index: idx + 1, index0: idx, first: idx === 0, last: idx === list.length - 1, length: list.length } }));
          break;
        }
        case "case": {
          const v = evalExpr(scope, n.expr);
          const hit = n.whens.find((w) => w.value !== null && w.value.split(/\s*,\s*|\s+or\s+/).some((c) => evalExpr(scope, c) == v)) ?? n.whens.find((w) => w.value === null);
          if (hit) run(hit.nodes, scope); break;
        }
        case "chat": { current = { role: n.role, parts: [] }; messages.push(current); run(n.nodes, scope); current = null; break; }
        case "image": { const v = evalExpr(scope, n.expr); if (v) ensure().parts.push({ type: "image", data: v }); break; }
        case "assign": scope[n.name] = evalExpr(scope, n.expr); ctx[n.name] = scope[n.name]; break;
        case "include": {
          const src = partials[n.name] ?? partials[`_${n.name}`];
          if (!src) { pushText(`[gabarit manquant : ${n.name}]`); break; }
          const sub = { ...scope }; for (const [k, e] of Object.entries(n.args)) sub[k] = evalExpr(scope, e);
          run(parse(tokenize(src)), sub); break;
        }
      }
    }
  }
  run(ast, ctx);
  for (const m of messages) for (const p of m.parts) if (p.type === "text") p.text = p.text.replace(/\n{3,}/g, "\n\n").trim();
  const text = messages.map((m) => m.parts.filter((p) => p.type === "text").map((p) => p.text).join("\n")).join("\n\n");
  return { messages: messages.filter((m) => m.parts.length), text };
}

/** Variables référencées dans un gabarit (pour l'aide à l'édition). */
export function promptVariables(source) {
  const vars = new Set();
  for (const t of tokenize(source)) {
    if (t.type === "var") vars.add(t.value.split("|")[0].trim().split(".")[0]);
    if (t.type === "tag") { const m = /^(?:if|unless|for \w+ in|case|image)\s+(.+)$/.exec(t.value); if (m) for (const w of m[1].split(/\s+/)) if (/^[a-z_]\w*$/i.test(w) && !["and", "or", "not", "contains", "size", "true", "false"].includes(w)) vars.add(w.split(".")[0]); }
  }
  return [...vars];
}
