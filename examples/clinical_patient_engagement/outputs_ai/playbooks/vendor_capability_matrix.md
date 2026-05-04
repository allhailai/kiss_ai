# Vendor Capability Matrix

## Sources Relied On

- `inputs_ai/agentic_platform/vendor_capabilities_twilio_elevenlabs_comparable.md`
- `inputs_ai/agentic_platform/ai_voice_sms_agents.md`
- `outputs_ai/wiki/topics/vendor-capabilities-and-constraints.md`

| Capability | Twilio-like Platform | ElevenLabs-like Platform | Comparable Vendors | Governance Need |
|---|---|---|---|---|
| SMS delivery | Core | Usually via integration | Common | Consent, opt-out, PHI minimization |
| VOIP/calling | Core | Sometimes via integration | Common | TCPA, disclosure, call logs |
| AI voice | Partner or build layer | Core | Growing | AI voice consent, QA, escalation |
| Contact center | Twilio Flex-like | Not primary | Common | Human handoff and work queues |
| Data activation | Segment-like | Not primary | CDP vendors | Privacy, segmentation fairness |
| Summaries/classification | AI add-on | Possible | Common | Auditability and review |

## Recommendation

Evaluate vendors by capability, BAA/data handling posture, integration flexibility, monitoring, and operational fit rather than brand alone.
