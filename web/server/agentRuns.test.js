import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRebuildStore } from "./agentRuns.js";

describe("rebuild store", () => {
  it("marks persisted running state interrupted after process state is lost", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "kiss-ai-rebuild-state-"));
    const projectSlugPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
    const firstStore = createRebuildStore({ stateDir, projectSlugPattern });

    await firstStore.setRebuildState("demo", {
      running: true,
      status: "running",
      message: "Running",
      events: [],
      log: [],
    });

    const secondStore = createRebuildStore({ stateDir, projectSlugPattern });
    const state = await secondStore.getRebuildState("demo");

    expect(state).toMatchObject({
      running: false,
      status: "interrupted",
      activeAssistantMessageId: null,
    });
    expect(state.events.at(-1)).toMatchObject({
      type: "error",
      status: "interrupted",
    });
  });
});
