# do_build_artifact

Build a single HTML artifact from an artifact spec and pre-existing research data.

This command is called by the build pipeline to produce a polished, self-contained HTML presentation of research data. Your job is to read the artifact spec, understand its goal and audience, select and transform the relevant data from `outputs_ai/`, and produce a branded HTML file.

## Non-Interactive Runtime Contract

This is a web-triggered artifact build. Never ask for confirmation or wait for input. When a design decision is needed, make it — you are the designer. The user controls *what* and *why* via the spec; you control *how*.

## Instructions

### Step 1: Read Provided Context

The build pipeline has prepared the following context for you:

1. **Artifact spec** — A `.artifact.md` file with YAML frontmatter (structured fields: name, format, lifecycle, sources, scope, design) and a markdown body (goal, content guidance, visualization direction). The **goal in the spec body is authoritative** — it takes priority over everything else.
2. **Source data** — The contents of files listed in the spec's `sources:` field (resolved from `outputs_ai/`, wiki pages, directed outputs, etc.). This is your raw material.
3. **Design identity** — The `human_design_identity.md` file defining brand colors, fonts, logos, and design tokens.
4. **Project context** — The `project.md` provides secondary guidance on the project's overall purpose. The artifact goal governs; the project goal provides background.

### Step 2: Plan the Artifact

Before writing HTML, plan your approach:

1. **Content selection** — Which findings, data points, and conclusions from the source data matter for this artifact's goal and audience?
2. **Content transformation** — What needs to be summarized, tabulated, visualized, or extracted? Follow any `## Content Transformations` section in the spec body.
3. **Information architecture** — How should content be organized? Use tabs, sections, drill-downs, or whatever structure best serves the audience.
4. **Visualization plan** — Follow any `## Visualizations` section in the spec. If no visualization guidance is given, decide yourself. **Outputs must be informatically dense but not all text** — use clear, labeled visual depictions: SVG diagrams, status matrices, charts, color-coded indicators.

### Step 3: Produce the HTML File

Write a **single self-contained HTML file** to the path specified in the prompt (typically `artifacts/builds/{slug}/index.html`).

