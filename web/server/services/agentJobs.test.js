import { describe, expect, it, vi, beforeEach } from "vitest";
import { createAgentJobService } from "./agentJobs.js";

/**
 * Minimal mock dependencies for createAgentJobService.
 * These stubs return just enough to exercise job lifecycle
 * without running actual agent phases.
 */
function createMockDeps(overrides = {}) {
  const state = {};

  return {
    FRAMEWORK_ROOT: "/tmp/fake-framework",
    activeRebuilds: new Map(),
    appendAssistantDelta: vi.fn(),
    appendRunEvent: vi.fn(),
    finishAssistantMessage: vi.fn(),
    getHumanAttentionItems: vi.fn().mockReturnValue([]),
    getRebuildState: vi.fn(async (slug) => state[slug] || { running: false, status: "idle", events: [], log: [] }),
    httpError: (msg, status = 500) => Object.assign(new Error(msg), { statusCode: status }),
    listCursorModels: vi.fn().mockResolvedValue([{ id: "model-1", name: "Test Model" }]),
    pickRebuildModelId: vi.fn().mockReturnValue("model-1"),
    projectAgentLock: {
      acquire: vi.fn().mockReturnValue(() => {}),
    },
    readProjectHarness: vi.fn().mockResolvedValue({}),
    resolveCursorApiKey: vi.fn().mockResolvedValue({ available: true, apiKey: "test-key", source: "test" }),
    runCursorAgent: vi.fn().mockResolvedValue({ status: "finished", result: "Done" }),
    setRebuildState: vi.fn(async (slug, newState) => {
      state[slug] = newState;
    }),
    // Expose for assertions
    _state: state,
    ...overrides,
  };
}

describe("agentJobs", () => {
  describe("startRebuild — blocked states", () => {
    it("returns blocked state when no API key is available", async () => {
      const deps = createMockDeps({
        resolveCursorApiKey: vi.fn().mockResolvedValue({ available: false }),
      });
      const service = createAgentJobService(deps);

      const result = await service.startRebuild({ slug: "test-project", path: "/tmp/test" }, null);

      // Should have set state with status blocked
      expect(deps.setRebuildState).toHaveBeenCalledWith(
        "test-project",
        expect.objectContaining({ status: "blocked", running: false })
      );
      // Event should have been appended with blocked status
      expect(deps.appendRunEvent).toHaveBeenCalledWith(
        "test-project",
        expect.objectContaining({ status: "blocked", type: "error" })
      );
    });

    it("returns blocked state when no models are available", async () => {
      const deps = createMockDeps({
        listCursorModels: vi.fn().mockResolvedValue([]),
      });
      const service = createAgentJobService(deps);

      const result = await service.startRebuild({ slug: "test-project", path: "/tmp/test" }, null);

      expect(deps.setRebuildState).toHaveBeenCalledWith(
        "test-project",
        expect.objectContaining({ status: "blocked", running: false })
      );
    });
  });

  describe("startRebuild — already running", () => {
    it("returns existing state when a rebuild is already running", async () => {
      const existingState = {
        running: true,
        status: "running",
        events: [],
        log: [],
        startedAt: new Date().toISOString(),
      };
      const deps = createMockDeps({
        getRebuildState: vi.fn().mockResolvedValue(existingState),
      });
      const service = createAgentJobService(deps);

      const result = await service.startRebuild({ slug: "test-project", path: "/tmp/test" }, null);

      // Should return the existing running state without starting a new one
      expect(result).toMatchObject({ running: true, status: "running" });
      // Should NOT acquire a new project agent lock since it returned early
      // (it calls startAgentJobUnlocked which checks state.running first)
    });
  });

  describe("startFullRebuild — blocked state", () => {
    it("returns blocked state when no API key is available", async () => {
      const deps = createMockDeps({
        resolveCursorApiKey: vi.fn().mockResolvedValue({ available: false }),
      });
      const service = createAgentJobService(deps);

      const result = await service.startFullRebuild({ slug: "test-project", path: "/tmp/test" }, null);

      expect(deps.setRebuildState).toHaveBeenCalledWith(
        "test-project",
        expect.objectContaining({ status: "blocked", running: false })
      );
    });
  });
});
