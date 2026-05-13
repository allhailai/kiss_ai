# Requirements Sync Output Contract

Return a single JSON object with this shape:

```json
{
  "step": "goal",
  "targetFilePath": "human_goal_requirements.md",
  "summary": "Short user-facing summary.",
  "conceptualDiffs": [
    {
      "id": "stable_short_id",
      "filePath": "human_goal_requirements.md",
      "title": "Short title",
      "summary": "What concept changed and why.",
      "status": "accepted",
      "target": {
        "scope": "local",
        "sections": ["Section name"],
        "anchors": ["Nearby phrase"]
      },
      "intent": {
        "objective": "What should be true after applying this conceptual diff.",
        "rationale": "Why this change is needed.",
        "mustPreserve": ["Requirement or voice to preserve"],
        "avoid": ["Negative constraint"]
      },
      "evidence": {
        "userGuidance": ["User instruction or open question signal"],
        "gitDiffSignals": ["Relevant Git diff signal"],
        "contextSignals": ["Requirement/source/annotation signal"]
      },
      "applyNotes": {
        "expectedChangeShape": "How broad the eventual edit should be.",
        "nonGoals": ["What the apply run should not do"],
        "riskLevel": "low"
      },
      "memory": {
        "reconsidersRejectedId": "prior rejection id when reconsidering",
        "reconsiderReason": "Fresh evidence or explicit user guidance that justifies reconsideration."
      }
    }
  ],
  "sourceSignalsUsed": ["Concise signal description."]
}
```

Rules:

- `step` must match the requested step: `goal`, `inputs`, or `outputs`.
- `targetFilePath` must be the target file for that step.
- Every conceptual diff must include `filePath`, and it must equal `targetFilePath`.
- `conceptualDiffs` must be non-empty when the target file needs meaningful changes.
- `status` should default to `accepted`.
- Use `target.scope: "document"` for broad file-wide alignment, and choose the narrowest scope that satisfies the intent.
- Use `applyNotes.riskLevel: "high"` for content removal, source removals, output removals, scope narrowing, or conflict resolution that may surprise the user.
- Do not invent evidence. Omit unsupported arrays or leave them empty.
- Treat `conceptual_diff_rejection_memory` in the payload as soft suppression guidance.
- Do not re-propose an exact rejected concept unless fresh evidence or explicit user guidance justifies reconsideration.
- If reconsidering a rejected concept, include `memory.reconsidersRejectedId` and `memory.reconsiderReason`.
- If no changes are warranted, return an empty `conceptualDiffs` array and explain why in `summary`.
- Do not return full replacement Markdown content.
- Do not include Markdown code fences around the JSON response.
