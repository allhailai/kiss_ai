import { describe, expect, it } from "vitest";
import { isTerminalRebuildStatus, rebuildStatusLabel, resolveEffectiveRebuildModelId } from "./rebuild";
import type { RebuildModel, RebuildState } from "../contracts/api";

describe("isTerminalRebuildStatus", () => {
  const terminalStatuses: RebuildState["status"][] = ["finished", "finished_with_attention", "error", "blocked", "interrupted"];
  const nonTerminalStatuses: RebuildState["status"][] = ["running", "idle"];

  it.each(terminalStatuses)("returns true for terminal status: %s", (status) => {
    expect(isTerminalRebuildStatus(status)).toBe(true);
  });

  it.each(nonTerminalStatuses)("returns false for non-terminal status: %s", (status) => {
    expect(isTerminalRebuildStatus(status)).toBe(false);
  });
});

describe("resolveEffectiveRebuildModelId", () => {
  const models: RebuildModel[] = [
    { id: "gpt-4", name: "GPT-4", capabilities: [] },
    { id: "gpt-3.5", name: "GPT-3.5", capabilities: [] },
  ] as unknown as RebuildModel[];

  it("returns selectedModelId when provided", () => {
    expect(resolveEffectiveRebuildModelId("custom-model", models)).toBe("custom-model");
  });

  it("falls back to first model when selectedModelId is empty", () => {
    expect(resolveEffectiveRebuildModelId("", models)).toBe("gpt-4");
  });

  it("falls back to fallbackModelId when no models available", () => {
    expect(resolveEffectiveRebuildModelId("", [])).toBe("default");
  });

  it("uses custom fallback when provided", () => {
    expect(resolveEffectiveRebuildModelId("", [], "my-fallback")).toBe("my-fallback");
  });
});

describe("rebuildStatusLabel", () => {
  it("returns correct labels for known statuses", () => {
    expect(rebuildStatusLabel("running")).toBe("Building");
    expect(rebuildStatusLabel("finished")).toBe("Build complete");
    expect(rebuildStatusLabel("finished_with_attention")).toBe("Build complete");
    expect(rebuildStatusLabel("error")).toBe("Build error");
    expect(rebuildStatusLabel("blocked")).toBe("Build blocked");
    expect(rebuildStatusLabel("interrupted")).toBe("Build interrupted");
    expect(rebuildStatusLabel("idle")).toBe("Not started");
  });

  it("returns 'Not started' for null and undefined", () => {
    expect(rebuildStatusLabel(null)).toBe("Not started");
    expect(rebuildStatusLabel(undefined)).toBe("Not started");
  });

  it("returns the status string for unknown statuses", () => {
    expect(rebuildStatusLabel("some_new_status")).toBe("some_new_status");
  });
});
