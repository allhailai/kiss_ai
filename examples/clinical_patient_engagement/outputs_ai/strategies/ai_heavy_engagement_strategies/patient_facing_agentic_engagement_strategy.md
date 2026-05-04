# Patient-Facing Agentic Engagement Strategy

## Sources Relied On

- `inputs_ai/agentic_platform/patient_facing_agentic_engagement.md`
- `inputs_ai/agentic_platform/ai_voice_sms_agents.md`
- `inputs_ai/modalities/sms_engagement.md`
- `inputs_ai/compliance_trust_safety/consent_privacy_safety.md`
- `outputs_ai/wiki/topics/patient-facing-agentic-engagement.md`
- `outputs_ai/wiki/topics/ai-voice-agents.md`
- `outputs_ai/wiki/topics/sms-engagement.md`
- `outputs_ai/wiki/topics/hybrid-channel-orchestration.md`

## Target Segment or Problem

Medicaid, dual eligible, ABD, MLTSS/HCBS patients and caregivers need outreach that is easy to respond to, safe for sensitive health information, respectful of consent and caregiver authorization, and scalable enough for clinical operations teams. The main strategy question is whether to prioritize AI voice, SMS, SMS-to-secure-message links, secure portal/app messaging, or mixed AI-to-human callback workflows.

## Recommended Strategy

Start with a channel-comparison pilot rather than a single-channel bet. Use SMS as the low-friction entry point, SMS-to-secure-message links for PHI-sensitive or multi-step workflows, AI voice for low-risk scripted calls and callback capture, and human callback for high-risk, ambiguous, or trust-sensitive cases.

## Channel Comparison

| Channel Pattern | Use First When | Do Not Use When | Evidence / Confidence | Required Controls |
|---|---|---|---|---|
| SMS with consent | Short reminder, confirm, reschedule, request callback, invite to secure link | PHI-heavy content, shared phone risk, unclear consent | Medium; strong operational fit but privacy-sensitive | Consent, opt-out, short copy, no unnecessary PHI |
| SMS to secure message/link | Intake forms, care plan details, caregiver workflows, PHI-sensitive content | Patient lacks web/mobile access or cannot verify identity | Medium; useful pattern but implementation-dependent | Secure platform, identity verification, audit trail, fallback |
| AI voice call | Low-risk scripted outreach, inbound call deflection, callback capture | Distress, clinical questions, consent ambiguity, complaints | Emerging; vendor examples strong, independent evidence limited | AI disclosure, TCPA/HIPAA review, transcript QA, live handoff |
| Secure portal/app messaging | Rich asynchronous exchange with known app users | Low portal adoption, login friction, urgent issues | Medium for engaged users, low for broad reach | Authentication, notifications, accessibility, monitoring |
| AI-to-human callback | Scale triage while preserving human resolution | No staff capacity to resolve escalations | High operational fit when queues are managed | Work queues, confidence thresholds, escalation SLAs |

## Workflow Pattern

1. Confirm consent, caregiver/proxy status, language, accessibility, and preferred channel.
2. Send a plain SMS nudge when the action is simple and low risk.
3. Use a secure link when the patient or caregiver must provide sensitive information, complete forms, or view PHI.
4. Use AI voice for scripted calls where synchronous interaction matters, such as confirming intent, capturing callback requests, or routing to scheduling.
5. Classify replies and call outcomes into administrative complete, needs secure message, needs staff callback, clinical question, complaint, opt-out, distress, or low confidence.
6. Route exceptions to humans with the conversation history and recommended next action.
7. Measure channel performance and patient trust before expanding.

## Tools and Techniques

- Twilio-like communication infrastructure for SMS, voice, routing, and event delivery.
- ElevenLabs-like or comparable voice-agent tools for natural voice interactions, only where compliance and governance requirements are met.
- Secure messaging or mobile/web app workflows for PHI-sensitive content and form completion.
- Work queues that show patient/caregiver context, consent state, channel history, AI summary, and escalation reason.
- Prompt/script version control, approved response libraries, transcript review, and QA sampling.
- Analytics comparing response, completion, escalation, opt-out, complaint, safety, and staff-burden metrics by channel.

## Automation Boundaries

AI can draft, remind, route, classify, summarize, and handle low-risk scripted interactions. AI should not independently give clinical advice, resolve distress, handle complaints, override consent uncertainty, or manage caregiver ambiguity without human review.

## Measurement Plan

Compare AI voice, SMS, SMS-to-secure-message, and human callback by reachability, response rate, completion rate, secure-link completion, no-show reduction where relevant, care gap closure, call deflection, staff burden, opt-outs, complaints, escalation accuracy, patient trust, and safety events.

## Open Questions

- Which channel should be piloted first for Medicaid, dual eligible, ABD/MLTSS/HCBS patients and caregivers?
- What consent language and caregiver/proxy authorization rules apply to SMS-to-secure-message links?
- What threshold of response lift, staff burden reduction, or care gap completion would justify AI voice expansion?
