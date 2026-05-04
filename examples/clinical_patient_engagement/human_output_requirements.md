# Output Requirements

## Purpose

Produce a synthesized patient engagement strategy wiki and practical workflow outputs for virtual and telehealth-based clinical service delivery companies.

Outputs should help clinical operations, patient engagement, care coordination, and product/workflow teams decide which engagement strategies to use, which strategies are human-led, which can be AI-heavy, and which should combine humans and AI. Outputs should translate evidence, case studies, cross-industry examples, vendor capabilities, and human context into practical recommendations.

## Wiki Requirements

### Wiki Name

Clinical Patient Engagement Wiki

### Source Paths

- `inputs_ai/healthcare_examples/`
- `inputs_ai/cross_industry_examples/`
- `inputs_ai/evidence/`
- `inputs_ai/modalities/`
- `inputs_ai/agentic_platform/`
- `inputs_ai/workflows/`
- `inputs_ai/populations/`
- `inputs_ai/operations/`
- `inputs_ai/compliance_trust_safety/`
- `inputs_ai/measurement/`
- `inputs_human/` when human context is explicitly relevant

### Output Path

`outputs_ai/wiki/`

### Link Style

Use Obsidian links.

In generated Markdown tables, do not use aliased Obsidian links with raw pipes such as `[[topics/example|Example]]` inside a table cell. Use an unaliased link plus a separate title column, or escape the alias separator as `[[topics/example\|Example]]`.

### Topic Hints

- `best-in-class-healthcare-engagement`
- `cross-industry-engagement-patterns`
- `sms-engagement`
- `phone-outreach`
- `ai-voice-agents`
- `patient-facing-agentic-engagement`
- `mailing-and-print`
- `email-and-portal-messaging`
- `hybrid-channel-orchestration`
- `appointment-reminders`
- `no-show-reduction`
- `care-plan-follow-up`
- `patient-segmentation`
- `accessibility-and-language`
- `consent-privacy-compliance`
- `digital-to-live-escalation`
- `agentic-data-curation`
- `custom-ui-for-engagement-operations`
- `vendor-capabilities-and-constraints`
- `measurement-and-kpis`

### Article Sections

Every topic article should use these sections:

| Section | Required? | Description |
|---|---|---|
| Summary | yes | Plain-language overview of the engagement topic and why it matters. |
| What Works | no | Evidence-supported practices and best-in-class examples. |
| Healthcare Examples | no | Healthcare or digital health case studies, clearly separated from vendor claims. |
| Cross-Industry Patterns | no | Transferable tactics from other industries, with transferability caveats. |
| Workflow Pattern | no | Practical steps a clinical team can follow. |
| Modality Fit | no | When SMS, phone, voice, mail, portal, app, or other channels are appropriate. |
| Human vs AI Fit | no | Whether the strategy is best handled by humans, AI agents, or a mixed workflow. |
| Platform Implications | no | Relevant workflow, UI, vendor, data-curation, or automation considerations. |
| Risks & Constraints | no | Consent, trust, accessibility, privacy, safety, governance, or operational caveats. |
| Measurement | no | KPIs, evaluation ideas, and signals that the tactic is working or failing. |
| Open Questions | no | Unresolved questions for human review. |
| Sources | yes | Backlinks to contributing source files. |

### Coverage Rules

Each substantive article section should include a coverage tag inline on the section heading:

- `## Summary [coverage: high -- N sources]`
- `## What Works [coverage: medium -- N sources]`
- `## Risks & Constraints [coverage: low -- N sources]`

Do not use standalone coverage-only lines because they make wiki articles sparse and harder to scan. Low-coverage sections should tell readers when to inspect raw source files.

## Beyond-Wiki Directed Outputs

The project should produce one or more output files in each strategy family below. These are the primary decision-support outputs beyond the wiki.

### Human-Only Engagement Strategies

Create outputs under `outputs_ai/strategies/human_only_engagement_strategies/`.

These outputs should describe strategies where humans should lead the interaction because trust, clinical judgment, sensitivity, ambiguity, or relationship repair matters more than automation speed. Examples may include:

- live care navigator outreach for high-risk or low-trust patients;
- sensitive follow-up after a concerning clinical result or failed care plan;
- complex appointment recovery after repeated no-shows;
- caregiver/proxy coordination;
- culturally sensitive or language-access workflows;
- manual review of patient complaints, distress signals, or confusion.

Each human-only strategy output should include:

- target patient segment or engagement problem;
- why a human-led workflow is recommended;
- workflow steps;
- staff roles and handoff points;
- suggested scripts or message guidance;
- modality choices;
- trust, accessibility, consent, privacy, and safety considerations;
- staffing and operational burden;
- measurement plan;
- evidence strength and sources;
- open questions.

### AI-Heavy Engagement Strategies

Create outputs under `outputs_ai/strategies/ai_heavy_engagement_strategies/`.

These outputs should describe strategies where configurable AI agents, workflow automation, generative SMS, AI voice, or agentic data curation can carry a large part of the work with governance and escalation rules. Examples may include:

