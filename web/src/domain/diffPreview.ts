export type DiffPreviewEntry = {
  type: "same" | "added" | "removed";
  text: string;
};

export function buildDiffPreview(originalText: string, proposedText: string): DiffPreviewEntry[] {
  const original = originalText.split("\n");
  const proposed = proposedText.split("\n");
  const table = Array.from({ length: original.length + 1 }, () => new Uint32Array(proposed.length + 1));

  if (original.length * proposed.length > 120_000) {
    return [
      { type: "same", text: "Large proposal preview. Use the changed-line summary, then Apply to inspect the full unsaved editor diff." },
    ];
  }

  for (let originalIndex = original.length - 1; originalIndex >= 0; originalIndex -= 1) {
    for (let proposedIndex = proposed.length - 1; proposedIndex >= 0; proposedIndex -= 1) {
      table[originalIndex][proposedIndex] =
        original[originalIndex] === proposed[proposedIndex]
          ? table[originalIndex + 1][proposedIndex + 1] + 1
          : Math.max(table[originalIndex + 1][proposedIndex], table[originalIndex][proposedIndex + 1]);
    }
  }

  const entries: DiffPreviewEntry[] = [];
  let originalIndex = 0;
  let proposedIndex = 0;

  while (originalIndex < original.length && proposedIndex < proposed.length) {
    if (original[originalIndex] === proposed[proposedIndex]) {
      entries.push({ type: "same", text: original[originalIndex] });
      originalIndex += 1;
      proposedIndex += 1;
    } else if (table[originalIndex + 1][proposedIndex] >= table[originalIndex][proposedIndex + 1]) {
      entries.push({ type: "removed", text: original[originalIndex] });
      originalIndex += 1;
    } else {
      entries.push({ type: "added", text: proposed[proposedIndex] });
      proposedIndex += 1;
    }
  }

  while (originalIndex < original.length) {
    entries.push({ type: "removed", text: original[originalIndex] });
    originalIndex += 1;
  }

  while (proposedIndex < proposed.length) {
    entries.push({ type: "added", text: proposed[proposedIndex] });
    proposedIndex += 1;
  }

  return compactDiffPreview(entries);
}

function compactDiffPreview(entries: DiffPreviewEntry[]) {
  const changedIndexes = entries.map((entry, index) => (entry.type === "same" ? -1 : index)).filter((index) => index >= 0);
  if (!changedIndexes.length) return [{ type: "same" as const, text: "No content changes proposed." }];

  const keep = new Set<number>();
  for (const index of changedIndexes) {
    for (let next = Math.max(0, index - 3); next <= Math.min(entries.length - 1, index + 3); next += 1) {
      keep.add(next);
    }
  }

  const compacted: DiffPreviewEntry[] = [];
  let skipped = 0;

  entries.forEach((entry, index) => {
    if (!keep.has(index)) {
      skipped += 1;
      return;
    }

    if (skipped) {
      compacted.push({ type: "same", text: `... ${skipped.toLocaleString()} unchanged line${skipped === 1 ? "" : "s"} ...` });
      skipped = 0;
    }

    compacted.push(entry);
  });

  if (skipped) {
    compacted.push({ type: "same", text: `... ${skipped.toLocaleString()} unchanged line${skipped === 1 ? "" : "s"} ...` });
  }

  return compacted;
}
