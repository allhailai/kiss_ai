# Custom UI for Engagement Operations

## Summary [coverage: high -- 3 sources]

Custom UI for Engagement Operations is part of the Clinical Patient Engagement Wiki for Medicaid, dual eligible, MLTSS/HCBS, and virtual care engagement strategy. Read it with [[consent-privacy-compliance]], [[patient-segmentation]], and [[digital-to-live-escalation]] when designing implementation workflows.

## What Works [coverage: high -- 3 sources]

Use segmented, plain-language, action-oriented outreach that preserves patient trust and routes complex cases to humans. For low-risk administrative workflows, automation can improve scale. For sensitive, ambiguous, or high-risk workflows, live human support remains important.

## Healthcare Examples [coverage: medium -- 3 sources]

Healthcare evidence and case examples support targeted reminders, care coordination, person-centered outreach, and hybrid channel strategies. Vendor claims should be treated as implementation examples unless supported by independent evidence.

## Cross-Industry Patterns [coverage: low -- 3 sources]

Transferable patterns include omnichannel continuity, proactive reminders, personalization, feedback loops, warm transfers, and clear escalation ownership. These must be adapted for HIPAA, consent, accessibility, patient autonomy, and clinical safety.

## Workflow Pattern [coverage: medium -- 3 sources]

1. Identify the patient segment, caregiver role, consent status, and preferred channel.
2. Start with the least burdensome appropriate channel.
3. Escalate when there is non-response, confusion, risk, distress, repeated failure, or caregiver complexity.
4. Record the outcome and next action in a closed-loop work queue.

## Modality Fit [coverage: medium -- 3 sources]

SMS fits brief administrative nudges. Phone fits complex or trust-sensitive cases. AI voice fits low-risk scripted outreach only with governance. Mail, email, and portal messages fit durable information, reinforcement, or fallback channels.

## Human vs AI Fit [coverage: medium -- 3 sources]

AI can draft, remind, summarize, route, classify, and monitor. Humans should handle clinical judgment, relationship repair, consent ambiguity, caregiver conflict, distress, and exceptions.

## Platform Implications [coverage: medium -- 3 sources]

The platform should support consent-aware outreach, caregiver/proxy context, language and accessibility preferences, outreach timelines, escalation queues, custom UI, QA review, and audit logs.

## Risks & Constraints [coverage: medium -- 3 sources]

Do not treat this topic as legal advice. Review HIPAA, TCPA, AI voice, caregiver consent, minimum necessary content, and accessibility requirements before implementation.

## Measurement [coverage: medium -- 3 sources]

Track reachability, response rate, completion, escalation, no-show rate where relevant, care gap closure, opt-outs, complaints, staff burden, and safety events.

## Open Questions

- Confirm which Medicaid ABD, MLTSS, and HCBS cohorts should be prioritized first.
- Confirm consent and caregiver/proxy policies before implementation.

## Sources

- `inputs_ai/agentic_platform/agentic_data_curation.md`
- `inputs_ai/workflows/clinical_outreach_workflows.md`
- `inputs_ai/agentic_platform/vendor_capabilities_twilio_elevenlabs_comparable.md`
