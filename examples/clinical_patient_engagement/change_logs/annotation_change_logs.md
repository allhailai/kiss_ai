# Annotation Change Logs

Entries are prepended in reverse chronological order.

## 2026-04-27T20:58:00Z - Patient-facing agentic engagement strategy annotation

- path: `outputs_ai/strategies/ai_heavy_engagement_strategies/agentic_source_monitoring_and_curation.md`
- change type: `real_annotation`
- diff summary: Human inserted a request for a more detailed strategy on patient-facing agentic capabilities, including what others are doing successfully, whether agentic telephonic interactions perform better than SMS, and whether SMS-to-secure-messaging links are a better pattern.
- inferred intent: The generated AI-heavy strategy output is too narrowly focused on source monitoring and data curation. The project should produce a separate, detailed patient-facing agentic engagement strategy that compares AI voice calls, SMS, SMS-to-secure-message flows, tools, techniques, success patterns, and consent/security constraints.
- confidence: high
- proposed requirement-file change: Add patient-facing agentic engagement evidence to `human_input_requirements.md`; add a required `patient_facing_agentic_engagement_strategy.md` output and channel-comparison requirements to `human_output_requirements.md`; add channel-choice questions to `human_open_questions.md`.
- review requirement: non-blocking; safe to continue because the annotation clarifies an in-scope strategy output rather than changing the project goal.
- recommended action: Incorporate the intent during this rebuild, remove the raw annotation text from generated output, and regenerate affected sources, wiki topics, and AI-heavy strategy outputs.
