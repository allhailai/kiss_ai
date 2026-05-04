# Skill: Build Directed Outputs

Generate deliverables from the compiled wiki and the project requirements.

## Inputs

- `human_goal_requirements.md`
- `human_output_requirements.md`
- `human_open_questions.md`
- `inputs_human/**`
- `inputs_ai/**`
- configured wiki path, defaulting to `outputs_ai/wiki/`

## Algorithm

1. Read the goal requirements, output requirements, and open questions.
2. Identify every required output family.
3. For each output family, extract:
   - output path
   - required files
   - required sections
   - citation standards
   - tone/audience standards
   - acceptance criteria
4. Read `{configured-wiki-path}/INDEX.md`.
5. Select relevant topic and concept articles.
6. Fall back to source files when wiki coverage is low or when exact citations are required.
7. Generate each output independently and completely.
8. Cite supporting wiki/source material for material claims.
9. List open questions and unresolved blockers.
10. Write only under `outputs_ai/`.

## Quality Rules

- Do not invent facts.
- Do not hide low-confidence conclusions.
- Do not cite a wiki article for a claim if the article itself says coverage is low and a raw source is needed.
- Do not batch outputs in a way that truncates or homogenizes project-specific detail.
- Use clickable relative Markdown links for source and wiki references, such as `[inputs_ai/example.md](../inputs_ai/example.md)`. Do not use code-formatted paths when the reference is intended to be navigable in Obsidian.
- Prefer plain English unless the output requirements require a technical or legal style.

## Output

Return:

- outputs generated
- outputs skipped
- source/wiki files used
- open blockers
- any low-confidence sections requiring review
