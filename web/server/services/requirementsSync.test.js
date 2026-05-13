import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createRequirementsSyncService, extractRequirementsSyncApplyResult, extractRequirementsSyncProposal } from "./requirementsSync.js";
import { emptyConceptualDiffMemory, normalizeConceptualDiffMemoryFile, updateConceptualDiffRejectionMemory } from "./conceptualDiffMemory.js";
import { httpError } from "./httpErrors.js";
import { createProjectAgentLock } from "./projectAgentLock.js";

async function createFrameworkRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kiss-ai-framework-"));
  const promptRoot = path.join(root, "prompts", "requirements_sync");
  await fs.mkdir(promptRoot, { recursive: true });
  await Promise.all(
    ["system.md", "step_goal.md", "step_inputs.md", "step_outputs.md", "output_contract.md", "apply_contract.md"].map((fileName) =>
      fs.writeFile(path.join(promptRoot, fileName), `${fileName}\n`, "utf8"),
    ),
  );
  return root;
}

function createHarness(options = { frameworkRoot: "", runCursorAgent: null }) {
  const { frameworkRoot, projectPath = path.join(os.tmpdir(), "demo-project"), runCursorAgent } = options;
  const project = { slug: "demo", name: "Demo", path: projectPath };
  const files = new Map([
    ["human_goal_requirements.md", "Goal\n"],
    ["human_input_requirements.md", "Inputs\n"],
    ["human_output_requirements.md", "Outputs\n"],
    ["human_open_questions.md", "- What scope?\n"],
    ["change_logs/annotation_change_logs.md", "# Annotation Log\n"],
  ]);
  const service = createRequirementsSyncService({
    FRAMEWORK_ROOT: frameworkRoot,
    gitFileDiffText: async (_projectRoot, relativePath) => ({ diff: relativePath === "human_goal_requirements.md" ? "diff --git a/goal b/goal\n" : "", diffError: "" }),
    gitStatus: async () => [" M human_goal_requirements.md"],
    httpError,
    listCursorModels: async () => [{ id: "model-a" }],
    listProjectFiles: async (_projectRoot, rootRelative) =>
      rootRelative === "inputs_human" ? [{ path: "inputs_human/source.pdf", name: "source.pdf", modifiedAt: "2026-05-12T00:00:00.000Z", previewable: false }] : [],
    pickRebuildModelId: () => "model-a",
    projectAgentLock: createProjectAgentLock({ httpError }),
    readTextFile: async (_projectRoot, relativePath) => ({
      path: relativePath,
      content: files.get(relativePath) ?? "",
      contentHash: `hash:${files.get(relativePath)?.length ?? 0}`,
      kind: relativePath.startsWith("change_logs/") ? "log" : "human",
      editable: !relativePath.startsWith("change_logs/"),
      annotation: false,
    }),
    resolveCursorApiKey: async () => ({ available: true, apiKey: "cursor-key", source: "test", warnings: [] }),
    runCursorAgent:
      runCursorAgent ??
      (async ({ onEvent, prompt }) => {
        const step = prompt.includes('"step": "inputs"') ? "inputs" : prompt.includes('"step": "outputs"') ? "outputs" : "goal";
        const targetFilePath =
          step === "inputs" ? "human_input_requirements.md" : step === "outputs" ? "human_output_requirements.md" : "human_goal_requirements.md";
        if (prompt.includes("approved_conceptual_diffs")) {
          files.set(targetFilePath, `Applied ${step}\n`);
          await onEvent({
            type: "assistant_delta",
            text: `<requirements_sync_apply_json>${JSON.stringify({ failedConceptualDiffIds: [], notice: `Applied ${step}.` })}</requirements_sync_apply_json>`,
          });
          return { status: "finished" };
        }
        await onEvent({
          type: "assistant_delta",
          text: `<requirements_sync_proposal_json>${JSON.stringify({
            summary: `Updated ${step}.`,
            conceptualDiffs: [
              {
                id: `${step}_diff`,
                filePath: targetFilePath,
                title: "Clarify",
                summary: "Clarify requirements.",
                status: "accepted",
                target: { scope: step === "goal" ? "document" : "section", sections: [step] },
                intent: { objective: `Align ${step} requirements.`, mustPreserve: ["Existing useful requirements"], avoid: ["Scope creep"] },
                applyNotes: { expectedChangeShape: "Surgical requirement edits.", riskLevel: "medium" },
              },
            ],
            sourceSignalsUsed: ["Git status signal"],
          })}</requirements_sync_proposal_json>`,
        });
      }),
  });

  return { files, project, service };
}

async function proposeAllRequirementsSync(service, project) {
  const proposals = [];
  for (const step of ["goal", "inputs", "outputs"]) {
    proposals.push((await service.proposeRequirementsSync(project, { step, modelId: "model-a" })).proposal);
  }
  return proposals;
}

