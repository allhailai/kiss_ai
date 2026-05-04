# Input Requirements

## Purpose

Maintain AI-managed source files that support a patient engagement strategy wiki and practical workflow outputs for virtual and telehealth-based clinical service delivery companies. The source corpus should help discover best-in-class engagement strategies from healthcare and adjacent industries, evaluate whether they transfer safely to clinical care delivery, and identify where agentic automation, custom workflows, and custom UI can improve patient engagement.

## Source Scope

Sources should be organized by topic or source category. Add date metadata to source files so aging evidence can be reviewed later.

## Human Inputs

Human-owned context belongs in `inputs_human/`. Useful inputs may include:

- company context or patient population notes;
- current outreach workflows;
- call scripts, SMS examples, IVR examples, email/portal templates, and mailer examples;
- compliance, privacy, brand, consent, and clinical governance constraints;
- preferred or available technology stack details;
- source lists, benchmark programs, and competitor examples.

## AI-Managed Source Locations

Generated or refreshed source files belong under `inputs_ai/`. Use topic folders rather than year folders:

```text
inputs_ai/
  healthcare_examples/
  cross_industry_examples/
  evidence/
  modalities/
  agentic_platform/
  workflows/
  populations/
  operations/
  compliance_trust_safety/
  measurement/
```

## Required Source Categories

Create and maintain source files covering the categories below. Prefer specific case studies, implementation examples, benchmarks, and evidence over generic blog summaries.

### Healthcare and Digital Health Examples

- Best-in-class patient engagement examples from health systems, payers, care management companies, virtual care companies, digital health companies, and patient engagement vendors.
- Examples of companies using SMS, phone outreach, voice agents, portals, apps, mailers, and hybrid engagement sequences.
- Case studies on appointment reminders, no-show reduction, medication adherence, care gap closure, chronic care follow-up, post-discharge follow-up, remote patient monitoring, and preventive care outreach.
- Patient engagement vendor case studies, including stated outcomes, workflow design, channels used, limitations, and conflicts of interest.

### Cross-Industry Engagement Examples

Gather transferable patterns from non-healthcare industries and clearly mark them as adapted practices, not healthcare evidence. Relevant industries include:

- consumer technology and apps;
- financial services and fintech;
- retail and e-commerce;
- hospitality and travel;
- education and online learning;
- subscription services and membership programs;
- customer support and contact centers.

For each cross-industry example, capture what may transfer to clinical engagement and what may not transfer because of trust, consent, privacy, accessibility, or patient safety concerns.

### Modalities and Channel Strategy

Maintain source files on:

- SMS/text-message engagement practices;
- phone outreach, call sequencing, voicemail, and callback strategies;
- AI voice calls, voice agents, conversational voice UX, and human handoff;
- mailed communication and print nudges;
- email and patient portal messaging;
- push notifications and app-based engagement where relevant;
- blended channel strategies and escalation from low-touch to high-touch outreach.

### Agentic Platform and Vendor Capabilities

Gather information on capabilities and constraints relevant to a customizable agentic engagement platform, including:

- telephony and messaging vendors such as Twilio or comparable SMS/VOIP platforms;
- voice-generation and voice-agent vendors such as ElevenLabs or comparable tools;
- conversational AI, agent orchestration, workflow automation, prompt/script configuration, and routing/escalation;
- agentic data-curation workflows for collecting, classifying, summarizing, refreshing, and monitoring engagement evidence and patient context;
- custom UI opportunities for clinical teams, including work queues, outreach timeline views, patient context panels, approval queues, analytics dashboards, and intervention design tools;
- monitoring, audit logs, QA review, prompt/version control, and human override patterns.

Do not treat vendor marketing claims as proven evidence. Capture vendor claims separately from independent evidence or customer case studies.

### Patient-Facing Agentic Engagement Evidence

Gather evidence, case studies, and implementation examples that compare patient-facing agentic engagement channels and techniques, including:

- AI voice or agentic telephonic outreach;
- SMS outreach with documented consent and opt-out handling;
- SMS notifications that link patients or caregivers into secure messaging, patient portal, mobile app, or secure web app workflows;
- conversational AI chat, secure messaging assistants, and patient-facing workflow agents;
- human handoff patterns from AI voice, SMS, chat, or secure messaging;
- measurable outcomes such as response rate, completion rate, no-show reduction, care gap closure, call deflection, staff burden, patient trust, opt-outs, complaints, and safety events;
- tools and techniques used successfully by healthcare organizations, patient engagement vendors, contact center vendors, and secure messaging platforms.

For each example, distinguish independent evidence from vendor claims, and capture whether the channel is best suited for low-risk administrative workflows, care coordination, caregiver-supported workflows, or human-escalated exceptions.

### Workflow and Operations

Maintain source files on:

- appointment reminders and no-show reduction;
- pre-visit intake and preparation;
- post-visit follow-up;
- care plan adherence and longitudinal check-ins;
- patient segmentation and prioritization;
- escalation workflows from digital outreach to live staff;
- closed-loop documentation and task completion;
- staff roles for care teams, schedulers, navigators, nurses, clinicians, and AI agents;
- workflow failure modes such as unreachable patients, wrong numbers, language barriers, distrust, message fatigue, and accessibility needs.

