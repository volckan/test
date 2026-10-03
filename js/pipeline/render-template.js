// Rendu par gabarits (Liquid simplifié) : deux colonnes, histoire en deux colonnes, colonne unique.
import { renderPrompt } from "../llm/prompt-engine.js";
import { getSetting, setSetting } from "../db.js";

export const DEFAULT_TEMPLATES = {
  _render_node: `{%- for node in nodes -%}
{%- if node.role == "image" -%}
<img data-id="{{ node.node_id | escape }}" src="{{ node.image_url | escape }}" alt="" class="max-w-full h-auto">
{%- elsif node.role == "chapter_title" -%}
<h1 class="adt-h1 font-bold" data-id="{{ node.node_id | escape }}">{{ node.text | escape }}</h1>
{%- elsif node.role == "section_heading" -%}
<h2 class="adt-h2 font-bold" data-id="{{ node.node_id | escape }}">{{ node.text | escape }}</h2>
{%- elsif node.role == "subheading" -%}
<h3 class="adt-h3 font-semibold" data-id="{{ node.node_id | escape }}">{{ node.text | escape }}</h3>
{%- elsif node.role == "heading" and node.heading_level -%}
<h{{ node.heading_level }} class="adt-h{{ node.heading_level }} font-semibold" data-id="{{ node.node_id | escape }}">{{ node.text | escape }}</h{{ node.heading_level }}>
{%- elsif node.role == "heading" -%}
<h2 class="adt-h2 font-bold" data-id="{{ node.node_id | escape }}">{{ node.text | escape }}</h2>
{%- elsif node.role == "caption" -%}
<figcaption class="adt-caption italic opacity-80" data-id="{{ node.node_id | escape }}">{{ node.text | escape }}</figcaption>
{%- elsif node.role == "math" -%}
<div class="adt-body overflow-x-auto" data-id="{{ node.node_id | escape }}">{{ node.text | escape }}</div>
{%- elsif node.role == "activity_fill_in_the_blank" -%}
<p class="adt-body fitb-sentence" data-id="{{ node.node_id | escape }}">{{ node.text | escape }}</p>
{%- elsif node.role -%}
<p class="adt-body" data-id="{{ node.node_id | escape }}">{{ node.text | escape }}</p>
{%- elsif node.structure == "image_group" -%}
<figure class="my-4 flex flex-col items-center gap-2">{% if node.children.size > 0 and depth < 8 %}{%- assign _child_depth = depth | plus: 1 -%}{% include "_render_node", nodes: node.children, depth: _child_depth %}{% endif %}</figure>
{%- elsif node.structure == "group" or node.structure == "activity" -%}
<div class="space-y-3" data-id="{{ node.node_id | escape }}">{% if node.children.size > 0 and depth < 8 %}{%- assign _child_depth = depth | plus: 1 -%}{% include "_render_node", nodes: node.children, depth: _child_depth %}{% endif %}</div>
{%- elsif node.structure == "paragraph" -%}
<p class="adt-body">{% if node.children.size > 0 and depth < 8 %}{% include "_render_inline", nodes: node.children %}{% endif %}</p>
{%- elsif node.structure == "heading" -%}
{%- assign heading_child = node.children[0] -%}
{%- if heading_child.role == "chapter_title" -%}<h1 class="adt-h1 font-bold">{% include "_render_inline", nodes: node.children %}</h1>
{%- elsif heading_child.role == "section_heading" -%}<h2 class="adt-h2 font-bold">{% include "_render_inline", nodes: node.children %}</h2>
{%- elsif heading_child.role == "subheading" -%}<h3 class="adt-h3 font-semibold">{% include "_render_inline", nodes: node.children %}</h3>
{%- elsif heading_child.heading_level -%}<h{{ heading_child.heading_level }} class="adt-h{{ heading_child.heading_level }} font-semibold">{% include "_render_inline", nodes: node.children %}</h{{ heading_child.heading_level }}>
{%- else -%}<h2 class="adt-h2 font-bold">{% include "_render_inline", nodes: node.children %}</h2>{%- endif -%}
{%- elsif node.structure == "list" -%}
<ul class="adt-body list-disc list-inside space-y-1 pl-4">{% if node.children.size > 0 and depth < 8 %}{%- assign _child_depth = depth | plus: 1 -%}{% include "_render_node", nodes: node.children, depth: _child_depth %}{% endif %}</ul>
{%- elsif node.structure == "list_item" or node.structure == "activity_option" -%}
<li>{% if node.children.size > 0 and depth < 8 %}{% include "_render_inline", nodes: node.children %}{% endif %}</li>
{%- elsif node.structure == "table" -%}
<table class="adt-body w-full border-collapse my-4"><tbody>{% if node.children.size > 0 and depth < 8 %}{%- assign _child_depth = depth | plus: 1 -%}{% include "_render_node", nodes: node.children, depth: _child_depth %}{% endif %}</tbody></table>
{%- elsif node.structure == "table_row" -%}
<tr>{% if node.children.size > 0 and depth < 8 %}{%- assign _child_depth = depth | plus: 1 -%}{% include "_render_node", nodes: node.children, depth: _child_depth %}{% endif %}</tr>
{%- elsif node.structure == "table_cell" -%}
<td class="border border-gray-300 px-3 py-2 align-top">{% if node.children.size > 0 and depth < 8 %}{% include "_render_inline", nodes: node.children %}{% endif %}</td>
{%- elsif node.structure == "sidebar" -%}
<aside class="border-l-4 border-gray-300 pl-4 my-4 space-y-2">{% if node.children.size > 0 and depth < 8 %}{%- assign _child_depth = depth | plus: 1 -%}{% include "_render_node", nodes: node.children, depth: _child_depth %}{% endif %}</aside>
{%- elsif node.structure == "panel" -%}
<div class="border rounded-lg p-4 my-4 space-y-2">{% if node.children.size > 0 and depth < 8 %}{%- assign _child_depth = depth | plus: 1 -%}{% include "_render_node", nodes: node.children, depth: _child_depth %}{% endif %}</div>
{%- elsif node.structure == "preformatted" -%}
<pre class="adt-body whitespace-pre-wrap font-sans">{% if node.children.size > 0 and depth < 8 %}{% include "_render_lines", nodes: node.children %}{% endif %}</pre>
{%- else -%}
<div class="space-y-2">{% if node.children.size > 0 and depth < 8 %}{%- assign _child_depth = depth | plus: 1 -%}{% include "_render_node", nodes: node.children, depth: _child_depth %}{% endif %}</div>
{%- endif -%}
{%- endfor -%}`,
  _render_inline: `{%- for node in nodes -%}
{%- unless forloop.first %} {% endunless -%}
{%- if node.role == "image" -%}
<img data-id="{{ node.node_id | escape }}" src="{{ node.image_url | escape }}" alt="" class="inline-block max-w-full h-auto">
{%- elsif node.role == "math" -%}
<span data-id="{{ node.node_id | escape }}">{{ node.text | escape }}</span>
{%- elsif node.role -%}
<span data-id="{{ node.node_id | escape }}">{{ node.text | escape }}</span>
{%- else -%}
{% include "_render_node", nodes: node.children, depth: 0 %}
{%- endif -%}
{%- endfor -%}`,
  _render_lines: `{%- for node in nodes -%}
{%- if node.role == "image" -%}<img data-id="{{ node.node_id | escape }}" src="{{ node.image_url | escape }}" alt="" class="max-w-full h-auto">
{%- elsif node.role -%}<span class="block" data-id="{{ node.node_id | escape }}">{{ node.text | escape }}</span>
{%- else -%}{% include "_render_node", nodes: node.children, depth: 0 %}{%- endif -%}
{%- endfor -%}`,
  two_column_render: `<div id="content" class="container mx-auto w-full min-h-screen px-8 max-sm:px-4 py-8 flex items-center justify-center" style="background-color: {{ background_color | escape }};">
    <section data-section-type="{{ section_type | escape }}" data-section-id="{{ section_id | escape }}" class="w-full">
        <div class="flex flex-col lg:flex-row px-8 max-sm:px-2 items-start gap-8 max-w-none w-full">
            {%- if image_nodes.size > 0 and text_nodes.size > 0 -%}
                <div class="basis-full lg:basis-1/2 p-4 flex flex-col items-start space-y-4" style="color: {{ text_color | escape }};">
                    {% include "_render_node", nodes: text_nodes, depth: 0 %}
                </div>
                <div class="basis-full lg:basis-1/2 p-4 flex flex-col items-center lg:justify-center space-y-4" style="color: {{ text_color | escape }};">
                    {% include "_render_node", nodes: image_nodes, depth: 0 %}
                </div>
            {%- else -%}
                <div class="basis-full p-4 flex flex-col items-start space-y-4" style="color: {{ text_color | escape }};">
                    {% include "_render_node", nodes: nodes, depth: 0 %}
                </div>
            {%- endif -%}
        </div>
    </section>
</div>`,
  two_column_story: `{%- assign container_bg = "#FFFAF5" -%}
{%- if background_color and background_color != "" and background_color != "#ffffff" -%}{%- assign container_bg = background_color -%}{%- endif -%}
{%- assign content_color = "#2d2a26" -%}
{%- if text_color and text_color != "" and text_color != "#000000" -%}{%- assign content_color = text_color -%}{%- endif -%}
<div id="content" class="container mx-auto flex min-h-screen w-full items-center justify-center px-6 py-12" style="background-color: {{ container_bg | escape }};">
    <section data-section-type="{{ section_type | escape }}" data-section-id="{{ section_id | escape }}" style="color: {{ content_color | escape }};" class="w-full">
        <div class="mx-auto flex w-full max-w-6xl flex-col items-center gap-12 rounded-[32px] px-6 py-10 lg:flex-row lg:items-stretch lg:px-10 lg:py-16">
            {%- if image_nodes.size > 0 -%}
                <div class="flex w-full max-w-xl flex-shrink-0 items-center justify-center">
                    {% include "_render_node", nodes: image_nodes, depth: 0 %}
                </div>
            {%- endif -%}
            {%- if text_nodes.size > 0 -%}
                <div class="flex w-full flex-col justify-center">
                    <div class="adt-body space-y-8 text-center leading-relaxed font-medium lg:text-left">
                        {% include "_render_node", nodes: text_nodes, depth: 0 %}
                    </div>
                </div>
            {%- endif -%}
        </div>
    </section>
</div>`,
  one_column_render: `<div id="content" class="container mx-auto w-full max-w-3xl px-8 max-sm:px-4 py-10" style="background-color: {{ background_color | default: '#ffffff' | escape }}; color: {{ text_color | default: '#1a1a1a' | escape }};">
    <section data-section-type="{{ section_type | escape }}" data-section-id="{{ section_id | escape }}" class="w-full space-y-6">
        {% include "_render_node", nodes: nodes, depth: 0 %}
    </section>
</div>`,
};

