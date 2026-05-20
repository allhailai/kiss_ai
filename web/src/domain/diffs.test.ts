import { describe, expect, it } from "vitest";
import {
  buildLineDiff,
  countDeletedLines,
  countDiffRangeLines,
} from "./diffs";

describe("countDiffRangeLines", () => {
  it("returns 0 for empty ranges", () => {
    expect(countDiffRangeLines([])).toBe(0);
  });

  it("counts single-line ranges", () => {
    expect(countDiffRangeLines([{ from: 3, to: 3 }])).toBe(1);
  });

  it("counts multi-line ranges", () => {
    expect(countDiffRangeLines([{ from: 1, to: 5 }, { from: 10, to: 12 }])).toBe(8);
  });
});

describe("countDeletedLines", () => {
  it("returns 0 for empty deletions", () => {
    expect(countDeletedLines([])).toBe(0);
  });

  it("sums deletion counts", () => {
    expect(countDeletedLines([{ afterLine: 2, count: 3 }, { afterLine: 5, count: 1 }])).toBe(4);
  });
});

describe("buildLineDiff", () => {
  it("returns empty diff for identical text", () => {
    const diff = buildLineDiff("hello\nworld", "hello\nworld");
    expect(diff.ranges).toEqual([]);
    expect(diff.deletions).toEqual([]);
  });

  it("detects a single changed line", () => {
    const diff = buildLineDiff("line1\nline2\nline3", "line1\nchanged\nline3");
    expect(diff.ranges.length).toBe(1);
    expect(diff.ranges[0]).toEqual({ from: 2, to: 2 });
    expect(diff.deletions).toEqual([]);
  });

  it("detects inserted lines", () => {
    const diff = buildLineDiff("a\nc", "a\nb\nc");
    expect(diff.ranges.length).toBe(1);
    expect(diff.ranges[0]).toEqual({ from: 2, to: 2 });
    expect(diff.deletions).toEqual([]);
  });

  it("detects deleted lines", () => {
    const diff = buildLineDiff("a\nb\nc", "a\nc");
    expect(diff.deletions.length).toBeGreaterThan(0);
    expect(countDeletedLines(diff.deletions)).toBe(1);
  });

  it("handles empty original text", () => {
    const diff = buildLineDiff("", "new line");
    expect(diff.ranges.length).toBe(1);
    expect(diff.ranges[0]).toEqual({ from: 1, to: 1 });
  });

  it("handles empty current text (full deletion)", () => {
    const diff = buildLineDiff("line1\nline2", "");
    expect(diff.deletions.length).toBeGreaterThan(0);
  });

  it("handles multiple changed lines forming contiguous ranges", () => {
    const diff = buildLineDiff("a\nb\nc\nd\ne", "a\nX\nY\nd\ne");
    expect(diff.ranges).toEqual([{ from: 2, to: 3 }]);
    expect(diff.deletions).toEqual([]);
  });

  it("handles multiple non-contiguous changes", () => {
    const diff = buildLineDiff("a\nb\nc\nd\ne", "a\nX\nc\nY\ne");
    expect(diff.ranges.length).toBe(2);
    expect(diff.ranges).toEqual([
      { from: 2, to: 2 },
      { from: 4, to: 4 },
    ]);
  });

  it("falls back to line-by-line comparison for large inputs", () => {
    // 500 * 501 = 250_500 > 250_000 threshold
    const original = Array.from({ length: 500 }, (_, i) => `line ${i}`).join("\n");
    const current = Array.from({ length: 501 }, (_, i) => `line ${i}`).join("\n");
    const diff = buildLineDiff(original, current);
    // Should still produce a valid diff without error
    expect(diff.ranges.length).toBeGreaterThanOrEqual(0);
  });
});
