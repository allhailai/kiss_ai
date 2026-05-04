# AI-Triaged Human Callback Workflow

## Sources Relied On

- `inputs_ai/workflows/clinical_outreach_workflows.md`
- `inputs_ai/agentic_platform/agentic_data_curation.md`
- `inputs_ai/populations/segmentation_accessibility_trust.md`
- `outputs_ai/wiki/topics/digital-to-live-escalation.md`

## Target Segment or Problem

Patients and caregivers who respond to digital outreach but need clarification, support, or human follow-up.

## Division of Labor

AI classifies replies, summarizes context, suggests next action, and places the case in the right queue. Humans review the summary, call when needed, and resolve exceptions.

## Workflow Steps

1. AI receives SMS, portal, or voice transcript event.
2. AI classifies intent: confirmed, needs reschedule, caregiver question, accessibility need, confusion, distress, complaint, opt-out, or clinical question.
3. Low-risk administrative items are completed automatically when policy allows.
4. Complex items route to the right human work queue with a summary.
5. Staff resolves and documents the outcome.

## Custom UI Components

- Work queue with priority and reason.
- Patient/caregiver context panel.
- Outreach timeline.
- Consent and channel preference banner.
- AI summary with source transcript.
- Escalation and close-loop controls.

## Constraints

Clinical questions, distress, complaints, unclear consent, and caregiver ambiguity should route to humans.
