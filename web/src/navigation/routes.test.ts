import { describe, expect, it } from "vitest";
import { buildRouteHash, parseRouteHash } from "./routes";

describe("route hash contract", () => {
  it("builds persisted project route hashes accepted by the server schema", () => {
    const examples = [
      {
        hash: "#/p/demo_project/dashboard",
        input: ["demo_project", "dashboard"] as const,
      },
      {
        hash: "#/p/demo-project/outputs/outputs_ai%2Fwiki%2FMarket%20notes.md",
        input: ["demo-project", "outputs", "outputs_ai/wiki/Market notes.md"] as const,
      },
      {
        context: { panel: "build-project" },
        hash: "#/p/demo_project/requirements/human_goal_requirements.md?panel=build-project",
        input: ["demo_project", "requirements", "human_goal_requirements.md"] as const,
      },
    ];

    for (const example of examples) {
      const [projectSlug, view, filePath] = example.input;
      const hash = buildRouteHash(projectSlug, view, filePath, example.context);
      expect(hash).toBe(example.hash);
      expect(parseRouteHash(hash)).toMatchObject({ filePath: filePath ?? null, projectSlug, view });
    }
  });
});
