# Topic Depth Definitions

This document defines what a topic is and the research depth states for topics in the kiss_ai knowledge pipeline.

## What is a Topic?

A topic is a discrete, investigable question or area of knowledge that:

1. **Supports the project's goals** — it exists because understanding it advances the project's thesis or deliverables.
2. **Can be independently researched and synthesized** into a standalone wiki page — a competent researcher could write a 1–2 page briefing on it without needing to merge it with another topic.
3. **Has clear boundaries** — you can tell when you're "done" investigating it, and you can distinguish it from adjacent topics.

Topics form the backbone of the project's knowledge graph. Each topic has its own sources, dependencies on other topics, coverage gaps, a user-provided `details` field for human context, and a depth trajectory (seed → shallow → deep → saturated).

### What a topic is NOT

- **Not a tag or keyword.** "Healthcare" is not a topic. "Medicare Advantage enrollment trends in rural counties" could be.
- **Not a single data point.** "42 U.S.C. § 1395w-27(d)(1)" is too narrow — it's a source citation, not a topic. "Federal marketing restrictions on Medicare Advantage plans" is a topic.
- **Not an entire domain.** If a topic is so broad that its wiki page would need to cover 5+ distinct sub-areas, it should be split into sub-topics.

### Granularity test

A good topic passes this test: *"Could a competent researcher write a focused, 1–2 page standalone briefing on this, with specific claims backed by 3–5 sources?"* If yes, it's scoped correctly. If it would take 10 pages, it's too broad. If it would be a single paragraph, it's too narrow.

### Topic relationships

- **`depends_on`**: Topic A depends on Topic B if understanding B is a prerequisite for fully understanding A. Dependencies guide the order of research and cross-referencing.
- **`parent` / `children`**: A topic can be split into sub-topics. The parent becomes a summary or overview, and the children become the detailed investigations.

---

## State Lifecycle

```
seed → shallow → deep → saturated
         ↘ split_candidate
any state → deprecated (user action)
```

- **Seed**: A newly discovered topic that hasn't been reviewed by the user yet. No research has been performed.
- **Shallow**: The user has accepted the topic and initial research exists, but it lacks rigor across one or more dimensions.
- **Deep**: The topic has substantive, evidence-backed understanding with rigorous sourcing across multiple dimensions.
- **Saturated**: Further research on this topic would yield diminishing returns. All quality dimensions are fully met.
- **Split candidate**: The topic has grown broad enough that it should be split into sub-topics.
- **Deprecated**: The user has removed this topic from active research (dismissed or deprecated).

---

## Shallow

A topic where the system has a *surface-level understanding*. It knows the topic exists and has a general description, but the research lacks rigor.

A topic remains **shallow** when any of the following are true:

| Dimension | Shallow threshold |
|---|---|
| **Source diversity** | ≤2 distinct source types |
| **Evidence specificity** | <2 concrete, cited data points |
| **Coverage gaps** | ≥2 open coverage gaps |
| **Cross-referencing** | Wiki page doesn't reference findings from dependency topics |
| **Contrarian evidence** | No counterarguments, limitations, or alternative interpretations documented |

### What "shallow" looks like in practice

- A wiki page that paraphrases a few news articles without specific statistics or dates.
- Sources are all the same type (e.g., three trade press articles but no government data or academic papers).
- Claims are stated without quantification: "the market is growing" instead of "the market grew 14% YoY to $2.3B in 2024 (Source: Bureau of Labor Statistics)."
- No mention of opposing viewpoints or limitations of the findings.

---

## Deep

A topic where the system has *substantive, evidence-backed understanding* with rigorous sourcing. The research is specific, cross-referenced, and acknowledges its own limitations.

A topic advances to **deep** when **ALL** of the following hold:

| # | Dimension | Deep requirement |
|---|---|---|
| 1 | **Source diversity** | 3+ sources spanning ≥2 distinct source types |
| 2 | **Evidence specificity** | ≥2 concrete, cited data points in the wiki page |
| 3 | **Coverage gap progress** | ≤1 remaining coverage gap |
| 4 | **Cross-referencing** | Wiki page connects findings to ≥1 dependency topic |
| 5 | **Contrarian evidence** | ≥1 counterargument, limitation, or alternative interpretation documented |

