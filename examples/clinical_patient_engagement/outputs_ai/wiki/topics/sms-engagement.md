# SMS Engagement

## Summary [coverage: medium -- 2 sources]

SMS Engagement is part of the Clinical Patient Engagement Wiki for Medicaid, dual eligible, MLTSS/HCBS, and virtual care engagement strategy. Read it with [[consent-privacy-compliance]], [[patient-segmentation]], and [[digital-to-live-escalation]] when designing implementation workflows.

## What Works [coverage: medium -- 2 sources]

Use SMS for brief, low-risk, consented actions such as reminders, confirmations, callback requests, and secure-link invitations. When the workflow needs PHI, forms, sensitive details, or more patient/caregiver input, prefer SMS-to-secure-message links over putting detailed content in plain SMS.

## Healthcare Examples [coverage: medium -- 2 sources]

Healthcare evidence and case examples support targeted reminders, care coordination, person-centered outreach, and hybrid channel strategies. Vendor claims should be treated as implementation examples unless supported by independent evidence.

## Cross-Industry Patterns [coverage: low -- 2 sources]

Transferable patterns include omnichannel continuity, proactive reminders, personalization, feedback loops, warm transfers, and clear escalation ownership. These must be adapted for HIPAA, consent, accessibility, patient autonomy, and clinical safety.

## Workflow Pattern [coverage: medium -- 2 sources]

1. Identify the patient segment, caregiver role, consent status, and preferred channel.
2. Start with the least burdensome appropriate channel.
3. Escalate when there is non-response, confusion, risk, distress, repeated failure, or caregiver complexity.
4. Record the outcome and next action in a closed-loop work queue.

## Modality Fit [coverage: medium -- 2 sources]

SMS fits high-reach nudges and simple next actions. SMS-to-secure-message links fit richer or PHI-sensitive interactions. AI voice fits low-risk synchronous interactions. Human callback fits complex, sensitive, or consent-ambiguous responses.

## Human vs AI Fit [coverage: medium -- 2 sources]

AI can draft, remind, summarize, route, classify, and monitor. Humans should handle clinical judgment, relationship repair, consent ambiguity, caregiver conflict, distress, and exceptions.

## Platform Implications [coverage: medium -- 2 sources]

The platform should support consent-aware outreach, caregiver/proxy context, language and accessibility preferences, outreach timelines, escalation queues, custom UI, QA review, and audit logs.

## Risks & Constraints [coverage: medium -- 2 sources]

Do not treat this topic as legal advice. Review HIPAA, TCPA, AI voice, caregiver consent, minimum necessary content, and accessibility requirements before implementation.

## Measurement [coverage: medium -- 2 sources]

Track reachability, response rate, completion, escalation, no-show rate where relevant, care gap closure, opt-outs, complaints, staff burden, and safety events.

## Open Questions

- Confirm which Medicaid ABD, MLTSS, and HCBS cohorts should be prioritized first.
- Confirm consent and caregiver/proxy policies before implementation.

## Sources

- `inputs_ai/modalities/sms_engagement.md`
- `inputs_ai/agentic_platform/patient_facing_agentic_engagement.md`
- `inputs_ai/compliance_trust_safety/consent_privacy_safety.md`
