# do_build_wiki_page

Build or update a single wiki page for a kiss_ai research project.

This command is called by the build pipeline for each affected wiki page. It receives focused context containing only the sources and digests relevant to this page's topic(s). Your job is to write or update ONE wiki page with maximum evidence integration.

## Non-Interactive Runtime Contract

This is a web-triggered sub-phase of a larger build. Never ask for confirmation or wait for input. When a decision is needed, choose the conservative default and leave an `<!-- AI_SUGGESTION: ... -->` marker explaining what the user should review.

## Instructions

### Step 1: Read Provided Context

The build pipeline has prepared the following context for you:

1. **Existing wiki page** (if updating — read it first to understand current structure and content)
2. **Source digests** relevant to this topic (compact key-claim summaries)
3. **Full source files** for low-coverage digests or when detailed evidence is needed
4. **FEEDBACK markers** to apply (if any are flagged in this page)
5. **project.md** for topic framing and output requirements

### Step 2: Write or Update the Wiki Page

**If MODE is "incremental":**
- Read the existing page first
- Integrate new evidence into the appropriate existing sections
- Update the BLUF (Bottom Line Up Front) if new evidence changes the key finding
- Do NOT rewrite sections that are unaffected by the new evidence
- Add citations for any new claims
- Apply any FEEDBACK markers by addressing the feedback and removing the marker
- Maintain the existing page's structure and narrative flow
- New data should be woven into existing paragraphs, not appended as a separate list

**If MODE is "full_rewrite":**
- Regenerate the page entirely from all available evidence
- This is a clean slate — do not preserve old structure
- Follow all wiki page standards: BLUF, evidence synthesis, citations
- Organize by analytical theme, not by source document

### Step 3: Citation Standards

- Cite source files with relative links: `[source](../../sources/digests/source_name.md)` or `[source](../../sources/web_research/source_name.md)`
- Cite both source files and wiki articles when a conclusion depends on synthesis across multiple sources
- If sources conflict, cite both and explain the conflict
- If a data point cannot be confirmed from sources, label it as unverified

### Step 4: Quality Gate

Before finishing, verify:

- [ ] Every factual claim is cited with a source link
- [ ] BLUF reflects the strongest available evidence
- [ ] New data is integrated into the narrative, not appended as a disconnected section
- [ ] No unprocessed FEEDBACK markers remain (if any were flagged)
- [ ] The page reads as a coherent analytical document, not a patchwork of edits

## What NOT to Do

- Do not write other wiki pages. You are responsible for ONE page only.
- Do not update `topics.json`, `manifest.json`, `_index.md`, or `change_logs/`. The server handles those.
- Do not run git commands.
- Do not generate directed outputs.
- Do not read sources that are not provided in your context — the pipeline has already determined what is relevant.
