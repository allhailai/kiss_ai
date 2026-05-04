# Patient-Facing Agentic Engagement

## Metadata

- source/citation: see Sources
- source URL when available: see Sources
- source type: healthcare evidence, vendor claim, expert opinion, and adapted cross-industry example
- category: agentic_platform
- population or setting: Medicaid, dual eligible, ABD, MLTSS/HCBS, virtual care patients, and caregivers
- modality: AI voice, SMS, SMS-to-secure-message links, secure web/mobile messaging, portal/app messaging, and human callback
- agentic capability: patient-facing conversational agents, channel selection, secure-message routing, reply classification, summarization, and escalation
- workflow stage: patient-facing outreach and response handling
- last_checked date: 2026-04-27
- status: added from human annotation during rebuild

## Summary

Patient-facing agentic engagement should compare channels by workflow risk, patient friction, consent/privacy posture, and operational outcome. Current public evidence and vendor examples support SMS for low-friction outreach, secure links or app/portal messaging when PHI or richer interaction is needed, and AI voice for low-risk scripted calls where disclosure, consent, QA, and human escalation are clear.

## Key Findings

- SMS remains one of the lowest-friction channels for reminders and simple actions, but plain SMS should minimize PHI and requires consent, opt-out, and channel-preference controls.
- SMS-to-secure-message or "magic link" patterns can combine SMS reach with a more secure environment for forms, richer content, and PHI-sensitive workflows, but they depend on identity verification and secure platform integration.
- AI voice agents are best suited for low-risk, structured workflows such as scheduling, confirmation, callback capture, routine intake, and routing. They should escalate quickly when patients express distress, confusion, clinical questions, complaints, opt-out requests, or caregiver/consent ambiguity.
- Vendor examples from Twilio, ElevenLabs, OhMD, athenahealth, and similar platforms show practical tool patterns, but vendor claims must be kept separate from independent evidence.
- Systematic reviews of technology-enabled outreach find promise for SMS and chatbot-style outreach, especially preventive care and reminders, while also noting evidence gaps around long-term effectiveness, cost-effectiveness, and generalizability.

## Practical Tactics or Workflow Patterns

- Use SMS for brief administrative nudges: confirm, reschedule, request callback, complete intake, or open a secure link.
- Use SMS-to-secure-message links when the patient or caregiver needs to view PHI, complete forms, answer more detailed questions, or exchange sensitive information.
- Use AI voice when the workflow benefits from synchronous interaction, when patients may not respond to SMS, or when a callback can be captured without a live staff member.
- Use human callback when the patient is high risk, low trust, repeatedly unreachable, confused, distressed, language/accessibility needs are unclear, or caregiver authorization is uncertain.
- Build channel comparison into the strategy: expected reach, friction, privacy exposure, consent burden, staff burden, likely patient trust, failure modes, and measurement plan.

## Channel Comparison Baseline

| Channel Pattern | Best Fit | Main Risk | Human Escalation Trigger |
|---|---|---|---|
| SMS with consent | Short reminders, confirmations, callback requests | PHI leakage, shared phones, opt-outs | Confusion, clinical question, complaint, opt-out, no response after defined attempts |
| SMS to secure link | Forms, sensitive details, care plan content, caregiver workflows | Link friction, identity verification failure, app/web access limits | Failed verification, incomplete form, distress, caregiver ambiguity |
| AI voice call | Low-risk scripted outreach, scheduling, call deflection, callback capture | AI disclosure, TCPA/consent, poor handling of ambiguity | Distress, clinical question, complaint, uncertainty, caregiver/consent issue |
| Secure web/mobile messaging | Richer asynchronous interaction with PHI controls | Lower adoption, login friction, accessibility limits | Unread message, high-risk response, complex question |
| AI-to-human callback | Triage at scale with human resolution | Bad classification or delayed escalation | Any medium/high-risk classification or low AI confidence |

## Transferability Assessment

Cross-industry omnichannel and contact-center patterns transfer well when they preserve context, support warm handoff, and reduce repeated patient effort. Marketing-style urgency, dark patterns, and over-personalization should not transfer to Medicaid or caregiver-supported clinical workflows.

## Operational Implications

The platform should support consent-aware channel selection, secure link workflows, patient/caregiver identity context, AI voice disclosure, transcript and SMS review, human escalation queues, channel performance analytics, and QA sampling. Strategy outputs should recommend first pilots by risk level rather than by vendor preference.

## Compliance, Privacy, Safety, Trust, and Accessibility Caveats

This is not legal advice. HIPAA, TCPA, AI voice disclosure, caregiver/proxy authorization, opt-out handling, accessibility, language access, and minimum-necessary content should be reviewed before implementation. AI should not independently provide clinical advice or handle safety concerns.

## Limitations

Public evidence directly comparing AI voice, SMS, and SMS-to-secure-message workflows in Medicaid MLTSS/HCBS populations is limited. Vendor case studies often report operational outcomes but may not provide independent clinical validation.

## Open Questions

- Which patient-facing channel should be piloted first for Medicaid, dual eligible, ABD/MLTSS/HCBS patients and caregivers?
- What consent and caregiver/proxy policies apply to SMS-to-secure-message links?
- What outcome threshold would make AI voice preferable to SMS or SMS-to-secure-message workflows?

## Sources

- Evaluating Technology-Driven Strategies for Enhancing Patient Outreach for Preventive Care: https://pmc.ncbi.nlm.nih.gov/articles/PMC11932718/
- Patient Consent and The Right to Notice and Explanation of AI Systems Used in Health Care: https://pmc.ncbi.nlm.nih.gov/articles/PMC12143229/
- Transforming healthcare delivery with conversational AI platforms: https://pmc.ncbi.nlm.nih.gov/articles/PMC12484644/
- Twilio healthcare solutions: https://www.twilio.com/en-us/solutions/healthcare
- Twilio Commure customer story: https://customers.twilio.com/en-us/commure
- Twilio Voice and ElevenLabs integration: https://www.twilio.com/en-us/blog/developers/tutorials/integrations/build-twilio-voice-elevenlabs-agents-integration
- ElevenLabs healthcare agents: https://elevenlabs.io/agents/healthcare
- ElevenLabs conversational AI healthcare: https://elevenlabs.io/agents/conversational-ai-healthcare
- OhMD AI-powered patient communication: https://www.ohmd.com/
