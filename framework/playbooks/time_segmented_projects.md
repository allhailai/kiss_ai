# Optional Playbook: Time-Segmented Projects

Use this playbook only when a project explicitly needs outputs or source inputs separated by time period. The generic framework default is evergreen topic/category organization:

```text
inputs_ai/
outputs_ai/wiki/
```

## When To Use

Consider time segmentation when the project must keep separate research states for:

- calendar years;
- fiscal years;
- contract years;
- reporting periods;
- regulatory cycles;
- grant periods;
- recurring evidence-review cycles;
- versioned source snapshots.

If the project does not need one of those boundaries, do not add time-segmented folders. Prefer source metadata such as publication date, checked date, effective date, or review date inside the source files.

## Configuration Pattern

Project requirements may opt into time segmentation by naming the desired paths directly.

Example:

```text
inputs_ai/2026/
outputs_ai/wiki/2026/
```

or:

```text
inputs_ai/fy2027/
outputs_ai/wiki/fy2027/
```

When a project opts in:

- Add project-specific period metadata under `.harness-state.json.extensions` only if the project requirements need it.
- Set `.harness-state.json.paths.wiki` to the segmented wiki path.
- Update `human_input_requirements.md` with the segmented `inputs_ai/` paths.
- Update `human_output_requirements.md` with the segmented wiki path.
- Keep final directed outputs under `outputs_ai/` unless the project requirements explicitly define a segmented output structure.

## Build Behavior

Commands and skills should read the configured project paths rather than assuming a year folder. When no segmented path is configured, use the evergreen defaults:

```text
inputs_ai/
outputs_ai/wiki/
```

When a segmented path is configured, use it consistently for wiki schema, index, topics, concepts, compile state, logs, and any source folders named by the project requirements.

## Review Questions

Before opting into time segmentation, confirm:

- What time boundary matters and why?
- Will sources and outputs be compared across periods?
- Should prior-period outputs be preserved as historical snapshots?
- Are final directed outputs period-specific or evergreen?
- Is date metadata inside source files enough without splitting folders?

If the answers are unclear, keep the generic evergreen structure and record dates as source metadata.