### Source types

The following source type categories are used to measure diversity:

| Type | Examples |
|---|---|
| `primary_data` | Official statistics, raw datasets, registries, direct measurements |
| `government` | Regulatory agency publications, statutory text, intergovernmental org data |
| `academic` | Peer-reviewed research, systematic reviews, working papers |
| `corporate` | Annual reports, filings, program documentation, published guidelines |
| `trade_press` | Industry publications, professional association reports, consultancy analysis |
| `news` | Major wire services, established newspapers, reputable journalism |
| `commentary` | Opinion pieces, blog posts, social media, unverified claims |

A topic with 5 sources that are all `news` has only 1 source type. A topic with 3 sources spanning `government`, `academic`, and `trade_press` has 3 source types.

### What "deep" looks like in practice

- A wiki page with specific, quantified claims: named statistics, dollar figures, percentages, dated events, regulatory citations, or direct quotes from primary sources.
- Sources come from at least 2 different categories (e.g., a government report + a trade press analysis).
- The page explicitly connects its findings to related topics in the project ("This aligns with the findings in [Related Topic], which showed…").
- At least one section acknowledges a counterargument, limitation, or alternative interpretation ("However, critics argue that…" or "A limitation of this data is…").

### What counts as a "concrete data point"

A concrete data point is a specific, verifiable, cited claim. Examples:

- ✅ "Medicare Advantage enrollment reached 33.8 million in 2024 (CMS, 2024)"
- ✅ "The rule was finalized on April 22, 2024, with an effective date of June 3, 2024"
- ✅ "42 U.S.C. § 1395w-27(d)(1) prohibits plans from…"
- ❌ "Medicare Advantage is growing rapidly" (no number, no source)
- ❌ "Many states have adopted similar regulations" (vague, no specifics)

---

## Saturated

A topic where further research yields *diminishing returns*. All quality dimensions are fully met and the topic is comprehensively covered.

A topic advances to **saturated** when **ALL** of the following hold:

| # | Dimension | Saturated requirement |
|---|---|---|
| 1 | **Coverage gaps** | Zero open coverage gaps |
| 2 | **Source diversity** | 5+ sources spanning ≥3 distinct source types |
| 3 | **Evidence completeness** | All major claims have primary-source or government/academic backing |
| 4 | **Cross-referencing** | Wiki page references findings from ≥2 other topics |
| 5 | **Contrarian completeness** | Key counterarguments and limitations documented with source citations |
| 6 | **Downstream coverage** | All directed outputs that depend on this topic have been updated with its findings |

### What "saturated" looks like in practice

- The wiki page is thoroughly sourced from government data, academic papers, AND industry analysis.
- Every major claim traces back to a primary or authoritative source, not just secondary reporting.
- The page is woven into the project's knowledge graph — it references and is referenced by multiple other topics.
- Counterarguments aren't just mentioned but are supported with their own citations.
- All reports and deliverables that depend on this topic already reflect its latest findings.
- There are no open coverage gaps — every aspect the project needs from this topic has been researched.

---

## Metrics tracked per topic

The following metrics are stored in `topics.json` under each topic's `metrics` object and are used to evaluate depth criteria:

| Field | Type | Description |
|---|---|---|
| `source_count` | number | Total number of sources linked to this topic |
| `source_types` | string[] | Distinct source type categories used (e.g., `["government", "academic"]`) |
| `cross_references` | number | Number of other topics this topic connects to |
| `data_point_count` | number | Count of concrete, cited data points in the wiki page |
| `has_contrarian_evidence` | boolean | Whether the wiki page documents counterarguments or limitations |
| `word_count` | number | Total word count of the wiki page |
| `last_updated` | string | ISO timestamp of last modification |

---

## How state advances

State transitions happen automatically during:

1. **Knowledge builds** (`do_build`) — when the AI synthesizes sources into wiki pages, it evaluates each topic against the depth criteria and advances state if all requirements are met.
2. **Deepen passes** (`do_deepen`) — when the user clicks "Go Deeper" on a topic, the system runs targeted research and re-evaluates depth criteria after synthesis.

State never advances automatically to `seed` or `deprecated` — those are set by discovery and user action respectively. State also never regresses (a deep topic doesn't become shallow again).
