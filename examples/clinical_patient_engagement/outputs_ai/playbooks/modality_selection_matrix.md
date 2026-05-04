# Modality Selection Matrix

## Sources Relied On

- `inputs_ai/modalities/sms_engagement.md`
- `inputs_ai/modalities/phone_and_voice_engagement.md`
- `inputs_ai/modalities/mail_email_portal_engagement.md`
- `inputs_ai/populations/segmentation_accessibility_trust.md`
- `outputs_ai/wiki/topics/sms-engagement.md`
- `outputs_ai/wiki/topics/phone-outreach.md`

## Matrix

| Modality | Best Fit | Avoid or Escalate When | AI Fit | Human Fit |
|---|---|---|---|---|
| SMS | Short reminders, confirmations, prep steps | Sensitive PHI, unclear consent, shared phone risk | High for drafts and low-risk automation | Medium for exceptions |
| Live phone | Complex, trust-sensitive, repeated non-response | Simple high-volume reminders | Low to medium | High |
| AI voice | Low-risk scripted calls, callback capture | Distress, clinical advice, consent ambiguity | Medium to high with governance | Required for escalation |
| Mail | Durable instructions, fallback, formal notices | Urgent needs | Low | Medium |
| Email/portal | Longer instructions, attachments, caregiver support where permitted | Low portal adoption or privacy concern | Medium for drafting and triage | Medium for review |

## Caveats

This matrix is not legal advice. Consent, HIPAA, TCPA, caregiver authorization, accessibility, and patient preference must be checked before operational use.
