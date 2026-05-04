# AI Voice and SMS Agents

## Metadata

- source/citation: see Sources
- source URL when available: see Sources
- source type: vendor claim and expert opinion
- category: agentic_platform
- population or setting: Patients and caregivers in low-risk administrative workflows with escalation paths
- modality: AI SMS, AI voice, conversational agents
- agentic capability: Patient-facing AI agents for outreach, reminders, intake, and routing
- workflow stage: automated interaction with human escalation
- last_checked date: 2026-04-27
- status: initial baseline source synthesis

## Summary

AI voice and SMS agents can support scale in repetitive, low-risk engagement workflows. Their use in clinical populations requires governance, transparency, consent, content boundaries, monitoring, and human escalation.

## Key Findings

- Vendors such as ElevenLabs describe healthcare voice agents for scheduling, intake, triage routing, and patient questions.
- Twilio describes healthcare communication capabilities across messaging, voice, email, contact center, and customer data infrastructure.
- AI-generated voice calls are subject to TCPA artificial/prerecorded voice restrictions according to the FCC.
- AI agents should not be used as independent clinical decision-makers.

## Practical Tactics or Workflow Patterns

- Begin with administrative workflows: reminders, confirmations, callback collection, and routing.
- Use AI-generated messages as drafts or governed actions with approved templates and escalation rules.
- Sample and QA agent interactions before expansion.

## Transferability Assessment

Consumer AI personalization and contact center automation patterns are useful, but healthcare needs stricter content boundaries and auditability.

## Operational Implications

Platform requirements include prompt/version control, consent checks, transcript review, fallback to humans, audit logs, and analytics.

## Compliance, Privacy, Safety, Trust, and Accessibility Caveats

Vendor claims must be validated. HIPAA eligibility depends on configuration, BAAs, data handling, and implementation details.

## Limitations

This is an initial internet-informed baseline. It combines public evidence, public guidance, public vendor pages, and strategy synthesis. Vendor claims are not treated as independent proof of effectiveness.

## Open Questions

- Confirm the exact Medicaid ABD, MLTSS, and HCBS service lines to prioritize first.
- Confirm consent model and caregiver/proxy communication rules before implementation.

## Sources

- Twilio healthcare solutions: https://www.twilio.com/en-us/solutions/healthcare
- ElevenLabs conversational AI healthcare: https://elevenlabs.io/agents/conversational-ai-healthcare
- FCC AI voice TCPA ruling: https://www.fcc.gov/document/fcc-confirms-tcpa-applies-ai-technologies-generate-human-voices
