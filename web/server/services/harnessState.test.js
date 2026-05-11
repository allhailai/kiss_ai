import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHarnessStateService } from "./harnessState.js";
import { httpError } from "./httpErrors.js";

describe("harnessState", () => {
  it("returns an empty harness when the harness file is missing", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kiss-ai-harness-"));
    const service = createHarnessStateService({ httpError });

    await expect(service.readProjectHarness(projectRoot)).resolves.toEqual({});
  });

  it("surfaces corrupt harness JSON", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kiss-ai-harness-"));
    const service = createHarnessStateService({ httpError });
    await fs.writeFile(path.join(projectRoot, ".harness-state.json"), "{broken", "utf8");

    await expect(service.readProjectHarness(projectRoot)).rejects.toMatchObject({
      code: "corrupt_harness_state",
      statusCode: 500,
    });
  });
});
