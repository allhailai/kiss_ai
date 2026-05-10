export type EditorDiffRange = {
  from: number;
  to: number;
};

export type EditorDiffDeletion = {
  afterLine: number;
  count: number;
};

export type EditorDiff = {
  ranges: EditorDiffRange[];
  deletions: EditorDiffDeletion[];
};

export type DiffKind = "unsaved" | "saved";

function groupLineRanges(lineNumbers: number[]): EditorDiffRange[] {
  const sorted = [...new Set(lineNumbers)].sort((left, right) => left - right);
  const ranges: EditorDiffRange[] = [];

  for (const lineNumber of sorted) {
    const previous = ranges.at(-1);

    if (previous && lineNumber === previous.to + 1) {
      previous.to = lineNumber;
      continue;
    }

    ranges.push({ from: lineNumber, to: lineNumber });
  }

  return ranges;
}

export function countDiffRangeLines(ranges: EditorDiffRange[]) {
  return ranges.reduce((total, range) => total + Math.max(0, range.to - range.from + 1), 0);
}

export function countDeletedLines(deletions: EditorDiffDeletion[]) {
  return deletions.reduce((total, deletion) => total + deletion.count, 0);
}

function groupDeletions(deletions: EditorDiffDeletion[]): EditorDiffDeletion[] {
  const countsByLine = new Map<number, number>();

  for (const deletion of deletions) {
    countsByLine.set(deletion.afterLine, (countsByLine.get(deletion.afterLine) ?? 0) + deletion.count);
  }

  return [...countsByLine.entries()].map(([afterLine, count]) => ({ afterLine, count })).sort((left, right) => left.afterLine - right.afterLine);
}

function fallbackLineDiff(original: string[], current: string[]): EditorDiff {
  const changedLines: number[] = [];
  const sharedLength = Math.min(original.length, current.length);

  for (let index = 0; index < sharedLength; index += 1) {
    if (original[index] !== current[index]) {
      changedLines.push(index + 1);
    }
  }

  for (let index = sharedLength; index < current.length; index += 1) {
    changedLines.push(index + 1);
  }

  const deletionCount = Math.max(0, original.length - current.length);
  const deletions = deletionCount ? [{ afterLine: current.length, count: deletionCount }] : [];

  return { ranges: groupLineRanges(changedLines), deletions };
}

export function buildLineDiff(originalText: string, currentText: string): EditorDiff {
  if (originalText === currentText) return { ranges: [], deletions: [] };

  const original = originalText.split("\n");
  const current = currentText.split("\n");

  if (original.length * current.length > 250_000) {
    return fallbackLineDiff(original, current);
  }

  const table = Array.from({ length: original.length + 1 }, () => new Uint32Array(current.length + 1));

  for (let originalIndex = original.length - 1; originalIndex >= 0; originalIndex -= 1) {
    for (let currentIndex = current.length - 1; currentIndex >= 0; currentIndex -= 1) {
      table[originalIndex][currentIndex] =
        original[originalIndex] === current[currentIndex]
          ? table[originalIndex + 1][currentIndex + 1] + 1
          : Math.max(table[originalIndex + 1][currentIndex], table[originalIndex][currentIndex + 1]);
    }
  }

  const operations: Array<{ type: "equal" | "delete" | "insert"; lineNumber?: number }> = [];
  let originalIndex = 0;
  let currentIndex = 0;

  while (originalIndex < original.length && currentIndex < current.length) {
    if (original[originalIndex] === current[currentIndex]) {
      operations.push({ type: "equal" });
      originalIndex += 1;
      currentIndex += 1;
    } else if (table[originalIndex + 1][currentIndex] >= table[originalIndex][currentIndex + 1]) {
      operations.push({ type: "delete" });
      originalIndex += 1;
    } else {
      operations.push({ type: "insert", lineNumber: currentIndex + 1 });
      currentIndex += 1;
    }
  }

  while (currentIndex < current.length) {
    operations.push({ type: "insert", lineNumber: currentIndex + 1 });
    currentIndex += 1;
  }

  while (originalIndex < original.length) {
    operations.push({ type: "delete" });
    originalIndex += 1;
  }

  const changedLines: number[] = [];
  const deletions: EditorDiffDeletion[] = [];
  let hunkDeletes = 0;
  let hunkInserts: number[] = [];
  let previousCurrentLine = 0;

  const flushHunk = () => {
    if (!hunkDeletes && !hunkInserts.length) return;

    changedLines.push(...hunkInserts);

    const unmatchedDeletions = Math.max(0, hunkDeletes - hunkInserts.length);
    if (unmatchedDeletions > 0) {
      deletions.push({
        afterLine: hunkInserts.at(-1) ?? previousCurrentLine,
        count: unmatchedDeletions,
      });
    }

    hunkDeletes = 0;
    hunkInserts = [];
  };

  for (const operation of operations) {
    if (operation.type === "equal") {
      flushHunk();
      previousCurrentLine += 1;
    } else if (operation.type === "delete") {
      hunkDeletes += 1;
    } else {
      hunkInserts.push(operation.lineNumber ?? previousCurrentLine + 1);
      previousCurrentLine = operation.lineNumber ?? previousCurrentLine;
    }
  }

  flushHunk();

  return { ranges: groupLineRanges(changedLines), deletions: groupDeletions(deletions) };
}