export const TEMPLATE_LABELS = { two_column_render: "Deux colonnes", two_column_story: "Histoire en deux colonnes", one_column_render: "Colonne unique", _render_node: "Partiel : nœuds (blocs)", _render_inline: "Partiel : nœuds (en ligne)", _render_lines: "Partiel : lignes préformatées" };

export async function getTemplateSource(name, { label } = {}) {
  if (label) { try { const { BookStorage } = await import("../storage.js"); const row = await new BookStorage(label).getNodeData("template", name); if (row?.source) return row.source; } catch { /* ignore */ } }
  const g = await getSetting("templates", {});
  return g[name] ?? DEFAULT_TEMPLATES[name];
}
export async function setGlobalTemplate(name, source) { const g = await getSetting("templates", {}); if (source == null) delete g[name]; else g[name] = source; await setSetting("templates", g); }

function subtreeHasImage(n) { if (n.role === "image") return true; return (n.children ?? []).some(subtreeHasImage); }
export function partitionNodes(nodes) {
  const image_nodes = [], text_nodes = [];
  for (const node of nodes) {
    const children = node.children ?? [];
    const imgs = children.filter((c) => c.role === "image"), others = children.filter((c) => c.role !== "image");
    if (node.structure === "image_group" && imgs.length && others.length) { image_nodes.push(...imgs); text_nodes.push(...others); }
    else if (subtreeHasImage(node)) image_nodes.push(node); else text_nodes.push(node);
  }
  return { image_nodes, text_nodes };
}

/** Rend une section avec un gabarit. `renderNodes` au format toRenderNodes. */
export async function renderSectionTemplate({ templateName, section, renderNodes, label }) {
  const partials = {};
  for (const n of ["_render_node", "_render_inline", "_render_lines"]) partials[n] = await getTemplateSource(n, { label });
  const source = await getTemplateSource(templateName, { label });
  if (!source) throw new Error(`Gabarit inconnu : ${templateName}`);
  const { image_nodes, text_nodes } = partitionNodes(renderNodes);
  const ctx = { section_id: section.sectionId, section_type: section.sectionType, background_color: section.backgroundColor, text_color: section.textColor, nodes: renderNodes, image_nodes, text_nodes };
  const { text } = renderPrompt(source, ctx, partials);
  return text;
}