describe("requirements sync service", () => {
  it("extracts structured proposals", () => {
    const proposal = extractRequirementsSyncProposal(
      `<requirements_sync_proposal_json>${JSON.stringify({
        summary: "Clarify goal.",
        conceptualDiffs: [
          {
            filePath: "human_goal_requirements.md",
            title: "Clarify",
            summary: "Clarifies project scope.",
            target: { scope: "document" },
            intent: { objective: "Make the goal the project rudder.", avoid: ["Expanding scope"] },
            applyNotes: { riskLevel: "medium" },
          },
        ],
        sourceSignalsUsed: ["Git diff"],
      })}</requirements_sync_proposal_json>`,
      {
        originalContentHash: "hash-before",
        step: "goal",
        targetFilePath: "human_goal_requirements.md",
      },
    );

    expect(proposal).toMatchObject({
      step: "goal",
      targetFilePath: "human_goal_requirements.md",
      conceptualDiffs: [expect.objectContaining({ filePath: "human_goal_requirements.md", status: "accepted", applyNotes: { riskLevel: "medium" } })],
    });
  });

  it("proposes a goal sync using the locked Cursor run", async () => {
    const frameworkRoot = await createFrameworkRoot();
    const { project, service } = createHarness({ frameworkRoot, runCursorAgent: null });

    const response = await service.proposeRequirementsSync(project, { step: "goal", modelId: "model-a" });

    expect(response.proposal).toMatchObject({
      step: "goal",
      targetFilePath: "human_goal_requirements.md",
      modelId: "model-a",
      conceptualDiffs: [expect.objectContaining({ filePath: "human_goal_requirements.md", target: { scope: "document", sections: ["goal"] } })],
    });
  });

  it("applies accepted conceptual diffs without full-file replacement writes", async () => {
    const frameworkRoot = await createFrameworkRoot();
    const { files, project, service } = createHarness({ frameworkRoot, runCursorAgent: null });

    const proposed = await service.proposeRequirementsSync(project, { step: "goal", modelId: "model-a" });
    const response = await service.applyRequirementsSync(project, { modelId: "model-a", proposal: proposed.proposal });

    expect(response).toMatchObject({
      appliedFile: { path: "human_goal_requirements.md" },
      failedConceptualDiffIds: [],
      summary: "Applied goal.",
    });
    expect(files.get("human_goal_requirements.md")).toBe("Applied goal\n");
  });

  it("applies all accepted requirements sync proposals in a batch", async () => {
    const frameworkRoot = await createFrameworkRoot();
    const { files, project, service } = createHarness({ frameworkRoot, runCursorAgent: null });
    const proposals = await proposeAllRequirementsSync(service, project);

    const response = await service.applyRequirementsSyncBatch(project, { modelId: "model-a", proposals });

    expect(response.results).toEqual([
      expect.objectContaining({ step: "goal", status: "applied", appliedFile: { path: "human_goal_requirements.md", contentHash: "hash:13" } }),
      expect.objectContaining({ step: "inputs", status: "applied", appliedFile: { path: "human_input_requirements.md", contentHash: "hash:15" } }),
      expect.objectContaining({ step: "outputs", status: "applied", appliedFile: { path: "human_output_requirements.md", contentHash: "hash:16" } }),
    ]);
    expect(files.get("human_goal_requirements.md")).toBe("Applied goal\n");
    expect(files.get("human_input_requirements.md")).toBe("Applied inputs\n");
    expect(files.get("human_output_requirements.md")).toBe("Applied outputs\n");
  });

  it("records rejected batch proposals and skips files with no accepted diffs", async () => {
    const frameworkRoot = await createFrameworkRoot();
    const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "kiss-ai-rs-batch-memory-"));
    const { project, service } = createHarness({ frameworkRoot, projectPath, runCursorAgent: null });
    const proposals = await proposeAllRequirementsSync(service, project);
    const reviewed = proposals.map((proposal) =>
      proposal.step === "goal"
        ? { ...proposal, conceptualDiffs: proposal.conceptualDiffs.map((diff) => ({ ...diff, status: "rejected" })) }
        : proposal.step === "inputs"
          ? { ...proposal, conceptualDiffs: [] }
          : proposal,
    );

    const response = await service.applyRequirementsSyncBatch(project, { modelId: "model-a", proposals: reviewed });
    const memory = normalizeConceptualDiffMemoryFile(JSON.parse(await fs.readFile(path.join(projectPath, ".conceptual-diff-memory.json"), "utf8")));

    expect(response.results).toEqual([
      expect.objectContaining({ step: "goal", status: "skipped" }),
      expect.objectContaining({ step: "inputs", status: "skipped" }),
      expect.objectContaining({ step: "outputs", status: "applied" }),
    ]);
    expect(memory.records).toEqual([expect.objectContaining({ flow: "requirements_sync", step: "goal", filePath: "human_goal_requirements.md" })]);
  });

  it("returns per-file failures when one batch apply fails", async () => {
    const frameworkRoot = await createFrameworkRoot();
    const { project, service } = createHarness({
      frameworkRoot,
      runCursorAgent: async ({ onEvent, prompt }) => {
        const step = prompt.includes('"step": "inputs"') ? "inputs" : prompt.includes('"step": "outputs"') ? "outputs" : "goal";
        if (prompt.includes("approved_conceptual_diffs") && step === "inputs") throw new Error("Inputs apply failed.");
        const targetFilePath =
          step === "inputs" ? "human_input_requirements.md" : step === "outputs" ? "human_output_requirements.md" : "human_goal_requirements.md";
        if (prompt.includes("approved_conceptual_diffs")) {
          await onEvent({
            type: "assistant_delta",
            text: `<requirements_sync_apply_json>${JSON.stringify({ failedConceptualDiffIds: [], notice: `Applied ${step}.` })}</requirements_sync_apply_json>`,
          });
          return;
        }
        await onEvent({
          type: "assistant_delta",
          text: `<requirements_sync_proposal_json>${JSON.stringify({
            summary: `Updated ${step}.`,
            conceptualDiffs: [{ id: `${step}_diff`, filePath: targetFilePath, title: "Clarify", summary: "Clarify requirements.", status: "accepted" }],
            sourceSignalsUsed: [],
          })}</requirements_sync_proposal_json>`,
        });
      },
    });
    const proposals = await proposeAllRequirementsSync(service, project);

    const response = await service.applyRequirementsSyncBatch(project, { modelId: "model-a", proposals });

    expect(response.results).toEqual([
      expect.objectContaining({ step: "goal", status: "applied" }),
      expect.objectContaining({ step: "inputs", status: "failed", summary: "Inputs apply failed." }),
      expect.objectContaining({ step: "outputs", status: "applied" }),
    ]);
  });

  it("includes relevant rejection memory in requirements sync proposal prompts", async () => {
    const frameworkRoot = await createFrameworkRoot();
    const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "kiss-ai-rs-memory-"));
    await fs.writeFile(path.join(projectPath, ".conceptual-diff-memory.json"), `${JSON.stringify(updateConceptualDiffRejectionMemory(emptyConceptualDiffMemory(), {
      conceptualDiffs: [
        {
          id: "diff_rejected",
          filePath: "human_goal_requirements.md",
          title: "Rejected geography",
          summary: "Do not add a geography constraint.",
          status: "rejected",
          intent: { objective: "Add a geography constraint." },
        },
      ],
      flow: "requirements_sync",
      step: "goal",
    }), null, 2)}\n`, "utf8");
    let capturedPrompt = "";
    const { project, service } = createHarness({
      frameworkRoot,
      projectPath,
      runCursorAgent: async ({ onEvent, prompt }) => {
        capturedPrompt = prompt;
        await onEvent({
          type: "assistant_delta",
          text: `<requirements_sync_proposal_json>${JSON.stringify({
            summary: "No changes.",
            conceptualDiffs: [],
            sourceSignalsUsed: [],
          })}</requirements_sync_proposal_json>`,
        });
      },
    });

    await service.proposeRequirementsSync(project, { step: "goal", modelId: "model-a" });

    expect(capturedPrompt).toContain("conceptual_diff_rejection_memory");
    expect(capturedPrompt).toContain("Rejected geography");
    expect(capturedPrompt).toContain("soft suppressions");
  });

  it("persists Requirements Sync rejected conceptual diffs to shared memory", async () => {
    const frameworkRoot = await createFrameworkRoot();
    const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "kiss-ai-rs-memory-"));
    const { project, service } = createHarness({ frameworkRoot, projectPath, runCursorAgent: null });

    await service.recordRequirementsSyncReview(project, {
      proposal: {
        step: "goal",
        targetFilePath: "human_goal_requirements.md",
        originalContentHash: "hash-before",
        summary: "Review goal.",
        conceptualDiffs: [
          {
            id: "goal_diff",
            filePath: "human_goal_requirements.md",
            title: "Rejected goal",
            summary: "Rejected goal change.",
            status: "rejected",
            intent: { objective: "Rejected goal objective." },
          },
        ],
        sourceSignalsUsed: ["Git status signal"],
      },
    });

    const memory = normalizeConceptualDiffMemoryFile(JSON.parse(await fs.readFile(path.join(projectPath, ".conceptual-diff-memory.json"), "utf8")));
    expect(memory.records).toEqual([
      expect.objectContaining({
        flow: "requirements_sync",
        step: "goal",
        filePath: "human_goal_requirements.md",
        title: "Rejected goal",
        sourceContentHash: "hash-before",
      }),
    ]);
  });

  it("filters apply failed ids to accepted conceptual diffs", () => {
    expect(
      extractRequirementsSyncApplyResult(
        `<requirements_sync_apply_json>${JSON.stringify({ failedConceptualDiffIds: ["goal_diff", "unknown"], notice: "Partial." })}</requirements_sync_apply_json>`,
        ["goal_diff"],
      ),
    ).toEqual({
      failedConceptualDiffIds: ["goal_diff"],
      notice: "Partial.",
      valid: true,
    });
  });
});
