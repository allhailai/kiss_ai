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
4. **Visualization plan** — Follow any `## Visualizations` section in the spec. If no visualization guidance is given, decide yourself. **Outputs must be informatically dense but not all text** — use stylized visual depictions: SVG diagrams, status matrices, charts, color-coded indicators.

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

**Interactive elements (when appropriate):**
- Tabs, accordions, collapsible sections for information density
- Filters or search for large data sets
- Hover states and tooltips for data points
- Smooth transitions and micro-animations for polish

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
- [ ] At least one visual element (chart, matrix, diagram, status indicator) is present
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