- automated appointment reminders and confirmations;
- AI-assisted no-show recovery sequences;
- AI voice outreach for low-risk scripted check-ins;
- patient-facing agentic engagement strategies comparing AI voice, SMS, SMS-to-secure-message links, secure messaging assistants, and human handoff;
- SMS-based pre-visit preparation;
- automated care gap outreach with human escalation;
- agentic summarization of engagement outcomes;
- agentic source monitoring and data-curation workflows;
- routing and prioritization for engagement work queues.

Each AI-heavy strategy output should include:

- target patient segment or engagement problem;
- automation opportunity and boundaries;
- recommended AI agent role;
- channel comparison across AI voice, SMS, SMS-to-secure-message, secure web/mobile messaging, portal/app messaging, and human callback where relevant;
- suggested SMS, voice, or workflow script pattern;
- vendor capabilities needed, such as SMS, VOIP, voice generation, transcription, routing, workflow orchestration, or analytics;
- human review, override, and escalation requirements;
- data needed by the agent;
- data generated by the agent;
- monitoring and QA plan;
- privacy, consent, safety, and trust constraints;
- failure modes and fallback workflow;
- measurement plan;
- evidence strength and sources;
- open questions.

Do not present AI-heavy workflows as fully autonomous clinical decision-making. Clinical decisions, sensitive edge cases, and safety concerns require human governance.

### Mixed Human/AI Engagement Strategies

Create outputs under `outputs_ai/strategies/human_ai_engagement_strategies/`.

These outputs should describe balanced strategies where AI handles scale, drafting, routing, summarization, monitoring, or first-touch outreach while humans handle judgment, empathy, complex exceptions, and relationship-sensitive interactions. Examples may include:

- AI-drafted SMS with human approval for higher-risk segments;
- AI triage of outreach replies into staff work queues;
- AI voice first-touch followed by live navigator callback;
- personalized pre-visit preparation where AI drafts and staff approve;
- care gap campaigns with AI segmentation and human escalation;
- patient engagement dashboards that combine AI summaries with human action tools;
- closed-loop follow-up where AI monitors completion and staff resolve exceptions.

Each mixed strategy output should include:

- target patient segment or engagement problem;
- division of labor between AI and humans;
- workflow steps;
- decision points for human review;
- escalation rules;
- suggested custom UI components;
- vendor capabilities needed;
- data flow and documentation expectations;
- scripts, prompts, or templates where useful;
- operational staffing implications;
- compliance, privacy, safety, and trust constraints;
- measurement plan;
- evidence strength and sources;
- open questions.

## Directed Outputs

Initial directed outputs should include:

- `outputs_ai/playbooks/patient_engagement_strategy.md`
- `outputs_ai/playbooks/modality_selection_matrix.md`
- `outputs_ai/playbooks/outreach_workflow_templates.md`
- `outputs_ai/playbooks/best_in_class_strategy_brief.md`
- `outputs_ai/playbooks/cross_industry_transferability_matrix.md`
- `outputs_ai/playbooks/vendor_capability_matrix.md`
- `outputs_ai/playbooks/agentic_platform_opportunity_map.md`
- `outputs_ai/playbooks/engagement_measurement_plan.md`
- `outputs_ai/strategies/human_only_engagement_strategies/README.md`
- `outputs_ai/strategies/ai_heavy_engagement_strategies/README.md`
- `outputs_ai/strategies/ai_heavy_engagement_strategies/patient_facing_agentic_engagement_strategy.md`
- `outputs_ai/strategies/human_ai_engagement_strategies/README.md`

The strategy folders may contain multiple strategy files. Name them descriptively, for example `high_risk_patient_navigator_outreach.md`, `ai_voice_no_show_recovery.md`, or `ai_triaged_human_callback_workflow.md`.

## Required Output Standards

Every directed output should state:

- sources relied on;
- wiki articles supporting the conclusions;
- whether recommendations are based on healthcare evidence, healthcare case studies, vendor claims, expert opinion, internal human context, or adapted cross-industry examples;
- recommended workflows;
- modality-specific caveats;
- patient trust, accessibility, consent, privacy, safety, and governance considerations;
- fit for human-only, AI-heavy, or mixed human/AI execution;
- vendor capabilities or platform features required;
- custom UI opportunities where relevant;
- measurement and monitoring plan;
- operational burden and implementation complexity;
- open questions or blockers.

## Citation Standards

- Every material recommendation must cite a wiki article or source file.
- Do not invent evidence.
- Distinguish independent evidence from vendor claims and adapted cross-industry examples.
- If evidence is weak or unclear, surface it as an open question or hypothesis.
- Plain English is preferred.

## Recommendation Posture

Outputs should be practical, not theoretical. Recommendations should make clear:

- what to do now;
- what to test;
- what requires compliance, clinical, operational, or product review;
- what should not be automated;
- what could become an AI-enabled platform feature;
- what source gaps remain.

## Caveats And Escalations

Record caveats before changing:

- source categories;
- topic/concept structure;
- directed output structure;
- citation standards;
- final-output recommendation posture.

Continue rebuilding affected outputs with explicit caveats unless the current requirements become impossible to execute.
