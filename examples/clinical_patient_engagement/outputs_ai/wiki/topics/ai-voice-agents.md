# AI Voice Agents

## Summary [coverage: high -- 3 sources]

AI Voice Agents is part of the Clinical Patient Engagement Wiki for Medicaid, dual eligible, MLTSS/HCBS, and virtual care engagement strategy. Read it with [[consent-privacy-compliance]], [[patient-segmentation]], and [[digital-to-live-escalation]] when designing implementation workflows.

## What Works [coverage: high -- 3 sources]

Use AI voice agents for low-risk, scripted, synchronous workflows such as appointment confirmation, callback capture, scheduling handoff, routine intake, and call deflection. AI voice should be compared against SMS and SMS-to-secure-message workflows rather than assumed to be better. It is most useful when real-time interaction matters or when the patient is unlikely to complete an asynchronous flow.

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

AI voice fits low-risk scripted outreach, inbound call handling, and callback capture. SMS fits brief nudges and secure-link invitations. SMS-to-secure-message fits PHI-sensitive or multi-question workflows. Live phone fits complex, sensitive, or trust-dependent engagement.

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

- `inputs_ai/agentic_platform/ai_voice_sms_agents.md`
- `inputs_ai/agentic_platform/patient_facing_agentic_engagement.md`
- `inputs_ai/modalities/phone_and_voice_engagement.md`
- `inputs_ai/compliance_trust_safety/consent_privacy_safety.md`