### Populations, Trust, and Accessibility

Maintain source files on:

- patient segmentation by engagement need, risk, digital access, language, literacy, trust, condition burden, social need, and care complexity;
- accessibility, language access, disability accommodations, caregiver/proxy communication, and health literacy;
- patient trust, tone, empathy, personalization, and message clarity;
- over-messaging, coercive nudges, dark patterns, and tactics that should be avoided in clinical contexts.

### Compliance, Privacy, and Clinical Safety

Maintain source files on:

- consent and opt-out expectations for SMS, calls, email, and portal messaging;
- HIPAA/privacy considerations for clinical outreach and AI-generated communications;
- TCPA and telemarketing boundaries where relevant;
- governance for generative AI outputs, including human review, escalation, auditability, and safety monitoring;
- boundaries between patient engagement, clinical advice, marketing, and care coordination.

This project should surface compliance and safety constraints clearly, but it should not provide final legal advice.

### Measurement and Outcomes

Maintain source files on:

- engagement KPIs and operational metrics;
- response rates, completion rates, reachability, no-show rates, care gap closure, adherence, patient satisfaction, and retention;
- A/B testing and experimentation practices;
- qualitative feedback loops and staff review;
- how to evaluate agentic workflows safely before broad rollout.

## Initial Source Inventory

The first AI-managed source pass should create at least one source file for each major folder listed under `AI-Managed Source Locations`. The first useful baseline should include no fewer than these source files:

- `inputs_ai/healthcare_examples/best_in_class_healthcare_engagement.md`
- `inputs_ai/cross_industry_examples/transferable_engagement_patterns.md`
- `inputs_ai/modalities/sms_engagement.md`
- `inputs_ai/modalities/phone_and_voice_engagement.md`
- `inputs_ai/modalities/mail_email_portal_engagement.md`
- `inputs_ai/agentic_platform/ai_voice_sms_agents.md`
- `inputs_ai/agentic_platform/vendor_capabilities_twilio_elevenlabs_comparable.md`
- `inputs_ai/agentic_platform/patient_facing_agentic_engagement.md`
- `inputs_ai/agentic_platform/agentic_data_curation.md`
- `inputs_ai/workflows/clinical_outreach_workflows.md`
- `inputs_ai/populations/segmentation_accessibility_trust.md`
- `inputs_ai/compliance_trust_safety/consent_privacy_safety.md`
- `inputs_ai/measurement/engagement_metrics_and_experimentation.md`

## Source File Standards

Each source file should include:

- title;
- source/citation;
- source URL when available;
- source type: healthcare evidence, healthcare case study, vendor claim, cross-industry example, expert opinion, compliance source, or internal human context;
- category;
- population or setting;
- modality;
- agentic capability, if relevant;
- workflow stage;
- last_checked date;
- status;
- summary;
- key findings;
- practical tactics or workflow patterns;
- transferability assessment;
- operational implications;
- compliance, privacy, safety, trust, and accessibility caveats;
- limitations;
- open questions;
- sources.

## Internet Research Guidance

When gathering data from the internet, prioritize:

1. peer-reviewed evidence, systematic reviews, public health guidance, and reputable healthcare research organizations;
2. published case studies from healthcare organizations and digital health vendors, while labeling vendor claims clearly;
3. product documentation and capability pages from telephony, messaging, AI voice, conversational AI, and workflow vendors;
4. cross-industry case studies and behavioral design patterns from reputable sources;
5. compliance/privacy guidance from official or reputable sources.

For each internet-derived claim, capture the source URL, publication date or access date, and whether the source is independent evidence, vendor marketing, expert opinion, or adapted non-healthcare practice.

## Refresh Cadence

- Evidence and literature: semi-annually or when a major new guideline, review, or benchmark appears.
- Vendor capabilities: quarterly or when a named vendor releases material new SMS, VOIP, voice-agent, workflow, or AI capability.
- Compliance/privacy sources: quarterly or when regulations/guidance change.
- Cross-industry examples: semi-annually or when a notable engagement pattern becomes relevant.
- Internal human context: ad hoc when workflows, target populations, platform capabilities, or business goals change.

## Material Change Rules

Flag a source update as material if it changes:

- recommended modality selection;
- consent or privacy requirements;
- outreach cadence or escalation workflow;
- accessibility obligations;
- patient safety or trust considerations;
- agentic workflow governance or human-in-the-loop requirements;
- vendor capability assumptions;
- custom UI or workflow recommendations;
- final output recommendations.

## Open Questions

Track unresolved questions in `human_open_questions.md`. Questions should include affected patient segment, modality, operational owner, agentic capability if relevant, and whether they block implementation.

## Acceptance Criteria

- Initial source inventory covers all folders and required source files listed above.
- Sources are organized by topic, not year.
- Healthcare evidence, healthcare case studies, vendor claims, expert opinion, and adapted cross-industry tactics are clearly distinguished.
- Agentic patient interaction strategies and agentic data-curation strategies are both represented.
- Vendor capabilities are captured without treating vendor claims as independent proof.
- Material changes are flagged before downstream outputs are trusted.
- Open questions are visible in both source files and generated outputs where relevant.