**Self-contained means:**
- All CSS in `<style>` blocks (no external stylesheets)
- All JavaScript in `<script>` blocks (no external JS files)
- Inline SVG for diagrams, charts, and illustrations
- No npm, no build tools, no React — just HTML + CSS + vanilla JS
- The file must render correctly when opened directly in a browser (file://) with no server

**For larger visualizations**, you may use a single CDN-linked lightweight library if necessary (e.g., Chart.js). Prefer inline SVG when feasible.

**Design requirements:**
- Apply brand colors, fonts, and design tokens from `human_design_identity.md`
- Use semantic HTML: `<header>`, `<main>`, `<section>`, `<aside>`, `<nav>`, `<footer>`
- Responsive layout with CSS Flexbox/Grid and media queries
- Dark/light theme support if specified in the spec's `design.theme` field
- Print-friendly CSS (`@media print` rules) for artifacts the user might export

**Readability contract:**
- All text content must be fully visible without clipping, truncation, or overflow hiding. Do not use `overflow: hidden` on any element that contains text labels.
- Data labels inside bar charts, progress indicators, or badge elements must have enough width to display their full text. If a proportional-width bar would be too narrow for its label, place the label outside the bar (to the right, or above it) instead of inside.
- Use `min-width` on labelled elements that is wide enough for the longest expected label text at the chosen font size.
- Test mentally: at 1024px viewport width, can every label, percentage, and data value be read without horizontal scrolling or squinting? If not, restructure the layout.
- SVG text elements must have enough space within their parent shape to render fully. If text would overflow an SVG region (polygon, rect, circle), place the label adjacent to the shape instead of inside it.
- When data involves narrow numeric ranges (e.g., "0-5%", "2-7%"), default to a readable table layout. Offer an optional "chart view" toggle if a visual bar/band representation would also be useful, but the table must be the default.

**Interaction discipline:**

Interactions should help users focus, not force them to hunt. Apply this hierarchy:

1. **Always visible** (default): All primary analytical content — findings, data tables, comparisons, risk assessments, rationale, permitted/prohibited actions — must be visible without any user interaction. The artifact should be fully readable as a static document.

2. **Filter and highlight** (good interaction): Tabs or toggles that filter a dataset or highlight a subset while keeping the overall structure visible are acceptable. Example: clicking a scenario name highlights its column in a comparison table while keeping other columns visible but dimmed.

3. **Collapse/expand** (high bar — supplementary content only): Use accordions or collapsible sections ONLY for genuinely supplementary content that a user would typically skip — detailed methodology notes, raw data sources, lengthy disclaimers, or verbose backup material. Never collapse primary content like strategy rationale, permitted/prohibited actions, risk assessments, or data comparisons.

   Test: if removing the collapsed section would leave a gap in the reader's understanding of the main argument, it should NOT be collapsed.

4. **Hover-only content** (avoid): Do not put essential information in tooltips or hover states. Hover content should be limited to clarifying labels (e.g., abbreviation expansions) and should never contain data, conclusions, or risk information.

When the spec requests "expandable" or "collapsible" sections for primary analytical content, override that instruction: render the content expanded and visible by default, or restructure as a visible layout (e.g., card grid, table rows). Follow the spec's collapse instructions only when the content is genuinely supplementary.

**Infographic legibility rules:**
- Every visual element must be self-explanatory to a reader seeing it for the first time. If a chart requires a paragraph of explanation to interpret, it is a failed chart.
- Use conventional chart types (bar, line, table, matrix, flow diagram, Sankey, treemap) before inventing novel metaphors. Novel visualizations (gauges, clocks, spirals, abstract shapes) are almost never worth the interpretability cost.
- Every axis, arc, segment, or region in a chart must have a visible label, legend entry, or inline annotation. Do not rely on color alone to convey meaning.
- Data visualization must answer a specific question. State the question the visual answers in a caption or heading. Example: "How do allocation bands shift across scenarios?" not "Different Clocks."
- If the underlying data is a simple comparison (e.g., two speeds, three ranges), use a labeled table or annotated bar chart instead of an abstract SVG illustration.
- The "at least one visual element" quality gate does NOT mean you must force a chart. A well-structured table with color-coded severity chips IS a visual element. A labeled SVG flow diagram IS a visual element. An abstract decorative illustration is NOT a useful visual element.

### Step 4: Write the Build Manifest

After writing `index.html`, write a `.artifact-manifest.json` file alongside it:

```json
{
  "slug": "regulatory_dashboard",
  "name": "Regulatory Dashboard",
  "builtAt": "2026-05-21T22:00:00Z",
  "specHash": "<hash of the artifact spec file>",
  "sourcesUsed": [
    "outputs_ai/wiki/state-ohio.md",
    "outputs_ai/strategies/OH_alignment_strategy.md"
  ],
  "format": "html"
}
```

### Step 5: Quality Gate

Before finishing, verify:

- [ ] The HTML file is self-contained — opens correctly in a browser with no server
- [ ] Brand colors and fonts from `human_design_identity.md` are applied
- [ ] The artifact goal (from the spec body) is fully addressed
- [ ] Content is informatically dense — not just walls of text
- [ ] At least one visual element is present — tables with color-coded indicators, labeled SVG diagrams, and status matrices all count; abstract decorative illustrations do not
- [ ] All text labels, percentages, and data values are fully visible without clipping or overflow hiding
- [ ] No primary analytical content is hidden behind accordion, collapse, or hover interactions
- [ ] Semantic HTML structure is used throughout
- [ ] The layout is responsive (test mentally for mobile viewport)
- [ ] All data is sourced from the provided context — nothing is invented

## What NOT to Do

- Do not modify any files in `outputs_ai/`, `sources/`, or the wiki. You are a consumer of that data.
- Do not run git commands.
- Do not search the web. Use only the provided source data.
- Do not modify the artifact spec file. It is user-owned.
- Do not produce multiple HTML files. One `index.html` per artifact.
- Do not use external frameworks (React, Vue, Tailwind). Vanilla HTML/CSS/JS only.
- Do not include API keys, credentials, or sensitive data in the HTML file.
