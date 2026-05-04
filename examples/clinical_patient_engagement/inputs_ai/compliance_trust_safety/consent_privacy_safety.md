# Consent, Privacy, Trust, and Safety Constraints

## Metadata

- source/citation: see Sources
- source URL when available: see Sources
- source type: compliance source and expert opinion
- category: compliance_trust_safety
- population or setting: Patients and caregivers, especially Medicaid and HCBS contexts
- modality: SMS, phone, AI voice, email, portal, mail
- agentic capability: AI-generated communication, voice agents, summaries, automation governance
- workflow stage: caveats and safety controls
- last_checked date: 2026-04-27
- status: initial baseline source synthesis

## Summary

Engagement workflows must account for HIPAA, consent, opt-out, caregiver authorization, TCPA considerations, AI voice rules, minimum necessary content, and clinical safety boundaries. This project should surface constraints but not provide final legal advice.

## Key Findings

- HIPAA-related guidance emphasizes secure messaging, minimum necessary information, access controls, audit controls, and BAAs when vendors handle PHI.
- TCPA healthcare communication rules depend on content, consent, purpose, and opt-out handling.
- The FCC has confirmed that TCPA restrictions for artificial or prerecorded voices apply to AI-generated voices.
- AI-generated communication should include human oversight, disclosure where required, escalation, auditability, and monitoring.

## Practical Tactics or Workflow Patterns

- Track consent and opt-out status by channel and by patient/caregiver relationship.
- Keep SMS content minimal and administrative unless secure messaging and consent permit more detail.
- Route distress, clinical uncertainty, complaints, or safety concerns to humans.

## Transferability Assessment

Cross-industry automation must be constrained by clinical governance and privacy rules.

## Operational Implications

Every AI-heavy and mixed strategy should include review, override, escalation, QA, and fallback.

## Compliance, Privacy, Safety, Trust, and Accessibility Caveats

Not legal advice. Compliance posture must be reviewed by qualified counsel and privacy/compliance leaders.

## Limitations

This is an initial internet-informed baseline. It combines public evidence, public guidance, public vendor pages, and strategy synthesis. Vendor claims are not treated as independent proof of effectiveness.

## Open Questions

- Confirm the exact Medicaid ABD, MLTSS, and HCBS service lines to prioritize first.
- Confirm consent model and caregiver/proxy communication rules before implementation.

## Sources

- HIPAA Journal: SMS regulations: https://www.hipaajournal.com/hipaa-regulations-for-sms/
- CMS texting patient information and orders: https://www.cms.gov/medicare/health-safety-standards/quality-safety-oversight-general-information/policy-memos-states-and-cms-locations/texting-patient-information-and-orders-hospitals-and-cahs
- FCC AI voice TCPA ruling: https://www.fcc.gov/document/fcc-confirms-tcpa-applies-ai-technologies-generate-human-voices
- Solum Health TCPA healthcare texting rules: https://getsolum.com/glossary/tcpa-healthcare-texting-rules
