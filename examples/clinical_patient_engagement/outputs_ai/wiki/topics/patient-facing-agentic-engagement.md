# Patient Facing Agentic Engagement

## Summary [coverage: high -- 4 sources]

Patient-facing agentic engagement compares how AI voice, SMS, SMS-to-secure-message links, secure app/web messaging, and AI-to-human callback workflows should be used for Medicaid, dual eligible, ABD, MLTSS/HCBS, and caregiver-supported populations. The strongest strategy is not to choose one channel globally, but to match channel to workflow risk, consent posture, patient friction, accessibility, and escalation needs.

## What Works [coverage: high -- 4 sources]

Use SMS for low-risk short actions, SMS-to-secure-message links when the interaction needs PHI controls or richer response capture, AI voice for low-risk synchronous scripted outreach, and human callback for sensitive, ambiguous, or high-risk situations. Agents should classify, route, summarize, and monitor, while humans handle judgment, distress, clinical questions, caregiver ambiguity, and relationship repair.

## Healthcare Examples [coverage: medium -- 4 sources]

Vendor and platform examples show AI voice, SMS, and omnichannel workflows being used for scheduling, reminders, inbound call handling, care gap outreach, post-visit follow-up, and patient communication. Twilio and Commure describe omnichannel communication across chat, phone, and SMS. ElevenLabs and similar vendors describe healthcare voice agents for answering, scheduling, and intake. These are useful implementation examples, but vendor claims should be separated from independent evidence.

## Cross-Industry Patterns [coverage: medium -- 4 sources]

Cross-industry engagement patterns suggest using low-friction entry points, preserving context across channels, and escalating with warm handoffs. In clinical settings, these patterns must be adapted for HIPAA, consent, patient autonomy, caregiver permissions, accessibility, and safety.

## Workflow Pattern [coverage: high -- 4 sources]

1. Confirm consent, opt-out state, preferred language, accessibility needs, and caregiver/proxy status.
2. Pick the least burdensome channel that is safe for the content.
3. Use SMS for simple nudges or secure-link invitations.
4. Use secure messaging for PHI-sensitive or multi-question workflows.
5. Use AI voice for low-risk scripted calls where synchronous interaction matters.
6. Route clinical questions, distress, complaints, caregiver ambiguity, and low-confidence AI classifications to humans.
7. Record outcomes, channel performance, and escalation reason.

## Modality Fit [coverage: high -- 4 sources]

SMS is best for reach and simplicity. SMS-to-secure-message links are best when SMS reach is useful but the workflow needs a safer environment. AI voice is best when real-time interaction or call deflection matters. Secure portal/app messaging is best when the patient or caregiver already uses the app. Human callback is best when trust, complexity, or safety matters.

## Human vs AI Fit [coverage: high -- 4 sources]

AI fits first-touch outreach, reminders, intent classification, secure-link routing, call summaries, work-queue prioritization, and measurement. Humans should own sensitive outreach, escalation, consent ambiguity, caregiver conflict, clinical judgment, and safety events.

## Platform Implications [coverage: high -- 4 sources]

The platform should support consent-aware channel selection, SMS-to-secure-link routing, AI voice disclosure, transcript and message review, patient/caregiver context, secure messaging, work queues, prompt/script versioning, QA sampling, and channel-comparison analytics.

## Risks & Constraints [coverage: high -- 4 sources]

Do not treat this as legal advice. AI voice and SMS workflows require review of HIPAA, TCPA, opt-out handling, AI disclosure, caregiver/proxy authorization, accessibility, language access, and minimum-necessary content. AI should not independently provide clinical advice or resolve safety concerns.

## Measurement [coverage: high -- 4 sources]

Compare channels by reachability, response rate, completion rate, no-show reduction, care gap closure, secure-link completion, call deflection, staff burden, opt-out rate, complaint rate, escalation accuracy, patient trust, and safety events.

## Open Questions

- Which channel should be piloted first for Medicaid, dual eligible, ABD/MLTSS/HCBS patients and caregivers?
- What consent and caregiver/proxy rules apply to SMS-to-secure-message links?
- What outcome threshold would justify AI voice over SMS or SMS-to-secure-message workflows?

## Sources

- `inputs_ai/agentic_platform/patient_facing_agentic_engagement.md`
- `inputs_ai/agentic_platform/ai_voice_sms_agents.md`
- `inputs_ai/modalities/sms_engagement.md`
- `inputs_ai/compliance_trust_safety/consent_privacy_safety.md`
